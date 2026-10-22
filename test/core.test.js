import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNote, stringifyNote, parseYaml, getSection, setSection, cleanFolderName } from '../lib/frontmatter.js';
import { parseInput, detectType, fetchDetails } from '../lib/capture.js';
import { tokenize, trainModel, predict, parseRules, classify, suggestTags, summarize } from '../lib/classify.js';
import { Learner } from '../lib/learn.js';
import { buildPrompt, chatLinks } from '../lib/prompts.js';
import { LocalStore, GitHubStore, gitBlobSha, utf8ToBase64, base64ToUtf8, parseRepoInput, cleanToken } from '../lib/store.js';
import { Vault } from '../lib/vault.js';
import { processCapture, processInbox, backfillPreviews } from '../lib/pipeline.js';
import { embedFor } from '../lib/embeds.js';
import { buildShortcut } from '../lib/shortcut.js';
import { youtubeId, safeImage } from '../lib/capture.js';
import { REGELS } from '../lib/seeds.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const noFetch = async () => { throw new Error('offline'); };

test('frontmatter: reads what Obsidian writes and round-trips our own output', () => {
  const data = parseYaml('titel: Waarom: AI werkt\ntags:\n  - ai\n  - "n8n"\nster: true\nscore: 72\nleeg:\naliases: [a, "b, c"]\nbeschrijving: |\n  regel 1\n  regel 2');
  assert.equal(data.titel, 'Waarom: AI werkt');
  assert.deepEqual(data.tags, ['ai', 'n8n']);
  assert.equal(data.ster, true);
  assert.equal(data.score, 72);
  assert.equal(data.leeg, null);
  assert.deepEqual(data.aliases, ['a', 'b, c']);
  assert.equal(data.beschrijving, 'regel 1\nregel 2');

  const text = stringifyNote({ id: 'a1', titel: 'Test: "quotes" #1', tags: ['x'], ster: false, score: 50, url: 'https://x.com/a?b=1' }, '# T\n');
  const back = parseNote(text);
  assert.equal(back.invalid, false);
  assert.equal(back.data.titel, 'Test: "quotes" #1');
  assert.equal(back.data.url, 'https://x.com/a?b=1');
  assert.equal(back.data.ster, false);
  assert.equal(parseNote('---\ntitel: "open\n---\nx').invalid, true);
});

test('sections: notes keep their own headings', () => {
  const body = '# T\n\n## Mijn notities\n\n## Bron\n\nbron';
  const next = setSection(body, 'Mijn notities', 'Hook:\n## Stap 2\nmeer');
  assert.equal(getSection(next, 'Mijn notities'), 'Hook:\n## Stap 2\nmeer');
  assert.equal(getSection(next, 'Bron'), 'bron');
  assert.equal(cleanFolderName('../../etc'), 'Etc');
  assert.equal(cleanFolderName('Concepten'), 'Inbox');
});

test('capture: URL out of shared text, tracking stripped, platform detected', () => {
  const r = parseInput({ text: 'Kijk dit https://x.com/a/status/123?s=20&t=abc echt goed' });
  assert.equal(r.url, 'https://x.com/a/status/123');
  assert.equal(r.text, 'Kijk dit echt goed');
  assert.equal(detectType('https://www.instagram.com/reel/Cx/'), 'instagram');
  assert.equal(detectType('https://youtu.be/abc'), 'youtube');
  assert.equal(parseInput({ url: 'javascript:alert(1)' }).url, '');
});

