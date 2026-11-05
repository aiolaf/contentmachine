// Notulist web app logic. Run: node --test test/notulist.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fromWords, fromElevenLabs, fromOpenAI, compact, shiftPart, speakerKeys, mergeSpeaker, samples } from '../notulist/lib/segments.js';
import { llmText, toMarkdown, parseMarkdown, fileNameFor, speakerLabel, participants } from '../notulist/lib/format.js';
import { normalizeEvents, eventAt, relevantEvents, appsScriptCode, eventsAround, eventsOnDay } from '../notulist/lib/calendar.js';
import { encodeShare, decodeShare } from '../notulist/lib/share.js';
import { clock, parseClock, safeFileName, nameFromEmail, fold } from '../notulist/lib/util.js';

const words = (spk, t, text) => text.split(' ').flatMap((w, i) => [
  { text: w, start: t + i * 0.4, end: t + i * 0.4 + 0.3, type: 'word', speaker_id: spk },
  { text: ' ', start: t + i * 0.4 + 0.3, end: t + i * 0.4 + 0.4, type: 'spacing', speaker_id: spk },
]);

test('ElevenLabs words become turns per speaker', () => {
  const res = fromElevenLabs({
    language_code: 'nld',
    words: [
      ...words('speaker_0', 0, 'Hallo Jan, hoe gaat het?'),
      { text: '(lacht)', start: 2, end: 2.5, type: 'audio_event', speaker_id: 'speaker_1' },
      ...words('speaker_1', 2.6, 'Goed, dank je.'),
      ...words('speaker_1', 9, 'Na een lange stilte.'),
    ],
  });
  assert.equal(res.language, 'nl');
  assert.deepEqual(res.segments.map((s) => [s.s, s.text]), [
    ['speaker_0', 'Hallo Jan, hoe gaat het?'],
    ['speaker_1', 'Goed, dank je.'],
    ['speaker_1', 'Na een lange stilte.'],
  ]);
  assert.equal(res.segments[1].start, 2.6);
});

test('words without spacing tokens get spaces, punctuation does not', () => {
  const segs = fromWords([
    { text: 'Ja', start: 0, end: 0.2, speaker_id: 'a' },
    { text: ',', start: 0.2, end: 0.25, speaker_id: 'a' },
    { text: 'prima', start: 0.3, end: 0.6, speaker_id: 'a' },
    { text: '.', start: 0.6, end: 0.62, speaker_id: 'a' },
  ]);
  assert.equal(segs[0].text, 'Ja, prima.');
});

test('long monologue splits at a sentence end', () => {
  const long = Array.from({ length: 140 }, (_, i) => `woord${i}${i % 20 === 19 ? '.' : ''}`).join(' ');
  const segs = fromWords(words('speaker_0', 0, long));
  assert.ok(segs.length > 1);
  assert.ok(segs.every((s) => s.end - s.start < 60));
});

test('OpenAI diarized segments merge per speaker', () => {
  const res = fromOpenAI({ segments: [
    { start: 0, end: 2, text: 'Hoi', speaker: 'A' },
    { start: 2.2, end: 4, text: 'hoe is het', speaker: 'A' },
    { start: 4.5, end: 6, text: 'Goed!', speaker: 'B' },
  ] });
  assert.deepEqual(res.segments.map((s) => [s.s, s.text]), [['speaker_A', 'Hoi hoe is het'], ['speaker_B', 'Goed!']]);
});

test('parts shift time and keep speakers apart', () => {
  const segs = shiftPart([{ s: 'speaker_0', start: 1, end: 2, text: 'x' }], 100, 1);
  assert.deepEqual(segs[0], { s: 'p2:speaker_0', start: 101, end: 102, text: 'x' });
});

test('merging speakers and samples', () => {
  const m = { speakers: { b: { name: 'Jan' } }, segments: [
    { s: 'a', start: 0, end: 5, text: 'een' }, { s: 'b', start: 5, end: 6, text: 'twee' }, { s: 'a', start: 6, end: 20, text: 'drie' },
  ] };
  assert.deepEqual(samples(m.segments, 'a', 1).map((x) => x.text), ['drie']);
  mergeSpeaker(m, 'b', 'a');
  assert.deepEqual(speakerKeys(m.segments), ['a']);
  assert.equal(m.segments.length, 1);
  assert.equal(m.segments[0].text, 'een twee drie');
  assert.equal(m.speakers.b, undefined);
});

