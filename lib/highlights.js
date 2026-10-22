// Highlights: passages you mark while reading, each with an optional note.
// They live in the note itself, so Obsidian shows them highlighted too:
//
//   ## Markeringen
//
//   - ==The sentence you marked.==
//     Your note about it.
import { getSection, setSection, removeSection } from './frontmatter.js';

export const MARKERINGEN = 'Markeringen';
const MAX = 1500;

// One line of text, without the == that would end the highlight early.
export function cleanHighlight(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/={2,}/g, '=').trim().slice(0, MAX);
}

export function parseHighlights(body) {
  const out = [];
  for (const line of getSection(body, MARKERINGEN).split('\n')) {
    const m = line.match(/^[-*+]\s+(.+?)\s*$/);
    if (m) {
      const tekst = cleanHighlight(m[1].replace(/^==(.*)==$/, '$1'));
      if (tekst) out.push({ tekst, notitie: '' });
    } else if (out.length && /^\s+\S/.test(line)) {
      const last = out[out.length - 1];
      last.notitie = [last.notitie, line.trim()].filter(Boolean).join('\n');
    }
  }
  return out;
}

export function formatHighlights(list) {
  return list.map((h) => {
    const note = String(h.notitie ?? '').trim();
    return `- ==${cleanHighlight(h.tekst)}==${note ? `\n${note.split('\n').map((l) => `  ${l.trim()}`).join('\n')}` : ''}`;
  }).join('\n');
}

// The body with exactly these highlights; no highlights removes the section.
export function withHighlights(body, list) {
  const clean = list.filter((h) => cleanHighlight(h.tekst));
  return clean.length ? setSection(body, MARKERINGEN, formatHighlights(clean)) : removeSection(body, MARKERINGEN);
}

export function countHighlights(body) {
  return parseHighlights(body).length;
}

// Same passage, whatever the spacing or case.
export function sameHighlight(a, b) {
  return cleanHighlight(a).toLowerCase() === cleanHighlight(b).toLowerCase();
}