test('capture: free sources are used and failures fall back quietly', async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.fxtwitter.com/status/123')) {
      return new Response(JSON.stringify({ tweet: { text: 'Agents gaan van demo naar productie', author: { name: 'Andrej', screen_name: 'karpathy' } } }));
    }
    return new Response('{}', { status: 500 });
  };
  const d = await fetchDetails({ url: 'https://x.com/a/status/123', type: 'tweet' }, { fetchImpl: fake });
  assert.equal(d.auteur, 'Andrej (@karpathy)');
  assert.match(d.tekst, /demo naar productie/);
  const none = await fetchDetails({ url: 'https://site.nl/a', type: 'artikel' }, { fetchImpl: noFetch });
  assert.deepEqual(none, {});
  const noReader = [];
  await fetchDetails({ url: 'https://site.nl/a', type: 'artikel' }, { fetchImpl: async (u) => (noReader.push(u), new Response('{}')), reader: false });
  assert.ok(noReader.every((u) => !u.includes('r.jina.ai')), 'reader can be switched off');
});

test('classify: rules work on day one, the model takes over once you sorted items', () => {
  const rules = parseRules(REGELS);
  assert.ok(rules.find((r) => r.folder === 'Automatisering').words.includes('n8n'));
  const fresh = classify({ titel: 'Zo bouw je een n8n workflow voor facturen' }, trainModel([]), rules);
  assert.equal(fresh.map, 'Automatisering');
  assert.equal(fresh.reden, 'trefwoordregel');
  assert.equal(classify({ titel: 'Recept voor appeltaart' }, trainModel([]), rules).map, 'Inbox');

  // You keep filing recipes and podcasts in your own folders: the model learns that.
  const sorted = [];
  for (let i = 0; i < 4; i++) {
    sorted.push({ titel: `Recept ${i} met appels en kaneel`, map: 'Koken', verrijkt: true });
    sorted.push({ titel: `Podcast aflevering ${i} over ondernemen`, map: 'Podcasts', verrijkt: true });
  }
  const model = trainModel(sorted);
  assert.equal(predict(model, tokenize('appels kaneel taart'))[0].folder, 'Koken');
  const learned = classify({ titel: 'Appeltaart met kaneel' }, model, rules);
  assert.equal(learned.map, 'Koken');
  assert.equal(learned.reden, 'geleerd van jouw mappen');
});

test('tags and summary come from the text itself', () => {
  const tags = suggestTags({ titel: 'Claude Haiku verwerkt facturen', tekst: 'Facturen automatisch verwerken met Claude. #automatisering' }, [{ titel: 'iets anders' }]);
  assert.ok(tags.includes('automatisering'));
  assert.ok(tags.includes('facturen'));
  const s = summarize('Menu\nInloggen\nAI-agents nemen steeds meer werk over in het mkb, blijkt uit onderzoek. Vooral administratie gaat snel. Daarna volgt een lange alinea die niet meer past in de samenvatting omdat die te lang is geworden voor de kaart.', 120);
  assert.match(s, /^AI-agents nemen/);
  assert.ok(s.length <= 120);
});

test('learner: positive feedback lifts related items, negative lowers them', () => {
  const learner = new Learner();
  const a = { id: 'a', titel: 'A', tags: ['ai-agents', 'n8n'], map: 'AI Agents', bron: 'x.com', type: 'tweet', score: 50, status: 'nieuw' };
  const related = { ...a, id: 'b', tags: ['ai-agents'] };
  const other = { ...a, id: 'c', tags: ['crypto'], map: 'Overig', bron: 'coin.com', type: 'artikel' };
  learner.signal(a, 'ster');
  learner.signal(a, 'gebruikt');
  assert.ok(learner.rank(related) > learner.rank(other));
  learner.signal(other, 'duim_neer');
  assert.ok(learner.rank(other) < 50);
});

