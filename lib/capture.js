// Turns a shared link or loose text into a capture, and fetches what free,
// keyless public services can tell about it. Everything is optional: when a
// service is down or blocks the request, the text from the share sheet is used.

const TRACKING = /^(utm_|fbclid$|gclid$|igsh$|igshid$|si$|mc_cid$|mc_eid$|ref_src$|ref_url$|_hsenc$|_hsmi$)/;
const MAX_TEXT = 20000;

export function normalizeUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return '';
    for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
    if (/(^|\.)(x|twitter)\.com$/.test(u.hostname)) {
      u.searchParams.delete('s');
      u.searchParams.delete('t');
    }
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

// opts.reader: allow sending the URL to r.jina.ai for the full text of articles.
// opts.previews: allow microlink.io for preview images and page details.
export async function fetchDetails(capture, { fetchImpl = globalThis.fetch?.bind(globalThis), reader: useReader = true, previews = true } = {}) {
  const { url, type } = capture;
  if (!url || !fetchImpl) return {};
  const tries = [];
  if (type === 'tweet') tries.push(tweet);
  if (type === 'youtube') tries.push(youtube);
  if (type === 'tiktok') tries.push(oembed);
  if (previews && !['tweet', 'youtube'].includes(type)) tries.push(microlink);
  if (useReader && ['artikel', 'linkedin', 'pdf', 'threads', 'youtube'].includes(type)) tries.push(reader);
  if (!tries.includes(oembed) && type !== 'youtube') tries.push(oembed);
  const out = {};
  for (const fn of tries) {
    try {
      const r = await fn(fetchImpl, url);
      for (const [k, v] of Object.entries(r)) if (v && !out[k]) out[k] = v;
      if (out.tekst && out.titel && out.afbeelding) break;
    } catch {
      // next source
    }
  }
  out.afbeelding = safeImage(out.afbeelding);
  out.avatar = safeImage(out.avatar);
  for (const k of ['afbeelding', 'avatar']) if (!out[k]) delete out[k];
  return out;
}

export function makeCapture(input) {
  const { url, text, title } = parseInput(input);
  return { url, gedeeld: text, titelGedeeld: title, type: detectType(url), bron: hostOf(url) };
}
