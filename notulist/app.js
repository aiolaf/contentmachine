// Notulist: dictaphone and meeting notes for iPhone and Mac.
// Recordings and transcripts stay on this device (IndexedDB). Only the audio you
// transcribe goes to the speech service you chose, with your own key.
import { db, meetings, audio, kv, storageInfo, askPersist } from './lib/db.js';
import { WebRecorder, recordingSupported, recoverAudio, extFor } from './lib/recorder.js';
import { transcribe, PROVIDERS, LANGUAGES } from './lib/transcribe.js';
import { shiftPart, speakerKeys, talkTime, samples, mergeSpeaker } from './lib/segments.js';
import { speakerLabel, participants, llmText, toMarkdown, fileNameFor, parseMarkdown, transcriptText } from './lib/format.js';
import { appsScriptCode, fetchAppsScript, relevantEvents, otherAttendees, normalizeEvents, eventsAround, eventsOnDay } from './lib/calendar.js';
import { encodeShare, decodeShare, shareMeeting, download, markdownFile, MAX_LINK } from './lib/share.js';
import { PROMPTS } from './lib/prompts.js';
import * as native from './lib/native.js';
import { uid, clock, duration, dayLabel, timeLabel, longDate, fold, firstName, bytes, randomKey } from './lib/util.js';

const VERSION = '1.0.0';
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// One mark color per speaker, the only color in a transcript.
const COLORS = ['#8a45d4', '#16a34a', '#d97706', '#2563eb', '#ea580c', '#db2777', '#0d9488', '#65a30d'];

const DEFAULTS = {
  provider: 'elevenlabs',
  keys: { elevenlabs: '', openai: '' },
  language: 'nl',
  myName: '',
  myEmail: '',
  timestamps: true,
  autoTranscribe: true,
  keepAudio: 'always',
  calUrl: '',
  calKey: '',
};

const state = {
  settings: { ...DEFAULTS },
  meetings: [],
  people: [],
  events: [],
  calError: '',
  query: '',
  person: '',
  recording: null,
  jobs: new Map(),
  nativeInfo: null,
  shared: null,
  editing: false,
};

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

// ---------- tiny DOM helpers (no innerHTML with user data) ----------

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'list' || k === 'for' || k === 'role' || k.startsWith('aria-') || k.startsWith('data-') || !(k in el)) el.setAttribute(k, v === true ? '' : v);
    else el[k] = v;
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false && kid !== '') el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

const ICONS = {
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};

function icon(name, cls = 'ic') {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return t.content.firstChild;
}

const btn = (label, onclick, { cls = 'btn', ic, title, disabled } = {}) => h('button', { class: cls, type: 'button', onclick, title, disabled, 'aria-label': title || null }, ic ? icon(ic) : null, label ? h('span', null, label) : null);

let toastTimer;
function toast(msg, actions = [], ms = 3500) {
  const el = $('#toast');
  el.replaceChildren(h('span', null, msg), ...actions.map(([label, fn]) => h('button', { type: 'button', onclick: () => { fn(); el.hidden = true; } }, label)));
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, actions.length ? Math.max(ms, 6000) : ms);
}

