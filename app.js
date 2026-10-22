// Contentmachine: a free, static web app. No server: the vault lives in your
// own GitHub repo (or on this device) and the browser talks to it directly.
import { GitHubStore, LocalStore } from './lib/store.js';
import { Vault } from './lib/vault.js';
import { processCapture, processInbox, backfillPreviews } from './lib/pipeline.js';
import { embedFor } from './lib/embeds.js';
import { buildPrompt, chatLinks, SOORTEN as PROMPT_SOORTEN } from './lib/prompts.js';
import { trainModel } from './lib/classify.js';
import { STATUSES, getSection } from './lib/frontmatter.js';

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
};
const icon = (name, fill = false) =>
  `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const SOORTEN = Object.entries(PROMPT_SOORTEN).map(([id, s]) => ({ id, ...s }));
const FILTERS = [['actief', 'Alles'], ['nieuw', 'Ongelezen'], ['ster', 'Ster'], ['gebruikt', 'Gebruikt'], ['archief', 'Archief']];
const SORTS = { top: 'Top', nieuw: 'Nieuwst', trending: 'Trending' };
const TYPE_LABEL = { artikel: 'Artikel', tweet: 'Post op X', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', threads: 'Threads', notitie: 'Notitie', pdf: 'PDF' };
const APP_URL = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;

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

const DEFAULT_CFG = { modus: '', owner: '', repo: '', branch: 'main', map: 'Contentmachine', token: '', reader: true, previews: true, haiku: false, anthropicKey: '' };

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
  backfilling: false,
  lastLoad: 0,
};

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

async function copy(text, label = 'Gekopieerd') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
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

function folderList() {
  const counts = new Map(S.vault.folders().map((f) => [f, 0]));
  for (const i of S.items) counts.set(i.map, (counts.get(i.map) || 0) + 1);
  return [...counts].map(([naam, aantal]) => ({ naam, aantal }))
    .sort((a, b) => (a.naam === 'Inbox' ? -1 : b.naam === 'Inbox' ? 1 : b.aantal - a.aantal || a.naam.localeCompare(b.naam)));
}

function visibleItems() {
  let list = S.items;
  if (S.map) list = list.filter((i) => i.map === S.map);
  const f = S.filter;
  list = list.filter((i) => (f === 'actief' ? i.status !== 'archief'
    : f === 'nieuw' ? i.status === 'nieuw'
      : f === 'ster' ? i.ster
        : f === 'gebruikt' ? i.status === 'gebruikt'
          : i.status === 'archief'));
  if (S.q) {
    const q = S.q.toLowerCase();
    list = list.filter((i) => `${i.titel} ${i.samenvatting || ''} ${(i.tags || []).join(' ')} ${i.bron || ''} ${i.auteur || ''} ${i.map}`.toLowerCase().includes(q));
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
  const opts = { reader: S.cfg.reader, previews: S.cfg.previews !== false, onWarning: (m) => toast(m) };
  if (S.cfg.haiku && S.cfg.anthropicKey) {
    opts.haiku = async (item, ctx) => (await import('./lib/haiku.js')).enrichWithHaiku(S.cfg.anthropicKey, item, ctx);
  }
  return opts;
}

async function connect() {
  S.connecting = true;
  S.fout = '';
  render();
  try {
    const vault = new Vault(makeStore(S.cfg), {
      root: S.cfg.modus === 'lokaal' ? 'Contentmachine' : S.cfg.map,
      storage: safeStorage,
      storageKey: `cm_pending:${S.cfg.modus}:${S.cfg.owner}/${S.cfg.repo}`,
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
async function loadVault() {
  if (S.vault.pending.size) await S.vault.flush().catch(() => {});
  const { captures, moves } = await S.vault.load();
  S.lastLoad = Date.now();
  refreshItems();
  if (moves.length) toast(`${moves.length} verplaatsing${moves.length === 1 ? '' : 'en'} uit Obsidian geleerd`);
  if (captures.length) {
    S.verwerken = { klaar: 0, totaal: captures.length };
    render();
    await processInbox(S.vault, captures, {
      ...pipelineOpts(),
      onProgress: (klaar, totaal) => {
        S.verwerken = { klaar, totaal };
        refreshItems();
        renderList();
      },
    });
    S.verwerken = null;
    toast(`${captures.length} nieuwe link${captures.length === 1 ? '' : 's'} geordend`);
    S.vault.flush().catch((e) => toast(e.message));
  }
  refreshItems();
  backfill();
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

// Same rule as the vault: notes end only at a heading the app writes.
function withoutNotes(body, image) {
  const out = body.replace(/^## Mijn notities[ \t]*\n[\s\S]*?(?=^## (?:Kernpunten|Content-ideeën|Bron)[ \t]*$|(?![\s\S]))/m, '');
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
  if (S.view === 'map') S.map = S.param;
}

const go = (hash) => {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
};

async function onRoute() {
  const prev = S.view;
  route();
  if (S.view === 'deel') return handleShare();
  // A newly opened item starts at the top; back in the feed you land where you were.
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
}

async function loadDetail(id) {
  if (S.detail?.id !== id) {
    S.detail = null;
    S.embed = null;
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
        ${i.ster ? `<span class="star-mini">${icon('star', true)}</span>` : ''}
        <span class="score ${scoreClass(i.rank)}" title="Basis ${i.score}, geleerd ${i.boost >= 0 ? '+' : ''}${i.boost}">${shown(i.rank)}</span>
      </div>
      <h3>${esc(i.titel)}</h3>
      ${i.samenvatting ? `<p>${esc(i.samenvatting)}</p>` : ''}
      <div class="tags">${S.map ? '' : `<span class="tag">${esc(i.map)}</span>`}${(i.tags || []).slice(0, 3).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
    </div>
    <div class="card-side">
      ${thumbHtml(i)}
      <button class="select-box" data-action="select" data-id="${esc(i.id)}" aria-label="Selecteer voor een prompt">${icon('check')}</button>
    </div>
  </article>`;
}

