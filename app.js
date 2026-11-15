// Contentmachine: a free, static web app. No server: the vault lives in your
// own GitHub repo (or on this device) and the browser talks to it directly.
import { GitHubStore, LocalStore, parseRepoInput, cleanToken } from './lib/store.js';
import { Vault } from './lib/vault.js';
import { processCapture, processInbox, backfillPreviews, needsEnrich, reEnrich, resortPlan, wronglyLearning, handPlaced } from './lib/pipeline.js';
import { embedFor } from './lib/embeds.js';
import { buildShortcut, buildVideoShortcut, inboxApiUrl, SIGN_COMMAND, signCommand } from './lib/shortcut.js';
import { findMedia, cobaltLink, ytdlpCommand, YT_FORMATEN } from './lib/video.js';
import { youtubeId, linkKey } from './lib/capture.js';
import {
  parseBundles, stringifyBundles, autoBundle, pruneBundles, bundleOf, bundlesFor, setFolderBundles, renameFolderInBundles, OTHER,
} from './lib/bundles.js';
import { buildPrompt, buildLessonPrompt, chatLinks, SOORTEN as PROMPT_SOORTEN } from './lib/prompts.js';
import { trainModel, classify, parseRules, suggestTags, BY_HAND, UNSURE } from './lib/classify.js';
import { REGELS, REGELS_V1 } from './lib/seeds.js';
import { PAGE_WORDS, FILLER } from './lib/words.js';
import { STATUSES, getSection, setSection, removeSection, parseNote, NOTES } from './lib/frontmatter.js';
import { lessonsOf, withLessons } from './lib/lessons.js';
import { fold, plainText, parseQuery, matchItem, snippet } from './lib/search.js';
import { parseHighlights, withHighlights, cleanHighlight, sameHighlight, MARKERINGEN } from './lib/highlights.js';
import { dailyReview, stopReview, daysUntil, highlightOfDay, localDay } from './lib/review.js';
import { openTextCache } from './lib/textcache.js';
import {
  topicsOf, topicKey, productionTitle, conceptBody, contentStats, earlierAbout, sameSet,
  statusOf, STATUS_LABEL, kanaalOf, cleanCijfers, cijferLine, CIJFER_LABEL, weekRitme, teMeten, resultaten, findProduction,
  ownChannel, matchProduction, SOORT_VAN_KANAAL,
} from './lib/content.js';
import { KANALEN, KANAAL_VAN, newCode, findCode, stripCode, outputFor, visiblePart, withHook, composeLink, speakSeconds, parseResult } from './lib/platforms.js';
import { fetchStats, statsSource } from './lib/stats.js';
import { toHtml, splitNewsletter, withoutSubjects, joinNewsletter, forSubstack, applyFormat } from './lib/richtext.js';
import { words, readMinutes } from './lib/platforms.js';
import {
  toast as showToast, confirmSlide, rollHtml, animateRolls, burst, pop, switchHtml, flipSwitch,
  ringHtml, setRing, checkSvg, setGenerate, flyOut, setupDeck, setupTilt, setupSwipeAway,
} from './ui.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isDesktop = () => matchMedia('(min-width: 900px)').matches;

const ICONS = {
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  up: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  down: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  settings: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  feed: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h12"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  sort: '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  play: '<polygon points="7 4 20 12 7 20 7 4"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  video: '<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  marker: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
};
const icon = (name, fill = false) =>
  `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const SOORTEN = Object.entries(PROMPT_SOORTEN).map(([id, s]) => ({ id, ...s }));
const FILTERS = [['actief', 'Actueel'], ['nieuw', 'Ongelezen'], ['ster', 'Ster'], ['gebruikt', 'Gebruikt'], ['archief', 'Archief']];
// The feed shows what you have not turned into content or archived yet.
const isActive = (i) => i.status !== 'archief' && i.status !== 'gebruikt';
const SORTS = { top: 'Top', nieuw: 'Nieuwst', trending: 'Trending' };
const TYPE_LABEL = { artikel: 'Artikel', tweet: 'Post op X', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', threads: 'Threads', notitie: 'Notitie', pdf: 'PDF' };
const VERSIE = '31 (15 nov 2026)';
// The Teleprompter lives in teleprompter/ on the same site; it shows a link back here.
const TELEPROMPTER_URL = 'teleprompter/?van=contentmachine';
const APP_URL = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
const OBSIDIAN_COMMAND = 'bash <(curl -fsSL https://raw.githubusercontent.com/aiolaf/contentmachine/main/obsidian-setup.sh)';

// ---------- per-device settings ----------
const local = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // private mode: settings live for this visit only
    }
  },
};
const safeStorage = (() => {
  try {
    localStorage.setItem('cm_test', '1');
    localStorage.removeItem('cm_test');
    return localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
})();

const DEFAULT_CFG = { modus: '', owner: '', repo: '', branch: 'main', map: 'Contentmachine', token: '', reader: true, previews: true, haiku: false, anthropicKey: '', cobaltUrl: '', cobaltKey: '' };

const S = {
  cfg: { ...DEFAULT_CFG, ...local.get('cm_config', {}) },
  vault: null,
  ready: false,
  connecting: false,
  fout: '',
  verwerken: null,
  items: [],
  view: 'feed',
  param: '',
  map: null,
  filter: 'actief',
  sort: 'top',
  q: '',
  selected: new Set(),
  detail: null,
  soort: 'linkedin',
  instructie: '',
  prompt: '',
  resultaat: '',
  concept: null,
  sheet: null,
  sharing: null,
  embed: null,
  bundel: null,
  editBundels: null,
  backfilling: false,
  lastLoad: 0,
  tekst: null,
  indexing: false,
  markText: '',
  reviewIds: [],
  reviewHl: new Map(),
  itemFrom: null,
  productie: null,
  openStacks: new Set(),
  archiefSoort: null,
  conceptFrom: 'studio',
  deck: null,
  gen: null,
  pop: null,
  video: null,
  // Feed: material to post about, or items saved to learn from.
  doel: local.get('cm_doel', 'posten') === 'leren' ? 'leren' : 'posten',
  titelEdit: false,
  // Items to learn from whose lessons go along in the next prompt.
  lessen: new Set(),
  // Tidying up: fetching missing texts and putting items in the right folder.
  opschoon: null,
  // The code in the prompt on screen; it brings the answer back to its place.
  promptCode: '',
  // Something you made, to turn into another kind: { soort, label, tekst, bronnen }.
  basis: null,
  // The production whose answer you may have just copied: a bar offers to paste it.
  terug: null,
  archiefStatus: null,
  conceptEdit: null,
  plakVeld: false,
  // The newsletter editor: { file, titel, ondertitel, tekst, tab, staat }.
  editor: null,
};
const isLeren = (i) => i.doel === 'leren';

// A toast in the stack; pass { actie } for an "Ongedaan maken" button.
const toast = (msg, opts) => showToast(msg, opts);

async function copy(text, label = 'Gekopieerd', opts) {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, opts);
    return true;
  } catch {
    prompt('Kopieer handmatig:', text);
    return false;
  }
}

function relDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'net';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} u`;
  if (s < 172800) return 'gisteren';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

