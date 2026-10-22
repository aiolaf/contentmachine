// Daily review: every day a few saved items come back, with one of their
// highlights, so good material does not sink under new links. Spaced
// repetition without AI: each time an item is shown, the wait until it
// returns doubles (7, 14, 28 days and so on). The state is saved in
// _systeem/herhaling.json, so the iPhone and the Mac show the same mix.
export const PER_DAG = 5;
const START = 7;
const MAX = 180;
const DAY = 864e5;

export function emptyReview() {
  return { dag: '', ids: [], items: {} };
}

export function localDay(now = new Date()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
}

// Same day, same order: a small seeded random generator (mulberry32).
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Highlights and a high rank bring an item back first; brand-new items are
// still in the feed, so they wait a couple of days.
function priority(item, entry, now) {
  const age = (now - new Date(item.opgeslagen).getTime()) / DAY;
  let p = item.rank ?? item.score ?? 50;
  if (item.markeringen) p += 20;
  if (item.ster) p += 5;
  if (!entry) p += 5;
  if (item.status === 'gebruikt') p -= 10;
  if (!(age >= 2)) p -= 40;
  return p;
}

// Returns the mix for today. A new day picks a new mix and moves every
// picked item to its next date; the same day returns the saved mix.
export function dailyReview(items, state = emptyReview(), { now = new Date(), size = PER_DAG } = {}) {
  const day = localDay(now);
  const ids = new Set(items.map((i) => i.id));
  const current = { ...emptyReview(), ...state, items: { ...(state?.items || {}) } };
  if (current.dag === day) return { state: current, ids: current.ids.filter((id) => ids.has(id)), changed: false };

  const t = new Date(now).getTime();
  const rnd = seeded(day);
  const picked = items
    .filter((i) => i.status !== 'archief' && !i.invalid)
    .filter((i) => {
      const e = current.items[i.id];
      return !e || (!e.stop && e.volgende <= day);
    })
    .map((i) => ({ id: i.id, w: priority(i, current.items[i.id], t) + rnd() * 25 }))
    .sort((a, b) => b.w - a.w)
    .slice(0, size)
    .map((x) => x.id);
  const kept = {};
  for (const [id, e] of Object.entries(current.items)) if (ids.has(id)) kept[id] = e;
  // Nothing to show yet: try again later today instead of fixing an empty mix.
  if (!picked.length) return { state: { ...current, items: kept }, ids: [], changed: false };

  const next = { dag: day, ids: picked, items: kept };
  for (const id of picked) {
    const prev = next.items[id];
    const interval = prev ? Math.min(MAX, prev.interval * 2) : START;
    next.items[id] = { interval, volgende: addDays(day, interval), keer: (prev?.keer || 0) + 1 };
  }
  return { state: next, ids: picked, changed: true };
}

// "Niet meer tonen": the item stays in the vault but never returns here.
export function stopReview(state, id) {
  return { ...state, items: { ...state.items, [id]: { ...(state.items[id] || { interval: START }), stop: true } } };
}

export function daysUntil(state, id, now = new Date()) {
  const e = state.items[id];
  if (!e || e.stop) return null;
  const [y, m, d] = e.volgende.split('-').map(Number);
  const [ty, tm, td] = localDay(now).split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / DAY);
}

// One highlight per item per day, a different one each time it comes back.
export function highlightOfDay(list, day, id) {
  if (!list.length) return null;
  return list[Math.floor(seeded(`${day}:${id}`)() * list.length)];
}