function sheet(title, ...content) {
  const wrap = $('#sheet');
  const close = () => { wrap.hidden = true; wrap.replaceChildren(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const panel = h('div', { class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', null, title), btn('', close, { cls: 'icon-btn', ic: 'back', title: 'Sluiten' })),
    ...content);
  wrap.replaceChildren(h('div', { class: 'sheet-backdrop', onclick: close }), panel);
  wrap.hidden = false;
  setTimeout(() => panel.querySelector('input:not([type=hidden]),button.primary')?.focus?.(), 50);
  return close;
}

function confirmSheet(title, text, okLabel, onOk, danger = true) {
  const close = sheet(title, h('p', { class: 'muted' }, text),
    h('div', { class: 'row gap end' }, btn('Annuleer', () => close(), { cls: 'btn' }), btn(okLabel, () => { close(); onOk(); }, { cls: danger ? 'btn danger' : 'btn primary' })));
}

// ---------- data ----------

async function loadAll() {
  const saved = (await kv.get('settings')) || {};
  state.settings = { ...DEFAULTS, ...saved, keys: { ...DEFAULTS.keys, ...(saved.keys || {}) } };
  if (!state.settings.calKey) state.settings.calKey = randomKey();
  state.meetings = (await meetings.all()).sort((a, b) => (b.startedAt || b.createdAt).localeCompare(a.startedAt || a.createdAt));
  state.people = await db.all('people');
}

const saveSettings = () => kv.set('settings', state.settings);
const getMeeting = (id) => state.meetings.find((m) => m.id === id);

async function saveMeeting(m, { sync = true } = {}) {
  await meetings.save(m);
  const i = state.meetings.findIndex((x) => x.id === m.id);
  if (i >= 0) state.meetings[i] = m; else state.meetings.unshift(m);
  state.meetings.sort((a, b) => (b.startedAt || b.createdAt).localeCompare(a.startedAt || a.createdAt));
  if (sync) queueLibraryWrite(m);
}

async function rememberPerson(name, email = '') {
  const n = String(name || '').trim();
  if (!n || n === state.settings.myName) return;
  const existing = state.people.find((p) => fold(p.name) === fold(n) || (email && p.email === email));
  if (existing) {
    if (email && !existing.email) { existing.email = email; await db.put('people', existing); }
    return;
  }
  const p = { id: uid('p'), name: n, email, createdAt: new Date().toISOString() };
  state.people.push(p);
  await db.put('people', p);
}

// ---------- library folder (Mac app) ----------

const libraryTimers = new Map();
function queueLibraryWrite(m) {
  if (!native.isNative || !m.segments?.length) return;
  clearTimeout(libraryTimers.get(m.id));
  libraryTimers.set(m.id, setTimeout(() => writeLibrary(m.id), 800));
}

async function writeLibrary(id) {
  const m = getMeeting(id);
  if (!m || !m.segments?.length) return;
  const name = fileNameFor(m);
  try {
    await native.call('writeFile', { name, content: toMarkdown(m) });
    if (m.file && m.file !== name) await native.call('deleteFile', { name: m.file }).catch(() => {});
    if (m.file !== name) { m.file = name; await meetings.save(m); }
  } catch (e) { console.warn('library write', e); }
}

let importing = false;
async function importFromLibrary() {
  if (!native.isNative || importing) return;
  importing = true;
  try {
    const files = await native.call('listFiles');
    const known = new Set(state.meetings.map((m) => m.file).filter(Boolean));
    const ids = new Set(state.meetings.map((m) => m.id));
    let added = 0;
    for (const f of files || []) {
      if (known.has(f.name) || !f.name.endsWith('.md')) continue;
      const text = await native.call('readFile', { name: f.name });
      const parsed = parseMarkdown(text);
      if (!parsed.segments.length && !parsed.notes) continue;
      if (parsed.id && ids.has(parsed.id)) continue;
      const m = { ...parsed, id: parsed.id || uid(), file: f.name, createdAt: parsed.startedAt || new Date().toISOString(), startedAt: parsed.startedAt || new Date(f.modified || Date.now()).toISOString(), status: 'done', parts: [], imported: true };
      await saveMeeting(m, { sync: false });
      ids.add(m.id);
      added++;
    }
    if (added) { render(); toast(`${added} ${added === 1 ? 'opname' : 'opnames'} uit je map toegevoegd`); }
  } catch (e) { console.warn('library import', e); } finally { importing = false; }
}

// ---------- calendar ----------

async function loadCalendar() {
  try {
    if (native.isNative) state.events = normalizeEvents(await native.call('calendar', { days: 7 }));
    else if (state.settings.calUrl) state.events = await fetchAppsScript(state.settings.calUrl, state.settings.calKey);
    else state.events = [];
    state.calError = '';
  } catch (e) {
    state.calError = e.message;
  }
  if (route().name === 'list') render();
}

// ---------- recording ----------

function defaultTitle(date = new Date()) {
  return `Opname ${date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${timeLabel(date)}`;
}

function newMeeting(event, extra = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: event?.title || defaultTitle(),
    createdAt: now,
    startedAt: now,
    status: 'recording',
    source: native.isNative ? 'mac' : isIOS ? 'iphone' : 'web',
    parts: [],
    markers: [],
    notes: '',
    segments: [],
    speakers: {},
    people: otherAttendees(event).map(({ name, email }) => ({ name, email })),
    calendar: event ? { id: event.id, title: event.title, start: event.start, end: event.end } : null,
    duration: 0,
    ...extra,
  };
}

async function startRecording(event = null) {
  if (state.recording) { showRecorder(); return; }
  // Only link an appointment you picked yourself. Otherwise you choose afterwards.
  const m = newMeeting(event);
  if (native.isNative) {
    await saveMeeting(m, { sync: false });
    try {
      const res = await native.call('startRecording', { id: m.id, title: m.title, calendarId: event?.id || '' });
      state.recording = { id: m.id, native: true, startedAt: Date.parse(res?.startedAt) || Date.now(), system: !!res?.system };
    } catch (e) {
      await meetings.remove(m.id);
      state.meetings = state.meetings.filter((x) => x.id !== m.id);
      toast(e.message);
      return;
    }
    showRecorder();
    return;
  }
  if (!recordingSupported()) { toast('Deze browser kan niet opnemen. Gebruik Safari op iPhone of Chrome/Safari op de Mac.'); return; }
  const rec = new WebRecorder({ onInterrupt: () => onInterrupted(), onError: (e) => toast(`Opslaan mislukt: ${e.message || e}`) });
  try {
    await rec.start(m.id, 0);
  } catch (e) {
    toast(e.name === 'NotAllowedError'
      ? 'Geen toegang tot de microfoon. Sta die toe in Instellingen > Safari (of bij het slotje in je browser).'
      : `Microfoon starten lukt niet: ${e.message}`);
    return;
  }
  await saveMeeting(m, { sync: false });
  state.recording = { id: m.id, rec, part: 0, before: 0 };
  askPersist();
  showRecorder();
}

function recElapsed() {
  const r = state.recording;
  if (!r) return 0;
  if (r.native) return (Date.now() - r.startedAt) / 1000;
  return (r.before || 0) + (r.rec?.elapsed() || 0);
}

async function onInterrupted() {
  const r = state.recording;
  if (!r || r.native || r.interrupted) return;
  r.interrupted = true;
  await finishPart();
  renderRecorder();
  toast('De opname is onderbroken (bijvoorbeeld door een telefoontje). Tik op Ga verder om door te gaan.');
}

async function finishPart() {
  const r = state.recording;
  const res = await r.rec.stop();
  const m = getMeeting(r.id);
  if (res && m) {
    m.parts[r.part] = { mime: res.mime, duration: res.duration, size: res.blob.size };
    await audio.put(m.id, r.part, res.blob);
    r.before += res.duration;
    m.duration = r.before;
    await saveMeeting(m, { sync: false });
  }
  r.rec = null;
}

async function continueRecording() {
  const r = state.recording;
  if (!r?.interrupted) return;
  const rec = new WebRecorder({ onInterrupt: () => onInterrupted(), onError: (e) => toast(`Opslaan mislukt: ${e.message || e}`) });
  try {
    await rec.start(r.id, r.part + 1);
  } catch (e) { toast(`Microfoon starten lukt niet: ${e.message}`); return; }
  r.rec = rec;
  r.part += 1;
  r.interrupted = false;
  renderRecorder();
}

async function stopRecording() {
  const r = state.recording;
  if (!r) return;
  const stopBtn = $('#rec-stop');
  if (stopBtn) stopBtn.disabled = true;
  if (r.native) {
    r.stopping = true;
    renderRecorder();
    try { await native.call('stopRecording'); } catch (e) { toast(e.message); }
    return; // the Mac app answers with a recordingFinished event
  }
  if (!r.interrupted) await finishPart();
  await db.dropChunks(r.id);
  const m = getMeeting(r.id);
  state.recording = null;
  hideRecorder();
  if (!m) return;
  if (!m.parts.some((p) => p?.size)) {
    await meetings.remove(m.id);
    state.meetings = state.meetings.filter((x) => x.id !== m.id);
    toast('De opname was leeg en is niet bewaard.');
    render();
    return;
  }
  m.status = 'saved';
  await saveMeeting(m, { sync: false });
  go(`#/m/${m.id}`);
  maybeTranscribe(m.id);
}

function addMarker() {
  const r = state.recording;
  if (!r) return;
  const m = getMeeting(r.id);
  if (!m) return;
  m.markers = [...(m.markers || []), Math.round(recElapsed())];
  saveMeeting(m, { sync: false });
  toast(`Gemarkeerd op ${clock(recElapsed())}`, [], 1500);
  renderRecorder();
}

function togglePause() {
  const r = state.recording;
  if (!r || r.native || r.interrupted || !r.rec) return;
  if (r.rec.state === 'paused') r.rec.resume(); else r.rec.pause();
  renderRecorder();
}

let raf = 0;
const levels = new Array(32).fill(0);
function showRecorder() {
  $('#rec').hidden = false;
  $('#rec-mini').hidden = true;
  document.body.classList.add('recording');
  renderRecorder();
  cancelAnimationFrame(raf);
  const loop = () => {
    const r = state.recording;
    if (!r) return;
    const t = $('#rec-time');
    if (t) t.textContent = clock(recElapsed());
    const mini = $('#rec-mini-time');
    if (mini) mini.textContent = clock(recElapsed());
    const lv = r.native ? (r.level || 0) : r.rec?.level() || 0;
    levels.push(lv);
    levels.shift();
    const bars = $('#rec-bars');
    if (bars && !$('#rec').hidden) [...bars.children].forEach((b, i) => { b.style.transform = `scaleY(${Math.max(0.06, levels[i])})`; });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function minimizeRecorder() {
  $('#rec').hidden = true;
  $('#rec-mini').hidden = !state.recording;
}

function hideRecorder() {
  cancelAnimationFrame(raf);
  $('#rec').hidden = true;
  $('#rec-mini').hidden = true;
  document.body.classList.remove('recording');
}

function renderRecorder() {
  const r = state.recording;
  const box = $('#rec');
  if (!r) { hideRecorder(); return; }
  const m = getMeeting(r.id) || {};
  const paused = !r.native && r.rec?.state === 'paused';
  const status = r.stopping ? 'Afronden…' : r.interrupted ? 'Onderbroken' : paused ? 'Gepauzeerd' : r.trigger ? `Opname loopt · ${r.trigger}` : 'Opname loopt';
  const who = participants(m);
  box.replaceChildren(...[
    h('div', { class: 'rec-top' },
      h('span', { class: `rec-dot${paused || r.interrupted ? ' off' : ''}` }), h('span', { class: 'rec-status' }, status),
      btn('Verberg', minimizeRecorder, { cls: 'link-btn' })),
    h('div', { class: 'rec-time', id: 'rec-time' }, clock(recElapsed())),
    h('div', { class: 'rec-bars', id: 'rec-bars', 'aria-hidden': 'true' }, levels.map(() => h('i'))),
    h('input', { class: 'rec-title', value: m.title || '', 'aria-label': 'Titel', onchange: async (e) => { const mm = getMeeting(r.id); if (mm) { mm.title = e.target.value.trim() || mm.title; await saveMeeting(mm, { sync: false }); } } }),
    who.length ? h('p', { class: 'rec-who' }, icon('people'), who.join(', ')) : null,
    h('textarea', { class: 'rec-notes', placeholder: 'Notities (optioneel). Ze komen boven het transcript.', value: m.notes || '', oninput: debounce(async (e) => { const mm = getMeeting(r.id); if (mm) { mm.notes = e.target.value; await saveMeeting(mm, { sync: false }); } }, 400) }),
    h('div', { class: 'rec-actions' },
      btn('Markeer', addMarker, { cls: 'round', ic: 'star', title: 'Markeer dit moment' }),
      r.interrupted
        ? btn('Ga verder', continueRecording, { cls: 'round go', ic: 'mic' })
        : h('button', { class: 'stop', id: 'rec-stop', type: 'button', onclick: stopRecording, disabled: r.stopping, 'aria-label': 'Stop en bewaar' }, icon('stop', 'ic big')),
      r.native ? h('span', { class: 'round ghost' }, r.system ? 'Mic + Mac-geluid' : 'Microfoon') : btn(paused ? 'Hervat' : 'Pauze', togglePause, { cls: 'round', ic: paused ? 'mic' : 'pause', disabled: r.interrupted })),
    h('p', { class: 'rec-legal' }, icon('lock'), 'Vertel even dat je opneemt. De opname blijft op dit apparaat tot je transcribeert.'),
    m.markers?.length ? h('p', { class: 'muted small center' }, `${m.markers.length} ${m.markers.length === 1 ? 'markering' : 'markeringen'}`) : null,
  ].filter(Boolean));
  if (r.interrupted) {
    box.append(h('div', { class: 'row gap center' }, btn('Stop en bewaar', stopRecording, { cls: 'btn' })));
  }
}

// ---------- native (Mac app) events ----------

async function onNativeEvent(evt) {
  if (evt.type === 'level') {
    if (state.recording?.native) state.recording.level = evt.value;
  } else if (evt.type === 'recordingStarted') {
    let m = getMeeting(evt.id);
    if (!m) {
      // A meeting the Mac detected may carry its appointment; a recording you started does not.
      const event = evt.trigger && evt.calendar ? normalizeEvents([evt.calendar])[0] : null;
      m = newMeeting(event, { id: evt.id, source: evt.trigger ? 'mac-auto' : 'mac', startedAt: evt.startedAt || new Date().toISOString() });
      if (evt.title && !event && evt.title !== evt.calendar?.title) m.title = evt.title;
      await saveMeeting(m, { sync: false });
    }
    state.recording = { id: evt.id, native: true, startedAt: Date.parse(evt.startedAt) || Date.now(), trigger: evt.trigger || '', system: !!evt.system };
    if (evt.trigger) { showRecorder(); minimizeRecorder(); } else showRecorder();
    render();
  } else if (evt.type === 'recordingFinished') {
    await importNative(evt);
  } else if (evt.type === 'recordingDiscarded') {
    if (state.recording?.id === evt.id) { state.recording = null; hideRecorder(); }
    if (getMeeting(evt.id)) { await meetings.remove(evt.id); state.meetings = state.meetings.filter((x) => x.id !== evt.id); }
    render();
  } else if (evt.type === 'recordingFailed') {
    if (state.recording?.id === evt.id) { state.recording = null; hideRecorder(); }
    const m = getMeeting(evt.id);
    if (m) { m.status = 'error'; m.error = evt.error || 'Opname mislukt'; await saveMeeting(m, { sync: false }); }
    toast(evt.error || 'Opname mislukt');
    render();
  } else if (evt.type === 'libraryChanged') {
    importFromLibrary();
  } else if (evt.type === 'calendarChanged') {
    loadCalendar();
  } else if (evt.type === 'settingsChanged') {
    state.nativeInfo = await native.call('hello', { version: VERSION }).catch(() => state.nativeInfo);
    render();
  } else if (evt.type === 'navigate' && evt.hash) {
    go(evt.hash);
  }
}

async function importNative(info) {
  let m = getMeeting(info.id);
  if (!m) {
    const event = info.trigger && info.calendar ? normalizeEvents([info.calendar])[0] : null;
    m = newMeeting(event, { id: info.id, source: info.trigger ? 'mac-auto' : 'mac', startedAt: info.startedAt || new Date().toISOString() });
    if (info.title && !event && info.title !== info.calendar?.title) m.title = info.title;
  }
  if (!(m.parts?.[0]?.size)) {
    const blob = await native.readRecording(info.id, info.size, info.mime || 'audio/mp4');
    await audio.put(m.id, 0, blob);
    m.parts = [{ mime: blob.type, duration: info.duration, size: blob.size, channels: info.channels || 1 }];
    m.duration = info.duration;
  }
  if (m.status === 'recording') m.status = 'saved';
  await saveMeeting(m, { sync: false });
  await native.call('ack', { id: info.id }).catch(() => {});
  if (state.recording?.id === info.id) { state.recording = null; hideRecorder(); }
  if (route().name === 'detail' && route().id === m.id) render();
  else if (!info.trigger) go(`#/m/${m.id}`);
  else render();
  maybeTranscribe(m.id);
}

// ---------- transcription ----------

function maybeTranscribe(id) {
  const m = getMeeting(id);
  if (!m || m.status !== 'saved' || !state.settings.autoTranscribe) return;
  if (!state.settings.keys[state.settings.provider]) return;
  transcribeMeeting(id);
}

async function transcribeMeeting(id) {
  if (state.jobs.has(id)) return;
  const m = getMeeting(id);
  if (!m) return;
  const key = state.settings.keys[state.settings.provider];
  if (!key) { toast('Vul eerst je API-sleutel in.', [['Instellingen', () => go('#/instellingen')]]); return; }
  if (!navigator.onLine) { m.error = 'Wacht op internet. Transcriberen start vanzelf zodra je online bent.'; await saveMeeting(m, { sync: false }); render(); return; }
  const parts = Math.max(1, m.parts?.length || 0);
  state.jobs.set(id, { progress: 0, phase: 'Versturen' });
  m.status = 'transcribing';
  m.error = '';
  await saveMeeting(m, { sync: false });
  renderJob(id);
  try {
    const all = [];
    let offset = 0;
    let language = '';
    for (let p = 0; p < parts; p++) {
      const blob = await audio.get(id, p);
      if (!blob) throw Object.assign(new Error('De audio van deze opname is niet meer op dit apparaat.'), { retry: false });
      const guests = (m.people || []).length;
      const res = await transcribe(blob, {
        provider: state.settings.provider,
        key,
        language: state.settings.language,
        speakers: guests ? guests + 2 : 0,
        onProgress: (f) => {
          state.jobs.set(id, { progress: (p + f * 0.6) / parts, phase: f < 1 ? 'Versturen' : 'Uitschrijven' });
          renderJob(id);
        },
      });
      all.push(...shiftPart(res.segments, offset, p));
      offset += m.parts?.[p]?.duration || res.segments.at(-1)?.end || 0;
      language = language || res.language;
    }
    const fresh = getMeeting(id) || m;
    fresh.segments = all;
    fresh.language = language;
    fresh.status = 'done';
    fresh.error = '';
    fresh.provider = state.settings.provider;
    fresh.transcribedAt = new Date().toISOString();
    fresh.duration = Math.max(fresh.duration || 0, all.at(-1)?.end || 0);
    fresh.speakers = fresh.speakers || {};
    const keys = speakerKeys(all);
    if (keys.length === 1 && !fresh.speakers[keys[0]] && state.settings.myName && !(fresh.people || []).length) {
      fresh.speakers[keys[0]] = { name: state.settings.myName, me: true };
    }
    await saveMeeting(fresh);
    if (state.settings.keepAudio === 'never') await dropAudio(fresh);
    state.jobs.delete(id);
    if (native.isNative && !document.hasFocus()) native.call('notify', { title: 'Transcript klaar', body: fresh.title }).catch(() => {});
    if (route().name === 'detail' && route().id === id) toast('Transcript klaar'); else toast(`Klaar: ${fresh.title}`, [['Bekijk', () => go(`#/m/${encodeURIComponent(id)}`)]]);
  } catch (e) {
    state.jobs.delete(id);
    const fresh = getMeeting(id) || m;
    fresh.status = e.retry === false ? 'error' : 'saved';
    fresh.error = e.message || String(e);
    await saveMeeting(fresh, { sync: false });
  }
  render();
}

function renderJob(id) {
  const job = state.jobs.get(id);
  document.querySelectorAll(`[data-job="${id}"]`).forEach((el) => {
    const bar = el.querySelector('i');
    if (bar) bar.style.transform = `scaleX(${Math.min(1, job?.progress || 0)})`;
    const label = el.querySelector('span');
    if (label) label.textContent = job ? `${job.phase}… ${job.phase === 'Versturen' ? `${Math.round(job.progress * 100)}%` : ''}` : '';
  });
}

async function dropAudio(m) {
  for (let p = 0; p < Math.max(1, m.parts?.length || 0); p++) await audio.del(m.id, p);
  m.audioDeleted = true;
  await saveMeeting(m, { sync: false });
}

// ---------- copy, share ----------

// text may be a promise: Safari only allows clipboard writes during the tap, so
// the content is handed over as a promise that resolves later.
async function copyText(text) {
  try {
    if (typeof text !== 'string' && window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': Promise.resolve(text).then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return;
    }
    await navigator.clipboard.writeText(await text);
  } catch (e) {
    text = await text;
    if (native.isNative) await native.call('copy', { text });
    else {
      const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' });
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) throw e;
    }
  }
}

function openExternal(url) {
  if (native.isNative) native.call('openURL', { url }).catch(() => window.open(url, '_blank', 'noopener'));
  else window.open(url, '_blank', 'noopener');
}

async function copyForAI(m, { prompt = '', timestamps = state.settings.timestamps } = {}) {
  if (!m.segments?.length) { toast('Er is nog geen transcript om te kopiëren.'); return; }
  try {
    await copyText(llmText(m, { timestamps, prompt }));
    toast('Gekopieerd. Plak het in je AI-chat.', [['Open Claude', () => openExternal('https://claude.ai/new')], ['ChatGPT', () => openExternal('https://chatgpt.com/')]]);
  } catch {
    toast('Kopiëren lukte niet. Probeer het nog eens.');
  }
}

function promptSheet(m) {
  const close = sheet('Kopieer met opdracht',
    h('p', { class: 'muted' }, 'Kies wat de AI met het gesprek moet doen. De opdracht en het transcript gaan samen naar je klembord.'),
    h('div', { class: 'stack' }, PROMPTS.map((p) => h('button', { type: 'button', class: 'choice', onclick: () => { close(); copyForAI(m, { prompt: p.text }); } },
      h('strong', null, p.label), h('span', null, p.text)))),
    h('div', { class: 'row gap' },
      btn('Alleen transcript', () => { close(); copyForAI(m); }, { cls: 'btn', ic: 'copy' }),
      btn(state.settings.timestamps ? 'Zonder tijden' : 'Met tijden', () => { close(); copyForAI(m, { timestamps: !state.settings.timestamps }); }, { cls: 'btn' })));
}

async function shareLink(m, pending) {
  const code = await (pending || encodeShare(m));
  if (code.length > MAX_LINK) {
    toast('Dit gesprek is te lang voor een link. Deel het bestand.', [['Deel bestand', () => shareMeeting(m).catch(() => {})]]);
    return;
  }
  const url = `${location.origin}${location.pathname}#gedeeld=${code}`;
  try {
    if (navigator.share && !native.isNative) await navigator.share({ title: m.title, url });
    else { await copyText(url); toast('Link gekopieerd. Wie hem opent, ziet het transcript (alleen lezen).'); }
  } catch { /* cancelled */ }
}

function moreSheet(m) {
  const hasAudio = m.parts?.some((p) => p?.size) && !m.audioDeleted;
  const linkCode = m.segments?.length ? encodeShare(m) : null; // ready before the tap
  const close = sheet('Meer',
    h('div', { class: 'stack' },
      m.segments?.length ? btn('Deel als link (alleen lezen)', () => { close(); shareLink(m, linkCode); }, { cls: 'menu-item', ic: 'link' }) : null,
      m.segments?.length ? btn('Deel als tekst', () => { close(); shareMeeting(m, { asText: true }).catch(() => {}); }, { cls: 'menu-item', ic: 'share' }) : null,
      m.calendar
        ? btn('Ontkoppel van de agenda', () => { close(); unlinkEvent(m); }, { cls: 'menu-item', ic: 'cal' })
        : btn('Koppel aan een afspraak', () => { close(); eventSheet(m); }, { cls: 'menu-item', ic: 'cal' }),
      btn('Download Markdown (.md)', () => { close(); download(markdownFile(m)); }, { cls: 'menu-item', ic: 'download' }),
      hasAudio ? btn('Download audio', async () => { close(); for (let p = 0; p < m.parts.length; p++) { const b = await audio.get(m.id, p); if (b) download(new File([b], `${fileNameFor(m).replace(/\.md$/, '')}${m.parts.length > 1 ? ` deel ${p + 1}` : ''}.${extFor(b.type)}`, { type: b.type })); } }, { cls: 'menu-item', ic: 'download' }) : null,
      native.isNative && m.file ? btn('Toon in Finder', () => { close(); native.call('revealFile', { name: m.file }); }, { cls: 'menu-item', ic: 'folder' }) : null,
      hasAudio && m.segments?.length ? btn('Opnieuw transcriberen', () => { close(); confirmSheet('Opnieuw transcriberen?', 'Het huidige transcript en de namen van sprekers worden vervangen.', 'Transcribeer', () => { m.status = 'saved'; transcribeMeeting(m.id); }, false); }, { cls: 'menu-item', ic: 'refresh' }) : null,
      hasAudio ? btn('Verwijder alleen de audio', () => { close(); confirmSheet('Audio verwijderen?', 'Het transcript blijft. Je kunt daarna niet meer terugluisteren of opnieuw transcriberen.', 'Verwijder audio', async () => { await dropAudio(m); render(); }); }, { cls: 'menu-item', ic: 'trash' }) : null,
      btn('Verwijder opname', () => { close(); confirmSheet('Opname verwijderen?', `"${m.title}" verdwijnt met audio en transcript van dit apparaat${native.isNative && m.file ? ' en uit je Notulist-map' : ''}. Dit kan niet ongedaan worden.`, 'Verwijder', async () => {
        if (native.isNative && m.file) await native.call('deleteFile', { name: m.file }).catch(() => {});
        await meetings.remove(m.id);
        state.meetings = state.meetings.filter((x) => x.id !== m.id);
        go('#/');
      }); }, { cls: 'menu-item danger', ic: 'trash' })));
}

// ---------- audio playback ----------

const player = $('#player');
let playerPart = -1;
let playerMeeting = '';
let stopAt = 0;
let playerUrl = '';

player.addEventListener('loadedmetadata', () => {
  // Chrome does not know the length of a fresh WebM recording; this makes it look.
  if (player.duration === Infinity || Number.isNaN(player.duration)) {
    player.currentTime = 1e101;
    player.addEventListener('timeupdate', () => { player.currentTime = player._seekTo || 0; }, { once: true });
  }
});
player.addEventListener('timeupdate', () => {
  if (stopAt && player.currentTime >= stopAt) { player.pause(); stopAt = 0; }
  highlightPlaying();
});

function partOffsets(m) {
  const out = [0];
  for (let p = 1; p < (m.parts?.length || 0); p++) out[p] = out[p - 1] + (m.parts[p - 1]?.duration || 0);
  return out;
}

async function loadPart(m, p) {
  if (playerMeeting === m.id && playerPart === p) return true;
  const blob = await audio.get(m.id, p);
  if (!blob) return false;
  if (playerUrl) URL.revokeObjectURL(playerUrl);
  playerUrl = URL.createObjectURL(blob);
  player.src = playerUrl;
  playerMeeting = m.id;
  playerPart = p;
  await new Promise((resolve) => { player.addEventListener('loadedmetadata', resolve, { once: true }); player.addEventListener('error', resolve, { once: true }); player.load(); });
  return true;
}

async function playAt(m, t, until = 0) {
  const offsets = partOffsets(m);
  let p = 0;
  for (let i = 0; i < offsets.length; i++) if (t >= offsets[i]) p = i;
  if (!(await loadPart(m, p))) { toast('De audio van deze opname is er niet meer.'); return; }
  const local = Math.max(0, t - offsets[p]);
  player._seekTo = local;
  player.currentTime = local;
  stopAt = until ? until - offsets[p] : 0;
  try { await player.play(); } catch { /* user can press play */ }
  syncMiniPlayer();
}

function highlightPlaying() {
  if (route().name !== 'detail' || playerMeeting !== route().id) return;
  const m = getMeeting(playerMeeting);
  if (!m) return;
  const t = player.currentTime + (partOffsets(m)[playerPart] || 0);
  const idx = m.segments.findIndex((x) => x.start <= t && t < (x.end || x.start + 1));
  document.querySelectorAll('.seg.playing').forEach((el) => el.classList.remove('playing'));
  if (idx >= 0) document.querySelector(`.seg[data-i="${idx}"]`)?.classList.add('playing');
  syncMiniPlayer();
}

function syncMiniPlayer() {
  const el = $('#playbar');
  if (!el) return;
  const m = getMeeting(playerMeeting);
  const t = player.currentTime + (m ? partOffsets(m)[playerPart] || 0 : 0);
  $('#playbar-time').textContent = clock(t);
  $('#playbar-toggle').replaceChildren(icon(player.paused ? 'play' : 'pause'));
}

// ---------- views ----------

function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#gedeeld=')) return { name: 'shared', code: hash.slice(9) };
  const [, a, b] = hash.split('/');
  if (a === 'm' && b) return { name: 'detail', id: decodeURIComponent(b) };
  if (a === 'personen') return { name: 'people' };
  if (a === 'instellingen') return { name: 'settings' };
  return { name: 'list' };
}

function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

function render() {
  const r = route();
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === r.name || (r.name === 'detail' && a.dataset.tab === 'list')));
  if (r.name !== 'detail') state.editing = false;
  let node;
  if (r.name === 'detail') node = detailView(r.id);
  else if (r.name === 'people') node = peopleView();
  else if (r.name === 'settings') node = settingsView();
  else if (r.name === 'shared') node = sharedView(r.code);
  else node = listView();
  view.replaceChildren(node);
}