const scoreClass = (r) => (r >= 85 ? 'top' : r >= 70 ? 'hi' : '');
// Rank can pass 100 with a star and learned boost; show it on a 0 to 100 scale.
const shown = (r) => Math.max(0, Math.min(100, Math.round(r)));
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : '');
const httpsImage = (u) => (/^https:\/\//i.test(String(u || '')) ? u : '');

function hue(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// Preview image, the maker's avatar for posts without media, or a coloured
// letter of the source. A broken image falls back to the letter (see the error listener).
function thumbHtml(i) {
  const letter = String(i.bron || TYPE_LABEL[i.type] || i.titel || '?').replace(/^www\./, '').charAt(0).toUpperCase() || '?';
  const h = hue(i.bron || i.type || i.titel || '');
  const img = httpsImage(i.afbeelding);
  const src = img || httpsImage(i.avatar);
  if (!src) return `<span class="thumb mono" style="--h:${h}" aria-hidden="true">${esc(letter)}</span>`;
  return `<img class="thumb${img ? '' : ' avatar'}" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-letter="${esc(letter)}" data-hue="${h}">`;
}

// ---------- data ----------
function decorate(meta) {
  const l = S.vault.learner;
  return { ...meta, rank: l.rank(meta), boost: Math.round(l.boost(meta) * 10) / 10 };
}

function refreshItems() {
  if (!S.vault) return;
  S.items = S.vault.list().map(decorate);
  for (const id of S.selected) if (!S.vault.has(id)) S.selected.delete(id);
}

function bundleModel() {
  return parseBundles(S.vault?.system['bundels.md'] || '');
}

// Hashtags that keep coming back in a folder form a bundle on their own.
function runAutoBundle() {
  if (!S.vault) return;
  const { model, changes } = autoBundle(S.items, bundleModel());
  if (!changes.length) return;
  S.vault.writeSystem('bundels.md', stringifyBundles(model));
  const nieuw = changes.filter((c) => c.nieuw);
  if (nieuw.length === 1) toast(`Nieuwe bundel: ${nieuw[0].naam} in ${nieuw[0].map}`);
  else if (nieuw.length > 1) toast(`${nieuw.length} nieuwe bundels gemaakt`);
  else toast(`Bundel ${changes[0].naam} uitgebreid met #${changes[0].tags[0]}`);
}

function folderList() {
  const counts = new Map(S.vault.folders().map((f) => [f, 0]));
  for (const i of S.items) counts.set(i.map, (counts.get(i.map) || 0) + 1);
  return [...counts].map(([naam, aantal]) => ({ naam, aantal }))
    .sort((a, b) => (a.naam === 'Inbox' ? -1 : b.naam === 'Inbox' ? 1 : b.aantal - a.aantal || a.naam.localeCompare(b.naam)));
}

function visibleItems() {
  let list = S.items;
  if (S.map) list = list.filter((i) => i.map === S.map);
  const terms = parseQuery(S.q);
  // Searching looks in both: to post about and to learn from.
  if (!terms.length) list = list.filter((i) => isLeren(i) === (S.doel === 'leren'));
  if (S.map && S.bundel) {
    const model = bundleModel();
    list = list.filter((i) => {
      const b = bundleOf(i, model);
      return S.bundel === OTHER ? !b : b?.naam === S.bundel;
    });
  }
  const f = S.filter;
  // Searching from Actueel looks everywhere, the content archive included.
  if (!(terms.length && f === 'actief')) {
    list = list.filter((i) => (f === 'actief' ? isActive(i)
      : f === 'nieuw' ? i.status === 'nieuw'
        : f === 'ster' ? i.ster
          : f === 'gebruikt' ? i.status === 'gebruikt'
            : i.status === 'archief'));
  }
  // Search covers titles, tags and the full text; the best match comes first.
  if (terms.length) {
    const found = [];
    for (const i of list) {
      const text = noteText(i.id);
      const m = matchItem(i, text, terms);
      if (m) found.push({ ...i, zoekscore: m.score, fragment: m.inBody ? snippet(text.plain, terms) : null });
    }
    return found.sort((a, b) => b.zoekscore - a.zoekscore || b.rank - a.rank);
  }
  const days = (i) => (Date.now() - new Date(i.opgeslagen).getTime()) / 864e5;
  const key = {
    top: (i) => i.rank,
    nieuw: (i) => new Date(i.opgeslagen).getTime() || 0,
    trending: (i) => i.rank * Math.exp(-days(i) / 10),
  }[S.sort];
  return [...list].sort((a, b) => key(b) - key(a));
}

function makeStore(cfg) {
  if (cfg.modus === 'lokaal') return new LocalStore({ storage: safeStorage });
  return new GitHubStore({ owner: cfg.owner.trim(), repo: cfg.repo.trim(), branch: cfg.branch.trim() || 'main', token: cfg.token.trim() });
}

function pipelineOpts() {
  const opts = { reader: S.cfg.reader, previews: S.cfg.previews !== false, onWarning: (m) => toast(m), eigen: ownPost };
  if (S.cfg.haiku && S.cfg.anthropicKey) {
    opts.haiku = async (item, ctx) => (await import('./lib/haiku.js')).enrichWithHaiku(S.cfg.anthropicKey, item, ctx);
  }
  return opts;
}

const pendingKey = () => `cm_pending:${S.cfg.modus}:${S.cfg.owner}/${S.cfg.repo}`;

async function connect() {
  S.connecting = true;
  S.fout = '';
  render();
  try {
    const vault = new Vault(makeStore(S.cfg), {
      root: S.cfg.modus === 'lokaal' ? 'Contentmachine' : S.cfg.map,
      storage: safeStorage,
      storageKey: pendingKey(),
      textCache: S.cfg.modus === 'lokaal' ? null : openTextCache(),
    });
    vault.onChange = () => {
      refreshItems();
      renderSync();
    };
    S.vault = vault;
    await loadVault();
    S.ready = true;
  } catch (e) {
    S.vault = null;
    S.fout = e.message;
  } finally {
    S.connecting = false;
  }
}

// Reads the vault and orders whatever the iPhone shortcut dropped in Inbox.
// One load at a time: returning to the app while it is still loading must
// not start a second one that trips over the first.
let loading = null;
function loadVault() {
  if (!loading) loading = loadVaultOnce().finally(() => { loading = null; });
  return loading;
}

async function loadVaultOnce() {
  S.lastLoad = Date.now();
  if (S.vault.pending.size) await S.vault.flush().catch(() => {});
  const { captures, moves } = await S.vault.load();
  S.lastLoad = Date.now();
  refreshItems();
  if (moves.length) toast(`${moves.length} verplaatsing${moves.length === 1 ? '' : 'en'} uit Obsidian geleerd`);
  // An answer shared from Claude or ChatGPT carries its code: it goes to the
  // production it belongs to instead of becoming a new item.
  const answers = captures.filter((c) => {
    const code = findCode(c.text);
    return code && S.vault.content.some((x) => x.code === code);
  });
  for (const c of answers) {
    const p = S.vault.content.find((x) => x.code === findCode(c.text));
    const done = fillProduction(p, c.text);
    S.vault.removeFile(c.rel);
    captures.splice(captures.indexOf(c), 1);
    toast(`Antwoord uit je chat bewaard bij ${done.label}: ${done.titel}`, { soort: 'ok', duur: 7000 });
  }
  if (answers.length && !captures.length) S.vault.flush().catch((e) => toast(e.message));
  if (captures.length) {
    local.set('cm_inbox_seen', true);
    S.verwerken = { klaar: 0, totaal: captures.length };
    render();
    let empty = 0;
    const done = await processInbox(S.vault, captures, {
      ...pipelineOpts(),
      onEmpty: () => { empty += 1; },
      onProgress: (klaar, totaal) => {
        S.verwerken = { klaar, totaal };
        refreshItems();
        renderList();
      },
    });
    S.verwerken = null;
    if (done.length) toast(`${done.length} nieuwe link${done.length === 1 ? '' : 's'} geordend`);
    if (empty) setTimeout(() => toast(`${empty} lege deling${empty === 1 ? '' : 'en'} opgeruimd: de Opdracht stuurde geen link mee`), done.length ? 3000 : 0);
    S.vault.flush().catch((e) => toast(e.message));
  }
  refreshItems();
  await fixLearning();
  runAutoBundle();
  backfill();
  setTimeout(indexTexts, 1500);
  swipeTip();
}

// ---------- repairs and tidying up ----------
// Rules nobody changed can get the current ones: more words per folder, and
// platform names no longer count as a topic. Only on "Schoon op", never on
// its own: the file is yours.
const rulesOutdated = () => S.vault.system['regels.md'] === REGELS_V1;
function upgradeRules() {
  if (!rulesOutdated()) return false;
  S.vault.writeSystem('regels.md', REGELS);
  return true;
}

// An earlier version taught itself to put new items under "to learn from".
// Unopened ones it put there go back, once.
async function fixLearning() {
  const v = S.vault;
  if (!S.items.some(isLeren) || v.learner.migrated('doel-auto-1')) return;
  const ids = wronglyLearning(S.items, { makers: v.learner.state.makers, rulesText: v.system['regels.md'] });
  for (const id of ids) await v.update(id, { doel: undefined }).catch(() => {});
  if (!ids.length) return;
  refreshItems();
  toast(`${ids.length} nieuwe item${ids.length === 1 ? ' stond' : 's stonden'} door een fout bij Om van te leren en ${ids.length === 1 ? 'staat' : 'staan'} weer bij Om te posten`, {
    duur: 9000,
    actie: async () => {
      for (const id of ids) if (v.has(id)) await v.update(id, { doel: 'leren' }).catch(() => {});
      refreshItems();
      renderList();
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A post whose source keeps giving nothing is left alone after three tries
// on this device, so the same work is not offered again and again.
const enrichTries = () => local.get('cm_enrich_tries', {});
const canEnrich = (i) => needsEnrich(i) && (enrichTries()[i.id] || 0) < 3;

// One note: fetch its text again and repair it. The free reader allows about
// twenty pages a minute, so a note that needed the network is followed by a pause.
async function enrichOne(id) {
  let asked = false;
  const started = Date.now();
  const opts = { ...pipelineOpts(), fetchImpl: (...a) => { asked = true; return fetch(...a); } };
  let m = null;
  try {
    m = await reEnrich(S.vault, id, opts);
  } catch {
    // one note that fails must not stop the rest
  }
  if (!m) {
    const tries = enrichTries();
    tries[id] = (tries[id] || 0) + 1;
    local.set('cm_enrich_tries', tries);
  }
  return { meta: m, wait: asked ? Math.max(0, 3200 - (Date.now() - started)) : 0 };
}

// The Bron text of a note when this device has it, for a better folder choice.
function sourceText(id) {
  const raw = S.vault.cachedText(id);
  return raw === null ? '' : getSection(parseNote(raw).body, 'Bron').replace(/^> ?/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').slice(0, 3000);
}

function tidyCounts() {
  const tekst = S.items.filter(canEnrich).length;
  const plan = resortPlan(S.vault.list(), { rulesText: rulesOutdated() ? REGELS : S.vault.system['regels.md'], correcties: S.vault.learner.state.correcties, texts: new Map(S.items.map((i) => [i.id, sourceText(i.id)])) });
  return { tekst, mappen: plan.filter((m) => m.van !== m.naar).length };
}

// Everything at once: texts for posts that have none, then every
// automatically placed item to the folder it belongs in.
async function runTidy() {
  if (S.opschoon?.bezig) return;
  const v = S.vault;
  const todo = S.items.filter(canEnrich).map((i) => i.id);
  const t = { bezig: true, fase: 'tekst', klaar: 0, totaal: todo.length, gevonden: 0, moves: [], stop: false, wacht: 0, regels: null };
  S.opschoon = t;
  if (rulesOutdated()) {
    t.regels = v.system['regels.md'];
    upgradeRules();
  }
  render();
  for (const id of todo) {
    if (t.stop) break;
    if (v.has(id)) {
      const { meta, wait } = await enrichOne(id);
      if (meta) t.gevonden += 1;
      t.klaar += 1;
      paintTidy();
      if (!t.stop) await sleep(wait);
    } else t.klaar += 1;
  }
  t.wacht = S.items.filter(needsEnrich).length;
  t.fase = 'mappen';
  paintTidy();
  refreshItems();
  // Tags that are filler ("actually", "introducing") make way for real topics.
  for (const i of S.items) {
    const rest = (i.tags || []).filter((x) => !FILLER.has(x) && !PAGE_WORDS.has(x));
    if (i.invalid || rest.length === (i.tags || []).length) continue;
    const fresh = suggestTags({ titel: i.titel, tekst: sourceText(i.id), auteur: i.auteur }, S.items.filter((x) => x.id !== i.id));
    const tags = [...new Set([...rest, ...fresh])].slice(0, Math.max(4, rest.length));
    try {
      await v.update(i.id, { tags });
      t.gevonden += 1;
    } catch {
      // an invalid note keeps its tags
    }
  }
  refreshItems();
  // What you once moved yourself is marked, so it never moves again.
  const all = v.list();
  for (const id of handPlaced(all, v.learner.state.correcties)) {
    if (v.meta(id).ordening !== BY_HAND) await v.update(id, { ordening: BY_HAND }).catch(() => {});
  }
  const texts = new Map(all.map((i) => [i.id, sourceText(i.id)]));
  const plan = resortPlan(v.list(), { rulesText: v.system['regels.md'], correcties: v.learner.state.correcties, texts });
  for (const m of plan) {
    if (!v.has(m.id)) continue;
    const before = v.meta(m.id);
    try {
      await v.update(m.id, { map: m.naar, ordening: m.reden });
      if (m.van !== m.naar) t.moves.push({ id: m.id, titel: m.titel, van: m.van, naar: m.naar, ordening: before.ordening });
    } catch {
      // an invalid note stays where it is
    }
  }
  refreshItems();
  // Bundles and topics made of platform words go; real ones are found again.
  const pruned = pruneBundles(S.items, bundleModel(), (x) => FILLER.has(x) || PAGE_WORDS.has(x));
  if (pruned.removed) v.writeSystem('bundels.md', stringifyBundles(pruned.model));
  runAutoBundle();
  retopic();
  t.bezig = false;
  t.fase = 'klaar';
  v.flush().catch((e) => toast(e.message));
  render();
}

// Productions whose topics were platform words ("Main content", "Photos")
// get the topics their sources have now.
function retopic() {
  const v = S.vault;
  const junk = (o) => topicKey(o).split('-').every((w) => PAGE_WORDS.has(w)) || PAGE_WORDS.has(topicKey(o));
  let changed = false;
  const next = v.content.map((p) => {
    if (!(p.onderwerpen || []).some(junk)) return p;
    const metas = (p.bronnen || []).filter((id) => v.has(id)).map((id) => v.meta(id));
    if (!metas.length) return p;
    const { onderwerpen } = topicsOf(metas, bundleModel());
    const auto = (p.titel || '').split(' en ').every((part) => junk(part));
    changed = true;
    return { ...p, onderwerpen, titel: auto ? productionTitle(metas, onderwerpen) : p.titel };
  });
  if (changed) v.saveContent(next);
}

async function undoTidy() {
  const t = S.opschoon;
  if (!t?.moves.length) return;
  for (const m of t.moves) {
    if (S.vault.has(m.id)) await S.vault.update(m.id, { map: m.van, ordening: m.ordening }).catch(() => {});
  }
  if (t.regels) S.vault.writeSystem('regels.md', t.regels);
  S.opschoon = null;
  refreshItems();
  S.vault.flush().catch(() => {});
  render();
  toast(t.regels ? 'De items staan weer in de map waar ze stonden, met je oude regels' : 'De items staan weer in de map waar ze stonden');
}

function paintTidy() {
  const box = $('#tidy');
  if (box) box.outerHTML = tidyHtml();
}

// The card on top of Mappen: what there is to tidy, how far it is, what moved.
function tidyHtml() {
  const t = S.opschoon;
  if (t?.bezig) {
    const pct = t.fase === 'tekst' && t.totaal ? Math.round((t.klaar / t.totaal) * 100) : 100;
    return `<div class="panel tidy" id="tidy">
      <h3>${icon('sparkle')}Opschonen</h3>
      <div class="dl"><div class="dl-bar"><span style="width:${pct}%"></span></div>
      <p class="small muted dl-text">${t.fase === 'tekst' ? `Tekst ophalen: ${t.klaar} van ${t.totaal}${t.gevonden ? `, ${t.gevonden} verbeterd` : ''}. Laat de app open.` : 'Items in de juiste map zetten...'}</p></div>
      ${t.fase === 'tekst' ? `<button class="btn ghost" data-action="tidy-stop">${t.stop ? 'Stopt na dit item...' : 'Stop en ga door met de mappen'}</button>` : ''}
    </div>`;
  }
  if (t?.fase === 'klaar') {
    const flows = new Map();
    for (const m of t.moves) flows.set(`${m.van}\n${m.naar}`, (flows.get(`${m.van}\n${m.naar}`) || 0) + 1);
    const rows = [...flows].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => {
      const [van, naar] = k.split('\n');
      return `<div class="stat-row"><span class="stat-name">${esc(van)} naar ${esc(naar)}</span><b>${n}</b></div>`;
    }).join('');
    const inbox = S.items.filter((i) => i.map === 'Inbox').length;
    return `<div class="panel tidy" id="tidy">
      <h3>${icon('check')}Opgeschoond</h3>
      <p class="small">${t.gevonden} item${t.gevonden === 1 ? ' kreeg' : 's kregen'} tekst, een titel of betere tags. ${t.moves.length} item${t.moves.length === 1 ? ' ging' : 's gingen'} naar een andere map.</p>
      ${rows ? `<div class="stat-list">${rows}</div>` : ''}
      ${t.wacht ? `<p class="small muted">Voor ${t.wacht} item${t.wacht === 1 ? '' : 's'} gaf de bron nu geen tekst. De app probeert het later vanzelf opnieuw.</p>` : ''}
      ${inbox ? `<p class="small muted">${inbox} item${inbox === 1 ? ' staat' : 's staan'} in Inbox omdat de app niet zeker is. Open er een en tik op een voorgestelde map: daar leert de app het snelst van.</p>` : ''}
      <div class="make-row">
        ${t.moves.length ? `<button class="btn ghost" data-action="tidy-undo">Zet de mappen terug</button>` : ''}
        <button class="btn" data-action="tidy-close">Klaar</button>
      </div>
    </div>`;
  }
  const c = tidyCounts();
  const regels = rulesOutdated();
  if (!c.tekst && !c.mappen && !regels) return '<div id="tidy"></div>';
  const parts = [];
  if (c.tekst) parts.push(`${c.tekst} bewaarde post${c.tekst === 1 ? ' heeft' : 's hebben'} nog geen tekst of echte titel`);
  if (c.mappen) parts.push(`${c.mappen} item${c.mappen === 1 ? ' staat' : 's staan'} waarschijnlijk in de verkeerde map`);
  return `<div class="panel tidy" id="tidy">
    <h3>${icon('sparkle')}Opschonen</h3>
    <p class="small">${parts.join(' en ')}.</p>
    <p class="small muted">De app haalt de tekst van die posts op, geeft ze een titel en tags, en zet elk automatisch geplaatst item in de map waar het hoort. Notities met een nieuwe titel krijgen ook een nieuwe bestandsnaam in Obsidian. Wat je zelf verplaatste blijft staan. ${regels ? 'Je regels voor mappen (regels.md) krijgen meer woorden per map en er komt een map <b>Design &amp; Vibe Coding</b> bij; je oude regels komen terug als je de mappen terugzet. ' : ''}${c.tekst > 10 ? `Dit duurt ongeveer ${Math.ceil((c.tekst * 3.5) / 60)} minuten; laat de app open.` : ''}</p>
    <button class="btn primary" data-action="tidy-start">${icon('sparkle')}Schoon op</button>
  </div>`;
}

// The folders to offer for an item, best first, never the one it is in.
let folderMemo = { items: null, model: null };
function folderSuggestions(d) {
  if (folderMemo.items !== S.items) folderMemo = { items: S.items, model: trainModel(S.items.filter((i) => i.id !== d.id)) };
  const text = getSection(d.body || '', 'Bron').replace(/^> ?/gm, '').slice(0, 3000);
  const c = classify({ ...d, tekst: text }, folderMemo.model, parseRules(S.vault.system['regels.md']));
  return [c.map, ...c.kandidaten].filter((f) => f && f !== 'Inbox' && f !== d.map).slice(0, 3);
}

// Older items without a preview get one in the background, a few per visit.
async function backfill() {
  if (S.backfilling) return;
  S.backfilling = true;
  try {
    const found = await backfillPreviews(S.vault, { ...pipelineOpts(), onProgress: () => { refreshItems(); renderList(); } }, 10);
    if (found) S.vault.flush().catch(() => {});
  } catch {
    // previews are a nice-to-have
  } finally {
    S.backfilling = false;
  }
}

// ---------- full-text search ----------
const noteTexts = new Map(); // id -> { raw, plain, folded }
function noteText(id) {
  const raw = S.vault.cachedText(id);
  if (raw === null) return null;
  const c = noteTexts.get(id);
  if (c && c.raw === raw) return c;
  const plain = plainText(parseNote(raw).body);
  const entry = { raw, plain, folded: fold(plain) };
  noteTexts.set(id, entry);
  return entry;
}

// Reads every note once in the background, so search covers the full text.
// After the first time the texts come from this device.
let indexRender;
async function indexTexts() {
  if (S.indexing || !S.vault) return;
  S.indexing = true;
  const vault = S.vault;
  try {
    const n = await vault.loadTexts((klaar, totaal) => {
      S.tekst = { klaar, totaal };
      if (!S.q || indexRender) return;
      indexRender = setTimeout(() => {
        indexRender = null;
        renderList();
      }, 400);
    });
    S.tekst = null;
    if (n && S.q) renderList();
    vault.textCache?.prune(new Set(vault.files.values())).catch(() => {});
  } finally {
    S.indexing = false;
  }
}

function searchState() {
  if (!S.vault) return '';
  const n = S.items.filter((i) => S.vault.cachedText(i.id) !== null).length;
  return `${n} van ${S.items.length} notities doorzoekbaar op dit apparaat${S.tekst ? ' (laden...)' : ''}`;
}

// ---------- markdown ----------
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" referrerpolicy="no-referrer">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => `<span class="wikilink">${b || a}</span>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}

function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '';
  const para = [];
  const flush = () => {
    if (para.length) html += `<p>${para.map((l) => inline(esc(l))).join('<br>')}</p>`;
    para.length = 0;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      html += `<h${h[1].length}>${inline(esc(h[2]))}</h${h[1].length}>`;
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      html += '<hr>';
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      const callout = buf[0]?.match(/^\[!(\w+)\]\s*(.*)$/);
      html += callout
        ? `<blockquote class="callout"><div class="callout-title">${esc(callout[2] || callout[1])}</div>${md(buf.slice(1).join('\n'))}</blockquote>`
        : `<blockquote>${md(buf.join('\n'))}</blockquote>`;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\s*[-*+]\s+/, ''));
      html += `<ul>${buf.map((b) => `<li>${inline(esc(b))}</li>`).join('')}</ul>`;
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      html += `<ol>${buf.map((b) => `<li>${inline(esc(b))}</li>`).join('')}</ol>`;
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return html;
}

// Notes and highlights have their own place in the detail view. Same rule as
// the vault: notes end only at a heading the app writes.
function withoutNotes(body, image) {
  const out = removeSection(body.replace(/^## Mijn notities[ \t]*\n[\s\S]*?(?=^## (?:Kernpunten|Content-ideeën|Markeringen|Bron)[ \t]*$|(?![\s\S]))/m, ''), MARKERINGEN);
  // The preview already shows as the large image at the top.
  return image ? out.split(`![](${image})`).join('') : out;
}

// ---------- routing ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [view, ...rest] = h.split('/');
  S.view = view || 'feed';
  S.param = decodeURIComponent(rest.join('/'));
  if (S.view === 'feed') S.map = null;
  if (S.view === 'map') {
    if (S.map !== S.param) S.bundel = null;
    S.map = S.param;
  }
  if (S.view === 'feed') S.bundel = null;
}

const go = (hash) => {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
};

async function onRoute() {
  const prev = S.view;
  route();
  if (S.view === 'deel') return handleShare();
  if (S.view === 'video') openVideoRoute();
  // A newly opened item starts at the top; back in the feed you land where you were.
  if (S.view === 'item' && prev !== 'item') S.itemFrom = prev;
  if (S.view === 'concept' && !['concept', 'item'].includes(prev)) S.conceptFrom = prev;
  if (S.view !== 'concept') {
    S.conceptEdit = null;
    S.plakVeld = false;
  }
  // Leaving the editor: what was typed is saved first.
  if (prev === 'editor' && S.view !== 'editor' && S.editor) {
    clearTimeout(editorTimer);
    if (S.editor.staat !== 'bewaard') saveEditor();
    S.editor = null;
  }
  if (!['sorteren', 'item'].includes(S.view)) S.deck = null;
  // Done with a production: a fresh start for the next selection.
  if (prev === 'studio' && !['studio', 'concept'].includes(S.view) && S.vault && S.productie?.key === productionKey()) {
    S.selected.clear();
    S.prompt = '';
    S.productie = null;
  }
  hideMarkBar();
  if (S.view === 'item' && S.param !== S.openedId) {
    if (['feed', 'map'].includes(prev)) S.feedScroll = isDesktop() ? $('.main')?.scrollTop || 0 : window.scrollY;
    S.openedId = S.param;
    S.scrollTo = 'top';
  } else if (['feed', 'map'].includes(S.view) && prev === 'item') {
    S.scrollTo = 'feed';
    S.openedId = null;
  }
  render();
  if (!S.ready) return;
  if (S.view === 'item') loadDetail(S.param);
  if (S.view === 'concept') loadConcept(S.param);
  if (S.view === 'editor') loadEditor(S.param);
  if (S.view === 'vandaag') loadReview();
  if (['archief', 'vandaag'].includes(S.view)) refreshStats();
}

// #/video?url=... from the share sheet or a post: find the video right away.
function openVideoRoute() {
  const url = new URLSearchParams(location.hash.split('?')[1] || '').get('url') || '';
  if (url && url !== S.video?.invoer) {
    S.video = emptyVideo(url);
    findVideo();
  } else if (!S.video) S.video = emptyVideo();
}

async function loadDetail(id) {
  if (S.detail?.id !== id) {
    S.detail = null;
    S.embed = null;
    S.titelEdit = false;
  }
  renderDetail();
  try {
    const { meta, body, invalid } = await S.vault.get(id);
    S.detail = { ...decorate(meta), body, invalid, notities: getSection(body, 'Mijn notities') };
    renderDetail();
    if (meta.status === 'nieuw' && !invalid) {
      const m = await S.vault.update(id, { status: 'gelezen' });
      S.vault.learner.signal(m, 'geopend');
      S.detail.status = 'gelezen';
      renderList();
    }
  } catch (e) {
    toast(e.message);
  }
}

async function loadConcept(file) {
  S.concept = null;
  render();
  try {
    const { data, body } = await S.vault.readConcept(file);
    S.concept = { file, ...data, markdown: body };
    render();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- views ----------
function card(i) {
  const active = S.detail?.id === i.id && S.view === 'item';
  const cls = ['card', active && 'active', S.selected.has(i.id) && 'selected', i.status === 'archief' && 'archief'].filter(Boolean).join(' ');
  return `<article class="${cls}" data-action="open" data-id="${esc(i.id)}">
    <div class="card-main">
      <div class="card-top">
        ${i.status === 'nieuw' ? '<span class="dot" title="Ongelezen"></span>' : ''}
        <span class="type">${esc(TYPE_LABEL[i.type] || i.type || 'Item')}</span>
        <span class="src">${esc(i.bron || i.map)}</span>
        <span>${relDate(i.opgeslagen)}</span>
        ${i.markeringen ? `<span class="hl-count" title="${i.markeringen} markering${i.markeringen === 1 ? '' : 'en'}">${icon('marker')}${i.markeringen}</span>` : ''}
        ${isLeren(i) ? `<span class="les-count" title="${i.lessen ? `${i.lessen} les${i.lessen === 1 ? '' : 'sen'}` : 'Om van te leren, nog geen lessen'}">${icon('bulb')}${i.lessen || ''}</span>` : ''}
        ${i.ster ? `<span class="star-mini">${icon('star', true)}</span>` : ''}
        <span class="score ${scoreClass(i.rank)}" title="Basis ${i.score}, geleerd ${i.boost >= 0 ? '+' : ''}${i.boost}">${shown(i.rank)}</span>
      </div>
      <h3>${esc(i.titel)}</h3>
      ${i.fragment ? `<p class="snippet">${i.fragment.map((f) => (f.hit ? `<mark>${esc(f.t)}</mark>` : esc(f.t))).join('')}</p>`
        : i.samenvatting ? `<p>${esc(i.samenvatting)}</p>` : ''}
      <div class="tags">${i.status === 'gebruikt' ? `<span class="tag used" title="In je content-archief">${esc(productionsOf(i.id)[0]?.label || 'Gebruikt')}</span>` : ''}${firstTag(i)}${(i.tags || []).slice(0, 3).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
    </div>
    <div class="card-side">
      ${thumbHtml(i)}
      ${isLeren(i) ? '' : `<button class="select-box" data-action="select" data-id="${esc(i.id)}" aria-label="Selecteer voor een prompt">${icon('check')}</button>`}
    </div>
  </article>`;
}

function firstTag(i) {
  const b = bundleOf(i, bundleModel());
  if (S.map) return b ? `<span class="tag">${esc(b.naam)}</span>` : '';
  return `<span class="tag">${esc(i.map)}${b ? ` / ${esc(b.naam)}` : ''}</span>`;
}

// Bundle filter for the open folder: all, each bundle, items in no bundle.
function bundleChipsHtml() {
  if (!S.map) return '';
  const model = bundleModel();
  const list = bundlesFor(model, S.map);
  const inFolder = S.items.filter((i) => i.map === S.map && isActive(i));
  const count = (b) => inFolder.filter((i) => bundleOf(i, model)?.naam === b.naam).length;
  const other = inFolder.filter((i) => !bundleOf(i, model)).length;
  const chip = (v, label, n) => `<button class="chip ${S.bundel === v ? 'on' : ''}" data-action="bundel" data-v="${esc(v ?? '')}">${label}${n !== undefined ? `<span class="n">${n}</span>` : ''}</button>`;
  return `${chip(null, 'Alle onderwerpen')}${list.map((b) => chip(b.naam, `#${esc(b.naam)}`, count(b))).join('')}${list.length && other ? chip(OTHER, 'Overig', other) : ''}
    <button class="chip ghost" data-action="edit-bundels">${list.length ? 'Bewerk bundels' : '+ Bundel'}</button>
    ${S.bundel && S.bundel !== OTHER ? `<button class="chip accent" data-action="prompt-bundel">${icon('sparkle')}Prompt van deze bundel</button>` : ''}`;
}

function listHtml() {
  const busy = S.verwerken ? `<div class="panel small"><div class="row"><span class="spinner"></span>Nieuwe links ordenen: ${S.verwerken.klaar} van ${S.verwerken.totaal}</div></div>` : '';
  if (!S.items.length && !S.verwerken) {
    return `<div class="empty"><h2>Nog niets bewaard</h2><p>Deel een link via de Deel-knop op je iPhone, of tik op + om een link te plakken.</p><p><a href="#/instellingen">iPhone-opdracht instellen</a></p></div>`;
  }
  const items = visibleItems();
  const searching = parseQuery(S.q).length;
  const unread = S.items.filter((i) => i.status === 'nieuw' && (!S.map || i.map === S.map) && isLeren(i) === (S.doel === 'leren')).length;
  const banner = !searching && unread >= 2 && ['actief', 'nieuw'].includes(S.filter)
    ? `<button class="sort-banner" data-action="nav" data-href="#/sorteren"><span class="mini-deck" aria-hidden="true"><i></i><i></i><i></i></span><span class="sort-text"><b>${unread} ongelezen</b><small>Snel sorteren: veeg naar rechts of links</small></span><span class="chev-r">${icon('chevron')}</span></button>`
    : '';
  const hint = searching && S.tekst ? `<p class="small muted search-hint"><span class="spinner"></span>Volledige tekst laden: ${S.tekst.klaar} van ${S.tekst.totaal} notities. De resultaten vullen zich aan.</p>` : '';
  const none = searching ? 'Niets gevonden, ook niet in de volledige tekst.'
    : S.doel === 'leren' && !S.items.some(isLeren) ? 'Nog niets om van te leren. Open een item, bijvoorbeeld een video over storytelling, en kies <b>Om van te leren</b>. Nieuwe links over het maken van content komen hier vanzelf.'
      : 'Niets gevonden met dit filter.';
  return busy + banner + hint + (items.length ? items.map(card).join('') : `<div class="empty"><p>${none}</p></div>`);
}

function chipsHtml() {
  const base = (S.map ? S.items.filter((i) => i.map === S.map) : S.items).filter((i) => isLeren(i) === (S.doel === 'leren'));
  const count = {
    actief: base.filter(isActive).length,
    nieuw: base.filter((i) => i.status === 'nieuw').length,
    ster: base.filter((i) => i.ster).length,
    gebruikt: base.filter((i) => i.status === 'gebruikt').length,
    archief: base.filter((i) => i.status === 'archief').length,
  };
  return FILTERS.map(([k, label]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-action="filter" data-v="${k}">${label}<span class="n">${rollHtml(count[k], `chip:${S.map || ''}:${k}`)}</span></button>`).join('');
}

// Two kinds of saved items: material to post about, and makers to learn from.
function doelSegHtml() {
  const base = (S.map ? S.items.filter((i) => i.map === S.map) : S.items).filter(isActive);
  const n = base.filter(isLeren).length;
  const btn = (v, label, count) => `<button class="${S.doel === v ? 'on' : ''}" data-action="doel" data-v="${v}" aria-pressed="${S.doel === v}">${v === 'leren' ? icon('bulb') : icon('feed')}<span class="lbl">${label}</span><span class="n">${count}</span></button>`;
  return btn('posten', 'Om te posten', base.length - n) + btn('leren', 'Om van te leren', n);
}

// Newspaper-style line above the feed title: weekday, date and what is unread.
function dateline() {
  const day = new Date().toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const base = S.map ? S.items.filter((i) => i.map === S.map) : S.items;
  return `${day} · ${base.filter((i) => i.status === 'nieuw').length} ongelezen`;
}

function feedView() {
  return `<div class="topbar">
      ${S.map ? `<button class="icon-btn mobile-only" data-action="nav" data-href="#/mappen" aria-label="Terug">${icon('back')}</button>` : ''}
      <div style="flex:1;min-width:0"><span class="dateline" id="dateline">${esc(dateline())}</span><h1>${esc(S.map || 'Feed')}</h1></div>
      <button class="icon-btn" data-action="reload" aria-label="Vernieuwen" title="Vernieuwen">${icon('refresh')}</button>
      <button class="btn" data-action="sort" title="Sortering">${icon('sort')}${SORTS[S.sort]}</button>
    </div>
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="Zoek in alles, ook de volledige tekst" value="${esc(S.q)}" autocomplete="off"></label>
    <div class="doel-seg" id="doel-seg" role="group" aria-label="Soort items">${doelSegHtml()}</div>
    ${S.map && S.map !== 'Inbox' ? `<div class="chips bundles" id="bundles">${bundleChipsHtml()}</div>` : ''}
    <div class="chips" id="chips">${chipsHtml()}</div>
    <div class="list" id="list">${listHtml()}</div>`;
}

function foldersView() {
  return `<div class="topbar"><div style="flex:1"><span class="dateline">${S.items.length} items</span><h1>Mappen</h1></div><button class="btn" data-action="new-folder">${icon('plus')}Nieuw</button></div>
    ${tidyHtml()}
    <div class="list folders">${folderList().map((f) => `
      <div class="card" data-action="nav" data-href="#/map/${encodeURIComponent(f.naam)}">
        <div class="row">${icon(f.naam === 'Inbox' ? 'inbox' : 'folder')}<h3 style="margin:0;flex:1">${esc(f.naam)}</h3><span class="muted">${f.aantal}</span></div>
        ${bundlesFor(bundleModel(), f.naam).length ? `<div class="tags" style="margin-top:8px">${bundlesFor(bundleModel(), f.naam).map((b) => `<span class="tag">#${esc(b.naam)}</span>`).join('')}</div>` : ''}
      </div>`).join('')}
      ${archiveFolderHtml()}
    </div>`;
}

// The content archive as a folder: a little stack, one card per piece of content.
function archiveFolderHtml() {
  const prods = archivedProductions();
  return `<div class="card archive-folder tilt" data-action="nav" data-href="#/archief">
    <div class="row">${icon('layers')}<h3 style="margin:0;flex:1">Content-archief</h3><span class="muted">${prods.length}</span></div>
    <p class="small muted" style="margin-top:6px">${prods.length ? `Laatst: ${esc(prods[0].label)}, ${esc(prods[0].titel)}` : 'Wat je van je bronnen maakte, als stapeltjes.'}</p>
  </div>`;
}

function folderOptions(current) {
  const names = folderList().map((f) => f.naam);
  if (current && !names.includes(current)) names.unshift(current);
  return `${names.map((n) => `<option value="${esc(n)}" ${n === current ? 'selected' : ''}>${esc(n)}</option>`).join('')}<option value="__new">+ Nieuwe map...</option>`;
}

function detailHtml() {
  const d = S.detail;
  if (!d) return '<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>';
  const origineel = safeUrl(d.url);
  const embed = embedFor(d);
  const image = httpsImage(d.afbeelding);
  let hero = '';
  if (embed && S.embed === d.id) {
    hero = `<div class="embed" style="${embed.ratio ? `aspect-ratio:${embed.ratio}` : `height:${embed.height}px`}"><iframe src="${esc(embed.src)}" title="Originele post" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  } else if (image) {
    hero = `<figure class="hero ${embed ? 'playable' : ''}" ${embed ? 'data-action="embed"' : ''}><img src="${esc(image)}" alt="" referrerpolicy="no-referrer" decoding="async">${embed ? `<span class="play">${icon('play', true)}${esc(embed.label)}</span>` : ''}</figure>`;
  } else if (embed) {
    hero = `<button class="btn block embed-btn" data-action="embed">${icon('play', true)}${esc(embed.label)} in de app</button>`;
  }
  return `<div class="detail">
    <button class="btn ghost back mobile-only" data-action="back">${icon('back')}Terug</button>
    ${hero}
    <div class="card-top"><span class="type">${esc(TYPE_LABEL[d.type] || d.type || 'Item')}</span><span>${esc(d.map)}</span><span>${relDate(d.opgeslagen)}</span></div>
    ${S.titelEdit && !d.invalid
    ? `<div class="title-edit"><input id="title-input" value="${esc(d.titel)}" aria-label="Titel" autocomplete="off" enterkeyhint="done">
        <button class="btn primary" data-action="save-title">${icon('check')}Bewaar</button><button class="btn ghost" data-action="cancel-title">Annuleer</button></div>
        <p class="small muted title-hint">De bestandsnaam in Obsidian verandert mee.</p>`
    : `<div class="title-row"><h2>${esc(d.titel)}</h2>${d.invalid ? '' : `<button class="icon-btn title-btn" data-action="edit-title" aria-label="Titel aanpassen" title="Titel aanpassen">${icon('pen')}</button>`}</div>`}
    <div class="meta-line">${d.bron ? `<span>${esc(d.bron)}</span>` : ''}${d.auteur ? `<span>${esc(d.auteur)}</span>` : ''}<span>${esc(d.status)}</span></div>
    ${d.invalid ? '<div class="panel error-text">De eigenschappen van deze notitie zijn ongeldig (YAML). Herstel ze in Obsidian; tot die tijd kun je hem hier niet aanpassen.</div>' : `
    <div class="doel-switch" role="radiogroup" aria-label="Waarvoor bewaar je dit?">
      <button role="radio" aria-checked="${!isLeren(d)}" class="${isLeren(d) ? '' : 'on'}" data-action="set-doel" data-v="posten">${icon('feed')}<span><b>Om te posten</b><small>Materiaal voor je eigen content</small></span></button>
      <button role="radio" aria-checked="${isLeren(d)}" class="${isLeren(d) ? 'on' : ''}" data-action="set-doel" data-v="leren">${icon('bulb')}<span><b>Om van te leren</b><small>Hoe deze maker het doet</small></span></button>
    </div>`}
    <div class="action-row">
      <button class="icon-btn ${d.ster ? 'on' : ''}" data-action="star" data-pop="star" aria-pressed="${d.ster}" aria-label="Ster">${icon('star', d.ster)}</button>
      <button class="icon-btn ${d.oordeel === 1 ? 'on-good' : ''}" data-action="vote" data-v="1" data-pop="vote1" aria-pressed="${d.oordeel === 1}" aria-label="Meer hiervan">${icon('up')}</button>
      <button class="icon-btn ${d.oordeel === -1 ? 'on-bad' : ''}" data-action="vote" data-v="-1" data-pop="vote-1" aria-pressed="${d.oordeel === -1}" aria-label="Minder hiervan">${icon('down')}</button>
      <button class="icon-btn ${d.status === 'archief' ? 'on' : ''}" data-action="archive" aria-label="Archiveer">${icon('archive')}</button>
      ${origineel ? `<a class="btn" href="${esc(origineel)}" target="_blank" rel="noopener">${icon('external')}Origineel</a>` : ''}
      ${VIDEO_TYPES.includes(d.type) && origineel ? `<button class="icon-btn" data-action="nav" data-href="#/video?url=${encodeURIComponent(d.url)}" aria-label="Download video of foto's" title="Download video of foto's">${icon('download')}</button>` : ''}
      <button class="icon-btn" data-action="delete" aria-label="Verwijder">${icon('trash')}</button>
    </div>
    <div class="scorebox"><div class="big">${rollHtml(shown(d.rank), 'score')}</div><div class="why">${d.ordening === 'haiku' ? 'Geordend met Claude Haiku.' : d.ordening === BY_HAND ? 'Door jou in deze map gezet.' : d.ordening === UNSURE ? 'Nog geen map: de app is niet zeker.' : d.ordening ? `Map gekozen via ${esc(d.ordening)}.` : ''}<br><span class="small">Basis ${d.score} ${d.boost >= 0 ? '+' : ''}${d.boost} geleerd${d.ster ? ', +15 ster' : ''}${d.oordeel ? `, ${d.oordeel > 0 ? '+' : ''}${d.oordeel * 10} duim` : ''}</span></div></div>
    ${usedInHtml(d)}
    ${isLeren(d) ? learnPanel(d) : `<div class="panel">
      <h3>Maak er content van</h3>
      <p class="small muted">Je krijgt een kant-en-klare prompt voor Claude of ChatGPT.</p>
      <div class="make-row">
        <button class="btn" data-action="make" data-v="linkedin">${icon('sparkle')}LinkedIn</button>
        <button class="btn" data-action="make" data-v="x">${icon('sparkle')}X</button>
        <button class="btn" data-action="make" data-v="instagram">${icon('sparkle')}Instagram</button>
        <button class="btn" data-action="make" data-v="tiktok">${icon('sparkle')}TikTok</button>
        <button class="btn" data-action="make" data-v="nieuwsbrief">${icon('sparkle')}Nieuwsbrief</button>
        <button class="btn ghost" data-action="select" data-id="${esc(d.id)}">${S.selected.has(d.id) ? 'In selectie' : 'Voeg toe aan selectie'}</button>
      </div>
    </div>`}
    <div class="field"><label for="map-select">Map</label><select id="map-select">${folderOptions(d.map)}</select>
      ${d.invalid || d.ordening === BY_HAND ? '' : (() => {
        const tips = folderSuggestions(d);
        return tips.length ? `<div class="folder-tips"><span class="small muted">${d.map === 'Inbox' ? 'Zet in' : 'Of in'}</span>${tips.map((f) => `<button class="chip" data-action="move-to" data-v="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : '';
      })()}
    </div>
    <div class="field"><label for="tags-input">Tags (komma's)</label><input id="tags-input" value="${esc((d.tags || []).join(', '))}" autocomplete="off"></div>
    <div class="field"><label for="notes">Mijn notities <span id="notes-state" class="small"></span></label><textarea id="notes" rows="4" placeholder="Jouw gedachten, invalshoek of hook. Gaat mee in de prompt en staat ook in Obsidian.">${esc(d.notities || '')}</textarea></div>
    ${highlightsPanel(d)}
    <div class="md" id="reader">${md(withoutNotes(d.body || '', image))}</div>
    <p class="small muted">Bestand: ${esc(d.path)}</p>
  </div>`;
}

// For an item to learn from: a prompt that pulls the lessons out, and the
// lessons themselves, which you can take into the Studio.
function learnPanel(d) {
  const video = ['youtube', 'tiktok', 'instagram', 'threads'].includes(d.type);
  const tekst = d.lessenTekst ?? lessonsOf(d.body || '');
  return `<div class="panel learn-panel">
    <h3>${icon('bulb')}Leer ervan</h3>
    <p class="small muted">Wat vertelt deze maker dat jij kunt toepassen? Laat Claude de lessen eruit halen en plak ze hieronder, of schrijf ze zelf.</p>
    ${video ? '<p class="small muted">Bij een video heeft Claude de tekst nodig: zet het transcript in <b>Mijn notities</b>, dan gaat het mee in de prompt.</p>' : ''}
    <div class="make-row">
      <button class="btn primary" data-action="lesson-chat" data-v="claude">${icon('external')}Kopieer prompt en open Claude</button>
      <button class="btn" data-action="lesson-chat" data-v="chatgpt">${icon('external')}ChatGPT</button>
      <button class="btn ghost" data-action="lesson-copy">${icon('copy')}Alleen kopieer</button>
    </div>
    <div class="field"><label for="lessen">Lessen <span id="lessen-state" class="small"></span></label>
      <textarea id="lessen" rows="${tekst ? 8 : 4}" placeholder="- Open met het einde, dan pas het begin.&#10;- Gebruik maar en dus, nooit en toen.">${esc(tekst)}</textarea></div>
    <div id="lessen-use">${lessonsUseHtml(d)}</div>
  </div>`;
}

const lessonsUseHtml = (d) => (d.lessen
  ? `<button class="btn block" data-action="use-lessons">${icon('sparkle')}Pas toe in de Studio</button>`
  : '<p class="small muted">Zodra er lessen staan, kun je ze in de Studio meegeven bij je eigen content.</p>');

// Saves what is in the Lessen field, without redrawing it while you type.
async function saveLessons(id, text) {
  try {
    const m = await S.vault.update(id, {}, { transform: (b) => withLessons(b, text) });
    refreshItems();
    renderList();
    if (S.detail?.id !== id) return;
    S.detail = detailWith(m, { lessenTekst: text, body: withLessons(S.detail.body || '', text) });
    const use = $('#lessen-use');
    if (use) use.innerHTML = lessonsUseHtml(S.detail);
    const st = $('#lessen-state');
    if (st) st.textContent = m.lessen ? `bewaard, ${m.lessen} les${m.lessen === 1 ? '' : 'sen'}` : 'bewaard';
  } catch (e) {
    toast(e.message, { soort: 'fout' });
  }
}

async function saveTitle() {
  const d = S.detail;
  const titel = ($('#title-input')?.value || '').replace(/\s+/g, ' ').trim();
  if (!d || !titel || titel === d.titel) {
    S.titelEdit = false;
    renderDetail();
    if (!titel) toast('Een titel kan niet leeg zijn');
    return;
  }
  const oud = d.titel;
  try {
    const m = await S.vault.retitle(d.id, titel);
    S.titelEdit = false;
    refreshItems();
    if (S.detail?.id === d.id) S.detail = detailWith(m);
    renderList();
    renderDetail();
    toast('Titel aangepast', { soort: 'ok', actie: async () => {
      const back = await S.vault.retitle(d.id, oud);
      refreshItems();
      if (S.detail?.id === d.id) S.detail = detailWith(back);
      renderList();
      renderDetail();
    } });
  } catch (e) {
    toast(e.message, { soort: 'fout' });
  }
}

// The open item with fresh properties: a property that was removed (like
// doel or lessen) does not linger from before.
function detailWith(m, extra = {}) {
  const { body, invalid, notities, lessenTekst } = S.detail;
  return { ...decorate(m), body, invalid, notities, lessenTekst, ...extra };
}

// The current item as a source, with notes typed since it was opened.
function detailSource(d) {
  const body = d.notities !== undefined ? setSection(d.body || '', NOTES, d.notities) : d.body || '';
  return { meta: d, body };
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }).replace('.', '');

function productionRow(p) {
  return `<div class="concept-row prod-row" data-action="nav" data-href="#/concept/${encodeURIComponent(p.file)}">
    <span class="prod">
      <span class="prod-top"><span class="soort">${esc(p.label)}</span><span class="small muted">${shortDate(p.datum)}</span>${statusPill(p)}</span>
      <span class="prod-title">${esc(p.titel)}</span>
      <span class="small muted">${p.gepost && cijferLine(p.cijfers) ? esc(cijferLine(p.cijfers)) : `${p.bronnen.length} bron${p.bronnen.length === 1 ? '' : 'nen'}${p.onderwerpen?.length ? ` · ${p.onderwerpen.slice(0, 3).map((o) => `#${esc(o)}`).join(' ')}` : ''}`}</span>
    </span>
  </div>`;
}

function usedInHtml(d) {
  const prods = productionsOf(d.id);
  if (!prods.length) return '';
  return `<div class="panel used-panel">
    <h3>${icon('pen')}Gebruikt in</h3>
    ${prods.map(productionRow).join('')}
    ${d.status === 'gebruikt' ? `<button class="btn ghost" data-action="unuse" style="margin-top:6px">${icon('feed')}Zet terug in de feed</button>` : ''}
  </div>`;
}

// The content archive: what you made, with its sources, newest first.
// Productions whose note still exists (removed in Obsidian means gone here too).
function archivedProductions() {
  if (!S.vault) return [];
  const files = new Set(S.vault.concepts().map((c) => c.file));
  return S.vault.content.filter((p) => files.has(p.file));
}

function recentHtml() {
  const prods = archivedProductions();
  return `<div class="panel">
    <h3>Laatst gemaakt</h3>
    ${prods.slice(0, 3).map(productionRow).join('') || '<p class="muted small">Nog niets. Zodra je een prompt kopieert, komen de bronnen als stapeltje in je Content-archief.</p>'}
    ${prods.length ? `<button class="btn ghost" data-action="nav" data-href="#/archief" style="margin-top:6px">${icon('layers')}Alles in Content-archief</button>` : ''}
  </div>`;
}

// Small overlapping previews of the sources on a closed stack.
function facesHtml(sources) {
  return `<span class="faces">${sources.slice(0, 5).map(thumbHtml).join('')}${sources.length > 5 ? `<span class="thumb mono more">+${sources.length - 5}</span>` : ''}</span>`;
}

function stackHtml(p) {
  const open = S.openStacks.has(p.file);
  const sources = p.bronnen.map((id) => S.items.find((i) => i.id === id)).filter(Boolean);
  const n = sources.length;
  return `<section class="stack ${open ? 'open' : ''}" data-n="${Math.min(n, 3)}">
    <div class="stack-top tilt" data-action="stack" data-v="${esc(p.file)}" role="button" aria-expanded="${open}">
      <div class="card-top"><span class="type">${esc(p.label)}</span><span>${shortDate(p.datum)}</span>${statusPill(p)}</div>
      <h3>${esc(p.titel)}</h3>
      ${p.gepost && cijferLine(p.cijfers) ? `<p class="small stack-cijfers">${esc(cijferLine(p.cijfers))}</p>` : ''}
      ${p.onderwerpen?.length ? `<div class="tags">${p.onderwerpen.slice(0, 4).map((o) => `<span class="tag">#${esc(o)}</span>`).join('')}</div>` : ''}
      <div class="stack-foot">${facesHtml(sources)}<span class="small muted">${n} bron${n === 1 ? '' : 'nen'}</span><span class="chev">${icon('chevron')}</span></div>
    </div>
    ${open ? `<div class="stack-cards">
      ${sources.map(card).join('') || '<p class="small muted">De bronnen zijn verwijderd.</p>'}
      <div class="make-row">
        <button class="btn" data-action="nav" data-href="#/concept/${encodeURIComponent(p.file)}">${icon('pen')}${p.gepost ? 'Bekijk en cijfers' : p.klaar ? 'Publiceer' : 'Resultaat toevoegen'}</button>
        <button class="btn" data-action="reuse-sources" data-v="${esc(p.file)}">${icon('sparkle')}Maak iets anders</button>
      </div>
    </div>` : ''}
  </section>`;
}

function archiefView() {
  const v = S.vault;
  const prods = archivedProductions();
  const soorten = [...new Set(prods.map((p) => p.label))];
  if (S.archiefSoort && !soorten.includes(S.archiefSoort)) S.archiefSoort = null;
  const perStatus = (st) => prods.filter((p) => statusOf(p) === st).length;
  const shown = prods.filter((p) => (!S.archiefSoort || p.label === S.archiefSoort) && (!S.archiefStatus || statusOf(p) === S.archiefStatus));
  const stChip = (val, label, n) => `<button class="chip ${S.archiefStatus === val ? 'on' : ''}" data-action="archief-status" data-v="${val ?? ''}">${esc(label)}<span class="n">${n}</span></button>`;
  const known = new Set(v.content.map((p) => p.file));
  const older = v.concepts().filter((c) => !known.has(c.file));
  const bronnen = new Set(prods.flatMap((p) => p.bronnen)).size;
  const chip = (val, label, n) => `<button class="chip ${S.archiefSoort === val ? 'on' : ''}" data-action="archief-soort" data-v="${esc(val ?? '')}">${esc(label)}<span class="n">${n}</span></button>`;
  return `<div class="topbar">
      <button class="icon-btn mobile-only" data-action="nav" data-href="#/mappen" aria-label="Terug">${icon('back')}</button>
      <div style="flex:1;min-width:0"><span class="dateline">${prods.length} ${prods.length === 1 ? 'stuk' : 'stukken'} content · ${bronnen} bronnen</span><h1>Content-archief</h1></div>
    </div>
    ${prods.length ? `<div class="chips">${stChip(null, 'Alles', prods.length)}${stChip('prompt', 'Wacht op resultaat', perStatus('prompt'))}${stChip('klaar', 'Klaar om te posten', perStatus('klaar'))}${stChip('gepost', 'Gepost', perStatus('gepost'))}</div>` : ''}
    ${soorten.length > 1 ? `<div class="chips">${chip(null, 'Alle soorten', prods.length)}${soorten.map((l) => chip(l, l, prods.filter((p) => p.label === l).length)).join('')}</div>` : ''}
    ${resultsHtml()}
    <div class="stacks">${shown.map(stackHtml).join('') || (prods.length ? '<div class="empty"><p>Niets met dit filter.</p></div>' : '') || '<div class="empty"><h2>Nog niets gemaakt</h2><p>Kies bronnen in de feed en maak een prompt in de Studio. Zodra je hem kopieert, komt hier een stapeltje met die bronnen.</p></div>'}</div>
    ${older.length ? `<div class="panel"><h3>Eerder bewaarde concepten</h3>${older.slice(0, 30).map((c) => `<div class="concept-row" data-action="nav" data-href="#/concept/${encodeURIComponent(c.file)}"><span class="soort">${esc(c.soort)}</span><span style="flex:1">${esc(c.titel)}</span><span class="small muted">${esc(c.datum)}</span></div>`).join('')}</div>` : ''}
    ${statsHtml()}`;
}

// What your posted content did: per channel, your best posts and the topics
// that do better than usual.
function resultsHtml() {
  const r = resultaten(archivedProductions());
  if (!r.gepost) return '';
  return `<div class="panel results">
    <h3>${icon('up')}Wat je posts deden</h3>
    <p class="small">${r.gepost} gepost, ${r.gemeten} met cijfers.</p>
    <div class="stat-list">${r.kanalen.map((k) => `<div class="stat-row"><span class="stat-name">${esc(k.naam)}</span><span class="small muted">${k.gemeten ? `${shortNum(k.weergaven)} weergaven, gemiddeld ${shortNum(k.gemiddeld)} interactie` : 'nog geen cijfers'}</span><b>${k.gepost}</b></div>`).join('')}</div>
    ${r.beste.length ? `<div class="small" style="margin-top:12px">Beste posts</div>
      ${r.beste.slice(0, 3).map((b) => `<div class="concept-row prod-row" data-action="nav" data-href="#/concept/${encodeURIComponent(b.file)}"><span class="prod"><span class="prod-top"><span class="soort">${esc(b.label)}</span>${b.keer > 1 ? `<span class="pill st-gepost">${String(b.keer).replace('.', ',')}x je gewone</span>` : ''}</span><span class="prod-title">${esc(b.titel)}</span><span class="small muted">${esc(cijferLine(b.cijfers))}</span></span></div>`).join('')}` : ''}
    ${r.onderwerpen.length ? `<div class="small" style="margin-top:12px">Onderwerpen die werken</div>
      <div class="chips wrap">${r.onderwerpen.map((o) => `<button class="chip" data-action="search-topic" data-v="${esc(o.naam)}">#${esc(o.naam)}<span class="n">${String(o.keer).replace('.', ',')}x</span></button>`).join('')}</div>
      <p class="small muted">Zo veel keer je gewone interactie op dat kanaal. Bronnen van posts die goed scoren, stijgen in je feed.</p>` : ''}
  </div>`;
}
const shortNum = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}K` : String(n || 0));

function statsHtml() {
  const st = contentStats(S.vault.content, S.items);
  if (!st.totaal) return '';
  return `<div class="panel">
    <h3>Wat je maakt</h3>
    <p class="small">${st.totaal} ${st.totaal === 1 ? 'stuk' : 'stukken'} content, ${st.recent} in de laatste 30 dagen.</p>
    <div class="weights">${st.perSoort.map(([l, n]) => `<span class="w pos">${esc(l)} ${n}</span>`).join('')}</div>
    ${st.onderwerpen.length ? `<div class="small">Onderwerpen</div>
    <div class="stat-list">${st.onderwerpen.map((o) => `<div class="stat-row"><span class="stat-name">#${esc(o.naam)}</span><span class="small muted">${o.soorten.map(([l, n]) => `${esc(l)} ${n}`).join(', ')}</span><b>${o.aantal}</b></div>`).join('')}</div>` : ''}
    ${st.kansen.length ? `<div class="small" style="margin-top:12px">Bewaard, nog geen content van</div>
    <div class="chips wrap">${st.kansen.map((k) => `<button class="chip" data-action="search-topic" data-v="${esc(k.naam)}">#${esc(k.naam)}<span class="n">${k.aantal}</span></button>`).join('')}</div>` : ''}
  </div>`;
}

function highlightsPanel(d) {
  const list = parseHighlights(d.body || '');
  return `<div class="panel highlights">
    <h3>${icon('marker')}Markeringen${list.length ? ` <span class="muted small">${list.length}</span>` : ''}</h3>
    ${list.length ? list.map((h, n) => `<div class="hl-item">
      <blockquote><mark>${esc(h.tekst)}</mark></blockquote>
      ${h.notitie ? `<p class="hl-note">${esc(h.notitie)}</p>` : ''}
      <div class="row hl-actions"><button class="btn ghost" data-action="hl-note" data-v="${n}">${icon('pen')}${h.notitie ? 'Notitie aanpassen' : 'Notitie'}</button><button class="btn ghost" data-action="hl-remove" data-v="${n}">${icon('trash')}Weghalen</button></div>
    </div>`).join('') : '<p class="small muted">Selecteer tekst in het artikel hieronder en tik op <b>Markeer</b>. Markeringen gaan mee in je prompts, komen terug in Vandaag en staan geel in Obsidian.</p>'}
  </div>`;
}

function reviewCard(i, day) {
  const hls = S.reviewHl.get(i.id);
  const h = hls ? highlightOfDay(hls, day, i.id) : null;
  const terug = daysUntil(S.vault.herhaling, i.id);
  const id = esc(i.id);
  let quote = i.samenvatting ? `<p class="muted">${esc(i.samenvatting)}</p>` : '';
  if (h) quote = `<blockquote class="hl-quote"><mark>${esc(h.tekst)}</mark>${h.notitie ? `<p class="hl-note">${esc(h.notitie)}</p>` : ''}</blockquote>`;
  else if (!hls && i.markeringen) quote = '<div class="shimmer"></div><div class="shimmer" style="width:70%"></div>';
  return `<article class="review-card">
    <div class="review-head">
      <div style="flex:1;min-width:0">
        <div class="card-top"><span class="type">${esc(TYPE_LABEL[i.type] || i.type || 'Item')}</span><span class="src">${esc(i.bron || i.map)}</span><span>${relDate(i.opgeslagen)}</span></div>
        <h3 data-action="open" data-id="${id}">${esc(i.titel)}</h3>
      </div>
      ${thumbHtml(i)}
    </div>
    ${quote}
    <div class="make-row">
      <button class="btn" data-action="review-make" data-id="${id}">${icon('sparkle')}Maak content</button>
      <button class="btn" data-action="open" data-id="${id}">Lees</button>
    </div>
    <div class="review-foot small muted"><span>${terug === null ? 'Komt niet meer terug' : `Komt over ${terug} dagen terug`}</span>
      ${terug === null ? '' : `<button class="link-btn" data-action="review-stop" data-id="${id}">Niet meer tonen</button>`}</div>
  </article>`;
}

// The week against your goals, and the pieces that wait for you: to post,
// for their answer, for their numbers.
function publishTodayHtml() {
  const prods = archivedProductions();
  const ritme = weekRitme(prods, Object.fromEntries(Object.entries(S.vault.kanalen).map(([k, v]) => [k, v?.doel])));
  const klaar = prods.filter((p) => statusOf(p) === 'klaar');
  const fortnight = Date.now() - 14 * 864e5;
  const wacht = prods.filter((p) => statusOf(p) === 'prompt' && Date.parse(p.datum) > fortnight);
  const meten = teMeten(prods);
  if (!ritme.length && !klaar.length && !wacht.length && !meten.length) return '';
  const group = (titel, list, hint) => (list.length ? `<div class="small pub-group">${titel} <span class="muted">${list.length}</span></div>${hint ? `<p class="small muted">${hint}</p>` : ''}${list.slice(0, 4).map(productionRow).join('')}${list.length > 4 ? `<button class="link-btn" data-action="nav" data-href="#/archief">Alle ${list.length} in het Content-archief</button>` : ''}` : '');
  return `<div class="panel publish-today">
    <h3>${icon('pen')}Publiceren</h3>
    ${ritme.length ? `<div class="ritme">${ritme.map((r) => `<div class="ritme-item ${r.doel && r.gepost >= r.doel ? 'done' : ''}">${ringHtml(Math.min(r.gepost, r.doel || r.gepost), r.doel || Math.max(r.gepost, 1))}<span><b>${esc(r.naam)}</b><small>${r.gepost}${r.doel ? ` van ${r.doel}` : ''} deze week</small></span></div>`).join('')}</div>` : ''}
    ${group('Klaar om te posten', klaar)}
    ${group('Cijfers invullen', meten, 'Deze posts staan er lang genoeg om te zien wat ze deden.')}
    ${group('Wacht op het antwoord uit je chat', wacht)}
    ${!Object.values(S.vault.kanalen).some((v) => v?.doel) ? '<p class="small muted" style="margin-top:10px">Stel onder Instellingen, <b>Mijn kanalen</b>, in hoe vaak je per week wilt posten. Dan zie je hier je weekritme.</p>' : ''}
  </div>`;
}

function vandaagView() {
  const day = localDay();
  const items = S.reviewIds.map((id) => S.items.find((i) => i.id === id)).filter(Boolean);
  const head = `<div class="topbar"><div style="flex:1"><span class="dateline">${esc(new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }))}</span><h1>Vandaag</h1></div></div>
    <p class="muted">Elke dag komen een paar bewaarde items terug, met een van je markeringen. Zo zakt goed materiaal niet weg onder nieuwe links. Elke keer dat iets terugkomt, duurt het daarna twee keer zo lang.</p>`;
  if (!items.length) return `${head.replace(/<p class="muted">[\s\S]*$/, '')}${publishTodayHtml()}<div class="empty"><h2>Niets om te herhalen</h2><p>Bewaar een paar links. Vanaf morgen komen ze hier terug.</p></div>`;
  return `${head.replace(/<p class="muted">[\s\S]*$/, '')}${publishTodayHtml()}<h3 class="section-title">Terug uit je vault</h3>${head.match(/<p class="muted">[\s\S]*$/)?.[0] || ''}<div class="list review-list">${items.map((i) => reviewCard(i, day)).join('')}</div>
    <button class="btn primary block" data-action="review-prompt" style="margin-top:14px">${icon('sparkle')}Maak een nieuwsbrief van deze mix</button>`;
}

// ---------- video downloader ----------
const VIDEO_TYPES = ['tweet', 'tiktok', 'instagram', 'threads', 'linkedin', 'youtube'];
const emptyDl = () => ({ staat: 'rust', loaded: 0, total: 0, n: 0, van: 1, files: [], mislukt: 0 });
const emptyVideo = (invoer = '') => ({ invoer, staat: 'leeg', fout: '', info: null, keuze: 0, yKeuze: null, dl: emptyDl() });
const mb = (n) => `${(n / 1048576).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB`;
const duration = (sec) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '');
// iPhone: the share sheet saves to Photos or Files. Mac: straight to Downloads.
const touch = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
const shareable = (files) => touch() && Boolean(navigator.canShare?.({ files }));
const soortNaam = (m) => (m.soort === 'foto' ? 'foto' : 'video');
// "3 foto's en 1 video"
function telling(media) {
  const f = media.filter((m) => m.soort === 'foto').length;
  const v = media.length - f;
  return [f ? `${f} foto${f === 1 ? '' : "'s"}` : '', v ? `${v} video${v === 1 ? '' : "'s"}` : ''].filter(Boolean).join(' en ');
}

const progressHtml = () => '<div class="dl"><div class="dl-bar"><span style="width:0%"></span></div><p class="small muted dl-text"></p></div>';

// Downloaded: the share sheet on the iPhone, Downloads on the Mac.
function doneHtml(dl, mis = '') {
  const files = dl.files;
  const size = mb(files.reduce((t, f) => t + f.size, 0));
  const wat = files.length > 1 ? `${files.length} bestanden` : files[0].name;
  return dl.delen
    ? `<button class="btn primary block" data-action="video-save">${icon('download')}Bewaar in Foto's of Bestanden</button><p class="small muted">Klaar, ${files.length > 1 ? `${files.length} bestanden, ` : ''}${size}. Kies daarna <b>Bewaar</b>.${mis}</p>`
    : `<p class="small"><b>Klaar.</b> ${esc(wat)} ${files.length > 1 ? 'staan' : 'staat'} in je Downloads (${size}).${mis}</p><button class="btn" data-action="video-save">${icon('download')}Nog een keer opslaan</button>`;
}

// "37 MB", "ca. 9,2 MB" or "ca. 2,6 MB per minuut".
function formaatMaat(f, duur) {
  if (f.grootte) return `${f.schatting ? 'ca. ' : ''}${mb(f.grootte)}`;
  if (f.perMin && duur) return `ca. ${mb((f.perMin * 1048576 * duur) / 60)}`;
  if (f.perMin) return `ca. ${f.perMin.toLocaleString('nl-NL')} MB per minuut`;
  return '';
}

// The qualities on offer; with no server, the yt-dlp sizes.
const ytList = (y) => (y.formaten.length ? y.formaten : YT_FORMATEN);

// The chosen quality; 360p to start with, the smallest video otherwise.
function ytChoice(v) {
  const list = ytList(v.info.youtube);
  if (v.yKeuze !== null && list[v.yKeuze]) return v.yKeuze;
  const i = list.findIndex((f) => f.label === '360p');
  return i >= 0 ? i : Math.max(0, list.findIndex((f) => f.soort === 'video'));
}

function youtubeResultHtml(v) {
  const info = v.info;
  const y = info.youtube;
  const n = ytChoice(v);
  const f = ytList(y)[n];
  const dl = v.dl;
  let action = '';
  if (y.formaten.length) {
    const maat = formaatMaat(f, y.duur);
    action = `<button class="btn primary block" data-action="yt-download">${icon('download')}Download ${f.soort === 'audio' ? 'alleen geluid' : f.label}${maat ? ` (${esc(maat)})` : ''}</button>`;
    if (dl.staat === 'laden') action = progressHtml();
    else if (dl.staat === 'klaar') action = doneHtml(dl);
    else if (dl.staat === 'fout') {
      action = `<div class="panel" style="box-shadow:none;background:var(--bg);margin:0">
        <b>Downloaden lukte niet.</b>
        <p class="small muted">${esc(dl.fout || 'De server gaf het bestand niet door.')} Probeer een andere kwaliteit, of gebruik yt-dlp hieronder.</p>
        ${f.url ? `<a class="btn" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}Open het bestand</a>` : ''}
      </div>`;
    }
  }
  const cmd = ytdlpCommand(y.id, f || { soort: 'video', hoogte: 360 });
  return `<div class="panel video-result">
    <div class="card-top"><span class="type">YouTube</span>${info.auteur ? `<span>${esc(info.auteur)}</span>` : ''}${duration(y.duur) ? `<span>${duration(y.duur)}</span>` : ''}</div>
    ${info.titel ? `<p class="video-title">${esc(info.titel)}</p>` : ''}
    <a class="yt-thumb" href="${esc(y.link)}" target="_blank" rel="noopener"><img class="video-preview" src="${esc(y.thumb)}" alt="" referrerpolicy="no-referrer"></a>
    ${y.formaten.length ? '' : `<div class="panel error-panel"><b>Geen server gaf deze video</b><p class="small">De openbare YouTube-servers zijn nu niet bereikbaar of worden door YouTube geblokkeerd. Probeer het later nog eens, stel een eigen Cobalt-server in onder Instellingen, of gebruik yt-dlp op je Mac.</p></div>`}
    <div class="field"><label>Kwaliteit${y.formaten.length ? '' : ' voor yt-dlp'}</label>
      <div class="quality-list" role="radiogroup" aria-label="Kwaliteit">${ytList(y).map((x, i) => `<button role="radio" aria-checked="${i === n}" class="q ${i === n ? 'on' : ''}" data-action="yt-pick" data-v="${i}">
        <b>${esc(x.label)}</b><small>${esc(formaatMaat(x, y.duur) || x.ext || '')}</small></button>`).join('')}</div></div>
    ${y.formaten.length ? `${action}
      <p class="small muted yt-bron">Via ${esc(y.bron)}${y.bron === 'Cobalt' ? ', je eigen server' : ', een openbare server'}.${y.bron === 'Cobalt' ? '' : ' Kleiner dan 360p met beeld kan via een eigen Cobalt-server (Instellingen) of met yt-dlp.'}</p>` : ''}
    <details class="ytdlp" ${y.formaten.length ? '' : 'open'}><summary>Op je Mac met yt-dlp, werkt altijd</summary>
      <p class="small muted">Eenmalig in Terminal: <code>brew install yt-dlp ffmpeg</code> (met Homebrew). Daarna deze regel${f ? ` voor ${esc(f.soort === 'audio' ? 'alleen geluid' : f.label)}` : ''}; het bestand komt in Downloads.</p>
      <div class="copyline"><code>${esc(cmd)}</code><button class="icon-btn" data-action="copy" data-v="${esc(cmd)}" aria-label="Kopieer">${icon('copy')}</button></div>
    </details>
    ${S.ready && !S.items.some((i) => youtubeId(i.url) === y.id) ? `<button class="btn ghost" data-action="video-vault">${icon('plus')}Bewaar de video ook in je vault</button>` : ''}
  </div>`;
}

function videoResultHtml(v) {
  if (v.info.youtube) return youtubeResultHtml(v);
  const info = v.info;
  const pick = info.media[v.keuze];
  const many = info.media.length > 1;
  const dl = v.dl;
  const files = dl.files;
  let action = many
    ? `<button class="btn primary block" data-action="video-download" data-v="alles">${icon('download')}Download alles (${telling(info.media)})</button>
      <button class="btn block" data-action="video-download" style="margin-top:8px">${icon('download')}Alleen deze ${soortNaam(pick)} (${v.keuze + 1} van ${info.media.length})</button>`
    : `<button class="btn primary block" data-action="video-download">${icon('download')}Download ${soortNaam(pick)}${pick.grootte ? ` (${mb(pick.grootte)})` : ''}</button>`;
  if (dl.staat === 'laden') {
    action = progressHtml();
  } else if (dl.staat === 'klaar') {
    action = doneHtml(dl, dl.mislukt ? ` ${dl.mislukt === 1 ? '1 bestand lukte' : `${dl.mislukt} bestanden lukten`} niet. Kies ${dl.mislukt === 1 ? 'dat' : 'die'} in het stripje en probeer het los.` : '');
  } else if (dl.staat === 'fout') {
    const naam = soortNaam(pick);
    action = `<div class="panel" style="box-shadow:none;background:var(--bg);margin:0">
      <b>Direct downloaden lukte niet.</b>
      <p class="small muted">Deze site laat je browser het bestand niet zelf ophalen. Open de ${naam} en bewaar hem daar: op je iPhone ${naam === 'foto' ? 'door de foto ingedrukt te houden en <b>Bewaar in Foto\'s</b> te kiezen' : 'met de Deel-knop en <b>Bewaar in Bestanden</b>'}, op je Mac met rechtsklik en <b>Bewaar ${naam === 'foto' ? 'afbeelding' : 'video'} als</b>.</p>
      <a class="btn primary" href="${esc(pick.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}Open ${naam}</a>
    </div>`;
  }
  const poster = pick.voorbeeld || pick.thumb;
  const preview = pick.soort === 'foto'
    ? `<img class="video-preview" src="${esc(pick.voorbeeld || pick.thumb || pick.url)}" alt="${esc(`Foto ${v.keuze + 1}`)}" ${pick.breedte && pick.hoogte ? `width="${pick.breedte}" height="${pick.hoogte}"` : ''}>`
    : `<video class="video-preview" src="${esc(pick.url)}" ${poster ? `poster="${esc(poster)}"` : ''} controls playsinline preload="none"></video>`;
  const strip = many ? `<div class="media-strip" role="listbox" aria-label="Alle onderdelen van deze post">${info.media.map((m, n) => `
      <button class="media-thumb ${n === v.keuze ? 'on' : ''}" data-action="video-pick" data-v="${n}" role="option" aria-selected="${n === v.keuze}" aria-label="${esc(`${m.soort === 'foto' ? 'Foto' : 'Video'} ${n + 1}`)}">
        ${m.mini || m.thumb ? `<img src="${esc(m.mini || m.thumb)}" alt="" loading="lazy">` : ''}
        ${m.soort === 'video' ? `<span class="media-badge">${icon('video')}</span>` : ''}
        <span class="media-nr">${n + 1}</span>
      </button>`).join('')}</div>` : '';
  return `<div class="panel video-result">
    <div class="card-top"><span class="type">${esc(info.platform)}</span>${info.auteur ? `<span>${esc(info.auteur)}</span>` : ''}${many ? `<span>${telling(info.media)}</span>` : ''}${duration(pick.duur) ? `<span>${duration(pick.duur)}</span>` : ''}</div>
    ${info.titel ? `<p class="video-title">${esc(info.titel)}</p>` : ''}
    ${preview}
    ${strip}
    ${action}
    ${S.ready && !S.items.some((i) => i.url === info.url) ? `<button class="btn ghost" data-action="video-vault">${icon('plus')}Bewaar de post ook in je vault</button>` : ''}
  </div>`;
}

function videoView() {
  const v = S.video || (S.video = emptyVideo());
  const busy = v.staat === 'zoeken';
  return `<div class="topbar"><div style="flex:1;min-width:0"><span class="dateline">X, TikTok, Instagram, Threads, LinkedIn, YouTube</span><h1>Video en foto's downloaden</h1></div></div>
    <div class="video-input">
      <input id="video-url" type="url" inputmode="url" placeholder="Plak een link naar een post of video" value="${esc(v.invoer)}" autocapitalize="off" autocomplete="off">
      <button class="btn" data-action="video-paste">${icon('copy')}Plak</button>
    </div>
    <button class="gen block ${busy ? 'bezig' : ''}" data-action="video-find" ${busy ? 'aria-busy="true"' : ''}><span class="gen-ring" aria-hidden="true"></span><span class="gen-inner">${icon('search')}<span class="gen-text">${busy ? 'Zoeken...' : 'Zoek video of foto\'s'}</span></span></button>
    ${v.staat === 'fout' ? `<div class="panel error-panel"><b>Niet gelukt</b><p class="small">${esc(v.fout)}</p></div>` : ''}
    ${v.info ? videoResultHtml(v) : ''}
    <div class="panel video-help">
      <div class="platforms"><span class="pf ok">X</span><span class="pf ok">TikTok</span><span class="pf maybe">Instagram</span><span class="pf maybe">Threads</span><span class="pf maybe">LinkedIn</span><span class="pf maybe">YouTube</span></div>
      <p class="small muted">X en TikTok gaan via gratis diensten (fxtwitter, tikwm). Instagram, Threads en LinkedIn lezen we van de openbare post via Jina Reader; dat lukt niet bij elke post. Die diensten zien de link.</p>
      <p class="small muted">Foto's werken ook: foto-posts op X en Threads, foto-slideshows op TikTok en carrousels op Instagram. Je krijgt alle slides en downloadt ze in een keer. Foto's komen zo nodig via de gratis beeldproxy wsrv.nl, omdat Instagram, Threads en TikTok ze niet aan andere sites geven.</p>
      <p class="small muted">YouTube: je kiest zelf de kwaliteit, ook alleen geluid. Openbare Piped- of Invidious-servers geven 360p en alleen geluid, maar zijn niet altijd bereikbaar. Met een eigen Cobalt-server (Instellingen) krijg je elke kwaliteit, ook 144p. Op je Mac werkt yt-dlp altijd.</p>
      <p class="small muted">Alleen voor eigen gebruik. Wil je een video of foto van een ander posten, vraag dan eerst toestemming.</p>
    </div>`;
}

// Only the progress bar changes while downloading, so the preview keeps playing.
function paintProgress() {
  const { loaded, total, n, van } = S.video.dl;
  const part = total ? Math.min(1, loaded / total) : 0;
  const bar = $('.dl-bar span');
  if (bar && (total || van > 1)) bar.style.width = `${Math.round(((n + part) / van) * 100)}%`;
  const t = $('.dl-text');
  if (t) t.textContent = van > 1 ? `Downloaden: ${n + 1} van ${van}` : `Downloaden: ${mb(loaded)}${total ? ` van ${mb(total)}` : ''}`;
}

async function findVideo() {
  const invoer = ($('#video-url')?.value ?? S.video?.invoer ?? '').trim();
  S.video = { ...emptyVideo(invoer), staat: 'zoeken' };
  render();
  try {
    const cobalt = S.cfg.cobaltUrl ? { url: S.cfg.cobaltUrl, key: S.cfg.cobaltKey } : null;
    S.video = { ...S.video, staat: 'gevonden', info: await findMedia(invoer, { cobalt }) };
  } catch (e) {
    S.video = { ...S.video, staat: 'fout', fout: e.message };
  }
  render();
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/avif': 'avif' };

// One file, with progress. A photo that Instagram will not hand over directly
// comes through the image proxy instead.
async function fetchMedia(m, onProgress) {
  let res;
  try {
    res = await fetch(m.url, { referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    if (!m.reserve) throw e;
    res = await fetch(m.reserve, { referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
  const total = Number(res.headers.get('content-length')) || m.grootte || 0;
  const chunks = [];
  let loaded = 0;
  const reader = res.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
  } else chunks.push(new Uint8Array(await res.arrayBuffer()));
  const header = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (m.soort === 'foto') {
    const type = /^image\//.test(header) ? header : 'image/jpeg';
    const name = EXT[type] ? m.bestand.replace(/\.[a-z0-9]+$/i, `.${EXT[type]}`) : m.bestand;
    return new File(chunks, name, { type });
  }
  if (m.soort === 'audio') {
    const type = /^audio\//.test(header) ? header : 'audio/mp4';
    const ext = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg' }[type];
    return new File(chunks, ext ? m.bestand.replace(/\.[a-z0-9]+$/i, `.${ext}`) : m.bestand, { type });
  }
  return new File(chunks, m.bestand, { type: /^video\//.test(header) ? header : 'video/mp4' });
}

function downloadVideo(alles) {
  const v = S.video;
  return downloadList(alles ? v.info.media : [v.info.media[v.keuze]]);
}

// A YouTube quality: straight from Piped or Invidious, or first a fresh link
// from your Cobalt server.
async function downloadYouTube() {
  const v = S.video;
  const y = v.info.youtube;
  const f = y.formaten[ytChoice(v)];
  if (!f || !y.formaten.length) return;
  v.dl = { ...emptyDl(), staat: 'laden', total: f.grootte || 0 };
  render();
  paintProgress();
  let url = f.url;
  if (f.cobalt) {
    try {
      url = await cobaltLink({ url: S.cfg.cobaltUrl, key: S.cfg.cobaltKey }, y.link, f);
    } catch (e) {
      v.dl = { ...emptyDl(), staat: 'fout', fout: e.message };
      render();
      return;
    }
  }
  const naam = f.soort === 'audio' ? `geluid.${f.ext || 'm4a'}` : `${f.label}.${f.ext || 'mp4'}`;
  await downloadList([{ soort: f.soort, url, grootte: f.grootte, bestand: `youtube-${y.id}-${naam}` }]);
}

async function downloadList(list) {
  const v = S.video;
  v.dl = { ...emptyDl(), staat: 'laden', van: list.length, total: list[0].grootte || 0 };
  render();
  paintProgress();
  const files = [];
  let mislukt = 0;
  for (const [n, m] of list.entries()) {
    v.dl = { ...v.dl, n, loaded: 0, total: m.grootte || 0 };
    paintProgress();
    try {
      files.push(await fetchMedia(m, (loaded, total) => {
        v.dl = { ...v.dl, loaded, total };
        paintProgress();
      }));
    } catch {
      mislukt++;
    }
  }
  if (!files.length) {
    v.dl = { ...emptyDl(), staat: 'fout', fout: v.info.youtube ? 'De server gaf het bestand niet door.' : '' };
    render();
    return;
  }
  v.dl = { ...emptyDl(), staat: 'klaar', files, mislukt, delen: shareable(files) };
  if (!v.dl.delen) saveVideoFile();
  render();
  burst($('.video-result [data-action=video-save]') || $('.video-result'), ['#ffe25c', '#2f8a57']);
}

async function saveVideoFile() {
  const { files, delen } = S.video?.dl || {};
  if (!files?.length) return;
  if (delen) {
    try {
      await navigator.share({ files });
    } catch (e) {
      if (e.name !== 'AbortError') toast('Delen lukte niet. Probeer het nog eens.', { soort: 'fout' });
    }
    return;
  }
  // Browsers take several downloads in a row better with a short pause between them.
  for (const [n, file] of files.entries()) {
    if (n) await new Promise((r) => setTimeout(r, 400));
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  toast(files.length > 1 ? `${files.length} bestanden staan in je Downloads` : `${files[0].name} staat in je Downloads`, { soort: 'ok' });
}

// ---------- swipe to archive ----------
async function swipeArchive(id) {
  if (!S.vault?.has(id)) return renderList();
  const from = S.vault.meta(id).status;
  const to = from === 'archief' ? 'gelezen' : 'archief';
  const m = await patchItem(id, { status: to });
  if (!m) return renderList();
  toast(to === 'archief' ? 'Gearchiveerd' : 'Teruggezet in je feed', {
    actie: () => patchItem(id, { status: from }).then((back) => back && to === 'archief' && S.vault.learner.signal(back, 'archief', -1)),
  });
}

async function swipeStar(card) {
  const id = card.dataset.id;
  if (!S.vault?.has(id)) return;
  const aan = !S.vault.meta(id).ster;
  if (aan) burst(card.querySelector('.card-top') || card, ['#ffe36e', '#f2c200', '#15151d']);
  const m = await patchItem(id, { ster: aan });
  if (m) toast(aan ? 'Ster gegeven' : 'Ster weggehaald', { actie: () => patchItem(id, { ster: !aan }) });
}

// Once per device: how to clear the feed quickly.
function swipeTip() {
  if (local.get('cm_tip_swipe', false) || S.items.filter(isActive).length < 2) return;
  local.set('cm_tip_swipe', true);
  setTimeout(() => toast('Tip: veeg een kaart naar links voor het archief, naar rechts voor een ster', { duur: 6000 }), 1200);
}

// ---------- quick sort: a deck of unread items ----------
function startDeck() {
  const ids = S.items.filter((i) => i.status === 'nieuw' && (!S.map || i.map === S.map)).sort((a, b) => b.rank - a.rank).map((i) => i.id);
  S.deck = { ids, totaal: ids.length, ster: 0, archief: 0, later: 0, uitgesteld: new Set(), geschiedenis: [] };
}

function deckCard(i, n) {
  const img = httpsImage(i.afbeelding);
  const letter = String(i.bron || TYPE_LABEL[i.type] || i.titel || '?').replace(/^www\./, '').charAt(0).toUpperCase() || '?';
  return `<article class="deck-card ${n === 0 ? 'top' : ''}" data-i="${n}" data-id="${esc(i.id)}" ${n === 0 ? `aria-label="${esc(i.titel)}"` : 'aria-hidden="true"'}>
    <span class="stamp yes">Ster</span><span class="stamp no">Archief</span>
    <div class="deck-media ${img ? '' : 'mono'}" style="--h:${hue(i.bron || i.type || i.titel || '')}">${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" draggable="false">` : `<span>${esc(letter)}</span>`}</div>
    <div class="deck-body">
      <div class="card-top"><span class="type">${esc(TYPE_LABEL[i.type] || i.type || 'Item')}</span><span class="src">${esc(i.bron || i.map)}</span><span>${relDate(i.opgeslagen)}</span><span class="score ${scoreClass(i.rank)}">${shown(i.rank)}</span></div>
      <h3>${esc(i.titel)}</h3>
      ${i.samenvatting ? `<p>${esc(i.samenvatting)}</p>` : ''}
      <div class="tags"><span class="tag">${esc(i.map)}</span>${(i.tags || []).slice(0, 3).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
    </div>
  </article>`;
}

function sorteerView() {
  if (!S.deck) startDeck();
  const d = S.deck;
  d.ids = d.ids.filter((id) => S.items.some((i) => i.id === id && i.status === 'nieuw'));
  const rest = d.ids.filter((id) => !d.uitgesteld.has(id));
  const klaar = d.totaal - rest.length;
  const back = S.map ? `#/map/${encodeURIComponent(S.map)}` : '#/';
  const head = `<div class="topbar"><button class="icon-btn" data-action="nav" data-href="${back}" aria-label="Terug">${icon('back')}</button>
      <div style="flex:1;min-width:0"><span class="dateline">${klaar} van ${d.totaal} gesorteerd</span><h1>Snel sorteren</h1></div></div>
    <div class="deck-progress" aria-hidden="true"><span style="width:${d.totaal ? (klaar / d.totaal) * 100 : 100}%"></span></div>`;
  if (!rest.length) {
    return `${head}<div class="deck-done">
      <div class="check">${icon('check')}</div>
      <h2>${d.totaal ? 'Alles gesorteerd' : 'Niets ongelezen'}</h2>
      <p class="muted">${d.totaal ? `${d.ster} met ster, ${d.archief} gearchiveerd, ${d.later} voor later.` : 'Nieuwe links komen hier vanzelf.'}</p>
      <div class="make-row" style="justify-content:center">
        ${d.ster ? `<button class="btn primary" data-action="deck-stars">${icon('sparkle')}Maak content van je sterren</button>` : ''}
        <button class="btn" data-action="nav" data-href="${back}">Naar je feed</button>
      </div>
    </div>`;
  }
  const cards = rest.slice(0, 3).map((id, n) => deckCard(S.items.find((i) => i.id === id), n)).reverse().join('');
  return `${head}
    <p class="small muted deck-hint">Veeg naar rechts voor een ster, naar links voor het archief. Tik om te lezen.<span class="desktop-only"> Of gebruik de pijltjes.</span></p>
    <div class="deck">${cards}</div>
    <div class="deck-buttons">
      <button class="deck-btn no" data-action="deck" data-v="left">${icon('archive')}<span>Archief</span></button>
      <button class="deck-btn later" data-action="deck" data-v="later">${icon('clock')}<span>Later</span></button>
      <button class="deck-btn yes" data-action="deck" data-v="right">${icon('star')}<span>Ster</span></button>
    </div>`;
}

async function deckAction(dir, id) {
  const d = S.deck;
  S.deckBusy = false;
  if (!d || !id || !S.vault.has(id)) return render();
  if (dir === 'tap') return go(`#/item/${encodeURIComponent(id)}`);
  const meta = S.vault.meta(id);
  d.geschiedenis.push({ id, dir, prev: { ster: meta.ster, status: meta.status } });
  if (dir === 'right') {
    d.ster += 1;
    await patchItem(id, { ster: true, status: 'gelezen' });
  } else if (dir === 'left') {
    d.archief += 1;
    await patchItem(id, { status: 'archief' });
  } else {
    d.later += 1;
    d.uitgesteld.add(id);
  }
  render();
  if (!d.ids.some((x) => !d.uitgesteld.has(x)) && d.totaal) burst($('.deck-done .check'), ['#ffe25c', '#e0492a', '#2f8a57']);
  toast({ right: 'Ster gegeven', left: 'Gearchiveerd', later: 'Voor later' }[dir], { actie: undoDeck, duur: 4500 });
}

async function undoDeck() {
  const d = S.deck;
  const last = d?.geschiedenis.pop();
  if (!last) return;
  if (last.dir === 'right') d.ster -= 1;
  if (last.dir === 'left') d.archief -= 1;
  if (last.dir === 'later') {
    d.later -= 1;
    d.uitgesteld.delete(last.id);
  } else {
    const m = await patchItem(last.id, last.prev);
    if (m && last.dir === 'left') S.vault.learner.signal(m, 'archief', -1);
  }
  d.ids = [last.id, ...d.ids.filter((x) => x !== last.id)];
  render();
}

function swipeTop(dir) {
  const card = $('.deck-card.top');
  if (!card || S.deckBusy) return;
  S.deckBusy = true;
  flyOut(card, dir, () => deckAction(dir, card.dataset.id));
}

// ---------- setup checklist ----------
function setupTasks() {
  const c = S.cfg;
  const manual = local.get('cm_checklist', {});
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const inbox = local.get('cm_inbox_seen', false);
  const tasks = [{ id: 'vault', label: 'Vault gekoppeld', hint: c.modus === 'lokaal' ? 'Alleen op dit apparaat' : `${c.owner}/${c.repo}`, klaar: S.ready, auto: true }];
  if (c.modus !== 'lokaal') {
    tasks.push(
      { id: 'beginscherm', label: 'Op je beginscherm', hint: 'Safari, Deel, Zet op beginscherm', klaar: standalone || Boolean(manual.beginscherm), auto: standalone },
      { id: 'opdracht', label: 'Opdracht in je deelmenu', hint: 'Zie hieronder: iPhone, opslaan via de Deel-knop', klaar: inbox || Boolean(manual.opdracht), auto: inbox },
      { id: 'obsidian', label: 'Obsidian op je Mac', hint: 'Zie hieronder: Obsidian op je Mac', klaar: Boolean(manual.obsidian), auto: false },
    );
  }
  tasks.push(
    { id: 'link', label: 'Eerste link bewaard', hint: 'Deel een link of tik op +', klaar: S.items.length > 0, auto: true },
    { id: 'markering', label: 'Eerste markering', hint: 'Selecteer tekst in een artikel en tik op Markeer', klaar: S.items.some((i) => i.markeringen), auto: true },
    { id: 'content', label: 'Eerste content gemaakt', hint: 'Kies bronnen en kopieer een prompt', klaar: S.vault.content.length > 0, auto: true },
  );
  return tasks;
}

function checklistHtml() {
  const tasks = setupTasks();
  const done = tasks.filter((t) => t.klaar).length;
  return `<div class="panel checklist">
    <div class="check-head">${ringHtml(done, tasks.length)}<div><b>${done === tasks.length ? 'Alles staat klaar' : 'Aan de slag'}</b><div class="small muted" id="check-count" aria-live="polite">${done} van ${tasks.length} klaar</div></div></div>
    <ul>${tasks.map((t) => `<li><button type="button" role="checkbox" aria-checked="${t.klaar}" class="check-item" ${t.auto ? 'aria-disabled="true"' : `data-action="check" data-v="${t.id}"`}>
      <span class="box">${checkSvg}</span><span class="txt"><span class="strike">${esc(t.label)}</span><small>${esc(t.hint)}</small></span></button></li>`).join('')}</ul>
  </div>`;
}

const GEN_LABELS = { rust: 'Maak prompt', bezig: 'Prompt maken...', klaar: 'Klaar' };

function studioView() {
  const picked = [...S.selected].map((id) => S.items.find((i) => i.id === id)).filter(Boolean);
  return `<div class="topbar"><div style="flex:1"><span class="dateline">Prompt-generator</span><h1>Studio</h1></div><a class="btn" href="${TELEPROMPTER_URL}">${icon('video')}Teleprompter</a></div>
    <p class="muted">Kies bronnen (rondje op een kaart) en een vorm. Je krijgt een complete prompt met je profiel, stijl en bronnen. Plak die in Claude of ChatGPT; de app gebruikt zelf geen AI.</p>
    <div class="panel">
      <h3>Bronnen (${picked.length})</h3>
      ${picked.length
        ? `<div class="picked">${picked.map((i) => `<div class="picked-item"><span>${esc(i.titel)}</span><button class="icon-btn" data-action="unpick" data-id="${esc(i.id)}" aria-label="Verwijder">${icon('x')}</button></div>`).join('')}</div>`
        : '<p class="muted small">Nog niets gekozen.</p>'}
      <div class="make-row" style="margin-top:10px">
        <button class="btn" data-action="pick-week">${icon('sparkle')}Beste van deze week</button>
        <button class="btn" data-action="pick-stars">${icon('star')}Items met ster</button>
        ${picked.length ? '<button class="btn ghost" data-action="clear-picks">Wis selectie</button>' : ''}
      </div>
    </div>
    ${techniquesHtml()}
    <div class="field"><label>Wat wil je maken?</label>
      <div class="seg">${SOORTEN.map((s) => `<button class="${S.soort === s.id ? 'on' : ''}" data-action="soort" data-v="${s.id}"><b>${s.label}</b><span>${s.sub}</span></button>`).join('')}</div>
    </div>
    ${S.basis && S.basis.soort !== S.soort ? `<div class="notice small"><b>Op basis van je ${esc(S.basis.label.toLowerCase())}.</b> De prompt krijgt die tekst mee, zodat de kern gelijk blijft. <button class="link-btn" data-action="drop-basis">Zonder basis</button></div>` : ''}
    <div class="field"><label for="instructie">Extra instructie ${S.soort === 'vrij' ? '' : '(optioneel)'}</label>
      <textarea id="instructie" rows="3" placeholder="Bijv.: schrijf voor HR-managers, of: focus op de kosten voor het mkb">${esc(S.instructie)}</textarea></div>
    <button class="gen block ${S.gen || ''}" data-action="build-prompt" ${picked.length ? '' : 'disabled'}><span class="gen-ring" aria-hidden="true"></span><span class="gen-inner">${S.gen === 'klaar' ? icon('check') : icon('sparkle')}<span class="gen-text">${GEN_LABELS[S.gen || 'rust']}</span></span></button>
    ${S.prompt ? `<div class="panel result">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3>Je prompt</h3><span class="small muted">${S.prompt.length.toLocaleString('nl-NL')} tekens</span></div>
      <div class="make-row" style="margin:6px 0 12px">
        <button class="btn primary" data-action="copy-prompt">${icon('copy')}Kopieer</button>
        <button class="btn" data-action="open-chat" data-v="claude">${icon('external')}Kopieer en open Claude</button>
        <button class="btn" data-action="open-chat" data-v="chatgpt">${icon('external')}Kopieer en open ChatGPT</button>
      </div>
      ${S.productie?.key === productionKey()
        ? `<div class="notice small"><b>In je content-archief.</b> ${S.selected.size === 1 ? 'De bron staat' : `De ${S.selected.size} bronnen staan`} nu als stapeltje in je Content-archief (bij Mappen), niet meer in je feed. <button class="link-btn" data-action="undo-production" data-v="${esc(S.productie.file)}">Ongedaan maken</button></div>`
        : '<p class="small muted">Zodra je de prompt kopieert, gaan de bronnen als stapeltje naar je Content-archief.</p>'}
      <textarea id="prompt-text" rows="10" readonly>${esc(S.prompt)}</textarea>
      <div class="back-box">
        <b>Antwoord terug in de app</b>
        <p class="small muted">Kopieer het antwoord in Claude of ChatGPT, kom terug en tik op de knop. Daarna krijg je de tekst per kanaal klaar om te plakken, met teller.</p>
        <button class="btn primary block" data-action="paste-result">${icon('copy')}Plak het antwoord</button>
        ${S.plakVeld ? `<textarea id="resultaat" rows="6" placeholder="Plak hier het antwoord" style="margin-top:10px">${esc(S.resultaat)}</textarea>
          <button class="btn block" data-action="save-result" style="margin-top:8px">${icon('check')}Bewaar</button>` : ''}
      </div>
    </div>` : ''}
    ${recentHtml()}`;
}

// Lessons from other makers to apply in this piece.
function techniquesHtml() {
  const leer = S.items.filter((i) => isLeren(i) && i.status !== 'archief');
  if (!leer.length) return '';
  const met = leer.filter((i) => i.lessen).sort((a, b) => S.lessen.has(b.id) - S.lessen.has(a.id) || b.lessen - a.lessen);
  return `<div class="panel techniques">
    <h3>${icon('bulb')}Technieken toepassen${S.lessen.size ? ` <span class="small muted">(${S.lessen.size})</span>` : ''}</h3>
    ${met.length ? `<p class="small muted">Wat je van andere makers leerde. Kies er een paar; de prompt gebruikt ze bij het opbouwen en vertellen.</p>
      <div class="tech-list">${met.map((i) => `<button class="tech ${S.lessen.has(i.id) ? 'on' : ''}" data-action="toggle-les" data-id="${esc(i.id)}" aria-pressed="${S.lessen.has(i.id)}">
        <span class="tech-check">${icon('check')}</span><span class="tech-text"><b>${esc(i.titel)}</b><small>${esc([i.auteur || i.bron, `${i.lessen} les${i.lessen === 1 ? '' : 'sen'}`].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>`
      : `<p class="small muted">Je hebt ${leer.length} item${leer.length === 1 ? '' : 's'} om van te leren, maar nog geen lessen. Open er een onder <b>Om van te leren</b> en haal de lessen eruit.</p>`}
  </div>`;
}

// A production shows its result (or a field to paste it), its topics and
// its sources, which you can open or select again.
// ---------- publishing ----------
const statusPill = (p) => {
  const st = statusOf(p);
  const label = st === 'gepost' ? `gepost ${shortDate(p.gepost)}` : STATUS_LABEL[st].toLowerCase();
  return `<span class="pill st-${st}">${esc(label)}</span>`;
};

// What a production gives for its channel: every block you can copy, with
// the count the channel uses.
function outputOf(p, c) {
  return outputFor(p?.soort || '', conceptText(c));
}

function blockHtml(p, b, n, out) {
  const k = KANALEN[out.kanaal];
  const over = b.limiet && b.tel > b.limiet;
  const meter = b.limiet
    ? `<span class="count ${over ? 'over' : ''}" title="${over ? `${b.tel - b.limiet} te veel` : `nog ${b.limiet - b.tel} over`}">${b.tel} / ${b.limiet}</span>`
    : b.rol === 'script' ? `<span class="count">${duration(speakSeconds(b.tekst)) || '0:00'} spreektijd</span>` : '';
  const fold = b.rol === 'post' && k?.zichtbaar ? visiblePart(b.tekst, k.zichtbaar) : null;
  const hookable = b.rol === 'keuze' && /hook/i.test(b.naam) && out.blokken.some((x) => x.rol === 'post');
  return `<div class="pub-block ${b.rol}">
    <div class="pub-head"><b>${esc(b.naam)}</b>${meter}</div>
    <div class="pub-text">${esc(b.tekst)}</div>
    ${fold?.meer ? `<div class="pub-fold"><span class="small muted">Dit staat in de feed voor "meer":</span><p>${esc(fold.tekst)}<span class="muted"> ...meer</span></p></div>` : ''}
    <div class="make-row">
      <button class="btn ${b.rol === 'post' ? 'primary' : ''}" data-action="copy-block" data-v="${n}">${icon('copy')}Kopieer</button>
      ${(b.rol === 'post' || (b.rol === 'keuze' && ['x', 'threads'].includes(out.kanaal))) && k ? `<button class="btn" data-action="open-channel" data-v="${n}">${icon('external')}${k.compose ? `Open ${esc(k.naam)} met deze tekst` : `Kopieer en open ${esc(k.naam)}`}</button>` : ''}
      ${b.rol === 'script' ? `<button class="btn" data-action="to-teleprompter" data-v="${n}">${icon('video')}Zet in Teleprompter</button>` : ''}
      ${hookable ? `<button class="btn ghost" data-action="use-hook" data-v="${n}">Gebruik als opening</button>` : ''}
    </div>
  </div>`;
}

function publishHtml(p, c) {
  const out = outputOf(p, c);
  if (S.conceptEdit !== null) {
    return `<div class="panel">
      <h3>Tekst bewerken</h3>
      <p class="small muted">Markdown. Kopjes met ## verdelen de tekst in de blokken hieronder.</p>
      <textarea id="concept-edit" rows="16">${esc(S.conceptEdit)}</textarea>
      <div class="make-row" style="margin-top:10px"><button class="btn primary" data-action="save-concept-edit">${icon('check')}Bewaar</button><button class="btn ghost" data-action="cancel-concept-edit">Annuleer</button></div>
    </div>`;
  }
  const blocks = out.blokken.map((b, n) => blockHtml(p, b, n, out)).join('');
  if (p?.soort === 'nieuwsbrief') {
    const body = withoutSubjects(splitNewsletter(conceptText(c)).tekst);
    return `<div class="panel ed-entry">
        <h3>${icon('pen')}Nieuwsbrief</h3>
        <p class="small muted">${words(body).toLocaleString('nl-NL')} woorden, ${readMinutes(body)} min lezen. In de editor werk je de tekst bij en kopieer je hem met opmaak naar Substack.</p>
        <div class="make-row">
          <button class="btn primary" data-action="nav" data-href="#/editor/${encodeURIComponent(c.file)}">${icon('pen')}Open in de editor</button>
          <button class="btn" data-action="copy-substack">${icon('copy')}Kopieer tekst voor Substack</button>
        </div>
      </div>
      ${blocks}
      <div class="md ed-read">${md(body)}</div>
      <div class="make-row" style="margin:4px 0 14px">
        <button class="btn ghost" data-action="copy-concept">${icon('copy')}Kopieer als Markdown</button>
        <button class="btn ghost" data-action="paste-result">${icon('copy')}Plak een nieuwe versie</button>
      </div>`;
  }
  return `${blocks || `<div class="md">${md(conceptText(c))}</div>`}
    <div class="make-row" style="margin:4px 0 14px">
      <button class="btn" data-action="edit-concept">${icon('pen')}Bewerk tekst</button>
      <button class="btn ghost" data-action="copy-concept">${icon('copy')}Kopieer alles</button>
      ${p ? `<button class="btn ghost" data-action="paste-result">${icon('copy')}Plak een nieuwe versie</button>` : ''}
    </div>`;
}

// Posted or not, the link and what the post did.
function postedHtml(p) {
  const today = localDay();
  if (!p.gepost) {
    return `<div class="panel posted">
      <h3>${icon('check')}Gepost?</h3>
      <p class="small muted">Markeer dit als gepost. De app houdt dan je weekritme bij en vraagt later naar de cijfers.</p>
      <div class="field"><label for="post-link">Link naar je post (optioneel)</label>
        <div class="video-input"><input id="post-link" type="url" inputmode="url" placeholder="https://..." autocomplete="off" autocapitalize="off"><button class="btn" data-action="post-link-paste">${icon('copy')}Plak</button></div></div>
      <div class="field"><label for="post-date">Datum</label><input id="post-date" type="date" value="${today}" max="${today}"></div>
      <button class="btn primary block" data-action="mark-posted">${icon('check')}Markeer als gepost</button>
    </div>`;
  }
  const c = p.cijfers || {};
  const auto = statsSource(p.link);
  return `<div class="panel posted on">
    <h3>${icon('check')}Gepost op ${esc(new Date(p.gepost).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }))}</h3>
    ${p.link ? `<p class="small"><a href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener">${esc(p.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</a></p>`
      : `<div class="video-input" style="margin-bottom:10px"><input id="post-link" type="url" inputmode="url" placeholder="Link naar je post" autocomplete="off" autocapitalize="off"><button class="btn" data-action="save-post-link">Bewaar</button></div>`}
    <p class="small ${cijferLine(c) ? '' : 'muted'}" id="cijfer-line">${esc(cijferLine(c)) || 'Nog geen cijfers.'}${c.gemeten ? ` <span class="muted">(${relDate(c.gemeten)})</span>` : ''}</p>
    <div class="cijfer-grid">${Object.entries(CIJFER_LABEL).map(([k, label]) => `<label>${esc(label)}<input class="cijfer" data-k="${k}" inputmode="numeric" value="${c[k] ?? ''}" placeholder="0" autocomplete="off"></label>`).join('')}</div>
    <div class="make-row" style="margin-top:10px">
      <button class="btn primary" data-action="save-cijfers">${icon('check')}Bewaar cijfers</button>
      ${auto ? `<button class="btn" data-action="fetch-cijfers">${icon('refresh')}Haal op van ${auto === 'x' ? 'X' : 'TikTok'}</button>` : ''}
      <button class="btn ghost" data-action="unpost">Toch niet gepost</button>
    </div>
    ${auto ? '' : '<p class="small muted" style="margin-top:8px">Dit platform laat cijfers alleen aan jou zien. Neem ze over uit de statistieken van je post.</p>'}
  </div>`;
}

// One piece becomes the base for the same story on another channel.
function repurposeHtml(p) {
  const others = SOORTEN.filter((x) => x.id !== p.soort && x.id !== 'vrij');
  const made = new Set(S.vault.content.filter((x) => x.file !== p.file && sameSet(x.bronnen, p.bronnen)).map((x) => x.soort));
  return `<div class="panel">
    <h3>${icon('sparkle')}Maak er ook van</h3>
    <p class="small muted">Dezelfde kern voor een ander kanaal. De prompt krijgt deze tekst mee als basis.</p>
    <div class="chips wrap">${others.map((x) => `<button class="chip ${made.has(x.id) ? 'done' : ''}" data-action="repurpose" data-v="${x.id}">${made.has(x.id) ? icon('check') : ''}${esc(x.label)}</button>`).join('')}</div>
  </div>`;
}

// ---------- the newsletter editor ----------
// Write in Markdown, see it as it will look, and copy it as rich text that
// pastes into Substack with its headings, links and lists.
let editorTimer;

async function loadEditor(file) {
  if (S.editor?.file === file) return;
  S.editor = null;
  render();
  try {
    const { body } = await S.vault.readConcept(file);
    const p = productionByFile(file);
    const text = removeSection(removeSection(body, 'Bronnen in de vault'), 'Onderwerpen').trim();
    const n = splitNewsletter(/^> \[!todo\]/m.test(text) ? '' : text);
    S.editor = { file, titel: n.titel || p?.titel || '', ondertitel: p?.ondertitel || '', tekst: n.tekst, tab: 'schrijven', staat: 'bewaard' };
    render();
  } catch (e) {
    toast(e.message);
    go('#/studio');
  }
}

function saveEditor() {
  const e = S.editor;
  const p = e && productionByFile(e.file);
  if (!p) return;
  const done = fillProduction(p, joinNewsletter({ titel: e.titel, tekst: e.tekst }));
  if ((done.ondertitel || '') !== e.ondertitel.trim()) updateProduction(e.file, { ondertitel: e.ondertitel.trim() || undefined });
  e.staat = 'bewaard';
  const st = $('#ed-state');
  if (st) st.textContent = 'bewaard';
}

function editorChanged() {
  const e = S.editor;
  e.staat = 'typen...';
  const st = $('#ed-state');
  if (st) st.textContent = 'typen...';
  paintEditor();
  clearTimeout(editorTimer);
  editorTimer = setTimeout(saveEditor, 1500);
}

const editorBody = () => withoutSubjects(S.editor.tekst);
const previewHtml = () => toHtml(editorBody()).replace(/<img /g, '<img referrerpolicy="no-referrer" loading="lazy" ').replace(/<a /g, '<a target="_blank" rel="noopener" ');

// Only the preview and the counts change while typing, so the cursor stays put.
function paintEditor() {
  const e = S.editor;
  const pre = $('#ed-preview');
  if (pre) pre.innerHTML = `<h1>${esc(e.titel || 'Zonder titel')}</h1>${e.ondertitel.trim() ? `<p class="sub">${esc(e.ondertitel)}</p>` : ''}${previewHtml() || '<p class="muted">Nog geen tekst.</p>'}`;
  const count = $('#ed-count');
  if (count) count.textContent = `${words(editorBody()).toLocaleString('nl-NL')} woorden · ${readMinutes(editorBody())} min lezen`;
}

function editorView() {
  const e = S.editor;
  if (!e) return '<div class="detail"><div class="empty"><div class="spinner" style="margin:0 auto"></div></div></div>';
  const p = productionByFile(e.file);
  const subjects = splitNewsletter(joinNewsletter(e)).onderwerpregels;
  const tool = (kind, label, title) => `<button class="ed-tool" data-action="ed-format" data-v="${kind}" title="${title}" aria-label="${title}">${label}</button>`;
  return `<div class="editor">
    <div class="topbar">
      <button class="icon-btn" data-action="nav" data-href="#/concept/${encodeURIComponent(e.file)}" aria-label="Terug naar het stuk">${icon('back')}</button>
      <div style="flex:1;min-width:0"><span class="dateline">${esc(p?.label || 'Nieuwsbrief')} · <span id="ed-state">${esc(e.staat)}</span></span><h1>Editor</h1></div>
    </div>
    ${subjects.length ? `<div class="panel ed-subjects"><b class="small">Kies een onderwerpregel als titel</b><div class="chips wrap">${subjects.map((x, n) => `<button class="chip" data-action="ed-subject" data-v="${n}">${esc(x)}</button>`).join('')}</div></div>` : ''}
    <input id="ed-title" class="ed-title" value="${esc(e.titel)}" placeholder="Titel" aria-label="Titel" autocomplete="off">
    <input id="ed-sub" class="ed-sub" value="${esc(e.ondertitel)}" placeholder="Ondertitel (optioneel)" aria-label="Ondertitel" autocomplete="off">
    <div class="ed-tabs mobile-only" role="tablist">
      <button role="tab" aria-selected="${e.tab === 'schrijven'}" class="${e.tab === 'schrijven' ? 'on' : ''}" data-action="ed-tab" data-v="schrijven">Schrijven</button>
      <button role="tab" aria-selected="${e.tab === 'voorbeeld'}" class="${e.tab === 'voorbeeld' ? 'on' : ''}" data-action="ed-tab" data-v="voorbeeld">Voorbeeld</button>
    </div>
    <div class="ed-grid tab-${e.tab}">
      <div class="ed-write">
        <div class="ed-toolbar" role="toolbar" aria-label="Opmaak">
          ${tool('h2', 'H2', 'Kop')}${tool('h3', 'H3', 'Tussenkop')}${tool('vet', '<b>B</b>', 'Vet')}${tool('cursief', '<i>I</i>', 'Cursief')}${tool('link', icon('external'), 'Link')}${tool('citaat', '&ldquo;', 'Citaat')}${tool('lijst', '&bull;', 'Lijst')}${tool('nummers', '1.', 'Genummerde lijst')}${tool('lijn', '&mdash;', 'Scheidslijn')}
        </div>
        <textarea id="ed-text" spellcheck="true" placeholder="Schrijf of plak je nieuwsbrief. Kopjes met ##, vet met **, een lijst met - ." aria-label="Tekst">${esc(e.tekst)}</textarea>
      </div>
      <div class="ed-preview-wrap"><div class="ed-preview" id="ed-preview"></div></div>
    </div>
    <div class="ed-bar">
      <span class="small muted" id="ed-count"></span>
      <div class="make-row">
        <button class="btn" data-action="ed-copy-title">${icon('copy')}Titel</button>
        ${e.ondertitel.trim() ? `<button class="btn" data-action="ed-copy-sub">${icon('copy')}Ondertitel</button>` : ''}
        <button class="btn primary" data-action="ed-copy-body">${icon('copy')}Kopieer tekst voor Substack</button>
        <button class="btn" data-action="ed-open-substack">${icon('external')}Open Substack</button>
      </div>
      <p class="small muted">Plak de tekst in het tekstvak van een nieuwe post in Substack: koppen, vet, links, lijsten en citaten komen mee. De titel en ondertitel hebben in Substack hun eigen veld. De lijst met onderwerpregels gaat niet mee.</p>
    </div>
  </div>`;
}

// Rich text on the clipboard: HTML for editors that take it, plain text for
// the rest.
async function copyRich(html, text, label) {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
  } catch {
    // Browsers without that: copy the text as it is shown, from a box out of sight.
    const box = Object.assign(document.createElement('div'), { contentEditable: 'true', innerHTML: html });
    box.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;white-space:pre-wrap';
    document.body.append(box);
    const range = document.createRange();
    range.selectNodeContents(box);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    box.remove();
    if (!ok) return copy(text, `${label} (zonder opmaak)`);
  }
  toast(label, { soort: 'ok' });
  return true;
}

// A production: what to paste where, whether it is posted, what it did, and
// its sources.
function conceptView() {
  const c = S.concept;
  if (!c) return '<div class="detail"><div class="empty"><div class="spinner" style="margin:0 auto"></div></div></div>';
  const p = productionByFile(c.file);
  const sources = p ? p.bronnen.map((id) => S.items.find((i) => i.id === id)).filter(Boolean) : [];
  const back = { archief: ['#/archief', 'Content-archief'], vandaag: ['#/vandaag', 'Vandaag'] }[S.conceptFrom] || ['#/studio', 'Studio'];
  return `<div class="detail concept">
    <button class="btn ghost back" data-action="nav" data-href="${back[0]}">${icon('back')}${back[1]}</button>
    <div class="card-top"><span class="type">${esc(p?.label || c.soort || '')}</span>${p ? `<span>${esc(shortDate(p.datum))}</span>${statusPill(p)}` : ''}</div>
    <h2>${esc(p?.titel || c.titel || c.file)}</h2>
    ${p?.onderwerpen?.length ? `<div class="tags" style="margin:2px 0 12px">${p.onderwerpen.map((o) => `<span class="tag">#${esc(o)}</span>`).join('')}</div>` : ''}
    ${p && !p.klaar ? `<div class="panel">
      <h3>Nog geen resultaat</h3>
      <p class="small muted">Kopieer het antwoord in Claude of ChatGPT en tik hier. Met de code onderaan het antwoord komt het vanzelf op deze plek.</p>
      <button class="btn primary block" data-action="paste-result">${icon('copy')}Plak het antwoord</button>
      ${S.plakVeld ? `<textarea id="plak-veld" rows="6" placeholder="Plak hier het antwoord" style="margin-top:10px"></textarea>
        <button class="btn block" data-action="save-concept-result" style="margin-top:8px">${icon('check')}Bewaar</button>` : `<button class="link-btn" data-action="show-paste-field" style="margin-top:8px">Liever zelf plakken in een veld</button>`}
      ${S.cfg.modus === 'lokaal' ? '' : '<p class="small muted" style="margin-top:10px">Op je iPhone kan het ook via Deel: kies in Claude of ChatGPT bij het antwoord <b>Deel</b> en dan de opdracht <b>Contentmachine</b>.</p>'}
    </div>` : publishHtml(p, c)}
    ${p?.klaar ? postedHtml(p) : ''}
    ${p?.klaar && S.conceptEdit === null ? repurposeHtml(p) : ''}
    ${sources.length ? `<h3 class="section-title">Bronnen (${sources.length})</h3><div class="list">${sources.map(card).join('')}</div>` : ''}
    ${p ? `<div class="make-row" style="margin-top:14px">
      <button class="btn" data-action="reuse-sources">${icon('sparkle')}Maak iets anders met deze bronnen</button>
      <button class="btn ghost danger" data-action="undo-production">Haal uit content-archief</button>
    </div>` : ''}
  </div>`;
}

// The result without the sections the app adds for Obsidian.
function conceptText(c) {
  return productionByFile(c.file) ? removeSection(removeSection(c.markdown, 'Bronnen in de vault'), 'Onderwerpen').trim() : c.markdown;
}

function shortcutUrl() {
  return inboxApiUrl(S.cfg);
}

function connectForm() {
  const c = S.cfg;
  return `<div class="panel">
      <h3>Waar staat je vault?</h3>
      <div class="seg" style="margin-bottom:12px">
        <button class="${c.modus !== 'lokaal' ? 'on' : ''}" data-action="modus" data-v="github"><b>GitHub</b><span>Gratis, synct met Obsidian</span></button>
        <button class="${c.modus === 'lokaal' ? 'on' : ''}" data-action="modus" data-v="lokaal"><b>Alleen dit apparaat</b><span>Om te proberen</span></button>
      </div>
      ${c.modus === 'lokaal' ? '<p class="small muted">Alles blijft in deze browser. Geen sync met Obsidian of je andere apparaten.</p>' : `
      <div class="row"><div class="field" style="flex:1"><label for="cfg-owner">GitHub-gebruiker</label><input id="cfg-owner" value="${esc(c.owner)}" autocapitalize="off" autocomplete="off" placeholder="jouw-naam"></div>
      <div class="field" style="flex:1"><label for="cfg-repo">Repo</label><input id="cfg-repo" value="${esc(c.repo)}" autocapitalize="off" autocomplete="off" placeholder="contentmachine-vault"></div></div>
      <div class="row"><div class="field" style="flex:1"><label for="cfg-branch">Branch</label><input id="cfg-branch" value="${esc(c.branch)}" autocapitalize="off" autocomplete="off"></div>
      <div class="field" style="flex:1"><label for="cfg-map">Map in de repo</label><input id="cfg-map" value="${esc(c.map)}" autocapitalize="off" autocomplete="off"></div></div>
      <div class="field"><label for="cfg-token">Token (fine-grained, alleen deze repo, Contents: read and write)</label><input id="cfg-token" type="password" value="${esc(c.token)}" autocomplete="off" placeholder="github_pat_..."></div>
      <p class="small muted">Het token blijft op dit apparaat en gaat alleen naar api.github.com.</p>`}
      ${S.fout ? `<p class="error-text">${esc(S.fout)}</p>${S.cfg.modus && safeStorage.getItem(pendingKey()) ? `<p class="small muted">Blijft dit terugkomen? Op dit apparaat wachten nog wijzigingen die niet naar GitHub konden. Wis ze en verbind opnieuw; nieuwe links in je Inbox worden daarna opnieuw geordend.</p>
      <button class="btn block" data-action="clear-pending" style="margin-bottom:8px">${icon('refresh')}Wis wachtende wijzigingen en verbind opnieuw</button>` : ''}` : ''}
      <button class="btn primary block" data-action="connect" ${S.connecting ? 'disabled' : ''}>${S.connecting ? '<span class="spinner"></span>Verbinden...' : `${icon('check')}${S.ready ? 'Opnieuw verbinden' : 'Verbind'}`}</button>
    </div>`;
}

function welcomeView() {
  return `<div class="center" style="place-items:start center;padding-top:calc(var(--safe-top) + 40px)"><div style="width:100%;max-width:520px">
    <div class="login" style="max-width:none;margin-bottom:10px"><img src="icon.svg" alt=""><h1>Contentmachine</h1><p class="muted">Bewaar links vanaf je iPhone, orden ze zonder AI en werk verder in Obsidian. Gratis.</p></div>
    ${connectForm()}
    <p class="small muted">Nieuw? De README in de repo legt in vijf minuten uit hoe je de GitHub-repo en het token maakt.</p>
    <p class="small muted">Versie ${VERSIE}</p>
  </div></div>`;
}

// Your channels: who you are there, the language you post in and how often
// a week. Kept in the vault, so iPhone and Mac agree.
function channelsHtml() {
  const k = S.vault.kanalen;
  const row = (id) => {
    const spec = KANALEN[id];
    const mine = k[id] || {};
    const taal = mine.taal || spec.taal;
    return `<div class="kanaal" data-kanaal="${id}">
      <b>${esc(spec.naam)}</b>
      <input class="kanaal-veld" data-k="naam" value="${esc(mine.naam || '')}" placeholder="${id === 'substack' ? 'https://jouwnaam.substack.com' : id === 'linkedin' ? 'Je naam op LinkedIn' : '@handle'}" autocomplete="off" autocapitalize="off" aria-label="${esc(spec.naam)}: ${id === 'substack' ? 'adres' : 'naam of handle'}">
      <select class="kanaal-veld" data-k="taal" aria-label="${esc(spec.naam)}: taal"><option ${taal === 'Nederlands' ? 'selected' : ''}>Nederlands</option><option ${taal === 'Engels' ? 'selected' : ''}>Engels</option></select>
      <label class="kanaal-doel"><input class="kanaal-veld" data-k="doel" inputmode="numeric" value="${mine.doel || ''}" placeholder="0" aria-label="${esc(spec.naam)}: posts per week"><span class="small muted">per week</span></label>
    </div>`;
  };
  return `<div class="panel channels">
    <h3>Mijn kanalen</h3>
    <p class="small muted">Per kanaal: je naam of handle, de taal waarin je er post en hoe vaak per week je wilt posten. De taal gaat mee in elke prompt voor dat kanaal; het weekdoel zie je onder Vandaag. Met je handle herkent de app een eigen post die je deelt en zet die op gepost.</p>
    ${Object.keys(KANALEN).map(row).join('')}
  </div>`;
}

function settingsView() {
  const c = S.cfg;
  const v = S.vault;
  const bookmarklet = `javascript:(()=>{window.open('${APP_URL}#/deel?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&text='+encodeURIComponent(String(getSelection())),'contentmachine','width=440,height=600')})()`;
  const { positief, negatief } = v.learner.topWeights(12);
  const w = (list, cls) => list.map(([k, x]) => `<span class="w ${cls}">${esc(k.replace(/^(\w+):/, '$1 '))} ${x > 0 ? '+' : ''}${x.toFixed(1)}</span>`).join('') || '<span class="muted small">Nog niets</span>';
  const model = trainModel(S.items);
  const trained = [...model.folders].map(([n, f]) => `${esc(n)} (${f.docs})`).join(', ');
  const corrections = v.learner.state.correcties.slice(0, 5);
  return `<div class="topbar"><div style="flex:1"><span class="dateline">${c.modus === 'lokaal' ? 'Alleen dit apparaat' : `${esc(c.owner)}/${esc(c.repo)}`}</span><h1>Instellingen</h1></div></div>
    ${checklistHtml()}

    ${c.modus === 'lokaal' ? '' : `<div class="panel">
      <h3>iPhone: opslaan via de Deel-knop</h3>
      <p class="small muted">Eenmalig een opdracht maken in de app Opdrachten. Daarna staat "Contentmachine" in je deelmenu in Safari, X, Instagram, LinkedIn en YouTube. Opslaan gaat rechtstreeks naar je GitHub-repo, ook als deze app dicht is.</p>
      <div class="panel" style="box-shadow:none;background:var(--bg)">
        <b>Makkelijkst: op je MacBook</b>
        <ol class="steps small">
          <li>Open deze app op je Mac en tik op <b>Download opdracht</b>. Je token staat er al in.</li>
          <li>Open <b>Terminal</b> en plak deze regel. Die ondertekent de opdracht en opent hem in Opdrachten.
            <div class="copyline"><code>${esc(SIGN_COMMAND)}</code><button class="icon-btn" data-action="copy" data-v="${esc(SIGN_COMMAND)}" aria-label="Kopieer">${icon('copy')}</button></div></li>
          <li>Kies <b>Voeg opdracht toe</b>. Via iCloud staat hij binnen een minuut ook op je iPhone, in het deelmenu.</li>
        </ol>
        <button class="btn primary" data-action="download-shortcut">${icon('external')}Download opdracht</button>
      </div>
      <p class="small"><b>Of zelf bouwen op je iPhone:</b></p>
      <ol class="steps small">
        <li>Open <b>Opdrachten</b>, tik op <b>+</b>, noem de opdracht <b>Contentmachine</b>. Zet via het info-icoon <b>Toon in deelmenu</b> aan, met invoer <b>URL's</b> en <b>Tekst</b>.</li>
        <li>Actie <b>Tekst</b> met als inhoud <b>Opdrachtinvoer</b>.</li>
        <li>Actie <b>Codeer met Base64</b> op die tekst. Zet <b>Regeleinden</b> op <b>Geen</b>.</li>
        <li>Actie <b>Formatteer datum</b>: <b>Huidige datum</b>, aangepaste notatie <code>yyyyMMdd-HHmmss</code>.</li>
        <li>Actie <b>Haal inhoud van URL op</b>. URL: dit adres, met daarachter de geformatteerde datum en <code>.md</code>:
          <div class="copyline"><code>${esc(shortcutUrl())}</code><button class="icon-btn" data-action="copy" data-v="${esc(shortcutUrl())}" aria-label="Kopieer">${icon('copy')}</button></div>
          Methode <b>PUT</b>. Headers: <b>Authorization</b> met <code>Bearer</code> plus spatie plus je token, en <b>Accept</b> met <code>application/vnd.github+json</code>. Hoofdtekst <b>JSON</b> met <b>message</b> = <code>Gedeeld vanaf iPhone</code>, <b>content</b> = de Base64-tekst, <b>branch</b> = <code>${esc(c.branch)}</code>.
          <div class="copyline"><code>Bearer ${esc(c.token.slice(0, 12))}...</code><button class="icon-btn" data-action="copy" data-v="Bearer ${esc(c.token)}" aria-label="Kopieer token-header">${icon('copy')}</button></div></li>
        <li>Actie <b>Toon melding</b>: <code>Bewaard in Contentmachine</code>.</li>
      </ol>
      <p class="small muted">Zet deze webapp op je beginscherm: Safari, Deel, <b>Zet op beginscherm</b>. Open je hem, dan worden nieuwe links geordend.</p>
    </div>`}

    ${channelsHtml()}

    <div class="panel">
      <h3>Video's downloaden vanuit je deelmenu</h3>
      <p class="small muted">Een tweede opdracht, <b>Videodownloader</b>. Deel een post op X, TikTok, Instagram, Threads of LinkedIn en de downloader opent met de video klaar. Ook foto's, slideshows en carrousels. Er staat geen token in.</p>
      <ol class="steps small">
        <li>Download de opdracht op je Mac.</li>
        <li>Plak deze regel in <b>Terminal</b>:
          <div class="copyline"><code>${esc(signCommand('Videodownloader'))}</code><button class="icon-btn" data-action="copy" data-v="${esc(signCommand('Videodownloader'))}" aria-label="Kopieer">${icon('copy')}</button></div></li>
        <li>Kies <b>Voeg opdracht toe</b>. Via iCloud staat hij ook op je iPhone.</li>
      </ol>
      <div class="make-row"><button class="btn primary" data-action="download-video-shortcut">${icon('download')}Download Videodownloader</button><button class="btn" data-action="nav" data-href="#/video">Open de downloader</button></div>
      <details class="cobalt-set" ${c.cobaltUrl ? 'open' : ''}><summary>YouTube in elke kwaliteit: eigen Cobalt-server (optioneel)</summary>
        <p class="small muted">Zonder eigen server haalt de app YouTube via openbare servers: 360p en alleen geluid, en niet altijd bereikbaar. <a href="https://github.com/imputnet/cobalt" target="_blank" rel="noopener">Cobalt</a> is gratis software die je op een kleine server zet; dan krijg je elke kwaliteit, ook 144p en 240p. Het adres en de sleutel blijven op dit apparaat en gaan alleen naar die server.</p>
        <div class="field"><label for="cfg-cobalt-url">Adres</label><input id="cfg-cobalt-url" type="url" inputmode="url" value="${esc(c.cobaltUrl)}" placeholder="https://cobalt.jouwdomein.nl" autocomplete="off"></div>
        <div class="field"><label for="cfg-cobalt-key">API-sleutel, als je server die vraagt</label><input id="cfg-cobalt-key" type="password" value="${esc(c.cobaltKey)}" autocomplete="off"></div>
      </details>
    </div>

    ${c.modus === 'lokaal' ? '' : `<div class="panel">
      <h3>Obsidian op je Mac</h3>
      <p class="small muted">Je items staan als Markdown in GitHub (${esc(c.owner)}/${esc(c.repo)}). Obsidian op je Mac houdt een kopie bij die elke 5 minuten synchroniseert. Eenmalig instellen:</p>
      <ol class="steps small">
        <li>Installeer <a href="https://obsidian.md/download" target="_blank" rel="noopener">Obsidian</a> als je dat nog niet hebt. De plugin Obsidian Git hoef je niet zelf te installeren; dat doet de regel hieronder.</li>
        <li>Kopieer je token: <button class="btn" data-action="copy-token" style="margin-left:4px">${icon('copy')}Kopieer token</button></li>
        <li>Open <b>Terminal</b> (Cmd+spatie, typ Terminal), plak deze regel en druk op Enter. Vraagt hij om <b>Token</b>, plak dan met Cmd+V en druk op Enter. Je ziet niets verschijnen, dat hoort zo.
          <div class="copyline"><code>${esc(OBSIDIAN_COMMAND)}</code><button class="icon-btn" data-action="copy" data-v="${esc(OBSIDIAN_COMMAND)}" aria-label="Kopieer">${icon('copy')}</button></div></li>
        <li>In Obsidian: linksonder het kluisje, <b>Open folder as vault</b>, kies <code>~/Obsidian/Contentmachine</code> en daarna <b>Trust author and enable plugins</b>.</li>
        <li>Klaar. Nieuwe items komen elke 5 minuten binnen; meteen ophalen met Cmd+P en <b>Git: Pull</b>.</li>
      </ol>
    </div>`}

    <div class="panel">
      <h3>MacBook: opslaan vanuit je browser</h3>
      <p class="small muted">Sleep deze knop naar je bladwijzerbalk. Klik erop op elke pagina die je wilt bewaren. Geselecteerde tekst gaat mee.</p>
      <a class="bookmarklet" href="${esc(bookmarklet)}" onclick="return false">${icon('plus')}Contentmachine</a>
    </div>

    <div class="panel">
      <h3>Wat de machine heeft geleerd</h3>
      <p class="small muted">${v.learner.state.totaal} signalen verwerkt. Ster, duimen, archiveren, verplaatsen en gebruiken in een prompt tellen mee.</p>
      <div class="small">Meer van</div><div class="weights">${w(positief, 'pos')}</div>
      <div class="small">Minder van</div><div class="weights">${w(negatief, 'neg')}</div>
      <div class="small">Mappen die het model kent</div><p class="small muted">${trained || 'Nog geen: verplaats of orden een paar items, dan leert het van jou.'}</p>
      ${corrections.length ? `<div class="small">Laatste correcties</div><ul class="small muted">${corrections.map((x) => `<li>${esc(x.titel)}: ${esc(x.van)} naar ${esc(x.naar)}</li>`).join('')}</ul>` : ''}
    </div>

    ${['regels', 'bundels', 'profiel', 'stijl'].map((name) => `<div class="panel">
      <h3>${{ regels: 'Regels voor mappen', bundels: 'Bundels (hashtags per map)', profiel: 'Profiel', stijl: 'Stijlgids' }[name]}</h3>
      <p class="small muted">${{ regels: 'Map: woord, woord. Zo komen nieuwe items op de juiste plek tot het model genoeg van je heeft geleerd.', bundels: 'Per map: "- Naam: #hashtag #hashtag". "drempel" is het aantal items waarna een hashtag een bundel wordt. Bewerken kan ook per map via Bewerk bundels.', profiel: 'Wie je bent. Gaat mee in elke prompt.', stijl: 'Hoe je schrijft. Gaat mee in elke prompt.' }[name]} Staat ook in Obsidian als _systeem/${name}.md.</p>
      <textarea id="sys-${name}" rows="${name === 'profiel' || name === 'stijl' ? 9 : 12}">${esc(v.system[`${name}.md`])}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn primary" data-action="save-system" data-v="${name}">Bewaar</button></div>
    </div>`).join('')}

    <div class="panel">
      <h3>Mappen</h3>
      ${folderList().filter((f) => f.naam !== 'Inbox').map((f) => `<div class="concept-row"><span style="flex:1">${esc(f.naam)} <span class="muted small">${f.aantal}</span></span><button class="btn ghost" data-action="rename-folder" data-v="${esc(f.naam)}">Hernoem</button></div>`).join('') || '<p class="muted small">Mappen ontstaan vanzelf zodra items binnenkomen.</p>'}
    </div>

    <div class="panel">
      <h3>Inhoud ophalen en AI</h3>
      <div class="switches">
        ${switchHtml({ key: 'previews', aan: c.previews !== false, label: 'Voorbeeldplaatjes', uitleg: 'Via microlink.io, gratis, 50 per dag; die dienst ziet de link. X en YouTube werken ook zonder.' })}
        ${switchHtml({ key: 'reader', aan: c.reader, label: 'Volledige tekst van artikelen', uitleg: 'Via r.jina.ai, gratis en zonder account; die dienst ziet de link.' })}
        ${switchHtml({ key: 'haiku', aan: c.haiku, label: 'Slimmer ordenen met Claude Haiku', uitleg: 'Optioneel, eigen API-sleutel, ongeveer 0,1 cent per item.' })}
      </div>
      ${c.haiku ? `<div class="field"><label for="cfg-key">Anthropic API-sleutel</label><input id="cfg-key" type="password" value="${esc(c.anthropicKey)}" autocomplete="off" placeholder="sk-ant-..."><p class="small muted">Blijft op dit apparaat en gaat alleen naar api.anthropic.com. Wordt bewaard zodra je het veld verlaat.</p></div>` : ''}
    </div>

    <details class="panel"><summary><b>Verbinding</b></summary>${connectForm()}</details>

    <div class="panel">
      <h3>Status</h3>
      <dl class="kv">
        <dt>Opslag</dt><dd>${c.modus === 'lokaal' ? 'Alleen dit apparaat' : `GitHub ${esc(c.owner)}/${esc(c.repo)} (${esc(c.branch)})`}</dd>
        <dt>Sync</dt><dd id="sync-state">${syncText()}</dd>
        <dt>Zoeken</dt><dd>${esc(searchState())}</dd>
        <dt>Versie</dt><dd>${VERSIE}</dd>
        <dt>AI</dt><dd>${c.haiku && c.anthropicKey ? 'Claude Haiku bij nieuwe items' : 'Uit: ordenen met regels en het eigen model'}</dd>
      </dl>
      <div class="row" style="margin-top:12px"><button class="btn danger" data-action="disconnect">Ontkoppel dit apparaat</button></div>
    </div>`;
}

function syncText() {
  const v = S.vault;
  if (!v) return '';
  if (v.status.fout) return `<span class="status-dot err"></span>${esc(v.status.fout)}`;
  if (v.status.bezig) return '<span class="status-dot"></span>Synchroniseren...';
  if (v.pending.size) return `<span class="status-dot"></span>${v.pending.size} wijziging${v.pending.size === 1 ? '' : 'en'} wacht${v.pending.size === 1 ? '' : 'en'}`;
  return `<span class="status-dot ok"></span>Bijgewerkt${v.status.laatsteSync ? ` (${relDate(v.status.laatsteSync)})` : ''}`;
}

function sidebarHtml() {
  const nav = (href, ic, label, active, count = '') => `<a class="nav-item ${active ? 'active' : ''}" href="${href}">${icon(ic)}${label}${count !== '' ? `<span class="count">${count}</span>` : ''}</a>`;
  const onFeed = (S.view === 'feed' || (S.view === 'item' && !['vandaag', 'concept', 'archief'].includes(S.itemFrom))) && !S.map;
  return `<div class="brand"><img src="icon.svg" alt=""><div>Contentmachine<small>NinA AI Agency</small></div></div>
    <button class="btn primary block" data-action="add" style="margin-bottom:10px">${icon('plus')}Bewaar link of idee</button>
    ${nav('#/', 'feed', 'Feed', onFeed, S.items.filter(isActive).length)}
    ${nav('#/vandaag', 'sun', 'Vandaag', S.view === 'vandaag' || (S.view === 'item' && S.itemFrom === 'vandaag'), reviewWaiting() ? 'nieuw' : '')}
    ${nav('#/studio', 'pen', 'Studio', ['studio', 'concept', 'editor'].includes(S.view) || (S.view === 'item' && S.itemFrom === 'concept'), S.selected.size || '')}
    ${nav('#/video', 'download', 'Video en foto\'s', S.view === 'video')}
    ${nav(TELEPROMPTER_URL, 'video', 'Teleprompter', false)}
    ${nav('#/instellingen', 'settings', 'Instellingen', S.view === 'instellingen')}
    <div class="nav-label">Mappen</div>
    ${folderList().map((f) => nav(`#/map/${encodeURIComponent(f.naam)}`, f.naam === 'Inbox' ? 'inbox' : 'folder', esc(f.naam), S.map === f.naam && (S.view === 'map' || S.view === 'item'), f.aantal)
      + (S.map === f.naam ? bundlesFor(bundleModel(), f.naam).map((b) => `<button class="nav-item sub ${S.bundel === b.naam ? 'active' : ''}" data-action="bundel" data-v="${esc(b.naam)}">#${esc(b.naam)}</button>`).join('') : '')).join('')}
    ${nav('#/archief', 'layers', 'Content-archief', S.view === 'archief' || (S.view === 'item' && S.itemFrom === 'archief'), archivedProductions().length || '')}
    <button class="nav-item muted" data-action="new-folder">${icon('plus')}Nieuwe map</button>
    <div class="small muted" id="sync-side" style="margin-top:auto;padding:12px 10px 0">${syncText()}</div>`;
}

function tabbarHtml() {
  const tab = (href, ic, label, active, badge = 0) => `<button class="tab ${active ? 'active' : ''}" data-action="nav" data-href="${href}"><span class="tab-icon">${icon(ic)}${badge === true ? '<span class="badge dot"></span>' : badge ? `<span class="badge">${badge}</span>` : ''}</span>${label}</button>`;
  const fromToday = S.view === 'item' && S.itemFrom === 'vandaag';
  const fromStudio = S.view === 'item' && S.itemFrom === 'concept';
  const fromArchive = S.view === 'item' && S.itemFrom === 'archief';
  return `<nav class="tabbar">
    ${tab('#/', 'feed', 'Feed', S.view === 'feed' || S.view === 'sorteren' || (S.view === 'item' && !S.map && !fromToday && !fromStudio && !fromArchive))}
    ${tab('#/vandaag', 'sun', 'Vandaag', S.view === 'vandaag' || fromToday, reviewWaiting())}
    ${tab('#/mappen', 'grid', 'Mappen', S.view === 'mappen' || S.view === 'map' || S.view === 'archief' || fromArchive)}
    ${tab('#/studio', 'pen', 'Studio', ['studio', 'concept', 'editor'].includes(S.view) || fromStudio, S.selected.size)}
    ${tab('#/instellingen', 'settings', 'Instellingen', S.view === 'instellingen')}
  </nav>`;
}

function bundleSheetHtml() {
  const entry = bundleModel().folders.get(S.map);
  const ignored = entry ? [...entry.genegeerd] : [];
  return `<div class="overlay" data-action="close-sheet">
    <div class="sheet" data-stop style="max-height:88dvh;overflow-y:auto">
      <h2>Bundels in ${esc(S.map)}</h2>
      <p class="small muted">Een bundel groepeert items op hashtags. Nieuwe bundels ontstaan vanzelf zodra hashtags vaak samen voorkomen. Hier pas je ze aan.</p>
      ${S.editBundels.map((b, i) => `<div class="bundle-row">
        <input id="bn-${i}" value="${esc(b.naam)}" placeholder="Naam" autocomplete="off">
        <input id="bt-${i}" value="${esc(b.tags.map((t) => `#${t}`).join(' '))}" placeholder="#hashtag #nog-een" autocapitalize="off" autocomplete="off">
        <button class="icon-btn" data-action="bundle-remove" data-v="${i}" aria-label="Verwijder bundel">${icon('trash')}</button>
      </div>`).join('') || '<p class="small muted">Nog geen bundels in deze map.</p>'}
      <button class="btn ghost" data-action="bundle-add">${icon('plus')}Bundel toevoegen</button>
      ${ignored.length ? `<p class="small muted">Genegeerd: ${ignored.map((t) => `#${esc(t)}`).join(' ')}</p>` : ''}
      <div class="row" style="margin-top:12px"><span style="flex:1"></span><button class="btn ghost" data-action="close-sheet">Annuleer</button><button class="btn primary" data-action="bundle-save">Bewaar</button></div>
    </div>
  </div>`;
}

function readBundleRows() {
  S.editBundels = S.editBundels.map((b, i) => ({
    naam: document.getElementById(`bn-${i}`)?.value ?? b.naam,
    tags: (document.getElementById(`bt-${i}`)?.value ?? b.tags.join(' ')).split(/[\s,]+/).map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean),
  }));
}

function sheetHtml() {
  if (S.sheet === 'bundels') return bundleSheetHtml();
  if (S.sheet !== 'add') return '';
  return `<div class="overlay" data-action="close-sheet">
    <div class="sheet" data-stop>
      <h2>Bewaar iets</h2>
      <div class="field"><textarea id="add-input" rows="4" placeholder="Plak een link, of typ een idee of notitie"></textarea></div>
      <div class="row"><button class="btn" data-action="paste">${icon('copy')}Plak</button><button class="btn" data-action="add-video" title="Download de video uit deze link">${icon('download')}Video</button><span style="flex:1"></span><button class="btn ghost" data-action="close-sheet">Annuleer</button><button class="btn primary" data-action="save-add">Bewaar</button></div>
    </div>
  </div>`;
}

function shareHtml() {
  const s = S.sharing;
  if (s.state === 'bezig') return '<div class="center"><div class="login"><div class="spinner" style="margin:0 auto 14px"></div><p>Bewaren en ordenen...</p></div></div>';
  if (s.state === 'fout') return `<div class="center"><div class="login"><h1>Niet gelukt</h1><p class="muted">${esc(s.msg)}</p><button class="btn block" data-action="share-done">Naar de app</button></div></div>`;
  return `<div class="center"><div class="login">
    <div class="check">${icon('check')}</div>
    <h1>${s.r.dubbel ? 'Stond er al in' : s.r.eigen ? 'Je eigen post staat op gepost' : 'Bewaard'}</h1>
    <p class="muted">${esc(s.r.titel)}</p>
    <p class="small muted">${s.r.eigen ? 'In je Content-archief' : `In de map ${esc(s.r.map)}`}</p>
    <div class="row" style="margin-top:16px"><button class="btn block" data-action="close-window">Sluiten</button><button class="btn primary block" data-action="share-done">Open app</button></div>
  </div></div>`;
}

function selectionBar() {
  if (!S.selected.size || ['studio', 'concept', 'editor'].includes(S.view)) return '';
  // A floating pill, not a sheet: the feed stays sharp, so you can keep selecting.
  const picked = [...S.selected].map((id) => S.items.find((i) => i.id === id)).filter(Boolean);
  return `<div class="select-bar" role="region" aria-label="Selectie">
    ${facesHtml(picked)}
    <span class="select-count">${S.selected.size} gekozen</span>
    <button class="icon-btn select-clear" data-action="clear-picks" aria-label="Selectie wissen" title="Selectie wissen">${icon('x')}</button>
    <button class="btn primary" data-action="nav" data-href="#/studio">${icon('sparkle')}Maak prompt</button>
  </div>`;
}

// ---------- rendering ----------
function render() {
  const app = $('#app');
  if (S.sharing) {
    app.innerHTML = shareHtml();
    return;
  }
  if (!S.ready && S.view === 'video') {
    // The downloader needs no vault: it also works from the share sheet in Safari.
    app.innerHTML = `<div class="shell"><main class="main" id="main" style="max-width:720px;margin:0 auto">${videoView()}</main></div>`;
    afterRender();
    return;
  }
  if (!S.ready) {
    app.innerHTML = S.cfg.modus && S.connecting && !S.fout
      ? '<div class="center"><div class="login"><img src="icon.svg" alt=""><div class="spinner" style="margin:0 auto"></div></div></div>'
      : welcomeView();
    return;
  }
  const desktop = isDesktop();
  const showPane = desktop && S.view === 'item';
  let main;
  if (S.view === 'studio') main = studioView();
  else if (S.view === 'concept') main = conceptView();
  else if (S.view === 'editor') main = editorView();
  else if (S.view === 'instellingen') main = settingsView();
  else if (S.view === 'mappen') main = desktop ? feedView() : foldersView();
  else if (S.view === 'vandaag') main = vandaagView();
  else if (S.view === 'archief') main = archiefView();
  else if (S.view === 'sorteren') main = sorteerView();
  else if (S.view === 'video') main = videoView();
  else if (S.view === 'item' && desktop && S.itemFrom === 'sorteren') main = sorteerView();
  else if (S.view === 'item' && desktop && S.itemFrom === 'archief') main = archiefView();
  else if (S.view === 'item' && !desktop) main = detailHtml();
  else if (S.view === 'item' && S.itemFrom === 'vandaag') main = vandaagView();
  else if (S.view === 'item' && S.itemFrom === 'concept' && S.concept) main = conceptView();
  else main = feedView();

  const mainScroll = $('.main')?.scrollTop || 0;
  const paneScroll = $('.detail-pane')?.scrollTop || 0;
  const focusId = document.activeElement?.id;
  app.innerHTML = `<div class="shell ${showPane ? 'has-detail' : ''} ${S.selected.size && !['studio', 'concept'].includes(S.view) ? 'selecting' : ''}">
      <aside class="sidebar">${sidebarHtml()}</aside>
      <main class="main" id="main">${main}</main>
      ${showPane ? `<section class="detail-pane" id="pane">${detailHtml()}</section>` : ''}
    </div>
    ${['feed', 'map', 'mappen'].includes(S.view) || (S.view === 'item' && desktop) ? `<button class="fab ${S.selected.size ? 'raised' : ''}" data-action="add" aria-label="Bewaar iets">${icon('plus')}</button>` : ''}
    ${selectionBar()}
    ${returnBar()}
    ${tabbarHtml()}
    ${sheetHtml()}`;
  if ($('.main')) $('.main').scrollTop = mainScroll;
  if ($('.detail-pane')) $('.detail-pane').scrollTop = paneScroll;
  if (S.scrollTo === 'top') {
    if ($('.detail-pane')) $('.detail-pane').scrollTop = 0;
    if (!desktop) window.scrollTo(0, 0);
  } else if (S.scrollTo === 'feed') {
    if (desktop && $('.main')) $('.main').scrollTop = S.feedScroll || 0;
    else window.scrollTo(0, S.feedScroll || 0);
  }
  S.scrollTo = null;
  if (focusId === 'q') {
    const q = $('#q');
    q?.focus();
    q?.setSelectionRange(q.value.length, q.value.length);
  }
  markReader();
  afterRender();
}

// Rolling numbers roll from their last value; a tapped button springs.
function afterRender() {
  animateRolls();
  if (S.view === 'editor' && S.editor) paintEditor();
  if (S.pop) {
    pop(document.querySelector(`[data-pop="${S.pop}"]`));
    S.pop = null;
  }
}

function renderList() {
  if (!S.ready) return;
  const list = $('#list');
  if (list) list.innerHTML = listHtml();
  const chips = $('#chips');
  if (chips) chips.innerHTML = chipsHtml();
  const line = $('#dateline');
  if (line) line.textContent = dateline();
  const bundles = $('#bundles');
  if (bundles) bundles.innerHTML = bundleChipsHtml();
  const seg = $('#doel-seg');
  if (seg) seg.innerHTML = doelSegHtml();
  const side = $('.sidebar');
  if (side) side.innerHTML = sidebarHtml();
  animateRolls();
}

function renderDetail() {
  if (S.view !== 'item' || !S.ready) return;
  if (isDesktop()) {
    const pane = $('#pane');
    if (pane) pane.innerHTML = detailHtml();
    else render();
  } else {
    const main = $('#main');
    if (main) main.innerHTML = detailHtml();
  }
  markReader();
  afterRender();
}

function renderSync() {
  const t = syncText();
  for (const id of ['sync-side', 'sync-state']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = t;
  }
}

// ---------- actions ----------
// Applies a change from the detail view and feeds the learner.
async function patchItem(id, body) {
  const v = S.vault;
  try {
    const meta = v.meta(id);
    const patch = {};
    const signals = [];
    let correction = null;
    if ('ster' in body && Boolean(body.ster) !== meta.ster) {
      patch.ster = Boolean(body.ster);
      signals.push(['ster', patch.ster ? 1 : -1]);
    }
    if ('oordeel' in body) {
      const val = [1, -1].includes(Number(body.oordeel)) ? Number(body.oordeel) : 0;
      if (val !== meta.oordeel) {
        if (meta.oordeel === 1) signals.push(['duim_op', -1]);
        if (meta.oordeel === -1) signals.push(['duim_neer', -1]);
        if (val === 1) signals.push(['duim_op', 1]);
        if (val === -1) signals.push(['duim_neer', 1]);
        patch.oordeel = val;
      }
    }
    if ('status' in body && STATUSES.includes(body.status) && body.status !== meta.status) {
      patch.status = body.status;
      if (body.status === 'archief' && !meta.ster && meta.oordeel !== 1) signals.push(['archief', 1]);
    }
    if (typeof body.map === 'string' && body.map.trim() && body.map !== meta.map) {
      const clean = body.map.trim();
      patch.map = v.folders().find((f) => f.toLowerCase() === clean.toLowerCase()) || clean;
      // Your own choice: the model learns from it and never moves it again.
      patch.ordening = BY_HAND;
      correction = { from: meta.map, to: patch.map };
    }
    if ('doel' in body) {
      const doel = body.doel === 'leren' ? 'leren' : undefined;
      if (doel !== meta.doel) {
        patch.doel = doel;
        v.learner.maker(meta.auteur, doel || 'posten');
      }
    }
    if (Array.isArray(body.tags)) patch.tags = body.tags.map((t) => t.toLowerCase().trim().replace(/\s+/g, '-')).filter(Boolean);
    const updated = await v.update(id, patch, { notities: body.notities });
    for (const [kind, f] of signals) v.learner.signal(updated, kind, f);
    if (correction) v.learner.correction(meta, correction.from, updated.map);
    refreshItems();
    if (S.detail?.id === id) S.detail = detailWith(updated, { notities: body.notities ?? S.detail.notities });
    renderList();
    renderDetail();
    return updated;
  } catch (e) {
    toast(e.message);
    return null;
  }
}

async function saveInput(input) {
  const meta = await processCapture(S.vault, input, pipelineOpts());
  refreshItems();
  runAutoBundle();
  S.vault.flush().catch((e) => toast(e.message));
  return meta;
}

function pickWeek() {
  const week = Date.now() - 7 * 864e5;
  const best = S.items
    .filter((i) => i.status !== 'archief' && i.status !== 'gebruikt' && !isLeren(i) && new Date(i.opgeslagen).getTime() > week)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 4);
  if (!best.length) return toast('Geen nieuwe items van deze week');
  best.forEach((i) => S.selected.add(i.id));
  if (S.soort === 'linkedin') S.soort = 'nieuwsbrief';
  render();
}

async function buildCurrentPrompt() {
  const items = await Promise.all([...S.selected].filter((id) => S.vault.has(id)).map((id) => S.vault.get(id)));
  const { onderwerpen } = topicsOf(items.map((x) => x.meta), bundleModel());
  const own = S.productie?.key === productionKey() ? S.productie.file : '';
  const ids = items.map((x) => x.meta.id);
  const basis = S.basis && S.basis.soort !== S.soort && sameSet(S.basis.bronnen, ids) ? S.basis : null;
  S.prompt = buildPrompt({
    soort: S.soort,
    items,
    taal: S.vault.kanalen[KANAAL_VAN[S.soort]]?.taal || '',
    basis,
    code: currentCode(),
    instructie: S.instructie,
    profiel: S.vault.system['profiel.md'],
    stijl: S.vault.system['stijl.md'],
    eerder: earlierAbout(S.vault.content, onderwerpen, { exclude: own }),
    lessen: await Promise.all([...S.lessen].filter((id) => S.vault.has(id)).map(async (id) => {
      const { meta, body } = await S.vault.get(id);
      return { titel: meta.titel, auteur: meta.auteur, tekst: lessonsOf(body) };
    })),
  });
  S.resultaat = '';
}

// The code for the prompt on screen: the one of its production when that
// exists already, otherwise a new one that the production gets when recorded.
function currentCode() {
  const own = S.productie?.key === productionKey() ? productionByFile(S.productie.file) : null;
  if (own?.code) return own.code;
  if (!S.promptCode) S.promptCode = newCode();
  return S.promptCode;
}

// ---------- content archive ----------
const conceptLink = (file) => `[[${file.replace(/\.md$/, '')}]]`;
const noteLink = (meta) => `- [[${meta.path.split('/')[1].replace(/\.md$/, '')}]]`;
const productionKey = () => `${S.soort}:${[...S.selected].filter((id) => S.vault.has(id)).sort().join(',')}`;
const productionsOf = (id) => (S.vault?.content || []).filter((p) => p.bronnen.includes(id));
const productionByFile = (file) => S.vault?.content.find((p) => p.file === file);

// The prompt went to a chat: its sources become one production in the
// content archive, with a note in Concepten/, and leave the feed.
async function recordProduction() {
  const v = S.vault;
  const ids = [...S.selected].filter((id) => v.has(id));
  if (!ids.length || !S.prompt) return null;
  const key = productionKey();
  if (S.productie?.key === key) return productionByFile(S.productie.file) || null;
  const today = localDay();
  const code = findCode(S.prompt);
  const same = v.content.find((p) => p.soort === S.soort && localDay(new Date(p.datum)) === today && sameSet(p.bronnen, ids));
  if (same) {
    S.productie = { key, file: same.file };
    // The prompt that goes out now carries this code: the answer must find it.
    if (code && same.code !== code) v.saveContent(v.content.map((x) => (x.file === same.file ? { ...x, code } : x)));
    S.promptCode = '';
    return productionByFile(same.file);
  }
  const metas = ids.map((id) => v.meta(id));
  const { onderwerpen, mappen } = topicsOf(metas, bundleModel());
  const spec = PROMPT_SOORTEN[S.soort];
  const titel = productionTitle(metas, onderwerpen);
  const datum = new Date().toISOString();
  const instructie = S.instructie.trim() || undefined;
  const file = v.writeConcept(
    { titel, soort: spec.label, datum, status: 'prompt', bronnen: ids, onderwerpen, instructie },
    conceptBody({ titel, label: spec.label, links: metas.map(noteLink), onderwerpen, datum }),
  );
  const p = { file, datum, soort: S.soort, label: spec.label, titel, bronnen: ids, onderwerpen, mappen, instructie, code: code || undefined, klaar: false, vorige: Object.fromEntries(metas.map((m) => [m.id, m.status])) };
  S.promptCode = '';
  // Set before the first await, so a second tap cannot record it twice.
  S.productie = { key, file };
  v.saveContent([p, ...v.content]);
  for (const m of metas) {
    try {
      const updated = await v.update(m.id, { status: 'gebruikt', gebruikt_in: [...(m.gebruikt_in || []), conceptLink(file)] });
      v.learner.signal(updated, 'gebruikt');
    } catch (e) {
      toast(e.message);
    }
  }
  refreshItems();
  if (S.view === 'studio') render();
  else renderList();
  return p;
}

// The properties of a production's note: Obsidian shows where a piece is
// (prompt, klaar, gepost) and what it did.
function conceptMeta(p) {
  const m = { titel: p.titel, soort: p.label, datum: p.datum, status: statusOf(p), bronnen: p.bronnen, onderwerpen: p.onderwerpen, instructie: p.instructie };
  if (p.ondertitel) m.ondertitel = p.ondertitel;
  if (p.gepost) m.gepost = String(p.gepost).slice(0, 10);
  if (p.link) m.link = p.link;
  for (const k of Object.keys(CIJFER_LABEL)) if (p.cijfers?.[k] !== undefined) m[k] = p.cijfers[k];
  return m;
}

// The result you pasted goes into the production's note, above its sources.
function fillProduction(p, raw) {
  const v = S.vault;
  const text = stripCode(raw);
  const titel = (text.match(/^# (.+)$/m)?.[1] || p.titel).trim().slice(0, 100);
  const metas = p.bronnen.filter((id) => v.has(id)).map((id) => v.meta(id));
  const next = { ...p, titel, klaar: true };
  v.updateConcept(
    p.file,
    conceptMeta(next),
    conceptBody({ titel, label: p.label, links: metas.map(noteLink), onderwerpen: p.onderwerpen, resultaat: text, datum: p.datum }),
  );
  v.saveContent(v.content.map((x) => (x.file === p.file ? next : x)));
  return next;
}

// A change to a production (posted, numbers): in the log and in its note.
async function updateProduction(file, patch) {
  const v = S.vault;
  const p = productionByFile(file);
  if (!p) return null;
  const next = { ...p, ...patch };
  for (const [k, val] of Object.entries(patch)) if (val === undefined) delete next[k];
  v.saveContent(v.content.map((x) => (x.file === file ? next : x)));
  try {
    const { body } = await v.readConcept(file);
    v.updateConcept(file, conceptMeta(next), body);
  } catch {
    // the note is gone in Obsidian; the log still knows
  }
  return next;
}

// A link you save that is your own post is not material to post about. The
// piece it came from goes to "posted" with this link; a post you did not make
// here is added to the archive as posted. Returns null for anyone else's post.
async function ownPost(item) {
  const v = S.vault;
  const kanaal = ownChannel(item, v.kanalen);
  if (!kanaal) return null;
  const known = v.content.find((p) => p.link && linkKey(p.link) === linkKey(item.url));
  if (known) return { titel: known.titel, map: 'Content-archief', file: known.file, dubbel: true };
  const text = String(item.tekst || item.gedeeld || '').trim();
  const texts = new Map();
  for (const p of v.content.filter((x) => !x.gepost && x.klaar && kanaalOf(x) === kanaal)) {
    try {
      texts.set(p.file, stripCode(removeSection(removeSection((await v.readConcept(p.file)).body, 'Bronnen in de vault'), 'Onderwerpen')));
    } catch {
      // the note is gone; it cannot match
    }
  }
  const match = matchProduction(v.content, kanaal, text, texts);
  const published = Date.parse(item.gepubliceerd);
  const gepost = new Date(Number.isFinite(published) && published < Date.now() ? published : Date.now()).toISOString();
  let p;
  if (match) p = await updateProduction(match.file, { gepost, link: item.url });
  else {
    const soort = SOORT_VAN_KANAAL[kanaal];
    const spec = PROMPT_SOORTEN[soort];
    const onderwerpen = suggestTags({ titel: item.titel, tekst: text, auteur: item.auteur }, S.items);
    const base = { datum: gepost, soort, label: spec.label, titel: item.titel, bronnen: [], onderwerpen, mappen: [], klaar: true, gepost, link: item.url };
    const file = v.writeConcept(conceptMeta(base), conceptBody({ titel: item.titel, label: spec.label, links: [], onderwerpen, resultaat: `# ${item.titel}\n\n${text}`.trim(), datum: gepost }));
    p = { ...base, file };
    v.saveContent([p, ...v.content]);
  }
  toast(match ? `Je eigen post op ${KANALEN[kanaal].naam}: "${p.titel}" staat nu op gepost` : `Je eigen post op ${KANALEN[kanaal].naam} staat in je Content-archief als gepost`, { soort: 'ok', duur: 7000 });
  if (statsSource(item.url)) fetchCijfers(p.file, { stil: true });
  return { titel: p.titel, map: 'Content-archief', file: p.file };
}

// New numbers for a posted piece. A post that does clearly better than your
// usual lifts the items it was made from, once.
async function saveCijfers(file, cijfers) {
  const p = productionByFile(file);
  if (!p) return null;
  const next = await updateProduction(file, { cijfers: { ...p.cijfers, ...cijfers, gemeten: new Date().toISOString() } });
  if (!next.beloond && resultaten(S.vault.content).scoort(productionByFile(file))) {
    for (const id of next.bronnen) if (S.vault.has(id)) S.vault.learner.signal(S.vault.meta(id), 'scoort');
    await updateProduction(file, { beloond: true });
    refreshItems();
  }
  return productionByFile(file);
}

// X and TikTok give a post's numbers to anyone who asks.
async function fetchCijfers(file, { stil = false } = {}) {
  const p = productionByFile(file);
  if (!p?.link || !statsSource(p.link)) return null;
  try {
    const st = await fetchStats(p.link);
    const cijfers = cleanCijfers(st);
    if (!Object.keys(cijfers).length) throw new Error('geen cijfers');
    await saveCijfers(file, cijfers);
    if (!stil) toast('Cijfers opgehaald', { soort: 'ok' });
    if (S.view === 'concept' && S.concept?.file === file) render();
    return cijfers;
  } catch {
    if (!stil) toast('De cijfers ophalen lukte nu niet. Probeer het later, of vul ze zelf in.', { soort: 'fout' });
    return null;
  }
}

// Posts on X and TikTok from the last month get fresh numbers now and then,
// a few per visit.
let statsBusy = false;
async function refreshStats() {
  if (statsBusy || !S.ready) return;
  statsBusy = true;
  try {
    const now = Date.now();
    const due = S.vault.content.filter((p) => p.gepost && p.link && statsSource(p.link)
      && now - Date.parse(p.gepost) < 30 * 864e5
      && !(now - Date.parse(p.cijfers?.gemeten) < 6 * 36e5)).slice(0, 6);
    let changed = false;
    for (const p of due) changed = Boolean(await fetchCijfers(p.file, { stil: true })) || changed;
    if (changed && ['archief', 'vandaag'].includes(S.view)) render();
  } finally {
    statsBusy = false;
  }
}

// ---------- the answer comes back ----------
// What you copied in Claude or ChatGPT goes to the production it belongs to:
// the one its code names, else the one on screen, else the newest one waiting.
async function takeResult(raw, { open = true } = {}) {
  const v = S.vault;
  const text = String(raw || '').trim();
  if (/^Je bent mijn (ghostwriter|coach)\b/.test(text)) {
    toast('Op je klembord staat nog de prompt. Kopieer het antwoord in Claude of ChatGPT en tik dan opnieuw.', { soort: 'fout' });
    return null;
  }
  if (text.length < 20) {
    toast('Op je klembord staat geen antwoord. Kopieer het antwoord in Claude of ChatGPT en tik dan opnieuw.', { soort: 'fout' });
    return null;
  }
  const code = findCode(text);
  const viewing = S.view === 'concept' && S.concept ? productionByFile(S.concept.file) : null;
  const week = Date.now() - 7 * 864e5;
  const p = (code && v.content.find((x) => x.code === code))
    || viewing
    || (S.productie && productionByFile(S.productie.file))
    || findProduction(v.content.filter((x) => Date.parse(x.datum) > week));
  if (!p) {
    toast('Er staat geen prompt open waar dit antwoord bij hoort. Maak eerst een prompt in de Studio.', { soort: 'fout' });
    return null;
  }
  const done = fillProduction(p, text);
  S.terug = null;
  S.plakVeld = false;
  S.conceptEdit = null;
  if (S.productie?.file === p.file) {
    S.resultaat = '';
    S.prompt = '';
    S.selected.clear();
    S.productie = null;
    S.basis = null;
  }
  toast(`Bewaard bij ${done.label}: ${done.titel}`, { soort: 'ok' });
  if (open) {
    if (S.view === 'concept' && S.concept?.file === p.file) await loadConcept(p.file);
    else go(`#/concept/${encodeURIComponent(p.file)}`);
  }
  return done;
}

// Reads the clipboard after a tap. When the browser refuses, a field to
// paste in by hand takes over.
async function pasteResult() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    S.plakVeld = true;
    render();
    ($('#plak-veld') || $('#resultaat'))?.focus();
    toast('Plakken lukte niet vanzelf. Houd het veld ingedrukt en kies Plak.');
    return null;
  }
  return takeResult(text);
}

// A prompt went out in the last day and its answer is not here yet: when you
// come back to the app, a bar offers to paste it.
function watchReturn() {
  if (!S.ready) return;
  const day = Date.now() - 864e5;
  const p = findProduction(S.vault.content.filter((x) => Date.parse(x.datum) > day));
  const next = p && local.get('cm_terug_weg', '') !== p.file ? p.file : null;
  if (next === S.terug) return;
  S.terug = next;
  render();
}

function returnBar() {
  const p = S.terug && productionByFile(S.terug);
  if (!p || p.klaar || S.selected.size || S.sheet || (S.view === 'concept' && S.concept?.file === p.file) || ['studio', 'editor'].includes(S.view)) return '';
  return `<div class="return-bar" role="region" aria-label="Resultaat plakken">
    <span class="return-text"><b>Antwoord gekopieerd?</b><small>${esc(p.label)}: ${esc(p.titel)}</small></span>
    <button class="btn primary" data-action="paste-result">${icon('copy')}Plak</button>
    <button class="icon-btn" data-action="terug-weg" aria-label="Niet nu">${icon('x')}</button>
  </div>`;
}

function undoCurrentProduction() {
  const p = productionByFile(S.productie?.file);
  if (!p) return;
  undoProduction(p).then(() => {
    toast('Uit je content-archief gehaald, de bronnen staan weer in je feed');
    render();
  });
}

// Undo: the note goes, the sources return to where they were.
async function undoProduction(p) {
  const v = S.vault;
  const rest = v.content.filter((x) => x.file !== p.file);
  v.saveContent(rest);
  for (const id of p.bronnen) {
    if (!v.has(id)) continue;
    const meta = v.meta(id);
    const links = (meta.gebruikt_in || []).filter((l) => l !== conceptLink(p.file));
    const patch = { gebruikt_in: links.length ? links : undefined };
    if (meta.status === 'gebruikt' && !rest.some((x) => x.bronnen.includes(id))) {
      const before = p.vorige?.[id];
      patch.status = before && before !== 'gebruikt' ? before : 'gelezen';
    }
    try {
      const m = await v.update(id, patch);
      v.learner.signal(m, 'gebruikt', -1);
    } catch (e) {
      toast(e.message);
    }
  }
  try {
    v.removeConcept(p.file);
  } catch {
    // already gone in Obsidian
  }
  if (S.productie?.file === p.file) S.productie = null;
  refreshItems();
}

// ---------- daily review ----------
function reviewWaiting() {
  return Boolean(S.vault && S.items.length && local.get('cm_review_seen', '') !== localDay());
}

function ensureReview() {
  const { state, ids, changed } = dailyReview(S.items, S.vault.herhaling);
  if (changed) S.vault.saveReview(state);
  S.reviewIds = ids;
  local.set('cm_review_seen', state.dag);
}

// The mix of today, then the highlights of those items.
async function loadReview() {
  if (!S.ready) return;
  ensureReview();
  render();
  const missing = S.reviewIds.filter((id) => !S.reviewHl.has(id));
  await Promise.all(missing.map(async (id) => {
    try {
      S.reviewHl.set(id, parseHighlights((await S.vault.get(id)).body));
    } catch {
      S.reviewHl.set(id, []);
    }
  }));
  if (missing.length && S.view === 'vandaag') render();
}

// ---------- highlights ----------
async function editHighlights(change) {
  const id = S.detail.id;
  let body = null;
  try {
    const updated = await S.vault.update(id, {}, { transform: (b) => (body = withHighlights(b, change(parseHighlights(b)))) });
    S.reviewHl.delete(id);
    refreshItems();
    if (S.detail?.id === id) S.detail = detailWith(updated, { body });
    renderList();
    renderDetail();
    return updated;
  } catch (e) {
    toast(e.message);
    return null;
  }
}

// Shows the saved highlights inside the text. Works on the rendered text, so a
// highlight may cross bold text, links and paragraphs.
function markReader() {
  const root = document.getElementById('reader');
  const list = S.detail ? parseHighlights(S.detail.body || '') : [];
  if (!root || !list.length) return;
  let flat = '';
  const at = []; // per character of flat: [text node, offset], or null between blocks
  let block = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const b = n.parentElement.closest('p,li,blockquote,h1,h2,h3,h4,h5,h6,pre');
    if (b !== block && flat && !flat.endsWith(' ')) {
      flat += ' ';
      at.push(null);
    }
    block = b;
    const t = n.nodeValue;
    for (let k = 0; k < t.length; k++) {
      const space = /\s/.test(t[k]);
      if (space && (!flat || flat.endsWith(' '))) continue;
      flat += space ? ' ' : t[k].toLowerCase();
      at.push([n, k]);
    }
  }
  const perNode = new Map();
  for (const h of list) {
    const needle = cleanHighlight(h.tekst).toLowerCase();
    if (!needle) continue;
    // Every place the passage appears, also when the summary repeats it.
    for (let start = flat.indexOf(needle); start !== -1; start = flat.indexOf(needle, start + needle.length)) {
      for (let k = start; k < start + needle.length; k++) {
        if (!at[k]) continue;
        const [node, off] = at[k];
        if (!perNode.has(node)) perNode.set(node, new Set());
        perNode.get(node).add(off);
      }
    }
  }
  for (const [node, offsets] of perNode) {
    const sorted = [...offsets].sort((a, b) => a - b);
    const ranges = [];
    for (const off of sorted) {
      const last = ranges[ranges.length - 1];
      if (last && off - last[1] < 4) last[1] = off + 1;
      else ranges.push([off, off + 1]);
    }
    // From the end, so the earlier offsets stay valid while splitting.
    for (const [s, e] of ranges.reverse()) {
      const mid = node.splitText(s);
      mid.splitText(e - s);
      const mark = document.createElement('mark');
      mark.className = 'hl';
      mid.replaceWith(mark);
      mark.append(mid);
    }
  }
}

// Select text in the article and a bar with Markeer appears at the bottom.
function markBar() {
  let bar = document.getElementById('mark-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'mark-bar';
    bar.innerHTML = `<button class="btn primary" data-action="highlight">${icon('marker')}Markeer</button><button class="btn" data-action="highlight" data-v="note">${icon('pen')}Met notitie</button>`;
    // Keep the selection when the bar is clicked with a mouse.
    bar.addEventListener('mousedown', (ev) => ev.preventDefault());
    document.body.append(bar);
  }
  return bar;
}

function hideMarkBar() {
  S.markText = '';
  document.getElementById('mark-bar')?.classList.remove('show');
}

// Copying the prompt by hand counts as taking it to a chat.
document.addEventListener('copy', (ev) => {
  if (ev.target instanceof Element && ev.target.closest('#prompt-text')) recordProduction().catch((e) => toast(e.message));
});

let markTimer;
document.addEventListener('selectionchange', () => {
  clearTimeout(markTimer);
  markTimer = setTimeout(() => {
    const sel = getSelection();
    const reader = document.getElementById('reader');
    const inside = sel && !sel.isCollapsed && reader && reader.contains(sel.anchorNode) && reader.contains(sel.focusNode);
    const text = inside ? cleanHighlight(sel.toString()) : '';
    if (text.length >= 3) {
      S.markText = text;
      markBar().classList.add('show');
    } else if (S.markText) {
      // A tap on the bar clears the selection first; give the tap time to land.
      setTimeout(() => {
        if (getSelection()?.isCollapsed !== false) hideMarkBar();
      }, 400);
    }
  }, 120);
});

function readConnectForm() {
  const val = (id) => document.getElementById(id)?.value ?? '';
  if (S.cfg.modus !== 'lokaal') {
    Object.assign(S.cfg, {
      modus: 'github',
      ...parseRepoInput(val('cfg-owner'), val('cfg-repo')),
      branch: val('cfg-branch').trim() || 'main',
      map: val('cfg-map').trim().replace(/^\/+|\/+$/g, ''),
      token: cleanToken(val('cfg-token')),
    });
  }
}

const actions = {
  open: (el) => go(`#/item/${encodeURIComponent(el.dataset.id)}`),
  nav: (el) => go(el.dataset.href),
  back: () => (history.length > 1 ? history.back() : go('#/')),
  select: (el) => {
    const id = el.dataset.id;
    S.selected.has(id) ? S.selected.delete(id) : S.selected.add(id);
    render();
  },
  unpick: (el) => {
    S.selected.delete(el.dataset.id);
    render();
  },
  'clear-picks': () => {
    S.selected.clear();
    S.prompt = '';
    render();
  },
  'pick-week': pickWeek,
  'pick-stars': () => {
    S.items.filter((i) => i.ster && i.status !== 'archief' && !isLeren(i)).slice(0, 8).forEach((i) => S.selected.add(i.id));
    render();
  },
  filter: (el) => {
    S.filter = el.dataset.v;
    local.set('cm_prefs', { filter: S.filter, sort: S.sort });
    renderList();
  },
  sort: () => {
    const keys = Object.keys(SORTS);
    S.sort = keys[(keys.indexOf(S.sort) + 1) % keys.length];
    local.set('cm_prefs', { filter: S.filter, sort: S.sort });
    render();
  },
  reload: async () => {
    toast('Vernieuwen...');
    try {
      await loadVault();
      render();
      toast('Bijgewerkt');
    } catch (e) {
      toast(e.message);
    }
  },
  star: (el) => {
    if (!S.detail.ster) {
      burst(el);
      S.pop = 'star';
    }
    patchItem(S.detail.id, { ster: !S.detail.ster });
  },
  vote: (el) => {
    const val = Number(el.dataset.v);
    if (S.detail.oordeel !== val) {
      if (val === 1) burst(el, ['#2f8a57', '#ffe25c']);
      S.pop = `vote${val}`;
    }
    patchItem(S.detail.id, { oordeel: S.detail.oordeel === val ? 0 : val });
  },
  archive: () => {
    const id = S.detail.id;
    const from = S.detail.status;
    const to = from === 'archief' ? 'gelezen' : 'archief';
    patchItem(id, { status: to }).then((m) => m && toast(to === 'archief' ? 'Gearchiveerd' : 'Teruggezet', {
      actie: () => patchItem(id, { status: from }).then((back) => back && to === 'archief' && S.vault.learner.signal(back, 'archief', -1)),
    }));
  },
  delete: async () => {
    const ok = await confirmSlide({ titel: 'Dit item verwijderen?', tekst: 'Het bestand verdwijnt ook uit Obsidian.', label: 'Schuif om te verwijderen', klaar: 'Verwijderd' });
    if (!ok) return;
    try {
      const meta = S.vault.meta(S.detail.id);
      if (!meta.ster && meta.oordeel !== 1) S.vault.learner.signal(meta, 'verwijderd');
      await S.vault.remove(S.detail.id);
      S.selected.delete(S.detail.id);
      S.detail = null;
      toast('Verwijderd');
      go(S.map ? `#/map/${encodeURIComponent(S.map)}` : '#/');
    } catch (e) {
      toast(e.message);
    }
  },
  make: async (el) => {
    S.selected = new Set([S.detail.id]);
    S.soort = el.dataset.v;
    await buildCurrentPrompt();
    go('#/studio');
  },
  soort: (el) => {
    S.soort = el.dataset.v;
    S.prompt = '';
    render();
  },
  'build-prompt': async (el) => {
    if (S.gen) return;
    S.instructie = $('#instructie')?.value ?? S.instructie;
    if (S.soort === 'vrij' && !S.instructie.trim()) return toast('Schrijf eerst wat je wilt maken bij Extra instructie');
    S.gen = 'bezig';
    setGenerate(el, 'bezig', GEN_LABELS);
    try {
      // A short moment for the glow, so you see the prompt being made.
      await Promise.all([buildCurrentPrompt(), new Promise((res) => setTimeout(res, 650))]);
      S.gen = 'klaar';
      render();
      $('#prompt-text')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      toast(e.message, { soort: 'fout' });
    }
    setTimeout(() => {
      S.gen = null;
      const btn = $('.gen');
      if (btn) {
        setGenerate(btn, 'rust', GEN_LABELS);
        btn.querySelector('svg')?.replaceWith(document.createRange().createContextualFragment(icon('sparkle')));
      }
    }, 1400);
  },
  'copy-prompt': async (el) => {
    const fresh = S.productie?.key !== productionKey();
    if (fresh) burst(el);
    await copy(S.prompt, fresh ? 'Gekopieerd. De bronnen staan nu in je content-archief' : 'Prompt gekopieerd, plak hem in je chat', fresh ? { soort: 'ok', actie: undoCurrentProduction } : undefined);
    recordProduction().catch((e) => toast(e.message));
  },
  'tidy-start': () => runTidy(),
  'tidy-stop': () => {
    if (S.opschoon) S.opschoon.stop = true;
    paintTidy();
  },
  'tidy-undo': () => undoTidy(),
  'tidy-close': () => {
    S.opschoon = null;
    render();
  },
  'move-to': async (el) => {
    const m = await patchItem(S.detail.id, { map: el.dataset.v });
    if (m) toast(`Verplaatst naar ${m.map}. De machine leert hiervan.`);
  },
  doel: (el) => {
    S.doel = el.dataset.v === 'leren' ? 'leren' : 'posten';
    local.set('cm_doel', S.doel);
    renderList();
  },
  'set-doel': async (el) => {
    const id = S.detail.id;
    const naar = el.dataset.v === 'leren' ? 'leren' : 'posten';
    if (naar === (isLeren(S.detail) ? 'leren' : 'posten')) return;
    if (naar === 'leren') S.selected.delete(id);
    const m = await patchItem(id, { doel: naar });
    if (m) toast(naar === 'leren' ? 'Staat nu bij Om van te leren. De machine leert hiervan.' : 'Staat weer bij Om te posten', {
      actie: () => patchItem(id, { doel: naar === 'leren' ? 'posten' : 'leren' }),
    });
  },
  'edit-title': () => {
    S.titelEdit = true;
    renderDetail();
    const input = $('#title-input');
    input?.focus();
    input?.select();
  },
  'cancel-title': () => {
    S.titelEdit = false;
    renderDetail();
  },
  'save-title': () => saveTitle(),
  'lesson-chat': async (el) => {
    const prompt = buildLessonPrompt({ item: detailSource(S.detail), profiel: S.vault.system['profiel.md'] });
    const links = chatLinks(prompt);
    // Open first: iOS blocks pop-ups that come after an await.
    const win = window.open(links[el.dataset.v], '_blank');
    await copy(prompt, 'Prompt gekopieerd. Plak het antwoord daarna bij Lessen.');
    if (!win) location.href = links[el.dataset.v];
  },
  'lesson-copy': () => copy(buildLessonPrompt({ item: detailSource(S.detail), profiel: S.vault.system['profiel.md'] }), 'Prompt gekopieerd. Plak het antwoord daarna bij Lessen.'),
  'use-lessons': () => {
    S.lessen.add(S.detail.id);
    S.prompt = '';
    go('#/studio');
    toast('Lessen staan klaar bij Technieken toepassen. Kies nu bronnen en een vorm.');
  },
  'toggle-les': (el) => {
    const id = el.dataset.id;
    S.lessen.has(id) ? S.lessen.delete(id) : S.lessen.add(id);
    S.prompt = '';
    render();
  },
  'open-chat': async (el) => {
    const links = chatLinks(S.prompt);
    // Open first: iOS blocks pop-ups that come after an await.
    const win = window.open(links[el.dataset.v], '_blank');
    await copy(S.prompt, 'Prompt gekopieerd, plak hem in de chat');
    recordProduction().catch((e) => toast(e.message));
    if (!win) location.href = links[el.dataset.v];
  },
  'save-result': async () => {
    const text = ($('#resultaat')?.value || '').trim();
    if (!text) return toast('Plak eerst het resultaat');
    const p = await recordProduction();
    if (!p) return toast('Kies eerst bronnen');
    await takeResult(text);
  },
  'save-concept-result': () => {
    const text = ($('#plak-veld')?.value || '').trim();
    if (!text) return toast('Plak eerst het resultaat');
    return takeResult(text);
  },
  'copy-substack': () => {
    const out = forSubstack(splitNewsletter(conceptText(S.concept)).tekst);
    return copyRich(out.html, out.plain, 'Tekst gekopieerd met opmaak. Plak hem in Substack.');
  },
  'ed-tab': (el) => {
    S.editor.tab = el.dataset.v;
    render();
  },
  'ed-format': (el) => {
    const t = $('#ed-text');
    const r = applyFormat(t.value, t.selectionStart, t.selectionEnd, el.dataset.v);
    t.value = r.tekst;
    t.focus();
    t.setSelectionRange(r.start, r.end);
    S.editor.tekst = r.tekst;
    editorChanged();
  },
  'ed-subject': (el) => {
    const e = S.editor;
    const before = { titel: e.titel, tekst: e.tekst };
    const pick = splitNewsletter(joinNewsletter(e)).onderwerpregels[Number(el.dataset.v)];
    if (!pick) return;
    // The chosen line becomes the title; the list of options has done its work.
    e.titel = pick;
    e.tekst = withoutSubjects(e.tekst);
    saveEditor();
    render();
    toast('Titel gekozen', { soort: 'ok', actie: () => { Object.assign(S.editor, before); saveEditor(); render(); } });
  },
  'ed-copy-title': () => copy(S.editor.titel, 'Titel gekopieerd', { soort: 'ok' }),
  'ed-copy-sub': () => copy(S.editor.ondertitel.trim(), 'Ondertitel gekopieerd', { soort: 'ok' }),
  'ed-copy-body': () => {
    const out = forSubstack(S.editor.tekst);
    if (!out.plain) return toast('Er is nog geen tekst');
    return copyRich(out.html, out.plain, 'Tekst gekopieerd met opmaak. Plak hem in Substack.');
  },
  'ed-open-substack': () => {
    const link = composeLink('substack', '', { substack: S.vault.kanalen.substack?.url });
    window.open(link, '_blank');
    if (!S.vault.kanalen.substack?.url) toast('Tip: zet het adres van je Substack onder Instellingen, Mijn kanalen. Dan opent deze knop meteen een nieuwe post.');
  },
  'copy-block': (el) => {
    const b = outputOf(productionByFile(S.concept.file), S.concept).blokken[Number(el.dataset.v)];
    if (b) copy(b.tekst, `${b.naam} gekopieerd`, { soort: 'ok' });
  },
  'open-channel': async (el) => {
    const p = productionByFile(S.concept.file);
    const out = outputOf(p, S.concept);
    const b = out.blokken[Number(el.dataset.v)];
    if (!b) return;
    const link = composeLink(out.kanaal, b.tekst, { substack: S.vault.kanalen.substack?.url });
    // Open first: iOS blocks pop-ups that come after an await.
    const win = window.open(link, '_blank');
    await copy(b.tekst, `${b.naam} gekopieerd${KANALEN[out.kanaal]?.compose ? '' : `, plak hem in ${KANALEN[out.kanaal]?.naam || 'het kanaal'}`}`, { soort: 'ok' });
    if (!win) location.href = link;
  },
  'to-teleprompter': async (el) => {
    const b = outputOf(productionByFile(S.concept.file), S.concept).blokken[Number(el.dataset.v)];
    if (!b) return;
    // The Teleprompter keeps its text on this device; hand it this script.
    // The clipboard carries it too, in case that does not work.
    try {
      const raw = localStorage.getItem('teleprompter-v1');
      const state = raw ? JSON.parse(raw) : {};
      if (state && typeof state === 'object' && !Array.isArray(state)) localStorage.setItem('teleprompter-v1', JSON.stringify({ ...state, script: b.tekst }));
    } catch {
      // private mode or another format: the clipboard has it
    }
    await copy(b.tekst, 'Script staat in de Teleprompter');
    location.href = TELEPROMPTER_URL;
  },
  'use-hook': (el) => {
    const p = productionByFile(S.concept.file);
    const out = outputOf(p, S.concept);
    const hook = out.blokken[Number(el.dataset.v)];
    const post = out.blokken.find((x) => x.rol === 'post');
    if (!hook || !post) return;
    const text = conceptText(S.concept);
    const r = parseResult(text);
    // Only the main text changes; the title and the other sections stay.
    const next = text.replace(r.hoofd, withHook(r.hoofd, hook.tekst));
    fillProduction(p, next);
    toast('Opening vervangen', { soort: 'ok', actie: () => { fillProduction(productionByFile(p.file), text); loadConcept(p.file); } });
    return loadConcept(p.file);
  },
  'edit-concept': () => {
    S.conceptEdit = conceptText(S.concept);
    render();
    $('#concept-edit')?.focus();
  },
  'cancel-concept-edit': () => {
    S.conceptEdit = null;
    render();
  },
  'save-concept-edit': () => {
    const text = ($('#concept-edit')?.value || '').trim();
    if (!text) return toast('De tekst is leeg');
    const p = productionByFile(S.concept.file);
    if (!p) return null;
    fillProduction(p, text);
    S.conceptEdit = null;
    toast('Tekst bewaard', { soort: 'ok' });
    return loadConcept(p.file);
  },
  'show-paste-field': () => {
    S.plakVeld = true;
    render();
    $('#plak-veld')?.focus();
  },
  'post-link-paste': async () => {
    try {
      $('#post-link').value = (await navigator.clipboard.readText()).trim();
    } catch {
      toast('Plakken lukte niet, houd het veld ingedrukt');
    }
  },
  'mark-posted': async () => {
    const file = S.concept.file;
    const link = safeUrl(($('#post-link')?.value || '').trim());
    if (($('#post-link')?.value || '').trim() && !link) return toast('Dat is geen link. Laat het veld leeg of plak het adres van je post.', { soort: 'fout' });
    const day = $('#post-date')?.value || localDay();
    // Noon, so the day is the same in every time zone you open the app in.
    const gepost = new Date(`${day}T12:00:00`).toISOString();
    await updateProduction(file, { gepost, link: link || undefined });
    burst($('.posted') || $('.concept'), ['#ffe25c', '#2f8a57']);
    toast('Gemarkeerd als gepost', { soort: 'ok' });
    render();
    if (statsSource(link)) fetchCijfers(file, { stil: true });
    return null;
  },
  'save-post-link': async () => {
    const link = safeUrl(($('#post-link')?.value || '').trim());
    if (!link) return toast('Plak het adres van je post', { soort: 'fout' });
    await updateProduction(S.concept.file, { link });
    render();
    if (statsSource(link)) fetchCijfers(S.concept.file, { stil: true });
    return null;
  },
  unpost: async () => {
    const before = productionByFile(S.concept.file);
    await updateProduction(S.concept.file, { gepost: undefined, link: undefined, cijfers: undefined });
    render();
    toast('Staat weer bij Klaar om te posten', { actie: async () => { await updateProduction(before.file, { gepost: before.gepost, link: before.link, cijfers: before.cijfers }); render(); } });
  },
  'save-cijfers': async () => {
    const input = Object.fromEntries([...document.querySelectorAll('.cijfer')].map((el) => [el.dataset.k, el.value]));
    const cijfers = cleanCijfers(input);
    if (!Object.keys(cijfers).length) return toast('Vul minstens één getal in', { soort: 'fout' });
    await saveCijfers(S.concept.file, cijfers);
    toast('Cijfers bewaard', { soort: 'ok' });
    render();
    return null;
  },
  'fetch-cijfers': () => fetchCijfers(S.concept.file),
  repurpose: async (el) => {
    const p = productionByFile(S.concept.file);
    const ids = p.bronnen.filter((id) => S.vault.has(id));
    if (!ids.length) return toast('De bronnen van dit stuk zijn verwijderd. Kies nieuwe bronnen in de feed.', { soort: 'fout' });
    S.selected = new Set(ids);
    S.soort = el.dataset.v;
    S.basis = { soort: p.soort, label: p.label, tekst: stripCode(conceptText(S.concept)), bronnen: ids };
    S.instructie = '';
    S.productie = null;
    S.promptCode = '';
    await buildCurrentPrompt();
    go('#/studio');
    return null;
  },
  'paste-result': async () => {
    // From the Studio the production may not exist yet: the prompt was only shown.
    if (S.view === 'studio' && S.prompt) await recordProduction();
    return pasteResult();
  },
  'drop-basis': async () => {
    S.basis = null;
    if (S.prompt) await buildCurrentPrompt();
    render();
  },
  'terug-weg': () => {
    local.set('cm_terug_weg', S.terug || '');
    S.terug = null;
    render();
  },
  'undo-production': async (el) => {
    const p = productionByFile(el.dataset.v || S.concept?.file);
    if (!p) return;
    if (S.view === 'concept' && !(await confirmSlide({ titel: 'Uit je content-archief halen?', tekst: 'De bronnen gaan terug naar je feed en de notitie in Concepten verdwijnt.', label: 'Schuif om eruit te halen', klaar: 'Eruit gehaald' }))) return;
    await undoProduction(p);
    toast('Uit je content-archief gehaald, de bronnen staan weer in je feed');
    if (S.view === 'concept') go(S.conceptFrom === 'archief' ? '#/archief' : '#/studio');
    else render();
  },
  'reuse-sources': (el) => {
    const p = productionByFile(el.dataset.v || S.concept.file);
    if (!p) return;
    S.selected = new Set(p.bronnen.filter((id) => S.vault.has(id)));
    S.prompt = '';
    go('#/studio');
  },
  stack: (el) => {
    const f = el.dataset.v;
    S.openStacks.has(f) ? S.openStacks.delete(f) : S.openStacks.add(f);
    render();
  },
  'archief-status': (el) => {
    S.archiefStatus = el.dataset.v || null;
    render();
  },
  'archief-soort': (el) => {
    S.archiefSoort = el.dataset.v || null;
    render();
  },
  unuse: () => {
    const id = S.detail.id;
    patchItem(id, { status: 'gelezen' }).then((m) => m && toast('Staat weer in je feed', { actie: () => patchItem(id, { status: 'gebruikt' }) }));
  },
  'search-topic': (el) => {
    S.q = el.dataset.v;
    S.filter = 'actief';
    go('#/');
  },
  'copy-concept': () => copy(conceptText(S.concept)),
  bundel: (el) => {
    S.bundel = el.dataset.v || null;
    if (S.view !== 'map') return go(`#/map/${encodeURIComponent(S.map)}`);
    render();
  },
  'edit-bundels': () => {
    S.editBundels = bundlesFor(bundleModel(), S.map).map((b) => ({ naam: b.naam, tags: [...b.tags] }));
    S.sheet = 'bundels';
    render();
  },
  'bundle-add': () => {
    readBundleRows();
    S.editBundels.push({ naam: '', tags: [] });
    render();
    document.getElementById(`bn-${S.editBundels.length - 1}`)?.focus();
  },
  'bundle-remove': (el) => {
    readBundleRows();
    S.editBundels.splice(Number(el.dataset.v), 1);
    render();
  },
  'bundle-save': () => {
    readBundleRows();
    const next = setFolderBundles(bundleModel(), S.map, S.editBundels);
    S.vault.writeSystem('bundels.md', stringifyBundles(next));
    if (S.bundel && !bundlesFor(next, S.map).some((b) => b.naam === S.bundel)) S.bundel = null;
    S.sheet = null;
    S.editBundels = null;
    toast('Bundels bewaard');
    render();
  },
  'prompt-bundel': async () => {
    const model = bundleModel();
    const items = S.items.filter((i) => i.map === S.map && i.status !== 'archief' && !isLeren(i) && bundleOf(i, model)?.naam === S.bundel)
      .sort((a, b) => b.rank - a.rank).slice(0, 8);
    if (!items.length) return toast('Geen items in deze bundel');
    S.selected = new Set(items.map((i) => i.id));
    if (!S.instructie.trim()) S.instructie = `Rode draad: ${S.bundel}.`;
    await buildCurrentPrompt();
    go('#/studio');
  },
  'download-shortcut': () => {
    const xml = buildShortcut({ owner: S.cfg.owner, repo: S.cfg.repo, branch: S.cfg.branch, map: S.cfg.map, token: S.cfg.token });
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/octet-stream' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'Contentmachine.shortcut' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Gedownload. Plak nu de regel in Terminal.');
  },
  embed: () => {
    S.embed = S.detail.id;
    renderDetail();
  },
  highlight: async (el) => {
    const tekst = S.markText;
    if (!tekst || !S.detail) return;
    const notitie = el.dataset.v === 'note' ? prompt('Je notitie bij deze markering') : '';
    if (notitie === null) return;
    hideMarkBar();
    getSelection()?.removeAllRanges();
    if (parseHighlights(S.detail.body || '').some((h) => sameHighlight(h.tekst, tekst))) return toast('Stond al gemarkeerd');
    burst(el, ['#ffe25c', '#f0dc7a']);
    const m = await editHighlights((list) => [...list, { tekst, notitie: notitie.trim() }]);
    if (m) {
      S.vault.learner.signal(m, 'markering');
      toast('Gemarkeerd', { soort: 'ok' });
    }
  },
  'hl-note': async (el) => {
    const n = Number(el.dataset.v);
    const note = prompt('Notitie bij deze markering', parseHighlights(S.detail.body || '')[n]?.notitie || '');
    if (note === null) return;
    await editHighlights((list) => list.map((h, k) => (k === n ? { ...h, notitie: note.trim() } : h)));
  },
  'hl-remove': async (el) => {
    const n = Number(el.dataset.v);
    const removed = parseHighlights(S.detail.body || '')[n];
    if (await editHighlights((list) => list.filter((_, k) => k !== n))) {
      toast('Markering weggehaald', { actie: () => editHighlights((list) => [...list.slice(0, n), removed, ...list.slice(n)]) });
    }
  },
  'review-make': async (el) => {
    S.selected = new Set([el.dataset.id]);
    S.soort = 'linkedin';
    await buildCurrentPrompt();
    go('#/studio');
  },
  'review-stop': (el) => {
    S.vault.saveReview(stopReview(S.vault.herhaling, el.dataset.id));
    toast('Komt niet meer terug in Vandaag');
    render();
  },
  'review-prompt': async () => {
    S.selected = new Set(S.reviewIds.filter((id) => S.vault.has(id)));
    S.soort = 'nieuwsbrief';
    await buildCurrentPrompt();
    go('#/studio');
  },
  copy: (el) => copy(el.dataset.v),
  // The token never sits in the page; it goes straight to the clipboard.
  'copy-token': () => copy(S.cfg.token, 'Token gekopieerd. Plak het in Terminal als daarom gevraagd wordt.'),
  add: () => {
    S.sheet = 'add';
    render();
    setTimeout(() => $('#add-input')?.focus(), 50);
  },
  'close-sheet': () => {
    S.sheet = null;
    render();
  },
  paste: async () => {
    try {
      $('#add-input').value = await navigator.clipboard.readText();
    } catch {
      toast('Plakken lukte niet, houd het veld ingedrukt');
    }
  },
  'save-add': async () => {
    const text = $('#add-input').value.trim();
    if (!text) return toast('Plak eerst een link of tekst');
    S.sheet = null;
    render();
    try {
      const meta = await saveInput({ text });
      if (meta.eigen) {
        if (meta.dubbel) toast('Deze post van jou stond al op gepost');
        return go(`#/concept/${encodeURIComponent(meta.file)}`);
      }
      toast(meta.dubbel ? 'Stond er al in' : `Bewaard in ${meta.map}`);
      renderList();
    } catch (e) {
      toast(e.message);
    }
  },
  'new-folder': () => {
    const naam = prompt('Naam van de nieuwe map');
    if (!naam?.trim()) return;
    const folder = S.vault.createFolder(naam);
    go(`#/map/${encodeURIComponent(folder)}`);
  },
  'rename-folder': async (el) => {
    const van = el.dataset.v;
    const naar = prompt(`Nieuwe naam voor "${van}"`, van);
    if (!naar?.trim() || naar === van) return;
    try {
      const dst = await S.vault.renameFolder(van, naar);
      const model = bundleModel();
      if (model.folders.has(van)) S.vault.writeSystem('bundels.md', stringifyBundles(renameFolderInBundles(model, van, dst)));
      refreshItems();
      toast('Map hernoemd');
      render();
    } catch (e) {
      toast(e.message);
    }
  },
  'save-system': (el) => {
    const name = el.dataset.v;
    const text = $(`#sys-${name}`).value;
    if (!text.trim()) return toast('Lege tekst niet bewaard');
    S.vault.writeSystem(`${name}.md`, text);
    toast('Bewaard');
  },
  deck: (el) => swipeTop(el.dataset.v),
  'deck-stars': () => {
    const ids = S.deck.geschiedenis.filter((h) => h.dir === 'right').map((h) => h.id).filter((id) => S.vault.has(id));
    S.selected = new Set(ids);
    S.prompt = '';
    go('#/studio');
  },
  check: (el) => {
    const manual = local.get('cm_checklist', {});
    manual[el.dataset.v] = !manual[el.dataset.v];
    local.set('cm_checklist', manual);
    el.setAttribute('aria-checked', String(manual[el.dataset.v]));
    if (manual[el.dataset.v]) pop(el.querySelector('.box'));
    const tasks = setupTasks();
    const done = tasks.filter((t) => t.klaar).length;
    setRing($('.checklist .ring'), done, tasks.length);
    $('#check-count').textContent = `${done} van ${tasks.length} klaar`;
  },
  'video-find': () => findVideo(),
  'video-paste': async () => {
    try {
      const text = await navigator.clipboard.readText();
      $('#video-url').value = text;
      findVideo();
    } catch {
      toast('Plakken lukte niet, houd het veld ingedrukt');
    }
  },
  'video-pick': (el) => {
    S.video.keuze = Number(el.dataset.v);
    S.video.dl = emptyDl();
    render();
  },
  'video-download': (el) => downloadVideo(el.dataset.v === 'alles'),
  'yt-download': () => downloadYouTube(),
  'yt-pick': (el) => {
    S.video.yKeuze = Number(el.dataset.v);
    S.video.dl = emptyDl();
    render();
  },
  'video-save': () => saveVideoFile(),
  'video-vault': async () => {
    try {
      const meta = await saveInput({ url: S.video.info.url });
      toast(meta.dubbel ? 'Stond er al in' : `Bewaard in ${meta.map}`, { soort: 'ok' });
      render();
    } catch (e) {
      toast(e.message, { soort: 'fout' });
    }
  },
  'add-video': () => {
    const text = $('#add-input').value.trim();
    S.sheet = null;
    go(`#/video${text ? `?url=${encodeURIComponent(text)}` : ''}`);
  },
  'download-video-shortcut': () => {
    const url = URL.createObjectURL(new Blob([buildVideoShortcut(APP_URL)], { type: 'application/octet-stream' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'Videodownloader.shortcut' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Gedownload. Plak nu de regel in Terminal.');
  },
  // Settings switches save right away.
  toggle: (el) => {
    const key = el.dataset.v;
    S.cfg[key] = flipSwitch(el);
    local.set('cm_config', S.cfg);
    toast(S.cfg[key] ? 'Aangezet' : 'Uitgezet', { soort: 'ok', duur: 1600 });
    if (key === 'haiku') setTimeout(render, 260);
  },
  modus: (el) => {
    readConnectForm();
    S.cfg.modus = el.dataset.v;
    render();
  },
  connect: async () => {
    readConnectForm();
    if (!S.cfg.modus) S.cfg.modus = 'github';
    if (S.cfg.modus === 'github' && (!S.cfg.owner || !S.cfg.repo || !S.cfg.token)) {
      S.fout = 'Vul gebruiker, repo en token in.';
      return render();
    }
    if (S.cfg.modus === 'github') {
      try {
        await makeStore(S.cfg).check();
      } catch (e) {
        S.fout = e.message;
        return render();
      }
    }
    local.set('cm_config', S.cfg);
    S.ready = false;
    await connect();
    if (S.ready) go('#/');
    else render();
  },
  'clear-pending': async () => {
    if (!(await confirmSlide({ titel: 'Wachtende wijzigingen wissen?', tekst: 'Wat al op GitHub staat, blijft gewoon staan.', label: 'Schuif om te wissen', klaar: 'Gewist' }))) return;
    safeStorage.removeItem(pendingKey());
    S.fout = '';
    await connect();
    if (S.ready) go('#/');
    else render();
  },
  disconnect: async () => {
    if (!(await confirmSlide({ titel: 'Dit apparaat ontkoppelen?', tekst: 'Je vault blijft gewoon staan; alleen de instellingen hier worden gewist.', label: 'Schuif om te ontkoppelen', klaar: 'Ontkoppeld' }))) return;
    local.set('cm_config', null);
    S.cfg = { ...DEFAULT_CFG };
    S.vault = null;
    S.ready = false;
    S.items = [];
    go('#/');
  },
  'share-done': () => {
    S.sharing = null;
    history.replaceState(null, '', `${location.pathname}#/`);
    onRoute();
  },
  'close-window': () => {
    window.close();
    setTimeout(() => actions['share-done'](), 150);
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const name = el.dataset.action;
  // A tap inside the sheet must not close it.
  if (name === 'close-sheet' && el.classList.contains('overlay') && ev.target.closest('[data-stop]')) return;
  if (name === 'select') ev.stopPropagation();
  ev.preventDefault();
  actions[name]?.(el, ev);
});

let notesTimer;
let lessenTimer;
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'add-input') {
    // Grows with what you paste, like the prompt box on nina-ai.nl/ui.
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight + 2, 260)}px`;
  }
  if (t.id === 'q') {
    S.q = t.value;
    renderList();
  } else if (t.id === 'instructie') {
    S.instructie = t.value;
  } else if (t.id === 'resultaat') {
    S.resultaat = t.value;
  } else if (t.id === 'ed-text' || t.id === 'ed-title' || t.id === 'ed-sub') {
    const e = S.editor;
    if (t.id === 'ed-text') e.tekst = t.value;
    else if (t.id === 'ed-title') e.titel = t.value;
    else e.ondertitel = t.value;
    editorChanged();
  } else if (t.id === 'lessen') {
    const id = S.detail.id;
    S.detail.lessenTekst = t.value;
    $('#lessen-state').textContent = 'typen...';
    clearTimeout(lessenTimer);
    lessenTimer = setTimeout(() => saveLessons(id, t.value), 900);
  } else if (t.id === 'notes') {
    const id = S.detail.id;
    $('#notes-state').textContent = 'typen...';
    clearTimeout(notesTimer);
    notesTimer = setTimeout(async () => {
      const m = await patchItem(id, { notities: t.value });
      const st = $('#notes-state');
      if (m && st) st.textContent = 'bewaard';
    }, 700);
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.id === 'map-select') {
    let map = t.value;
    if (map === '__new') {
      map = prompt('Naam van de nieuwe map')?.trim();
      if (!map) {
        t.value = S.detail.map;
        return;
      }
    }
    const m = await patchItem(S.detail.id, { map });
    if (m) toast(`Verplaatst naar ${m.map}. De machine leert hiervan.`);
  } else if (t.classList.contains('kanaal-veld')) {
    const id = t.closest('[data-kanaal]').dataset.kanaal;
    const next = { ...S.vault.kanalen, [id]: { ...S.vault.kanalen[id] } };
    const key = t.dataset.k;
    let val = t.value.trim();
    if (key === 'doel') val = Math.max(0, Math.min(50, parseInt(val, 10) || 0)) || undefined;
    if (key === 'naam' && id === 'substack') {
      if (val && !/^https:\/\/[^\s/]+/.test(val)) {
        toast('Het adres van je Substack begint met https://', { soort: 'fout' });
        t.value = S.vault.kanalen.substack?.naam || '';
        return;
      }
      next[id].url = val.replace(/\/+$/, '') || undefined;
    }
    if (val) next[id][key] = val;
    else delete next[id][key];
    // A language equal to the default needs no entry.
    if (next[id].taal === KANALEN[id].taal) delete next[id].taal;
    if (!Object.keys(next[id]).length) delete next[id];
    S.vault.saveKanalen(next);
    toast('Bewaard', { soort: 'ok' });
  } else if (t.id === 'cfg-cobalt-url') {
    const v = t.value.trim().replace(/\/+$/, '');
    if (v && !/^https:\/\/[^\s/]+/.test(v)) {
      toast('Het adres moet met https:// beginnen', { soort: 'fout' });
      t.value = S.cfg.cobaltUrl;
      return;
    }
    S.cfg.cobaltUrl = v;
    local.set('cm_config', S.cfg);
    toast(v ? 'Cobalt-server bewaard' : 'Cobalt-server weggehaald', { soort: 'ok' });
  } else if (t.id === 'cfg-cobalt-key') {
    S.cfg.cobaltKey = t.value.trim();
    local.set('cm_config', S.cfg);
    toast('Sleutel bewaard', { soort: 'ok' });
  } else if (t.id === 'cfg-key') {
    S.cfg.anthropicKey = t.value.trim();
    local.set('cm_config', S.cfg);
    toast('Sleutel bewaard', { soort: 'ok' });
  } else if (t.id === 'tags-input') {
    await patchItem(S.detail.id, { tags: t.value.split(/[,\s]+/).map((x) => x.trim().replace(/^#/, '')).filter(Boolean) });
    runAutoBundle();
  }
});

// Keys: arrows in the quick sort, Cmd+Enter saves what you typed in the add sheet.
document.addEventListener('keydown', (ev) => {
  const typing = ev.target.closest?.('input, textarea, select, [contenteditable]');
  if (ev.target.id === 'title-input' && (ev.key === 'Enter' || ev.key === 'Escape')) {
    ev.preventDefault();
    if (ev.key === 'Enter') saveTitle();
    else actions['cancel-title']();
    return;
  }
  if (ev.target.id === 'video-url' && ev.key === 'Enter') {
    ev.preventDefault();
    findVideo();
    return;
  }
  if (ev.target.id === 'add-input' && ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
    ev.preventDefault();
    actions['save-add']();
    return;
  }
  if (S.view !== 'sorteren' || typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const dir = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'later' }[ev.key];
  if (dir) {
    ev.preventDefault();
    swipeTop(dir);
  } else if (ev.key === 'Enter' && $('.deck-card.top')) {
    go(`#/item/${encodeURIComponent($('.deck-card.top').dataset.id)}`);
  }
});

// Expired or blocked preview images: show the source letter instead of a broken icon.
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.classList.contains('thumb')) {
    const span = document.createElement('span');
    span.className = 'thumb mono';
    span.style.setProperty('--h', img.dataset.hue || '0');
    span.textContent = img.dataset.letter || '?';
    img.replaceWith(span);
  } else if (img.closest('.hero')) {
    const hero = img.closest('.hero');
    if (hero.classList.contains('playable')) {
      img.remove();
      hero.classList.add('no-image');
    } else hero.remove();
  }
}, true);

addEventListener('hashchange', onRoute);
addEventListener('resize', () => {
  const d = isDesktop();
  if (d !== S.wasDesktop) {
    S.wasDesktop = d;
    render();
  }
});

// Push pending changes before iOS freezes the page, pick up new links on return.
document.addEventListener('visibilitychange', () => {
  if (!S.ready) return;
  if (document.hidden) S.vault.flush().catch(() => {});
  else {
    watchReturn();
    if (Date.now() - S.lastLoad > 60000 && !S.verwerken) loadVault().then(render).catch(() => {});
  }
});

// ---------- sharing into the app (bookmarklet, Android share target, #/deel?url=) ----------
function shareParams() {
  const fromHash = new URLSearchParams(location.hash.split('?')[1] || '');
  const fromSearch = new URLSearchParams(location.search);
  const pick = (k) => fromHash.get(k) || fromSearch.get(k) || '';
  return { url: pick('url'), text: pick('text'), title: pick('title') };
}

async function handleShare() {
  const input = shareParams();
  if (!input.url && !input.text) return go('#/');
  if (!S.ready) {
    if (!S.cfg.modus) return render();
    await connect();
    if (!S.ready) return render();
  }
  const code = findCode(input.text);
  if (code && S.vault.content.some((x) => x.code === code)) {
    const done = await takeResult(input.text, { open: false });
    await S.vault.flush().catch(() => {});
    return go(done ? `#/concept/${encodeURIComponent(done.file)}` : '#/');
  }
  S.sharing = { state: 'bezig' };
  render();
  try {
    const r = await saveInput(input);
    await S.vault.flush();
    S.sharing = { state: 'ok', r };
  } catch (e) {
    S.sharing = { state: 'fout', msg: e.message };
  }
  render();
}

// ---------- boot ----------
async function boot() {
  const prefs = local.get('cm_prefs', {});
  if (prefs.filter) S.filter = prefs.filter;
  if (prefs.sort && SORTS[prefs.sort]) S.sort = prefs.sort;
  S.wasDesktop = isDesktop();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  setupDeck((dir, id) => (dir === 'tap' ? go(`#/item/${encodeURIComponent(id)}`) : deckAction(dir, id)));
  setupTilt();
  // Swipe a card in the feed: left into the archive (or back out of it), right for a star.
  setupSwipeAway({
    selector: '#list > .card',
    actionFor: (card, dir) => {
      const meta = S.vault?.has(card.dataset.id) ? S.vault.meta(card.dataset.id) : null;
      if (!meta) return null;
      if (dir === 'right') return { label: meta.ster ? 'Ster weg' : 'Ster', icon: icon('star', !meta.ster), soort: 'ster' };
      return { label: meta.status === 'archief' ? 'Terugzetten' : 'Archief', icon: icon('archive'), fly: true };
    },
    onSwipe: (card, dir) => (dir === 'right' ? swipeStar(card) : swipeArchive(card.dataset.id)),
  });
  route();
  const sharing = S.view === 'deel' || new URLSearchParams(location.search).has('url') || new URLSearchParams(location.search).has('text');
  if (sharing) return handleShare();
  if (S.view === 'video') {
    onRoute();
    if (S.cfg.modus) connect().then(render);
    return;
  }
  if (S.cfg.modus) await connect();
  onRoute();
}

boot();
