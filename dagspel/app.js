// NinA Dagspel: your tasks as a game. In the morning you swipe your day
// together from Claude's proposals, during the day you tick things off, in the
// evening you swipe away what is left. Everything lives in staat.json in your
// own private repo; Claude writes the proposals next to it every morning.
import {
  BRONNEN, KEUZES, PUNTEN, dagVan, plusDagen, ochtendStapel, avondStapel, vandaagLijst, laterLijst, kies, eigenTaak,
  pasAan, markeerDag, totaalPunten, puntenVanDag, reeks, niveau, minutenVan, subToevoegen, subVink, subWeg, gedaanPerDag,
} from './lib/core.js';
import { GitHubStore, LocalStore, parseRepoInput, cleanToken } from './lib/store.js';
import { Sync } from './lib/sync.js';
import { demoVoorstel } from './lib/demo.js';
import { esc, toast, rollHtml, animateRolls, burst, confetti, floatPoints, pop, ringHtml, flyOut, setupDeck } from './ui.js';

const CONFIG_KEY = 'ds_config';
const STANDAARD = { naam: 'Olaf', owner: 'aiolaf', repo: 'contentmachine-vault', branch: 'main', map: 'Taken', token: '', demo: false };
const MINUTEN = [5, 10, 15, 30, 45, 60, 90, 120];
const PRIO = { 1: 'Hoog', 2: 'Normaal', 3: 'Laag' };

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICON = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="2.6"'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', ' stroke-width="2.4"'),
  later: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  flame: svg('<path d="M12 3c.6 3.2 4.5 5.3 4.5 9.7a4.5 4.5 0 0 1-9 0c0-2.2 1.1-3.6 2.3-4.6.1 1.7.9 2.8 2 3.2-.4-2.9-.6-5.4.2-8.3z"/>'),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z"/>'),
  sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.4"'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>'),
  agenda: svg('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  meeting: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  pipedrive: svg('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A2.5 2.5 0 0 1 11 3h2a2.5 2.5 0 0 1 2.5 2.5V7M3 12.5h18"/>'),
  monday: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  eigen: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
  overig: svg('<circle cx="12" cy="12" r="3.5"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  link: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>', ' stroke-width="2.4"'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.35-5.65L20 8.7"/><path d="M20 3.5v5.2h-5.2"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5.5a3 3 0 0 0 3 4.5M16 6h2.5a3 3 0 0 1-3 4.5M12 13v4M8.5 20.5h7M10 17h4"/>'),
  top: svg('<path d="M12 19V6M6 11l6-6 6 6M5 3h14"/>'),
  archief: svg('<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>'),
  sub: svg('<path d="M6 4v9a3 3 0 0 0 3 3h9M14 12l4 4-4 4"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
};

const LINKLABEL = { mail: 'Open in Gmail', pipedrive: 'Open in Pipedrive', meeting: 'Open meeting', agenda: 'Open in agenda', monday: 'Open in monday' };

// ---------- state ----------
const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet');
const S = {
  config: leesConfig(),
  sync: null,
  view: 'home',
  spel: null, // { soort, kaarten, i, geschiedenis, stats, niveauVoor }
  sheet: null, // { type: 'bewerk', id } | { type: 'nieuw' }
  geladen: 0,
};

function leesConfig() {
  try {
    return { ...STANDAARD, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
  } catch {
    return { ...STANDAARD };
  }
}

function bewaarConfig() {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(S.config));
  } catch {
    toast('Instellingen konden niet worden bewaard op dit toestel', { soort: 'fout' });
  }
}

const vandaag = () => dagVan();
const staat = () => S.sync.staat;
const voorstel = () => S.sync.voorstel;
const voorstelVanVandaag = () => (voorstel()?.datum === vandaag() ? voorstel() : null);

// ---------- formatting ----------
const fmtMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}u${m % 60 ? String(m % 60).padStart(2, '0') : ''}`);
const hoofdletter = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const datumTekst = () => hoofdletter(new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));
const groet = () => {
  const u = new Date().getHours();
  return u < 6 ? 'Goedenacht' : u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond';
};
const tijd = (iso) => (iso ? new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '');
const meervoud = (n, een, veel) => `${n} ${n === 1 ? een : veel}`;

function deadlineBadge(t) {
  if (!t.deadline) return '';
  const v = vandaag();
  if (t.deadline < v) return '<span class="badge bad">Te laat</span>';
  if (t.deadline === v) return '<span class="badge bad">Deadline vandaag</span>';
  if (t.deadline === plusDagen(v, 1)) return '<span class="badge warn">Deadline morgen</span>';
  return '';
}

function doorBadge(k) {
  if (k.soort === 'terug') return '<span class="badge">Terug van later</span>';
  if (!k.door) return '';
  return k.door === 1 ? '<span class="badge">Van gisteren</span>' : `<span class="badge warn">Schuift al ${k.door} dagen door</span>`;
}

const bronHtml = (t) => `<span class="src src-${t.bron}">${ICON[t.bron] || ICON.overig}${esc(BRONNEN[t.bron] || 'Overig')}</span>`;
const prioHtml = (t) => (t.prio === 1 ? '<span class="prio hoog">Hoog</span>' : t.prio === 3 ? '<span class="prio laag">Laag</span>' : '');

// ---------- shared pieces ----------
function statsHtml() {
  const s = staat();
  const p = totaalPunten(s);
  const n = niveau(p);
  const r = reeks(s, vandaag());
  return `<section class="stats" aria-label="Score">
    <div class="stat streak${r ? ' aan' : ''}">${ICON.flame}<div><b>${r}</b><small>reeks</small></div></div>
    <div class="stat">${ICON.star}<div><b>${rollHtml(p, 'punten')}</b><small>punten</small></div></div>
    <div class="stat level"><div class="lvl-top"><b>Lvl ${n.nummer}</b><small>${esc(n.naam)}</small></div><div class="lvl-bar"><span style="width:${(n.binnen / n.nodig) * 100}%"></span></div></div>
  </section>`;
}

function budgetHtml(lijst) {
  const gekozen = minutenVan(lijst.filter((t) => t.status === 'vandaag' || t.gedaanOp === vandaag()));
  const vrij = voorstelVanVandaag()?.vrijeMinuten;
  if (!vrij) return lijst.length ? `<div class="budget"><div class="budget-text"><span>${fmtMin(gekozen)} gekozen</span></div></div>` : '';
  const f = gekozen / vrij;
  const tekst = f > 1 ? `${fmtMin(gekozen - vrij)} te vol` : `${fmtMin(vrij - gekozen)} ruimte over`;
  return `<div class="budget${f > 1 ? ' over' : ''}">
    <div class="budget-text"><span>${fmtMin(gekozen)} van ${fmtMin(vrij)} vrije tijd</span><b>${tekst}</b></div>
    <div class="budget-bar"><span style="width:${Math.min(100, f * 100)}%"></span></div>
  </div>`;
}

function subTeller(t) {
  if (!t.sub?.length) return '';
  return `<span class="sub-count">${ICON.sub}${t.sub.filter((x) => x.klaar).length}/${t.sub.length}</span>`;
}

function subVinkHtml(t, x) {
  return `<button type="button" class="sub-check" data-action="sub-vink" data-id="${esc(t.id)}" data-sub="${esc(x.id)}" aria-pressed="${Boolean(x.klaar)}" aria-label="${x.klaar ? 'Niet af' : 'Af'}: ${esc(x.titel)}">${ICON.check}</button>`;
}

// Subtasks of an open task, right under it in the list, to tick off on the spot.
function subsInRijHtml(t) {
  if (!t.sub?.length || t.status === 'gedaan') return '';
  return `<ul class="subs">${t.sub.map((x) => `<li class="sub${x.klaar ? ' klaar' : ''}">${subVinkHtml(t, x)}<span>${esc(x.titel)}</span></li>`).join('')}</ul>`;
}

function rijHtml(t, { vink = true } = {}) {
  const klaar = t.status === 'gedaan';
  return `<li class="row${klaar ? ' done' : ''}" data-id="${esc(t.id)}">
    ${vink ? `<button type="button" class="check" data-action="vink" data-id="${esc(t.id)}" aria-pressed="${klaar}" aria-label="${klaar ? 'Niet gedaan' : 'Gedaan'}: ${esc(t.titel)}">${ICON.check}</button>` : `<span class="row-src src-${t.bron}">${ICON[t.bron] || ICON.overig}</span>`}
    <button type="button" class="row-main" data-action="bewerk" data-id="${esc(t.id)}">
      <span class="row-title"><span>${esc(t.titel)}</span></span>
      <span class="row-meta"><i class="dot src-${t.bron}"></i>${esc(BRONNEN[t.bron])}<span>${fmtMin(t.minuten)}</span>${subTeller(t)}${prioHtml(t)}${deadlineBadge(t)}</span>
    </button>
    ${vink ? subsInRijHtml(t) : ''}
  </li>`;
}

function syncHtml() {
  const st = S.sync?.status || {};
  let tekst = st.bezig ? 'Bezig met bijwerken...' : st.laatste ? `Bijgewerkt om ${tijd(st.laatste)}` : 'Nog niet bijgewerkt';
  if (S.config.demo) tekst = 'Demo: alles staat alleen op dit toestel';
  if (st.fout) tekst = st.fout;
  return `<div id="sync-status" class="sync${st.fout ? ' fout' : ''}${st.bezig ? ' bezig' : ''}">
    <span>${esc(tekst)}${S.sync?.dirty && !st.bezig && !S.config.demo ? ' (nog niet opgeslagen)' : ''}</span>
    <button type="button" class="link-btn" data-action="vernieuw">${ICON.refresh}Vernieuw</button>
  </div>`;
}

function renderStatus() {
  const el = document.getElementById('sync-status');
  if (el) el.outerHTML = syncHtml();
}

// ---------- views ----------
function render() {
  renderView();
  renderSheet();
}

function renderView() {
  const views = { welkom: viewWelkom, home: viewHome, spel: viewSpel, plan: viewPlan, klaar: viewKlaar, later: viewLater, archief: viewArchief, instellingen: viewInstellingen };
  app.innerHTML = (views[S.view] || viewHome)();
  app.dataset.view = S.view;
  animateRolls(app);
}

// After a subtask change: the screen behind and the open sheet, without
// losing what is typed in the sheet.
function ververs() {
  renderView();
  const t = S.sheet?.type === 'bewerk' && staat().taken[S.sheet.id];
  const lijst = document.getElementById('sheet-subs');
  if (t && lijst) lijst.innerHTML = sheetSubsHtml(t);
}

function viewWelkom() {
  return `<main class="welkom">
    <div class="logo-stack" aria-hidden="true"><i></i><i></i><i></i></div>
    <h1>Dagspel</h1>
    <p class="lead">Je taken als een spel. In de ochtend swipe je je dag bij elkaar, in de avond streep je weg. Claude zet elke ochtend kaarten klaar uit je meetings, agenda, mail en Pipedrive.</p>
    <button type="button" class="btn primary" data-action="naar-instellingen">Koppel je vault</button>
    <button type="button" class="btn ghost" data-action="demo">Probeer de demo</button>
  </main>`;
}

function heroHtml() {
  const s = staat();
  const v = vandaag();
  const dag = s.dagen[v] || {};
  const deck = ochtendStapel(s, voorstel(), v);
  const lijst = vandaagLijst(s, v);
  const open = lijst.filter((t) => t.status === 'vandaag');
  const uur = new Date().getHours();
  const samenvatting = voorstelVanVandaag()?.samenvatting;

  if (deck.length) {
    const eerste = !dag.ochtend;
    return `<section class="hero ochtend">
      <div class="hero-icon">${ICON.sun}</div>
      <h2>${eerste ? 'Ochtendcheck' : meervoud(deck.length, 'nieuwe kaart', 'nieuwe kaarten')}</h2>
      <p>${eerste ? `${meervoud(deck.length, 'kaart', 'kaarten')}, ongeveer ${Math.max(1, Math.ceil((deck.length * 5) / 60))} min. Rechts is wel, links is niet, omhoog is later.` : 'Claude vond nog iets voor vandaag.'}</p>
      ${samenvatting && eerste ? `<p class="hero-quote">${esc(samenvatting)}</p>` : ''}
      <button type="button" class="btn light" data-action="start-ochtend"><span class="mini-deck" aria-hidden="true"><i></i><i></i><i></i></span>${eerste ? 'Start' : 'Bekijk'}</button>
    </section>`;
  }
  if (dag.avond) {
    return `<section class="hero klaar">
      <div class="hero-icon">${ICON.trophy}</div>
      <h2>Dag afgerond</h2>
      <p>${puntenVanDag(s, v)} punten vandaag. Morgenochtend liggen er nieuwe kaarten klaar.</p>
    </section>`;
  }
  if (lijst.length && (uur >= 16 || !open.length)) {
    return `<section class="hero avond">
      <div class="hero-icon">${ICON.moon}</div>
      <h2>Avondcheck</h2>
      <p>${open.length ? `${meervoud(open.length, 'taak', 'taken')} nog open. Rechts is gedaan, links is morgen, omhoog laat je los.` : 'Alles afgevinkt. Rond je dag af voor je bonus.'}</p>
      <button type="button" class="btn light" data-action="start-avond">${open.length ? 'Start' : 'Rond af'}</button>
    </section>`;
  }
  if (lijst.length) {
    const gedaan = lijst.length - open.length;
    return `<section class="hero focus">
      <div class="hero-ring">${ringHtml(gedaan, lijst.length)}<span>${gedaan}/${lijst.length}</span></div>
      <h2>Nog ${open.length} te gaan</h2>
      <p>Volgende: ${esc(open[0].titel)}</p>
      <button type="button" class="btn ghost-light" data-action="start-avond">Avondcheck</button>
    </section>`;
  }
  return `<section class="hero leeg">
    <div class="hero-icon">${ICON.sun}</div>
    <h2>Nog geen kaarten</h2>
    <p>${S.config.demo ? 'De demo is klaar voor vandaag.' : 'Claude zet je kaarten elke ochtend om 09:05 klaar; een paar minuten later staan ze hier. Tik op Vernieuw of voeg zelf een taak toe.'}</p>
    <button type="button" class="btn light" data-action="nieuw">${ICON.plus}Taak toevoegen</button>
  </section>`;
}

function agendaHtml() {
  const a = voorstelVanVandaag()?.agenda;
  if (!a?.length) return '';
  return `<details class="panel agenda"><summary><h2>Agenda vandaag</h2><span class="muted small">${meervoud(a.length, 'afspraak', 'afspraken')}</span></summary>
    <ul>${a.map((x) => `<li><span class="tijd">${esc(x.van)}${x.tot ? `<small>${esc(x.tot)}</small>` : ''}</span>${esc(x.titel)}</li>`).join('')}</ul>
  </details>`;
}

function viewHome() {
  const s = staat();
  // what is still open on top, what is done sinks
  const lijst = vandaagLijst(s, vandaag()).sort((a, b) => (a.status === 'gedaan') - (b.status === 'gedaan'));
  const later = laterLijst(s);
  const gedaan = lijst.filter((t) => t.status === 'gedaan').length;
  const afgevinkt = gedaanPerDag(s).reduce((n, d) => n + d.taken.length, 0);
  return `<main class="home">
    <header class="top">
      <div><p class="datum">${datumTekst()}</p><h1>${groet()}, ${esc(S.config.naam || 'Olaf')}</h1></div>
      <button type="button" class="icon-btn" data-action="naar-instellingen" aria-label="Instellingen">${ICON.sliders}</button>
    </header>
    ${statsHtml()}
    ${heroHtml()}
    <section class="panel">
      <div class="panel-head"><h2>Vandaag</h2>${lijst.length ? `<span class="muted small">${gedaan} van ${lijst.length} gedaan</span>` : ''}</div>
      ${budgetHtml(lijst)}
      ${lijst.length ? `<ul class="list">${lijst.map((t) => rijHtml(t)).join('')}</ul>` : '<p class="muted small leeg-tekst">Nog niets gekozen voor vandaag.</p>'}
      <button type="button" class="add" data-action="nieuw">${ICON.plus}Taak toevoegen</button>
    </section>
    ${agendaHtml()}
    <div class="links">
      <button type="button" class="later-link" data-action="naar-later">${ICON.later}<span>Later</span><b>${later.length}</b></button>
      <button type="button" class="later-link" data-action="naar-archief">${ICON.archief}<span>Archief</span><b>${afgevinkt}</b></button>
    </div>
    ${syncHtml()}
  </main>`;
}

function kaartHtml(k, i, soort) {
  const stamps = soort === 'ochtend' ? ['Wel', 'Niet', 'Later'] : ['Gedaan', 'Morgen', 'Los'];
  const top = i === 0;
  return `<article class="deck-card src-${k.bron}${top ? ' top' : ''}" data-i="${i}" data-id="${esc(k.id)}"${top ? '' : ' aria-hidden="true"'}>
    <span class="stamp yes">${stamps[0]}</span><span class="stamp no">${stamps[1]}</span><span class="stamp up">${stamps[2]}</span>
    <div class="card-head">${bronHtml(k)}${doorBadge(k)}</div>
    <h3>${esc(k.titel)}</h3>
    ${k.wie ? `<p class="wie">${esc(k.wie)}</p>` : ''}
    ${k.context ? `<p class="ctx">${esc(k.context)}</p>` : ''}
    ${k.sub?.length ? `<ul class="card-subs">${k.sub.slice(0, 4).map((x) => `<li class="${x.klaar ? 'klaar' : ''}">${esc(x.titel)}</li>`).join('')}${k.sub.length > 4 ? `<li class="meer">en nog ${k.sub.length - 4}</li>` : ''}</ul>` : ''}
    <div class="card-foot">
      <div class="card-meta"><span class="meta-min">${ICON.later}${fmtMin(k.minuten)}</span>${subTeller(k)}${prioHtml(k)}${deadlineBadge(k)}</div>
      ${k.link ? `<a class="card-link" href="${esc(k.link)}" target="_blank" rel="noopener">${ICON.link}${LINKLABEL[k.bron] || 'Open bron'}</a>` : ''}
    </div>
  </article>`;
}

function deckHtml() {
  const sp = S.spel;
  const rest = sp.kaarten.slice(sp.i, sp.i + 3);
  return rest.map((k, i) => kaartHtml(k, i, sp.soort)).reverse().join('');
}

function spelBudgetHtml() {
  if (S.spel.soort !== 'ochtend') {
    return `<p class="spel-score">${ICON.star}<b>+${rollHtml(S.spel.stats.punten, 'spelpunten')}</b> vanavond</p>`;
  }
  return budgetHtml(vandaagLijst(staat(), vandaag()));
}

function viewSpel() {
  const sp = S.spel;
  const ochtend = sp.soort === 'ochtend';
  const labels = ochtend ? ['Niet', 'Later', 'Wel'] : ['Morgen', 'Los', 'Gedaan'];
  return `<main class="spel ${sp.soort}">
    <header class="spel-top">
      <button type="button" class="icon-btn" data-action="stop-spel" aria-label="Stoppen">${ICON.x}</button>
      <div class="spel-titel"><b>${ochtend ? 'Ochtendcheck' : 'Avondcheck'}</b><span id="spel-teller">${Math.min(sp.i + 1, sp.kaarten.length)} van ${sp.kaarten.length}</span></div>
      <button type="button" class="icon-btn" data-action="undo-swipe" aria-label="Vorige kaart terug"${sp.geschiedenis.length ? '' : ' disabled'}>${ICON.undo}</button>
    </header>
    <div class="deck-progress"><span id="spel-voortgang" style="width:${(sp.i / sp.kaarten.length) * 100}%"></span></div>
    <div id="spel-budget">${spelBudgetHtml()}</div>
    <div class="deck" id="deck">${deckHtml()}</div>
    <div class="deck-buttons">
      <button type="button" class="deck-btn no" data-action="swipe" data-dir="left">${ochtend ? ICON.x : ICON.later}<span>${labels[0]}</span></button>
      <button type="button" class="deck-btn up" data-action="swipe" data-dir="up">${ochtend ? ICON.later : ICON.trash}<span>${labels[1]}</span></button>
      <button type="button" class="deck-btn yes" data-action="swipe" data-dir="right">${ICON.check}<span>${labels[2]}</span></button>
    </div>
  </main>`;
}

// Only the moving parts, so the card under your finger does not flicker.
function renderDeck() {
  const sp = S.spel;
  const deck = document.getElementById('deck');
  if (!deck) return render();
  deck.classList.remove('advance');
  deck.innerHTML = deckHtml();
  document.getElementById('spel-teller').textContent = `${Math.min(sp.i + 1, sp.kaarten.length)} van ${sp.kaarten.length}`;
  document.getElementById('spel-voortgang').style.width = `${(sp.i / sp.kaarten.length) * 100}%`;
  document.getElementById('spel-budget').innerHTML = spelBudgetHtml();
  const undo = app.querySelector('[data-action="undo-swipe"]');
  if (undo) undo.disabled = !sp.geschiedenis.length;
  animateRolls(app);
}

function viewPlan() {
  const lijst = vandaagLijst(staat(), vandaag());
  return `<main class="plan">
    <header class="spel-top">
      <button type="button" class="icon-btn" data-action="home" aria-label="Terug">${ICON.back}</button>
      <div class="spel-titel"><b>Jouw dag</b><span>${meervoud(lijst.length, 'taak', 'taken')}</span></div>
      <span class="icon-btn spacer"></span>
    </header>
    <p class="muted plan-uitleg">Tik op een taak om de tijd, prioriteit of tekst aan te passen. Zet je belangrijkste taak bovenaan.</p>
    ${budgetHtml(lijst)}
    <section class="panel">
      ${lijst.length ? `<ul class="list">${lijst.map((t) => rijHtml(t, { vink: false })).join('')}</ul>` : '<p class="muted small leeg-tekst">Je koos niets. Ook een keuze. Voeg zelf iets toe of ga terug.</p>'}
      <button type="button" class="add" data-action="nieuw">${ICON.plus}Taak toevoegen</button>
    </section>
    <button type="button" class="btn primary groot" data-action="home">Aan de slag</button>
  </main>`;
}

function viewKlaar() {
  const s = staat();
  const v = vandaag();
  const lijst = vandaagLijst(s, v);
  const gedaan = lijst.filter((t) => t.status === 'gedaan').length;
  const totaal = gedaan + (S.spel?.stats.morgen || 0) + (S.spel?.stats.los || 0);
  const f = totaal ? gedaan / totaal : 0;
  const kop = totaal && f === 1 ? 'Alles gedaan' : f >= 0.7 ? 'Sterke dag' : f >= 0.4 ? 'Goed bezig' : 'Morgen een nieuwe kans';
  const bonus = s.dagen[v]?.bonus;
  const r = reeks(s, v);
  const n = niveau(totaalPunten(s));
  const door = S.spel?.stats.morgen || 0;
  return `<main class="klaar-view">
    <div class="trofee">${ICON.trophy}</div>
    <div class="klaar-score"><b>${gedaan}</b><span>/${totaal || gedaan}</span></div>
    <h1>${kop}</h1>
    <div class="klaar-stats">
      <div><b>+${rollHtml(puntenVanDag(s, v), 'dagpunten')}</b><small>punten vandaag</small></div>
      <div><b>${r}</b><small>${r === 1 ? 'dag reeks' : 'dagen reeks'}</small></div>
      <div><b>Lvl ${n.nummer}</b><small>${esc(n.naam)}</small></div>
    </div>
    ${bonus ? `<p class="bonus">${ICON.star}Bonus voor alles gedaan: +${bonus}</p>` : ''}
    ${door ? `<p class="muted">${meervoud(door, 'taak schuift', 'taken schuiven')} door naar morgen.</p>` : ''}
    <button type="button" class="btn primary groot" data-action="home">Tot morgen</button>
  </main>`;
}

function viewLater() {
  const lijst = laterLijst(staat());
  return `<main class="later-view">
    <header class="spel-top">
      <button type="button" class="icon-btn" data-action="home" aria-label="Terug">${ICON.back}</button>
      <div class="spel-titel"><b>Later</b><span>${meervoud(lijst.length, 'taak', 'taken')}</span></div>
      <span class="icon-btn spacer"></span>
    </header>
    <p class="muted plan-uitleg">Claude brengt een taak van deze lijst terug als hij weer speelt, bijvoorbeeld door een deadline. Of pak hem zelf.</p>
    <section class="panel">
      ${lijst.length ? `<ul class="list">${lijst.map((t) => `<li class="row later-row" data-id="${esc(t.id)}">
        <span class="row-src src-${t.bron}">${ICON[t.bron] || ICON.overig}</span>
        <div class="row-main static"><span class="row-title">${esc(t.titel)}</span><span class="row-meta">${esc(BRONNEN[t.bron])}<span>${fmtMin(t.minuten)}</span>${prioHtml(t)}${deadlineBadge(t)}</span></div>
        <div class="row-acts">
          <button type="button" class="mini-btn" data-action="later-vandaag" data-id="${esc(t.id)}">Vandaag</button>
          <button type="button" class="mini-btn ghost" data-action="later-weg" data-id="${esc(t.id)}" aria-label="Weg: ${esc(t.titel)}">${ICON.x}</button>
        </div>
      </li>`).join('')}</ul>` : '<p class="muted small leeg-tekst">De later-lijst is leeg.</p>'}
    </section>
  </main>`;
}

function dagLabel(dag) {
  const v = vandaag();
  if (dag === v) return 'Vandaag';
  if (dag === plusDagen(v, -1)) return 'Gisteren';
  const [y, m, d] = dag.split('-').map(Number);
  const opties = { weekday: 'long', day: 'numeric', month: 'long', ...(String(y) !== v.slice(0, 4) ? { year: 'numeric' } : {}) };
  return hoofdletter(new Intl.DateTimeFormat('nl-NL', opties).format(new Date(y, m - 1, d, 12)));
}

function viewArchief() {
  const dagen = gedaanPerDag(staat()).slice(0, 90);
  const totaal = dagen.reduce((n, d) => n + d.taken.length, 0);
  return `<main class="archief-view">
    <header class="spel-top">
      <button type="button" class="icon-btn" data-action="home" aria-label="Terug">${ICON.back}</button>
      <div class="spel-titel"><b>Archief</b><span>${meervoud(totaal, 'taak', 'taken')} afgevinkt</span></div>
      <span class="icon-btn spacer"></span>
    </header>
    <p class="muted plan-uitleg">Afgevinkte taken blijven tot het eind van de dag op je lijst. Daarna staan ze hier, per dag.</p>
    ${dagen.length ? dagen.map((d) => `<section class="panel dag-groep">
      <div class="panel-head"><h2>${dagLabel(d.dag)}</h2><span class="muted small">${meervoud(d.taken.length, 'taak', 'taken')}<b class="pts">+${d.punten}</b></span></div>
      <ul class="list">${d.taken.map((t) => `<li class="row done">
        <span class="check" aria-hidden="true">${ICON.check}</span>
        <div class="row-main static"><span class="row-title"><span>${esc(t.titel)}</span></span>
          <span class="row-meta"><i class="dot src-${t.bron}"></i>${esc(BRONNEN[t.bron])}${t.sub ? `<span>${meervoud(t.sub, 'subtaak', 'subtaken')}</span>` : ''}<b class="pts">+${t.punten}</b></span></div>
      </li>`).join('')}</ul>
    </section>`).join('') : '<section class="panel"><p class="muted small leeg-tekst">Nog niets afgevinkt. Je eerste taak komt hier te staan.</p></section>'}
  </main>`;
}

function viewInstellingen() {
  const c = S.config;
  const verbonden = S.sync && !c.demo;
  return `<main class="instellingen">
    <header class="spel-top">
      <button type="button" class="icon-btn" data-action="${S.sync ? 'home' : 'welkom'}" aria-label="Terug">${ICON.back}</button>
      <div class="spel-titel"><b>Instellingen</b><span>${c.demo ? 'Demo' : verbonden ? 'Verbonden' : 'Niet verbonden'}</span></div>
      <span class="icon-btn spacer"></span>
    </header>
    <form class="panel form" data-form="verbind" autocomplete="off">
      <h2>Je vault op GitHub</h2>
      <p class="muted small">Dezelfde privé repo en hetzelfde token als de Contentmachine. Je taken komen in de map <code>${esc(c.map || 'Taken')}</code>.</p>
      <label>Je naam<input name="naam" value="${esc(c.naam)}" autocomplete="given-name"></label>
      <div class="twee">
        <label>GitHub-gebruiker<input name="owner" value="${esc(c.owner)}" autocapitalize="none" spellcheck="false"></label>
        <label>Repo<input name="repo" value="${esc(c.repo)}" autocapitalize="none" spellcheck="false"></label>
      </div>
      <div class="twee">
        <label>Branch<input name="branch" value="${esc(c.branch)}" autocapitalize="none" spellcheck="false"></label>
        <label>Map<input name="map" value="${esc(c.map)}" autocapitalize="none" spellcheck="false"></label>
      </div>
      <label>Token<input name="token" type="password" value="${esc(c.token)}" placeholder="github_pat_..." autocapitalize="none" spellcheck="false"></label>
      <p class="muted small">Fine-grained token met alleen deze repo en Contents: Read and write. Het token blijft op dit toestel.</p>
      <button type="submit" class="btn primary">Verbind</button>
      ${c.demo ? '' : '<button type="button" class="btn ghost" data-action="demo">Gebruik de demo</button>'}
    </form>
    <section class="panel uitleg">
      <h2>Hoe de kaarten ontstaan</h2>
      <p>Elke ochtend om 09:05 leest een Claude-routine je meetings (Wispr Flow), agenda, mail en Pipedrive. Hij zet voorstellen in <code>${esc(c.map || 'Taken')}/voorstellen/</code> en kijkt in <code>staat.json</code> wat je eerder koos, zodat hij leert wat je wegswipet.</p>
      <p>Eigen regels voor Claude, zoals "geen nieuwsbrieven" of "klant X altijd hoog", zet je in <code>${esc(c.map || 'Taken')}/voorkeuren.md</code>.</p>
      <h2>Punten</h2>
      <p>Taak gedaan: ${PUNTEN.taak}, plus ${PUNTEN.prio1} bij hoge en ${PUNTEN.prio2} bij normale prioriteit. Ochtendcheck en avondcheck: elk ${PUNTEN.ochtend}. Alles gedaan: ${PUNTEN.alles} bonus. Een taak die al twee dagen doorschuift en toch af komt: ${PUNTEN.eindelijk} extra. Elke subtaak: ${PUNTEN.sub}. Je reeks telt de dagen met een avondcheck; het weekend breekt hem niet.</p>
    </section>
    ${S.sync ? syncHtml() : ''}
  </main>`;
}

// ---------- sheets ----------
function chipsHtml(huidig) {
  const opties = MINUTEN.includes(huidig) ? MINUTEN : [...MINUTEN, huidig].sort((a, b) => a - b);
  return `<div class="chips">${opties.map((m) => `<label class="chip"><input type="radio" name="minuten" value="${m}"${m === huidig ? ' checked' : ''}><span>${fmtMin(m)}</span></label>`).join('')}</div>`;
}

function prioKeuzeHtml(huidig) {
  return `<div class="seg">${[1, 2, 3].map((p) => `<label><input type="radio" name="prio" value="${p}"${p === huidig ? ' checked' : ''}><span>${PRIO[p]}</span></label>`).join('')}</div>`;
}

function sheetSubsHtml(t) {
  return (t.sub || []).map((x) => `<li class="sub${x.klaar ? ' klaar' : ''}">${subVinkHtml(t, x)}<span>${esc(x.titel)}</span>
    <button type="button" class="sub-weg" data-action="sub-weg" data-id="${esc(t.id)}" data-sub="${esc(x.id)}" aria-label="Verwijder subtaak: ${esc(x.titel)}">${ICON.x}</button></li>`).join('');
}

function renderSheet() {
  const sh = S.sheet;
  if (!sh) {
    sheetRoot.innerHTML = '';
    sheetRoot.classList.remove('open');
    return;
  }
  let inhoud = '';
  if (sh.type === 'nieuw') {
    inhoud = `<form class="sheet" data-form="nieuw">
      <div class="grip"></div>
      <h2>Taak toevoegen</h2>
      <label class="sr-only" for="nieuw-titel">Taak</label>
      <input id="nieuw-titel" name="titel" placeholder="Wat moet er gebeuren?" required maxlength="140" enterkeyhint="done">
      <div class="field"><span>Tijd</span>${chipsHtml(15)}</div>
      <div class="field"><span>Prioriteit</span>${prioKeuzeHtml(2)}</div>
      <button type="submit" class="btn primary">Zet op vandaag</button>
    </form>`;
  } else {
    const t = staat().taken[sh.id];
    if (!t) {
      S.sheet = null;
      return renderSheet();
    }
    inhoud = `<form class="sheet" data-form="bewerk" data-id="${esc(t.id)}">
      <div class="grip"></div>
      <div class="card-head">${bronHtml(t)}${deadlineBadge(t)}</div>
      <label class="sr-only" for="bewerk-titel">Taak</label>
      <textarea id="bewerk-titel" name="titel" rows="2" maxlength="140" required>${esc(t.titel)}</textarea>
      ${t.wie || t.context ? `<p class="sheet-ctx">${t.wie ? `<b>${esc(t.wie)}</b> ` : ''}${esc(t.context || '')}</p>` : ''}
      ${t.link ? `<a class="card-link" href="${esc(t.link)}" target="_blank" rel="noopener">${ICON.link}${LINKLABEL[t.bron] || 'Open bron'}</a>` : ''}
      <div class="field"><span>Tijd</span>${chipsHtml(t.minuten)}</div>
      <div class="field"><span>Prioriteit</span>${prioKeuzeHtml(t.prio)}</div>
      <div class="field"><span>Subtaken</span>
        <ul class="sheet-subs" id="sheet-subs">${sheetSubsHtml(t)}</ul>
        <div class="sub-add">
          <label class="sr-only" for="sub-nieuw">Subtaak</label>
          <input id="sub-nieuw" placeholder="Subtaak toevoegen" maxlength="100" enterkeyhint="enter" autocomplete="off">
          <button type="button" class="mini-btn" data-action="sub-nieuw" data-id="${esc(t.id)}" aria-label="Subtaak toevoegen">${ICON.plus}</button>
        </div>
      </div>
      <div class="sheet-acts">
        <button type="button" class="mini-btn" data-action="bovenaan" data-id="${esc(t.id)}">${ICON.top}Bovenaan</button>
        <button type="button" class="mini-btn" data-action="naar-later-taak" data-id="${esc(t.id)}">${ICON.later}Later</button>
        <button type="button" class="mini-btn danger" data-action="taak-weg" data-id="${esc(t.id)}">${ICON.trash}Weg</button>
      </div>
      <button type="submit" class="btn primary">Bewaar</button>
    </form>`;
  }
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-action="sluit-sheet"></div>${inhoud}`;
  sheetRoot.classList.add('open');
  if (sh.type === 'nieuw') setTimeout(() => sheetRoot.querySelector('#nieuw-titel')?.focus(), 60);
}

