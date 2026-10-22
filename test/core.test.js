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
  const tags = suggestTags({ titel: 'Claude Haiku verwerkt facturen', tekst: 'Facturen automatisch verwerken met Claude. #automatisering #ai-agents' }, [{ titel: 'iets anders' }]);
  assert.deepEqual(tags, ['automatisering', 'ai-agents'], 'own hashtags only');
  const words = suggestTags({ titel: 'Claude Haiku verwerkt facturen', tekst: 'Facturen automatisch verwerken met Claude.' }, [{ titel: 'iets anders' }]);
  assert.ok(words.includes('facturen'), 'no hashtags: distinctive words');
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
  const sysFiles = 7; // profiel, stijl, regels, bundels, LEESMIJ, leren, index
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

test('bundles: frequent hashtags that appear together become one bundle, rare ones do not', async () => {
  const { parseBundles, stringifyBundles, autoBundle, bundleOf, setFolderBundles, renameFolderInBundles, BUNDELS_SEED, bundleName } = await import('../lib/bundles.js');
  const items = [];
  const add = (tags, map = 'AI Agents') => items.push({ id: String(items.length), map, tags, status: 'nieuw' });
  for (let i = 0; i < 4; i++) add(['claude', 'anthropic', i % 2 ? 'claude-code' : 'llm']);
  add(['claude', 'claude-code']);
  for (let i = 0; i < 3; i++) add(['n8n', 'workflow']);
  add(['eenmalig']);
  add(['claude'], 'Inbox');

  const { model, changes } = autoBundle(items, parseBundles(BUNDELS_SEED));
  const bundles = model.folders.get('AI Agents').bundels;
  const claude = bundles.find((b) => b.tags.includes('claude'));
  assert.ok(claude, 'claude bundle exists');
  assert.ok(claude.tags.includes('anthropic') && claude.tags.includes('claude-code'), 'co-occurring tags merged');
  assert.equal(claude.naam, 'Claude');
  assert.ok(bundles.find((b) => b.tags.includes('n8n')).tags.includes('workflow'));
  assert.ok(!bundles.some((b) => b.tags.includes('eenmalig')), 'a one-off hashtag gets no bundle');
  assert.ok(!model.folders.has('Inbox'), 'Inbox is not bundled');
  assert.ok(changes.every((c) => c.nieuw));
  assert.equal(bundleOf({ map: 'AI Agents', tags: ['anthropic'] }, model).naam, 'Claude');
  assert.equal(bundleOf({ map: 'AI Agents', tags: ['iets'] }, model), null);

  // Round-trip through the Markdown file, readable in Obsidian.
  const text = stringifyBundles(model);
  assert.match(text, /^## AI Agents$/m);
  assert.match(text, /^- Claude: #claude #anthropic/m);
  assert.deepEqual(parseBundles(text).folders.get('AI Agents').bundels, bundles);

  // Removing a bundle in the editor keeps it from coming back.
  const edited = setFolderBundles(model, 'AI Agents', [{ naam: 'Claude & Co', tags: ['claude', 'anthropic', 'claude-code', 'llm'] }]);
  assert.ok(edited.folders.get('AI Agents').genegeerd.has('n8n'));
  assert.equal(autoBundle(items, edited).changes.length, 0);

  // A new frequent hashtag that travels with an existing bundle joins it.
  for (let i = 0; i < 3; i++) add(['claude', 'mcp']);
  const grown = autoBundle(items, edited);
  assert.deepEqual(grown.changes, [{ map: 'AI Agents', naam: 'Claude & Co', tags: ['mcp'], nieuw: false }]);

  assert.ok(renameFolderInBundles(edited, 'AI Agents', 'Agents').folders.has('Agents'));
  assert.equal(bundleName('ai-agents'), 'AI agents');
  assert.equal(bundleName('n8n'), 'n8n');
  assert.equal(bundleName('openai'), 'OpenAI');
});

test('hashtags: become the tags and leave the title', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: '' });
  vault.flushDelay = 10_000;
  await vault.load();
  const meta = await processCapture(vault, { text: 'Claude werkt nu in Excel #claude #anthropic #excel' }, { fetchImpl: noFetch });
  assert.equal(meta.titel, 'Claude werkt nu in Excel');
  assert.deepEqual(meta.tags, ['claude', 'anthropic', 'excel']);
});

