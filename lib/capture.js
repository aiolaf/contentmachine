// Turns a shared link or loose text into a capture, and fetches what free,
// keyless public services can tell about it. Everything is optional: when a
// service is down or blocks the request, the text from the share sheet is used.
import { readHtml, postInHtml, captionInHtml, posterInHtml, photosInHtml } from './postdata.js';
import { cleanLinkedIn, cleanThreads, captionFromDescription, isWall, weakTitle, makerFromTitle } from './clean.js';

const TRACKING = /^(utm_|fbclid$|gclid$|igsh$|igshid$|si$|is$|mc_cid$|mc_eid$|ref_src$|ref_url$|_hsenc$|_hsmi$|vrfl$|obrf$|psln$|xmt$|rcm$|trk$)/;
const MAX_TEXT = 20000;

export function normalizeUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return '';
    for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
    if (/(^|\.)(x|twitter)\.com$/.test(u.hostname)) for (const k of ['s', 't', 'a']) u.searchParams.delete(k);
    if (/(^|\.)instagram\.com$/.test(u.hostname)) u.searchParams.delete('img_index');
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

// Share sheets send every combination: a URL, text with a URL inside, title + URL.
export function parseInput({ url, text, title } = {}) {
  let u = String(url ?? '').trim();
  let t = String(text ?? '').trim();
  if (!u || !/^https?:\/\//i.test(u)) {
    const pool = `${u} ${t}`;
    const m = pool.match(/https?:\/\/[^\s<>"']+/i);
    if (m) {
      if (u && !/^https?:\/\//i.test(u)) t = `${u} ${t}`.trim();
      u = m[0].replace(/[),.;!?]+$/, '');
      t = t.replace(m[0], ' ').replace(/[ \t]{2,}/g, ' ').trim();
    } else {
      if (u) t = `${u} ${t}`.trim();
      u = '';
    }
  }
  const normalized = normalizeUrl(u);
  if (t === u || t === normalized) t = '';
  return { url: normalized, text: t, title: String(title ?? '').trim() };
}

export function detectType(url) {
  if (!url) return 'notitie';
  let host;
  try {
    host = new URL(url).hostname.replace(/^(www|m|mobile)\./, '');
  } catch {
    return 'notitie';
  }
  if (/^(x|twitter|fxtwitter|vxtwitter)\.com$/.test(host)) return 'tweet';
  if (/instagram\.com$/.test(host)) return 'instagram';
  if (/linkedin\.com$|lnkd\.in$/.test(host)) return 'linkedin';
  if (/youtube\.com$|youtu\.be$/.test(host)) return 'youtube';
  if (/tiktok\.com$/.test(host)) return 'tiktok';
  if (/threads\.(net|com)$/.test(host)) return 'threads';
  if (/\.pdf$/i.test(new URL(url).pathname)) return 'pdf';
  return 'artikel';
}

// One key per post, whatever the link looks like: the same reel shared twice
// with different tracking codes, or x.com and twitter.com, is the same item.
export function linkKey(url) {
  const u = normalizeUrl(url);
  if (!u) return '';
  let m;
  if ((m = u.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/))) return `ig:${m[1]}`;
  if ((m = u.match(/(?:x|twitter|fxtwitter|vxtwitter)\.com\/[^/]+\/status(?:es)?\/(\d+)/))) return `x:${m[1]}`;
  if ((m = youtubeId(u))) return `yt:${m}`;
  if ((m = u.match(/tiktok\.com\/@[^/]+\/(?:video|photo)\/(\d+)/))) return `tt:${m[1]}`;
  if ((m = u.match(/threads\.(?:com|net)\/@[^/]+\/post\/([A-Za-z0-9_-]+)/))) return `th:${m[1]}`;
  if ((m = u.match(/linkedin\.com\/.*?(?:activity|ugcPost)[-:](\d{15,25})/))) return `li:${m[1]}`;
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^(www|m|mobile)\./, '')}${x.pathname.replace(/\/+$/, '')}${x.search}`.toLowerCase();
  } catch {
    return u;
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function cleanText(md) {
  return String(md || '')
    .replace(/^#{1,2} /gm, '### ') // keep the note's own ## sections unambiguous
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
}

export function youtubeId(url) {
  return String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/))([A-Za-z0-9_-]{11})/)?.[1] || '';
}

// Only plain https images end up in notes and <img> tags.
export function safeImage(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

const SOCIAL_TYPES = ['instagram', 'threads', 'linkedin', 'tiktok'];

async function getJson(fetchImpl, url, headers = {}) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// fxtwitter: public, keyless API for posts on X.
async function tweet(fetchImpl, url) {
  const id = url.match(/status(?:es)?\/(\d+)/)?.[1];
  if (!id) return {};
  const { tweet: t } = await getJson(fetchImpl, `https://api.fxtwitter.com/status/${id}`);
  if (!t) return {};
  const parts = [t.article?.title ? `**${t.article.title}**` : '', t.text || ''];
  if (t.quote?.text) parts.push(`> Citeert @${t.quote.author?.screen_name || ''}: ${t.quote.text}`);
  const media = t.media || {};
  return {
    auteur: t.author ? `${t.author.name} (@${t.author.screen_name})` : '',
    tekst: cleanText(parts.filter(Boolean).join('\n\n')),
    gepubliceerd: t.created_at || '',
    afbeelding: media.photos?.[0]?.url || media.videos?.[0]?.thumbnail_url || media.mosaic?.formats?.jpeg || t.article?.cover_media?.media_info?.original_img_url || '',
    avatar: t.author?.avatar_url || '',
  };
}

