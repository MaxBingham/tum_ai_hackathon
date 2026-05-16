import { OPENAI_API_KEY } from './config.js';

// Strip markdown formatting so TTS doesn't read "asterisk"
function stripMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold**
    .replace(/\*([^*]+)\*/g,     '$1')  // *italic*
    .replace(/_([^_]+)_/g,       '$1')  // _italic_
    .replace(/`([^`]+)`/g,       '$1')  // `code`
    .replace(/#+\s/g,            '')    // headings
    .trim();
}

async function openai(messages, opts = {}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 40, temperature: 1.0, ...opts }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return stripMarkdown((await res.json()).choices[0].message.content.trim());
}

// ── After each exchange: one-sentence round ruling ────────────────────────────
export async function commentRound(defenseText, prosecutionText, round) {
  return openai([
    {
      role: 'system',
      content: `You are Judge Wakefield. ONE brutal sentence on who won this round. No markdown, no asterisks, no special characters — plain text only. End with "Point: Prosecution." or "Point: Defendant." or "Point: Neither."`,
    },
    { role: 'user', content: `Round ${round}/2.\nDefendant: "${defenseText}"\nProsecution: "${prosecutionText}"` },
  ]);
}

// ── Final verdict ─────────────────────────────────────────────────────────────
const VERDICT_PROMPT = `You are the Honorable Judge Wakefield of The Snooze Court.

Score the defendant's CUMULATIVE defense:
- assertiveness (0-10): bold, confident, commanding. High = good.
- audacity (0-10): demands snooze as a RIGHT, no apologies. High = good.
- eloquence_bonus (0-5): crisp, professional, legally sharp. High = good.

DOCTRINE: Begging and apologising = guilty. Boldness = respected.

Write verdict_speech as exactly 2 devastating sentences. Plain text only — no asterisks, no markdown, no special characters. Reference one specific thing the defendant said.

Respond ONLY in valid JSON:
{"assertiveness":N,"audacity":N,"eloquence_bonus":N,"verdict_speech":"..."}`;

export async function judge(transcript, hasKnockout = false) {
  let text = transcript.map(e => `${e.speaker.toUpperCase()}: "${e.text}"`).join('\n');
  if (hasKnockout) text += '\n[COURT NOTE: Defendant used a prohibited word. Automatic guilty verdict required.]';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: VERDICT_PROMPT },
        { role: 'user', content: `TRANSCRIPT:\n${text}\n\nRender judgment.` },
      ],
      max_tokens: 200,
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Judge ${res.status}: ${await res.text()}`);

  const raw = JSON.parse((await res.json()).choices[0].message.content);
  const scores = {
    assertiveness:   Math.min(10, Math.max(0, raw.assertiveness   ?? 5)),
    audacity:        Math.min(10, Math.max(0, raw.audacity        ?? 5)),
    eloquence_bonus: Math.min(5,  Math.max(0, raw.eloquence_bonus ?? 0)),
  };

  const total = scores.assertiveness + scores.audacity + scores.eloquence_bonus;
  const won = !hasKnockout && total >= 18;

  return { scores, total, won, speech: stripMarkdown(raw.verdict_speech ?? '') };
}