test('inbox: an empty share is cleaned up, LinkedIn titles are cut to the post', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: '' });
  vault.flushDelay = 10_000;
  await vault.load();
  let empty = 0;
  const done = await processInbox(vault, [{ rel: 'Inbox/20261022-154122.md', text: '' }], { fetchImpl: noFetch, onEmpty: () => { empty += 1; } });
  assert.equal(done.length, 0);
  assert.equal(empty, 1);
  assert.equal(vault.list().length, 0);

  const fake = async (url) => (url.includes('microlink')
    ? new Response(JSON.stringify({ status: 'success', data: { title: 'Grok Bot can now build reports, memos, and dashboards. Ask Bot for a page, then edit it.… | SpaceX Super Intelligence | 17 comments' } }))
    : new Response('{}', { status: 404 }));
  const li = await processCapture(vault, { url: 'https://lnkd.in/p/eETGUA-Z' }, { fetchImpl: fake, reader: false });
  assert.equal(li.titel, 'Grok Bot can now build reports, memos, and dashboards.');
});

test('search: the full text is searched, accents and case do not matter', async () => {
  const { fold, plainText, parseQuery, matchItem, snippet } = await import('../lib/search.js');
  assert.equal(fold('Ideeën ÉN Café'), 'ideeen en cafe');
  assert.deepEqual(parseQuery('#AI "multi agent"  kosten'), ['ai', 'multi agent', 'kosten']);
  const body = '# Titel\n\n> [!abstract] Samenvatting\n> Kort.\n\n## Bron\n\n[Site](https://x.org)\n\n![](https://x.org/a.jpg)\n\nDe **kosten** van een multi agent systeem vallen mee. Dat zeggen de ideeën uit het onderzoek.';
  const plain = plainText(body);
  assert.doesNotMatch(plain, /https|\*\*|!\[|\[!abstract\]/);
  const text = { plain, folded: fold(plain) };
  const item = { titel: 'Agents in de zorg', tags: ['ai'], samenvatting: 'Kort.' };
  assert.equal(matchItem(item, text, parseQuery('ideeen')).inBody, true, 'found in the body only');
  assert.equal(matchItem(item, null, parseQuery('ideeen')), null, 'not found before the text is loaded');
  assert.equal(matchItem(item, text, parseQuery('agents zorg')).inBody, false);
  assert.equal(matchItem(item, text, parseQuery('agents banaan')), null, 'every word must match');
  assert.ok(matchItem(item, text, ['zorg']).score > matchItem(item, text, ['kosten']).score, 'title beats body');
  const parts = snippet(plain, parseQuery('"multi agent" ideeen'));
  assert.deepEqual(parts.filter((x) => x.hit).map((x) => x.t), ['multi agent', 'ideeën']);
});

test('highlights: saved as a section, notes stay intact, counted and used in prompts', async () => {
  const { parseHighlights, withHighlights, cleanHighlight } = await import('../lib/highlights.js');
  const start = '# T\n\n## Mijn notities\n\nmijn idee\n\n## Bron\n\nDe zin die telt. En nog meer.';
  let body = withHighlights(start, [{ tekst: 'De zin\n die  telt.', notitie: 'Hook voor TikTok' }]);
  assert.match(body, /## Markeringen\n\n- ==De zin die telt\.==\n {2}Hook voor TikTok\n/);
  assert.equal(getSection(body, 'Mijn notities'), 'mijn idee', 'notes end before the highlights');
  assert.equal(getSection(body, 'Bron'), 'De zin die telt. En nog meer.');
  body = withHighlights(body, [...parseHighlights(body), { tekst: 'En nog meer.', notitie: '' }]);
  assert.deepEqual(parseHighlights(body), [{ tekst: 'De zin die telt.', notitie: 'Hook voor TikTok' }, { tekst: 'En nog meer.', notitie: '' }]);
  assert.equal(cleanHighlight('a == b'), 'a = b');
  // Written by hand in Obsidian, without the == marks.
  assert.deepEqual(parseHighlights('## Markeringen\n\n- eigen zin\n'), [{ tekst: 'eigen zin', notitie: '' }]);
  assert.doesNotMatch(withHighlights(body, []), /Markeringen/, 'no highlights, no section');

  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: '' });
  vault.flushDelay = 10_000;
  await vault.load();
  const item = vault.create({ titel: 'T', map: 'AI' }, start);
  const m = await vault.update(item.id, {}, { transform: (b) => withHighlights(b, [{ tekst: 'De zin die telt.' }]) });
  assert.equal(m.markeringen, 1);
  await vault.flush();
  const file = store.files.get(m.path).content;
  assert.match(file, /^markeringen: 1$/m);
  // Obsidian adds one by hand: the count follows the body on the next visit.
  await store.external(m.path, file.replace('- ==De zin die telt.==', '- ==De zin die telt.==\n- ==En nog meer.=='));
  const again = new Vault(store, { root: '' });
  await again.load();
  assert.equal(again.meta(item.id).markeringen, 2);

  const prompt = buildPrompt({ soort: 'linkedin', items: [await again.get(item.id)] });
  assert.match(prompt, /Wat ik markeerde[^\n]*\n- "De zin die telt\."\n- "En nog meer\."/);
});