// ---------- the game ----------
function startSpel(soort) {
  const s = staat();
  const v = vandaag();
  const kaarten = soort === 'ochtend' ? ochtendStapel(s, voorstel(), v) : avondStapel(s, v);
  S.spel = { soort, kaarten, i: 0, geschiedenis: [], stats: { wel: 0, niet: 0, later: 0, gedaan: 0, morgen: 0, los: 0, punten: 0 }, niveauVoor: niveau(totaalPunten(s)).nummer };
  if (!kaarten.length) return rondAf();
  S.view = 'spel';
  render();
}

function onDeck(dir, id) {
  const sp = S.spel;
  if (!sp || S.view !== 'spel' || dir === 'tap') return;
  const kaart = sp.kaarten[sp.i];
  if (!kaart || kaart.id !== id) return;
  const keuze = KEUZES[sp.soort][dir];
  const undo = kies(staat(), keuze, kaart, vandaag());
  sp.geschiedenis.push({ undo, keuze, punten: 0 });
  sp.stats[keuze]++;
  if (keuze === 'gedaan') {
    const p = staat().taken[id]?.punten || 0;
    sp.stats.punten += p;
    sp.geschiedenis.at(-1).punten = p;
    floatPoints(app.querySelector('.deck-btn.yes'), `+${p}`);
    burst(app.querySelector('.deck-btn.yes'));
  }
  sp.i++;
  S.sync.wijzig();
  if (sp.i >= sp.kaarten.length) setTimeout(rondAf, 120);
  else renderDeck();
}

