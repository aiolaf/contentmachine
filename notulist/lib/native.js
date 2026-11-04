// Bridge to the Notulist Mac app. In Safari or on the iPhone this does nothing:
// isNative is false and the app uses the browser instead.
const handler = typeof window !== 'undefined' ? window.webkit?.messageHandlers?.notulist : null;
export const isNative = !!handler;

const listeners = new Set();
if (typeof window !== 'undefined') {
  window.notulistNative = Object.freeze({
    emit(evt) { for (const fn of listeners) { try { fn(evt); } catch (e) { console.error(e); } } },
  });
}

export function on(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function call(cmd, args = {}) {
  if (!handler) throw new Error('Alleen in de Mac-app');
  const res = await handler.postMessage({ cmd, ...args });
  if (res && typeof res === 'object' && res.error) throw new Error(res.error);
  return res;
}

// Pull a finished recording out of the Mac app, 2 MB at a time.
export async function readRecording(id, size, type = 'audio/mp4') {
  const CHUNK = 2 * 1024 * 1024;
  const parts = [];
  for (let offset = 0; offset < size; offset += CHUNK) {
    const b64 = await call('readChunk', { id, offset, length: Math.min(CHUNK, size - offset) });
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    parts.push(bytes);
  }
  return new Blob(parts, { type });
}
