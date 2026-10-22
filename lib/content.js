// The content archive: every prompt you take to Claude or ChatGPT becomes a
// production. Its sources leave the feed, a note in Concepten/ links them
// together, and _systeem/content.json remembers which topics went into which
// kind of content, for the statistics and for the next prompt.
import { bundleOf } from './bundles.js';
import { fold } from './search.js';

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

export function productionTitle(metas, onderwerpen) {
  if (metas.length === 1) return metas[0].titel.slice(0, 80);
  if (onderwerpen.length) return onderwerpen.slice(0, 2).map((o) => cap(o.replace(/-/g, ' '))).join(' en ');
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
  return `${head}\n\n## Bronnen in de vault\n\n${links.join('\n')}\n${tags ? `\n## Onderwerpen\n\n${tags}\n` : ''}`;
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