function undoSwipe() {
  const sp = S.spel;
  const laatste = sp?.geschiedenis.pop();
  if (!laatste) return;
  laatste.undo(staat());
  sp.stats[laatste.keuze]--;
  sp.stats.punten -= laatste.punten;
  sp.i--;
  S.sync.wijzig();
  renderDeck();
}

function swipeKnop(dir) {
  const card = app.querySelector('.deck-card.top');
  if (!card || card.classList.contains('flying')) return;
  flyOut(card, dir, () => onDeck(dir, card.dataset.id));
}

function rondAf() {
  const sp = S.spel;
  const s = staat();
  const v = vandaag();
  if (sp.soort === 'ochtend') {
    const eerste = !s.dagen[v]?.ochtend;
    markeerDag(s, v, 'ochtend');
    S.sync.wijzig();
    S.view = 'plan';
    render();
    if (eerste) toast(`Ochtendcheck klaar, +${PUNTEN.ochtend} punten`, { soort: 'ok' });
  } else {
    const lijst = vandaagLijst(s, v);
    const gedaan = lijst.filter((t) => t.status === 'gedaan').length;
    const alles = gedaan > 0 && !sp.stats.morgen && !sp.stats.los;
    markeerDag(s, v, 'avond', alles ? { bonus: PUNTEN.alles } : {});
    S.sync.wijzig();
    S.view = 'klaar';
    render();
    confetti(gedaan ? 70 : 24);
  }
  checkNiveau(sp.niveauVoor);
}

