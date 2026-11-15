// Which items are about the same thing, without AI: every item becomes a
// vector of its distinctive words (tf-idf) and two items are compared by the
// angle between them. Used for picking a folder, finding doubles, stacking
// items on one story and matching your own post to what you made.
import { tokenize, PAGE_WORDS, FILLER } from './words.js';
import { isWall } from './clean.js';

// A summary that is a login wall or page furniture says nothing about the
// item: two posts behind the same wall are not the same story.
const realSummary = (t) => (!t || isWall(t) || /^\s*(#{1,6}\s|\[|!\[|>)/.test(t) || /\]\(https?:\/\//.test(t) ? '' : String(t));

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
  const out = [...title, ...title, ...tokenize(realSummary(item.samenvatting)).filter(keep), ...tokenize(String(item.tekst || '').slice(0, 1500)).filter(keep)];
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

// Capitalised words and names: what a story is called ("Claude Duet",
// "Gemini 4 Hydrogen"). Words around a name that say nothing ("Introducing",
// "The", "Today") are cut off.
const NO_NAME = /^(The|This|That|These|Those|Here|How|Why|What|When|Who|Today|Now|And|But|For|With|Just|New|Its|It|You|Your|We|Our|They|In|On|At|To|From|By|As|If|So|Het|De|Een|Dit|Dat|Deze|Hoe|Waarom|Wat|Wie|Nu|Vandaag|En|Maar|Voor|Met|Zo|Je|Jij|Wij|Ik|Op|Van|Bij|Als)$/;
function namesIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/(?:^|[\s("'“‘-])((?:[A-Z][\p{L}\d]*[a-z\d][\p{L}\d]*|[A-Z]{2,}\d*)(?:[ -](?:[A-Z][\p{L}\d]+|\d+(?:\.\d+)?))*)/gu)) {
    const parts = m[1].trim().split(' ');
    const skip = (w) => NO_NAME.test(w) || FILLER.has(w.toLowerCase()) || PAGE_WORDS.has(w.toLowerCase());
    while (parts.length && skip(parts[0])) parts.shift();
    while (parts.length && skip(parts[parts.length - 1])) parts.pop();
    const name = parts.join(' ');
    if (name.length >= 3 && !/^\d/.test(name)) out.push(name);
  }
  return out;
}

// Names everybody in this field uses: on their own they tie nothing together.
const EVERYWHERE = new Set(['google', 'meta', 'openai', 'anthropic', 'claude', 'chatgpt', 'gemini', 'microsoft', 'apple', 'nvidia', 'amazon', 'tiktok', 'linkedin', 'instagram', 'youtube', 'twitter', 'threads', 'grok', 'deepmind', 'github', 'copilot', 'llama', 'mistral']);

// A title without the site behind a bar ("... | TechCrunch") and without a
// series label in front of a colon ("Vibe Check: ...", "BREAKING: ...").
const bareTitle = (t) => String(t || '').replace(/\s+[|–—-]\s+[^|–—-]{2,30}$/, '').replace(/^[A-Z][\p{L}\d' -]{1,28}:\s/u, '');
// A run of capitals is shouting, not a name.
const shouted = (name) => name.includes(' ') && name === name.toUpperCase();

// The names that can tie items to one story: Map(key -> { naam, titel }).
// titel says whether the item has the name in its title. The words of a longer
// name count too, so "Duet" finds "Claude Duet". The item's own site and maker
// are no story.
function storyKeys(item) {
  const own = new Set([...String(item.bron || '').toLowerCase().split('.'), ...tokenize(String(item.auteur || '').replace(/[@()._]/g, ' '))]);
  const keys = new Map();
  const take = (text, titel) => {
    for (const name of namesIn(text)) {
      if (shouted(name)) continue;
      const low = name.toLowerCase();
      const put = (k, naam) => {
        if (own.has(k) || EVERYWHERE.has(k) || FILLER.has(k) || PAGE_WORDS.has(k)) return;
        const prev = keys.get(k);
        if (!prev || (titel && !prev.titel)) keys.set(k, { naam, titel: titel || Boolean(prev?.titel) });
      };
      if (name.includes(' ')) put(low, name);
      const parts = name.split(/[ -]/);
      parts.forEach((w) => {
        if (w.length >= 4 && !/^\d/.test(w)) put(w.toLowerCase(), w);
      });
    }
  };
  take(bareTitle(item.titel), true);
  take(realSummary(item.samenvatting).replace(/(^|[.!?]\s+)[A-Z][\p{L}\d' -]{1,28}:\s/gu, '$1'), false);
  return keys;
}
const names = (item) => namesIn(bareTitle(item.titel)).filter((n) => !shouted(n));

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

// Groups of items on the same story. Two items join when their words are
// close enough, or when they share a name few items have ("Claude Duet") and
// are not about something else altogether, and were saved within `days` of
// each other. Groups grow by their closest pair and stay small, so one loose
// link does not chain a whole feed together.
// Returns [{ ids, naam }], only groups of two or more.
export function stories(items, { index = buildIndex(items), threshold = 0.42, days = 21, max = 7 } = {}) {
  const ids = items.map((i) => i.id).filter((id) => index.docs.has(id));
  const when = new Map(items.map((i) => [i.id, Date.parse(i.opgeslagen) || 0]));
  const near = (a, b) => Math.abs(when.get(a) - when.get(b)) <= days * 864e5;
  const pairs = new Map();
  const add = (a, b, score) => {
    const key = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    if (score > (pairs.get(key) || 0)) pairs.set(key, score);
  };
  // One word in common is no story: two items must share at least two.
  const shared = (a, b) => {
    let n = 0;
    for (const w of a.keys()) if (b.has(w)) n += 1;
    return n;
  };
  for (const id of ids) {
    const vec = index.docs.get(id).vec;
    for (const n of nearest(index, vec, { k: 8, min: threshold, exclude: id })) {
      if (near(id, n.id) && shared(vec, index.docs.get(n.id).vec) >= 2) add(id, n.id, n.sim);
    }
  }
  // A name is telling when few items have it: at least two, at most a handful.
  // A name of several words must be in the title of one of the two items, a
  // single word in both: a passing mention is no story.
  const byName = new Map();
  const keysOf = new Map();
  for (const it of items) {
    if (!index.docs.has(it.id)) continue;
    const keys = storyKeys(it);
    keysOf.set(it.id, keys);
    for (const k of keys.keys()) {
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(it.id);
    }
  }
  const few = Math.max(6, Math.ceil(ids.length * 0.06));
  const linkedBy = new Map();
  for (const [k, list] of byName) {
    if (list.length < 2 || list.length > few) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        if (!near(a, b)) continue;
        const [ta, tb] = [keysOf.get(a).get(k).titel, keysOf.get(b).get(k).titel];
        if (k.includes(' ') ? !(ta || tb) : !(ta && tb)) continue;
        const sim = cosine(index.docs.get(a).vec, index.docs.get(b).vec);
        if (sim < 0.1) continue;
        add(a, b, sim + 0.32);
        linkedBy.set(k, (linkedBy.get(k) || 0) + 1);
      }
    }
  }
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const size = new Map(ids.map((id) => [id, 1]));
  const sorted = [...pairs].filter(([, score]) => score >= threshold).sort((a, b) => b[1] - a[1]);
  for (const [key, score] of sorted) {
    const [a, b] = key.split('\n');
    const [ra, rb] = [find(a), find(b)];
    if (ra === rb) continue;
    const total = size.get(ra) + size.get(rb);
    // Bigger groups need a stronger link to grow further.
    if (total > max || (total > 3 && score < threshold + 0.035)) continue;
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
  // A group is called after the name that ties it together, when there is one.
  const nameOf = (g) => {
    const members = g.map((id) => byId.get(id));
    const titles = new Set(members.map((m) => String(m.titel || '').trim().toLowerCase()));
    if (titles.size === 1) return members[0].titel.slice(0, 60);
    const shared = sharedName(members);
    if (shared && !EVERYWHERE.has(shared.toLowerCase())) return shared;
    // Otherwise the name most of their titles have.
    const count = new Map();
    for (const id of g) for (const [k, v] of keysOf.get(id) || []) if (v.titel) count.set(k, { n: (count.get(k)?.n || 0) + 1, naam: v.naam });
    const tie = [...count].filter(([, v]) => v.n >= Math.max(2, Math.ceil(g.length * 0.6)))
      .sort((a, b) => b[1].n - a[1].n || b[0].includes(' ') - a[0].includes(' ') || b[0].length - a[0].length)[0];
    return tie ? tie[1].naam : '';
  };
  // Without a name that ties a group together it has none: its first card
  // says enough. Two groups never carry the same name.
  const used = new Set();
  return [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length).map((g) => {
    const naam = nameOf(g);
    const unique = naam && !used.has(naam.toLowerCase()) ? naam : '';
    if (unique) used.add(unique.toLowerCase());
    return { ids: g, naam: unique };
  });
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
