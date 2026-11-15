// Ordering without AI. Three signals pick a folder:
// 1. keyword rules from _systeem/regels.md (works from day one),
// 2. a naive Bayes model of the words in each folder, and
// 3. the maker: someone whose posts you keep filing in one folder.
// The model only learns from placements that are certain: what you moved
// yourself and what a rule placed. It never learns from its own guesses, so
// one wrong guess cannot grow into a habit.
// Tags come from the most distinctive words, the summary from the opening sentences.
import { tokenize, PAGE_WORDS, FILLER } from './words.js';
import { buildIndex, vectorOf, nearest, makerKey } from './similar.js';

export { tokenize };

export const LEARNED = 'geleerd van jouw mappen';
export const UNSURE = 'nog niet zeker';
export const BY_HAND = 'handmatig';
const OWN_GUESS = new Set([LEARNED, UNSURE]);
// A placement the model may learn from.
export const trusted = (it) => Boolean(it.map && it.map !== 'Inbox' && it.verrijkt && !OWN_GUESS.has(it.ordening));

const SOCIAL_HOSTS = /(^|\.)(instagram\.com|threads\.(com|net)|linkedin\.com|lnkd\.in|x\.com|twitter\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com)$/;

// Words that describe an item: title counts double, then summary, text and
// tags. A site counts as a word too, but not a platform: that a post is on
// Instagram says nothing about its topic. Platform and filler words are out.
export function itemTokens(item) {
  const keep = (t) => !PAGE_WORDS.has(t) && !FILLER.has(t);
  const tokens = [
    ...tokenize(item.titel), ...tokenize(item.titel),
    ...tokenize(item.samenvatting),
    ...tokenize(String(item.tekst || '').slice(0, 2000)),
    ...tokenize(item.gedeeld),
  ].filter(keep);
  for (const t of item.tags || []) if (keep(String(t).toLowerCase())) tokens.push(`tag:${t}`);
  if (item.bron && !SOCIAL_HOSTS.test(item.bron)) tokens.push(`bron:${item.bron}`);
  return tokens;
}

export function trainModel(items) {
  const folders = new Map();
  const vocab = new Set();
  const makers = new Map();
  const sure = items.filter(trusted);
  for (const it of sure) {
    const f = folders.get(it.map) || { docs: 0, total: 0, counts: new Map() };
    f.docs += 1;
    for (const t of itemTokens(it)) {
      f.counts.set(t, (f.counts.get(t) || 0) + 1);
      f.total += 1;
      vocab.add(t);
    }
    folders.set(it.map, f);
    const maker = makerKey(it.auteur);
    if (maker) {
      if (!makers.has(maker)) makers.set(maker, new Map());
      makers.get(maker).set(it.map, (makers.get(maker).get(it.map) || 0) + 1);
    }
  }
  const docs = [...folders.values()].reduce((sum, f) => sum + f.docs, 0);
  const index = buildIndex(sure.map((it, n) => ({ ...it, id: it.id ?? `#${n}` })));
  return { folders, vocab: vocab.size, docs, makers, index };
}

// Folder probabilities, best first. Every folder starts equal, so a full
// folder does not pull everything in, and a long text counts for less than
// its length, so the answer is not more certain than the evidence.
export function predict(model, tokens) {
  if (model.folders.size < 2 || !tokens.length) return [];
  const known = tokens.filter((t) => [...model.folders.values()].some((f) => f.counts.has(t)));
  if (!known.length) return [];
  const damp = Math.sqrt(known.length);
  const scores = [];
  for (const [name, f] of model.folders) {
    let lp = 0;
    for (const t of known) lp += Math.log(((f.counts.get(t) || 0) + 1) / (f.total + model.vocab + 1));
    scores.push([name, lp / damp]);
  }
  const max = Math.max(...scores.map((x) => x[1]));
  const exp = scores.map(([n, lp]) => [n, Math.exp(lp - max)]);
  const sum = exp.reduce((t, e) => t + e[1], 0);
  return exp.map(([folder, e]) => ({ folder, p: e / sum })).sort((a, b) => b.p - a.p);
}

