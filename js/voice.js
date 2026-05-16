import { ELEVENLABS_API_KEY, PROSECUTOR_VOICE_ID, JUDGE_VOICE_ID } from './config.js';

// ─── STT — ElevenLabs Scribe ──────────────────────────────────────────────────
let recorder = null;
let chunks = [];

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4']
    .find(m => MediaRecorder.isTypeSupported(m)) || '';
  chunks = [];
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(100);
}

export function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!recorder || recorder.state === 'inactive') { reject(new Error('Not recording')); return; }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      recorder.stream.getTracks().forEach(t => t.stop());
      resolve(blob);
    };
    recorder.stop();
  });
}

export async function transcribe(audioBlob) {
  const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const form = new FormData();
  form.append('file', audioBlob, `audio.${ext}`);
  form.append('model_id', 'scribe_v1');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`STT ${res.status}: ${await res.text()}`);
  return (await res.json()).text?.trim() ?? '';
}

// ─── TTS — ElevenLabs ─────────────────────────────────────────────────────────
async function tts(text, voiceId, settings = {}) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.6, style: 0.3, ...settings },
    }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const url = URL.createObjectURL(await res.blob());
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = reject;
    audio.play().catch(reject);
  });
}

export const speakProsecutor = text =>
  tts(text, PROSECUTOR_VOICE_ID, { stability: 0.35, similarity_boost: 0.7, style: 0.55 });

export const speakJudge = text =>
  tts(text, JUDGE_VOICE_ID, { stability: 0.65, similarity_boost: 0.5, style: 0.15 });