// noembed: keyless oEmbed proxy (YouTube, TikTok, Vimeo and more).
async function oembed(fetchImpl, url) {
  const o = await getJson(fetchImpl, `https://noembed.com/embed?url=${encodeURIComponent(url)}`);
  if (o.error) return {};
  return { titel: o.title || '', auteur: o.author_name || '', afbeelding: o.thumbnail_url || '' };
}

// YouTube thumbnails need no request: the URL follows from the video id.
async function youtube(fetchImpl, url) {
  const id = youtubeId(url);
  const o = await oembed(fetchImpl, url).catch(() => ({}));
  return { ...o, afbeelding: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : o.afbeelding || '' };
}

// microlink: keyless preview API (50 requests a day): the page's own preview
// image, title and description, also for many social posts.
async function microlink(fetchImpl, url) {
  const j = await getJson(fetchImpl, `https://api.microlink.io/?url=${encodeURIComponent(url)}`);
  if (j.status !== 'success' || !j.data) return {};
  const d = j.data;
  return {
    titel: d.title || '',
    beschrijving: d.description || '',
    auteur: typeof d.author === 'string' ? d.author : '',
    afbeelding: d.image?.url || '',
    gepubliceerd: d.date || '',
  };
}

// Jina Reader: keyless page-to-markdown service (rate limited, free).
async function reader(fetchImpl, url) {
  const j = await getJson(fetchImpl, `https://r.jina.ai/${url}`);
  const d = j.data || {};
  return { titel: d.title || '', beschrijving: d.description || '', tekst: cleanText(d.content || '') };
}

// Instagram shows a logged-out visitor no caption, but its embed page does.
async function instagram(fetchImpl, url) {
  const code = url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
  if (!code) return {};
  const html = await readHtml(fetchImpl, `https://www.instagram.com/p/${code}/embed/captioned/`);
  const post = postInHtml(html, code);
  const shown = captionInHtml(html);
  const media = post?.media?.[0];
  return {
    tekst: cleanText(post?.tekst || shown.tekst),
    auteur: post ? [post.naam, post.auteur && `(${post.auteur})`].filter(Boolean).join(' ') : shown.auteur,
    afbeelding: media?.thumb || media?.url || photosInHtml(html)[0] || posterInHtml(html),
    avatar: post?.avatar || '',
    gepubliceerd: post?.gepubliceerd || '',
  };
}

// Threads: the post is in the page as data; otherwise the readable text of
// the page, without the menus around it.
async function threads(fetchImpl, url) {
  const html = await readHtml(fetchImpl, url);
  const code = html.match(/threads\.(?:com|net)\/@[A-Za-z0-9._]+\/post\/([A-Za-z0-9_-]+)/)?.[1] || url.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] || '';
  const post = postInHtml(html, code);
  if (!post?.tekst) return {};
  const media = post.media?.[0];
  return {
    tekst: cleanText(post.tekst),
    // Read from the page's data: this is the post, not the page around it.
    gelezen: true,
    auteur: [post.naam, post.auteur && `(${post.auteur})`].filter(Boolean).join(' '),
    afbeelding: media?.thumb || media?.url || '',
    avatar: post.avatar,
    gepubliceerd: post.gepubliceerd,
  };
}

