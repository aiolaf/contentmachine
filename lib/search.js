// Full-text search on the device: every saved note is searched, not only the
// titles. Read-later apps charge a monthly fee for this; here the bodies are
// read once and kept on the device by blob sha.

// Lower case without accents, so "ideeen" finds "ideeën".
export function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Readable text of a note body: no Markdown syntax, images or link targets.
export function plainText(body) {
  return String(body ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/^>\s?\[![^\]]+\]\s*/gm, '')
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/==|\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words, or "an exact phrase" between quotes. A leading # is ignored, tags have none.
export function parseQuery(q) {
  const terms = [];
  String(q ?? '').replace(/"([^"]+)"|(\S+)/g, (_, phrase, word) => {
    const t = fold(phrase ?? word).replace(/^#/, '').trim();
    if (t) terms.push(t);
    return '';
  });
  return terms;
}

function count(hay, needle) {
  let n = 0;
  for (let at = hay.indexOf(needle); at !== -1 && n < 5; at = hay.indexOf(needle, at + needle.length)) n++;
  return n;
}

// Every term must match somewhere. Title hits weigh most, then tags and
// summary, then the full text. Returns null when the item does not match.
// text: { plain, folded } of the body, or null when it is not loaded yet.
export function matchItem(item, text, terms) {
  if (!terms.length) return { score: 0, inBody: false };
  const title = fold(item.titel);
  const meta = fold([item.samenvatting, (item.tags || []).join(' '), item.bron, item.auteur, item.map].join(' '));
  const body = text?.folded || '';
  let score = 0;
  let onlyBody = false;
  for (const t of terms) {
    const inTitle = title.includes(t);
    const inMeta = meta.includes(t);
    const hits = body ? count(body, t) : 0;
    if (!inTitle && !inMeta && !hits) return null;
    if (!inTitle && !inMeta) onlyBody = true;
    score += (inTitle ? 10 : 0) + (inMeta ? 4 : 0) + (hits ? 1 + hits * 0.3 : 0);
  }
  return { score, inBody: onlyBody };
}

// A short piece of the text around the first hit, cut at word boundaries.
// Returns parts [{ t, hit }] so the caller can escape and mark them.
export function snippet(plain, terms, size = 170) {
  // Fold per character, so a position in the folded text maps back to the original.
  let folded = '';
  const at = [];
  for (let i = 0; i < plain.length; i++) {
    const f = fold(plain[i]);
    for (let k = 0; k < f.length; k++) at.push(i);
    folded += f;
  }
  let first = -1;
  for (const t of terms) {
    const p = folded.indexOf(t);
    if (p !== -1 && (first === -1 || p < first)) first = p;
  }
  if (first === -1) return [];
  let start = Math.max(0, at[first] - 50);
  let end = Math.min(plain.length, start + size);
  const space = plain.indexOf(' ', start);
  if (start > 0 && space !== -1 && space < at[first]) start = space + 1;
  if (end < plain.length) end = plain.lastIndexOf(' ', end) > start ? plain.lastIndexOf(' ', end) : end;

  const ranges = [];
  for (const t of terms) {
    for (let p = folded.indexOf(t); p !== -1; p = folded.indexOf(t, p + t.length)) {
      const s = at[p];
      const e = at[p + t.length - 1] + 1;
      if (e > start && s < end) ranges.push([Math.max(s, start), Math.min(e, end)]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let pos = start;
  for (const [s, e] of ranges) {
    if (e <= pos) continue;
    if (s > pos) parts.push({ t: plain.slice(pos, s), hit: false });
    parts.push({ t: plain.slice(Math.max(s, pos), e), hit: true });
    pos = e;
  }
  if (pos < end) parts.push({ t: plain.slice(pos, end), hit: false });
  if (start > 0) parts.unshift({ t: '...', hit: false });
  if (end < plain.length) parts.push({ t: '...', hit: false });
  return parts;
}
