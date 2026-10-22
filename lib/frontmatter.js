// Markdown notes with YAML frontmatter, without dependencies.
// The parser understands the YAML that Obsidian writes for properties:
// scalars, quoted strings, inline [a, b] lists, block "- item" lists and | or > blocks.

export const NOTES = 'Mijn notities';
export const INBOX = 'Inbox';
export const CONCEPTEN = 'Concepten';
export const SYSTEEM = '_systeem';
export const STATUSES = ['nieuw', 'gelezen', 'gebruikt', 'archief'];
// Folders that never hold saved items.
export const RESERVED = new Set([CONCEPTEN, SYSTEEM, '_bijlagen']);
// Headings the app writes. Notes end only at one of these, so the user's own
// "## " headings inside Mijn notities survive.
const APP_SECTIONS = ['Kernpunten', 'Content-ideeën', 'Bron'];
const KEY_ORDER = ['id', 'titel', 'url', 'bron', 'type', 'auteur', 'map', 'tags', 'score', 'status', 'ster',
  'oordeel', 'opgeslagen', 'verrijkt', 'samenvatting', 'afbeelding', 'avatar'];

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function splitFlowList(inner) {
  const parts = [];
  let cur = '';
  let quote = '';
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (quote) throw new Error('open aanhalingsteken');
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === '' || v === '~' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('"')) return JSON.parse(v);
  if (v.startsWith("'")) {
    if (v.length < 2 || !v.endsWith("'")) throw new Error('open aanhalingsteken');
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) throw new Error('open lijst');
    return splitFlowList(v.slice(1, -1)).map(parseScalar).filter((x) => x !== null);
  }
  if (v.startsWith('{')) throw new Error('objecten worden niet ondersteund');
  return v.replace(/\s+#.*$/, '');
}

export function parseYaml(src) {
  const out = {};
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^([^\s:#-][^:]*?):(?:[ \t]+(.*)|[ \t]*)$/);
    if (!m) throw new Error(`regel ${i + 1} is geen eigenschap`);
    const key = m[1].trim();
    const rest = (m[2] ?? '').trim();
    if (rest === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s*-(\s|$)/.test(lines[i + 1])) items.push(parseScalar(lines[++i].replace(/^\s*-\s*/, '')));
      out[key] = items.length ? items.filter((x) => x !== null) : null;
    } else if (/^[|>][+-]?$/.test(rest)) {
      const buf = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) buf.push(lines[++i].trim());
      out[key] = rest.startsWith('|') ? buf.join('\n').trim() : buf.join(' ').replace(/\s+/g, ' ').trim();
    } else {
      out[key] = parseScalar(rest);
    }
  }
  return out;
}

function yamlScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  const risky = s === '' || /^\s|\s$|\n/.test(s) || /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /: | #/.test(s)
    || /:$/.test(s) || /^(true|false|null|~|yes|no|-?\d+(\.\d+)?)$/i.test(s);
  return risky ? JSON.stringify(s) : s;
}

export function stringifyYaml(data) {
  const ordered = {};
  for (const k of KEY_ORDER) if (k in data) ordered[k] = data[k];
  for (const k of Object.keys(data)) if (!(k in ordered)) ordered[k] = data[k];
  let out = '';
  for (const [k, v] of Object.entries(ordered)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) out += v.length ? `${k}:\n${v.map((x) => `  - ${yamlScalar(x)}`).join('\n')}\n` : `${k}: []\n`;
    else out += `${k}: ${yamlScalar(v)}\n`;
  }
  return out;
}

// `invalid` is true when the frontmatter exists but cannot be read; such a
// note must not be rewritten, or every property in it would be lost.
export function parseNote(text) {
  const m = String(text).match(FM_RE);
  if (!m) return { data: {}, body: String(text), invalid: false, hasFrontmatter: false };
  try {
    return { data: parseYaml(m[1]), body: text.slice(m[0].length), invalid: false, hasFrontmatter: true };
  } catch {
    return { data: {}, body: text.slice(m[0].length), invalid: true, hasFrontmatter: true };
  }
}

export function stringifyNote(data, body) {
  return `---\n${stringifyYaml(data)}---\n\n${String(body).replace(/^\s*\n/, '')}`;
}

export function normalizeMeta(data) {
  const d = { ...data };
  if (d.id !== undefined && d.id !== null) d.id = String(d.id);
  d.titel = String(d.titel ?? '').trim();
  for (const k of ['url', 'bron', 'type', 'auteur', 'map', 'samenvatting', 'opgeslagen', 'afbeelding', 'avatar']) {
    if (d[k] !== undefined && d[k] !== null && typeof d[k] !== 'string') d[k] = Array.isArray(d[k]) ? d[k].join(', ') : String(d[k]);
  }
  let tags = d.tags;
  if (typeof tags === 'string') tags = tags.split(/[,\s]+/);
  d.tags = Array.isArray(tags) ? [...new Set(tags.map((t) => String(t).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))] : [];
  const score = Number(d.score);
  d.score = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 50;
  d.status = STATUSES.includes(d.status) ? d.status : 'nieuw';
  d.ster = d.ster === true || d.ster === 'true';
  d.oordeel = [1, -1].includes(Number(d.oordeel)) ? Number(d.oordeel) : 0;
  d.verrijkt = d.verrijkt === true || d.verrijkt === 'true';
  return d;
}

export function cleanFolderName(name) {
  const s = String(name ?? '')
    .replace(/[\\/:*?"<>|#^[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s_]+|[.\s]+$/g, '')
    .slice(0, 60)
    .trim();
  if (!s) return INBOX;
  const folder = s[0].toUpperCase() + s.slice(1);
  return RESERVED.has(folder) ? INBOX : folder;
}

export function fileSafe(title) {
  return String(title ?? '')
    .replace(/[\\/:*?"<>|#^[\]{}\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headingRe = (heading) => new RegExp(`^## ${escapeRe(heading)}[ \\t]*$`, 'm');

// Where a section ends: the next "## " heading, or for the notes section only
// the next heading the app itself writes.
function sectionEnd(rest, heading) {
  if (heading !== NOTES) return rest.search(/^## /m);
  return rest.search(new RegExp(`^## (?:${APP_SECTIONS.map(escapeRe).join('|')})[ \\t]*$`, 'm'));
}

export function getSection(body, heading) {
  const m = headingRe(heading).exec(body);
  if (!m) return '';
  const rest = body.slice(m.index + m[0].length);
  const next = sectionEnd(rest, heading);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

export function setSection(body, heading, content) {
  const block = `## ${heading}\n\n${String(content ?? '').trim()}\n\n`;
  const m = headingRe(heading).exec(body);
  if (!m) {
    const bron = /^## Bron[ \t]*$/m.exec(body);
    if (bron) return body.slice(0, bron.index) + block + body.slice(bron.index);
    return `${body.replace(/\s*$/, '')}\n\n${block}`;
  }
  const after = body.slice(m.index + m[0].length);
  const next = sectionEnd(after, heading);
  return body.slice(0, m.index) + block + (next === -1 ? '' : after.slice(next));
}
