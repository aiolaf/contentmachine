// Items saved to learn from: not the subject of a post, but what another maker
// tells about making content. Their lessons live in the note under "## Lessen",
// written by you or pasted from Claude, and can go along in later prompts.
import { getSection, setSection, removeSection } from './frontmatter.js';

export const LESSEN = 'Lessen';

// What Claude or you wrote: without its title line, and with its headings
// below the level of the section itself, so the note keeps its structure.
export function cleanLessons(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/^\s*# [^\n]*\n+/, '').replace(/^#{1,2} /gm, '### ').trim();
}

export const lessonsOf = (body) => getSection(body, LESSEN);

// The lessons themselves: list items before the first sub-heading.
export function countLessons(body) {
  const top = lessonsOf(body).split(/^### /m)[0];
  return (top.match(/^(?:[-*+]|\d+[.)])\s+\S/gm) || []).length;
}

export function withLessons(body, text) {
  const clean = cleanLessons(text);
  return clean ? setSection(body, LESSEN, clean) : removeSection(body, LESSEN);
}
