// Finds the video file behind a post on X, TikTok, Instagram or LinkedIn with
// free public services, without a server. X and TikTok have a keyless API;
// Instagram and LinkedIn are read from their public embed page through Jina
// Reader, so that only works for public posts and can break when the
// platform changes its page.
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

function fileName(platform, id) {
  const day = new Date().toISOString().slice(0, 10);
  return `${platform.toLowerCase()}-${String(id || day).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || day}.mp4`;
}

// ---------- X: fxtwitter ----------
async function fromX(url, fetchImpl) {
  const id = url.match(/status(?:es)?\/(\d+)/)?.[1];
  if (!id) throw new VideoError('Dit is geen link naar een post op X.');
  const { tweet: t } = await getJson(fetchImpl, `https://api.fxtwitter.com/status/${id}`);
  if (!t) throw new VideoError('Deze post op X is niet gevonden. Is hij openbaar?');
  const list = [...(t.media?.videos || []), ...(t.quote?.media?.videos || [])];
  const videos = list.map((v, n) => {
    // The best mp4 among the variants, otherwise the main file.
    const mp4 = (v.variants || []).filter((x) => /mp4/.test(x.content_type || x.type || '') && x.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    return {
      url: https(mp4?.url || v.url),
      thumb: https(v.thumbnail_url),
      breedte: v.width, hoogte: v.height, duur: v.duration,
      bestand: fileName('X', list.length > 1 ? `${id}-${n + 1}` : id),
    };
  }).filter((v) => v.url);
  return { titel: (t.text || '').slice(0, 120), auteur: t.author ? `@${t.author.screen_name}` : '', videos };
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
  const file = abs(d.hdplay) || abs(d.play);
  return {
    titel: (d.title || '').slice(0, 120),
    auteur: d.author?.unique_id ? `@${d.author.unique_id}` : '',
    videos: file ? [{ url: file, thumb: abs(d.cover), duur: d.duration, grootte: d.hd_size || d.size, bestand: fileName('TikTok', d.id) }] : [],
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

async function fromEmbed(platform, embedUrl, id, fetchImpl) {
  const html = await readHtml(fetchImpl, embedUrl);
  const urls = videosInHtml(html);
  const thumb = posterInHtml(html);
  return { titel: '', auteur: '', videos: urls.slice(0, 1).map((u) => ({ url: u, thumb, bestand: fileName(platform, id) })) };
}

function fromInstagram(url, fetchImpl) {
  const code = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
  if (!code) throw new VideoError('Dit is geen link naar een Instagram-post of reel.');
  return fromEmbed('Instagram', `https://www.instagram.com/p/${code}/embed/captioned/`, code, fetchImpl);
}

function fromLinkedIn(url, fetchImpl) {
  const id = url.match(/(?:activity[-:]|urn:li:activity:|ugcPost[-:]|urn:li:ugcPost:)(\d{15,25})/)?.[1];
  if (!id) throw new VideoError('Deze LinkedIn-link heeft geen post-nummer. Kopieer de link via de drie puntjes bij de post.');
  const kind = /ugcPost/.test(url) ? 'ugcPost' : 'activity';
  return fromEmbed('LinkedIn', `https://www.linkedin.com/embed/feed/update/urn:li:${kind}:${id}`, id, fetchImpl);
}

const RESOLVERS = { tweet: fromX, tiktok: fromTikTok, instagram: fromInstagram, linkedin: fromLinkedIn };

// Returns { platform, titel, auteur, videos: [{ url, thumb, bestand, ... }] }.
export async function findVideos(input, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
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
  if (!result.videos.length) {
    throw new VideoError(type === 'instagram' || type === 'linkedin'
      ? `Geen video gevonden. ${PLATFORMS[type]} laat video's alleen zien bij openbare posts, en niet altijd.`
      : 'In deze post zit geen video.');
  }
  return { platform: PLATFORMS[type], url, ...result };
}
