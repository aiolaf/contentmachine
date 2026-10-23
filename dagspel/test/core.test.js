import test from 'node:test';
import assert from 'node:assert/strict';
import {
  legeStaat, leesStaat, leesVoorstel, schoon, ochtendStapel, avondStapel, vandaagLijst, laterLijst,
  kies, eigenTaak, pasAan, markeerDag, totaalPunten, puntenVanDag, reeks, niveau, ruimOp, voegSamen, plusDagen, isWeekend,
} from '../lib/core.js';
import { LocalStore, ConflictError, GitHubStore, utf8ToBase64, parseRepoInput, cleanToken } from '../lib/store.js';
import { Sync } from '../lib/sync.js';
import { demoVoorstel } from '../lib/demo.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

const VANDAAG = '2026-10-23'; // a Friday
const voorstel = (taken, datum = VANDAAG) => leesVoorstel({ datum, taken });

test('dates: day arithmetic and weekends', () => {
  assert.equal(plusDagen('2026-10-31', 1), '2026-11-01');
  assert.equal(plusDagen('2026-03-29', -1), '2026-03-28');
  assert.equal(isWeekend('2026-10-24'), true);
  assert.equal(isWeekend('2026-10-23'), false);
});

test('schoon: cleans what Claude writes and refuses junk', () => {
  const t = schoon({ id: 'mail:18f2', titel: '  Bel   Jan  ', bron: 'fax', minuten: 2, prio: 9, link: 'javascript:alert(1)', deadline: 'morgen' });
  assert.deepEqual(t, { id: 'mail:18f2', titel: 'Bel Jan', bron: 'overig', minuten: 5, prio: 3 });
  assert.equal(schoon({ id: 'a b', titel: 'x' }), null);
  assert.equal(schoon({ id: 'ok', titel: '' }), null);
  const v = leesVoorstel({ datum: VANDAAG, vrijeMinuten: 130, agenda: [{ van: '9:00', tot: '9:30', titel: 'Stand-up' }, { van: 'x', titel: 'kapot' }],
    taken: [{ id: 'a', titel: 'A' }, { id: 'a', titel: 'dubbel' }, null] });
  assert.equal(v.taken.length, 1);
  assert.equal(v.agenda.length, 1);
  assert.equal(v.vrijeMinuten, 130);
  assert.equal(leesVoorstel({ taken: [] }), null);
});

test('morning: new proposals, carry-over and later cards; decided cards drop out', () => {
  const s = legeStaat();
  const v = voorstel([
    { id: 'a', titel: 'Offerte Acme', prio: 2 },
    { id: 'b', titel: 'Bel Sanne', prio: 1 },
    { id: 'c', titel: 'Factuur', prio: 3 },
    { id: 'l', titel: 'Later ding', prio: 2, context: 'nieuwe context' },
  ]);
  s.taken.oud = { ...schoon({ id: 'oud', titel: 'Van gisteren', prio: 2 }), status: 'vandaag', dag: '2026-10-22', t: 1 };
  s.taken.l = { ...schoon({ id: 'l', titel: 'Later ding', prio: 2 }), status: 'later', beslist: '2026-10-20', t: 1 };
  s.taken.c = { ...schoon({ id: 'c', titel: 'Factuur' }), status: 'weg', t: 1 };

  let deck = ochtendStapel(s, v, VANDAAG);
  assert.deepEqual(deck.map((k) => k.id), ['b', 'oud', 'a', 'l']);
  assert.equal(deck.find((k) => k.id === 'oud').soort, 'door');
  assert.equal(deck.find((k) => k.id === 'oud').door, 1);
  assert.equal(deck.find((k) => k.id === 'l').soort, 'terug');
  assert.equal(deck.find((k) => k.id === 'l').context, 'nieuwe context');

  kies(s, 'wel', deck[0], VANDAAG);
  kies(s, 'later', deck[1], VANDAAG);
  kies(s, 'niet', deck[2], VANDAAG);
  deck = ochtendStapel(s, v, VANDAAG);
  assert.deepEqual(deck.map((k) => k.id), ['l']);
  kies(s, 'wel', deck[0], VANDAAG);
  assert.equal(ochtendStapel(s, v, VANDAAG).length, 0);
  assert.deepEqual(vandaagLijst(s, VANDAAG).map((t) => t.id), ['b', 'l']);
  assert.deepEqual(laterLijst(s).map((t) => t.id), ['oud']);
  assert.equal(s.taken.a.status, 'weg');
});

