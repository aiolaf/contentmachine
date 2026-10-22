// From shared link to finished note: fetch free details, pick a folder,
// tags and summary without AI, and optionally let Claude Haiku improve them.
import { makeCapture, fetchDetails } from './capture.js';
import { classify, parseRules, trainModel, suggestTags, summarize } from './classify.js';
import { NOTES, INBOX, cleanFolderName } from './frontmatter.js';

const SOCIAL = ['tweet', 'instagram', 'tiktok', 'linkedin', 'threads'];

function quote(text) {
  return String(text).split('\n').map((l) => `> ${l}`).join('\n');
}

export function buildBody({ meta, item, kernpunten = [], notes = '' }) {
  const parts = [`# ${meta.titel}`];
  if (meta.samenvatting) parts.push(`> [!abstract] Samenvatting\n${quote(meta.samenvatting)}`);
  if (kernpunten.length) parts.push(`## Kernpunten\n\n${kernpunten.map((k) => `- ${k}`).join('\n')}`);
  parts.push(`## ${NOTES}\n\n${notes}`.trim());
  const bron = ['## Bron'];
  const line = [meta.url ? `[${meta.bron || meta.url}](${meta.url})` : '', meta.auteur, prettyDate(item.gepubliceerd)]
    .filter(Boolean).join(' | ');
  if (line) bron.push(line);
  if (meta.afbeelding && meta.afbeelding !== 'geen') bron.push(`![](${meta.afbeelding})`);
  if (item.gedeeld) bron.push(quote(item.gedeeld));
  if (item.tekst) bron.push(SOCIAL.includes(item.type) ? quote(item.tekst) : item.tekst);
  if (bron.length > 1) parts.push(bron.join('\n\n'));
  return `${parts.join('\n\n')}\n`;
}

function firstLine(text) {
  return String(text || '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 90) || '';
}

// Posts have no title: use their first sentence, cut at a word boundary.
function firstSentence(text) {
  const line = String(text || '').replace(/^\*\*(.+?)\*\*$/m, '$1').split('\n').map((l) => l.trim()).find(Boolean) || '';
  const s = (line.match(/^.+?[.!?](?=\s|$)/) || [line])[0];
  return s.length <= 90 ? s : `${s.slice(0, 87).replace(/\s+\S*$/, '')}...`;
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
    const dup = vault.list().find((i) => i.url === capture.url);
    if (dup) return { ...dup, dubbel: true };
  }
  const details = capture.url ? await fetchDetails(capture, opts) : {};
  const item = { ...capture, ...details };
  const social = SOCIAL.includes(item.type);
  item.titel = (details.titel || capture.titelGedeeld || (capture.type === 'notitie' ? firstLine(capture.gedeeld) : '')
    || (social ? firstSentence(details.tekst || capture.gedeeld) : firstLine(details.tekst)) || capture.bron || 'Notitie').trim();
  // Social previews put the whole post plus "| Name | 17 comments" in the title.
  if (social && details.titel) item.titel = firstSentence(details.titel.replace(/\s+\|\s.*$/, '').replace(/…$/, '')) || item.titel;
  // Hashtags at the end of a title become tags, not title text.
  item.titel = item.titel.replace(/(\s+#[\p{L}\p{N}_-]+)+\s*$/u, '').trim() || item.titel;

  const existing = vault.list();
  const choice = classify(item, trainModel(existing), parseRules(vault.system['regels.md']));
  let samenvatting = social
    ? String(details.tekst || capture.gedeeld || '').replace(/\s+/g, ' ').slice(0, 280)
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
    tags,
    score,
    status: 'nieuw',
    ster: false,
    oordeel: 0,
    opgeslagen: input.opgeslagen || new Date().toISOString(),
    verrijkt: true,
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
    done.push(meta);
    opts.onProgress?.(done.length, captures.length);
  }
  return done;
}