function checkNiveau(voor) {
  const n = niveau(totaalPunten(staat()));
  if (n.nummer > voor) {
    setTimeout(() => {
      toast(`Level ${n.nummer}: je bent nu ${n.naam}`, { soort: 'ok', duur: 4000 });
      confetti(40);
    }, 500);
  }
}

// ---------- actions ----------
function vink(id, knop) {
  const s = staat();
  const t = s.taken[id];
  if (!t) return;
  const voor = niveau(totaalPunten(s)).nummer;
  if (t.status === 'gedaan') {
    kies(s, 'terug', t, vandaag());
    S.sync.wijzig();
    render();
    return;
  }
  const undo = kies(s, 'gedaan', t, vandaag());
  S.sync.wijzig();
  const p = s.taken[id].punten;
  floatPoints(knop, `+${p}`);
  burst(knop);
  const row = knop?.closest('.row');
  row?.classList.add('done');
  knop?.setAttribute('aria-pressed', 'true');
  setTimeout(() => {
    render();
    const open = vandaagLijst(staat(), vandaag()).filter((x) => x.status === 'vandaag').length;
    toast(open ? `+${p} punten` : `+${p} punten. Alles gedaan, rond je dag af.`, {
      soort: 'ok',
      actie: () => {
        undo(staat());
        S.sync.wijzig();
        render();
      },
    });
    checkNiveau(voor);
  }, 420);
}

