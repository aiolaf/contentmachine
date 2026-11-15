// From shared link to finished note: fetch free details, pick a folder,
// tags and summary without AI, and optionally let Claude Haiku improve them.
import { makeCapture, fetchDetails, linkKey, refineSocial } from './capture.js';
import { classify, parseRules, trainModel, suggestTags, summarize, guessDoel, LEARNED, UNSURE, BY_HAND } from './classify.js';
import { NOTES, INBOX, cleanFolderName, getSection, setSection } from './frontmatter.js';
import { weakTitle, isWall } from './clean.js';
import { PAGE_WORDS } from './words.js';

const SOCIAL = ['tweet', 'instagram', 'tiktok', 'linkedin', 'threads'];
// The round of text fetching new notes get. Notes from an earlier round are
// fetched once more, because that round missed the text of most posts.
export const ROUND = 2;

function quote(text) {
  return String(text).split('\n').map((l) => `> ${l}`).join('\n');
}

// What stands under "## Bron": where it came from, the preview and the text.
function bronLines({ meta, item }) {
  const bron = [];
  const line = [meta.url ? `[${meta.bron || meta.url}](${meta.url})` : '', meta.auteur, prettyDate(item.gepubliceerd)]
    .filter(Boolean).join(' | ');
  if (line) bron.push(line);
  if (meta.afbeelding && meta.afbeelding !== 'geen') bron.push(`![](${meta.afbeelding})`);
  if (item.gedeeld) bron.push(quote(item.gedeeld));
  if (item.tekst) bron.push(SOCIAL.includes(item.type) ? quote(item.tekst) : item.tekst);
  return bron;
}

const abstract = (samenvatting) => `> [!abstract] Samenvatting\n${quote(samenvatting)}`;

export function buildBody({ meta, item, kernpunten = [], notes = '' }) {
  const parts = [`# ${meta.titel}`];
  if (meta.samenvatting) parts.push(abstract(meta.samenvatting));
  if (kernpunten.length) parts.push(`## Kernpunten\n\n${kernpunten.map((k) => `- ${k}`).join('\n')}`);
  parts.push(`## ${NOTES}\n\n${notes}`.trim());
  const bron = bronLines({ meta, item });
  if (bron.length) parts.push(['## Bron', ...bron].join('\n\n'));
  return `${parts.join('\n\n')}\n`;
}

function firstLine(text) {
  return String(text || '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 90) || '';
}

// Posts have no title: use their first sentence, cut at a word boundary.
function firstSentence(text) {
  // Links and bare addresses are no title: keep a link's words, drop the address.
  const plain = String(text || '').replace(/^\*\*(.+?)\*\*$/m, '$1').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const line = plain.split('\n').map((l) => l.replace(/https?:\/\/\S+/g, '').replace(/^[>\s]+/, '').trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) || '';
  const s = (line.match(/^.+?[.!?](?=\s|$)/) || [line])[0];
  return s.length <= 90 ? s : `${s.slice(0, 87).replace(/\s+\S*$/, '')}...`;
}

// A post that gave no text still gets a title that says what it is.
function makerTitle(type, url, auteur, soort) {
  const reel = soort === 'reel' || /\/reels?\//.test(url || '');
  const what = { instagram: reel ? 'Reel' : 'Instagram-post', threads: 'Threads-post', linkedin: 'LinkedIn-post', tiktok: 'TikTok', tweet: 'Post op X' }[type];
  if (!what) return '';
  const name = String(auteur || '').replace(/\s*\(@[^)]*\)\s*$/, '').trim() || String(auteur || '').trim();
  return name ? `${what} van ${name}` : what;
}

