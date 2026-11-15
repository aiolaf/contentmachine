// Which items are about the same thing, without AI: every item becomes a
// vector of its distinctive words (tf-idf) and two items are compared by the
// angle between them. Used for picking a folder, finding doubles, stacking
// items on one story and matching your own post to what you made.
import { tokenize, PAGE_WORDS, FILLER } from './words.js';

const handleOf = (auteur) => String(auteur || '').match(/@([A-Za-z0-9._]+)/)?.[1]?.toLowerCase() || '';

// One key per maker: the handle when there is one, otherwise the name.
export function makerKey(auteur) {
  return handleOf(auteur) || String(auteur || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// The words that say what an item is about. The title counts double, tags
// too; the maker's own name and platform words are left out.
export function topicWords(item) {
  const own = new Set(tokenize(String(item.auteur || '').replace(/[@()._]/g, ' ')));
  const keep = (t) => !PAGE_WORDS.has(t) && !FILLER.has(t) && !own.has(t) && !/^[a-z]*\d[a-z\d]{9,}$/.test(t);
  const title = tokenize(item.titel).filter(keep);
  const out = [...title, ...title, ...tokenize(item.samenvatting).filter(keep), ...tokenize(String(item.tekst || '').slice(0, 1500)).filter(keep)];
  for (const t of item.tags || []) {
    const tag = String(t).toLowerCase();
    if (keep(tag)) out.push(tag, tag);
  }
  return out;
}

// index: { n, df: Map(word -> docs), docs: Map(id -> { vec: Map(word -> weight), item }), postings: Map(word -> ids) }
export function buildIndex(items) {
  const index = { n: 0, df: new Map(), docs: new Map(), postings: new Map() };
  const counts = [];
  for (const item of items) {
    const tf = new Map();
    for (const w of topicWords(item)) tf.set(w, (tf.get(w) || 0) + 1);
    if (!tf.size) continue;
    counts.push([item, tf]);
    for (const w of tf.keys()) index.df.set(w, (index.df.get(w) || 0) + 1);
  }
  index.n = counts.length;
  for (const [item, tf] of counts) {
    const vec = weigh(tf, index);
    index.docs.set(item.id, { vec, item });
    for (const w of vec.keys()) {
      if (!index.postings.has(w)) index.postings.set(w, []);
      index.postings.get(w).push(item.id);
    }
  }
  return index;
}

// tf-idf, length 1. A word in every item weighs almost nothing.
function weigh(tf, index) {
  const vec = new Map();
  let sum = 0;
  for (const [w, f] of tf) {
    const idf = Math.log((index.n + 1) / ((index.df.get(w) || 0) + 1)) + 0.3;
    const x = (1 + Math.log(f)) * idf;
    vec.set(w, x);
    sum += x * x;
  }
  const norm = Math.sqrt(sum) || 1;
  for (const [w, x] of vec) vec.set(w, x / norm);
  return vec;
}

export function vectorOf(item, index) {
  const tf = new Map();
  for (const w of topicWords(item)) tf.set(w, (tf.get(w) || 0) + 1);
  return weigh(tf, index);
}

export function cosine(a, b) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [w, x] of small) {
    const y = big.get(w);
    if (y) dot += x * y;
  }
  return dot;
}

// The items closest to a vector, best first: [{ id, item, sim }].
export function nearest(index, vec, { k = 6, min = 0.2, exclude = null } = {}) {
  const seen = new Set();
  const out = [];
  for (const w of vec.keys()) {
    for (const id of index.postings.get(w) || []) {
      if (seen.has(id) || id === exclude) continue;
      seen.add(id);
      const doc = index.docs.get(id);
      const sim = cosine(vec, doc.vec);
      if (sim >= min) out.push({ id, item: doc.item, sim });
    }
  }
  return out.sort((a, b) => b.sim - a.sim).slice(0, k);
}

