// The rules of the game, without DOM or network: which cards come up in the
// morning and evening check, what a swipe does, points, streak and level, and
// how two versions of the state (iPhone and Mac) merge. Runs under node --test.

export const BRONNEN = {
  mail: 'Mail',
  agenda: 'Agenda',
  meeting: 'Meeting',
  pipedrive: 'Pipedrive',
  monday: 'monday',
  eigen: 'Eigen',
  overig: 'Overig',
};

// Morning: right is wel, left is niet, up is later.
// Evening: right is gedaan, left is morgen, up is los (let it go).
export const KEUZES = {
  ochtend: { right: 'wel', left: 'niet', up: 'later' },
  avond: { right: 'gedaan', left: 'morgen', up: 'los' },
};

export const PUNTEN = { taak: 10, prio1: 10, prio2: 5, eindelijk: 5, ochtend: 5, avond: 5, alles: 20 };
const PER_NIVEAU = 200;
const NIVEAUS = ['Opstarter', 'Doener', 'Afvinker', 'Doorpakker', 'Machine', 'Topspeler', 'Legende'];
const ARCHIEF_NA_DAGEN = 30;
const ID_RE = /^[A-Za-z0-9:._-]{1,80}$/;

// ---------- dates (the device's own day, as YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, '0');

export function dagVan(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function datum(dag) {
  const [y, m, d] = dag.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function plusDagen(dag, n) {
  const d = datum(dag);
  d.setDate(d.getDate() + n);
  return dagVan(d);
}

export function isWeekend(dag) {
  const w = datum(dag).getDay();
  return w === 0 || w === 6;
}

const isDag = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------- state ----------
export function legeStaat() {
  return { versie: 1, taken: {}, dagen: {}, archief: {} };
}

// Accepts whatever JSON was on disk and returns a state the app can trust.
export function leesStaat(raw) {
  const s = legeStaat();
  if (!raw || typeof raw !== 'object') return s;
  for (const [id, t] of Object.entries(raw.taken || {})) {
    const c = schoon({ ...t, id });
    if (!c) continue;
    for (const k of ['status', 'dag', 'gedaanOp', 'beslist']) if (typeof t[k] === 'string') c[k] = t[k];
    for (const k of ['t', 'volgorde', 'door', 'punten']) if (Number.isFinite(t[k])) c[k] = t[k];
    if (t.bewerkt) c.bewerkt = true;
    s.taken[id] = c;
  }
  for (const [dag, d] of Object.entries(raw.dagen || {})) if (isDag(dag) && d && typeof d === 'object') s.dagen[dag] = { ...d };
  for (const [id, a] of Object.entries(raw.archief || {})) if (a && typeof a === 'object') s.archief[id] = { ...a };
  return s;
}

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const clamp = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

// One task as Claude proposes it (or as the user typed it), cleaned up.
// Returns null when there is nothing usable.
export function schoon(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').trim();
  const titel = str(raw.titel, 140);
  if (!ID_RE.test(id) || !titel) return null;
  const t = {
    id,
    titel,
    bron: Object.hasOwn(BRONNEN, raw.bron) ? raw.bron : 'overig',
    minuten: clamp(raw.minuten, 5, 480, 15),
    prio: clamp(raw.prio, 1, 3, 2),
  };
  const context = str(raw.context, 280);
  const wie = str(raw.wie, 80);
  const link = /^https:\/\//i.test(String(raw.link || '')) ? String(raw.link).trim().slice(0, 500) : '';
  if (context) t.context = context;
  if (wie) t.wie = wie;
  if (link) t.link = link;
  if (isDag(raw.deadline)) t.deadline = raw.deadline;
  return t;
}

// What Claude wrote for a day, cleaned up. Unknown or broken tasks are skipped.
export function leesVoorstel(raw) {
  if (!raw || typeof raw !== 'object' || !isDag(raw.datum)) return null;
  const v = { datum: raw.datum, taken: [] };
  if (typeof raw.gemaakt === 'string') v.gemaakt = raw.gemaakt;
  const samenvatting = str(raw.samenvatting, 400);
  if (samenvatting) v.samenvatting = samenvatting;
  if (Number.isFinite(raw.vrijeMinuten)) v.vrijeMinuten = clamp(raw.vrijeMinuten, 0, 1440, 0);
  if (Array.isArray(raw.agenda)) {
    v.agenda = raw.agenda
      .map((a) => ({ van: str(a?.van, 5), tot: str(a?.tot, 5), titel: str(a?.titel, 100) }))
      .filter((a) => /^\d{1,2}:\d{2}$/.test(a.van) && a.titel)
      .slice(0, 20);
  }
  const ids = new Set();
  for (const r of Array.isArray(raw.taken) ? raw.taken : []) {
    const t = schoon(r);
    if (t && !ids.has(t.id)) {
      ids.add(t.id);
      v.taken.push(t);
    }
  }
  return v;
}

// ---------- decks ----------
// Sort order of a deck: high priority first, then a near deadline, then what
// has been waiting longest.
function gewicht(t, vandaag) {
  let w = t.prio * 10;
  if (t.deadline && t.deadline <= plusDagen(vandaag, 1)) w -= 8;
  w -= Math.min(3, t.door || 0) * 2;
  return w;
}

// The morning deck: what was left yesterday, Claude's new proposals and what
// Claude brings back from the later list. Decided cards drop out by themselves.
export function ochtendStapel(staat, voorstel, vandaag) {
  const kaarten = [];
  const gezien = new Set();
  const nieuw = new Map((voorstel?.taken || []).map((t) => [t.id, t]));
  for (const t of Object.values(staat.taken)) {
    // "morgen" in tonight's check means tomorrow, not right after the check
    const blijven = (t.status === 'open' && t.beslist !== vandaag) || (t.status === 'vandaag' && t.dag < vandaag);
    if (!blijven) continue;
    const p = nieuw.get(t.id);
    const door = (t.door || 0) + (t.status === 'vandaag' ? 1 : 0);
    kaarten.push({ ...t, ...(p && !t.bewerkt ? { context: p.context ?? t.context } : {}), door, soort: 'door' });
    gezien.add(t.id);
  }
  for (const p of voorstel?.taken || []) {
    if (gezien.has(p.id) || staat.archief[p.id]) continue;
    gezien.add(p.id);
    const s = staat.taken[p.id];
    if (!s) kaarten.push({ ...p, soort: 'nieuw' });
    else if (s.status === 'later' && s.beslist !== vandaag) kaarten.push({ ...s, context: p.context ?? s.context, soort: 'terug' });
  }
  return kaarten.sort((a, b) => gewicht(a, vandaag) - gewicht(b, vandaag));
}

// The evening deck: everything chosen for today that is not done yet.
export function avondStapel(staat, vandaag) {
  return vandaagLijst(staat, vandaag).filter((t) => t.status === 'vandaag');
}

// Today's list: chosen for today, plus what was finished today.
export function vandaagLijst(staat, vandaag) {
  return Object.values(staat.taken)
    .filter((t) => (t.status === 'vandaag' && t.dag === vandaag) || (t.status === 'gedaan' && t.gedaanOp === vandaag))
    .sort((a, b) => (a.volgorde ?? 999) - (b.volgorde ?? 999) || a.prio - b.prio);
}

export function laterLijst(staat) {
  return Object.values(staat.taken)
    .filter((t) => t.status === 'later')
    .sort((a, b) => a.prio - b.prio || (b.t || 0) - (a.t || 0));
}

// ---------- moves ----------
function volgendeVolgorde(staat, vandaag) {
  return vandaagLijst(staat, vandaag).reduce((m, t) => Math.max(m, t.volgorde ?? 0), 0) + 1;
}

export function puntenVoor(t) {
  return PUNTEN.taak + (t.prio === 1 ? PUNTEN.prio1 : t.prio === 2 ? PUNTEN.prio2 : 0) + ((t.door || 0) >= 2 ? PUNTEN.eindelijk : 0);
}

// Applies a choice to one task and returns what is needed to undo it.
// keuze: wel, niet, later (morning), gedaan, morgen, los (evening and list),
// terug (undo "gedaan" in the list). kaart: the card as shown, for new tasks.
export function kies(staat, keuze, kaart, vandaag, nu = Date.now()) {
  const id = kaart.id;
  const vorige = staat.taken[id] ? { ...staat.taken[id] } : null;
  const basis = vorige ? { ...vorige } : { ...schoon(kaart) };
  if (kaart.door !== undefined) basis.door = kaart.door;
  if (kaart.context && !basis.bewerkt) basis.context = kaart.context;
  const t = { ...basis, t: nu };
  delete t.soort;
  switch (keuze) {
    case 'wel':
      Object.assign(t, { status: 'vandaag', dag: vandaag, volgorde: volgendeVolgorde(staat, vandaag) });
      break;
    case 'niet':
    case 'los':
      Object.assign(t, { status: 'weg', beslist: vandaag });
      break;
    case 'later':
      Object.assign(t, { status: 'later', beslist: vandaag });
      break;
    case 'gedaan':
      Object.assign(t, { status: 'gedaan', gedaanOp: vandaag, dag: t.dag || vandaag });
      t.punten = puntenVoor(t);
      break;
    case 'morgen':
      Object.assign(t, { status: 'open', door: (t.door || 0) + 1, beslist: vandaag });
      break;
    case 'terug':
      Object.assign(t, { status: 'vandaag', dag: vandaag });
      delete t.gedaanOp;
      delete t.punten;
      break;
    default:
      throw new Error(`Onbekende keuze ${keuze}`);
  }
  staat.taken[id] = t;
  // The state object can be replaced by a sync in between: undo on the current one.
  return (doel = staat) => {
    if (vorige) doel.taken[id] = { ...vorige, t: Date.now() };
    else delete doel.taken[id];
  };
}

// A task you add yourself goes straight onto today.
export function eigenTaak(staat, { titel, minuten = 15, prio = 2 }, vandaag, nu = Date.now()) {
  const b = new Uint8Array(4);
  globalThis.crypto.getRandomValues(b);
  const id = `eigen-${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  const t = schoon({ id, titel, minuten, prio, bron: 'eigen' });
  if (!t) return null;
  Object.assign(t, { status: 'vandaag', dag: vandaag, volgorde: volgendeVolgorde(staat, vandaag), t: nu });
  staat.taken[id] = t;
  return t;
}

// Small tweaks after choosing: title, minutes, priority, or put it on top.
export function pasAan(staat, id, wijziging, vandaag, nu = Date.now()) {
  const t = staat.taken[id];
  if (!t) return;
  if (wijziging.titel !== undefined) {
    const titel = str(wijziging.titel, 140);
    if (titel && titel !== t.titel) Object.assign(t, { titel, bewerkt: true });
  }
  if (wijziging.minuten !== undefined) t.minuten = clamp(wijziging.minuten, 5, 480, t.minuten);
  if (wijziging.prio !== undefined) t.prio = clamp(wijziging.prio, 1, 3, t.prio);
  if (wijziging.bovenaan) {
    const min = vandaagLijst(staat, vandaag).reduce((m, x) => Math.min(m, x.volgorde ?? 0), 0);
    t.volgorde = min - 1;
  }
  t.t = nu;
}

export function markeerDag(staat, vandaag, veld, extra = {}, nu = Date.now()) {
  const d = { ...(staat.dagen[vandaag] || {}) };
  if (!d[veld]) d[veld] = new Date(nu).toISOString();
  Object.assign(d, extra, { t: nu });
  staat.dagen[vandaag] = d;
}

// ---------- score ----------
export function totaalPunten(staat) {
  let p = 0;
  for (const t of Object.values(staat.taken)) if (t.status === 'gedaan') p += t.punten || 0;
  for (const a of Object.values(staat.archief)) p += a.p || 0;
  for (const d of Object.values(staat.dagen)) p += (d.ochtend ? PUNTEN.ochtend : 0) + (d.avond ? PUNTEN.avond : 0) + (d.bonus || 0);
  return p;
}

export function puntenVanDag(staat, dag) {
  let p = 0;
  for (const t of Object.values(staat.taken)) if (t.status === 'gedaan' && t.gedaanOp === dag) p += t.punten || 0;
  const d = staat.dagen[dag] || {};
  return p + (d.ochtend ? PUNTEN.ochtend : 0) + (d.avond ? PUNTEN.avond : 0) + (d.bonus || 0);
}

// Days in a row with an evening check. Today does not break it before the
// evening, and a weekend day without a check does not break it either.
export function reeks(staat, vandaag) {
  let n = 0;
  for (let dag = vandaag, i = 0; i < 400; dag = plusDagen(dag, -1), i++) {
    if (staat.dagen[dag]?.avond) n++;
    else if (dag === vandaag || isWeekend(dag)) continue;
    else break;
  }
  return n;
}

export function niveau(punten) {
  const i = Math.floor(punten / PER_NIVEAU);
  return { nummer: i + 1, naam: NIVEAUS[Math.min(i, NIVEAUS.length - 1)], binnen: punten % PER_NIVEAU, nodig: PER_NIVEAU };
}

export function minutenVan(lijst) {
  return lijst.reduce((m, t) => m + (t.minuten || 0), 0);
}

// ---------- housekeeping and merge ----------
// Done and dropped tasks older than a month shrink to one line in the archive,
// so the file stays small. Claude still sees them and will not propose them again.
export function ruimOp(staat, nu = Date.now()) {
  const grens = nu - ARCHIEF_NA_DAGEN * 864e5;
  for (const [id, t] of Object.entries(staat.taken)) {
    if ((t.status === 'gedaan' || t.status === 'weg') && (t.t || 0) < grens) {
      staat.archief[id] = { s: t.status, d: t.gedaanOp || t.beslist || t.dag || '', ...(t.punten ? { p: t.punten } : {}) };
      delete staat.taken[id];
    }
  }
}

// Two versions of the state, for example the iPhone and the Mac: per task the
// newest change wins, days combine field by field, the archive is a union.
export function voegSamen(a, b) {
  const s = legeStaat();
  for (const id of new Set([...Object.keys(a.taken), ...Object.keys(b.taken)])) {
    const x = a.taken[id];
    const y = b.taken[id];
    s.taken[id] = !x ? y : !y ? x : (y.t || 0) > (x.t || 0) ? y : x;
  }
  for (const dag of new Set([...Object.keys(a.dagen), ...Object.keys(b.dagen)])) {
    const x = a.dagen[dag] || {};
    const y = b.dagen[dag] || {};
    s.dagen[dag] = {
      ...x,
      ...y,
      ochtend: [x.ochtend, y.ochtend].filter(Boolean).sort()[0],
      avond: [x.avond, y.avond].filter(Boolean).sort()[0],
      bonus: Math.max(x.bonus || 0, y.bonus || 0),
      t: Math.max(x.t || 0, y.t || 0),
    };
    for (const k of ['ochtend', 'avond', 'bonus']) if (!s.dagen[dag][k]) delete s.dagen[dag][k];
  }
  s.archief = { ...a.archief, ...b.archief };
  for (const id of Object.keys(s.archief)) delete s.taken[id];
  return s;
}
