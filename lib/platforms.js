// From what Claude or ChatGPT wrote to what you paste on a platform: the
// parts of a result, plain text without Markdown, the limits that count on
// each platform and the links that open its composer.

const enc = encodeURIComponent;

// taal is the default language of what you post there; you can change it per
// channel in the settings. zichtbaar: what shows before "...more".
export const KANALEN = {
  linkedin: { naam: 'LinkedIn', limiet: 3000, zichtbaar: 210, taal: 'Nederlands', compose: (t) => `https://www.linkedin.com/feed/?shareActive=true&text=${enc(t)}`, open: 'https://www.linkedin.com/feed/' },
  x: { naam: 'X', limiet: 280, taal: 'Engels', compose: (t) => `https://x.com/intent/post?text=${enc(t)}`, open: 'https://x.com/compose/post' },
  threads: { naam: 'Threads', limiet: 500, taal: 'Engels', compose: (t) => `https://www.threads.net/intent/post?text=${enc(t)}`, open: 'https://www.threads.net/' },
  instagram: { naam: 'Instagram', limiet: 2200, zichtbaar: 125, taal: 'Engels', open: 'https://www.instagram.com/' },
  tiktok: { naam: 'TikTok', limiet: 2200, taal: 'Nederlands', open: 'https://www.tiktok.com/upload' },
  youtube: { naam: 'YouTube', limiet: 5000, taal: 'Engels', open: 'https://studio.youtube.com/' },
  substack: { naam: 'Substack', taal: 'Nederlands', open: 'https://substack.com/home' },
};

// The channel a kind of content is posted on.
export const KANAAL_VAN = {
  linkedin: 'linkedin', carrousel: 'linkedin', x: 'x', xthread: 'x', threads: 'threads',
  instagram: 'instagram', tiktok: 'tiktok', videoscript: 'tiktok', youtube: 'youtube', nieuwsbrief: 'substack',
};

// The channel a link to a post is on, or '' for any other site.
export function kanaalVanLink(url) {
  let host = '';
  try {
    host = new URL(String(url || '')).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
  if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(host)) return 'linkedin';
  if (/^(x|twitter|mobile\.twitter)\.com$/.test(host)) return 'x';
  if (/^threads\.(com|net)$/.test(host)) return 'threads';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return 'youtube';
  if (/(^|\.)substack\.com$/.test(host)) return 'substack';
  return '';
}

// ---------- the code that brings an answer back to its place ----------
const CODE_RE = /\bcm-([a-z2-9]{5})\b/i;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < 5; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `cm-${out}`;
}

export const findCode = (text) => String(text || '').match(CODE_RE)?.[0].toLowerCase() || '';