// "Mapnaam: woord, nog een woord" lines; headings and comments are ignored.
export function parseRules(text) {
  const rules = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*[-*]?\s*([^:#>`][^:]{0,58}):\s*(.+)$/);
    if (!m) continue;
    const words = m[2].split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.length) rules.push({ folder: m[1].trim(), words });
  }
  return rules;
}

// A "Leren:" line in regels.md is about learning, not about a folder.
export const DOEL_RULE = /^(?:leren|om van te leren)$/i;

// Hits per folder. A word starting with @ is a maker: "@kallaway" matches
// everything by that maker.
function ruleScores(rules, item) {
  const site = item.bron && !SOCIAL_HOSTS.test(item.bron) ? item.bron : '';
  const hay = ` ${[item.titel, item.titel, item.samenvatting, item.gedeeld, String(item.tekst || '').slice(0, 3000), site]
    .filter(Boolean).join(' ').toLowerCase()} `;
  const maker = ` ${String(item.auteur || '').toLowerCase()} `;
  const scores = new Map();
  for (const r of rules) {
    let hits = 0;
    for (const w of r.words) {
      const word = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (w.startsWith('@')) {
        if (new RegExp(`${word}(?=[^a-z0-9._]|$)`).test(maker)) hits += 3;
        continue;
      }
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${word}(?=[^\\p{L}\\p{N}]|$)`, 'gu');
      hits += (hay.match(re) || []).length;
    }
    if (hits) scores.set(r.folder, (scores.get(r.folder) || 0) + hits);
  }
  return [...scores].sort((a, b) => b[1] - a[1]);
}

// The folder most of a maker's posts are in, when that is clear.
function makerFolder(model, item) {
  const counts = model.makers?.get(makerKey(item.auteur));
  if (!counts) return null;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const [folder, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return total >= 2 && n / total >= 0.75 ? { folder, p: n / total } : null;
}

// The folder of an item about the very same thing, when there is one.
function twinFolder(model, item) {
  if (!model.index?.n) return null;
  const [best] = nearest(model.index, vectorOf(item, model.index), { k: 1, min: 0.5 });
  return best ? { folder: best.item.map, p: best.sim } : null;
}

// Returns { map, zekerheid (0..1), reden, kandidaten }. Unsure items stay in
// Inbox, where your own sorting teaches the model. kandidaten are the folders
// to offer for one-tap filing, best first.
export function classify(item, model, rules) {
  const bayes = predict(model, itemTokens(item));
  const top = bayes[0];
  const trained = top && (model.folders.get(top.folder)?.docs || 0) >= 3;
  const hits = ruleScores(rules.filter((r) => !DOEL_RULE.test(r.folder)), item);
  const maker = makerFolder(model, item);
  const twin = twinFolder(model, item);
  const kandidaten = [...new Set([maker?.folder, twin?.folder, ...hits.map((h) => h[0]), ...bayes.filter((b) => b.p >= 0.15).map((b) => b.folder)].filter(Boolean))].slice(0, 4);
  const pick = (map, zekerheid, reden) => ({ map, zekerheid, reden, kandidaten: kandidaten.filter((k) => k !== map) });
  if (twin) return pick(twin.folder, twin.p, LEARNED);
  if (trained && top.p >= 0.7) return pick(top.folder, top.p, LEARNED);
  if (hits.length && (hits.length === 1 || hits[0][1] > hits[1][1])) return pick(hits[0][0], Math.min(0.9, 0.5 + 0.1 * hits[0][1]), 'trefwoordregel');
  if (maker) return pick(maker.folder, maker.p, LEARNED);
  if (trained && top.p >= 0.5) return pick(top.folder, top.p, LEARNED);
  return { map: 'Inbox', zekerheid: 0, reden: UNSURE, kandidaten };
}

const junkTag = (t) => PAGE_WORDS.has(t) || /^[a-z]*\d[a-z\d]{9,}$/.test(t) || /^(scontent|cdn|www|http|https|com|net)\b/.test(t) || t.length > 24 || t.includes("'");

// Tags say what an item is about. The post's own #hashtags when it has them
// (they drive the bundles), otherwise its most distinctive words: names
// first, and never the maker's own name, the platform or filler.
export function suggestTags(item, corpus, max = 4) {
  const hashtags = [...new Set((String(`${item.gedeeld || ''} ${item.tekst || ''}`).match(/(?:^|[\s(>])#[\p{L}\p{N}_-]{2,30}/gu) || [])
    .map((h) => h.replace(/^[^#]*#/, '').toLowerCase().replace(/[-_]+$/, '')).filter((t) => !junkTag(t) && !/^\d+$/.test(t)))];
  if (hashtags.length) return hashtags.slice(0, 8);
  const own = new Set(tokenize(String(item.auteur || '').replace(/[@()._]/g, ' ')));
  const text = `${item.titel || ''}\n${String(item.tekst || item.gedeeld || '').slice(0, 3000)}`;
  // A word written with a capital in the middle of a sentence is a name.
  const named = new Set((text.match(/(?<=[\p{L}\p{N},;:] )[A-Z][\p{L}\d]{2,}/gu) || []).map((w) => w.toLowerCase()));
  const tf = new Map();
  for (const t of [...tokenize(item.titel), ...tokenize(item.titel), ...tokenize(String(item.tekst || item.gedeeld || '').slice(0, 3000))]) {
    if (junkTag(t) || FILLER.has(t) || own.has(t)) continue;
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  const n = corpus.length + 1;
  const df = new Map();
  for (const it of corpus) for (const t of new Set(tokenize(`${it.titel} ${it.samenvatting || ''}`))) df.set(t, (df.get(t) || 0) + 1);
  const ranked = [...tf].map(([t, f]) => [t, f * (Math.log(n / (1 + (df.get(t) || 0)) + 1)) * (named.has(t) ? 3 : 1)]).sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, max).map(([t]) => t.replace(/\s+/g, '-'));
}

// Opening sentences, skipping lines that look like navigation or markup.
export function summarize(text, max = 280) {
  const lines = String(text || '').split('\n').map((l) => l.trim())
    .filter((l) => l.length > 40 && !/^(#|!\[|\[|>|\||-{3})/.test(l) && !/cookie|javascript|log in|sign in|inloggen/i.test(l));
  const sentences = lines.join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').match(/[^.!?]+[.!?]+/g) || [];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
  }
  return (out || lines.join(' ').slice(0, max)).trim();
}

// Words about the craft of making content. A "Leren:" line in regels.md
// replaces them.
export const LEREN_WOORDEN = ['storytelling', 'copywriting', 'scriptwriting', 'hooks schrijven', 'betere hooks', 'better hooks',
  'retention', 'kijkduur', 'contentstrategie', 'content strategy', 'personal branding', 'video editing', 'schrijftips',
  'writing tips', 'grow your audience', 'go viral'];

// "leren" for an item saved to learn from (what another maker teaches about
// making content), "posten" for material to post about. A maker you put under
// learning twice goes there from then on (makers: Map or object of
// makerKey -> { leren, posten }, kept by the learner); otherwise the words
// above decide. It never learns from its own guesses.
export function guessDoel(item, { makers = null, rulesText = '' } = {}) {
  const key = makerKey(item.auteur);
  const m = key && (makers instanceof Map ? makers.get(key) : makers?.[key]);
  if (m && (m.leren || 0) >= 2 && (m.leren || 0) > (m.posten || 0)) return 'leren';
  if (m && (m.posten || 0) >= 2 && (m.posten || 0) > (m.leren || 0)) return 'posten';
  const own = parseRules(rulesText).find((r) => DOEL_RULE.test(r.folder));
  return ruleScores([{ folder: 'leren', words: own?.words || LEREN_WOORDEN }], item).length ? 'leren' : 'posten';
}