test('prompt: profile, style, task and sources with notes, ready to paste', () => {
  const prompt = buildPrompt({
    soort: 'linkedin',
    items: [{ meta: { titel: 'Agents in productie', url: 'https://x.com/a', samenvatting: 'Kort' }, body: '# A\n\n## Mijn notities\n\nMijn hook\n\n## Bron\n\nLange tekst' }],
    instructie: 'Voor HR-managers',
    profiel: '# Profiel\n\nOlaf, NinA AI',
    stijl: '# Stijl\n\nGeen em dashes',
  });
  for (const part of ['Olaf, NinA AI', 'Geen em dashes', 'LinkedIn post', 'Voor HR-managers', 'Agents in productie', 'Mijn hook', 'Lange tekst', 'https://x.com/a']) {
    assert.ok(prompt.includes(part), part);
  }
  assert.ok(!prompt.includes('—'));
  assert.match(chatLinks('kort').claude, /claude\.ai\/new\?q=kort/);
  assert.equal(chatLinks('x'.repeat(7000)).claude, 'https://claude.ai/new');
});

test('store: git blob sha and base64 match git and GitHub', async () => {
  assert.equal(await gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a'); // git hash-object
  assert.equal(base64ToUtf8(utf8ToBase64('Eén idee: ü')), 'Eén idee: ü');
});

test('vault: seeds, saves, moves from Obsidian and survives a reload', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: 'Contentmachine' });
  vault.flushDelay = 10_000;
  await vault.load();
  await vault.flush();
  assert.ok(store.files.has('Contentmachine/_systeem/regels.md'));

  const item = vault.create({ titel: 'Eerste item', map: 'AI Agents', verrijkt: true, tags: ['ai'] }, '# Eerste item\n\n## Mijn notities\n\n## Bron\n\nx');
  await vault.update(item.id, { ster: true }, { notities: 'mijn idee' });
  await vault.flush();
  const path = vault.meta(item.id).path;
  assert.ok(store.files.has(`Contentmachine/${path}`));

  // Obsidian moves the note to another folder.
  const text = store.files.get(`Contentmachine/${path}`).content;
  await store.external(`Contentmachine/${path}`, null);
  await store.external(`Contentmachine/Sales/${path.split('/')[1]}`, text);
  const fresh = new Vault(store, { root: 'Contentmachine' });
  fresh.flushDelay = 10_000;
  const { moves } = await fresh.load();
  assert.deepEqual(moves.map((m) => [m.from, m.to]), [['AI Agents', 'Sales']]);
  assert.equal(fresh.meta(item.id).map, 'Sales');
  assert.equal(fresh.meta(item.id).ster, true);
  assert.equal(fresh.learner.state.correcties[0].naar, 'Sales');
  await fresh.flush();
  const { body } = await fresh.get(item.id);
  assert.equal(getSection(body, 'Mijn notities'), 'mijn idee');

  // Third visit: everything comes from the index, no file needs reading.
  let reads = 0;
  const orig = store.readBlob.bind(store);
  store.readBlob = async (sha) => (reads++, orig(sha));
  const third = new Vault(store, { root: 'Contentmachine' });
  await third.load();
  const sysFiles = 6; // profiel, stijl, regels, LEESMIJ, leren, index
  assert.equal(reads, sysFiles, 'item properties come from index.json');
  assert.equal(third.list().length, 1);
});

test('vault: a concurrent push is merged, and the remote wins on the same file', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: '' });
  vault.flushDelay = 10_000;
  await vault.load();
  const a = vault.create({ titel: 'A', map: 'Tools' }, '# A\n');
  await vault.flush();
  const pathA = vault.meta(a.id).path;

  await vault.update(a.id, { ster: true });
  const b = vault.create({ titel: 'B', map: 'Tools' }, '# B\n');
  // Meanwhile Obsidian edits A and the iPhone drops a new link in Inbox.
  await store.external(pathA, store.files.get(pathA).content.replace('# A', '# A, aangepast in Obsidian'));
  await store.external('Inbox/20261022-101500.md', 'https://example.org/artikel');
  await vault.flush();

  assert.ok(store.files.has(vault.meta(b.id).path), 'our new file survived the conflict');
  assert.match(store.files.get(pathA).content, /aangepast in Obsidian/, 'remote edit wins');
  assert.ok(store.files.has('Inbox/20261022-101500.md'));
});