function vinkSub(el) {
  const { id, sub } = el.dataset;
  const voor = niveau(totaalPunten(staat())).nummer;
  const klaar = subVink(staat(), id, sub, vandaag());
  S.sync.wijzig();
  if (klaar) {
    floatPoints(el, `+${PUNTEN.sub}`);
    burst(el, undefined, 6);
  }
  ververs();
  const t = staat().taken[id];
  if (klaar && t?.status === 'vandaag' && t.sub.every((x) => x.klaar)) {
    toast('Alle subtaken af', { soort: 'ok', label: 'Vink taak af', actie: () => vink(id, app.querySelector(`.check[data-id="${CSS.escape(id)}"]`)) });
  }
  checkNiveau(voor);
}

function nieuweSub(id) {
  const input = document.getElementById('sub-nieuw');
  if (!input?.value.trim()) return input?.focus();
  if (!subToevoegen(staat(), id, input.value)) return;
  S.sync.wijzig();
  input.value = '';
  ververs();
  input.focus();
}

function laterNaarVandaag(id) {
  const t = staat().taken[id];
  if (!t) return;
  kies(staat(), 'wel', t, vandaag());
  S.sync.wijzig();
  render();
  toast('Op vandaag gezet', { soort: 'ok' });
}

function taakWeg(id, keuze, melding) {
  const t = staat().taken[id];
  if (!t) return;
  const undo = kies(staat(), keuze, t, vandaag());
  S.sync.wijzig();
  S.sheet = null;
  render();
  toast(melding, {
    actie: () => {
      undo(staat());
      S.sync.wijzig();
      render();
    },
  });
}

