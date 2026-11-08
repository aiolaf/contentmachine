// Finds the video file behind a post on X, TikTok, Instagram, Threads or LinkedIn with
// free public services, without a server. X and TikTok have a keyless API;
// Instagram and LinkedIn are read from their public embed page through Jina
// Reader, so that only works for public posts and can break when the
// platform changes its page. Threads is read from its public post page, which
// holds the post in the same format as Instagram. Photos work too: photo posts on X, photo
// slideshows on TikTok and every slide of an Instagram carousel.
import { parseInput, detectType, youtubeId } from './capture.js';

export const PLATFORMS = { tweet: 'X', tiktok: 'TikTok', instagram: 'Instagram', threads: 'Threads', linkedin: 'LinkedIn', youtube: 'YouTube' };

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
    const posts = findPosts(root, code);
    // A page with replies holds other posts too: the one with this code wins.
    const exact = posts.filter((p) => (p.shortcode || p.code) === code);
    const post = bestPost(exact.length ? exact : posts);
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

// ---------- Threads: the public post page, then the embed ----------
async function fromThreads(url, fetchImpl) {
  const code = url.match(/\/(?:post|t)\/([A-Za-z0-9_-]+)/)?.[1];
  if (!code) throw new VideoError('Dit is geen link naar een post op Threads.');
  const user = url.match(/\/@([A-Za-z0-9._]+)/)?.[1];
  const page = user ? `https://www.threads.com/@${user}/post/${code}` : `https://www.threads.com/t/${code}`;
  let post = null;
  let failed = 0;
  for (const target of [page, `${page}/embed`]) {
    let html;
    try {
      html = await readHtml(fetchImpl, target);
    } catch {
      failed++;
      continue;
    }
    post = postInHtml(html, code);
    if (!post?.media.length) post = { titel: '', auteur: '', media: videoFromHtml('Threads', html, code) };
    if (post.media.length) break;
  }
  if (failed === 2) throw new VideoError('Threads gaf geen antwoord. Probeer het zo nog eens.');
  finish('Threads', code, post.media, { proxy: true });
  return post;
}

// ---------- YouTube ----------
// YouTube's own file links only work on the device that asked for them, so
// the file has to come through a server that passes it on: your own Cobalt
// server when you set one (every quality, also very small), otherwise public
// Piped or Invidious servers (360p with sound, and sound only). Public servers
// come and go; on a Mac yt-dlp always works, so its command is always offered.

// MB per minute, roughly, for the sizes Cobalt can make.
export const YT_FORMATEN = [
  { id: '144', label: '144p', soort: 'video', hoogte: 144, perMin: 1.6 },
  { id: '240', label: '240p', soort: 'video', hoogte: 240, perMin: 2.6 },
  { id: '360', label: '360p', soort: 'video', hoogte: 360, perMin: 4.5 },
  { id: '480', label: '480p', soort: 'video', hoogte: 480, perMin: 7.5 },
  { id: '720', label: '720p', soort: 'video', hoogte: 720, perMin: 14 },
  { id: '1080', label: '1080p', soort: 'video', hoogte: 1080, perMin: 27 },
  { id: 'audio', label: 'Alleen geluid', soort: 'audio', perMin: 0.7, ext: 'mp3' },
];

const PIPED_LIST = 'https://piped-instances.kavin.rocks/';
const INVIDIOUS_LIST = 'https://api.invidious.io/instances.json?sort_by=health';
const PIPED_RESERVE = ['https://pipedapi.kavin.rocks'];
const INVIDIOUS_RESERVE = ['https://inv.nadeko.net', 'https://yewtu.be'];