test('pipeline: shared link and Inbox capture become ordered notes without AI', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: 'Contentmachine' });
  vault.flushDelay = 10_000;
  await vault.load();
  await vault.flush();

  const meta = await processCapture(vault, { text: 'Zo maak je een n8n workflow https://example.org/n8n-workflow?utm_source=x' }, { fetchImpl: noFetch });
  assert.equal(meta.map, 'Automatisering');
  assert.equal(meta.url, 'https://example.org/n8n-workflow');
  assert.equal(meta.verrijkt, true);
  const dup = await processCapture(vault, { url: 'https://example.org/n8n-workflow' }, { fetchImpl: noFetch });
  assert.equal(dup.dubbel, true);
  await vault.flush();

  await store.external('Contentmachine/Inbox/20261022-093000.md', 'https://x.com/karpathy/status/1886192184808149383\n');
  const again = new Vault(store, { root: 'Contentmachine' });
  again.flushDelay = 10_000;
  const { captures } = await again.load();
  assert.equal(captures.length, 1);
  const fake = async (url) => (url.includes('fxtwitter')
    ? new Response(JSON.stringify({ tweet: { text: 'Multi-agent systemen worden de nieuwe apps', author: { name: 'Andrej', screen_name: 'karpathy' } } }))
    : new Response('{}', { status: 404 }));
  const [made] = await processInbox(again, captures, { fetchImpl: fake });
  await again.flush();
  assert.equal(made.map, 'AI Agents');
  assert.equal(made.auteur, 'Andrej (@karpathy)');
  assert.match(made.opgeslagen, /^2026-10-22T/);
  assert.ok(!store.files.has('Contentmachine/Inbox/20261022-093000.md'), 'raw capture removed');
  assert.ok(store.files.has(`Contentmachine/${again.meta(made.id).path}`));
});

test('github store: talks the Git Data API and reports a moved branch as conflict', async () => {
  const log = [];
  const responses = {
    'GET /branches/main': { commit: { sha: 'c1', commit: { tree: { sha: 't1' } } } },
    'GET /git/trees/t1?recursive=1': { tree: [{ path: 'Contentmachine/Inbox/a.md', type: 'blob', sha: 's1' }], truncated: false },
    'POST /git/trees': { sha: 't2' },
    'POST /git/commits': { sha: 'c2' },
  };
  let refStatus = 200;
  const fake = async (url, init) => {
    const key = `${init.method} ${url.replace('https://api.github.com/repos/olaf/vault', '')}`;
    log.push({ key, body: init.body && JSON.parse(init.body), auth: init.headers.Authorization });
    if (key.startsWith('PATCH /git/refs/heads/main')) {
      return refStatus === 200 ? new Response('{}') : new Response(JSON.stringify({ message: 'Update is not a fast forward' }), { status: 422 });
    }
    return new Response(JSON.stringify(responses[key] || {}), { status: responses[key] ? 200 : 404 });
  };
  const gh = new GitHubStore({ owner: 'olaf', repo: 'vault', token: 'tok', fetchImpl: fake });
  const files = await gh.snapshot();
  assert.equal(files.get('Contentmachine/Inbox/a.md'), 's1');
  await gh.commit('test', [{ path: 'Contentmachine/A/x.md', content: 'hoi' }, { path: 'Contentmachine/Inbox/a.md', delete: true }]);
  const tree = log.find((l) => l.key === 'POST /git/trees').body;
  assert.equal(tree.base_tree, 't1');
  assert.deepEqual(tree.tree[1], { path: 'Contentmachine/Inbox/a.md', mode: '100644', type: 'blob', sha: null });
  assert.equal(log.find((l) => l.key === 'POST /git/commits').body.parents[0], 'c1');
  assert.equal(gh.head.commit, 'c2');
  assert.equal(log[0].auth, 'Bearer tok');
  refStatus = 422;
  await assert.rejects(gh.commit('x', [{ path: 'a', content: 'b' }]), { name: 'ConflictError' });
});