async function vernieuw({ stil = false } = {}) {
  if (!S.sync) return;
  try {
    if (S.config.demo) zorgVoorDemo();
    await S.sync.laad(vandaag());
    S.geladen = Date.now();
    if (S.view !== 'spel' && !S.sheet) render();
    else renderStatus();
  } catch (e) {
    renderStatus();
    if (!stil) toast(e.message || 'Bijwerken mislukt', { soort: 'fout' });
  }
}

function zorgVoorDemo() {
  const store = S.sync.store;
  const pad = `${S.sync.voorstelMap}/${vandaag()}.json`;
  const files = store.files();
  if (!files[pad]) {
    files[pad] = { text: JSON.stringify(demoVoorstel(vandaag())), sha: `demo-${vandaag()}` };
    store.storage.setItem(store.key, JSON.stringify(files));
  }
}

function maakSync() {
  const c = S.config;
  const store = c.demo
    ? new LocalStore({ key: 'ds_demo' })
    : new GitHubStore({ owner: c.owner, repo: c.repo, branch: c.branch || 'main', token: c.token });
  S.sync = new Sync(store, { map: c.map || 'Taken', key: c.demo ? 'ds_demo_cache' : 'ds_cache' });
  S.sync.onStatus = renderStatus;
}

async function verbind(form) {
  const f = new FormData(form);
  const { owner, repo } = parseRepoInput(f.get('owner'), f.get('repo'));
  const next = {
    ...S.config,
    naam: String(f.get('naam') || '').trim() || 'Olaf',
    owner,
    repo,
    branch: String(f.get('branch') || '').trim() || 'main',
    map: String(f.get('map') || '').trim().replace(/^\/+|\/+$/g, '') || 'Taken',
    token: cleanToken(f.get('token')),
    demo: false,
  };
  if (!next.token) return toast('Vul je token in', { soort: 'fout' });
  const knop = form.querySelector('[type="submit"]');
  knop.disabled = true;
  knop.textContent = 'Controleren...';
  try {
    const info = await new GitHubStore({ ...next, fetchImpl: undefined }).check();
    const andereRepo = S.config.demo || S.config.owner !== next.owner || S.config.repo !== next.repo || S.config.map !== next.map;
    S.config = next;
    bewaarConfig();
    if (andereRepo) localStorage.removeItem('ds_cache');
    maakSync();
    S.view = 'home';
    render();
    toast(info.private ? 'Verbonden' : 'Verbonden, maar let op: deze repo is openbaar', { soort: info.private ? 'ok' : 'fout', duur: info.private ? 2600 : 6000 });
    await vernieuw();
  } catch (e) {
    toast(e.message || 'Verbinden mislukt', { soort: 'fout', duur: 7000 });
    knop.disabled = false;
    knop.textContent = 'Verbind';
  }
}

