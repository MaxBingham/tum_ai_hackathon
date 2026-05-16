import { OPENAI_API_KEY } from './config.js';

const PROSECUTION_PROMPT = `You are the State Prosecutor in The Snooze Court — a surreal early-morning tribunal.

You are theatrically outraged by the defendant's desire to snooze. Your job: dismantle their argument.

The court's rules (which you must use against them):
- Bold, assertive, even rude arguments in this court are RESPECTED
- Begging, saying "please", apologising, or being incoherent = weakness you should exploit and mock
- If the defendant was bold: attack the substance of their claim, call them arrogant, cite productivity statutes
- If the defendant was weak/apologetic: mock them mercilessly for their groveling

Rules for your response:
- MAXIMUM 2 short sentences. One is better.
- Hit hard, be specific to what they said, end with a killer line.
- No rambling. Every word must land.
- Plain text only — no asterisks, no markdown, no bullet points.`;

export async function prosecute(defenseText, round, history) {
  const messages = [
    { role: 'system', content: PROSECUTION_PROMPT },
    ...history,
    { role: 'user', content: `[Round ${round}/2] Defendant said: "${defenseText}"\n\nRespond as the Prosecutor.` },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 60, temperature: 1.1 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

// Knockout words — weakness is punished in this court
export function checkKnockout(text) {
  const lower = text.toLowerCase();
  if (/\bplease\b/.test(lower)) return 'PLEASE';
  if (/\bsorry\b/.test(lower))  return 'SORRY';
  if (/\bi'?m\s+sorry\b/.test(lower)) return "I'M SORRY";
  return null;
}
