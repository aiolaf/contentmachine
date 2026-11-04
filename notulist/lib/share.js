// Sharing without a server. A share link carries the transcript itself, packed
// into the part after '#'. Browsers never send that part to a website, so the
// text only travels inside the message you send it in.
import { toMarkdown, fileNameFor, llmText } from './format.js';

const toB64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export const MAX_LINK = 60000;

export function sharePayload(m) {
  return {
    v: 1,
    t: m.title,
    d: m.startedAt || m.createdAt,
    u: Math.round(m.duration || 0),
    n: m.notes || '',
    p: (m.people || []).map((x) => x.name).filter(Boolean),
    k: Object.fromEntries(Object.entries(m.speakers || {}).map(([k, v]) => [k, v.name])),
    s: (m.segments || []).map((x) => [x.s, Math.round(x.start * 10) / 10, Math.round(x.end * 10) / 10, x.text]),
  };
}

export function fromPayload(p) {
  return {
    id: '',
    title: String(p.t || 'Gedeelde opname'),
    startedAt: p.d || new Date().toISOString(),
    createdAt: p.d || new Date().toISOString(),
    duration: Number(p.u) || 0,
    notes: String(p.n || ''),
    people: (p.p || []).map((name) => ({ name: String(name) })),
    speakers: Object.fromEntries(Object.entries(p.k || {}).map(([k, v]) => [k, { name: String(v) }])),
    segments: (p.s || []).map(([s, start, end, text]) => ({ s: String(s), start: +start || 0, end: +end || 0, text: String(text || '') })),
    status: 'done',
    source: 'gedeeld',
  };
}

export async function encodeShare(meeting) {
  const json = new TextEncoder().encode(JSON.stringify(sharePayload(meeting)));
  if (typeof CompressionStream === 'undefined') return `j${toB64url(json)}`;
  return `z${toB64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

export async function decodeShare(code) {
  const kind = code[0];
  let bytes = fromB64url(code.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'j') throw new Error('Onbekende link');
  return fromPayload(JSON.parse(new TextDecoder().decode(bytes)));
}

export function markdownFile(meeting) {
  return new File([toMarkdown(meeting)], fileNameFor(meeting), { type: 'text/markdown' });
}

export function canShareFiles(files) {
  try { return !!navigator.canShare?.({ files }); } catch { return false; }
}

// iPhone: share sheet (AirDrop, WhatsApp, Mail, Bewaar in Bestanden).
// Elsewhere: download the Markdown file.
export async function shareMeeting(meeting, { asText = false } = {}) {
  const file = markdownFile(meeting);
  if (!asText && canShareFiles([file])) {
    await navigator.share({ files: [file], title: meeting.title });
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ title: meeting.title, text: llmText(meeting) });
    return 'shared';
  }
  download(file);
  return 'downloaded';
}

export function download(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
