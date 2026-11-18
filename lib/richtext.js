// Markdown to clean HTML that pastes into an editor like Substack's as rich
// text: headings, bold, italic, links, lists, quotes, dividers and images,
// and nothing else. No classes, no styles, no scripts.
import { stripCode, parseResult, plain, section, withoutHashtags } from './platforms.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Only web and mail addresses become links.
const safeHref = (u) => (/^(https?:\/\/|mailto:)/i.test(u) ? u : '');

function inline(src) {
  // Code first, so what is inside it stays as typed.
  const codes = [];
  let s = esc(src).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    // An address may hold one pair of brackets of its own, as in ".../Agent_(AI)".
    .replace(/!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (m, alt, u) => (safeHref(u) ? `<img src="${u}" alt="${alt}">` : alt))
    .replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (m, t, u) => (safeHref(u) ? `<a href="${u}">${t}</a>` : t))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(>])\*([^*\s][^*]*)\*(?=[\s).,!?:;<]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(>])_([^_\s][^_]*)_(?=[\s).,!?:;<]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '$1<a href="$2">$2</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[Number(n)]}</code>`);
}

export function toHtml(markdown) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const out = [];
  const para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para.length = 0;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (h) {
      flush();
      const level = Math.min(h[1].length, 4);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      // An Obsidian callout keeps its title in bold.
      const callout = buf[0]?.match(/^\[!(\w+)\]\s*(.*)$/);
      const inner = callout ? `${callout[2] ? `**${callout[2]}**\n\n` : ''}${buf.slice(1).join('\n')}` : buf.join('\n');
      out.push(`<blockquote>${toHtml(inner)}</blockquote>`);
      continue;
    }
    const list = (marker, tag) => {
      flush();
      const items = [];
      while (i < lines.length && (marker.test(lines[i]) || (items.length && /^\s{2,}\S/.test(lines[i])))) {
        if (marker.test(lines[i])) items.push(lines[i].replace(marker, ''));
        else items[items.length - 1] += `<br>${lines[i].trim()}`;
        i++;
      }
      out.push(`<${tag}>${items.map((x) => `<li>${x.split('<br>').map(inline).join('<br>')}</li>`).join('')}</${tag}>`);
    };
    if (/^\s*[-*+•]\s+/.test(line)) {
      list(/^\s*[-*+•]\s+/, 'ul');
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      list(/^\s*\d+[.)]\s+/, 'ol');
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join('\n');
}

// A newsletter as the editor sees it: the title apart, then the text. The
// subject line options are no part of the text; they are choices for the title.
export function splitNewsletter(markdown) {
  const src = stripCode(markdown).replace(/\r/g, '');
  const r = parseResult(src);
  const subjects = section(r, 'onderwerpregel', 'subject');
  const options = subjects ? subjects.tekst.split('\n').map((l) => l.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '').replace(/^["“]|["”]$/g, '').replace(/\*\*/g, '').trim()).filter(Boolean) : [];
  let body = src;
  const first = body.split('\n').findIndex((l) => l.trim());
  if (r.titel && first !== -1) body = body.split('\n').slice(first + 1).join('\n');
  return { titel: r.titel, tekst: body.replace(/^\s*\n/, '').trimEnd(), onderwerpregels: options };
}

// The text without the section of subject line options.
export function withoutSubjects(body) {
  const lines = String(body || '').split('\n');
  const start = lines.findIndex((l) => /^##\s+.*(onderwerpregel|subject)/i.test(l));
  if (start === -1) return String(body || '').trim();
  let end = lines.findIndex((l, n) => n > start && /^##\s+/.test(l));
  if (end === -1) end = lines.length;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function joinNewsletter({ titel, tekst }) {
  return `${titel.trim() ? `# ${titel.trim()}\n\n` : ''}${String(tekst || '').trim()}\n`;
}

// What goes on the clipboard for Substack: the text as HTML and as plain
// text, without the title (Substack has its own field for it), the subject
// line options and the code.
export function forSubstack(body) {
  const text = withoutHashtags(withoutSubjects(stripCode(body)));
  return { html: toHtml(text), plain: plain(text) };
}

// Typing help: wraps the selection, or starts the lines it covers with a
// marker. Returns the new text and where the selection goes.
export function applyFormat(text, start, end, kind) {
  const sel = text.slice(start, end);
  const wrap = (a, b = a, placeholder = 'tekst') => {
    const inner = sel || placeholder;
    return { tekst: text.slice(0, start) + a + inner + b + text.slice(end), start: start + a.length, end: start + a.length + inner.length };
  };
  const prefix = (marker) => {
    const from = text.lastIndexOf('\n', start - 1) + 1;
    let to = text.indexOf('\n', end);
    if (to === -1) to = text.length;
    const block = text.slice(from, to).split('\n');
    const all = block.every((l) => l.startsWith(typeof marker === 'string' ? marker : ''));
    const next = block.map((l, n) => {
      const m = typeof marker === 'function' ? marker(n) : marker;
      const bare = l.replace(/^(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, '');
      return typeof marker === 'string' && all && l.startsWith(marker) ? bare : `${m}${bare}`;
    }).join('\n');
    return { tekst: text.slice(0, from) + next + text.slice(to), start: from, end: from + next.length };
  };
  switch (kind) {
    case 'vet': return wrap('**');
    case 'cursief': return wrap('_');
    case 'link': return /^https?:\/\//.test(sel) ? { tekst: `${text.slice(0, start)}[tekst](${sel})${text.slice(end)}`, start: start + 1, end: start + 6 } : wrap('[', '](https://)', 'tekst');
    case 'h2': return prefix('## ');
    case 'h3': return prefix('### ');
    case 'citaat': return prefix('> ');
    case 'lijst': return prefix('- ');
    case 'nummers': return prefix((n) => `${n + 1}. `);
    case 'lijn': {
      const at = text.indexOf('\n', end) === -1 ? text.length : text.indexOf('\n', end);
      const ins = `${text.slice(0, at).endsWith('\n') || !at ? '' : '\n'}\n---\n\n`;
      return { tekst: text.slice(0, at) + ins + text.slice(at).replace(/^\n+/, ''), start: at + ins.length, end: at + ins.length };
    }
    default: return { tekst: text, start, end };
  }
}
