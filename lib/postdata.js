// Reads a public page through Jina Reader and finds the post inside it: the
// caption, the maker and every photo and video. Instagram and Threads put the
// post as JSON in the page; the embed page also shows it as plain HTML. Shared
// by the downloader and by saving a link.

const READER = 'https://r.jina.ai/';

// A page as HTML, rendered by Jina Reader (which also adds the CORS headers a
// browser needs). Accepts a JSON or a plain answer.
export async function readHtml(fetchImpl, url) {
  const res = await fetchImpl(`${READER}${url}`, { headers: { Accept: 'application/json', 'X-Return-Format': 'html' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return String(j.data?.html || j.data?.content || '');
  } catch {
    return text;
  }
}

export const htmlDecode = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export const jsonDecode = (s) => {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s.replace(/\\\//g, '/');
  }
};
export const https = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

// Every place a page can name its video file, most specific first.
export function videosInHtml(html) {
  const found = [];
  const add = (u) => {
    const clean = https(u.replace(/&amp;/g, '&'));
    if (clean && !found.includes(clean)) found.push(clean);
  };
  for (const m of html.matchAll(/"video_url"\s*:\s*"([^"]+)"/g)) add(jsonDecode(m[1]));
  for (const m of html.matchAll(/data-sources=(?:"([^"]+)"|'([^']+)')/g)) {
    try {
      const list = JSON.parse(htmlDecode(m[1] || m[2]));
      list.sort((a, b) => (Number(b['data-bitrate'] || b.bitrate) || 0) - (Number(a['data-bitrate'] || a.bitrate) || 0)).forEach((s) => s.src && add(s.src));
    } catch {
      // not JSON after all
    }
  }
  for (const m of html.matchAll(/<(?:video|source)\b[^>]*?\ssrc=["']([^"']+\.mp4[^"']*)["']/gi)) add(htmlDecode(m[1]));
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["']og:video(?::secure_url|:url)?["'][^>]*content=["']([^"']+)["']/gi)) add(htmlDecode(m[1]));
  for (const m of html.matchAll(/"contentUrl"\s*:\s*"([^"]+)"/g)) add(jsonDecode(m[1]));
  return found;
}

export function posterInHtml(html) {
  const m = html.match(/<video\b[^>]*\sposter=["']([^"']+)["']/i)
    || html.match(/data-poster-url=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  return m ? https(htmlDecode(m[1])) : '';
}

// The text of the JSON string literal that opens at text[start] (a quote).
function stringAt(text, start) {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '"') return text.slice(start, i + 1);
  }
  return '';
}

// The JSON object that opens at text[start] (a brace), strings taken into account.
function objectAt(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"') i += Math.max(stringAt(text, i).length - 1, 0);
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return '';
}

const tryJson = (t) => {
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
};

// Every block of JSON in the page that can hold the post: the embed's
// contextJSON (a JSON text inside a string), a bare shortcode_media object
// and the page's JSON scripts.
function jsonRoots(html) {
  const roots = [];
  for (const m of html.matchAll(/"contextJSON"\s*:\s*"/g)) {
    const inner = tryJson(stringAt(html, m.index + m[0].length - 1));
    if (typeof inner === 'string') roots.push(tryJson(inner));
  }
  for (const m of html.matchAll(/"(?:xdt_)?shortcode_media"\s*:\s*\{/g)) roots.push(tryJson(objectAt(html, m.index + m[0].length - 1)));
  for (const m of html.matchAll(/<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) roots.push(tryJson(m[1]));
  return roots.filter((r) => r && typeof r === 'object');
}

const isPost = (o) => Boolean(o.display_url || o.image_versions2 || o.video_url || o.edge_sidecar_to_children || o.carousel_media)
  && Boolean(o.shortcode || o.code || o.id);

// Every object in the JSON that looks like this post. JSON that sits inside a
// string is opened as well. Slides of a carousel have their own shortcode, so
// they drop out when the code is known.
function findPosts(node, code, found = [], seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node) || found.length > 50) return found;
  seen.add(node);
  const own = node.shortcode || node.code;
  if (!Array.isArray(node) && isPost(node) && (!code || !own || own === code)) found.push(node);
  for (const value of Object.values(node)) {
    const inner = typeof value === 'string' && /^\s*[{[]/.test(value) && /display_url|image_versions2|shortcode_media/.test(value) ? tryJson(value) : value;
    findPosts(inner, code, found, seen);
  }
  return found;
}

const slidesOf = (post) => post.edge_sidecar_to_children?.edges?.map((e) => e?.node).filter(Boolean) || post.carousel_media || [];

// The richest match: a carousel with its slides before a single photo, and
// real post data before a bare summary.
function bestPost(posts) {
  const score = (p) => slidesOf(p).length * 10 + (p.display_resources || p.display_url || p.image_versions2 ? 2 : 0) + (p.video_url || p.video_versions ? 1 : 0);
  return [...posts].sort((a, b) => score(b) - score(a))[0] || null;
}

const widest = (list, w, u) => [...(list || [])].filter((x) => x?.[u]).sort((a, b) => (b[w] || 0) - (a[w] || 0))[0]?.[u] || '';

function slide(n) {
  const foto = https(widest(n.display_resources, 'config_width', 'src') || n.display_url || widest(n.image_versions2?.candidates, 'width', 'url'));
  const video = https(n.video_url || widest(n.video_versions, 'width', 'url'));
  const maat = { breedte: n.dimensions?.width || n.original_width, hoogte: n.dimensions?.height || n.original_height };
  // A video without its file is left out rather than offered as its cover photo.
  if (n.is_video || n.media_type === 2) return video ? { soort: 'video', url: video, thumb: foto, duur: n.video_duration, ...maat } : null;
  return foto ? { soort: 'foto', url: foto, thumb: foto, ...maat } : null;
}

export function postInHtml(html, code = '') {
  for (const root of jsonRoots(html)) {
    const posts = findPosts(root, code);
    // A page with replies holds other posts too: the one with this code wins.
    const exact = posts.filter((p) => (p.shortcode || p.code) === code);
    const post = bestPost(exact.length ? exact : posts);
    if (!post) continue;
    const kids = slidesOf(post);
    const media = (kids.length ? kids : [post]).map(slide).filter(Boolean);
    if (!media.length) continue;
    const tekst = String(post.edge_media_to_caption?.edges?.[0]?.node?.text || post.caption?.text || '').trim();
    const user = post.owner || post.user || {};
    const taken = Number(post.taken_at_timestamp || post.taken_at) || 0;
    return {
      titel: tekst.slice(0, 120),
      tekst,
      auteur: user.username ? `@${user.username}` : '',
      naam: String(user.full_name || '').trim(),
      avatar: https(user.profile_pic_url || ''),
      gepubliceerd: taken ? new Date(taken * 1000).toISOString() : '',
      media,
    };
  }
  return null;
}

const stripTags = (html) => htmlDecode(String(html)
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))))
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// The caption as the embed page shows it: the maker's name, then the text,
// up to the comments. For pages that carry no post data.
export function captionInHtml(html) {
  const start = html.search(/<div[^>]*class=["'][^"']*\bCaption\b[^"']*["'][^>]*>/i);
  if (start === -1) return { tekst: '', auteur: '' };
  let inner = html.slice(start).replace(/^<div[^>]*>/i, '');
  const end = inner.search(/<div[^>]*class=["'][^"']*\bCaptionComments\b/i);
  // Without a comments block the caption ends where its own div closes.
  inner = end === -1 ? inner.slice(0, Math.max(0, inner.search(/<\/div>/i))) : inner.slice(0, end);
  const user = inner.match(/<a[^>]*class=["'][^"']*\bCaptionUsername\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  const tekst = stripTags(user ? inner.replace(user[0], '') : inner);
  const naam = user ? stripTags(user[1]) : '';
  return { tekst, auteur: naam ? `@${naam.replace(/^@/, '')}` : '' };
}

// The page's own address, when it names one: a share link redirects to it.
export function canonicalInHtml(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
  return m ? https(htmlDecode(m[1])) : '';
}

// The photos the embed page shows itself, widest version of each.
export function photosInHtml(html) {
  const found = [];
  for (const m of html.matchAll(/<img\b[^>]*class=["'][^"']*EmbeddedMedia(?:Image)?\b[^"']*["'][^>]*>/gi)) {
    const tag = m[0];
    const srcset = htmlDecode(tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1] || '');
    const best = srcset.split(',').map((part) => part.trim().split(/\s+/)).map(([u, w]) => ({ u, w: parseInt(w, 10) || 0 }))
      .sort((a, b) => b.w - a.w)[0]?.u;
    const url = https(best || htmlDecode(tag.match(/\ssrc=["']([^"']+)["']/i)?.[1] || ''));
    if (url && !found.includes(url)) found.push(url);
  }
  return found;
}