const meeting = () => ({
  id: 'm_test',
  title: 'Klantgesprek Acme: offerte',
  startedAt: '2026-11-04T09:00:00.000Z',
  duration: 1250,
  notes: 'Prijs checken',
  markers: [3],
  people: [{ name: 'Jan de Vries', email: 'jan@acme.nl' }, { name: 'Piet', email: 'piet@acme.nl' }],
  speakers: { speaker_0: { name: 'Olaf' } },
  segments: [
    { s: 'speaker_0', start: 0, end: 2.5, text: 'Welkom!' },
    { s: 'speaker_1', start: 2.6, end: 8, text: 'Dank je.\nZullen we beginnen?' },
  ],
});

test('labels and participants', () => {
  const m = meeting();
  assert.equal(speakerLabel(m, 'speaker_1'), 'Spreker 2');
  assert.deepEqual(participants(m), ['Olaf', 'Jan de Vries', 'Piet']);
});

test('copy text for AI', () => {
  const text = llmText(meeting());
  assert.match(text, /^Transcript: Klantgesprek Acme: offerte\nDatum: .+ \(21 min\)\nDeelnemers: Olaf, Jan de Vries, Piet\n\nMijn notities:\nPrijs checken\n\n\[00:00\] Olaf: Welkom!\n\n\[00:02\] Spreker 2: Dank je/);
  const withPrompt = llmText(meeting(), { prompt: 'Vat samen.', timestamps: false });
  assert.match(withPrompt, /^Vat samen\.\n\n<transcript>\n/);
  assert.match(withPrompt, /\nOlaf: Welkom!\n/);
  assert.match(withPrompt, /<\/transcript>$/);
});