// Capitalised words and names in titles: what a story is called.
function names(item) {
  const out = [];
  const title = String(item.titel || '');
  for (const m of title.matchAll(/(?:^|[\s("'“‘-])((?:[A-Z][\p{L}\d]*[a-z\d][\p{L}\d]*|[A-Z]{2,}\d*)(?:[ -](?:[A-Z][\p{L}\d]+|\d+(?:\.\d+)?))*)/gu)) {
    const name = m[1].trim();
    const low = name.toLowerCase();
    if (name.length < 3 || FILLER.has(low) || PAGE_WORDS.has(low) || /^(The|This|That|These|Here|How|Why|What|When|Today|Now|And|But|For|With|Just|New|Het|De|Een|Dit|Dat|Hoe|Waarom|Wat|Nu|Vandaag|En|Maar|Voor|Met|Zo)$/.test(name)) continue;
    out.push(name);
  }
  return out;
}

// The name most items of a group have in their title ("Claude Duet"), or ''.
export function sharedName(items) {
  const count = new Map();
  for (const it of items) for (const n of new Set(names(it).map((x) => x.replace(/^(The|A|An|De|Het|Een) /, '')))) count.set(n, (count.get(n) || 0) + 1);
  const shared = [...count].filter(([, c]) => c >= Math.max(2, Math.ceil(items.length * 0.5)))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  if (!shared.length) return '';
  // "Claude" and "Claude Duet" both shared: the longer one says more.
  const [top] = shared;
  const longer = shared.find(([n, c]) => n !== top[0] && n.includes(top[0]) && c >= top[1] - 1);
  return (longer || top)[0];
}

// A short name for a group of items: the name most of them share, otherwise
// the words they have most in common.
export function groupName(items, index) {
  const name = sharedName(items);
  if (name) return name;
  const weight = new Map();
  for (const it of items) {
    const vec = index.docs.get(it.id)?.vec;
    if (!vec) continue;
    for (const [w, x] of vec) weight.set(w, (weight.get(w) || 0) + x);
  }
  const best = [...weight].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
  return best.join(' en ');
}

// Groups of items on the same story. Two items join when they are close
// enough and were saved within `days` of each other; groups grow by their
// closest pair, so one loose link does not chain a whole feed together.
// Returns [{ ids, naam }], only groups of two or more.
export function stories(items, { index = buildIndex(items), threshold = 0.42, days = 21 } = {}) {
  const ids = items.map((i) => i.id).filter((id) => index.docs.has(id));
  const when = new Map(items.map((i) => [i.id, Date.parse(i.opgeslagen) || 0]));
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const size = new Map(ids.map((id) => [id, 1]));
  const pairs = [];
  for (const id of ids) {
    for (const n of nearest(index, index.docs.get(id).vec, { k: 8, min: threshold, exclude: id })) {
      if (id < n.id && Math.abs(when.get(id) - when.get(n.id)) <= days * 864e5) pairs.push([n.sim, id, n.id]);
    }
  }
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [sim, a, b] of pairs) {
    const [ra, rb] = [find(a), find(b)];
    if (ra === rb) continue;
    // Bigger groups need a stronger link to grow further.
    const total = size.get(ra) + size.get(rb);
    if (total > 2 && sim < threshold + 0.06) continue;
    if (total > 8) continue;
    parent.set(rb, ra);
    size.set(ra, total);
  }
  const groups = new Map();
  for (const id of ids) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(id);
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  return [...groups.values()].filter((g) => g.length > 1)
    .map((g) => ({ ids: g, naam: groupName(g.map((id) => byId.get(id)), index) }));
}

// Text that is nearly the same: a repost, or the same post saved from two
// platforms. Shares of the word pairs both have.
export function sameText(a, b) {
  const shingles = (t) => {
    const w = tokenize(t);
    const s = new Set();
    for (let i = 0; i < w.length - 1; i++) s.add(`${w[i]} ${w[i + 1]}`);
    return s;
  };
  const [x, y] = [shingles(a), shingles(b)];
  if (x.size < 4 || y.size < 4) return 0;
  let both = 0;
  for (const s of x) if (y.has(s)) both += 1;
  return both / Math.min(x.size, y.size);
}
