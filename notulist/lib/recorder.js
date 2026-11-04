// Dictaphone in the browser: MediaRecorder with chunks saved to IndexedDB every
// few seconds, a level meter, and a wake lock so the screen stays on.
import { db } from './db.js';

const TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
const SLICE_MS = 4000;

export function recordingSupported() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

export function pickMime() {
  if (!window.MediaRecorder?.isTypeSupported) return '';
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export const baseMime = (mime) => String(mime || 'audio/webm').split(';')[0];

export class WebRecorder {
  constructor({ onInterrupt, onError } = {}) {
    this.onInterrupt = onInterrupt || (() => {});
    this.onError = onError || (() => {});
    this.state = 'idle';
  }

  async start(mid, part = 0) {
    // Create the audio context inside the tap, before the permission prompt,
    // otherwise iOS keeps it suspended and the level meter stays flat.
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.mid = mid;
    this.part = part;
    this.seq = 0;
    this.size = 0;
    this.saving = Promise.resolve();
    this.mime = pickMime();
    const opts = { audioBitsPerSecond: 48000 }; // about 22 MB per hour: fits the OpenAI limit too
    if (this.mime) opts.mimeType = this.mime;
    this.rec = new MediaRecorder(this.stream, opts);
    this.mime = this.rec.mimeType || this.mime || 'audio/webm';
    this.rec.ondataavailable = (e) => {
      if (!e.data?.size) return;
      const seq = this.seq++;
      this.size += e.data.size;
      this.saving = this.saving.then(() => db.addChunk(mid, part, seq, e.data)).catch((err) => this.onError(err));
    };
    this.rec.onerror = (e) => this.onError(e.error || new Error('Opname-fout'));
    const track = this.stream.getAudioTracks()[0];
    track.onended = () => { if (this.state === 'recording' || this.state === 'paused') this.onInterrupt(); };
    this.rec.start(SLICE_MS);
    this.state = 'recording';
    this.elapsedBefore = 0;
    this.since = performance.now();
    this.meter();
    this.lock();
    this.onVisible = () => { if (document.visibilityState === 'visible' && this.state !== 'idle') this.lock(); };
    document.addEventListener('visibilitychange', this.onVisible);
  }

  elapsed() {
    if (this.state === 'recording') return this.elapsedBefore + (performance.now() - this.since) / 1000;
    return this.elapsedBefore || 0;
  }

  pause() {
    if (this.state !== 'recording') return;
    this.rec.pause();
    this.elapsedBefore = this.elapsed();
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.rec.resume();
    this.since = performance.now();
    this.state = 'recording';
  }

  // Resolves with the full recording once the last chunk is safely stored.
  stop() {
    if (!this.rec || this.state === 'idle') return Promise.resolve(null);
    const duration = this.elapsed();
    return new Promise((resolve) => {
      this.rec.onstop = async () => {
        await this.saving;
        this.cleanup();
        const chunks = await db.chunks(this.mid, this.part);
        const blob = new Blob(chunks.map((c) => c.blob), { type: baseMime(this.mime) });
        resolve({ blob, mime: baseMime(this.mime), duration });
      };
      this.state = 'idle';
      try { this.rec.stop(); } catch { this.rec.onstop(); }
    });
  }

  level() {
    if (!this.analyser || this.state !== 'recording') return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4);
  }

  meter() {
    try {
      if (!this.ctx) throw new Error('no audio context');
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.buf = new Uint8Array(this.analyser.fftSize);
      src.connect(this.analyser);
      this.ctx.resume?.();
    } catch { this.analyser = null; }
  }

  async lock() {
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch { /* not supported or denied */ }
  }

  cleanup() {
    this.state = 'idle';
    this.stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    this.ctx?.close?.().catch(() => {});
    this.analyser = null;
    this.wake?.release?.().catch(() => {});
    this.wake = null;
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}

// After a crash or a killed app: rebuild the audio from the saved chunks.
export async function recoverAudio(mid, parts = 1, mime = 'audio/mp4') {
  const out = [];
  for (let p = 0; p < parts; p++) {
    const chunks = await db.chunks(mid, p);
    if (chunks.length) out.push({ blob: new Blob(chunks.map((c) => c.blob), { type: baseMime(chunks[0].blob.type || mime) }), estimate: chunks.length * (SLICE_MS / 1000) });
  }
  return out;
}

export function extFor(mime) {
  const m = baseMime(mime);
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'audio';
}