test('undo puts a card back exactly as it was', () => {
  const s = legeStaat();
  const v = voorstel([{ id: 'a', titel: 'A' }]);
  const [kaart] = ochtendStapel(s, v, VANDAAG);
  const terug = kies(s, 'wel', kaart, VANDAAG);
  assert.equal(s.taken.a.status, 'vandaag');
  terug();
  assert.equal(s.taken.a, undefined);
  assert.equal(ochtendStapel(s, v, VANDAAG).length, 1);
});

test('evening: done earns points, morgen carries over, los lets go', () => {
  const s = legeStaat();
  const v = voorstel([{ id: 'a', titel: 'A', prio: 1 }, { id: 'b', titel: 'B', prio: 2 }, { id: 'c', titel: 'C', prio: 3 }]);
  for (const k of ochtendStapel(s, v, VANDAAG)) kies(s, 'wel', k, VANDAAG);
  markeerDag(s, VANDAAG, 'ochtend');
  kies(s, 'gedaan', s.taken.a, VANDAAG);
  const deck = avondStapel(s, VANDAAG);
  assert.deepEqual(deck.map((t) => t.id), ['b', 'c']);
  kies(s, 'morgen', deck[0], VANDAAG);
  kies(s, 'los', deck[1], VANDAAG);
  markeerDag(s, VANDAAG, 'avond');
  assert.equal(s.taken.a.punten, 20);
  assert.equal(s.taken.b.status, 'open');
  assert.equal(s.taken.b.door, 1);
  assert.equal(s.taken.c.status, 'weg');
  assert.equal(puntenVanDag(s, VANDAAG), 30);
  assert.equal(totaalPunten(s), 30);

  // not tonight, but the next morning B is back as a carry-over card
  assert.equal(ochtendStapel(s, null, VANDAAG).length, 0);
  const morgen = plusDagen(VANDAAG, 1);
  const deck2 = ochtendStapel(s, null, morgen);
  assert.deepEqual(deck2.map((k) => [k.id, k.soort, k.door]), [['b', 'door', 1]]);
});

test('list: ticking off and back', () => {
  const s = legeStaat();
  const t = eigenTaak(s, { titel: 'Post schrijven', minuten: 30, prio: 1 }, VANDAAG);
  assert.equal(t.bron, 'eigen');
  kies(s, 'gedaan', t, VANDAAG);
  assert.equal(totaalPunten(s), 20);
  kies(s, 'terug', s.taken[t.id], VANDAAG);
  assert.equal(totaalPunten(s), 0);
  assert.equal(s.taken[t.id].status, 'vandaag');
});

test('tweaks: title marks it edited, bovenaan puts it first', () => {
  const s = legeStaat();
  const a = eigenTaak(s, { titel: 'A' }, VANDAAG);
  const b = eigenTaak(s, { titel: 'B' }, VANDAAG);
  pasAan(s, b.id, { bovenaan: true, minuten: 45, prio: 1, titel: 'B, maar beter' }, VANDAAG);
  assert.deepEqual(vandaagLijst(s, VANDAAG).map((t) => t.titel), ['B, maar beter', 'A']);
  assert.equal(s.taken[b.id].bewerkt, true);
  assert.equal(s.taken[b.id].minuten, 45);
  assert.equal(s.taken[a.id].bewerkt, undefined);
});

test('streak: weekends and today do not break it', () => {
  const s = legeStaat();
  for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']) s.dagen[d] = { avond: `${d}T19:00:00Z` };
  assert.equal(reeks(s, VANDAAG), 4);
  s.dagen['2026-10-23'] = { avond: 'x' };
  assert.equal(reeks(s, '2026-10-26'), 5); // Monday morning, weekend skipped
  delete s.dagen['2026-10-21'];
  assert.equal(reeks(s, VANDAAG), 2); // today and yesterday
  assert.equal(niveau(450).nummer, 3);
  assert.equal(niveau(450).binnen, 50);
});