test('previews: images from X, YouTube and microlink, never a non-https URL', async () => {
  const fake = async (url) => {
    if (url.includes('fxtwitter')) {
      return new Response(JSON.stringify({ tweet: { text: 'Post', author: { name: 'A', screen_name: 'a', avatar_url: 'https://pbs.twimg.com/profile_images/1/a.jpg' }, media: { photos: [{ url: 'https://pbs.twimg.com/media/foto.jpg' }] } } }));
    }
    if (url.includes('microlink')) {
      return new Response(JSON.stringify({ status: 'success', data: { title: 'Nieuws', description: 'Kort', image: { url: 'https://site.nl/og.jpg' } } }));
    }
    return new Response('{}', { status: 404 });
  };
  const t = await fetchDetails({ url: 'https://x.com/a/status/1', type: 'tweet' }, { fetchImpl: fake });
  assert.equal(t.afbeelding, 'https://pbs.twimg.com/media/foto.jpg');
  assert.equal(t.avatar, 'https://pbs.twimg.com/profile_images/1/a.jpg');
  const yt = await fetchDetails({ url: 'https://youtu.be/dQw4w9WgXcQ', type: 'youtube' }, { fetchImpl: fake });
  assert.equal(yt.afbeelding, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  const art = await fetchDetails({ url: 'https://site.nl/a', type: 'artikel' }, { fetchImpl: fake, reader: false });
  assert.equal(art.afbeelding, 'https://site.nl/og.jpg');
  assert.equal(art.titel, 'Nieuws');
  const off = await fetchDetails({ url: 'https://site.nl/a', type: 'artikel' }, { fetchImpl: fake, reader: false, previews: false });
  assert.equal(off.afbeelding, undefined, 'microlink can be switched off');
  assert.equal(safeImage('javascript:alert(1)'), '');
  assert.equal(safeImage('http://site.nl/a.jpg'), '');
  assert.equal(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('embeds: the original post per platform, loaded only on request', () => {
  assert.match(embedFor({ type: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).src, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(embedFor({ type: 'tweet', url: 'https://x.com/a/status/123' }).src, /Tweet\.html\?id=123/);
  assert.match(embedFor({ type: 'instagram', url: 'https://www.instagram.com/reel/Cx1_ab/' }).src, /instagram\.com\/p\/Cx1_ab\/embed/);
  assert.match(embedFor({ type: 'tiktok', url: 'https://www.tiktok.com/@a/video/7234567890123456789' }).src, /embed\/v2\/7234567890123456789/);
  assert.match(embedFor({ type: 'linkedin', url: 'https://www.linkedin.com/posts/olaf_ai-activity-7123456789012345678-AbCd' }).src, /urn:li:activity:7123456789012345678/);
  assert.equal(embedFor({ type: 'artikel', url: 'https://nos.nl/a' }), null);
});

test('previews: stored on new items, and fetched later for older ones', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: '' });
  vault.flushDelay = 10_000;
  await vault.load();
  const fake = async (url) => (url.includes('microlink')
    ? new Response(JSON.stringify({ status: 'success', data: { title: 'Artikel over agents', image: { url: 'https://site.nl/og.jpg' } } }))
    : new Response('{}', { status: 404 }));
  const made = await processCapture(vault, { url: 'https://site.nl/agents' }, { fetchImpl: fake, reader: false });
  assert.equal(made.afbeelding, 'https://site.nl/og.jpg');
  assert.match((await vault.get(made.id)).body, /!\[\]\(https:\/\/site\.nl\/og\.jpg\)/);

  // An item from before previews existed.
  const old = vault.create({ titel: 'Oud', url: 'https://site.nl/oud', type: 'artikel', map: 'Tools', verrijkt: true }, '# Oud\n\n## Mijn notities\n\nnotitie\n\n## Bron\n\ntekst');
  const offline = await backfillPreviews(vault, { fetchImpl: noFetch });
  assert.equal(offline, 0);
  assert.equal(vault.meta(old.id).afbeelding, undefined, 'no answer: try again next time');
  const found = await backfillPreviews(vault, { fetchImpl: fake });
  assert.equal(found, 1);
  const { meta, body } = await vault.get(old.id);
  assert.equal(meta.afbeelding, 'https://site.nl/og.jpg');
  assert.equal(getSection(body, 'Mijn notities'), 'notitie');
  assert.match(getSection(body, 'Bron'), /^!\[\]\(https:\/\/site\.nl\/og\.jpg\)/);
  assert.equal(await backfillPreviews(vault, { fetchImpl: fake }), 0, 'done items are skipped');
});

test('connect: pasted links and tokens are cleaned up', () => {
  assert.deepEqual(parseRepoInput('', 'https://github.com/aiolaf/contentmachine-vault'), { owner: 'aiolaf', repo: 'contentmachine-vault' });
  assert.deepEqual(parseRepoInput('aiolaf', 'aiolaf/contentmachine-vault.git'), { owner: 'aiolaf', repo: 'contentmachine-vault' });
  assert.deepEqual(parseRepoInput('@aiolaf ', ' contentmachine-vault '), { owner: 'aiolaf', repo: 'contentmachine-vault' });
  assert.equal(cleanToken(' Bearer github_pat_abc\n'), 'github_pat_abc');
});

test('connect: a 404 is explained (token cannot see the repo, wrong owner, bad token, wrong branch)', async () => {
  const fake = (user, repoStatus = 404) => async (url) => {
    if (url.endsWith('/user')) return user ? new Response(JSON.stringify({ login: user })) : new Response('{}', { status: 401 });
    if (url.endsWith('/repos/aiolaf/vault')) {
      return repoStatus === 200 ? new Response(JSON.stringify({ private: true, default_branch: 'main', permissions: { push: true } })) : new Response('{"message":"Not Found"}', { status: 404 });
    }
    if (url.includes('/branches/')) return new Response('{"message":"Branch not found"}', { status: 404 });
    return new Response('{}', { status: 404 });
  };
  const gh = (f, branch = 'main') => new GitHubStore({ owner: 'aiolaf', repo: 'vault', token: 't', branch, fetchImpl: f });
  await assert.rejects(gh(fake('aiolaf')).check(), /mag aiolaf\/vault niet zien.*Only select repositories/);
  await assert.rejects(gh(fake('iemand')).check(), /hoort bij iemand/);
  await assert.rejects(gh(fake(null)).check(), /ongeldig of verlopen/);
  await assert.rejects(gh(fake('aiolaf', 200), 'master').check(), /Branch "master" bestaat niet.*"main"/);
  await gh(fake('aiolaf', 200)).check(); // empty repo on its default branch is fine
});

test('shortcut: saves straight to the vault Inbox, asks for the token only when it is not known', () => {
  const asks = buildShortcut({ owner: 'aiolaf', repo: 'contentmachine-vault', map: 'Contentmachine' });
  assert.match(asks, /<string>https:\/\/api\.github\.com\/repos\/aiolaf\/contentmachine-vault\/contents\/Contentmachine\/Inbox\/&#xFFFC;\.md<\/string>/);
  assert.match(asks, /<string>PUT<\/string>/);
  assert.match(asks, /<key>WFBase64LineBreakMode<\/key>\s*<string>None<\/string>/);
  assert.match(asks, /yyyyMMdd-HHmmss/);
  assert.match(asks, /Plak je GitHub-token/);
  const filled = buildShortcut({ owner: 'aiolaf', repo: 'contentmachine-vault', token: 'github_pat_x&y' });
  assert.ok(!filled.includes('Plak je GitHub-token'));
  assert.ok(filled.includes('github_pat_x&amp;y'), 'token is XML-escaped');
  assert.ok(filled.includes('<key>{7, 1}</key>'), 'token variable sits right after "Bearer "');
});