// The answer without its code line (and without "code: " in front of it).
export function stripCode(text) {
  return String(text || '')
    .replace(/^[ \t>*_`-]*(?:code\s*:?\s*)?`?cm-[a-z2-9]{5}`?[ \t*_`.]*$/gim, '')
    .replace(/\s*\(?\bcm-[a-z2-9]{5}\b\)?/gi, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- the parts of a result ----------
// { titel, hoofd, delen: [{ kop, tekst }] }: the working title from the "# "
// line, the text before the first "## " heading, and each "## " section.
export function parseResult(markdown) {
  const src = stripCode(markdown).replace(/\r/g, '');
  const lines = src.split('\n');
  let titel = '';
  const first = lines.findIndex((l) => l.trim());
  if (first !== -1 && /^# (?!#)/.test(lines[first])) {
    titel = lines[first].replace(/^# /, '').trim();
    lines.splice(0, first + 1);
  }
  const delen = [];
  let cur = { kop: '', regels: [] };
  for (const l of lines) {
    const h = l.match(/^## +(.+?)\s*#*$/);
    if (h) {
      delen.push(cur);
      cur = { kop: h[1].replace(/[*_`]/g, '').trim(), regels: [] };
    } else cur.regels.push(l);
  }
  delen.push(cur);
  const clean = delen.map((d) => ({ kop: d.kop, tekst: d.regels.join('\n').replace(/^\s*\n/, '').replace(/\s+$/, '') }));
  return { titel, hoofd: clean[0].tekst, delen: clean.slice(1).filter((d) => d.kop) };
}

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// The section whose heading holds one of these words.
export function section(result, ...names) {
  return result.delen.find((d) => names.some((n) => fold(d.kop).includes(fold(n)))) || null;
}

// The items of a list: "- a", "1. a", "1/ a" or paragraphs. Markers go.
export function listItems(text) {
  const src = String(text || '').trim();
  if (!src) return [];
  const marker = /^\s*(?:[-*+•]|\(?\d+[.)/]\)?|\d+\/\d*\)?)\s+/;
  const lines = src.split('\n');
  if (lines.some((l) => marker.test(l))) {
    const out = [];
    for (const l of lines) {
      if (marker.test(l)) out.push(l.replace(marker, ''));
      else if (out.length && l.trim()) out[out.length - 1] += `\n${l.trim()}`;
      else if (out.length && !l.trim()) out[out.length - 1] += '\n';
    }
    return out.map((x) => x.trim()).filter(Boolean);
  }
  return src.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
}

// ---------- plain text ----------
// Platforms show Markdown as it is typed. This keeps the words: no bold or
// heading marks, a link as "words (address)", lists and blank lines as they are.
export function plain(markdown) {
  return String(markdown || '').replace(/\r/g, '')
    .replace(/^```[^\n]*\n?/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => (t === u || t.replace(/^https?:\/\//, '') === u.replace(/^https?:\/\//, '') ? u : `${t} (${u})`))
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*\n]*)\*(?=[\s).,!?:;]|$)/gm, '$1$2')
    .replace(/(^|[\s(])_([^_\s][^_\n]*)_(?=[\s).,!?:;]|$)/gm, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^\s*[-*]{3,}\s*$/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- counting ----------
// How X counts: an address is 23, an emoji and most Asian characters are 2.
export function xLength(text) {
  const t = String(text || '').normalize('NFC').replace(/https?:\/\/[^\s]+/g, 'x'.repeat(23));
  let n = 0;
  for (const ch of t) {
    const c = ch.codePointAt(0);
    n += c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037) ? 1 : 2;
  }
  return n;
}

export const charLength = (text) => [...String(text || '')].length;
export const countFor = (kanaal, text) => (kanaal === 'x' ? xLength(text) : charLength(text));
// Text without hashtags: a row of them at the end of a line goes, a hashtag
// inside a sentence keeps its word ("#AI helpt" -> "AI helpt"). "#1", "C#"
// and the "#frag" of a link stay.
export function withoutHashtags(text) {
  const tag = '#\\p{L}[\\p{L}\\p{N}_]*';
  return String(text || '')
    .split('\n')
    .map((line) => line
      .replace(new RegExp(`(?:^|[ \\t]+)(?:${tag}[ \\t]*)+$`, 'u'), '')
      .replace(new RegExp(`(^|[\\s(])#(\\p{L}[\\p{L}\\p{N}_]*)`, 'gu'), '$1$2')
      .replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const hashtags = (text) => (String(text || '').match(/(?:^|\s)#[\p{L}\p{N}_]+/gu) || []).map((h) => h.trim());
export const words = (text) => (plain(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
// Minutes to read at 230 words a minute, at least 1.
export const readMinutes = (text) => Math.max(1, Math.round(words(text) / 230));
// Seconds to say it at 150 words a minute.
export const speakSeconds = (text) => Math.round((words(String(text || '').replace(/\[[^\]]*\]/g, '')) / 150) * 60);

// What shows before "...more": about `max` characters or three lines.
export function visiblePart(text, max = 210) {
  const src = String(text || '').trim();
  const lines = src.split('\n');
  let out = '';
  let shown = 0;
  for (const l of lines) {
    if (shown >= 3) break;
    const next = out ? `${out}\n${l}` : l;
    if (next.length > max) {
      const room = max - (out ? out.length + 1 : 0);
      const cut = l.slice(0, Math.max(0, room)).replace(/\s+\S*$/, '');
      out = out ? `${out}\n${cut}` : cut;
      return { tekst: out.trim(), meer: true };
    }
    out = next;
    if (l.trim()) shown += 1;
  }
  return { tekst: out.trim(), meer: out.trim().length < src.length };
}

// ---------- X: one post or a thread ----------
// The posts of a thread: numbered ("1/", "2/5", "1.") when the text has them,
// otherwise paragraphs packed up to the limit.
export function threadPosts(text, max = 280) {
  const src = plain(text);
  const numbered = /^\s*\(?\d+\s*(?:\/\s*\d*|[.)])\)?\s+/m;
  if (numbered.test(src)) {
    const parts = src.split(/^\s*\(?\d+\s*(?:\/\s*\d*|[.)])\)?\s+/m).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }
  const out = [];
  for (const para of src.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) {
    const last = out[out.length - 1];
    if (last && xLength(`${last}\n\n${para}`) <= max) out[out.length - 1] = `${last}\n\n${para}`;
    else out.push(para);
  }
  return out;
}

// ---------- what to show and copy for one kind of content ----------
// { kanaal, blokken: [{ naam, tekst, tel, limiet, rol }] }. rol: 'post' is
// what you publish, 'keuze' an alternative, 'script' something to read out,
// 'tekst' anything else. tel counts the way the channel does.
export function outputFor(soort, markdown) {
  const kanaal = KANAAL_VAN[soort] || '';
  const k = KANALEN[kanaal];
  const r = parseResult(markdown);
  const blok = (naam, tekst, rol = 'tekst', limiet = k?.limiet) => {
    const t = withoutHashtags(plain(tekst));
    return { naam, tekst: t, rol, tel: countFor(kanaal, t), limiet: rol === 'script' ? 0 : limiet };
  };
  const used = new Set();
  const take = (...names) => {
    const s = section(r, ...names);
    if (s) used.add(s);
    return s;
  };
  const blokken = [];
  const choices = (s, naam) => listItems(s?.tekst).forEach((t, n) => blokken.push(blok(`${naam} ${n + 1}`, t.replace(/^["“]|["”]$/g, ''), 'keuze')));
  if (soort === 'xthread') {
    const thread = take('thread');
    threadPosts(thread?.tekst || r.hoofd).forEach((t, n) => blokken.push(blok(`Post ${n + 1}`, t, 'post')));
    if (thread && r.hoofd.trim()) blokken.unshift(blok('Losse post', r.hoofd, 'keuze'));
    choices(take('hook'), 'Andere opening');
  } else if (soort === 'x' || soort === 'threads') {
    if (r.hoofd.trim()) blokken.push(blok('Post', r.hoofd, 'post'));
    choices(take('alternati', 'versie', 'variant', 'hook'), 'Andere versie');
    const thread = take('thread');
    if (thread) threadPosts(thread.tekst).forEach((t, n) => blokken.push(blok(`Thread ${n + 1}`, t, 'keuze')));
  } else if (soort === 'instagram') {
    if (r.hoofd.trim()) blokken.push(blok('Caption', r.hoofd, 'post'));
    const reel = take('reel', 'script');
    if (reel) blokken.push(blok('Reel-script', reel.tekst, 'script'));
    choices(take('hook'), 'Andere hook');
  } else if (soort === 'tiktok' || soort === 'videoscript') {
    const caption = take('caption');
    const hooks = take('alternatieve hooks', 'alternative hooks');
    // What the script takes from its example is a note for you, not something to say.
    const format = soort === 'videoscript' ? take('format') : null;
    const script = [r.hoofd, ...r.delen.filter((d) => d !== caption && d !== hooks && d !== format).map((d) => `${d.kop}\n${d.tekst}`)].filter((x) => x.trim()).join('\n\n');
    r.delen.forEach((d) => used.add(d));
    if (format) blokken.push(blok('Format van de inspiratie', format.tekst, 'tekst', 0));
    if (script) blokken.push(blok('Script', script, 'script'));
    if (caption) blokken.push(blok('Caption', caption.tekst, 'post'));
    choices(hooks, 'Andere hook');
  } else if (soort === 'carrousel') {
    const post = take('begeleidende post', 'post');
    const slides = r.delen.filter((d) => /^slide\b/i.test(d.kop));
    slides.forEach((d) => {
      used.add(d);
      blokken.push(blok(d.kop, d.tekst, 'tekst', 0));
    });
    if (post) blokken.push(blok('Begeleidende post', post.tekst, 'post'));
  } else if (soort === 'youtube') {
    choices(take('titel', 'title'), 'Titel');
    blokken.forEach((b) => Object.assign(b, { limiet: 100 }));
    const desc = take('beschrijving', 'description');
    if (desc) blokken.push(blok('Beschrijving', desc.tekst, 'post'));
    const script = take('script', 'outline', 'opzet');
    if (script || r.hoofd.trim()) blokken.push(blok('Script', script?.tekst || r.hoofd, 'script'));
  } else if (soort === 'nieuwsbrief') {
    choices(take('onderwerpregel', 'subject'), 'Onderwerpregel');
  } else if (r.hoofd.trim()) {
    blokken.push(blok(soort === 'linkedin' ? 'Post' : 'Tekst', r.hoofd, soort === 'linkedin' ? 'post' : 'tekst'));
    choices(take('hook'), 'Andere hook');
  }
  // Whatever else the answer holds stays available.
  for (const d of r.delen) if (!used.has(d) && d.tekst.trim() && soort !== 'nieuwsbrief') blokken.push(blok(d.kop, d.tekst, 'tekst', 0));
  return { kanaal, titel: r.titel, blokken };
}

// A post with another opening: the chosen hook replaces the first paragraph.
export function withHook(post, hook) {
  const parts = String(post || '').split(/\n\s*\n/);
  parts[0] = String(hook || '').trim();
  return parts.join('\n\n');
}

// The link that opens the channel with this text ready, or just the channel.
export function composeLink(kanaal, text, { substack = '' } = {}) {
  const k = KANALEN[kanaal];
  if (!k) return '';
  if (kanaal === 'substack') return substack ? `${String(substack).replace(/\/+$/, '')}/publish/post` : k.open;
  // Very long texts do not fit in a link; then the text goes via the clipboard.
  if (k.compose && text && enc(text).length < 6000) return k.compose(text);
  return k.open;
}