function statusBadge(m) {
  if (state.jobs.has(m.id)) return h('span', { class: 'badge work', 'data-job': m.id }, h('span', null, 'Bezig…'));
  if (m.status === 'recording') return h('span', { class: 'badge rec' }, 'Neemt op');
  if (m.status === 'error') return h('span', { class: 'badge err' }, 'Fout');
  if (m.status === 'saved') return h('span', { class: 'badge' }, m.error ? 'Wacht' : 'Niet uitgeschreven');
  return null;
}

function meetingMatches(m, q) {
  if (!q) return true;
  const hay = fold([m.title, m.notes, participants(m).join(' '), (m.tags || []).join(' ')].join(' '));
  if (hay.includes(q)) return true;
  return (m.segments || []).some((x) => fold(x.text).includes(q));
}

function snippet(m, q) {
  if (!q) return null;
  const seg = (m.segments || []).find((x) => fold(x.text).includes(q));
  if (!seg) return null;
  const i = fold(seg.text).indexOf(q);
  const from = Math.max(0, i - 50);
  return h('p', { class: 'snippet' }, h('b', null, `${speakerLabel(m, seg.s)}: `), `${from ? '…' : ''}${seg.text.slice(from, i)}`, h('mark', null, seg.text.slice(i, i + q.length)), `${seg.text.slice(i + q.length, i + q.length + 80)}…`);
}

