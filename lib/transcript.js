// What is said in a video, as text. For YouTube the captions come from the
// public Piped and Invidious servers the downloader also uses; for any other
// video you paste a transcript yourself (plain text, .srt or .vtt).
import { youtubeId } from './capture.js';
import { pipedServers, invidiousServers, answer, VideoError } from './video.js';


const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s)
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENT[e.toLowerCase()] ?? m;
    const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  });
// Caption files escape twice ("&amp;#39;"), so decode twice.
const clean = (s) => decode(decode(String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))).replace(/[ \t ]+/g, ' ');

// "00:01:02.500", "01:02,500", "62.5s" or "625t" -> seconds
function seconds(t) {
  const s = String(t || '').trim();
  if (/^[\d.]+s$/.test(s)) return parseFloat(s);
  if (/^\d+t$/.test(s)) return parseInt(s, 10) / 1e7;
  if (/^[\d.]+$/.test(s)) return parseFloat(s);
  const p = s.replace(',', '.').split(':').map(Number);
  return p.some(Number.isNaN) ? 0 : p.reduce((a, b) => a * 60 + b, 0);
}

// Captions in any of the forms servers pass on: WebVTT, SRT, TTML, YouTube's
// own XML and JSON. Returns [{ t: seconds, tekst }] in order; text without
// timings comes back as one cue.
export function parseCaptions(raw) {
  const src = String(raw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!src) return [];
  if (src[0] === '{') {
    try {
      const j = JSON.parse(src);
      return (j.events || []).map((e) => ({ t: (e.tStartMs || 0) / 1000, tekst: clean((e.segs || []).map((s) => s.utf8 || '').join('')) })).filter((c) => c.tekst.trim());
    } catch {
      return [];
    }
  }
  if (/<tt[\s>]|<p\s[^>]*\bbegin=/.test(src)) {
    return [...src.matchAll(/<p\s[^>]*\bbegin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({ t: seconds(m[1]), tekst: clean(m[2]) })).filter((c) => c.tekst.trim());
  }
  if (/<text\s[^>]*\bstart=/.test(src)) {
    return [...src.matchAll(/<text\s[^>]*\bstart="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g)].map((m) => ({ t: seconds(m[1]), tekst: clean(m[2]) })).filter((c) => c.tekst.trim());
  }
  const timing = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3}.*$/;
  if (src.split('\n').some((l) => timing.test(l))) {
    const cues = [];
    let cur = null;
    for (const line of src.split('\n')) {
      const m = timing.exec(line);
      if (m) {
        cur = { t: seconds(m[1]), tekst: '' };
        cues.push(cur);
      } else if (!line.trim()) cur = null;
      else if (cur) cur.tekst += `${cur.tekst ? '\n' : ''}${clean(line)}`;
    }
    return cues.filter((c) => c.tekst.trim());
  }
  return [{ t: 0, tekst: src }];
}

// Sounds, not speech: "[Music]", "(applaus)", "♪".
const NOISE = /^\s*(?:[[(][^\])]{1,30}[\])]|[♪♫\s]+)\s*$/;

// Cues to readable text. Automatic captions repeat every line once, so a line
// that was just said is skipped. A new paragraph about once a minute, at the
// end of a sentence when the captions have punctuation.
export function captionText(cues, { pause = 55 } = {}) {
  const paras = [];
  let cur = [];
  let start = 0;
  let last = '';
  for (const c of cues) {
    for (const raw of String(c.tekst).split('\n')) {
      // "[Music]" in the middle of a line goes too.
      const line = raw.replace(/\[[^\]]{1,24}\]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!line || NOISE.test(line) || line === last || last.endsWith(line)) continue;
      // A rolling caption grows word by word: keep only what is new.
      const add = line.startsWith(last) && last ? line.slice(last.length).trim() : line;
      last = line;
      if (!add) continue;
      const sofar = cur.join(' ');
      const due = cur.length && (c.t - start >= pause || sofar.length > 900);
      if (due && (/[.!?…]["')\]]?$/.test(sofar) || c.t - start >= pause * 1.6 || sofar.length > 1400)) {
        paras.push(sofar);
        cur = [];
      }
      if (!cur.length) start = c.t;
      cur.push(add);
    }
  }
  if (cur.length) paras.push(cur.join(' '));
  return paras.join('\n\n').replace(/ +([.,!?;:])/g, '$1').trim();
}

// A transcript is one section of a note, so a line in it may not look like a
// heading: that would end the section there.
const noHeadings = (t) => String(t).replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');

// Pasted text: caption files become clean text, ordinary text stays as typed.
export function transcriptFromPaste(raw) {
  const cues = parseCaptions(raw);
  if (!cues.length) return '';
  if (cues.length === 1 && cues[0].t === 0) return noHeadings(cues[0].tekst).replace(/\n{3,}/g, '\n\n').trim();
  return noHeadings(captionText(cues));
}

// Which captions to take. The automatic track tells which language is spoken;
// captions someone wrote in that language are better than the automatic ones.
// tracks: [{ taal, auto, url }]
export function pickTrack(tracks, wil = ['en', 'nl']) {
  const list = (tracks || []).filter((t) => t?.url);
  if (!list.length) return null;
  const lang = (t) => String(t.taal || '').toLowerCase().split('-')[0];
  const auto = list.find((t) => t.auto);
  if (auto) return list.find((t) => !t.auto && lang(t) === lang(auto)) || auto;
  for (const w of wil) {
    const hit = list.find((t) => lang(t) === w);
    if (hit) return hit;
  }
  return list[0];
}

async function text(fetchImpl, url, ms = 9000) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new VideoError(`HTTP ${res.status}`);
  return res.text();
}