// tikwm: keyless API with the caption, the maker and the cover of a TikTok.
async function tiktok(fetchImpl, url) {
  const j = await getJson(fetchImpl, `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
  const d = j?.data;
  if (!d || (j.code !== undefined && j.code !== 0)) return {};
  const abs = (u) => (/^\//.test(u || '') ? `https://www.tikwm.com${u}` : u || '');
  return {
    tekst: cleanText(d.title || ''),
    auteur: d.author ? [d.author.nickname, d.author.unique_id && `(@${d.author.unique_id})`].filter(Boolean).join(' ') : '',
    afbeelding: abs(d.cover || d.origin_cover),
    avatar: abs(d.author?.avatar),
    gepubliceerd: d.create_time ? new Date(d.create_time * 1000).toISOString() : '',
  };
}

// What the services return for a social post is often the page around it.
// Keep the post: its text, its maker, and a title that says something.
// strict: only text in which a post was recognised counts (for text that is
// already in a note, which holds more than the page).
export function refineSocial(type, out, { strict = false } = {}) {
  const r = { ...out };
  if (type === 'linkedin' && r.tekst) {
    const c = cleanLinkedIn(r.tekst);
    if (c) {
      r.tekst = cleanText(c.transcript ? `${c.tekst}\n\n**Transcript**\n\n${c.transcript}` : c.tekst);
      r.auteur = c.auteur || r.auteur;
    } else if (strict || isWall(r.tekst)) delete r.tekst;
  }
  if (type === 'threads' && r.tekst) {
    // A Threads page is menus all around: without a recognised post, nothing is.
    const c = r.gelezen ? { tekst: r.tekst } : cleanThreads(r.tekst);
    if (c) {
      r.tekst = cleanText(c.tekst);
      r.auteur = r.auteur || c.auteur;
      if (c.post) r.post = c.post;
    } else delete r.tekst;
  }
  delete r.gelezen;
  if (type === 'instagram' && !r.tekst && r.beschrijving) {
    const c = captionFromDescription(r.beschrijving);
    if (c.tekst) r.tekst = cleanText(c.tekst);
  }
  if (/^(view profile|log in|sign in|join now)$/i.test(String(r.auteur || '').trim())) delete r.auteur;
  for (const k of ['beschrijving', 'tekst']) if (r[k] && isWall(r[k])) delete r[k];
  const maker = makerFromTitle(r.titel);
  if (maker) {
    if (!r.auteur || !/@/.test(r.auteur)) r.auteur = `${maker.naam} (@${maker.handle})`;
    r.soort = maker.soort;
  }
  if (weakTitle(r.titel)) delete r.titel;
  return r;
}

// opts.reader: allow sending the URL to r.jina.ai for the full text of articles.
// opts.previews: allow microlink.io for preview images and page details.
export async function fetchDetails(capture, { fetchImpl = globalThis.fetch?.bind(globalThis), reader: useReader = true, previews = true } = {}) {
  const { url, type } = capture;
  if (!url || !fetchImpl) return {};
  const tries = [];
  if (type === 'tweet') tries.push(tweet);
  if (type === 'youtube') tries.push(youtube);
  if (type === 'tiktok') tries.push(tiktok, oembed);
  if (useReader && type === 'instagram') tries.push(instagram);
  if (useReader && type === 'threads') tries.push(threads);
  if (previews && !['tweet', 'youtube'].includes(type)) tries.push(microlink);
  if (useReader && ['artikel', 'linkedin', 'pdf', 'threads', 'youtube'].includes(type)) tries.push(reader);
  if (!tries.includes(oembed) && type !== 'youtube') tries.push(oembed);
  let out = {};
  for (const fn of tries) {
    try {
      const r = SOCIAL_TYPES.includes(type) ? refineSocial(type, await fn(fetchImpl, url)) : await fn(fetchImpl, url);
      // A text that was cleaned once is the post; cleaning it again would lose it.
      if (r.tekst && type === 'threads') r.gelezen = true;
      for (const [k, v] of Object.entries(r)) if (v && !out[k]) out[k] = v;
      if (out.tekst && out.afbeelding && (out.titel || SOCIAL_TYPES.includes(type))) break;
    } catch {
      // next source
    }
  }
  if (SOCIAL_TYPES.includes(type)) out = type === 'linkedin' ? { ...refineSocial(type, { ...out, tekst: undefined }), tekst: out.tekst } : refineSocial(type, out);
  if (!out.tekst) delete out.tekst;
  out.afbeelding = safeImage(out.afbeelding);
  out.avatar = safeImage(out.avatar);
  for (const k of ['afbeelding', 'avatar']) if (!out[k]) delete out[k];
  return out;
}

export function makeCapture(input) {
  const { url, text, title } = parseInput(input);
  return { url, gedeeld: text, titelGedeeld: title, type: detectType(url), bron: hostOf(url) };
}