test('housekeeping: old finished tasks move to the archive and keep their points', () => {
  const s = legeStaat();
  const oud = Date.now() - 40 * 864e5;
  s.taken.a = { ...schoon({ id: 'a', titel: 'A' }), status: 'gedaan', gedaanOp: '2026-09-01', punten: 15, t: oud };
  s.taken.b = { ...schoon({ id: 'b', titel: 'B' }), status: 'later', t: oud };
  const voor = totaalPunten(s);
  ruimOp(s);
  assert.equal(s.taken.a, undefined);
  assert.ok(s.taken.b);
  assert.deepEqual(s.archief.a, { s: 'gedaan', d: '2026-09-01', p: 15 });
  assert.equal(totaalPunten(s), voor);
  // Claude proposes it again: it stays away
  assert.equal(ochtendStapel(s, voorstel([{ id: 'a', titel: 'A' }]), VANDAAG).length, 0);
});

test('merge: newest change per task wins, days combine, archive is a union', () => {
  const a = legeStaat();
  const b = legeStaat();
  a.taken.x = { ...schoon({ id: 'x', titel: 'X' }), status: 'gedaan', t: 20 };
  b.taken.x = { ...schoon({ id: 'x', titel: 'X' }), status: 'vandaag', t: 10 };
  b.taken.y = { ...schoon({ id: 'y', titel: 'Y' }), status: 'vandaag', t: 5 };
  a.dagen[VANDAAG] = { ochtend: '2026-10-23T07:00:00Z', t: 1 };
  b.dagen[VANDAAG] = { avond: '2026-10-23T19:00:00Z', bonus: 20, t: 2 };
  b.archief.z = { s: 'weg', d: '2026-09-01' };
  a.taken.z = { ...schoon({ id: 'z', titel: 'Z' }), status: 'weg', t: 1 };
  const m = voegSamen(a, b);
  assert.equal(m.taken.x.status, 'gedaan');
  assert.ok(m.taken.y);
  assert.equal(m.taken.z, undefined);
  assert.deepEqual(m.dagen[VANDAAG], { ochtend: '2026-10-23T07:00:00Z', avond: '2026-10-23T19:00:00Z', bonus: 20, t: 2 });
  assert.deepEqual(voegSamen(m, legeStaat()), m);
});

test('leesStaat: survives junk and keeps known fields', () => {
  const s = leesStaat({ taken: { a: { titel: 'A', status: 'gedaan', punten: 10, t: 3, rommel: 1 }, '../x': { titel: 'x' } }, dagen: { nee: {}, [VANDAAG]: { ochtend: 'x' } } });
  assert.deepEqual(Object.keys(s.taken), ['a']);
  assert.equal(s.taken.a.punten, 10);
  assert.equal(s.taken.a.rommel, undefined);
  assert.deepEqual(Object.keys(s.dagen), [VANDAAG]);
  assert.deepEqual(leesStaat('kapot'), legeStaat());
});

