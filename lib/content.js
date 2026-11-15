// The content archive: every prompt you take to Claude or ChatGPT becomes a
// production. Its sources leave the feed, a note in Concepten/ links them
// together, and _systeem/content.json remembers which topics went into which
// kind of content, for the statistics and for the next prompt.
import { bundleOf } from './bundles.js';
import { fold } from './search.js';
import { KANAAL_VAN, KANALEN } from './platforms.js';
import { sameText, sharedName } from './similar.js';

// One key per topic, so "Claude", "claude" and "#claude" count as the same.
export function topicKey(name) {
  return fold(name).replace(/^#/, '').trim().replace(/\s+/g, '-');
}

// An Obsidian tag: letters, digits, - and _, never only digits.
export function obsidianTag(name) {
  const t = String(name ?? '').trim().replace(/^#/, '').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_/-]/gu, '').toLowerCase();
  return t && !/^\d+$/.test(t) ? `#${t}` : '';
}

export function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// What a set of sources is about: their bundles first, then the hashtags
// they share. A single source gives its own first tags.
export function topicsOf(metas, model) {
  const seen = new Map();
  const add = (name) => {
    const k = topicKey(name);
    if (k && !seen.has(k)) seen.set(k, String(name));
  };
  for (const m of metas) {
    const b = model ? bundleOf(m, model) : null;
    if (b) add(b.naam);
  }
  const counts = new Map();
  for (const m of metas) for (const t of new Set(m.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  const shared = [...counts].sort((a, b) => b[1] - a[1]);
  const need = metas.length > 1 ? 2 : 1;
  for (const [t, n] of shared) if (n >= need) add(t);
  if (!seen.size) for (const [t] of shared.slice(0, 3)) add(t);
  return { onderwerpen: [...seen.values()].slice(0, 6), mappen: [...new Set(metas.map((m) => m.map).filter(Boolean))] };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A working title until the result brings its own: the one source's title,
// the name the sources share ("Claude Duet"), their shared hashtags, or the
// first title and how many more.
export function productionTitle(metas, onderwerpen) {
  if (metas.length === 1) return metas[0].titel.slice(0, 80);
  const name = sharedName(metas);
  if (name) return name;
  const shared = onderwerpen.filter((o) => metas.filter((m) => (m.tags || []).some((t) => topicKey(t) === topicKey(o))).length >= 2);
  if (shared.length) return shared.slice(0, 2).map((o) => cap(o.replace(/-/g, ' '))).join(' en ');
  return `${metas[0].titel.slice(0, 60)} en ${metas.length - 1} meer`;
}

// The note in Concepten/. Without a result it says the prompt went out;
// with one, the result comes first. Sources and topics always follow, so
// Obsidian shows the bundle as links and tags.
export function conceptBody({ titel, label, links, onderwerpen = [], resultaat = '', datum = new Date().toISOString() }) {
  const day = new Date(datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const head = resultaat.trim()
    || `# ${titel}\n\n> [!todo] Nog geen resultaat\n> De prompt voor een ${label.toLowerCase()} ging op ${day} naar je chat. Plak wat Claude of ChatGPT schreef in de app, dan komt het hier.`;
  const tags = onderwerpen.map(obsidianTag).filter(Boolean).join(' ');
  // A post that was not made from saved sources has no sources to list.
  const sources = links.length ? `\n\n## Bronnen in de vault\n\n${links.join('\n')}\n` : '\n';
  return `${head}${sources}${tags ? `\n## Onderwerpen\n\n${tags}\n` : ''}`;
}

// Totals, per kind, per topic, and the topics you save a lot but never used.
export function contentStats(productions, items, now = Date.now()) {
  const perSoort = new Map();
  const topics = new Map();
  for (const p of productions) {
    perSoort.set(p.label, (perSoort.get(p.label) || 0) + 1);
    for (const o of p.onderwerpen || []) {
      const k = topicKey(o);
      const e = topics.get(k) || { naam: o, aantal: 0, soorten: new Map() };
      e.aantal += 1;
      e.soorten.set(p.label, (e.soorten.get(p.label) || 0) + 1);
      topics.set(k, e);
    }
  }
  const kansen = new Map();
  for (const i of items) {
    if (i.status === 'archief' || i.status === 'gebruikt') continue;
    for (const t of i.tags || []) {
      const k = topicKey(t);
      if (topics.has(k)) continue;
      const e = kansen.get(k) || { naam: t, aantal: 0 };
      e.aantal += 1;
      kansen.set(k, e);
    }
  }
  const desc = (a, b) => b[1] - a[1];
  return {
    totaal: productions.length,
    recent: productions.filter((p) => now - Date.parse(p.datum) < 30 * 864e5).length,
    perSoort: [...perSoort].sort(desc),
    onderwerpen: [...topics.values()].sort((a, b) => b.aantal - a.aantal).slice(0, 10)
      .map((e) => ({ naam: e.naam, aantal: e.aantal, soorten: [...e.soorten].sort(desc) })),
    kansen: [...kansen.values()].filter((e) => e.aantal >= 3).sort((a, b) => b.aantal - a.aantal).slice(0, 8),
  };
}

// Earlier content on the same topics, newest first, so a new prompt can
// ask for a fresh angle.
export function earlierAbout(productions, onderwerpen, { exclude = '', max = 5 } = {}) {
  const keys = new Set(onderwerpen.map(topicKey));
  if (!keys.size) return [];
  return productions
    .filter((p) => p.file !== exclude && (p.onderwerpen || []).some((o) => keys.has(topicKey(o))))
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)))
    .slice(0, max)
    .map((p) => ({ datum: String(p.datum).slice(0, 10), label: p.label, titel: p.titel }));
}

// ---------- from prompt to posted ----------
// A production goes through three stages: the prompt went out ("prompt"),
// the result is in the app ("klaar"), it is published ("gepost").
export const statusOf = (p) => (p.gepost ? 'gepost' : p.klaar ? 'klaar' : 'prompt');
export const STATUS_LABEL = { prompt: 'Wacht op resultaat', klaar: 'Klaar om te posten', gepost: 'Gepost' };
export const kanaalOf = (p) => p.kanaal || KANAAL_VAN[p.soort] || '';

const CIJFERS = ['weergaven', 'likes', 'reacties', 'gedeeld', 'bewaard'];
export const CIJFER_LABEL = { weergaven: 'Weergaven', likes: 'Likes', reacties: 'Reacties', gedeeld: 'Gedeeld', bewaard: 'Bewaard' };

// Numbers as typed ("1.2K", "3,4 mln", "1.234") become whole numbers; empty
// fields are left out.
export function cleanCijfers(input = {}) {
  const out = {};
  for (const k of CIJFERS) {
    const raw = String(input[k] ?? '').trim().toLowerCase();
    if (!raw) continue;
    const m = raw.match(/^([\d.,]+)\s*(k|m|mln|mio)?$/);
    if (!m) continue;
    let n;
    if (m[2]) n = Number(m[1].replace(',', '.')) * (m[2] === 'k' ? 1e3 : 1e6);
    // Without a suffix, dots and commas are thousands separators.
    else n = Number(m[1].replace(/[.,]/g, ''));
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
  }
  return out;
}

// What people did with a post, as one number: reactions count for more than
// likes, shares and saves most.
export function interactie(c = {}) {
  return (c.likes || 0) + 2 * (c.reacties || 0) + 3 * (c.gedeeld || 0) + 3 * (c.bewaard || 0);
}

export function shortNumber(n) {
  if (n === undefined || n === null) return '';
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}K`;
  return String(n);
}

// "1,2K weergaven · 34 likes · 5 reacties"
export function cijferLine(c = {}) {
  return CIJFERS.filter((k) => c[k] !== undefined).map((k) => `${shortNumber(c[k])} ${CIJFER_LABEL[k].toLowerCase()}`).join(' · ');
}

const DAY = 864e5;
// Monday 00:00 of the week `now` is in, local time.
export function weekStart(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// Per channel: how often you posted this week against your goal.
// doelen: { linkedin: 3, x: 5 }. Channels without a goal show when you posted there.
export function weekRitme(productions, doelen = {}, now = Date.now()) {
  const from = weekStart(now);
  const count = new Map();
  for (const p of productions) {
    const t = Date.parse(p.gepost);
    if (!p.gepost || !(t >= from && t < from + 7 * DAY)) continue;
    const k = kanaalOf(p);
    if (k) count.set(k, (count.get(k) || 0) + 1);
  }
  const keys = [...new Set([...Object.keys(doelen).filter((k) => Number(doelen[k]) > 0), ...count.keys()])];
  return keys.filter((k) => KANALEN[k]).map((k) => ({ kanaal: k, naam: KANALEN[k].naam, gepost: count.get(k) || 0, doel: Number(doelen[k]) || 0 }))
    .sort((a, b) => (b.doel > 0) - (a.doel > 0) || b.gepost - a.gepost || a.naam.localeCompare(b.naam));
}

// Posts whose numbers are worth asking for: after two days when there are
// none yet, and once more after a week, when a post has run its course.
export function teMeten(productions, now = Date.now()) {
  return productions.filter((p) => {
    if (!p.gepost) return false;
    const age = now - Date.parse(p.gepost);
    if (!(age >= 2 * DAY) || age > 45 * DAY) return false;
    const measured = Date.parse(p.cijfers?.gemeten);
    if (!p.cijfers || !Number.isFinite(measured)) return true;
    return age >= 7 * DAY && measured - Date.parse(p.gepost) < 7 * DAY;
  }).sort((a, b) => String(a.gepost).localeCompare(String(b.gepost)));
}

const median = (list) => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// What your posted content did: per channel, your best posts and the topics
// that do better than your usual. Only posts with numbers count.
export function resultaten(productions) {
  const posted = productions.filter((p) => p.gepost);
  const measured = posted.filter((p) => p.cijfers && (p.cijfers.weergaven !== undefined || interactie(p.cijfers) > 0));
  const perKanaal = new Map();
  for (const p of posted) {
    const k = kanaalOf(p) || 'overig';
    const e = perKanaal.get(k) || { kanaal: k, naam: KANALEN[k]?.naam || 'Overig', gepost: 0, gemeten: 0, weergaven: 0, interactie: 0, scores: [] };
    e.gepost += 1;
    if (measured.includes(p)) {
      e.gemeten += 1;
      e.weergaven += p.cijfers.weergaven || 0;
      e.interactie += interactie(p.cijfers);
      e.scores.push(interactie(p.cijfers));
    }
    perKanaal.set(k, e);
  }
  // A post counts against the usual of its own channel: 100 likes on X is
  // not 100 likes on LinkedIn.
  const usual = new Map([...perKanaal].map(([k, e]) => [k, median(e.scores)]));
  const ratio = (p) => {
    const u = usual.get(kanaalOf(p) || 'overig');
    return u > 0 ? interactie(p.cijfers) / u : interactie(p.cijfers) > 0 ? 2 : 1;
  };
  const topics = new Map();
  for (const p of measured) {
    for (const o of p.onderwerpen || []) {
      const key = topicKey(o);
      const e = topics.get(key) || { naam: o, aantal: 0, som: 0 };
      e.aantal += 1;
      e.som += ratio(p);
      topics.set(key, e);
    }
  }
  return {
    gepost: posted.length,
    gemeten: measured.length,
    kanalen: [...perKanaal.values()].map(({ scores, ...e }) => ({ ...e, gemiddeld: e.gemeten ? Math.round(e.interactie / e.gemeten) : 0 })).sort((a, b) => b.gepost - a.gepost),
    beste: [...measured].sort((a, b) => ratio(b) - ratio(a) || interactie(b.cijfers) - interactie(a.cijfers)).slice(0, 5).map((p) => ({ file: p.file, titel: p.titel, label: p.label, cijfers: p.cijfers, keer: Math.round(ratio(p) * 10) / 10 })),
    onderwerpen: [...topics.values()].filter((t) => t.aantal >= 2).map((t) => ({ naam: t.naam, aantal: t.aantal, keer: Math.round((t.som / t.aantal) * 10) / 10 })).sort((a, b) => b.keer - a.keer).slice(0, 8),
    // For the ranking: is this post clearly above your usual?
    scoort: (p) => measured.includes(p) && (usual.get(kanaalOf(p) || 'overig') > 0 ? ratio(p) >= 1.5 : interactie(p.cijfers) > 0 && measured.length >= 3),
  };
}

// The production a result or a published post belongs to: by its code,
// otherwise the newest one of that kind still waiting.
export function findProduction(productions, { code = '', soort = '' } = {}) {
  if (code) {
    const hit = productions.find((p) => p.code === code);
    if (hit) return hit;
  }
  return productions.filter((p) => !p.klaar && (!soort || p.soort === soort)).sort((a, b) => String(b.datum).localeCompare(String(a.datum)))[0] || null;
}

// ---------- your own posts ----------
const handle = (v) => String(v || '').trim().replace(/^@/, '').toLowerCase();
const plainName = (v) => String(v || '').toLowerCase().replace(/\(@[^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// The channel a saved link is your own post on, or ''. kanalen holds your
// handle (or your name, for LinkedIn) per channel.
export function ownChannel(item, kanalen = {}) {
  const url = String(item.url || '');
  const maker = String(item.auteur || '');
  const mine = (k) => handle(kanalen[k]?.naam);
  const inMaker = (h) => h && new RegExp(`@${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9._])`, 'i').test(maker);
  if (item.type === 'tweet' && mine('x') && handle(url.match(/(?:x|twitter)\.com\/([^/]+)\/status/)?.[1]) === mine('x')) return 'x';
  if (item.type === 'tiktok' && mine('tiktok') && (handle(url.match(/tiktok\.com\/@([^/]+)/)?.[1]) === mine('tiktok') || inMaker(mine('tiktok')))) return 'tiktok';
  if (item.type === 'instagram' && inMaker(mine('instagram'))) return 'instagram';
  if (item.type === 'threads' && (inMaker(mine('threads')) || (mine('threads') && handle(url.match(/threads\.(?:com|net)\/@([^/]+)/)?.[1]) === mine('threads')))) return 'threads';
  if (item.type === 'linkedin' && kanalen.linkedin?.naam && plainName(maker) && plainName(maker) === plainName(kanalen.linkedin.naam)) return 'linkedin';
  return '';
}

// The piece a published post came from: the one on that channel, not posted
// yet, whose text is closest to the post. texts: Map(file -> result text).
// Without text to compare, only a single candidate of the last two weeks counts.
export function matchProduction(productions, kanaal, text, texts = new Map(), now = Date.now()) {
  const open = productions.filter((p) => !p.gepost && kanaalOf(p) === kanaal && now - Date.parse(p.datum) < 60 * 864e5);
  let best = null;
  let bestScore = 0;
  for (const p of open) {
    const score = sameText(text, texts.get(p.file) || '');
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  if (best && bestScore >= 0.3) return best;
  const recent = open.filter((p) => p.klaar && now - Date.parse(p.datum) < 14 * 864e5);
  return !String(text || '').trim() && recent.length === 1 ? recent[0] : null;
}

// The kind of content a post on a channel is, when it was not made here.
export const SOORT_VAN_KANAAL = { linkedin: 'linkedin', x: 'x', threads: 'threads', instagram: 'instagram', tiktok: 'tiktok', youtube: 'youtube', substack: 'nieuwsbrief' };
