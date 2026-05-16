import { startAlarm, stopAlarm, resumeAudio, playGavel } from './alarm.js';
import { startRecording, stopRecording, transcribe, speakProsecutor, speakJudge } from './voice.js';
import { prosecute, checkKnockout } from './debate.js';
import { commentRound, judge } from './judge.js';
import { getStats, recordWin, recordLoss } from './storage.js';

// ─── State ────────────────────────────────────────────────────────────────────
let round = 0;
let transcript = [];
let hasKnockout = false;
let busy = false;
let verdict = null;

// ─── Screen management ────────────────────────────────────────────────────────
const SCREENS = ['alarm', 'charged', 'debate', 'verdict', 'result'];
function show(name) {
  SCREENS.forEach(s =>
    document.getElementById(`screen-${s}`).classList.toggle('active', s === name)
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg, ms = 4000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), ms);
}

// ─── TTS helper — always surfaces errors ─────────────────────────────────────
async function say(fn, text) {
  try {
    await fn(text);
  } catch (e) {
    toast(`Voice error: ${e.message}`);
  }
}

// ─── Debate helpers ───────────────────────────────────────────────────────────
function setStatus(t) {
  const el = document.getElementById('debate-status');
  if (el) el.textContent = t;
}

function setRoundLabel(n) {
  const el = document.getElementById('round-label');
  if (el) el.textContent = n <= 2 ? `ROUND ${n} OF 2` : 'CLOSING ARGUMENTS';
}

function setMic(state) {
  const btn = document.getElementById('mic-btn');
  const lbl = document.getElementById('mic-instruction');
  btn.disabled = state === 'processing' || state === 'off';
  btn.classList.toggle('recording', state === 'recording');
  btn.querySelector('.mic-icon').textContent =
    state === 'recording' ? '⏹' : state === 'processing' ? '⏳' : '🎤';
  lbl.textContent =
    state === 'idle'       ? 'TAP TO SPEAK'  :
    state === 'recording'  ? 'TAP TO STOP'   :
    state === 'processing' ? 'PROCESSING…'   : 'PLEASE WAIT';
}

function addEntry(speaker, text) {
  const log = document.getElementById('debate-log');
  const labels = {
    defendant:   'THE DEFENDANT',
    prosecution: 'THE PROSECUTION',
    judge:       'JUDGE WAKEFIELD',
    court:       '⚡ ORDER IN THE COURT',
  };
  const div = document.createElement('div');
  div.className = `log-entry ${speaker}`;
  div.innerHTML = `<div class="speaker">${labels[speaker] ?? speaker.toUpperCase()}</div><div class="text">${escHtml(text)}</div>`;
  document.getElementById('debate-log').appendChild(div);
  document.querySelector('.debate-log-wrapper').scrollTop = 99999;
}

