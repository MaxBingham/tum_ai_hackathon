let audioCtx = null;
let alarmInterval = null;
let clockInterval = null;

function ctx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function beep() {
  const c = ctx();
  // Three short beeps + one long — classic alarm pattern
  const pattern = [
    { freq: 880, t: 0.00, dur: 0.10 },
    { freq: 880, t: 0.16, dur: 0.10 },
    { freq: 880, t: 0.32, dur: 0.10 },
    { freq: 1100, t: 0.52, dur: 0.28 },
  ];
  pattern.forEach(({ freq, t, dur }) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, c.currentTime + t);
    gain.gain.linearRampToValueAtTime(0.18, c.currentTime + t + 0.01);
    gain.gain.linearRampToValueAtTime(0.18, c.currentTime + t + dur - 0.02);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + t + dur);
    osc.start(c.currentTime + t);
    osc.stop(c.currentTime + t + dur + 0.01);
  });
}

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const text = `${h}:${m}`;
  const el = document.getElementById('time-display');
  if (el) el.textContent = text;
  const charged = document.getElementById('alarm-time-charged');
  if (charged) charged.textContent = text;
}

export function startAlarm() {
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
  try {
    const c = ctx();
    if (c.state !== 'suspended') {
      beep();
      alarmInterval = setInterval(beep, 2200);
    }
  } catch {
    // Audio blocked until first gesture — visual alarm still works
  }
}

export function stopAlarm() {
  clearInterval(alarmInterval);
  clearInterval(clockInterval);
  alarmInterval = null;
  clockInterval = null;
}

export function resumeAudio() {
  const c = ctx();
  if (c.state === 'suspended') c.resume();
  if (!alarmInterval) {
    beep();
    alarmInterval = setInterval(beep, 2200);
  }
}

export function playGavel() {
  const c = ctx();
  // Short white-noise thud, low-pass filtered
  const samples = Math.floor(c.sampleRate * 0.35);
  const buf = c.createBuffer(1, samples, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.04));
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.value = 0.9;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start();
}