function listHtml() {
  const busy = S.verwerken ? `<div class="panel small"><div class="row"><span class="spinner"></span>Nieuwe links ordenen: ${S.verwerken.klaar} van ${S.verwerken.totaal}</div></div>` : '';
  if (!S.items.length && !S.verwerken) {
    return `<div class="empty"><h2>Nog niets bewaard</h2><p>Deel een link via de Deel-knop op je iPhone, of tik op + om een link te plakken.</p><p><a href="#/instellingen">iPhone-opdracht instellen</a></p></div>`;
  }
  const items = visibleItems();
  return busy + (items.length ? items.map(card).join('') : '<div class="empty"><p>Niets gevonden met dit filter.</p></div>');
}

function chipsHtml() {
  const base = S.map ? S.items.filter((i) => i.map === S.map) : S.items;
  const count = {
    actief: base.filter((i) => i.status !== 'archief').length,
    nieuw: base.filter((i) => i.status === 'nieuw').length,
    ster: base.filter((i) => i.ster).length,
    gebruikt: base.filter((i) => i.status === 'gebruikt').length,
    archief: base.filter((i) => i.status === 'archief').length,
  };
  return FILTERS.map(([k, label]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-action="filter" data-v="${k}">${label}<span class="n">${count[k]}</span></button>`).join('');
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
      <div style="flex:1;min-width:0"><span class="dateline">${esc(dateline())}</span><h1>${esc(S.map || 'Feed')}</h1></div>
      <button class="icon-btn" data-action="reload" aria-label="Vernieuwen" title="Vernieuwen">${icon('refresh')}</button>
      <button class="btn" data-action="sort" title="Sortering">${icon('sort')}${SORTS[S.sort]}</button>
    </div>
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="Zoek in titels, tags en samenvattingen" value="${esc(S.q)}" autocomplete="off"></label>
    <div class="chips" id="chips">${chipsHtml()}</div>
    <div class="list" id="list">${listHtml()}</div>`;
}

function foldersView() {
  return `<div class="topbar"><div style="flex:1"><span class="dateline">${S.items.length} items</span><h1>Mappen</h1></div><button class="btn" data-action="new-folder">${icon('plus')}Nieuw</button></div>
    <div class="list">${folderList().map((f) => `
      <div class="card" data-action="nav" data-href="#/map/${encodeURIComponent(f.naam)}">
        <div class="row">${icon(f.naam === 'Inbox' ? 'inbox' : 'folder')}<h3 style="margin:0;flex:1">${esc(f.naam)}</h3><span class="muted">${f.aantal}</span></div>
      </div>`).join('')}
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
    <h2>${esc(d.titel)}</h2>
    <div class="meta-line">${d.bron ? `<span>${esc(d.bron)}</span>` : ''}${d.auteur ? `<span>${esc(d.auteur)}</span>` : ''}<span>${esc(d.status)}</span></div>
    ${d.invalid ? '<div class="panel error-text">De eigenschappen van deze notitie zijn ongeldig (YAML). Herstel ze in Obsidian; tot die tijd kun je hem hier niet aanpassen.</div>' : ''}
    <div class="action-row">
      <button class="icon-btn ${d.ster ? 'on' : ''}" data-action="star" aria-label="Ster">${icon('star', d.ster)}</button>
      <button class="icon-btn ${d.oordeel === 1 ? 'on-good' : ''}" data-action="vote" data-v="1" aria-label="Meer hiervan">${icon('up')}</button>
      <button class="icon-btn ${d.oordeel === -1 ? 'on-bad' : ''}" data-action="vote" data-v="-1" aria-label="Minder hiervan">${icon('down')}</button>
      <button class="icon-btn ${d.status === 'archief' ? 'on' : ''}" data-action="archive" aria-label="Archiveer">${icon('archive')}</button>
      ${origineel ? `<a class="btn" href="${esc(origineel)}" target="_blank" rel="noopener">${icon('external')}Origineel</a>` : ''}
      <button class="icon-btn" data-action="delete" aria-label="Verwijder">${icon('trash')}</button>
    </div>
    <div class="scorebox"><div class="big">${shown(d.rank)}</div><div class="why">${d.ordening === 'haiku' ? 'Geordend met Claude Haiku.' : d.ordening ? `Map gekozen via ${esc(d.ordening)}.` : ''}<br><span class="small">Basis ${d.score} ${d.boost >= 0 ? '+' : ''}${d.boost} geleerd${d.ster ? ', +15 ster' : ''}${d.oordeel ? `, ${d.oordeel > 0 ? '+' : ''}${d.oordeel * 10} duim` : ''}</span></div></div>
    <div class="panel">
      <h3>Maak er content van</h3>
      <p class="small muted">Je krijgt een kant-en-klare prompt voor Claude of ChatGPT.</p>
      <div class="make-row">
        <button class="btn" data-action="make" data-v="linkedin">${icon('sparkle')}LinkedIn</button>
        <button class="btn" data-action="make" data-v="tiktok">${icon('sparkle')}TikTok</button>
        <button class="btn" data-action="make" data-v="nieuwsbrief">${icon('sparkle')}Nieuwsbrief</button>
        <button class="btn ghost" data-action="select" data-id="${esc(d.id)}">${S.selected.has(d.id) ? 'In selectie' : 'Voeg toe aan selectie'}</button>
      </div>
    </div>
    <div class="field"><label for="map-select">Map</label><select id="map-select">${folderOptions(d.map)}</select></div>
    <div class="field"><label for="tags-input">Tags (komma's)</label><input id="tags-input" value="${esc((d.tags || []).join(', '))}" autocomplete="off"></div>
    <div class="field"><label for="notes">Mijn notities <span id="notes-state" class="small"></span></label><textarea id="notes" rows="4" placeholder="Jouw gedachten, invalshoek of hook. Gaat mee in de prompt en staat ook in Obsidian.">${esc(d.notities || '')}</textarea></div>
    <div class="md">${md(withoutNotes(d.body || '', image))}</div>
    <p class="small muted">Bestand: ${esc(d.path)}</p>
  </div>`;
}

function studioView() {
  const picked = [...S.selected].map((id) => S.items.find((i) => i.id === id)).filter(Boolean);
  const concepts = S.vault.concepts();
  return `<div class="topbar"><div style="flex:1"><span class="dateline">Prompt-generator</span><h1>Studio</h1></div></div>
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
    <div class="field"><label>Wat wil je maken?</label>
      <div class="seg">${SOORTEN.map((s) => `<button class="${S.soort === s.id ? 'on' : ''}" data-action="soort" data-v="${s.id}"><b>${s.label}</b><span>${s.sub}</span></button>`).join('')}</div>
    </div>
    <div class="field"><label for="instructie">Extra instructie ${S.soort === 'vrij' ? '' : '(optioneel)'}</label>
      <textarea id="instructie" rows="3" placeholder="Bijv.: schrijf voor HR-managers, of: focus op de kosten voor het mkb">${esc(S.instructie)}</textarea></div>
    <button class="btn primary block" data-action="build-prompt" ${picked.length ? '' : 'disabled'}>${icon('sparkle')}Maak prompt</button>
    ${S.prompt ? `<div class="panel result">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3>Je prompt</h3><span class="small muted">${S.prompt.length.toLocaleString('nl-NL')} tekens</span></div>
      <div class="make-row" style="margin:6px 0 12px">
        <button class="btn primary" data-action="copy-prompt">${icon('copy')}Kopieer</button>
        <button class="btn" data-action="open-chat" data-v="claude">${icon('external')}Kopieer en open Claude</button>
        <button class="btn" data-action="open-chat" data-v="chatgpt">${icon('external')}Kopieer en open ChatGPT</button>
      </div>
      <textarea id="prompt-text" rows="10" readonly>${esc(S.prompt)}</textarea>
      <div class="field"><label for="resultaat">Resultaat bewaren (optioneel)</label>
        <textarea id="resultaat" rows="6" placeholder="Plak hier wat Claude of ChatGPT schreef. Het komt in Concepten/ met links naar de bronnen, en de bronnen tellen als gebruikt.">${esc(S.resultaat)}</textarea></div>
      <button class="btn block" data-action="save-result">${icon('check')}Bewaar in Concepten</button>
    </div>` : ''}
    <div class="panel">
      <h3>Concepten</h3>
      ${concepts.length
        ? concepts.slice(0, 30).map((c) => `<div class="concept-row" data-action="nav" data-href="#/concept/${encodeURIComponent(c.file)}"><span class="soort">${esc(c.soort)}</span><span style="flex:1">${esc(c.titel)}</span><span class="small muted">${esc(c.datum)}</span></div>`).join('')
        : '<p class="muted small">Nog geen concepten.</p>'}
    </div>`;
}

function conceptView() {
  const c = S.concept;
  return `<div class="detail">
    <button class="btn ghost back" data-action="nav" data-href="#/studio">${icon('back')}Studio</button>
    ${c ? `<div class="row" style="justify-content:space-between"><span class="type">${esc(c.soort || '')}</span><button class="btn" data-action="copy-concept">${icon('copy')}Kopieer</button></div>
      <h2>${esc(c.titel || c.file)}</h2>
      <div class="md">${md(c.markdown)}</div>` : '<div class="empty"><div class="spinner" style="margin:0 auto"></div></div>'}
  </div>`;
}

function shortcutUrl() {
  const map = (S.cfg.map || '').replace(/^\/+|\/+$/g, '');
  const path = [map, 'Inbox'].filter(Boolean).map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${S.cfg.owner}/${S.cfg.repo}/contents/${path}/`;
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
      ${S.fout ? `<p class="error-text">${esc(S.fout)}</p>` : ''}
      <button class="btn primary block" data-action="connect" ${S.connecting ? 'disabled' : ''}>${S.connecting ? '<span class="spinner"></span>Verbinden...' : `${icon('check')}${S.ready ? 'Opnieuw verbinden' : 'Verbind'}`}</button>
    </div>`;
}

function welcomeView() {
  return `<div class="center" style="place-items:start center;padding-top:calc(var(--safe-top) + 40px)"><div style="width:100%;max-width:520px">
    <div class="login" style="max-width:none;margin-bottom:10px"><img src="icon.svg" alt=""><h1>Contentmachine</h1><p class="muted">Bewaar links vanaf je iPhone, orden ze zonder AI en werk verder in Obsidian. Gratis.</p></div>
    ${connectForm()}
    <p class="small muted">Nieuw? De README in de repo legt in vijf minuten uit hoe je de GitHub-repo en het token maakt.</p>
  </div></div>`;
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

    ${c.modus === 'lokaal' ? '' : `<div class="panel">
      <h3>iPhone: opslaan via de Deel-knop</h3>
      <p class="small muted">Eenmalig een opdracht maken in de app Opdrachten. Daarna staat "Contentmachine" in je deelmenu in Safari, X, Instagram, LinkedIn en YouTube. Opslaan gaat rechtstreeks naar je GitHub-repo, ook als deze app dicht is.</p>
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

    ${['regels', 'profiel', 'stijl'].map((name) => `<div class="panel">
      <h3>${{ regels: 'Regels voor mappen', profiel: 'Profiel', stijl: 'Stijlgids' }[name]}</h3>
      <p class="small muted">${{ regels: 'Map: woord, woord. Zo komen nieuwe items op de juiste plek tot het model genoeg van je heeft geleerd.', profiel: 'Wie je bent. Gaat mee in elke prompt.', stijl: 'Hoe je schrijft. Gaat mee in elke prompt.' }[name]} Staat ook in Obsidian als _systeem/${name}.md.</p>
      <textarea id="sys-${name}" rows="${name === 'regels' ? 12 : 9}">${esc(v.system[`${name}.md`])}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn primary" data-action="save-system" data-v="${name}">Bewaar</button></div>
    </div>`).join('')}

    <div class="panel">
      <h3>Mappen</h3>
      ${folderList().filter((f) => f.naam !== 'Inbox').map((f) => `<div class="concept-row"><span style="flex:1">${esc(f.naam)} <span class="muted small">${f.aantal}</span></span><button class="btn ghost" data-action="rename-folder" data-v="${esc(f.naam)}">Hernoem</button></div>`).join('') || '<p class="muted small">Mappen ontstaan vanzelf zodra items binnenkomen.</p>'}
    </div>

    <div class="panel">
      <h3>Inhoud ophalen en AI</h3>
      <label class="row small" style="margin:6px 0"><input type="checkbox" id="cfg-previews" style="width:auto" ${c.previews !== false ? 'checked' : ''}> Voorbeeldplaatjes en paginagegevens via microlink.io (gratis, 50 per dag; die dienst ziet de link). Plaatjes van X en YouTube werken ook zonder.</label>
      <label class="row small" style="margin:6px 0"><input type="checkbox" id="cfg-reader" style="width:auto" ${c.reader ? 'checked' : ''}> Volledige tekst van artikelen via r.jina.ai (gratis, zonder account; die dienst ziet de link)</label>
      <label class="row small" style="margin:6px 0"><input type="checkbox" id="cfg-haiku" style="width:auto" ${c.haiku ? 'checked' : ''}> Slimmer ordenen en samenvatten met Claude Haiku (optioneel, eigen API-sleutel, ongeveer 0,1 cent per item)</label>
      ${c.haiku ? `<div class="field"><label for="cfg-key">Anthropic API-sleutel</label><input id="cfg-key" type="password" value="${esc(c.anthropicKey)}" autocomplete="off" placeholder="sk-ant-..."><p class="small muted">Blijft op dit apparaat en gaat alleen naar api.anthropic.com.</p></div>` : ''}
      <button class="btn" data-action="save-options">Bewaar</button>
    </div>

    <details class="panel"><summary><b>Verbinding</b></summary>${connectForm()}</details>

    <div class="panel">
      <h3>Status</h3>
      <dl class="kv">
        <dt>Opslag</dt><dd>${c.modus === 'lokaal' ? 'Alleen dit apparaat' : `GitHub ${esc(c.owner)}/${esc(c.repo)} (${esc(c.branch)})`}</dd>
        <dt>Sync</dt><dd id="sync-state">${syncText()}</dd>
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
  const onFeed = (S.view === 'feed' || S.view === 'item') && !S.map;
  return `<div class="brand"><img src="icon.svg" alt=""><div>Contentmachine<small>NinA AI Agency</small></div></div>
    <button class="btn primary block" data-action="add" style="margin-bottom:10px">${icon('plus')}Bewaar link of idee</button>
    ${nav('#/', 'feed', 'Feed', onFeed, S.items.filter((i) => i.status !== 'archief').length)}
    ${nav('#/studio', 'pen', 'Studio', S.view === 'studio' || S.view === 'concept', S.selected.size || '')}
    ${nav('#/instellingen', 'settings', 'Instellingen', S.view === 'instellingen')}
    <div class="nav-label">Mappen</div>
    ${folderList().map((f) => nav(`#/map/${encodeURIComponent(f.naam)}`, f.naam === 'Inbox' ? 'inbox' : 'folder', esc(f.naam), S.map === f.naam && (S.view === 'map' || S.view === 'item'), f.aantal)).join('')}
    <button class="nav-item muted" data-action="new-folder">${icon('plus')}Nieuwe map</button>
    <div class="small muted" id="sync-side" style="margin-top:auto;padding:12px 10px 0">${syncText()}</div>`;
}

function tabbarHtml() {
  const tab = (href, ic, label, active, badge = 0) => `<button class="tab ${active ? 'active' : ''}" data-action="nav" data-href="${href}"><span class="tab-icon">${icon(ic)}${badge ? `<span class="badge">${badge}</span>` : ''}</span>${label}</button>`;
  return `<nav class="tabbar">
    ${tab('#/', 'feed', 'Feed', S.view === 'feed' || (S.view === 'item' && !S.map))}
    ${tab('#/mappen', 'grid', 'Mappen', S.view === 'mappen' || S.view === 'map')}
    ${tab('#/studio', 'pen', 'Studio', S.view === 'studio' || S.view === 'concept', S.selected.size)}
    ${tab('#/instellingen', 'settings', 'Instellingen', S.view === 'instellingen')}
  </nav>`;
}

function sheetHtml() {
  if (S.sheet !== 'add') return '';
  return `<div class="overlay" data-action="close-sheet">
    <div class="sheet" data-stop>
      <h2>Bewaar iets</h2>
      <div class="field"><textarea id="add-input" rows="4" placeholder="Plak een link, of typ een idee of notitie"></textarea></div>
      <div class="row"><button class="btn" data-action="paste">${icon('copy')}Plak</button><span style="flex:1"></span><button class="btn ghost" data-action="close-sheet">Annuleer</button><button class="btn primary" data-action="save-add">Bewaar</button></div>
    </div>
  </div>`;
}

function shareHtml() {
  const s = S.sharing;
  if (s.state === 'bezig') return '<div class="center"><div class="login"><div class="spinner" style="margin:0 auto 14px"></div><p>Bewaren en ordenen...</p></div></div>';
  if (s.state === 'fout') return `<div class="center"><div class="login"><h1>Niet gelukt</h1><p class="muted">${esc(s.msg)}</p><button class="btn block" data-action="share-done">Naar de app</button></div></div>`;
  return `<div class="center"><div class="login">
    <div class="check">${icon('check')}</div>
    <h1>${s.r.dubbel ? 'Stond er al in' : 'Bewaard'}</h1>
    <p class="muted">${esc(s.r.titel)}</p>
    <p class="small muted">In de map ${esc(s.r.map)}</p>
    <div class="row" style="margin-top:16px"><button class="btn block" data-action="close-window">Sluiten</button><button class="btn primary block" data-action="share-done">Open app</button></div>
  </div></div>`;
}

function selectionBar() {
  if (!S.selected.size || S.view === 'studio' || S.view === 'concept') return '';
  return `<div class="overlay" style="background:none;pointer-events:none;align-items:flex-end;bottom:calc(var(--safe-bottom) + 70px)">
    <div class="sheet" style="pointer-events:auto;border-radius:16px;margin:0 12px;padding:10px 12px;animation:none">
      <div class="row"><span style="flex:1">${S.selected.size} geselecteerd</span><button class="btn ghost" data-action="clear-picks">Wis</button><button class="btn primary" data-action="nav" data-href="#/studio">${icon('sparkle')}Maak prompt</button></div>
    </div></div>`;
}

// ---------- rendering ----------
function render() {
  const app = $('#app');
  if (S.sharing) {
    app.innerHTML = shareHtml();
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
  else if (S.view === 'instellingen') main = settingsView();
  else if (S.view === 'mappen') main = desktop ? feedView() : foldersView();
  else if (S.view === 'item' && !desktop) main = detailHtml();
  else main = feedView();

  const mainScroll = $('.main')?.scrollTop || 0;
  const paneScroll = $('.detail-pane')?.scrollTop || 0;
  const focusId = document.activeElement?.id;
  app.innerHTML = `<div class="shell ${showPane ? 'has-detail' : ''}">
      <aside class="sidebar">${sidebarHtml()}</aside>
      <main class="main" id="main">${main}</main>
      ${showPane ? `<section class="detail-pane" id="pane">${detailHtml()}</section>` : ''}
    </div>
    ${['feed', 'map', 'mappen'].includes(S.view) || (S.view === 'item' && desktop) ? `<button class="fab ${S.selected.size ? 'raised' : ''}" data-action="add" aria-label="Bewaar iets">${icon('plus')}</button>` : ''}
    ${selectionBar()}
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
}

function renderList() {
  if (!S.ready) return;
  const list = $('#list');
  if (list) list.innerHTML = listHtml();
  const chips = $('#chips');
  if (chips) chips.innerHTML = chipsHtml();
  const side = $('.sidebar');
  if (side) side.innerHTML = sidebarHtml();
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
      correction = { from: meta.map, to: patch.map };
    }
    if (Array.isArray(body.tags)) patch.tags = body.tags.map((t) => t.toLowerCase().trim().replace(/\s+/g, '-')).filter(Boolean);
    const updated = await v.update(id, patch, { notities: body.notities });
    for (const [kind, f] of signals) v.learner.signal(updated, kind, f);
    if (correction) v.learner.correction(meta, correction.from, updated.map);
    refreshItems();
    if (S.detail?.id === id) S.detail = { ...S.detail, ...decorate(updated), notities: body.notities ?? S.detail.notities };
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
  S.vault.flush().catch((e) => toast(e.message));
  return meta;
}

function pickWeek() {
  const week = Date.now() - 7 * 864e5;
  const best = S.items
    .filter((i) => i.status !== 'archief' && i.status !== 'gebruikt' && new Date(i.opgeslagen).getTime() > week)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 4);
  if (!best.length) return toast('Geen nieuwe items van deze week');
  best.forEach((i) => S.selected.add(i.id));
  if (S.soort === 'linkedin') S.soort = 'nieuwsbrief';
  render();
}

async function buildCurrentPrompt() {
  const items = await Promise.all([...S.selected].filter((id) => S.vault.has(id)).map((id) => S.vault.get(id)));
  S.prompt = buildPrompt({
    soort: S.soort,
    items,
    instructie: S.instructie,
    profiel: S.vault.system['profiel.md'],
    stijl: S.vault.system['stijl.md'],
  });
  S.resultaat = '';
}

function readConnectForm() {
  const val = (id) => document.getElementById(id)?.value ?? '';
  if (S.cfg.modus !== 'lokaal') {
    Object.assign(S.cfg, {
      modus: 'github',
      owner: val('cfg-owner').trim(),
      repo: val('cfg-repo').trim().replace(/\.git$/, ''),
      branch: val('cfg-branch').trim() || 'main',
      map: val('cfg-map').trim().replace(/^\/+|\/+$/g, ''),
      token: val('cfg-token').trim(),
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
    S.items.filter((i) => i.ster && i.status !== 'archief').slice(0, 8).forEach((i) => S.selected.add(i.id));
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
  star: () => patchItem(S.detail.id, { ster: !S.detail.ster }),
  vote: (el) => {
    const val = Number(el.dataset.v);
    patchItem(S.detail.id, { oordeel: S.detail.oordeel === val ? 0 : val });
  },
  archive: () => {
    const to = S.detail.status === 'archief' ? 'gelezen' : 'archief';
    patchItem(S.detail.id, { status: to }).then((m) => m && toast(to === 'archief' ? 'Gearchiveerd' : 'Teruggezet'));
  },
  delete: async () => {
    if (!confirm('Dit item verwijderen? Het bestand verdwijnt ook uit Obsidian.')) return;
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
  'build-prompt': async () => {
    S.instructie = $('#instructie')?.value ?? S.instructie;
    if (S.soort === 'vrij' && !S.instructie.trim()) return toast('Schrijf eerst wat je wilt maken bij Extra instructie');
    try {
      await buildCurrentPrompt();
      render();
      $('#prompt-text')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      toast(e.message);
    }
  },
  'copy-prompt': () => copy(S.prompt, 'Prompt gekopieerd, plak hem in je chat'),
  'open-chat': async (el) => {
    const links = chatLinks(S.prompt);
    // Open first: iOS blocks pop-ups that come after an await.
    const win = window.open(links[el.dataset.v], '_blank');
    await copy(S.prompt, 'Prompt gekopieerd, plak hem in de chat');
    if (!win) location.href = links[el.dataset.v];
  },
  'save-result': async () => {
    const text = ($('#resultaat')?.value || '').trim();
    if (!text) return toast('Plak eerst het resultaat');
    const items = [...S.selected].filter((id) => S.vault.has(id)).map((id) => S.vault.meta(id));
    const spec = PROMPT_SOORTEN[S.soort];
    const titel = (text.match(/^# (.+)$/m)?.[1] || spec.label).trim().slice(0, 100);
    const links = items.map((m) => `- [[${m.path.split('/')[1].replace(/\.md$/, '')}]]`).join('\n');
    const file = S.vault.writeConcept(
      { titel, soort: spec.label, datum: new Date().toISOString(), bronnen: items.map((m) => m.id), instructie: S.instructie.trim() || undefined },
      `${text}\n\n## Bronnen in de vault\n\n${links}\n`,
    );
    for (const m of items) {
      const updated = await S.vault.update(m.id, { status: 'gebruikt' });
      S.vault.learner.signal(updated, 'gebruikt');
    }
    S.resultaat = '';
    S.prompt = '';
    S.selected.clear();
    refreshItems();
    toast('Bewaard in Concepten');
    go(`#/concept/${encodeURIComponent(file)}`);
  },
  'copy-concept': () => copy(S.concept.markdown),
  embed: () => {
    S.embed = S.detail.id;
    renderDetail();
  },
  copy: (el) => copy(el.dataset.v),
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
      await S.vault.renameFolder(van, naar);
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
  'save-options': () => {
    S.cfg.reader = $('#cfg-reader').checked;
    S.cfg.previews = $('#cfg-previews').checked;
    S.cfg.haiku = $('#cfg-haiku').checked;
    if ($('#cfg-key')) S.cfg.anthropicKey = $('#cfg-key').value.trim();
    local.set('cm_config', S.cfg);
    toast('Bewaard');
    render();
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
  disconnect: () => {
    if (!confirm('Dit apparaat ontkoppelen? Je vault blijft gewoon staan; alleen de instellingen hier worden gewist.')) return;
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
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'q') {
    S.q = t.value;
    renderList();
  } else if (t.id === 'instructie') {
    S.instructie = t.value;
  } else if (t.id === 'resultaat') {
    S.resultaat = t.value;
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
  } else if (t.id === 'tags-input') {
    patchItem(S.detail.id, { tags: t.value.split(',').map((x) => x.trim()).filter(Boolean) });
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
  else if (Date.now() - S.lastLoad > 60000 && !S.verwerken) loadVault().then(render).catch(() => {});
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
  route();
  const sharing = S.view === 'deel' || new URLSearchParams(location.search).has('url') || new URLSearchParams(location.search).has('text');
  if (sharing) return handleShare();
  if (S.cfg.modus) await connect();
  onRoute();
}

boot();