function listView() {
  const q = fold(state.query.trim());
  const person = state.person;
  const items = state.meetings.filter((m) => meetingMatches(m, q) && (!person || participants(m).some((n) => fold(n) === fold(person))));
  const groups = new Map();
  for (const m of items) {
    const label = dayLabel(m.startedAt || m.createdAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(m);
  }
  const key = state.settings.keys[state.settings.provider];
  const upcoming = relevantEvents(state.events).slice(0, 3);
  const importInput = h('input', { type: 'file', accept: 'audio/*,video/*,.m4a,.mp3,.wav,.webm,.ogg,.md,.json', multiple: true, hidden: true, onchange: (e) => importFiles([...e.target.files]) });

  return h('div', { class: 'page' },
    isIOS && !standalone ? h('div', { class: 'tip' }, h('strong', null, 'Tip: '), 'tik op Deel en kies ', h('b', null, 'Zet op beginscherm'), '. Dan werkt Notulist als app en blijven je opnames bewaard.') : null,
    !key ? h('div', { class: 'tip accent' }, h('strong', null, 'Nog één stap: '), 'koppel een transcriptiedienst (2 minuten). Opnemen kan nu al.', ' ', h('a', { href: '#/instellingen' }, 'Instellen')) : null,
    h('section', { class: 'hero' },
      h('button', { class: 'big-rec', type: 'button', onclick: () => startRecording(), 'aria-label': 'Neem op' }, icon('mic', 'ic big')),
      h('div', null,
        h('h2', null, state.recording ? 'Opname loopt' : 'Neem op'),
        h('p', { class: 'muted' }, native.isNative
          ? (state.nativeInfo?.settings?.autoRecord ? 'Meetings op deze Mac worden automatisch opgenomen.' : 'Automatisch opnemen staat uit (zie Instellingen).')
          : 'Tik en praat. Notulist schrijft het uit en herkent wie er praat.'))),
    upcoming.length ? h('section', { class: 'card events' },
      h('h3', { class: 'label' }, icon('cal'), 'In je agenda'),
      upcoming.map((e) => {
        const live = Date.parse(e.start) <= Date.now() && Date.parse(e.end) >= Date.now();
        return h('div', { class: 'event' },
          h('div', null, h('strong', null, e.title), h('span', { class: 'muted small' }, `${timeLabel(e.start)}–${timeLabel(e.end)}${otherAttendees(e).length ? ` · ${otherAttendees(e).map((a) => firstName(a.name)).slice(0, 4).join(', ')}${otherAttendees(e).length > 4 ? ` +${otherAttendees(e).length - 4}` : ''}` : ''}`)),
          btn(live ? 'Neem op' : 'Start', () => startRecording(e), { cls: live ? 'btn primary sm' : 'btn sm', ic: 'mic' }));
      })) : null,
    state.calError ? h('p', { class: 'muted small' }, `Agenda: ${state.calError}`) : null,
    h('div', { class: 'searchbar' }, icon('search'),
      h('input', { type: 'search', placeholder: 'Zoeken in gesprekken', value: state.query, 'aria-label': 'Zoeken', oninput: debounce((e) => { state.query = e.target.value; const pos = e.target.selectionStart; render(); const inp = $('.searchbar input'); inp.focus(); inp.setSelectionRange(pos, pos); }, 200) })),
    person ? h('div', { class: 'chips' }, h('button', { class: 'chip on', type: 'button', onclick: () => { state.person = ''; render(); } }, `Met ${person} ×`)) : null,
    items.length ? [...groups].map(([label, list]) => h('section', { class: 'group' },
      h('h3', { class: 'label' }, label),
      list.map((m) => h('a', { class: 'item', href: `#/m/${encodeURIComponent(m.id)}` },
        h('div', { class: 'item-main' },
          h('strong', null, m.title || 'Opname'),
          h('span', { class: 'muted small' }, [timeLabel(m.startedAt || m.createdAt), m.duration ? duration(m.duration) : '', sourceLabel(m.source)].filter(Boolean).join(' · ')),
          participants(m).length ? h('span', { class: 'who small' }, participants(m).slice(0, 4).join(', ')) : null,
          snippet(m, q)),
        statusBadge(m))))) : h('div', { class: 'empty' },
      h('p', null, state.query || person ? 'Niets gevonden' : 'Nog geen opnames'),
      !state.query && !person ? h('p', { class: 'muted' }, 'Tik op de knop hierboven om te beginnen, of importeer een audiobestand (bijvoorbeeld een Dictafoon-memo).') : null),
    h('div', { class: 'row gap center foot' }, importInput, btn('Importeer audio of bestand', () => importInput.click(), { cls: 'btn ghost', ic: 'upload' })));
}

function sourceLabel(s) {
  return { iphone: 'iPhone', mac: 'Mac', 'mac-auto': 'Mac · automatisch', web: 'Browser', import: 'Geïmporteerd', gedeeld: 'Gedeeld', map: 'Uit map' }[s] || '';
}

function speakerColor(m, key) {
  const i = speakerKeys(m.segments).indexOf(key);
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
}

function detailView(id) {
  const m = getMeeting(id);
  if (!m) return h('div', { class: 'page' }, h('a', { class: 'back', href: '#/' }, icon('back'), 'Opnames'), h('p', null, 'Deze opname bestaat niet meer'));
  const hasAudio = m.parts?.some((p) => p?.size) && !m.audioDeleted;
  const keys = speakerKeys(m.segments || []);
  const talk = talkTime(m.segments || []);
  const total = Object.values(talk).reduce((a, b) => a + b, 0) || 1;
  const job = state.jobs.get(m.id);
  const providerKey = state.settings.keys[state.settings.provider];

  const statusBox = (() => {
    if (job) return h('div', { class: 'card status' }, h('div', { class: 'progress', 'data-job': m.id }, h('span', null, `${job.phase}…`), h('b', null, h('i', { style: `transform:scaleX(${Math.min(1, job.progress)})` }))), h('p', { class: 'muted small' }, 'Je kunt de app gewoon blijven gebruiken. Een uur gesprek duurt meestal 1 tot 2 minuten.'));
    if (m.status === 'recording') return h('div', { class: 'card status' }, h('p', null, 'Deze opname loopt nog.'), btn('Toon opname', showRecorder, { cls: 'btn primary', ic: 'mic' }));
    if (m.status === 'error') return h('div', { class: 'card status err' }, h('p', null, m.error || 'Er ging iets mis.'), hasAudio ? h('div', { class: 'row gap' }, btn('Opnieuw proberen', () => transcribeMeeting(m.id), { cls: 'btn primary', ic: 'refresh' }), btn('Instellingen', () => go('#/instellingen'), { cls: 'btn' })) : null);
    if (m.status === 'saved') return h('div', { class: 'card status' },
      h('p', null, m.error || (providerKey ? 'Nog niet uitgeschreven.' : 'Koppel een transcriptiedienst om deze opname uit te schrijven.')),
      providerKey ? btn('Transcribeer', () => transcribeMeeting(m.id), { cls: 'btn primary', ic: 'spark' }) : btn('Instellen', () => go('#/instellingen'), { cls: 'btn primary', ic: 'gear' }));
    return null;
  })();

  const titleInput = h('input', { class: 'title-input', value: m.title || '', 'aria-label': 'Titel', onchange: async (e) => { m.title = e.target.value.trim() || 'Opname'; await saveMeeting(m); } });
  const notes = h('textarea', { class: 'notes', placeholder: 'Je eigen notities bij dit gesprek', value: m.notes || '', oninput: debounce(async (e) => { m.notes = e.target.value; await saveMeeting(m); }, 500) });

  const markedSegs = new Set((m.markers || []).map((t) => (m.segments || []).reduce((best, x, i) => (x.start <= t + 0.5 ? i : best), 0)));
  const segList = h('div', { class: `segments${state.editing ? ' editing' : ''}` }, (m.segments || []).map((x, i) => {
    const color = speakerColor(m, x.s);
    const marked = markedSegs.has(i);
    return h('div', { class: `seg${marked ? ' marked' : ''}`, 'data-i': i },
      h('div', { class: 'seg-meta' },
        h('button', { type: 'button', class: 'ts', onclick: () => hasAudio ? playAt(m, x.start) : null, title: hasAudio ? 'Speel af vanaf hier' : null, disabled: !hasAudio }, clock(x.start)),
        h('button', { type: 'button', class: 'who-btn', style: `--mark:${color}`, onclick: () => segmentSpeakerSheet(m, i) }, speakerLabel(m, x.s)),
        marked ? icon('star', 'ic tiny gold') : null),
      h('p', {
        class: 'seg-text',
        contentEditable: state.editing ? 'true' : 'false',
        spellcheck: state.editing,
        onblur: async (e) => {
          if (!state.editing) return;
          const text = e.target.textContent.replace(/\s+/g, ' ').trim();
          if (text !== x.text) { if (text) x.text = text; else m.segments.splice(i, 1); await saveMeeting(m); if (!text) render(); }
        },
      }, x.text));
  }));

  return h('div', { class: 'page detail' },
    h('div', { class: 'detail-top' }, h('a', { class: 'back', href: '#/' }, icon('back'), 'Opnames'), btn('', () => moreSheet(m), { cls: 'icon-btn', ic: 'more', title: 'Meer' })),
    titleInput,
    h('p', { class: 'muted small' }, [longDate(m.startedAt || m.createdAt), m.duration ? duration(m.duration) : '', sourceLabel(m.source)].filter(Boolean).join(' · ')),
    agendaBox(m),
    statusBox,
    m.segments?.length ? h('div', { class: 'actions' },
      btn('Kopieer voor AI', () => copyForAI(m), { cls: 'btn primary', ic: 'copy' }),
      btn('Met opdracht', () => promptSheet(m), { cls: 'btn', ic: 'spark' }),
      btn('Deel', () => shareMeeting(m).catch(() => {}), { cls: 'btn', ic: 'share' })) : null,
    keys.length ? h('section', { class: 'card' },
      h('h3', { class: 'label' }, icon('people'), 'Wie is wie', h('span', { class: 'muted small' }, keys.some((k) => !m.speakers?.[k]?.name) ? ' · tik om een naam te geven' : '')),
      h('div', { class: 'speakers' }, keys.map((k) => h('button', { type: 'button', class: `speaker${m.speakers?.[k]?.name ? '' : ' unnamed'}`, onclick: () => speakerSheet(m, k) },
        h('i', { style: `background:${speakerColor(m, k)}` }),
        h('span', null, speakerLabel(m, k)),
        h('small', null, `${Math.round((talk[k] || 0) / total * 100)}%`))))) : null,
    h('section', { class: 'card' }, h('h3', { class: 'label' }, icon('edit'), 'Notities'), notes),
    m.segments?.length ? h('section', { class: 'card transcript' },
      h('div', { class: 'row between' }, h('h3', { class: 'label' }, 'Transcript'),
        btn(state.editing ? 'Klaar' : 'Bewerk tekst', () => { state.editing = !state.editing; render(); }, { cls: 'link-btn' })),
      segList) : null,
    hasAudio ? h('div', { class: 'playbar', id: 'playbar' },
      h('button', { type: 'button', id: 'playbar-toggle', class: 'icon-btn', 'aria-label': 'Afspelen of pauzeren', onclick: async () => { if (playerMeeting !== m.id) await playAt(m, 0); else if (player.paused) player.play(); else player.pause(); syncMiniPlayer(); } }, icon('play')),
      h('span', { id: 'playbar-time', class: 'mono' }, '00:00'),
      h('span', { class: 'muted small' }, `/ ${clock(m.duration)}`),
      h('button', { type: 'button', class: 'chip', onclick: (e) => { const rates = [1, 1.25, 1.5, 2]; player.playbackRate = rates[(rates.indexOf(player.playbackRate) + 1) % rates.length]; e.target.textContent = `${player.playbackRate}×`; } }, `${player.playbackRate}×`),
      h('button', { type: 'button', class: 'chip', onclick: () => { player.currentTime = Math.max(0, player.currentTime - 15); } }, '−15s')) : null);
}

// ---------- linking a recording to an appointment ----------

const isDefaultTitle = (t) => !t || /^(Opname|[\w.-]+-meeting) \d/.test(t);

function eventLine(e) {
  const guests = otherAttendees(e).map((a) => firstName(a.name)).filter(Boolean);
  return [`${timeLabel(e.start)}–${timeLabel(e.end)}`, guests.length ? `met ${guests.slice(0, 4).join(', ')}${guests.length > 4 ? ` +${guests.length - 4}` : ''}` : ''].filter(Boolean).join(' · ');
}

async function linkEvent(m, e) {
  if (isDefaultTitle(m.title) || (m.calendar && m.title === m.calendar.title)) m.title = e.title;
  m.calendar = { id: e.id, title: e.title, start: e.start, end: e.end };
  m.people = otherAttendees(e).map(({ name, email }) => ({ name, email }));
  m.calendarDismissed = false;
  await saveMeeting(m);
  render();
  toast(`Gekoppeld aan ${e.title}`);
}

async function unlinkEvent(m) {
  if (m.calendar && m.title === m.calendar.title) m.title = defaultTitle(new Date(m.startedAt || m.createdAt));
  m.calendar = null;
  m.people = [];
  m.calendarDismissed = true;
  await saveMeeting(m);
  render();
  toast('Losgekoppeld van de agenda. Geef het gesprek hierboven een eigen titel.');
}

async function keepOwnTitle(m) {
  m.calendarDismissed = true;
  await saveMeeting(m, { sync: false });
  render();
  const input = $('.title-input');
  if (input) { input.focus(); input.select(); }
}

// Linked: show it, with change and unlink. Not linked yet: ask once, after the recording.
function agendaBox(m) {
  if (m.calendar) {
    const guests = (m.people || []).map((p) => p.name).filter(Boolean);
    const when = m.calendar.start ? `${timeLabel(m.calendar.start)}–${timeLabel(m.calendar.end)}` : '';
    return h('section', { class: 'card agenda' },
      h('div', { class: 'agenda-row' }, icon('cal'),
        h('div', { class: 'agenda-main' },
          h('span', { class: 'muted small' }, 'Gekoppeld aan afspraak'),
          h('strong', null, m.calendar.title),
          h('span', { class: 'muted small' }, [when, guests.length ? `met ${guests.join(', ')}` : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'agenda-actions' },
          btn('Wijzig', () => eventSheet(m), { cls: 'btn sm' }),
          btn('Ontkoppel', () => unlinkEvent(m), { cls: 'btn sm' }))));
  }
  if (m.calendarDismissed || m.status === 'recording') return null;
  const options = eventsAround(state.events, m.startedAt || m.createdAt, m.duration);
  if (!options.length) return null;
  return h('section', { class: 'card agenda' },
    h('h3', { class: 'label' }, icon('cal'), 'Hoort deze opname bij een afspraak?'),
    h('div', { class: 'stack' }, options.slice(0, 3).map((e) => h('button', { type: 'button', class: 'choice', onclick: () => linkEvent(m, e) },
      h('strong', null, e.title), h('span', null, eventLine(e))))),
    h('div', { class: 'row gap wrap' },
      btn('Nee, eigen titel', () => keepOwnTitle(m), { cls: 'btn sm' }),
      eventsOnDay(state.events, m.startedAt || m.createdAt).length > Math.min(3, options.length) ? btn('Andere afspraak', () => eventSheet(m), { cls: 'link-btn' }) : null));
}

function eventSheet(m) {
  const at = m.startedAt || m.createdAt;
  const near = eventsAround(state.events, at, m.duration, 120);
  const day = eventsOnDay(state.events, at).filter((e) => !near.includes(e));
  const list = [...near, ...day];
  const close = sheet(`Afspraken op ${dayLabel(at).toLowerCase()}`,
    list.length
      ? h('div', { class: 'stack' }, list.map((e) => h('button', { type: 'button', class: `choice${m.calendar?.id === e.id ? ' on' : ''}`, onclick: () => { close(); linkEvent(m, e); } },
        h('strong', null, e.title), h('span', null, eventLine(e)))))
      : h('p', { class: 'muted' }, state.calError ? `Je agenda is niet bereikbaar: ${state.calError}` : 'Geen afspraken gevonden op deze dag. Notulist kijkt in je agenda van gisteren tot volgende week.'),
    h('div', { class: 'row gap wrap' },
      m.calendar ? btn('Ontkoppel', () => { close(); unlinkEvent(m); }, { cls: 'btn' }) : null,
      btn('Geen afspraak, eigen titel', () => { close(); m.calendar ? unlinkEvent(m) : keepOwnTitle(m); }, { cls: 'btn' })));
}

function nameSuggestions(m, exclude = '') {
  const used = new Set(Object.values(m.speakers || {}).map((s) => fold(s.name)));
  const out = [];
  const add = (name, extra = {}) => {
    const n = String(name || '').trim();
    if (!n || fold(n) === fold(exclude) || out.some((x) => fold(x.name) === fold(n))) return;
    out.push({ name: n, used: used.has(fold(n)), ...extra });
  };
  add(state.settings.myName || 'Ik', { me: true });
  for (const p of m.people || []) add(p.name, { email: p.email });
  const recent = new Map();
  for (const mm of state.meetings.slice(0, 40)) for (const s of Object.values(mm.speakers || {})) if (s.name) recent.set(fold(s.name), s.name);
  for (const name of recent.values()) add(name);
  for (const p of state.people) add(p.name, { email: p.email });
  return out.slice(0, 14);
}

async function nameSpeaker(m, key, name, extra = {}) {
  const n = String(name || '').trim();
  if (!n) return;
  // Same name as another speaker: that is one person, so merge.
  const other = Object.entries(m.speakers || {}).find(([k, s]) => k !== key && fold(s.name) === fold(n));
  m.speakers = m.speakers || {};
  if (other) {
    mergeSpeaker(m, key, other[0]);
    toast(`Samengevoegd met ${n}`);
  } else {
    m.speakers[key] = { name: n, ...(extra.email ? { email: extra.email } : {}), ...(extra.me ? { me: true } : {}) };
  }
  if (!extra.me) await rememberPerson(n, extra.email || '');
  await saveMeeting(m);
  render();
}

function speakerSheet(m, key) {
  const hasAudio = m.parts?.some((p) => p?.size) && !m.audioDeleted;
  const clips = samples(m.segments, key, 3);
  const input = h('input', { type: 'text', placeholder: 'Typ een naam', list: 'people-list', autocomplete: 'off', value: m.speakers?.[key]?.name || '' });
  const list = h('datalist', { id: 'people-list' }, state.people.map((p) => h('option', { value: p.name })));
  const others = speakerKeys(m.segments).filter((k) => k !== key);
  const close = sheet(`Wie is ${speakerLabel(m, key)}?`,
    h('div', { class: 'stack' }, clips.map((c) => h('button', { type: 'button', class: 'clip', disabled: !hasAudio, onclick: () => playAt(m, c.start, Math.min(c.end, c.start + 8)) },
      hasAudio ? icon('play') : null, h('span', { class: 'mono small' }, clock(c.start)), h('span', null, `“${c.text.length > 140 ? `${c.text.slice(0, 140)}…` : c.text}”`)))),
    h('h3', { class: 'label' }, 'Kies'),
    h('div', { class: 'chips' }, nameSuggestions(m, m.speakers?.[key]?.name).map((s) => h('button', { type: 'button', class: `chip${s.used ? ' used' : ''}`, onclick: () => { close(); nameSpeaker(m, key, s.name, s); } }, s.me ? `${s.name} (ik)` : s.name))),
    h('form', { class: 'row gap', onsubmit: (e) => { e.preventDefault(); close(); nameSpeaker(m, key, input.value); } }, input, list, h('button', { class: 'btn primary', type: 'submit' }, 'Bewaar')),
    others.length ? h('div', null, h('h3', { class: 'label' }, 'Of samenvoegen met'), h('div', { class: 'chips' }, others.map((k) => h('button', { type: 'button', class: 'chip', onclick: async () => { close(); mergeSpeaker(m, key, k); await saveMeeting(m); render(); toast(`Samengevoegd met ${speakerLabel(m, k)}`); } }, h('i', { class: 'dot', style: `background:${speakerColor(m, k)}` }), speakerLabel(m, k))))) : null);
}

function segmentSpeakerSheet(m, i) {
  const seg = m.segments[i];
  const keys = speakerKeys(m.segments);
  const close = sheet('Wie zegt dit?',
    h('p', { class: 'quote' }, `“${seg.text.length > 200 ? `${seg.text.slice(0, 200)}…` : seg.text}”`),
    h('div', { class: 'chips' },
      keys.map((k) => h('button', { type: 'button', class: `chip${k === seg.s ? ' on' : ''}`, onclick: async () => { close(); seg.s = k; await saveMeeting(m); render(); } }, h('i', { class: 'dot', style: `background:${speakerColor(m, k)}` }), speakerLabel(m, k))),
      h('button', { type: 'button', class: 'chip', onclick: async () => { close(); let n = keys.length; while (keys.includes(`extra_${n}`)) n++; seg.s = `extra_${n}`; await saveMeeting(m); render(); speakerSheet(m, seg.s); } }, '+ Nieuwe spreker')),
    btn('Naam van deze spreker wijzigen', () => { close(); speakerSheet(m, seg.s); }, { cls: 'btn' }));
}

function peopleView() {
  const counts = new Map();
  for (const m of state.meetings) for (const n of participants(m)) {
    const k = fold(n);
    const c = counts.get(k) || { name: n, n: 0, last: '' };
    c.n++;
    const d = m.startedAt || m.createdAt;
    if (d > c.last) c.last = d;
    counts.set(k, c);
  }
  for (const p of state.people) if (!counts.has(fold(p.name))) counts.set(fold(p.name), { name: p.name, n: 0, last: '' });
  const rows = [...counts.values()].sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
  return h('div', { class: 'page' },
    h('h2', { class: 'page-title' }, 'Personen'),
    h('p', { class: 'muted' }, 'Iedereen die je een naam gaf in een gesprek of die in je agenda stond. Tik om hun gesprekken te zien.'),
    rows.length ? h('div', { class: 'card list' }, rows.map((p) => h('div', { class: 'person' },
      h('button', { type: 'button', class: 'person-main', onclick: () => { state.person = p.name; state.query = ''; go('#/'); } },
        h('span', { class: 'avatar' }, p.name.charAt(0).toUpperCase()),
        h('span', null, h('strong', null, p.name), h('span', { class: 'muted small' }, p.n ? `${p.n} ${p.n === 1 ? 'gesprek' : 'gesprekken'} · laatst ${dayLabel(p.last).toLowerCase()}` : 'nog geen gesprekken'))),
      btn('', () => renamePersonSheet(p.name), { cls: 'icon-btn', ic: 'edit', title: `Wijzig ${p.name}` })))) : h('div', { class: 'empty' }, h('p', { class: 'muted' }, 'Nog niemand. Geef sprekers een naam in een gesprek.')));
}

function renamePersonSheet(name) {
  const input = h('input', { type: 'text', value: name });
  const close = sheet(`Wijzig ${name}`,
    h('p', { class: 'muted' }, 'De nieuwe naam komt in al je gesprekken. Kies je een naam die al bestaat, dan worden ze samengevoegd.'),
    h('form', { class: 'row gap', onsubmit: async (e) => { e.preventDefault(); close(); await renamePerson(name, input.value); } }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Bewaar')),
    btn('Verwijder uit de lijst', async () => { close(); const p = state.people.find((x) => fold(x.name) === fold(name)); if (p) { await db.del('people', p.id); state.people = state.people.filter((x) => x !== p); } render(); }, { cls: 'btn ghost', ic: 'trash' }));
}

async function renamePerson(from, to) {
  const n = to.trim();
  if (!n || n === from) return;
  for (const m of state.meetings) {
    let changed = false;
    for (const [k, s] of Object.entries(m.speakers || {})) {
      if (fold(s.name) === fold(from)) { s.name = n; changed = true; }
      const dup = Object.entries(m.speakers).find(([k2, s2]) => k2 !== k && fold(s2.name) === fold(n));
      if (changed && dup) mergeSpeaker(m, k, dup[0]);
    }
    for (const p of m.people || []) if (fold(p.name) === fold(from)) { p.name = n; changed = true; }
    if (changed) await saveMeeting(m);
  }
  const p = state.people.find((x) => fold(x.name) === fold(from));
  if (p) {
    const target = state.people.find((x) => x !== p && fold(x.name) === fold(n));
    if (target) { await db.del('people', p.id); state.people = state.people.filter((x) => x !== p); } else { p.name = n; await db.put('people', p); }
  }
  toast(`${from} heet nu ${n}`);
  render();
}

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

function settingsView() {
  const s = state.settings;
  const save = async () => { await saveSettings(); };
  const keyInput = h('input', { type: 'password', autocomplete: 'off', spellcheck: false, placeholder: PROVIDERS[s.provider].keyHint, value: s.keys[s.provider] || '', onchange: async (e) => { s.keys[s.provider] = e.target.value.trim(); await save(); toast('Sleutel bewaard op dit apparaat'); state.meetings.filter((m) => m.status === 'saved').forEach((m) => maybeTranscribe(m.id)); } });
  const nat = state.nativeInfo?.settings;

  const sections = [
    h('section', { class: 'card' },
      h('h3', { class: 'label' }, icon('spark'), 'Transcriptie'),
      h('div', { class: 'stack' }, Object.entries(PROVIDERS).map(([id, p]) => h('label', { class: `choice radio${s.provider === id ? ' on' : ''}` },
        h('input', { type: 'radio', name: 'provider', checked: s.provider === id, onchange: async () => { s.provider = id; await save(); render(); } }),
        h('strong', null, p.name, id === 'elevenlabs' ? h('span', { class: 'rec-tag' }, ' · aanbevolen') : null), h('span', null, p.note)))),
      field('API-sleutel', h('div', { class: 'row gap' }, keyInput, btn('', () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; }, { cls: 'icon-btn', ic: 'eye', title: 'Toon of verberg' })),
        h('span', null, 'Alleen op dit apparaat bewaard. ', h('a', { href: PROVIDERS[s.provider].keyUrl, target: '_blank', rel: 'noopener' }, 'Maak een sleutel'), s.provider === 'elevenlabs' ? ' (alleen het recht Speech to Text is nodig).' : '.')),
      field('Taal van gesprekken', h('select', { onchange: async (e) => { s.language = e.target.value; await save(); } }, LANGUAGES.map(([v, l]) => h('option', { value: v, selected: s.language === v }, l)))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.autoTranscribe, onchange: async (e) => { s.autoTranscribe = e.target.checked; await save(); } }), 'Direct uitschrijven na een opname')),

    h('section', { class: 'card' },
      h('h3', { class: 'label' }, icon('people'), 'Jij'),
      field('Je naam', h('input', { type: 'text', value: s.myName, placeholder: 'Bijvoorbeeld Olaf', onchange: async (e) => { s.myName = e.target.value.trim(); await save(); } }), 'Zo heet jij in transcripten. Een dictaat met één spreker krijgt automatisch jouw naam.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.timestamps, onchange: async (e) => { s.timestamps = e.target.checked; await save(); } }), 'Tijden meekopiëren voor AI ([12:30] Naam: …)')),

    native.isNative ? macSection(nat) : calendarSection(s),

    h('section', { class: 'card' },
      h('h3', { class: 'label' }, icon('folder'), 'Claude-koppeling (MCP)'),
      h('p', { class: 'muted' }, 'Met de Notulist MCP-server kan Claude op je Mac al je transcripten doorzoeken en lezen: "Wat heb ik met Jan afgesproken?" of "Vat de meeting van vanochtend samen".'),
      h('ol', { class: 'steps' },
        h('li', null, native.isNative ? 'Je Mac-app bewaart elk transcript als Markdown in je Notulist-map.' : 'Op iPhone: Deel een transcript, kies Bewaar in Bestanden en zet het in iCloud Drive > Notulist. De Mac-app doet dit automatisch.'),
        h('li', null, 'Installeer de koppeling met een dubbelklik op Notulist.mcpb (zie de handleiding), of in Claude Code: ', h('code', null, 'claude mcp add notulist -- node …/notulist-mcp/server.js')),
        h('li', null, 'Vraag Claude: "Zoek in mijn Notulist naar …".'))),

    h('section', { class: 'card' },
      h('h3', { class: 'label' }, icon('lock'), 'Opslag en privacy'),
      h('p', { class: 'muted', id: 'storage-line' }, 'Opslag berekenen…'),
      field('Audio bewaren', h('select', { onchange: async (e) => { s.keepAudio = e.target.value; await save(); await applyRetention(); } },
        [['always', 'Altijd (terugluisteren blijft kan)'], ['30', '30 dagen, daarna alleen tekst'], ['never', 'Niet: wis audio na het uitschrijven']].map(([v, l]) => h('option', { value: v, selected: s.keepAudio === v }, l)))),
      h('ul', { class: 'privacy' },
        h('li', null, 'Opnames, transcripten, namen en sleutels staan alleen op dit apparaat.'),
        h('li', null, `Bij uitschrijven gaat de audio rechtstreeks naar ${PROVIDERS[s.provider].name}, met jouw sleutel. Er zit geen server van Notulist tussen.`),
        h('li', null, 'Een deellink bevat het transcript zelf, achter het #-teken. Dat deel stuurt een browser nooit naar een website.')),
      h('div', { class: 'row gap wrap' },
        btn('Back-up maken', exportBackup, { cls: 'btn', ic: 'download' }),
        btn('Back-up terugzetten', () => { const i = h('input', { type: 'file', accept: '.json,application/json', onchange: (e) => importFiles([...e.target.files]) }); i.click(); }, { cls: 'btn', ic: 'upload' }))),

    h('p', { class: 'muted small center' }, `Notulist ${VERSION}${native.isNative && state.nativeInfo?.version ? ` · Mac-app ${state.nativeInfo.version}` : ''} · NinA AI`),
  ];
  setTimeout(updateStorageLine, 0);
  return h('div', { class: 'page' }, h('h2', { class: 'page-title' }, 'Instellingen'), ...sections);
}

function calendarSection(s) {
  const code = appsScriptCode(s.calKey);
  const urlInput = h('input', { type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', value: s.calUrl });
  return h('section', { class: 'card' },
    h('h3', { class: 'label' }, icon('cal'), 'Agenda koppelen'),
    h('p', { class: 'muted' }, 'Dan krijgt een opname vanzelf de titel en deelnemers van je afspraak, en kun je ze met één tik als spreker kiezen. Op de Mac doet de Mac-app dit zonder instellen.'),
    h('ol', { class: 'steps' },
      h('li', null, btn('Kopieer het script', async () => { await copyText(code); toast('Script gekopieerd'); }, { cls: 'btn sm', ic: 'copy' }), ' Er zit een geheime sleutel in die alleen jij hebt.'),
      h('li', null, 'Open ', h('a', { href: 'https://script.google.com/home/projects/create', target: '_blank', rel: 'noopener' }, 'script.google.com'), ', vervang alles door het script en bewaar.'),
      h('li', null, 'Implementeren > Nieuwe implementatie > type Web-app. Uitvoeren als ', h('b', null, 'Ikzelf'), ', toegang ', h('b', null, 'Iedereen'), '. Geef toegang tot je agenda.'),
      h('li', null, 'Plak de web-app-URL hieronder.')),
    h('form', { class: 'row gap', onsubmit: async (e) => {
      e.preventDefault();
      s.calUrl = urlInput.value.trim();
      await saveSettings();
      await loadCalendar();
      toast(state.calError ? `Agenda: ${state.calError}` : `Agenda gekoppeld: ${state.events.length} afspraken deze week`);
      render();
    } }, urlInput, h('button', { class: 'btn primary', type: 'submit' }, 'Verbind')),
    s.calUrl ? h('p', { class: 'muted small' }, state.calError ? `Fout: ${state.calError}` : `${state.events.length} afspraken in de komende 7 dagen.`) : null,
    s.calUrl ? btn('Ontkoppel', async () => { s.calUrl = ''; s.calKey = randomKey(); state.events = []; await saveSettings(); render(); }, { cls: 'link-btn' }) : null);
}

function macSection(nat = {}) {
  const set = async (patch) => {
    try { state.nativeInfo = await native.call('setSettings', { settings: patch }); } catch (e) { toast(e.message); }
    render();
  };
  return h('section', { class: 'card' },
    h('h3', { class: 'label' }, icon('mic'), 'Mac-app'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!nat.autoRecord, onchange: (e) => set({ autoRecord: e.target.checked }) }), 'Neem meetings automatisch op (Zoom, Teams, Meet, FaceTime, Slack, Webex en meer)'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!nat.systemAudio, onchange: (e) => set({ systemAudio: e.target.checked }) }), 'Neem ook het geluid van de Mac op (de andere deelnemers)'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!nat.launchAtLogin, onchange: (e) => set({ launchAtLogin: e.target.checked }) }), 'Start Notulist bij inloggen'),
    field('Notulist-map', h('div', { class: 'row gap' }, h('code', { class: 'path' }, nat.libraryPath || 'Nog niet gekozen'), btn('Kies', async () => { try { state.nativeInfo = await native.call('chooseFolder'); render(); importFromLibrary(); } catch { /* cancelled */ } }, { cls: 'btn sm', ic: 'folder' })),
      'Elk transcript komt hier als Markdown-bestand: leesbaar voor Obsidian, je iPhone (iCloud Drive) en Claude.'),
    h('p', { class: 'muted small' }, 'Agenda: je Mac-agenda (alle accounts in de app Agenda). ', state.calError ? `Fout: ${state.calError}` : `${state.events.length} afspraken in de komende 7 dagen.`),
    nat.permissions ? h('p', { class: 'muted small' }, `Toegang · microfoon: ${nat.permissions.mic} · agenda: ${nat.permissions.calendar} · schermopname (Mac-geluid): ${nat.permissions.screen}`) : null);
}

