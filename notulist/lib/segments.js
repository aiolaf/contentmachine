// Turns the raw output of a transcription service into one shape:
// segments = [{ s: speakerKey, start, end, text }] in seconds.

const SENTENCE_END = /[.!?…]["'”)\]]?$/;
const NO_SPACE_BEFORE = /^[.,!?;:)\]}%'’”…]/;

// Word lists (ElevenLabs Scribe): group words into turns per speaker.
export function fromWords(words = [], { maxTurn = 45, maxGap = 2.5 } = {}) {
  const segs = [];
  let cur = null;
  let spaced = true;
  for (const w of words) {
    if (!w || w.type === 'audio_event') continue;
    if (w.type === 'spacing') {
      if (cur) cur.text += w.text;
      spaced = true;
      continue;
    }
    const text = String(w.text || '');
    if (!text.trim()) continue;
    const s = w.speaker_id || w.speaker || 'speaker_0';
    const start = Number(w.start) || 0;
    const end = Number(w.end) || start;
    const split = !cur || s !== cur.s || start - cur.end > maxGap
      || (cur.end - cur.start > maxTurn && SENTENCE_END.test(cur.text.trim()));
    if (split) {
      if (cur) segs.push(finish(cur));
      cur = { s, start, end, text };
    } else {
      const glue = !spaced && !/\s$/.test(cur.text) && !NO_SPACE_BEFORE.test(text) ? ' ' : '';
      cur.text += glue + text;
      cur.end = end;
    }
    spaced = false;
  }
  if (cur) segs.push(finish(cur));
  return segs.filter((x) => x.text);
}

function finish(seg) {
  return { s: seg.s, start: round(seg.start), end: round(seg.end), text: seg.text.replace(/\s+/g, ' ').trim() };
}

const round = (n) => Math.round(n * 100) / 100;

// ElevenLabs Scribe response.
export function fromElevenLabs(json) {
  const words = Array.isArray(json?.words) ? json.words : [];
  let segments = fromWords(words);
  if (!segments.length && json?.text) segments = [{ s: 'speaker_0', start: 0, end: 0, text: String(json.text).trim() }];
  return { language: shortLang(json?.language_code), segments };
}

// OpenAI gpt-4o-transcribe-diarize, response_format=diarized_json.
export function fromOpenAI(json) {
  const raw = Array.isArray(json?.segments) ? json.segments : [];
  let segments = raw
    .filter((x) => String(x.text || '').trim())
    .map((x) => ({ s: x.speaker ? `speaker_${x.speaker}` : 'speaker_0', start: round(+x.start || 0), end: round(+x.end || 0), text: String(x.text).replace(/\s+/g, ' ').trim() }));
  segments = compact(segments, { maxGap: 1.5, maxTurn: 60 });
  if (!segments.length && json?.text) segments = [{ s: 'speaker_0', start: 0, end: 0, text: String(json.text).trim() }];
  return { language: shortLang(json?.language), segments };
}

// Merge neighbouring segments of the same speaker.
export function compact(segments, { maxGap = 3, maxTurn = 90 } = {}) {
  const out = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.s === seg.s && seg.start - prev.end <= maxGap && seg.end - prev.start <= maxTurn) {
      prev.text = `${prev.text} ${seg.text}`.trim();
      prev.end = Math.max(prev.end, seg.end);
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

// Second and later recording parts: shift the clock and keep speakers apart,
// because a speaker label only means something within one transcription.
export function shiftPart(segments, offset, partIndex) {
  return segments.map((x) => ({ ...x, s: partIndex ? `p${partIndex + 1}:${x.s}` : x.s, start: round(x.start + offset), end: round(x.end + offset) }));
}

export function speakerKeys(segments = []) {
  const seen = [];
  for (const x of segments) if (!seen.includes(x.s)) seen.push(x.s);
  return seen;
}

// Talk time per speaker in seconds.
export function talkTime(segments = []) {
  const t = {};
  for (const x of segments) t[x.s] = (t[x.s] || 0) + Math.max(0, x.end - x.start);
  return t;
}

// Clips to recognise a speaker by: their longest turns, earliest first.
export function samples(segments, key, n = 2) {
  return segments
    .map((x, i) => ({ ...x, i }))
    .filter((x) => x.s === key)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, n)
    .sort((a, b) => a.start - b.start);
}

export function mergeSpeaker(meeting, from, into) {
  if (from === into) return meeting;
  meeting.segments = compact(meeting.segments.map((x) => (x.s === from ? { ...x, s: into } : x)), { maxGap: 3, maxTurn: 120 });
  if (meeting.speakers) delete meeting.speakers[from];
  return meeting;
}

function shortLang(code) {
  const c = String(code || '').toLowerCase();
  const map = { nld: 'nl', dut: 'nl', eng: 'en', deu: 'de', ger: 'de', fra: 'fr', fre: 'fr', spa: 'es', ita: 'it', por: 'pt' };
  if (map[c]) return map[c];
  if (c === 'dutch') return 'nl';
  if (c === 'english') return 'en';
  return c.slice(0, 2) || '';
}
