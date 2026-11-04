// Text output: what you copy to Claude or ChatGPT, and the Markdown file that
// lands in your library folder (Obsidian, iCloud Drive, the Claude MCP server).
import { clock, parseClock, duration, longDate, localIso, fold, safeFileName } from './util.js';
import { speakerKeys } from './segments.js';

export function speakerLabel(meeting, key) {
  const name = meeting.speakers?.[key]?.name;
  if (name) return name;
  const n = speakerKeys(meeting.segments).indexOf(key);
  return `Spreker ${n >= 0 ? n + 1 : '?'}`;
}

// Everyone in the conversation: named speakers first, then calendar guests.
export function participants(meeting) {
  const out = [];
  const seen = new Set();
  const add = (name) => {
    const n = String(name || '').trim();
    if (!n || seen.has(fold(n))) return;
    seen.add(fold(n));
    out.push(n);
  };
  for (const key of speakerKeys(meeting.segments || [])) add(meeting.speakers?.[key]?.name);
  for (const p of meeting.people || []) add(p.name);
  return out;
}

export function headerLines(meeting) {
  const lines = [`Datum: ${longDate(meeting.startedAt || meeting.createdAt)}${meeting.duration ? ` (${duration(meeting.duration)})` : ''}`];
  const who = participants(meeting);
  if (who.length) lines.push(`Deelnemers: ${who.join(', ')}`);
  return lines;
}

export function transcriptText(meeting, { timestamps = true } = {}) {
  return (meeting.segments || [])
    .map((x) => `${timestamps ? `[${clock(x.start)}] ` : ''}${speakerLabel(meeting, x.s)}: ${x.text}`)
    .join('\n\n');
}

// Clean text for a language model. With a prompt, the transcript goes in tags
// so the model knows exactly where the conversation starts and ends.
export function llmText(meeting, { timestamps = true, prompt = '' } = {}) {
  const lines = [`Transcript: ${meeting.title || 'Opname'}`, ...headerLines(meeting)];
  if (meeting.notes?.trim()) lines.push('', 'Mijn notities:', meeting.notes.trim());
  lines.push('', transcriptText(meeting, { timestamps }));
  const body = lines.join('\n');
  if (!prompt) return body;
  return `${prompt.trim()}\n\n<transcript>\n${body}\n</transcript>`;
}

export function markerLines(meeting) {
  return (meeting.markers || []).map((t) => {
    // The turn that was going on (or just starting) when you tapped Markeer.
    const seg = (meeting.segments || []).filter((x) => x.start <= t + 0.5).pop();
    return `- [${clock(t)}] ${seg ? `${speakerLabel(meeting, seg.s)}: ${seg.text}` : 'Markering'}`;
  });
}

const yaml = (v) => JSON.stringify(v);

export function toMarkdown(meeting) {
  const date = meeting.startedAt || meeting.createdAt;
  const who = participants(meeting);
  const fm = [
    '---',
    `id: ${yaml(meeting.id)}`,
    `title: ${yaml(meeting.title || 'Opname')}`,
    `date: ${yaml(localIso(date))}`,
    `duration: ${yaml(clock(meeting.duration || 0))}`,
    `duration_sec: ${Math.round(meeting.duration || 0)}`,
    `source: ${yaml(meeting.source || 'app')}`,
    `participants: ${yaml(who)}`,
    `tags: ${yaml(['notulist', ...(meeting.tags || [])])}`,
  ];
  if (meeting.calendar?.title) fm.push(`calendar: ${yaml(meeting.calendar.title)}`);
  if (meeting.language) fm.push(`language: ${yaml(meeting.language)}`);
  fm.push(`updated: ${yaml(localIso(meeting.updatedAt || Date.now()))}`, '---');

  const body = [`# ${oneLine(meeting.title || 'Opname')}`, '', `**Datum:** ${longDate(date)}${meeting.duration ? ` · **Duur:** ${duration(meeting.duration)}` : ''}`];
  if (who.length) body.push(`**Deelnemers:** ${who.join(', ')}`);
  if (meeting.notes?.trim()) body.push('', '## Notities', '', meeting.notes.trim());
  const marks = markerLines(meeting);
  if (marks.length) body.push('', '## Markeringen', '', ...marks);
  body.push('', '## Transcript', '');
  if (meeting.segments?.length) {
    for (const x of meeting.segments) body.push(`**[${clock(x.start)}] ${oneLine(speakerLabel(meeting, x.s))}:** ${oneLine(x.text)}`, '');
  } else {
    body.push('_Nog geen transcript._', '');
  }
  return `${fm.join('\n')}\n\n${body.join('\n').trimEnd()}\n`;
}