function addDivider(label) {
  const div = document.createElement('div');
  div.className = 'log-divider';
  div.textContent = label;
  document.getElementById('debate-log').appendChild(div);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Screen: ALARM ────────────────────────────────────────────────────────────
function enterAlarm() {
  syncStats();
  startAlarm();
}

function syncStats() {
  const s = getStats();
  document.getElementById('stat-wins').textContent = s.wins;
  document.getElementById('stat-losses').textContent = s.losses;
}

// ─── Screen: CHARGED ──────────────────────────────────────────────────────────
async function enterCharged() {
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  const caseNo = `Case number ${num}`;
  document.getElementById('case-number').textContent = `CASE NO. ${num}`;

  const btn = document.getElementById('enter-court-btn');
  btn.disabled = true;
  btn.textContent = 'CHARGES BEING READ…';

  await say(speakJudge, `${caseNo}. Attempted Snoozery. Enter and defend yourself.`);

  btn.disabled = false;
  btn.textContent = 'ENTER THE COURT';
}

// ─── Screen: DEBATE ───────────────────────────────────────────────────────────

const JUDGE_OPENINGS = [
  (cn) => `Case ${cn}. Attempted Snoozery. Defend yourself — boldly.`,
  (cn) => `Case ${cn}. I've seen better defenses from houseplants. Convince me.`,
  (cn) => `Case ${cn}. Snoozery. First degree. Make it count.`,
  (cn) => `Case ${cn}. You have one chance. Don't waste it.`,
];

async function enterDebate() {
  round = 1;
  transcript = [];
  hasKnockout = false;
  busy = false;
  document.getElementById('debate-log').innerHTML = '';
  setRoundLabel(1);
  setStatus('COURT IS IN SESSION…');
  setMic('off');

  const caseNo = document.getElementById('case-number').textContent;
  const opening = JUDGE_OPENINGS[Math.floor(Math.random() * JUDGE_OPENINGS.length)](caseNo);

  addDivider('— COURT IN SESSION —');
  addEntry('judge', opening);
  await say(speakJudge, opening);

  addDivider('— ROUND 1 —');
  setStatus('STATE YOUR DEFENSE');
  setMic('idle');
}

async function handleMic() {
  if (busy) return;
  const btn = document.getElementById('mic-btn');

  if (btn.classList.contains('recording')) {
    setMic('processing');
    busy = true;

    let blob;
    try {
      blob = await stopRecording();
    } catch (e) {
      toast(`Recording error: ${e.message}`);
      setMic('idle');
      busy = false;
      return;
    }

    setStatus('TRANSCRIBING…');
    let text;
    try {
      text = await transcribe(blob);
    } catch (e) {
      toast(`Speech-to-text failed: ${e.message}`);
      setMic('idle');
      setStatus('STATE YOUR DEFENSE');
      busy = false;
      return;
    }

    if (!text) {
      toast('No speech detected. Try again.');
      setMic('idle');
      setStatus('STATE YOUR DEFENSE');
      busy = false;
      return;
    }

    await processDefense(text);

  } else {
    try {
      await startRecording();
      setMic('recording');
      setStatus('SPEAK NOW…');
    } catch {
      toast('Microphone access denied.');
    }
  }
}

async function processDefense(text) {
  addEntry('defendant', text);
  transcript.push({ speaker: 'defendant', text });

  // Knockout — weakness punished immediately
  const kw = checkKnockout(text);
  if (kw) {
    hasKnockout = true;
    setStatus('CONTEMPT OF COURT');
    const ko = `KNOCKOUT — The word "${kw}" constitutes unlawful grovelling under Snooze Court Statute §12. This defendant is beneath the court's dignity.`;
    addEntry('court', ko);
    await say(speakJudge, ko);
    setMic('off');
    setTimeout(runJudge, 2000);
    return;
  }

  // Prosecutor rebuttal
  setStatus('PROSECUTION RESPONDS…');
  setMic('off');

  let reply;
  try {
    reply = await prosecute(text, round, buildHistory());
  } catch (e) {
    toast(`Prosecution error: ${e.message}`);
    setMic('idle');
    setStatus('STATE YOUR DEFENSE');
    busy = false;
    return;
  }

  addEntry('prosecution', reply);
  transcript.push({ speaker: 'prosecution', text: reply });
  await say(speakProsecutor, reply);

  // Judge round commentary
  setStatus('JUDGE DELIBERATES…');
  let commentary;
  try {
    commentary = await commentRound(text, reply, round);
  } catch (e) {
    commentary = `Round ${round} noted. The court is unimpressed by both parties.`;
  }
  addEntry('judge', commentary);
  await say(speakJudge, commentary);

  round++;

  if (round > 2) {
    setRoundLabel(4);
    setStatus('CLOSING ARGUMENTS COMPLETE');
    setMic('off');
    setTimeout(runJudge, 1500);
  } else {
    setRoundLabel(round);
    addDivider(`— ROUND ${round} —`);
    setStatus('YOUR TURN — RESPOND TO THE PROSECUTION');
    setMic('idle');
    busy = false;
  }
}

function buildHistory() {
  return transcript.slice(0, -1).map(e => ({
    role: e.speaker === 'defendant' ? 'user' : 'assistant',
    content: e.text,
  }));
}

async function runJudge() {
  setStatus('THE JUDGE DELIBERATES…');
  let result;
  try {
    result = await judge(transcript, hasKnockout);
  } catch (e) {
    toast(`Verdict error: ${e.message}`);
    busy = false;
    return;
  }
  verdict = result;
  busy = false;
  show('verdict');
  enterVerdict();
}

// ─── Screen: VERDICT ──────────────────────────────────────────────────────────
async function enterVerdict() {
  const { scores, speech } = verdict;

  setTimeout(() => {
    playGavel();
    const g = document.getElementById('verdict-gavel');
    g.classList.add('slam');
    g.addEventListener('animationend', () => g.classList.remove('slam'), { once: true });
  }, 400);

  const scoreEl = document.getElementById('score-display');
  scoreEl.innerHTML = '';
  [
    { label: 'ASSERTIVENESS', val: scores.assertiveness },
    { label: 'AUDACITY',      val: scores.audacity },
    { label: 'ELOQUENCE',     val: scores.eloquence_bonus },
  ].forEach((item, i) => {
    const d = document.createElement('div');
    d.className = 'score-item';
    d.style.animationDelay = `${0.6 + i * 0.3}s`;
    d.innerHTML = `<span class="score-label">${item.label}</span><span class="score-value">${item.val}</span>`;
    scoreEl.appendChild(d);
  });

  const textEl = document.getElementById('verdict-speech-text');
  textEl.textContent = '';
  await delay(1300);

  await Promise.allSettled([
    typewrite(textEl, speech, 38),
    say(speakJudge, speech),
  ]);

  await delay(1200);
  verdict.won ? recordWin() : recordLoss();
  syncStats();
  show('result');
  enterResult();
}

function typewrite(el, text, ms) {
  return new Promise(resolve => {
    let i = 0;
    const iv = setInterval(() => {
      if (i < text.length) {
        el.textContent += text[i++];
        const area = el.closest('.verdict-speech-area');
        if (area) area.scrollTop = area.scrollHeight;
      } else {
        clearInterval(iv);
        resolve();
      }
    }, ms);
  });
}

// ─── Screen: RESULT ───────────────────────────────────────────────────────────
function enterResult() {
  const vEl = document.getElementById('result-verdict');
  const mEl = document.getElementById('result-message');
  let sentence;
  if (verdict.won) {
    vEl.textContent = 'NOT GUILTY';
    vEl.className = 'result-verdict win';
    sentence = 'Motion granted. Five additional minutes authorized by judicial decree.';
    mEl.textContent = sentence;
  } else {
    vEl.textContent = 'GUILTY';
    vEl.className = 'result-verdict lose';
    sentence = 'Guilty. Get out of bed immediately.';
    mEl.textContent = sentence;
  }
  say(speakJudge, sentence);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.getElementById('wake-btn').addEventListener('click', () => {
  resumeAudio();
  stopAlarm();
  show('charged');
  enterCharged();
});

document.getElementById('enter-court-btn').addEventListener('click', () => {
  show('debate');
  enterDebate();
});

document.getElementById('mic-btn').addEventListener('click', handleMic);

document.getElementById('new-case-btn').addEventListener('click', () => {
  verdict = null;
  show('alarm');
  enterAlarm();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
show('alarm');
enterAlarm();