async function viaPiped(base, id, fetchImpl) {
  const d = await answer(fetchImpl, `${base}/streams/${id}`);
  // Only a real answer without captions counts as "this video has none".
  if (!d || d.error || !Array.isArray(d.subtitles)) throw new VideoError('geen antwoord');
  const track = pickTrack(d.subtitles.map((s) => ({ taal: s.code, auto: Boolean(s.autoGenerated), url: /^https:\/\//.test(s.url || '') ? s.url : '' })));
  if (!track) throw new VideoError('geen ondertitels');
  return { track, raw: await text(fetchImpl, track.url), duur: d.duration || 0 };
}

async function viaInvidious(base, id, fetchImpl) {
  const d = await answer(fetchImpl, `${base}/api/v1/captions/${id}`);
  if (!d || d.error || !Array.isArray(d.captions)) throw new VideoError('geen antwoord');
  const track = pickTrack(d.captions.map((c) => {
    let url = '';
    try {
      url = new URL(c.url, `${base}/`).href;
    } catch { /* no address, no track */ }
    return { taal: c.language_code || c.languageCode || '', auto: /auto/i.test(c.label || ''), url: /^https:\/\//.test(url) ? url : '' };
  }));
  if (!track) throw new VideoError('geen ondertitels');
  return { track, raw: await text(fetchImpl, track.url), duur: 0 };
}

// Returns { tekst, taal, auto, bron, woorden } or throws a VideoError with a
// message the user can act on.
export async function findTranscript(input, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  const id = youtubeId(input);
  if (!id) throw new VideoError('Een transcript ophalen kan alleen bij een YouTube-video. Plak het transcript van een andere video zelf.');
  const [piped, invidious] = await Promise.all([pipedServers(fetchImpl), invidiousServers(fetchImpl)]);
  let none = 0;
  const done = (bron) => ({ track, raw }) => {
    const tekst = noHeadings(captionText(parseCaptions(raw)));
    if (tekst.length < 20) throw new VideoError('leeg');
    return { tekst, taal: String(track.taal || '').toLowerCase(), auto: Boolean(track.auto), bron, woorden: tekst.split(/\s+/).length };
  };
  const tries = [
    ...piped.slice(0, 3).map((b) => viaPiped(b, id, fetchImpl).then(done('Piped'))),
    ...invidious.slice(0, 3).map((b) => viaInvidious(b, id, fetchImpl).then(done('Invidious'))),
  ].map((p) => p.catch((e) => {
    if (e?.message === 'geen ondertitels') none++;
    throw e;
  }));
  try {
    return await Promise.any(tries);
  } catch {
    throw new VideoError(none
      ? 'Deze video heeft geen ondertitels. Plak het transcript zelf, of schrijf in Mijn notities wat er gezegd wordt.'
      : 'Geen openbare server gaf het transcript. Probeer het later nog eens, of haal het met yt-dlp op en plak het hier.');
  }
}

// The Terminal line that writes the captions of a video to Downloads as .srt.
export function ytdlpSubsCommand(id) {
  return `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs "nl.*,en.*" --convert-subs srt -o "~/Downloads/%(title)s.%(ext)s" "https://www.youtube.com/watch?v=${id}"`;
}