test('review: a daily mix that is the same all day and comes back later each time', async () => {
  const { dailyReview, stopReview, daysUntil, highlightOfDay } = await import('../lib/review.js');
  const old = (d) => new Date(Date.UTC(2026, 9, 22 - d)).toISOString();
  const items = [
    { id: 'a', titel: 'A', rank: 60, opgeslagen: old(30), markeringen: 2 },
    { id: 'b', titel: 'B', rank: 90, opgeslagen: old(30) },
    { id: 'c', titel: 'C', rank: 95, opgeslagen: old(30), status: 'archief' },
    { id: 'd', titel: 'D', rank: 99, opgeslagen: old(0) },
    { id: 'e', titel: 'E', rank: 50, opgeslagen: old(10) },
  ];
  const day1 = new Date(2026, 9, 22, 9);
  const first = dailyReview(items, undefined, { now: day1, size: 2 });
  assert.equal(first.changed, true);
  assert.equal(first.ids.length, 2);
  assert.ok(!first.ids.includes('c'), 'archived items stay away');
  assert.ok(!first.ids.includes('d'), 'brand-new items wait');
  assert.ok(first.ids.includes('a'), 'highlights come back first');
  const later = dailyReview(items, first.state, { now: new Date(2026, 9, 22, 21), size: 2 });
  assert.equal(later.changed, false);
  assert.deepEqual(later.ids, first.ids, 'same mix all day, on every device');
  assert.equal(daysUntil(first.state, 'a', day1), 7);

  const week = dailyReview(items, first.state, { now: new Date(2026, 9, 29, 9), size: 5 });
  assert.equal(week.state.items.a.interval, 14, 'shown twice: the wait doubles');
  const stopped = stopReview(week.state, 'a');
  const month = dailyReview(items, stopped, { now: new Date(2026, 11, 1, 9), size: 5 });
  assert.ok(!month.ids.includes('a'), 'stopped items never return');
  assert.equal(daysUntil(stopped, 'a'), null);
  const gone = dailyReview(items.filter((i) => i.id !== 'b'), month.state, { now: new Date(2026, 11, 2, 9) });
  assert.ok(!('b' in gone.state.items), 'deleted items are forgotten');

  const hls = [{ tekst: '1' }, { tekst: '2' }, { tekst: '3' }];
  assert.equal(highlightOfDay(hls, '2026-10-22', 'a'), highlightOfDay(hls, '2026-10-22', 'a'));
  assert.equal(highlightOfDay([], '2026-10-22', 'a'), null);
});