// A post has no title of its own: its first sentence says most. An article
// has one. Hashtags at the end become tags, not title text.
function titleFor(capture, details) {
  let titel;
  if (SOCIAL.includes(capture.type)) {
    // Social previews put the whole post plus "| Name | 17 comments" in the title.
    const preview = details.titel ? firstSentence(details.titel.replace(/\s+\|\s.*$/, '').replace(/…$/, '')) : '';
    titel = firstSentence(details.tekst) || preview || firstSentence(capture.gedeeld) || capture.titelGedeeld
      || makerTitle(capture.type, capture.url, details.auteur, details.soort) || capture.bron;
  } else {
    titel = details.titel || capture.titelGedeeld || (capture.type === 'notitie' ? firstLine(capture.gedeeld) : '') || firstLine(details.tekst) || capture.bron;
  }
  titel = String(titel || 'Notitie').trim();
  return titel.replace(/(\s+#[\p{L}\p{N}_-]+)+\s*$/u, '').trim() || titel;
}

function socialSummary(text, titel) {
  const s = String(text || '').replace(/\*\*Transcript\*\*[\s\S]*$/, '').replace(/\s+/g, ' ').trim().slice(0, 280);
  return s.replace(/\.{3}$/, '') === String(titel).replace(/\.{3}$/, '') ? '' : s;
}

function prettyDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// input: { url, text, title } from the share sheet, or { text } from a raw Inbox file.
// opts: { fetchImpl, reader, haiku: async (item, ctx) => result | null }
export async function processCapture(vault, input, opts = {}) {
  const capture = makeCapture(input);
  if (capture.url) {
    // The same post with another tracking code, or via another address, is a double.
    const key = linkKey(capture.url);
    const dup = vault.list().find((i) => i.url === capture.url || (i.url && linkKey(i.url) === key));
    if (dup) return { ...dup, dubbel: true };
  }
  const details = capture.url ? await fetchDetails(capture, opts) : {};
  const item = { ...capture, ...details };
  const social = SOCIAL.includes(item.type);
  item.titel = titleFor(capture, details);
  // Your own post is not material to post about: opts.eigen may take it over
  // (to mark what you made as posted) and then no note is made.
  if (opts.eigen) {
    const own = await opts.eigen(item);
    if (own) return { ...own, eigen: true };
  }

  const existing = vault.list();
  const choice = classify(item, trainModel(existing), parseRules(vault.system['regels.md']));
  const doel = guessDoel(item, { makers: vault.learner?.state.makers, rulesText: vault.system['regels.md'] });
  let samenvatting = social
    ? socialSummary(details.tekst || capture.gedeeld, item.titel)
    : summarize(details.beschrijving || details.tekst || capture.gedeeld);
  if (samenvatting.replace(/\.{3}$/, '') === item.titel.replace(/\.{3}$/, '')) samenvatting = '';
  let tags = suggestTags(item, existing);
  let { map } = choice;
  let { titel } = item;
  let kernpunten = [];
  let score = 50;
  let ai = false;

  if (opts.haiku) {
    try {
      const h = await opts.haiku(item, { folders: vault.folders().filter((f) => f !== INBOX), profiel: vault.system['profiel.md'] });
      if (h) {
        ({ titel, samenvatting } = { titel: h.titel || titel, samenvatting: h.samenvatting || samenvatting });
        kernpunten = (h.kernpunten || []).slice(0, 5);
        tags = (h.tags || tags).map((t) => String(t).toLowerCase().trim().replace(/\s+/g, '-')).filter(Boolean).slice(0, 6);
        // Learned folders beat Haiku's guess once the model is confident.
        if (choice.reden !== 'geleerd van jouw mappen' && h.map) map = cleanFolderName(h.map);
        if (Number.isFinite(Number(h.score))) score = Number(h.score);
        ai = true;
      }
    } catch (e) {
      opts.onWarning?.(`Haiku: ${e.message}`);
    }
  }

  // Match an existing folder case-insensitively instead of creating a near-duplicate.
  const clean = cleanFolderName(map);
  map = vault.folders().find((f) => f.toLowerCase() === clean.toLowerCase()) || clean;

  const meta = {
    titel,
    url: capture.url || undefined,
    bron: capture.bron || undefined,
    type: capture.type,
    auteur: details.auteur || undefined,
    map,
    doel: doel === 'leren' ? 'leren' : undefined,
    tags,
    score,
    status: 'nieuw',
    ster: false,
    oordeel: 0,
    opgeslagen: input.opgeslagen || new Date().toISOString(),
    verrijkt: true,
    // Only when a service answered: otherwise the text is fetched again later.
    opgehaald: !capture.url || Object.keys(details).length ? ROUND : undefined,
    samenvatting: samenvatting || undefined,
    // "geen" means: looked, nothing found. Left out when no service answered, so it is tried again later.
    afbeelding: details.afbeelding || (Object.keys(details).length ? 'geen' : undefined),
    avatar: details.avatar || undefined,
    ordening: ai ? 'haiku' : choice.reden,
  };
  return vault.create(meta, buildBody({ meta, item, kernpunten }));
}

function addImage(body, img) {
  if (body.includes(img)) return body;
  const m = /^## Bron[ \t]*\n/m.exec(body);
  if (!m) return `${body.replace(/\s*$/, '')}\n\n![](${img})\n`;
  const at = m.index + m[0].length;
  return `${body.slice(0, at)}\n![](${img})\n${body.slice(at)}`;
}

// Items saved before previews existed: fetch a preview image for a few at a time,
// newest first, so the free daily limits are never an issue.
export async function backfillPreviews(vault, opts = {}, max = 10) {
  const todo = vault.list()
    .filter((i) => i.url && i.afbeelding === undefined && !i.invalid)
    .sort((a, b) => String(b.opgeslagen).localeCompare(String(a.opgeslagen)))
    .slice(0, max);
  let found = 0;
  for (const it of todo) {
    const d = await fetchDetails({ url: it.url, type: it.type }, { ...opts, reader: false });
    if (!Object.keys(d).length || !vault.has(it.id)) continue;
    const patch = { afbeelding: d.afbeelding || 'geen' };
    if (d.avatar && !it.avatar) patch.avatar = d.avatar;
    await vault.update(it.id, patch, d.afbeelding ? { transform: (body) => addImage(body, d.afbeelding) } : {});
    if (d.afbeelding) found += 1;
    opts.onProgress?.();
  }
  return found;
}

// Raw files the iPhone shortcut put in Inbox: turn each into a proper note.
// Empty files (the shortcut ran without a shared link) are removed, not saved.
export async function processInbox(vault, captures, opts = {}) {
  const done = [];
  for (const c of captures) {
    if (!String(c.text || '').trim()) {
      vault.removeFile(c.rel);
      opts.onEmpty?.(c.rel);
      continue;
    }
    const savedAt = c.rel.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    const opgeslagen = savedAt ? new Date(`${savedAt[1]}-${savedAt[2]}-${savedAt[3]}T${savedAt[4]}:${savedAt[5]}:${savedAt[6]}`).toISOString() : undefined;
    const meta = await processCapture(vault, { text: c.text, opgeslagen }, opts);
    vault.removeFile(c.rel);
    if (meta.eigen) {
      opts.onOwn?.(meta);
      continue;
    }
    done.push(meta);
    opts.onProgress?.(done.length, captures.length);
  }
  return done;
}

// ---------- tidying up what was saved before ----------
const junkSummary = (t) => !t || isWall(t) || /^\s*(#{1,6}\s|\[|!\[|>)/.test(t) || /\]\(https?:\/\//.test(t);
const junkTags = (meta) => {
  const own = new Set(String(meta.auteur || '').toLowerCase().replace(/[@()._]/g, ' ').split(/\s+/).filter(Boolean));
  return !(meta.tags || []).length || meta.tags.some((t) => PAGE_WORDS.has(t) || own.has(t) || /^[a-z]*\d[a-z\d]{9,}$/.test(t));
};

// A social post saved before the app could read its text: no real title or
// no summary. Each note is tried once per round.
export function needsEnrich(meta) {
  if (!meta.url || meta.invalid || !['instagram', 'threads', 'linkedin', 'tiktok'].includes(meta.type)) return false;
  if ((meta.opgehaald || 0) >= ROUND) return false;
  return weakTitle(meta.titel) || junkSummary(meta.samenvatting) || junkTags(meta);
}

// Reads the post again and repairs the note: title, summary, tags, maker and
// the text under "## Bron". Your notes, highlights and lessons stay. What is
// already in the note is cleaned first; the network is only asked when that
// gives no text. Returns the updated meta, or null when nothing was found.
export async function reEnrich(vault, id, opts = {}) {
  const { meta, body, invalid } = await vault.get(id);
  if (invalid) return null;
  const stored = getSection(body, 'Bron');
  let details = ['linkedin', 'threads'].includes(meta.type) ? refineSocial(meta.type, { tekst: stored }, { strict: true }) : {};
  if (!details.tekst) {
    details = opts.fetch === false ? {} : await fetchDetails({ url: meta.url, type: meta.type }, opts);
    // No service answered: leave the note for a next try.
    if (!Object.keys(details).length) return null;
  }
  const patch = { opgehaald: ROUND };
  const maker = String(details.auteur || '').trim();
  const handle = maker.match(/@[A-Za-z0-9._]+/)?.[0];
  if (maker && (!meta.auteur || /^(view profile|log in|sign in)$/i.test(meta.auteur))) patch.auteur = maker;
  // The name was known, the handle is new: keep both.
  else if (handle && !/@/.test(meta.auteur)) patch.auteur = /\(@/.test(maker) ? maker : `${meta.auteur} (${handle})`;
  const auteur = patch.auteur || meta.auteur;
  const text = details.tekst || '';
  const weak = weakTitle(meta.titel);
  if (weak) patch.titel = firstSentence(text).replace(/(\s+#[\p{L}\p{N}_-]+)+\s*$/u, '').trim() || makerTitle(meta.type, meta.url, auteur, details.soort) || meta.titel;
  const titel = patch.titel || meta.titel;
  if (text && junkSummary(meta.samenvatting)) patch.samenvatting = socialSummary(text, titel) || undefined;
  else if (junkSummary(meta.samenvatting) && meta.samenvatting) patch.samenvatting = undefined;
  if (junkTags(meta)) patch.tags = suggestTags({ titel, tekst: text, auteur }, vault.list().filter((i) => i.id !== id));
  if (details.afbeelding && (!meta.afbeelding || meta.afbeelding === 'geen')) patch.afbeelding = details.afbeelding;
  if (details.avatar && !meta.avatar) patch.avatar = details.avatar;
  const next = { ...meta, ...patch };
  const transform = (old) => {
    let b = old;
    if (text || weak) {
      const published = stored.match(/\|\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1] || details.gepubliceerd;
      b = setSection(b, 'Bron', bronLines({ meta: next, item: { type: meta.type, tekst: text, gepubliceerd: published } }).join('\n\n'));
    }
    if (patch.titel) b = b.replace(/^# .*$/m, () => `# ${patch.titel}`);
    if ('samenvatting' in patch) {
      b = b.replace(/^> \[!abstract\][^\n]*\n(?:>[^\n]*\n?)*\n?/m, '');
      if (patch.samenvatting) b = b.replace(/^# [^\n]*\n/m, (m0) => `${m0}\n${abstract(patch.samenvatting)}\n\n`);
    }
    return `${b.replace(/\n{3,}/g, '\n\n').trim()}\n`;
  };
  return vault.update(id, patch, { transform, rename: Boolean(patch.titel) });
}

// Items you placed yourself before the app kept track of that: the folder
// corrections it remembers say which ones.
export function handPlaced(items, correcties = []) {
  const moved = new Set(correcties.map((c) => `${c.naar}\n${c.titel}`));
  return new Set(items.filter((i) => i.ordening === BY_HAND || moved.has(`${i.map}\n${i.titel}`)).map((i) => i.id));
}

// Where every automatically placed item belongs with what the app knows now.
// First the rules place what they can; what you placed by hand and what the
// rules placed then teach the model, which places the rest. Items you placed
// yourself and items Haiku placed never move.
// texts: Map(id -> the post's text) where it is known.
// Returns [{ id, titel, van, naar, reden }], only the items that would move.
export function resortPlan(items, { rulesText = '', correcties = [], texts = new Map() } = {}) {
  const rules = parseRules(rulesText);
  const fixed = handPlaced(items, correcties);
  const auto = items.filter((i) => i.verrijkt && !i.invalid && !fixed.has(i.id) && i.ordening !== 'haiku');
  const withText = (i) => ({ ...i, tekst: texts.get(i.id) || '' });
  const placed = new Map();
  const none = trainModel([]);
  for (const i of auto) {
    const c = classify(withText(i), none, rules);
    if (c.reden === 'trefwoordregel') placed.set(i.id, c);
  }
  const sure = [
    ...items.filter((i) => fixed.has(i.id) || i.ordening === 'haiku').map((i) => ({ ...i, ordening: i.ordening === 'haiku' ? 'haiku' : BY_HAND })),
    ...auto.filter((i) => placed.has(i.id)).map((i) => ({ ...i, map: placed.get(i.id).map, ordening: 'trefwoordregel' })),
  ];
  const model = trainModel(sure);
  const plan = [];
  for (const i of auto) {
    const c = placed.get(i.id) || classify(withText(i), model, rules);
    if (c.map !== i.map || c.reden !== i.ordening) plan.push({ id: i.id, titel: i.titel, van: i.map, naar: c.map, reden: c.reden });
  }
  return plan;
}

// "leren" that the app itself gave to a new item nobody opened yet, by a
// model that learned from its own guesses. Returns the ids to put back.
export function wronglyLearning(items, { makers = null, rulesText = '' } = {}) {
  return items
    .filter((i) => i.doel === 'leren' && i.status === 'nieuw' && !i.lessen && guessDoel(i, { makers, rulesText }) !== 'leren')
    .map((i) => i.id);
}

// The same post saved more than once, found by its key. Of each set one
// stays: the one you did most with, otherwise the oldest. Returns
// [{ keep, drop: [ids] }]; what to do with the rest is up to the caller.
export function duplicatePlan(items) {
  const groups = new Map();
  for (const i of items) {
    if (!i.url || i.invalid) continue;
    const k = linkKey(i.url);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }
  const worth = (i) => (i.status === 'gebruikt' ? 8 : 0) + (i.ster ? 4 : 0) + (i.markeringen ? 4 : 0) + (i.lessen ? 4 : 0) + (i.oordeel === 1 ? 2 : 0) + (i.ordening === BY_HAND ? 1 : 0) + (i.status === 'archief' ? -2 : 0);
  const plan = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => worth(b) - worth(a) || String(a.opgeslagen).localeCompare(String(b.opgeslagen)));
    // What you already used or archived needs no tidying.
    const drop = sorted.slice(1).filter((i) => i.status !== 'archief' && i.status !== 'gebruikt').map((i) => i.id);
    if (drop.length) plan.push({ keep: sorted[0].id, drop });
  }
  return plan;
}

// Topics that fill your Inbox and have no folder yet: a hashtag on four or
// more Inbox items. Returns [{ naam, tag, ids }], biggest first.
export function folderIdeas(items, folders = [], { min = 4 } = {}) {
  const have = new Set(folders.map((f) => f.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')));
  const byTag = new Map();
  for (const i of items) {
    if (i.map !== INBOX || i.status === 'archief' || i.invalid) continue;
    for (const t of new Set(i.tags || [])) {
      if (PAGE_WORDS.has(t) || /^\d+$/.test(t)) continue;
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(i.id);
    }
  }
  return [...byTag].filter(([t, ids]) => ids.length >= min && !have.has(t.replace(/[^\p{L}\p{N}]+/gu, '')))
    .sort((a, b) => b[1].length - a[1].length)
    .map(([tag, ids]) => ({ tag, ids, naam: cleanFolderName(tag.replace(/-/g, ' ')) }));
}