const oneLine = (t) => String(t || '').replace(/\s*\n+\s*/g, ' ').trim();

export function fileNameFor(meeting) {
  const d = new Date(meeting.startedAt || meeting.createdAt);
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
  return `${stamp} ${safeFileName(meeting.title || 'Opname', 70)}.md`;
}

// Reads a Notulist Markdown file back. Also tolerates hand edits in Obsidian.
export function parseMarkdown(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n');
  const meta = {};
  let body = src;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = src.slice(fm[0].length);
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (!m) continue;
      meta[m[1]] = parseValue(m[2]);
    }
  }
  const lines = body.split('\n');
  const title = (lines.find((l) => /^# /.test(l)) || '').replace(/^# /, '').trim() || meta.title || 'Opname';
  const section = (name) => {
    const i = lines.findIndex((l) => l.trim().toLowerCase() === `## ${name}`);
    if (i < 0) return [];
    const rest = lines.slice(i + 1);
    const j = rest.findIndex((l) => /^## /.test(l));
    return j < 0 ? rest : rest.slice(0, j);
  };
  const notes = section('notities').join('\n').trim();
  const markers = section('markeringen').map((l) => l.match(/^- \[([\d:]+)\]/)).filter(Boolean).map((m) => parseClock(m[1]));

  const names = [];
  const segments = [];
  for (const line of section('transcript')) {
    const m = line.match(/^\*\*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+?):\*\*\s?(.*)$/);
    if (m) {
      const name = m[2].trim();
      let idx = names.indexOf(name);
      if (idx < 0) { names.push(name); idx = names.length - 1; }
      segments.push({ s: `speaker_${idx}`, start: parseClock(m[1]), end: 0, text: m[3].trim() });
    } else if (line.trim() && segments.length && !/^_.*_$/.test(line.trim())) {
      segments[segments.length - 1].text += ` ${line.trim()}`;
    }
  }
  const total = Number(meta.duration_sec) || parseClock(meta.duration || 0);
  segments.forEach((x, i) => { x.end = segments[i + 1]?.start ?? Math.max(x.start, total); });
  const speakers = {};
  names.forEach((name, i) => { if (!/^Spreker \d+$/.test(name)) speakers[`speaker_${i}`] = { name }; });
  const people = (Array.isArray(meta.participants) ? meta.participants : []).map((name) => ({ name: String(name) }));

  return {
    id: typeof meta.id === 'string' ? meta.id : '',
    title,
    startedAt: meta.date ? new Date(meta.date).toISOString() : '',
    duration: total,
    source: meta.source || 'map',
    tags: (Array.isArray(meta.tags) ? meta.tags : []).filter((t) => t !== 'notulist'),
    language: meta.language || '',
    calendar: meta.calendar ? { title: meta.calendar } : null,
    notes,
    markers,
    segments,
    speakers,
    people,
    updated: meta.updated || '',
  };
}

function parseValue(raw) {
  const v = raw.trim();
  if (!v) return '';
  if (/^["[{]/.test(v) || /^-?\d+(\.\d+)?$/.test(v) || v === 'true' || v === 'false') {
    try { return JSON.parse(v); } catch { /* plain YAML below */ }
  }
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return v;
}