test('vault: note texts are read once per device and kept by sha', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const seed = new Vault(store, { root: '' });
  seed.flushDelay = 10_000;
  await seed.load();
  const a = seed.create({ titel: 'A', map: 'AI' }, '# A\n\nvolledige tekst over agents');
  seed.create({ titel: 'B', map: 'AI' }, '# B\n');
  await seed.flush();

  const cache = new Map();
  const textCache = { get: async (k) => cache.get(k), set: async (k, v) => cache.set(k, v) };
  let reads = 0;
  const orig = store.readBlob.bind(store);
  store.readBlob = async (sha) => (reads++, orig(sha));
  const v1 = new Vault(store, { root: '', textCache });
  await v1.load();
  assert.equal(v1.cachedText(a.id), null, 'item bodies are not read on load');
  const before = reads;
  assert.equal(await v1.loadTexts(), 2);
  assert.equal(reads - before, 2);
  assert.match(v1.cachedText(a.id), /volledige tekst over agents/);

  reads = 0;
  const v2 = new Vault(store, { root: '', textCache });
  await v2.load();
  await v2.loadTexts();
  assert.equal(reads, 0, 'second visit: everything from the device cache');
  assert.match(v2.cachedText(a.id), /agents/);
});

test('review: an empty vault does not fix an empty mix for the whole day', async () => {
  const { dailyReview } = await import('../lib/review.js');
  const empty = dailyReview([], undefined, { now: new Date(2026, 9, 22, 9) });
  assert.equal(empty.changed, false);
  const later = dailyReview([{ id: 'a', titel: 'A', opgeslagen: new Date(2026, 9, 22, 8).toISOString() }], empty.state, { now: new Date(2026, 9, 22, 10) });
  assert.deepEqual(later.ids, ['a']);
});

