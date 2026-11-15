// The numbers of a published post, where a free public service gives them:
// X through fxtwitter and TikTok through tikwm. Other platforms show their
// numbers only to you, so those you type in.
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : undefined);

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Which platforms can be asked.
export function statsSource(link) {
  const u = String(link || '');
  if (/(?:x|twitter)\.com\/[^/]+\/status(?:es)?\/\d+/.test(u)) return 'x';
  if (/tiktok\.com\/@[^/]+\/video\/\d+|vm\.tiktok\.com\/|tiktok\.com\/t\//.test(u)) return 'tiktok';
  return '';
}

// Returns { weergaven, likes, reacties, gedeeld, bewaard, tekst, auteur } with
// only the numbers the service knows, or null when the platform cannot be asked.
export async function fetchStats(link, { fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  const source = statsSource(link);
  if (source === 'x') {
    const id = String(link).match(/status(?:es)?\/(\d+)/)[1];
    const { tweet: t } = await getJson(fetchImpl, `https://api.fxtwitter.com/status/${id}`);
    if (!t) throw new Error('Deze post op X is niet gevonden.');
    return clean({ weergaven: num(t.views), likes: num(t.likes), reacties: num(t.replies), gedeeld: num((t.retweets || 0) + (t.quotes || 0)), bewaard: num(t.bookmarks), tekst: t.text || '', auteur: t.author?.screen_name || '', gepost: t.created_at ? new Date(t.created_at).toISOString() : '' });
  }
  if (source === 'tiktok') {
    const j = await getJson(fetchImpl, `https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`);
    const d = j?.data;
    if (!d || (j.code !== undefined && j.code !== 0)) throw new Error('Deze TikTok is niet gevonden.');
    return clean({ weergaven: num(d.play_count), likes: num(d.digg_count), reacties: num(d.comment_count), gedeeld: num(d.share_count), bewaard: num(d.collect_count), tekst: d.title || '', auteur: d.author?.unique_id || '', gepost: d.create_time ? new Date(d.create_time * 1000).toISOString() : '' });
  }
  return null;
}

function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
}