async function updateStorageLine() {
  const el = $('#storage-line');
  if (!el) return;
  const info = await storageInfo();
  el.textContent = `${state.meetings.length} opnames · ${bytes(info.usage)} gebruikt${info.quota ? ` van ${bytes(info.quota)}` : ''} · ${info.persisted ? 'beschermd tegen automatisch opruimen' : 'de browser mag opruimen bij ruimtegebrek'}`;
}

async function applyRetention() {
  const s = state.settings.keepAudio;
  if (s === 'always') return;
  const limit = s === 'never' ? 0 : 30 * 864e5;
  for (const m of state.meetings) {
    if (m.status !== 'done' || m.audioDeleted || !m.parts?.length) continue;
    if (Date.now() - Date.parse(m.transcribedAt || m.startedAt || m.createdAt) >= limit) await dropAudio(m);
  }
}

async function exportBackup() {
  const data = { app: 'notulist', version: 1, exportedAt: new Date().toISOString(), meetings: state.meetings.map((m) => ({ ...m })), people: state.people };
  download(new File([JSON.stringify(data, null, 1)], `Notulist back-up ${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' }));
  toast('Back-up gemaakt (transcripten en namen, zonder audio).');
}

async function importFiles(files) {
  let n = 0;
  for (const f of files) {
    try {
      if (/\.json$/i.test(f.name)) {
        const data = JSON.parse(await f.text());
        if (data.app !== 'notulist') throw new Error('Geen Notulist back-up');
        for (const m of data.meetings || []) { if (!getMeeting(m.id)) { const had = m.parts?.length; m.parts = []; m.audioDeleted = !!had; if (m.status !== 'done') m.status = m.segments?.length ? 'done' : 'error'; await saveMeeting(m, { sync: true }); n++; } }
        for (const p of data.people || []) if (!state.people.some((x) => x.id === p.id)) { state.people.push(p); await db.put('people', p); }
      } else if (/\.(md|markdown|txt)$/i.test(f.name)) {
        const parsed = parseMarkdown(await f.text());
        if (parsed.id && getMeeting(parsed.id)) continue;
        await saveMeeting({ ...parsed, id: parsed.id || uid(), createdAt: parsed.startedAt || new Date().toISOString(), startedAt: parsed.startedAt || new Date(f.lastModified).toISOString(), status: 'done', parts: [], imported: true, source: parsed.source || 'import' });
        n++;
      } else {
        const m = newMeeting(null, { title: f.name.replace(/\.[^.]+$/, ''), source: 'import', status: 'saved', startedAt: new Date(f.lastModified || Date.now()).toISOString() });
        const dur = await mediaDuration(f);
        m.parts = [{ mime: f.type || 'audio/mp4', duration: dur, size: f.size }];
        m.duration = dur;
        await audio.put(m.id, 0, f);
        await saveMeeting(m, { sync: false });
        maybeTranscribe(m.id);
        n++;
      }
    } catch (e) {
      toast(`${f.name}: ${e.message}`);
    }
  }
  if (n) { toast(`${n} ${n === 1 ? 'bestand' : 'bestanden'} geïmporteerd`); render(); }
}

function mediaDuration(file) {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    const url = URL.createObjectURL(file);
    const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    a.src = url;
  });
}

function sharedView(code) {
  if (!state.shared || state.shared.code !== code) {
    decodeShare(code).then((m) => { state.shared = { code, m }; render(); }).catch(() => { state.shared = { code, error: true }; render(); });
    return h('div', { class: 'page' }, h('p', { class: 'muted' }, 'Openen…'));
  }
  if (state.shared.error) return h('div', { class: 'page' }, h('p', null, 'Deze link is beschadigd of onvolledig.'), h('a', { href: '#/' }, 'Naar Notulist'));
  const m = state.shared.m;
  return h('div', { class: 'page detail' },
    h('div', { class: 'tip' }, icon('lock'), ' Gedeeld transcript, alleen lezen. Het staat in de link zelf, niet op een server.'),
    h('h2', { class: 'page-title' }, m.title),
    h('p', { class: 'muted small' }, [longDate(m.startedAt), m.duration ? duration(m.duration) : ''].filter(Boolean).join(' · ')),
    participants(m).length ? h('p', { class: 'muted small' }, `Deelnemers: ${participants(m).join(', ')}`) : null,
    h('div', { class: 'actions' },
      btn('Kopieer voor AI', () => copyForAI(m), { cls: 'btn primary', ic: 'copy' }),
      btn('Bewaar in mijn Notulist', async () => { const copy = { ...m, id: uid(), createdAt: new Date().toISOString() }; await saveMeeting(copy); history.replaceState(null, '', '#/'); go(`#/m/${copy.id}`); }, { cls: 'btn', ic: 'download' })),
    m.notes ? h('section', { class: 'card' }, h('h3', { class: 'label' }, 'Notities'), h('p', { class: 'pre' }, m.notes)) : null,
    h('section', { class: 'card transcript' }, h('div', { class: 'segments' }, m.segments.map((x) => h('div', { class: 'seg' },
      h('div', { class: 'seg-meta' }, h('span', { class: 'ts' }, clock(x.start)), h('span', { class: 'who-btn', style: `--mark:${speakerColor(m, x.s)}` }, speakerLabel(m, x.s))),
      h('p', { class: 'seg-text' }, x.text))))));
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- start ----------

async function recoverInterrupted() {
  for (const m of state.meetings) {
    if (m.status === 'transcribing') { m.status = 'saved'; await saveMeeting(m, { sync: false }); continue; }
    if (m.status !== 'recording' || state.recording?.id === m.id) continue;
    if (native.isNative) continue; // the Mac app reports its own recordings below
    const have = (m.parts || []).length;
    const parts = await recoverAudio(m.id, have + 1, 'audio/mp4');
    let added = 0;
    for (let p = 0; p < parts.length; p++) {
      if (m.parts[p]?.size) continue;
      await audio.put(m.id, p, parts[p].blob);
      m.parts[p] = { mime: parts[p].blob.type, duration: parts[p].estimate, size: parts[p].blob.size };
      added++;
    }
    await db.dropChunks(m.id);
    if (!m.parts.some((p) => p?.size)) { await meetings.remove(m.id); state.meetings = state.meetings.filter((x) => x.id !== m.id); continue; }
    m.duration = m.parts.reduce((a, p) => a + (p?.duration || 0), 0);
    m.status = 'saved';
    m.error = added ? 'Deze opname werd onderbroken; wat er was, is bewaard.' : '';
    await saveMeeting(m, { sync: false });
  }
}

async function connectNative() {
  native.on(onNativeEvent);
  try {
    state.nativeInfo = await native.call('hello', { version: VERSION });
    document.body.classList.add('native');
    const st = await native.call('status');
    if (st?.recording) {
      if (!getMeeting(st.id)) await onNativeEvent({ type: 'recordingStarted', ...st });
      state.recording = { id: st.id, native: true, startedAt: Date.parse(st.startedAt) || Date.now(), trigger: st.trigger || '', system: !!st.system };
      showRecorder();
      if (st.trigger) minimizeRecorder();
    }
    for (const info of (await native.call('pending')) || []) await importNative(info);
    for (const m of state.meetings) {
      if (m.status === 'recording' && state.recording?.id !== m.id) { m.status = 'error'; m.error = 'Deze opname is niet goed afgesloten.'; await saveMeeting(m, { sync: false }); }
    }
    importFromLibrary();
    setInterval(importFromLibrary, 60 * 1000);
  } catch (e) {
    console.warn('native', e);
  }
}

window.notulistApp = Object.freeze({
  latestCopyText() {
    const m = state.meetings.find((x) => x.segments?.length);
    return m ? llmText(m, { timestamps: state.settings.timestamps }) : '';
  },
  startRecording: () => startRecording(),
  stopRecording: () => stopRecording(),
});

async function main() {
  await loadAll();
  if (!(await kv.get('settings'))) await saveSettings();
  $('#rec-mini').addEventListener('click', showRecorder);
  $('#tab-rec').addEventListener('click', (e) => { e.preventDefault(); startRecording(); });
  window.addEventListener('hashchange', render);
  window.addEventListener('online', () => state.meetings.filter((m) => m.status === 'saved').forEach((m) => maybeTranscribe(m.id)));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { loadCalendar(); importFromLibrary(); } });
  await recoverInterrupted();
  if (native.isNative) await connectNative();
  render();
  if (location.hash === '#/opnemen') { history.replaceState(null, '', '#/'); startRecording(); }
  loadCalendar();
  setInterval(loadCalendar, 5 * 60 * 1000);
  applyRetention();
  state.meetings.filter((m) => m.status === 'saved' && !m.error).forEach((m) => maybeTranscribe(m.id));
  if ('serviceWorker' in navigator && !native.isNative && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

main().catch((e) => {
  console.error(e);
  view.replaceChildren(h('div', { class: 'page' }, h('p', null, `Notulist kon niet starten: ${e.message}`), h('p', { class: 'muted' }, 'Staat privé-surfen aan? Dan kan de app niets bewaren.')));
});

// Exposed for tests only.
export const _test = { state, transcriptText };