test('content: topics, title, note and statistics of what you made', async () => {
  const { topicsOf, productionTitle, conceptBody, contentStats, earlierAbout, obsidianTag, topicKey } = await import('../lib/content.js');
  const { parseBundles } = await import('../lib/bundles.js');
  const model = parseBundles('drempel: 3\n\n## AI Nieuws\n\n- Claude: #claude #anthropic\n');
  const posts = [
    { id: 'a', titel: 'Claude Duet is live', map: 'AI Nieuws', tags: ['claude', 'duet', 'anthropic'] },
    { id: 'b', titel: 'Duet in de praktijk', map: 'AI Nieuws', tags: ['claude', 'duet'] },
    { id: 'c', titel: 'Wat Duet kost', map: 'AI Nieuws', tags: ['duet', 'prijzen'] },
  ];
  const { onderwerpen, mappen } = topicsOf(posts, model);
  assert.deepEqual(onderwerpen, ['Claude', 'duet'], 'bundle first, then tags most sources share');
  assert.deepEqual(mappen, ['AI Nieuws']);
  assert.equal(productionTitle(posts, onderwerpen), 'Claude en Duet');
  assert.equal(productionTitle([posts[0]], []), 'Claude Duet is live');
  assert.equal(obsidianTag('Claude Duet'), '#claude-duet');
  assert.equal(obsidianTag('2026'), '');
  assert.equal(topicKey('#Claude'), topicKey('claude'));

  const body = conceptBody({ titel: 'Claude en Duet', label: 'LinkedIn post', links: ['- [[A]]', '- [[B]]'], onderwerpen, datum: '2026-10-22T10:00:00Z' });
  assert.match(body, /^# Claude en Duet\n\n> \[!todo\] Nog geen resultaat/);
  assert.match(body, /## Bronnen in de vault\n\n- \[\[A\]\]\n- \[\[B\]\]/);
  assert.match(body, /## Onderwerpen\n\n#claude #duet/);
  assert.match(conceptBody({ titel: 'x', label: 'TikTok script', links: [], resultaat: '# Mijn post\n\nTekst' }), /^# Mijn post\n\nTekst\n\n## Bronnen/);

  const prods = [
    { file: '1.md', datum: '2026-10-22T10:00:00Z', label: 'LinkedIn post', titel: 'Claude en Duet', onderwerpen: ['Claude', 'duet'] },
    { file: '2.md', datum: '2026-10-20T10:00:00Z', label: 'TikTok script', titel: 'Claude Code', onderwerpen: ['claude'] },
    { file: '3.md', datum: '2026-08-01T10:00:00Z', label: 'LinkedIn post', titel: 'n8n', onderwerpen: ['n8n'] },
  ];
  const items = [
    ...['x', 'y', 'z'].map((id) => ({ id, status: 'nieuw', tags: ['mistral'] })),
    { id: 'u', status: 'gebruikt', tags: ['mistral'] },
  ];
  const st = contentStats(prods, items, Date.parse('2026-10-22T12:00:00Z'));
  assert.equal(st.totaal, 3);
  assert.equal(st.recent, 2);
  assert.deepEqual(st.perSoort, [['LinkedIn post', 2], ['TikTok script', 1]]);
  assert.deepEqual(st.onderwerpen[0], { naam: 'Claude', aantal: 2, soorten: [['LinkedIn post', 1], ['TikTok script', 1]] });
  assert.deepEqual(st.kansen, [{ naam: 'mistral', aantal: 3 }], 'saved often, never made content of');

  assert.deepEqual(earlierAbout(prods, ['claude'], { exclude: '1.md' }), [{ datum: '2026-10-20', label: 'TikTok script', titel: 'Claude Code' }]);
  const prompt = buildPrompt({ soort: 'linkedin', items: [], eerder: earlierAbout(prods, ['claude']) });
  assert.match(prompt, /## Wat ik hier eerder over maakte\n\n- 2026-10-22, LinkedIn post: Claude en Duet\n- 2026-10-20, TikTok script: Claude Code\n\nKies een nieuwe invalshoek/);
});

test('content: links to the content survive Obsidian, the log syncs with the vault', async () => {
  const meta = parseNote('---\nid: a\ntitel: T\ngebruikt_in:\n  - "[[2026-10-22 LinkedIn post - Claude]]"\n  - [[Handmatig]]\n---\n\nx').data;
  const { normalizeMeta } = await import('../lib/frontmatter.js');
  assert.deepEqual(normalizeMeta(meta).gebruikt_in, ['[[2026-10-22 LinkedIn post - Claude]]', '[[Handmatig]]']);
  assert.match(stringifyNote({ id: 'a', gebruikt_in: ['[[X]]'] }, ''), /gebruikt_in:\n {2}- "\[\[X\]\]"/);

  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: '' });
  vault.flushDelay = 10_000;
  await vault.load();
  const file = vault.writeConcept({ titel: 'Claude', soort: 'LinkedIn post', datum: '2026-10-22T10:00:00Z' }, '# Claude\n');
  vault.saveContent([{ file, datum: '2026-10-22T10:00:00Z', label: 'LinkedIn post', titel: 'Claude', bronnen: ['a'], onderwerpen: ['claude'] }]);
  vault.updateConcept(file, { titel: 'Claude', status: 'klaar' }, '# Mijn post\n');
  await vault.flush();
  const again = new Vault(store, { root: '' });
  await again.load();
  assert.equal(again.content[0].file, file);
  assert.match((await again.readConcept(file)).body, /Mijn post/);
  again.removeConcept(file);
  await again.flush();
  assert.ok(!again.concepts().some((c) => c.file === file));
});