function startDemo() {
  S.config = { ...S.config, demo: true };
  bewaarConfig();
  maakSync();
  S.view = 'home';
  vernieuw();
  render();
  toast('Demo: probeer de ochtendcheck', { soort: 'info' });
}

const ACTIES = {
  'start-ochtend': () => startSpel('ochtend'),
  'start-avond': () => startSpel('avond'),
  'stop-spel': () => {
    S.spel = null;
    S.view = 'home';
    render();
  },
  'undo-swipe': undoSwipe,
  swipe: (el) => swipeKnop(el.dataset.dir),
  home: () => {
    S.view = 'home';
    S.sheet = null;
    render();
    window.scrollTo(0, 0);
  },
  welkom: () => {
    S.view = 'welkom';
    render();
  },
  'naar-instellingen': () => {
    S.view = 'instellingen';
    render();
    window.scrollTo(0, 0);
  },
  'naar-later': () => {
    S.view = 'later';
    render();
    window.scrollTo(0, 0);
  },
  demo: startDemo,
  vernieuw: () => vernieuw(),
  vink: (el) => vink(el.dataset.id, el),
  bewerk: (el) => {
    S.sheet = { type: 'bewerk', id: el.dataset.id };
    renderSheet();
  },
  nieuw: () => {
    S.sheet = { type: 'nieuw' };
    renderSheet();
  },
  'sluit-sheet': () => {
    S.sheet = null;
    renderSheet();
  },
  bovenaan: (el) => {
    pasAan(staat(), el.dataset.id, { bovenaan: true }, vandaag());
    S.sync.wijzig();
    S.sheet = null;
    render();
  },
  'naar-later-taak': (el) => taakWeg(el.dataset.id, 'later', 'Naar later'),
  'taak-weg': (el) => taakWeg(el.dataset.id, 'niet', 'Weggehaald'),
  'later-vandaag': (el) => laterNaarVandaag(el.dataset.id),
  'later-weg': (el) => taakWeg(el.dataset.id, 'niet', 'Weggehaald'),
  'naar-archief': () => {
    S.view = 'archief';
    render();
    window.scrollTo(0, 0);
  },
  'sub-vink': vinkSub,
  'sub-weg': (el) => {
    subWeg(staat(), el.dataset.id, el.dataset.sub);
    S.sync.wijzig();
    ververs();
  },
  'sub-nieuw': (el) => nieuweSub(el.dataset.id),
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = ACTIES[el.dataset.action];
  if (!fn) return;
  ev.preventDefault();
  fn(el);
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const f = new FormData(form);
  if (form.dataset.form === 'verbind') return verbind(form);
  if (form.dataset.form === 'nieuw') {
    const t = eigenTaak(staat(), { titel: f.get('titel'), minuten: Number(f.get('minuten')), prio: Number(f.get('prio')) }, vandaag());
    if (!t) return;
    S.sync.wijzig();
    S.sheet = null;
    render();
    pop(app.querySelector(`.row[data-id="${CSS.escape(t.id)}"]`));
    return;
  }
  if (form.dataset.form === 'bewerk') {
    pasAan(staat(), form.dataset.id, { titel: f.get('titel'), minuten: Number(f.get('minuten')), prio: Number(f.get('prio')) }, vandaag());
    S.sync.wijzig();
    S.sheet = null;
    render();
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'sub-nieuw' && !ev.isComposing) {
    ev.preventDefault();
    return nieuweSub(S.sheet?.id);
  }
  if (ev.key === 'Escape' && S.sheet) {
    S.sheet = null;
    return renderSheet();
  }
  if (S.view !== 'spel' || S.sheet || ev.target.closest('input, textarea')) return;
  const dir = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up' }[ev.key];
  if (dir) {
    ev.preventDefault();
    swipeKnop(dir);
  } else if (ev.key === 'Backspace' || (ev.key === 'z' && (ev.metaKey || ev.ctrlKey))) {
    ev.preventDefault();
    undoSwipe();
  } else if (ev.key === 'Escape') ACTIES['stop-spel']();
});

// Back in the app after a while (or on a new day): fetch what Claude added.
let dagBijLaden = vandaag();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.sync || S.view === 'spel') return;
  if (Date.now() - S.geladen > 30_000 || dagBijLaden !== vandaag()) {
    dagBijLaden = vandaag();
    vernieuw({ stil: true });
  }
});
addEventListener('online', () => S.sync?.dirty && S.sync.schrijf().catch(() => {}));

// Open on the computer while Claude is still working: look for today's cards
// every two minutes until they are there.
setInterval(() => {
  if (!S.sync || S.config.demo || document.visibilityState !== 'visible' || S.view !== 'home' || S.sheet) return;
  if (voorstelVanVandaag() || new Date().getHours() >= 12) return;
  vernieuw({ stil: true });
}, 120_000);

setupDeck(onDeck);

// ---------- start ----------
if (S.config.demo || S.config.token) {
  maakSync();
  S.view = 'home';
  render();
  vernieuw({ stil: true });
} else {
  S.view = 'welkom';
  render();
}

// A new version installs in the background; once it takes over, reload so
// the fix is there right away instead of on the next open. Not mid-swipe.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let herladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || herladen || S.view === 'spel' || S.sheet) return;
    herladen = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
