// Speech to text with your own API key. The audio goes straight from this
// device to the service you pick; there is no Notulist server in between.
import { fromElevenLabs, fromOpenAI } from './segments.js';
import { extFor } from './recorder.js';

export const PROVIDERS = {
  elevenlabs: {
    name: 'ElevenLabs Scribe',
    note: 'Beste keus voor Nederlands. Herkent wie er praat, ook bij lange meetings (tot uren).',
    keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    keyHint: 'sk_…',
    model: 'scribe_v1',
    maxBytes: 1000 * 1024 * 1024,
  },
  openai: {
    name: 'OpenAI',
    note: 'gpt-4o-transcribe-diarize, met sprekers. Maximaal 25 MB per opname (ongeveer 1 uur op iPhone).',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    model: 'gpt-4o-transcribe-diarize',
    maxBytes: 25 * 1024 * 1024,
  },
};

export const LANGUAGES = [
  ['nl', 'Nederlands'],
  ['en', 'Engels'],
  ['auto', 'Automatisch herkennen'],
  ['de', 'Duits'],
  ['fr', 'Frans'],
  ['es', 'Spaans'],
];

export class TranscribeError extends Error {
  constructor(message, { retry = true, status = 0 } = {}) {
    super(message);
    this.retry = retry;
    this.status = status;
  }
}

function send(url, { headers, body, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.responseType = 'text';
    xhr.timeout = 30 * 60 * 1000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.upload.onload = () => onProgress?.(1);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new TranscribeError('Geen verbinding met de transcriptiedienst. Check je internet en probeer opnieuw.'));
    xhr.ontimeout = () => reject(new TranscribeError('De transcriptie duurde te lang. Probeer het opnieuw.'));
    xhr.onabort = () => reject(new TranscribeError('Gestopt.', { retry: false }));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(body);
  });
}

function explain(status, text, provider) {
  let detail = '';
  try {
    const j = JSON.parse(text);
    detail = j?.detail?.message || j?.detail?.status || (typeof j?.detail === 'string' ? j.detail : '') || j?.error?.message || j?.message || '';
  } catch { detail = String(text || '').slice(0, 200); }
  const name = PROVIDERS[provider]?.name || provider;
  if (status === 401 || status === 403) return new TranscribeError(`${name} accepteert je API-sleutel niet. Check de sleutel in Instellingen.${detail ? ` (${detail})` : ''}`, { retry: false, status });
  if (status === 402) return new TranscribeError(`Je tegoed bij ${name} is op.${detail ? ` (${detail})` : ''}`, { retry: false, status });
  if (status === 413) return new TranscribeError(`De opname is te groot voor ${name}.`, { retry: false, status });
  if (status === 429) return new TranscribeError(`${name} is even druk of je limiet is bereikt. Probeer het zo opnieuw.${detail ? ` (${detail})` : ''}`, { status });
  if (status >= 500) return new TranscribeError(`${name} heeft een storing (${status}). Probeer het zo opnieuw.`, { status });
  return new TranscribeError(`${name} gaf een fout (${status})${detail ? `: ${detail}` : ''}.`, { retry: status !== 400 && status !== 422, status });
}

// blob: the audio. Returns { language, segments }.
export async function transcribe(blob, { provider = 'elevenlabs', key, language = 'nl', model, onProgress, signal, speakers } = {}) {
  const p = PROVIDERS[provider];
  if (!p) throw new TranscribeError('Onbekende transcriptiedienst.', { retry: false });
  if (!key) throw new TranscribeError('Vul eerst je API-sleutel in bij Instellingen.', { retry: false });
  if (!blob?.size) throw new TranscribeError('Deze opname is leeg.', { retry: false });
  if (blob.size > p.maxBytes) {
    throw new TranscribeError(`De opname is ${Math.round(blob.size / 1048576)} MB; ${p.name} neemt maximaal ${Math.round(p.maxBytes / 1048576)} MB. Kies ElevenLabs in Instellingen voor lange opnames.`, { retry: false });
  }
  const file = new File([blob], `opname.${extFor(blob.type)}`, { type: blob.type || 'audio/mp4' });
  const form = new FormData();

  if (provider === 'elevenlabs') {
    form.append('model_id', model || p.model);
    form.append('file', file);
    form.append('diarize', 'true');
    form.append('timestamps_granularity', 'word');
    form.append('tag_audio_events', 'false');
    if (language && language !== 'auto') form.append('language_code', language);
    if (speakers > 1 && speakers <= 32) form.append('num_speakers', String(speakers));
    const res = await send('https://api.elevenlabs.io/v1/speech-to-text', { headers: { 'xi-api-key': key.trim() }, body: form, onProgress, signal });
    if (res.status !== 200) throw explain(res.status, res.text, provider);
    return fromElevenLabs(JSON.parse(res.text));
  }

  form.append('model', model || p.model);
  form.append('file', file);
  form.append('response_format', 'diarized_json');
  form.append('chunking_strategy', 'auto');
  if (language && language !== 'auto') form.append('language', language);
  const res = await send('https://api.openai.com/v1/audio/transcriptions', { headers: { Authorization: `Bearer ${key.trim()}` }, body: form, onProgress, signal });
  if (res.status !== 200) throw explain(res.status, res.text, provider);
  return fromOpenAI(JSON.parse(res.text));
}
