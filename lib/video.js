// Finds the video file behind a post on X, TikTok, Instagram, Threads or LinkedIn with
// free public services, without a server. X and TikTok have a keyless API;
// Instagram and LinkedIn are read from their public embed page through Jina
// Reader, so that only works for public posts and can break when the
// platform changes its page. Threads is read from its public post page, which
// holds the post in the same format as Instagram. Photos work too: photo posts on X, photo
// slideshows on TikTok and every slide of an Instagram carousel.
import { parseInput, detectType, youtubeId } from './capture.js';
import { readHtml, htmlDecode, https, videosInHtml, posterInHtml, postInHtml, photosInHtml, canonicalInHtml } from './postdata.js';

export { videosInHtml, postInHtml, photosInHtml };

export const PLATFORMS = { tweet: 'X', tiktok: 'TikTok', instagram: 'Instagram', threads: 'Threads', linkedin: 'LinkedIn', youtube: 'YouTube' };

export class VideoError extends Error {
  name = 'VideoError';
}

const TIKWM = 'https://www.tikwm.com';

async function getJson(fetchImpl, url, headers = {}) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new VideoError(`HTTP ${res.status}`);
  return res.json();
}

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

// Every mp4 of a video, best first, with its height and an estimate of its
// size: "720p", "480p", "320p". The smallest is there for when space matters.
function xQualities(v) {
  const list = (v.variants || []).filter((x) => /mp4/.test(x.content_type || x.type || '') && https(x.url))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
    .map((x) => {
      const size = x.url.match(/\/(\d{2,4})x(\d{2,4})\//);
      const hoogte = size ? Math.min(Number(size[1]), Number(size[2])) : 0;
      return { label: hoogte ? `${hoogte}p` : x.bitrate ? `${Math.round(x.bitrate / 1000)} kbps` : 'Video', url: x.url, grootte: x.bitrate && v.duration ? Math.round((x.bitrate * v.duration) / 8) : undefined, schatting: true };
    });
  return list.filter((q, n) => list.findIndex((y) => y.label === q.label) === n);
}

function xMedia(media) {
  const all = media?.all?.length ? media.all : [...(media?.photos || []).map((p) => ({ type: 'photo', ...p })), ...(media?.videos || [])];
  return all.map((v) => {
    if (v.type === 'photo') {
      const url = twimg(v.url, 'orig');
      return url ? { soort: 'foto', url, thumb: twimg(v.url, 'large'), mini: twimg(v.url, 'small'), breedte: v.width, hoogte: v.height } : null;
    }
    const kwaliteiten = xQualities(v);
    const url = https(kwaliteiten[0]?.url || v.url);
    return url ? { soort: 'video', url, thumb: https(v.thumbnail_url), breedte: v.width, hoogte: v.height, duur: v.duration, grootte: kwaliteiten[0]?.grootte, kwaliteiten: kwaliteiten.length > 1 ? kwaliteiten : undefined } : null;
  }).filter(Boolean);
}

// vxtwitter: a second keyless service, for when the first gives no answer.
async function fromVx(id, fetchImpl) {
  const t = await getJson(fetchImpl, `https://api.vxtwitter.com/Twitter/status/${id}`);
  const media = (t.media_extended || []).map((m) => {
    if (m.type === 'image') return https(m.url) ? { soort: 'foto', url: twimg(m.url, 'orig'), thumb: twimg(m.url, 'large'), mini: twimg(m.url, 'small'), breedte: m.size?.width, hoogte: m.size?.height } : null;
    return https(m.url) ? { soort: 'video', url: m.url, thumb: https(m.thumbnail_url), breedte: m.size?.width, hoogte: m.size?.height, duur: m.duration_millis ? m.duration_millis / 1000 : undefined } : null;
  }).filter(Boolean);
  return { titel: (t.text || '').slice(0, 120), auteur: t.user_screen_name ? `@${t.user_screen_name}` : '', media: finish('X', id, media) };
}

async function fromX(url, fetchImpl) {
  const id = url.match(/status(?:es)?\/(\d+)/)?.[1];
  if (!id) throw new VideoError('Dit is geen link naar een post op X.');
  let t;
  try {
    ({ tweet: t } = await getJson(fetchImpl, `https://api.fxtwitter.com/status/${id}`));
  } catch {
    t = null;
  }
  if (!t) {
    try {
      return await fromVx(id, fetchImpl);
    } catch {
      throw new VideoError('Deze post op X is niet gevonden. Is hij openbaar?');
    }
  }
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
  // HD, the smaller standard file, and the sound on its own.
  const kwaliteiten = [
    abs(d.hdplay) && { label: 'HD', url: abs(d.hdplay), grootte: d.hd_size || undefined },
    abs(d.play) && abs(d.play) !== abs(d.hdplay) && { label: 'Standaard', url: abs(d.play), grootte: d.size || undefined },
    abs(d.music || d.music_info?.play) && { label: 'Alleen geluid', url: abs(d.music || d.music_info?.play), soort: 'audio' },
  ].filter(Boolean);
  const media = fotos.length
    ? fotos.map((u) => ({ soort: 'foto', url: u, thumb: u }))
    : file ? [{ soort: 'video', url: file, thumb: abs(d.cover), duur: d.duration, grootte: d.hd_size || d.size, kwaliteiten: kwaliteiten.length > 1 ? kwaliteiten : undefined }] : [];
  return {
    titel: (d.title || '').slice(0, 120),
    auteur: d.author?.unique_id ? `@${d.author.unique_id}` : '',
    media: finish('TikTok', d.id, media, { proxy: true }),
  };
}

// ---------- Instagram and LinkedIn: the public embed page ----------
function videoFromHtml(platform, html, id) {
  const thumb = posterInHtml(html);
  return videosInHtml(html).slice(0, 1).map((u) => ({ soort: 'video', url: u, thumb, bestand: fileName(platform, id) }));
}

async function fromEmbed(platform, embedUrl, id, fetchImpl) {
  const html = await readHtml(fetchImpl, embedUrl);
  return { titel: '', auteur: '', media: videoFromHtml(platform, html, id) };
}

const igCode = (u) => String(u || '').match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1] || '';