async function answer(fetchImpl, url, init = {}, ms = 9000) {
  const res = await fetchImpl(url, { ...init, headers: { Accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(ms) });
  const j = await res.json().catch(() => null);
  if (!res.ok && !j) throw new VideoError(`HTTP ${res.status}`);
  return j;
}

const extOf = (mime, fallback) => (/webm/i.test(mime) ? 'webm' : /audio\/mp4|m4a/i.test(mime) ? 'm4a' : /mpeg/i.test(mime) ? 'mp3' : /mp4/i.test(mime) ? 'mp4' : fallback);
const bytes = (n) => (Number(n) > 0 ? Number(n) : undefined);

// From lists of streams to a short menu: video with sound per height (mp4
// first, iPhones save no webm to Photos), then sound only, normal and smallest.
function menu(video, audio, duur) {
  const byHeight = new Map();
  for (const v of video) {
    const prev = byHeight.get(v.hoogte);
    if (!prev || (prev.ext !== 'mp4' && v.ext === 'mp4')) byHeight.set(v.hoogte, v);
  }
  const formaten = [...byHeight.values()].sort((a, b) => a.hoogte - b.hoogte);
  const sounds = audio.filter((a) => a.url).sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
  const m4a = sounds.filter((a) => a.ext === 'm4a').at(-1) || sounds.at(-1);
  if (m4a) formaten.push({ ...m4a, id: 'audio', label: 'Alleen geluid' });
  if (sounds[0] && m4a && sounds[0] !== m4a && (sounds[0].bitrate || 0) < (m4a.bitrate || 0) * 0.7) formaten.push({ ...sounds[0], id: 'audio-klein', label: 'Alleen geluid, extra klein' });
  // No size given: estimate it from the bitrate.
  for (const f of formaten) {
    if (!f.grootte && f.bitrate && duur) Object.assign(f, { grootte: Math.round((f.bitrate * duur) / 8), schatting: true });
    delete f.bitrate;
  }
  return formaten;
}

async function servers(fetchImpl, list, pick, reserve) {
  try {
    const found = pick(await answer(fetchImpl, list, {}, 6000));
    return [...new Set([...found, ...reserve])];
  } catch {
    return reserve;
  }
}

const pipedServers = (fetchImpl) => servers(fetchImpl, PIPED_LIST, (list) => (Array.isArray(list) ? list : [])
  .filter((x) => /^https:\/\//.test(x?.api_url || ''))
  .sort((a, b) => (b.uptime_24h || 0) - (a.uptime_24h || 0))
  .map((x) => x.api_url.replace(/\/+$/, '')), PIPED_RESERVE);

const invidiousServers = (fetchImpl) => servers(fetchImpl, INVIDIOUS_LIST, (list) => (Array.isArray(list) ? list : [])
  .map((x) => x?.[1]).filter((x) => x?.api && x?.cors && x?.type === 'https' && /^https:\/\//.test(x.uri || ''))
  .map((x) => x.uri.replace(/\/+$/, '')), INVIDIOUS_RESERVE);

async function fromPiped(base, id, fetchImpl) {
  const d = await answer(fetchImpl, `${base}/streams/${id}`);
  if (!d || d.error) throw new VideoError(d?.message || d?.error || 'Piped gaf geen video');
  const video = (d.videoStreams || []).filter((v) => v.url && v.videoOnly === false).map((v) => ({
    soort: 'video', url: https(v.url), label: v.quality, hoogte: parseInt(v.quality, 10) || 0, ext: extOf(v.mimeType, 'mp4'), grootte: bytes(v.contentLength), bitrate: v.bitrate,
  }));
  const audio = (d.audioStreams || []).map((a) => ({ soort: 'audio', url: https(a.url), ext: extOf(a.mimeType, 'm4a'), grootte: bytes(a.contentLength), bitrate: a.bitrate }));
  return { titel: d.title || '', auteur: d.uploader || '', duur: d.duration || 0, thumb: https(d.thumbnailUrl), formaten: menu(video.map((v) => ({ ...v, id: `v${v.hoogte}` })), audio, d.duration) };
}

async function fromInvidious(base, id, fetchImpl) {
  const d = await answer(fetchImpl, `${base}/api/v1/videos/${id}?local=true`);
  if (!d || d.error) throw new VideoError(d?.error || 'Invidious gaf geen video');
  const abs = (u) => {
    try {
      return https(new URL(u, `${base}/`).href);
    } catch {
      return '';
    }
  };
  const video = (d.formatStreams || []).map((v) => ({
    soort: 'video', url: abs(v.url), label: v.qualityLabel || v.resolution, hoogte: parseInt(v.qualityLabel || v.resolution, 10) || 0, ext: extOf(v.type, 'mp4'), grootte: bytes(v.clen), bitrate: Number(v.bitrate) || 0,
  })).filter((v) => v.url);
  const audio = (d.adaptiveFormats || []).filter((a) => /^audio\//.test(a.type || ''))
    .map((a) => ({ soort: 'audio', url: abs(a.url), ext: extOf(a.type, 'm4a'), grootte: bytes(a.clen), bitrate: Number(a.bitrate) || 0 }));
  return { titel: d.title || '', auteur: d.author || '', duur: d.lengthSeconds || 0, formaten: menu(video.map((v) => ({ ...v, id: `v${v.hoogte}` })), audio, d.lengthSeconds) };
}

async function noembed(fetchImpl, link) {
  try {
    const d = await answer(fetchImpl, `https://noembed.com/embed?url=${encodeURIComponent(link)}`, {}, 6000);
    return { titel: d?.title || '', auteur: d?.author_name || '' };
  } catch {
    return {};
  }
}

// cobalt: { url, key } of your own Cobalt server, or nothing.
export async function findYouTube(input, { fetchImpl = globalThis.fetch?.bind(globalThis), cobalt = null } = {}) {
  const id = youtubeId(input);
  if (!id) throw new VideoError('Dit is geen link naar een YouTube-video.');
  const link = `https://www.youtube.com/watch?v=${id}`;
  const base = { id, link, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, titel: '', auteur: '', duur: 0, bron: '', formaten: [] };
  if (cobalt?.url) return { ...base, ...(await noembed(fetchImpl, link)), bron: 'Cobalt', formaten: YT_FORMATEN.map((f) => ({ ...f, cobalt: true })) };
  const [piped, invidious] = await Promise.all([pipedServers(fetchImpl), invidiousServers(fetchImpl)]);
  // All at once; the first server with files wins.
  const tries = [
    ...piped.slice(0, 3).map((b) => fromPiped(b, id, fetchImpl).then((r) => ({ ...r, bron: 'Piped' }))),
    ...invidious.slice(0, 3).map((b) => fromInvidious(b, id, fetchImpl).then((r) => ({ ...r, bron: 'Invidious' }))),
  ].map((p) => p.then((r) => (r.formaten.length ? r : Promise.reject(new VideoError('geen bestanden')))));
  try {
    const r = await Promise.any(tries);
    return { ...base, ...r, thumb: r.thumb || base.thumb };
  } catch {
    return { ...base, ...(await noembed(fetchImpl, link)) };
  }
}

// A file link from your Cobalt server for one quality, asked for just before
// downloading because such links expire.
export async function cobaltLink({ url: server, key = '' }, link, formaat, fetchImpl = globalThis.fetch?.bind(globalThis)) {
  const body = formaat.soort === 'audio'
    ? { url: link, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '96', filenameStyle: 'basic' }
    : { url: link, downloadMode: 'auto', videoQuality: formaat.id, youtubeVideoCodec: 'h264', filenameStyle: 'basic' };
  const headers = { 'Content-Type': 'application/json' };
  if (key.trim()) headers.Authorization = /^(api-key|bearer) /i.test(key.trim()) ? key.trim() : `Api-Key ${key.trim()}`;
  let j;
  try {
    j = await answer(fetchImpl, `${String(server).replace(/\/+$/, '')}/`, { method: 'POST', headers, body: JSON.stringify(body) }, 30000);
  } catch (e) {
    throw new VideoError(`Je Cobalt-server gaf geen antwoord (${e.message}).`);
  }
  if ((j?.status === 'tunnel' || j?.status === 'redirect') && https(j.url)) return https(j.url);
  const first = j?.status === 'picker' && (j.picker || []).find((x) => https(x.url));
  if (first) return https(first.url);
  throw new VideoError(`Cobalt: ${j?.error?.code || 'geen bestand'}`);
}

// The yt-dlp command for one quality. The link is rebuilt from the video id,
// so nothing from the pasted text ends up in the command.
export function ytdlpCommand(id, formaat) {
  const link = `https://www.youtube.com/watch?v=${String(id).match(/^[A-Za-z0-9_-]{11}/)?.[0] || ''}`;
  if (formaat?.soort === 'audio') return `yt-dlp -f "ba[ext=m4a]/ba" -o "~/Downloads/%(title)s.%(ext)s" "${link}"`;
  const h = formaat?.hoogte || 360;
  return `yt-dlp -S "res:${h},ext:mp4:m4a" --merge-output-format mp4 -o "~/Downloads/%(title)s ${h}p.%(ext)s" "${link}"`;
}

const RESOLVERS = { tweet: fromX, tiktok: fromTikTok, instagram: fromInstagram, threads: fromThreads, linkedin: fromLinkedIn };

// Returns { platform, titel, auteur, media: [{ soort: 'video' | 'foto', url, thumb, bestand, ... }] },
// and for YouTube { platform, titel, auteur, media: [], youtube: { formaten, ... } }.
export async function findMedia(input, { fetchImpl = globalThis.fetch?.bind(globalThis), cobalt = null } = {}) {
  const { url } = parseInput({ text: input });
  if (!url) throw new VideoError('Plak een link naar een post op X, TikTok, Instagram of LinkedIn.');
  const type = detectType(url);
  if (type === 'youtube') {
    const youtube = await findYouTube(url, { fetchImpl, cobalt });
    return { platform: 'YouTube', url, titel: youtube.titel, auteur: youtube.auteur, media: [], youtube };
  }
  const resolve = RESOLVERS[type];
  if (!resolve) throw new VideoError('Downloaden werkt voor X, TikTok, Instagram, Threads, LinkedIn en YouTube.');
  let result;
  try {
    result = await resolve(url, fetchImpl);
  } catch (e) {
    if (e instanceof VideoError) throw e;
    throw new VideoError(`${PLATFORMS[type]} gaf geen antwoord. Probeer het zo nog eens.`);
  }
  if (!result.media.length) {
    throw new VideoError(type === 'instagram' || type === 'threads'
      ? `Geen video of foto gevonden. ${PLATFORMS[type]} laat die alleen zien bij openbare posts, en niet altijd.`
      : type === 'linkedin'
        ? 'Geen video gevonden. LinkedIn laat video\'s alleen zien bij openbare posts, en niet altijd.'
        : 'In deze post zit geen video of foto.');
  }
  return { platform: PLATFORMS[type], url, ...result };
}
