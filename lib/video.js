// Finds the video file behind a post on X, TikTok, Instagram or LinkedIn with
// free public services, without a server. X and TikTok have a keyless API;
// Instagram and LinkedIn are read from their public embed page through Jina
// Reader, so that only works for public posts and can break when the
// platform changes its page. Photos work too: photo posts on X, photo
// slideshows on TikTok and every slide of an Instagram carousel.
import { parseInput, detectType } from './capture.js';

export const PLATFORMS = { tweet: 'X', tiktok: 'TikTok', instagram: 'Instagram', linkedin: 'LinkedIn' };

export class VideoError extends Error {
  name = 'VideoError';
}

const READER = 'https://r.jina.ai/';
const TIKWM = 'https://www.tikwm.com';

async function getJson(fetchImpl, url, headers = {}) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new VideoError(`HTTP ${res.status}`);
  return res.json();
}

// A page as HTML, rendered by Jina Reader (which also adds the CORS headers a
// browser needs). Accepts a JSON or a plain answer.
async function readHtml(fetchImpl, url) {
  const res = await fetchImpl(`${READER}${url}`, { headers: { Accept: 'application/json', 'X-Return-Format': 'html' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new VideoError(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return String(j.data?.html || j.data?.content || '');
  } catch {
    return text;
  }
}

const htmlDecode = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const jsonDecode = (s) => {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s.replace(/\\\//g, '/');
  }
};
const https = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

function fileName(platform, id, ext = 'mp4') {
  const day = new Date().toISOString().slice(0, 10);
  return `${platform.toLowerCase()}-${String(id || day).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || day}.${ext}`;
}

// Some CDNs (Instagram, TikTok) do not let other sites show or fetch their
// files, so photos and covers also come through wsrv.nl, a free image proxy.
export const viaProxy = (u, breedte) => `https://wsrv.nl/?url=${encodeURIComponent(u)}${breedte ? `&w=${breedte}` : '&q=100'}`;

const fotoExt = (url) => (/(?:\.|format=)png\b/i.test(url) ? 'png' : /(?:\.|format=)webp\b/i.test(url) ? 'webp' : 'jpg');

// File names, numbered when a post has more than one file, and a copy through
// the proxy for every photo in case the CDN refuses the browser.
function finish(platform, id, media, { proxy = false } = {}) {
  const many = media.length > 1;
  media.forEach((m, n) => {
    m.bestand = fileName(platform, many ? `${id}-${n + 1}` : id, m.soort === 'foto' ? fotoExt(m.url) : 'mp4');
    if (proxy && m.thumb) Object.assign(m, { voorbeeld: viaProxy(m.thumb, 1080), mini: viaProxy(m.thumb, 240) });
    if (m.soort === 'foto') m.reserve = viaProxy(m.url);
  });
  return media;
}

// ---------- X: fxtwitter ----------
// pbs.twimg.com has every photo in several sizes; name=orig is the original.
function twimg(u, size) {
  const m = String(u).match(/^https:\/\/pbs\.twimg\.com\/media\/([^.?/]+)(?:\.(\w+))?(?:\?(.*))?$/);
  if (!m) return https(u);
  const format = m[2] || new URLSearchParams(m[3] || '').get('format') || 'jpg';
  return `https://pbs.twimg.com/media/${m[1]}?format=${format}&name=${size}`;
}

function xMedia(media) {
  const all = media?.all?.length ? media.all : [...(media?.photos || []).map((p) => ({ type: 'photo', ...p })), ...(media?.videos || [])];
  return all.map((v) => {
    if (v.type === 'photo') {
      const url = twimg(v.url, 'orig');
      return url ? { soort: 'foto', url, thumb: twimg(v.url, 'large'), mini: twimg(v.url, 'small'), breedte: v.width, hoogte: v.height } : null;
    }
    // The best mp4 among the variants, otherwise the main file.
    const mp4 = (v.variants || []).filter((x) => /mp4/.test(x.content_type || x.type || '') && x.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    const url = https(mp4?.url || v.url);
    return url ? { soort: 'video', url, thumb: https(v.thumbnail_url), breedte: v.width, hoogte: v.height, duur: v.duration } : null;
  }).filter(Boolean);
}

async function fromX(url, fetchImpl) {
  const id = url.match(/status(?:es)?\/(\d+)/)?.[1];
  if (!id) throw new VideoError('Dit is geen link naar een post op X.');
  const { tweet: t } = await getJson(fetchImpl, `https://api.fxtwitter.com/status/${id}`);
  if (!t) throw new VideoError('Deze post op X is niet gevonden. Is hij openbaar?');
  const media = finish('X', id, [...xMedia(t.media), ...xMedia(t.quote?.media)]);
  return { titel: (t.text || '').slice(0, 120), auteur: t.author ? `@${t.author.screen_name}` : '', media };
}

// ---------- TikTok: tikwm ----------
async function fromTikTok(url, fetchImpl) {
  const api = `${TIKWM}/api/?url=${encodeURIComponent(url)}&hd=1`;
  let j;
  try {
    j = await getJson(fetchImpl, api);
  } catch {
    // The browser may not reach tikwm directly; Jina Reader passes the answer on.
    const text = await readHtml(fetchImpl, api);
    const raw = htmlDecode(text.replace(/<[^>]+>/g, ' ')).match(/\{[\s\S]*\}/)?.[0];
    if (!raw) throw new VideoError('TikTok gaf geen antwoord. Probeer het zo nog eens.');
    j = JSON.parse(raw);
  }
  const d = j?.data;
  if (!d || (j.code !== undefined && j.code !== 0)) throw new VideoError(j?.msg ? `TikTok: ${j.msg}` : 'Deze TikTok is niet gevonden. Is hij openbaar?');
  const abs = (u) => https(/^\//.test(u || '') ? `${TIKWM}${u}` : u);
  // A photo slideshow has its photos in images; play is then only the music.
  const fotos = (d.images || []).map((x) => abs(typeof x === 'string' ? x : x?.url || x?.display_image?.url_list?.[0])).filter(Boolean);
  const file = abs(d.hdplay) || abs(d.play);
  const media = fotos.length
    ? fotos.map((u) => ({ soort: 'foto', url: u, thumb: u }))
    : file ? [{ soort: 'video', url: file, thumb: abs(d.cover), duur: d.duration, grootte: d.hd_size || d.size }] : [];
  return {
    titel: (d.title || '').slice(0, 120),
    auteur: d.author?.unique_id ? `@${d.author.unique_id}` : '',
    media: finish('TikTok', d.id, media, { proxy: true }),
  };
}

// ---------- Instagram and LinkedIn: the public embed page ----------
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

function posterInHtml(html) {
  const m = html.match(/<video\b[^>]*\sposter=["']([^"']+)["']/i)
    || html.match(/data-poster-url=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  return m ? https(htmlDecode(m[1])) : '';
}

function videoFromHtml(platform, html, id) {
  const thumb = posterInHtml(html);
  return videosInHtml(html).slice(0, 1).map((u) => ({ soort: 'video', url: u, thumb, bestand: fileName(platform, id) }));
}

async function fromEmbed(platform, embedUrl, id, fetchImpl) {
  const html = await readHtml(fetchImpl, embedUrl);
  return { titel: '', auteur: '', media: videoFromHtml(platform, html, id) };
}

// ---------- Instagram: the post data inside the embed page ----------
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
    const post = bestPost(findPosts(root, code));
    if (!post) continue;
    const kids = slidesOf(post);
    const media = (kids.length ? kids : [post]).map(slide).filter(Boolean);
    if (!media.length) continue;
    return {
      titel: String(post.edge_media_to_caption?.edges?.[0]?.node?.text || post.caption?.text || '').slice(0, 120),
      auteur: post.owner?.username || post.user?.username ? `@${post.owner?.username || post.user?.username}` : '',
      media,
    };
  }
  return null;
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


async function fromInstagram(url, fetchImpl) {
  const code = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
  if (!code) throw new VideoError('Dit is geen link naar een Instagram-post of reel.');
  const html = await readHtml(fetchImpl, `https://www.instagram.com/p/${code}/embed/captioned/`);
  const post = postInHtml(html, code) || { titel: '', auteur: '', media: [] };
  if (!post.media.length) {
    post.media = videoFromHtml('Instagram', html, code);
    // A reel's page shows its cover as a photo; that is not what was asked for.
    if (!post.media.length && !/\/(?:reels?|tv)\//.test(url)) post.media = photosInHtml(html).map((u) => ({ soort: 'foto', url: u, thumb: u }));
  }
  finish('Instagram', code, post.media, { proxy: true });
  return post;
}

function fromLinkedIn(url, fetchImpl) {
  const id = url.match(/(?:activity[-:]|urn:li:activity:|ugcPost[-:]|urn:li:ugcPost:)(\d{15,25})/)?.[1];
  if (!id) throw new VideoError('Deze LinkedIn-link heeft geen post-nummer. Kopieer de link via de drie puntjes bij de post.');
  const kind = /ugcPost/.test(url) ? 'ugcPost' : 'activity';
  return fromEmbed('LinkedIn', `https://www.linkedin.com/embed/feed/update/urn:li:${kind}:${id}`, id, fetchImpl);
}

const RESOLVERS = { tweet: fromX, tiktok: fromTikTok, instagram: fromInstagram, linkedin: fromLinkedIn };

// Returns { platform, titel, auteur, media: [{ soort: 'video' | 'foto', url, thumb, bestand, ... }] }.
export async function findMedia(input, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  const { url } = parseInput({ text: input });
  if (!url) throw new VideoError('Plak een link naar een post op X, TikTok, Instagram of LinkedIn.');
  const type = detectType(url);
  const resolve = RESOLVERS[type];
  if (!resolve) throw new VideoError('Video downloaden werkt voor X, TikTok, Instagram en LinkedIn.');
  let result;
  try {
    result = await resolve(url, fetchImpl);
  } catch (e) {
    if (e instanceof VideoError) throw e;
    throw new VideoError(`${PLATFORMS[type]} gaf geen antwoord. Probeer het zo nog eens.`);
  }
  if (!result.media.length) {
    throw new VideoError(type === 'instagram'
      ? 'Geen video of foto gevonden. Instagram laat die alleen zien bij openbare posts, en niet altijd.'
      : type === 'linkedin'
        ? 'Geen video gevonden. LinkedIn laat video\'s alleen zien bij openbare posts, en niet altijd.'
        : 'In deze post zit geen video of foto.');
  }
  return { platform: PLATFORMS[type], url, ...result };
}