test('Markdown round trip', () => {
  const md = toMarkdown(meeting());
  assert.match(md, /^---\nid: "m_test"\ntitle: "Klantgesprek Acme: offerte"\n/);
  assert.match(md, /participants: \["Olaf","Jan de Vries","Piet"\]/);
  assert.match(md, /\*\*\[00:02\] Spreker 2:\*\* Dank je\. Zullen we beginnen\?/);
  assert.match(md, /## Markeringen\n\n- \[00:03\] Spreker 2: Dank je/);
  const back = parseMarkdown(md);
  assert.equal(back.id, 'm_test');
  assert.equal(back.title, 'Klantgesprek Acme: offerte');
  assert.equal(back.notes, 'Prijs checken');
  assert.deepEqual(back.markers, [3]);
  assert.equal(back.segments.length, 2);
  assert.equal(back.speakers.speaker_0.name, 'Olaf');
  assert.equal(back.speakers.speaker_1, undefined, 'Spreker N stays unnamed');
  assert.equal(back.duration, 1250);
});

test('hand-edited Markdown (Obsidian) still parses', () => {
  const back = parseMarkdown('# Losse notitie\n\n## Transcript\n\n**[01:02:03] Anna:** Eerste regel\ndoorgaande regel\n\n**[01:02:10] Bob:** Ja\n');
  assert.equal(back.title, 'Losse notitie');
  assert.equal(back.segments[0].start, 3723);
  assert.equal(back.segments[0].text, 'Eerste regel doorgaande regel');
  assert.equal(back.segments[0].end, 3730);
});

test('file names are safe', () => {
  const name = fileNameFor({ ...meeting(), title: '../../etc/passwd: "x" <y>|*?' });
  assert.ok(!name.includes('/') && !name.includes(':') && !name.includes('"'));
  assert.match(name, /\.md$/);
  assert.equal(safeFileName('...'), 'Opname');
});

test('utils', () => {
  assert.equal(clock(3725), '1:02:05');
  assert.equal(parseClock('1:02:05'), 3725);
  assert.equal(nameFromEmail('jan.de.vries@acme.nl'), 'Jan De Vries');
  assert.equal(fold('Éénmaal'), 'eenmaal');
});

test('calendar events', () => {
  const now = Date.parse('2026-11-04T10:05:00Z');
  const events = normalizeEvents([
    { id: '2', title: 'Later', start: '2026-11-04T15:00:00Z', end: '2026-11-04T16:00:00Z' },
    { id: '1', title: 'Weekstart', start: '2026-11-04T10:00:00Z', end: '2026-11-04T10:30:00Z', attendees: [
      { name: '', email: 'jan.de.vries@acme.nl' }, { name: 'Olaf', email: 'olaf@x.nl', self: true }, { name: 'Zaal 1', email: 'c_123@resource.calendar.google.com' },
    ] },
  ]);
  assert.equal(events[0].title, 'Weekstart');
  assert.deepEqual(events[0].attendees.map((a) => a.name), ['Jan De Vries', 'Olaf']);
  assert.equal(eventAt(events, now).id, '1');
  assert.deepEqual(relevantEvents(events, now).map((e) => e.id), ['1']);
});

test('Apps Script runs and checks the key', () => {
  const code = appsScriptCode('geheim123');
  const ev = {
    isAllDayEvent: () => false, getMyStatus: () => 'YES', getId: () => 'abc', getTitle: () => 'Weekstart',
    getStartTime: () => new Date('2026-11-04T10:00:00Z'), getEndTime: () => new Date('2026-11-04T10:30:00Z'),
    getLocation: () => '', getDescription: () => 'Link: https://meet.google.com/abc-defg-hij',
    getGuestList: () => [{ getName: () => '', getEmail: () => 'Jan@Acme.nl' }, { getName: () => 'Olaf', getEmail: () => 'olaf@nina-ai.nl' }],
  };
  const sandbox = {
    CalendarApp: { GuestStatus: { NO: 'NO' }, getDefaultCalendar: () => ({ getEvents: () => [ev] }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'olaf@nina-ai.nl' }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
  };
  vm.runInNewContext(`${code}\nthis.doGet = doGet;`, sandbox);
  assert.deepEqual(JSON.parse(sandbox.doGet({ parameter: { key: 'fout' } }).text), { error: 'unauthorized' });
  const out = JSON.parse(sandbox.doGet({ parameter: { key: 'geheim123', days: '7' } }).text);
  assert.equal(out.events[0].link, 'https://meet.google.com/abc-defg-hij');
  assert.deepEqual(out.events[0].attendees.map((a) => a.self), [false, true]);
});

test('share link round trip', async () => {
  const code = await encodeShare(meeting());
  assert.match(code, /^z[A-Za-z0-9_-]+$/);
  const back = await decodeShare(code);
  assert.equal(back.title, 'Klantgesprek Acme: offerte');
  assert.equal(back.segments[1].text, 'Dank je.\nZullen we beginnen?');
  assert.equal(back.speakers.speaker_0.name, 'Olaf');
  await assert.rejects(decodeShare('xabc'));
});

test('appointments around a recording', () => {
  const events = normalizeEvents([
    { id: 'a', title: 'Ochtend', start: '2026-11-05T08:00:00Z', end: '2026-11-05T08:30:00Z' },
    { id: 'b', title: 'Weekstart', start: '2026-11-05T10:00:00Z', end: '2026-11-05T10:30:00Z' },
    { id: 'c', title: 'Lunch', start: '2026-11-05T10:40:00Z', end: '2026-11-05T11:30:00Z' },
    { id: 'd', title: 'Morgen', start: '2026-11-06T10:00:00Z', end: '2026-11-06T10:30:00Z' },
  ]);
  // Started a bit early, ran 35 minutes: both meetings it touches, closest start first.
  assert.deepEqual(eventsAround(events, '2026-11-05T09:55:00Z', 35 * 60).map((e) => e.id), ['b', 'c']);
  assert.deepEqual(eventsAround(events, '2026-11-05T13:00:00Z', 60).map((e) => e.id), []);
  assert.deepEqual(eventsAround(events, 'geen datum', 60), []);
  assert.deepEqual(eventsOnDay(events, '2026-11-05T12:00:00Z').map((e) => e.id), ['a', 'b', 'c']);
});