async function fromInstagram(url, fetchImpl) {
  let code = /\/share\//.test(url) ? '' : igCode(url);
  if (!code) {
    // A share link leads to the post: its page names the real address.
    const page = await readHtml(fetchImpl, url).catch(() => '');
    code = igCode(canonicalInHtml(page)) || igCode(page);
  }
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

const liId = (text) => String(text || '').match(/(?:activity[-:]|urn:li:activity:|ugcPost[-:]|urn:li:ugcPost:)(\d{15,25})/)?.[1] || '';

// The files of a LinkedIn video as its page names them, best first:
// ".../mp4-720p-30fp-crf28/..." and smaller ones.
function linkedinVideos(text) {
  const found = new Map();
  for (const m of String(text).matchAll(/https:\/\/dms\.licdn\.com\/playlist\/vid\/[^\s"'<>)\\]+/g)) {
    const url = htmlDecode(m[0]);
    const q = url.match(/\/mp4-(\d{3,4})p[^/]*\//);
    if (!q || found.has(q[1])) continue;
    found.set(q[1], { label: `${q[1]}p`, url, hoogte: Number(q[1]) });
  }
  return [...found.values()].sort((a, b) => b.hoogte - a.hoogte);
}

// The photos of a post, largest version of each. Profile photos, logos and
// link previews are no part of the post.
export function linkedinPhotos(text) {
  const best = new Map();
  for (const m of String(text).matchAll(/https:\/\/media\.licdn\.com\/dms\/image\/[^\s"'<>)\\]+/g)) {
    const url = htmlDecode(m[0]);
    const part = url.match(/\/dms\/image\/(?:v2\/)?([^/]+)\/(feedshare-[a-z]+|image-shrink)_(\d+)(?:_(\d+))?\//);
    if (!part) continue;
    const size = Number(part[3]) * (Number(part[4]) || Number(part[3]));
    if (!best.has(part[1]) || best.get(part[1]).size < size) best.set(part[1], { url, size });
  }
  return [...best.values()].map((x) => x.url);
}

function linkedinMedia(html) {
  const media = [];
  const kwaliteiten = linkedinVideos(html);
  const video = kwaliteiten[0]?.url || videosInHtml(html)[0];
  if (video) media.push({ soort: 'video', url: video, thumb: posterInHtml(html), kwaliteiten: kwaliteiten.length > 1 ? kwaliteiten.map(({ label, url }) => ({ label, url })) : undefined });
  for (const u of linkedinPhotos(html)) media.push({ soort: 'foto', url: u, thumb: u });
  return media;
}

// The post's own page holds its video and photos, and a short link
// (lnkd.in/...) leads to it. The embed page is the second try.
async function fromLinkedIn(url, fetchImpl) {
  let id = liId(url);
  let media = [];
  let answered = false;
  const page = await readHtml(fetchImpl, url).then((h) => { answered = true; return h; }).catch(() => '');
  if (page) {
    media = linkedinMedia(page);
    id = id || liId(page);
  }
  if (!media.length && id) {
    const kind = /ugcPost[-:]\d/.test(`${url} ${page}`) && !/activity[-:]\d/.test(`${url} ${page}`) ? 'ugcPost' : 'activity';
    const embed = await readHtml(fetchImpl, `https://www.linkedin.com/embed/feed/update/urn:li:${kind}:${id}`).then((h) => { answered = true; return h; }).catch(() => '');
    media = linkedinMedia(embed);
  }
  if (!answered) throw new VideoError('LinkedIn gaf geen antwoord. Probeer het zo nog eens.');
  const name = id || url.match(/lnkd\.in\/(?:p\/)?([A-Za-z0-9_-]+)/)?.[1] || '';
  return { titel: '', auteur: '', media: finish('LinkedIn', name, media) };
}

// ---------- Threads: the public post page, then the embed ----------
const threadsPost = (text) => String(text || '').match(/threads\.(?:com|net)\/@([A-Za-z0-9._]+)\/post\/([A-Za-z0-9_-]+)/);

async function fromThreads(url, fetchImpl) {
  let code = url.match(/\/(?:post|t)\/([A-Za-z0-9_-]+)/)?.[1];
  let user = url.match(/\/@([A-Za-z0-9._]+)/)?.[1];
  if (!code) {
    // A share link (threads.com/share/...) leads to the post: its page names the real address.
    const shared = await readHtml(fetchImpl, url).catch(() => '');
    const real = threadsPost(canonicalInHtml(shared)) || threadsPost(shared);
    if (real) [, user, code] = real;
    if (shared && code) {
      const post = postInHtml(shared, code);
      if (post?.media.length) {
        finish('Threads', code, post.media, { proxy: true });
        return post;
      }
    }
  }
  if (!code) throw new VideoError('Dit is geen link naar een post op Threads.');
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

export async function answer(fetchImpl, url, init = {}, ms = 9000) {
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

export const pipedServers = (fetchImpl) => servers(fetchImpl, PIPED_LIST, (list) => (Array.isArray(list) ? list : [])
  .filter((x) => /^https:\/\//.test(x?.api_url || ''))
  .sort((a, b) => (b.uptime_24h || 0) - (a.uptime_24h || 0))
  .map((x) => x.api_url.replace(/\/+$/, '')), PIPED_RESERVE);

export const invidiousServers = (fetchImpl) => servers(fetchImpl, INVIDIOUS_LIST, (list) => (Array.isArray(list) ? list : [])
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

// ---------- any other page: its video and its pictures ----------
const NO_PICTURE = /(logo|icon|sprite|avatar|emoji|pixel|tracking|badge|spinner|placeholder|blank|1x1|gravatar|\.svg(\?|$)|\/ads?\/)/i;

// The pictures of a page that are worth having: the one it puts forward
// itself first, then its images that are not page furniture.
export function picturesInHtml(html, base) {
  const found = [];
  const add = (raw) => {
    let u = htmlDecode(String(raw || '').trim());
    try {
      u = new URL(u, base).href;
    } catch {
      return;
    }
    if (https(u) && !NO_PICTURE.test(u) && !found.includes(u)) found.push(u);
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url|:url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::secure_url|:url)?|twitter:image)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const w = Number(tag.match(/\swidth=["']?(\d+)/i)?.[1]);
    const h = Number(tag.match(/\sheight=["']?(\d+)/i)?.[1]);
    // An image that says it is small is an icon.
    if ((w && w < 200) || (h && h < 120)) continue;
    const srcset = tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1];
    const widest = srcset ? htmlDecode(srcset).split(',').map((x) => x.trim().split(/\s+/)).sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))[0]?.[0] : '';
    add(widest || tag.match(/\s(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1]);
  }
  return found.slice(0, 24);
}

async function fromPage(url, fetchImpl) {
  const html = await readHtml(fetchImpl, url);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const name = host.split('.')[0] || 'pagina';
  const titel = htmlDecode(html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim().slice(0, 120);
  const thumb = posterInHtml(html);
  const media = [
    ...videosInHtml(html).slice(0, 3).map((u) => ({ soort: 'video', url: u, thumb })),
    ...picturesInHtml(html, url).map((u) => ({ soort: 'foto', url: u, thumb: u })),
  ];
  return { titel, auteur: '', media: finish(name, new Date().toISOString().slice(0, 10), media, { proxy: true }) };
}

const RESOLVERS = { tweet: fromX, tiktok: fromTikTok, instagram: fromInstagram, threads: fromThreads, linkedin: fromLinkedIn };

// Returns { platform, titel, auteur, media: [{ soort: 'video' | 'foto', url, thumb, bestand, ... }] },
// and for YouTube { platform, titel, auteur, media: [], youtube: { formaten, ... } }.
export async function findMedia(input, { fetchImpl = globalThis.fetch?.bind(globalThis), cobalt = null } = {}) {
  const { url } = parseInput({ text: input });
  if (!url) throw new VideoError('Plak een link naar een post, een video of een webpagina.');
  const type = detectType(url);
  if (type === 'youtube') {
    const youtube = await findYouTube(url, { fetchImpl, cobalt });
    return { platform: 'YouTube', url, titel: youtube.titel, auteur: youtube.auteur, media: [], youtube };
  }
  // Any other page: whatever video and pictures it holds.
  const resolve = RESOLVERS[type] || (['artikel', 'pdf'].includes(type) && !/\.pdf$/i.test(new URL(url).pathname) ? fromPage : null);
  if (!resolve) throw new VideoError('Downloaden werkt voor X, TikTok, Instagram, Threads, LinkedIn, YouTube en gewone webpagina\'s.');
  const naam = PLATFORMS[type] || new URL(url).hostname.replace(/^www\./, '');
  let result;
  try {
    result = await resolve(url, fetchImpl);
  } catch (e) {
    if (e instanceof VideoError) throw e;
    throw new VideoError(`${naam} gaf geen antwoord. Probeer het zo nog eens.`);
  }
  if (!result.media.length) {
    throw new VideoError(type === 'instagram' || type === 'threads'
      ? `Geen video of foto gevonden. ${PLATFORMS[type]} laat die alleen zien bij openbare posts, en niet altijd.`
      : type === 'linkedin'
        ? 'Geen video gevonden. LinkedIn laat video\'s alleen zien bij openbare posts, en niet altijd.'
        : PLATFORMS[type] ? 'In deze post zit geen video of foto.' : 'Op deze pagina vond ik geen video of afbeeldingen.');
  }
  return { platform: naam, url, ...result };
}