test('sync: loads today, falls back to the last proposals and merges a conflict', async () => {
  const storage = memoryStorage();
  const store = new LocalStore({ storage, key: 'repo' });
  await store.write('Taken/voorstellen/2026-10-21.json', JSON.stringify({ datum: '2026-10-21', taken: [{ id: 'oud', titel: 'Oud' }] }), null);
  await store.write('Taken/voorstellen/2026-10-22.json', JSON.stringify({ datum: '2026-10-22', taken: [{ id: 'a', titel: 'A' }] }), null);
  await store.write('Taken/voorstellen/2026-10-24.json', JSON.stringify({ datum: '2026-10-24', taken: [{ id: 'toekomst', titel: 'T' }] }), null);

  const phone = new Sync(store, { storage: memoryStorage(), delay: 0 });
  await phone.laad(VANDAAG);
  assert.equal(phone.voorstel.datum, '2026-10-22');

  const mac = new Sync(store, { storage: memoryStorage(), delay: 0 });
  await mac.laad(VANDAAG);

  kies(phone.staat, 'wel', ochtendStapel(phone.staat, phone.voorstel, VANDAAG)[0], VANDAAG);
  phone.dirty = true;
  await phone.schrijf();
  eigenTaak(mac.staat, { titel: 'Van de Mac' }, VANDAAG);
  mac.dirty = true;
  await mac.schrijf(); // conflicts with the phone's write, merges and retries

  const check = new Sync(store, { storage: memoryStorage() });
  await check.laad(VANDAAG);
  assert.deepEqual(vandaagLijst(check.staat, VANDAAG).map((t) => t.titel).sort(), ['A', 'Van de Mac']);
  assert.equal(mac.dirty, false);
});

test('sync: keeps unsaved work on the device and never overwrites a broken file', async () => {
  const storage = memoryStorage();
  const store = new LocalStore({ storage: memoryStorage(), key: 'repo' });
  const failing = { read: store.read.bind(store), list: store.list.bind(store), write: async () => { throw new Error('offline'); } };
  const a = new Sync(failing, { storage, delay: 0 });
  await a.laad(VANDAAG);
  eigenTaak(a.staat, { titel: 'Offline gemaakt' }, VANDAAG);
  a.dirty = true;
  a.bewaarCache();
  await assert.rejects(a.schrijf(), /offline/);

  const reopened = new Sync(store, { storage, delay: 0 });
  assert.equal(reopened.dirty, true);
  await reopened.laad(VANDAAG); // pushes what was left
  assert.equal(reopened.dirty, false);
  const saved = JSON.parse((await store.read('Taken/staat.json')).text);
  assert.equal(Object.values(saved.taken)[0].titel, 'Offline gemaakt');

  const sha = (await store.read('Taken/staat.json')).sha;
  await store.write('Taken/staat.json', '{kapot', sha);
  const c = new Sync(store, { storage: memoryStorage() });
  await assert.rejects(c.laad(VANDAAG), /geen geldige JSON/);
});

test('store: GitHub contents API calls and conflict detection', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push([opts.method, url, opts.body && JSON.parse(opts.body)]);
    if (opts.method === 'PUT' && JSON.parse(opts.body).sha === 'oud') return new Response(JSON.stringify({ message: 'is at abc but expected oud' }), { status: 409 });
    if (opts.method === 'PUT') return new Response(JSON.stringify({ content: { sha: 'nieuw' } }), { status: 200 });
    if (url.includes('/contents/Taken/staat.json')) return new Response(JSON.stringify({ type: 'file', sha: 's1', content: utf8ToBase64('{"ä":1}') }));
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  };
  const gh = new GitHubStore({ owner: 'o', repo: 'r', branch: 'main', token: 't', fetchImpl });
  assert.deepEqual(await gh.read('Taken/staat.json'), { text: '{"ä":1}', sha: 's1' });
  assert.equal(await gh.read('Taken/nee.json'), null);
  assert.deepEqual(await gh.list('Taken/voorstellen'), []);
  assert.equal(await gh.write('Taken/staat.json', '{}', 's1', 'm'), 'nieuw');
  await assert.rejects(gh.write('Taken/staat.json', '{}', 'oud', 'm'), ConflictError);
  assert.equal(calls[3][2].sha, 's1');
  assert.equal(calls[3][2].branch, 'main');
  assert.deepEqual(parseRepoInput('', 'https://github.com/aiolaf/contentmachine-vault.git'), { owner: 'aiolaf', repo: 'contentmachine-vault' });
  assert.equal(cleanToken(' Bearer github_pat_x \n'), 'github_pat_x');
});

test('demo: proposals for any day are valid', () => {
  const v = leesVoorstel(demoVoorstel(VANDAAG));
  assert.equal(v.datum, VANDAAG);
  assert.ok(v.taken.length >= 8);
  assert.ok(v.vrijeMinuten > 0);
});
