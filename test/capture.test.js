// Saving a post: its real text, maker and title, not the page around it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLinkedIn, cleanThreads, captionFromDescription, isWall, weakTitle, makerFromTitle } from '../lib/clean.js';
import { captionInHtml, postInHtml, canonicalInHtml } from '../lib/postdata.js';
import { fetchDetails, linkKey, normalizeUrl, refineSocial } from '../lib/capture.js';
import { LocalStore } from '../lib/store.js';
import { Vault } from '../lib/vault.js';
import { processCapture, needsEnrich, reEnrich, resortPlan, wronglyLearning, handPlaced, duplicatePlan, folderIdeas, ROUND } from '../lib/pipeline.js';
import { stories, sameText, sharedName } from '../lib/similar.js';
import { classify, trainModel, parseRules, suggestTags, trusted, LEARNED, BY_HAND } from '../lib/classify.js';
import { REGELS, REGELS_V1 } from '../lib/seeds.js';
import { getSection } from '../lib/frontmatter.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
const quote = (t) => t.split('\n').map((l) => `> ${l}`).join('\n');

// A LinkedIn post page as the reader returns it: login wall, the post, comments.
const LINKEDIN = `Agree & Join LinkedIn

By clicking Continue to join or sign in, you agree to LinkedIn’s [User Agreement](https://www.linkedin.com/legal/user-agreement?trk=x).

[Skip to main content](https://www.linkedin.com/posts/nina_agents-activity-7522939397776973824-62Wz#main-content)[LinkedIn](https://www.linkedin.com/?trk=public_post_nav-header-logo)

[![Image 2: View profile](https://media.licdn.com/dms/image/x/profile-displayphoto-scale_400_400/a)](https://www.linkedin.com/in/nina?trk=public_post_feed-actor-image)

[Nina de Vries](https://www.linkedin.com/in/nina?trk=public_post_feed-actor-name)

12,345 followers

 3h 

*   [Report this post](https://www.linkedin.com/uas/login?session_redirect=x&trk=public_post_ellipsis-menu-semaphore-sign-in-redirect)

Agents nemen de planning over. Drie teams lieten het een maand draaien en hielden er elk een dag per week aan over.

Wat mij opviel: de winst zat niet in snelheid, maar in minder overdrachten.

 …more 

[![Image 3](https://static.licdn.com/aero-v1/sc/h/x) 139](https://www.linkedin.com/signup/cold-join?trk=public_post_social-actions-reactions)

[Like](https://www.linkedin.com/signup/cold-join?trk=public_post_like-cta)[Comment](https://www.linkedin.com/signup/cold-join?trk=public_post_comment-cta)

 Share 
*   Copy

 Transcript  Transcript 

##### **Transcript**

 Hoe plant een agent je week? Hij leest je agenda en je mail.

[](https://www.linkedin.com/in/ander?trk=public_post_comment_actor-image)

[Ander Persoon](https://www.linkedin.com/in/ander?trk=public_post_comment_actor-name) 2h 

Een reactie van iemand anders die er niet bij hoort.
`;

// A Threads post page as the reader returns it: menus, the post, counters, a reply.
const THREADS = `[](https://www.threads.com/)

[Home](https://www.threads.com/)

New thread

[Log in](https://www.threads.com/login?show_choice_screen=false)

### [Thread](https://www.threads.com/@nina.ai/post/DfPSZN3AMvI)

8K views

[![Image 2: nina.ai's profile picture](https://scontent.cdninstagram.com/v/a.jpg)](https://www.threads.com/@nina.ai)

[nina.ai](https://www.threads.com/@nina.ai)

[![Image 3](https://scontent.xx.fbcdn.net/v/t.png) Design Threads](https://www.threads.com/search?q=design)

[9h](https://www.threads.com/@nina.ai/post/DfPSZN3AMvI)

Claude tekent verrassend goede svg-animaties. Voorbeelden op [nina-ai.nl](https://l.threads.com/?u=https%3A%2F%2Fnina-ai.nl)

![Image 4](https://scontent.cdninstagram.com/v/b.jpg)

Sorry, we're having trouble playing this video.

[Learn more](https://l.threads.com/?u=https%3A%2F%2Fhelp)

117

11

[![Image 5: iemand's profile picture](https://scontent.cdninstagram.com/v/c.jpg)](https://www.threads.com/@iemand)

Een antwoord dat er niet bij hoort.

Log in or sign up for Threads See what people are talking about and join the conversation.
`;

test('clean: a LinkedIn page gives the post, its maker and the transcript', () => {
  const c = cleanLinkedIn(quote(LINKEDIN));
  assert.equal(c.auteur, 'Nina de Vries');
  assert.equal(c.tekst, 'Agents nemen de planning over. Drie teams lieten het een maand draaien en hielden er elk een dag per week aan over.\n\nWat mij opviel: de winst zat niet in snelheid, maar in minder overdrachten.');
  assert.equal(c.transcript, 'Hoe plant een agent je week? Hij leest je agenda en je mail.');
  assert.equal(cleanLinkedIn('Agree & Join LinkedIn\n\nSign in to see more'), null, 'a wall without a post');
  // The short form of the page: the first paragraph is the post, the rest are comments.
  const short = cleanLinkedIn(quote('### Nina de Vries’s Post\n\n[![Image 1: View profile for Nina de Vries](https://media.licdn.com/a)](https://nl.linkedin.com/in/nina)\n\n5,471 followers\n\n2h\n\nAgents onthouden nu wat ze leerden. Zo werkt dat geheugen.\n\nEen reactie van iemand anders.\n'));
  assert.deepEqual(short, { auteur: 'Nina de Vries', tekst: 'Agents onthouden nu wat ze leerden. Zo werkt dat geheugen.', transcript: '' });
  assert.equal(isWall('Agree & Join LinkedIn\n\nBy clicking Continue'), true);
  assert.equal(isWall(LINKEDIN), false, 'the post is in there');
});

test('clean: a Threads page gives the post without menus, counters and replies', () => {
  const c = cleanThreads(quote(THREADS));
  assert.equal(c.auteur, '@nina.ai');
  assert.equal(c.tekst, 'Claude tekent verrassend goede svg-animaties. Voorbeelden op nina-ai.nl');
  assert.equal(c.post, 'https://www.threads.com/@nina.ai/post/DfPSZN3AMvI', 'the real address behind a share link');
  assert.equal(cleanThreads('Log in or sign up for Threads'), null);
});

test('clean: titles that say where, not what', () => {
  for (const t of ['instagram.com', 'www.threads.com', 'Threads', 'Jesse R (@jesse) • Instagram reel', 'Nina (@nina.ai) on Threads', 'The Rundown (@rundown) • Instagram photos and videos', '']) assert.equal(weakTitle(t), true, t);
  for (const t of ['Introducing Claude Duet', 'Agents nemen de planning over.', 'x.com is nu sneller dan ooit volgens deze test']) assert.equal(weakTitle(t), false, t);
  assert.deepEqual(makerFromTitle('Jesse Rurka (@jesse.r) • Instagram reel'), { naam: 'Jesse Rurka', handle: 'jesse.r', soort: 'reel' });
  assert.equal(makerFromTitle('Introducing Claude Duet'), null);
  assert.deepEqual(captionFromDescription('1,234 likes, 56 comments - nina.ai on November 4, 2026: "Zo bouw je een agent.\nStap 1."'), { tekst: 'Zo bouw je een agent.\nStap 1.', handle: 'nina.ai' });
  assert.equal(captionFromDescription('Gewoon een beschrijving van een site').tekst, '');
});

test('postdata: the caption of an Instagram embed, from its data or its HTML', () => {
  const html = '<div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/nina.ai/" target="_blank">nina.ai</a>Zo bouw je een agent in 3 stappen &amp; meer<br />Stap 1: begin klein #agents<div class="CaptionComments"><a href="#">View all 12 comments</a></div></div>';
  assert.deepEqual(captionInHtml(html), { tekst: 'Zo bouw je een agent in 3 stappen & meer\nStap 1: begin klein #agents', auteur: '@nina.ai' });
  assert.deepEqual(captionInHtml('<div>niets</div>'), { tekst: '', auteur: '' });
  const data = `<script>x({"shortcode_media":{"id":"1","shortcode":"ABC","display_url":"https:\\/\\/scontent.cdninstagram.com\\/a.jpg","taken_at_timestamp":1793000000,"owner":{"username":"nina.ai","full_name":"NinA AI","profile_pic_url":"https:\\/\\/scontent.cdninstagram.com\\/p.jpg"},"edge_media_to_caption":{"edges":[{"node":{"text":"De hele caption, ook na 120 tekens. ${'x'.repeat(130)}"}}]}}});</script>`;
  const post = postInHtml(data, 'ABC');
  assert.equal(post.tekst.length > 150, true, 'the full caption, not cut for a title');
  assert.equal(post.titel.length, 120);
  assert.deepEqual([post.auteur, post.naam, post.avatar, post.gepubliceerd.slice(0, 4)], ['@nina.ai', 'NinA AI', 'https://scontent.cdninstagram.com/p.jpg', '2026']);
  assert.equal(canonicalInHtml('<link rel="canonical" href="https://www.threads.com/@nina.ai/post/ABC"/>'), 'https://www.threads.com/@nina.ai/post/ABC');
});

test('capture: one key per post, whatever the link looks like', () => {
  assert.equal(linkKey('https://www.instagram.com/reel/DfQyszMvOCQ/?obrf=abc'), linkKey('https://instagram.com/p/DfQyszMvOCQ/?img_index=2&psln=x'));
  assert.equal(linkKey('https://x.com/a/status/2119902109709537708?a=yfYP'), linkKey('https://twitter.com/a/status/2119902109709537708'));
  assert.equal(linkKey('https://youtu.be/dQw4w9WgXcQ?si=x'), linkKey('https://youtube.com/shorts/dQw4w9WgXcQ?is=y'));
  assert.notEqual(linkKey('https://www.instagram.com/reel/AAA/'), linkKey('https://www.instagram.com/reel/BBB/'));
  assert.equal(linkKey('https://Example.org/Blog/?utm_source=x'), 'example.org/blog');
  assert.equal(normalizeUrl('https://x.com/a/status/1?a=Zz&s=20'), 'https://x.com/a/status/1');
  assert.equal(normalizeUrl('https://www.instagram.com/p/AAA/?img_index=2&vrfl=q'), 'https://www.instagram.com/p/AAA/');
});

test('capture: Instagram, Threads, LinkedIn and TikTok give the post itself', async () => {
  const calls = [];
  const embed = '<div class="Caption"><a class="CaptionUsername" href="#">kallaway</a>The hook is the whole video. Here is how I write one.<div class="CaptionComments"></div></div><img class="EmbeddedMediaImage" src="https://scontent.cdninstagram.com/c.jpg">';
  const fake = async (url) => {
    calls.push(url);
    if (url.includes('instagram.com/p/REEL1/embed')) return json({ data: { html: embed } });
    if (url.startsWith('https://api.microlink.io/') && url.includes('REEL2')) return json({ status: 'success', data: { title: 'Kallaway (@kallawaymarketing) • Instagram reel', description: '2,104 likes, 88 comments - kallawaymarketing on November 4, 2026: "Stop met intro\'s. Begin bij het einde."', author: 'Kallaway', image: { url: 'https://scontent.cdninstagram.com/m.jpg' } } });
    if (url.startsWith('https://r.jina.ai/https://www.threads.com/share/SHARE1')) return json({ data: { html: '<html>geen data</html>', content: THREADS, title: 'NinA (@nina.ai) on Threads' } });
    if (url.startsWith('https://r.jina.ai/https://lnkd.in/p/abc')) return json({ data: { title: 'LinkedIn', content: LINKEDIN } });
    if (url.startsWith('https://api.microlink.io/') && url.includes('lnkd.in')) return json({ status: 'success', data: { title: 'Agents nemen de planning over. | Nina de Vries | 17 comments', author: 'View Profile', image: { url: 'https://media.licdn.com/x.jpg' } } });
    if (url.startsWith('https://www.tikwm.com/api/')) return json({ code: 0, data: { title: 'Drie hooks die altijd werken #hooks', cover: 'https://p16.tiktokcdn.com/c.jpg', create_time: 1793000000, author: { nickname: 'NinA', unique_id: 'nina.ai', avatar: 'https://p16.tiktokcdn.com/a.jpg' } } });
    return new Response('nee', { status: 404 });
  };
  const ig = await fetchDetails({ url: 'https://www.instagram.com/reel/REEL1/', type: 'instagram' }, { fetchImpl: fake });
  assert.equal(ig.tekst, 'The hook is the whole video. Here is how I write one.');
  assert.equal(ig.auteur, '@kallaway');
  assert.equal(ig.afbeelding, 'https://scontent.cdninstagram.com/c.jpg');
  assert.ok(!calls.some((u) => u.includes('microlink')), 'the preview service is not needed when the embed has it all');

  // The embed gives nothing: the caption from the page description, the maker from the title.
  const ig2 = await fetchDetails({ url: 'https://www.instagram.com/reel/REEL2/', type: 'instagram' }, { fetchImpl: fake });
  assert.equal(ig2.tekst, "Stop met intro's. Begin bij het einde.");
  assert.equal(ig2.auteur, 'Kallaway (@kallawaymarketing)');
  assert.equal(ig2.titel, undefined, 'a title that only names the platform is dropped');

  const th = await fetchDetails({ url: 'https://www.threads.com/share/SHARE1/', type: 'threads' }, { fetchImpl: fake, previews: false });
  assert.equal(th.tekst, 'Claude tekent verrassend goede svg-animaties. Voorbeelden op nina-ai.nl');
  assert.equal(th.auteur, '@nina.ai');

  const li = await fetchDetails({ url: 'https://lnkd.in/p/abc', type: 'linkedin' }, { fetchImpl: fake });
  assert.match(li.tekst, /^Agents nemen de planning over\.[\s\S]*\*\*Transcript\*\*\n\nHoe plant een agent je week\?/);
  assert.doesNotMatch(li.tekst, /Agree & Join|Ander Persoon|hoort/);
  assert.equal(li.auteur, 'Nina de Vries', 'not "View Profile"');

  const tt = await fetchDetails({ url: 'https://www.tiktok.com/@nina.ai/video/7300', type: 'tiktok' }, { fetchImpl: fake });
  assert.deepEqual([tt.tekst, tt.auteur, tt.afbeelding], ['Drie hooks die altijd werken #hooks', 'NinA (@nina.ai)', 'https://p16.tiktokcdn.com/c.jpg']);
  assert.equal(refineSocial('linkedin', { tekst: 'Agree & Join LinkedIn\n\nSign in', auteur: 'View Profile' }).tekst, undefined);
});

test('pipeline: a post gets its first sentence as title, a double is found by its key', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: 'Contentmachine' });
  vault.flushDelay = 10_000;
  await vault.load();
  const fake = async (url) => {
    if (url.includes('instagram.com/p/REEL1/embed')) return json({ data: { html: '<div class="Caption"><a class="CaptionUsername">kallaway</a>The hook is the whole video. Here is how I write one. #hooks #storytelling<div class="CaptionComments"></div></div>' } });
    if (url.includes('instagram.com/p/LEEG1/embed')) return json({ data: { html: '<div>Log in</div>' } });
    if (url.startsWith('https://api.microlink.io/') && url.includes('LEEG1')) return json({ status: 'success', data: { title: 'Jesse Rurka (@jesse) • Instagram reel', author: 'Jesse Rurka' } });
    return new Response('nee', { status: 404 });
  };
  const m = await processCapture(vault, { url: 'https://www.instagram.com/reel/REEL1/?igsh=abc' }, { fetchImpl: fake });
  assert.equal(m.titel, 'The hook is the whole video.');
  assert.deepEqual(m.tags, ['hooks', 'storytelling']);
  assert.equal(m.samenvatting, 'The hook is the whole video. Here is how I write one. #hooks #storytelling');
  assert.equal(m.opgehaald, ROUND);
  assert.match((await vault.get(m.id)).body, /## Bron\n\n\[instagram\.com\]\([^)]+\) \| @kallaway\n\n> The hook is the whole video\./);
  const dup = await processCapture(vault, { url: 'https://instagram.com/p/REEL1/?img_index=3&vrfl=zzz' }, { fetchImpl: fake });
  assert.equal(dup.dubbel, true);
  assert.equal(dup.id, m.id);
  // No text at all: still a title that says what it is.
  const leeg = await processCapture(vault, { url: 'https://www.instagram.com/reel/LEEG1/' }, { fetchImpl: fake });
  assert.equal(leeg.titel, 'Reel van Jesse Rurka');
  assert.equal(leeg.auteur, 'Jesse Rurka (@jesse)');
  assert.ok(!leeg.tags.some((t) => ['jesse', 'rurka', 'reel', 'instagram'].includes(t)), `no name or platform as tag: ${leeg.tags}`);
});

test('tags: names and topics, never the maker, the platform or filler', () => {
  const tags = suggestTags({ titel: 'This is actually INSANE.', tekst: 'Fable 5.2 just created this in one shot. I gave Claude one prompt and it built a laptop app with Remotion.', auteur: 'Riley Brown (@rileybrown)' }, [{ titel: 'iets anders' }]);
  for (const bad of ['actually', 'insane', 'riley', 'brown', 'created', 'just']) assert.ok(!tags.includes(bad), `${bad} in ${tags}`);
  assert.ok(tags.includes('claude') || tags.includes('fable') || tags.includes('remotion'), `${tags}`);
  assert.deepEqual(suggestTags({ titel: 'x', tekst: 'Mooi werk #reel #AIagents #instagram https://scontent.cdninstagram.com/a#frag' }, []), ['aiagents'], 'platform hashtags and url fragments are no tags');
});

test('classify: learns from what you and the rules placed, never from its own guesses', () => {
  const rules = parseRules(REGELS);
  // Fifty items the model once guessed into one folder teach it nothing.
  const guessed = Array.from({ length: 50 }, (_, n) => ({ id: `g${n}`, titel: `Reel ${n} over van alles`, bron: 'instagram.com', map: 'Business & Sales', verrijkt: true, ordening: LEARNED }));
  assert.equal(trusted(guessed[0]), false);
  const model = trainModel(guessed);
  assert.equal(model.docs, 0);
  assert.equal(classify({ titel: 'Nog een reel', bron: 'instagram.com' }, model, rules).map, 'Inbox', 'a platform says nothing about the topic');
  // The word "linkedin" in a rule no longer catches every LinkedIn post.
  assert.equal(classify({ titel: 'Een post zonder onderwerp', bron: 'linkedin.com' }, model, parseRules(REGELS_V1)).map, 'Inbox');
  assert.equal(classify({ titel: 'Fable bouwt een 3D website met animaties' }, model, rules).map, 'Design & Vibe Coding');
  // What you placed by hand counts, also for the maker.
  const mine = [
    { id: 'a', titel: 'Hooks die werken', auteur: 'Kallaway (@kallaway)', map: 'Content Inspiratie', verrijkt: true, ordening: BY_HAND },
    { id: 'b', titel: 'Verhaal in drie stappen', auteur: 'Kallaway (@kallaway)', map: 'Content Inspiratie', verrijkt: true, ordening: BY_HAND },
    { id: 'c', titel: 'Model release van OpenAI', map: 'AI Nieuws', verrijkt: true, ordening: 'trefwoordregel' },
  ];
  const c = classify({ titel: 'Iets heel anders', auteur: '@kallaway' }, trainModel(mine), rules);
  assert.equal(c.map, 'Content Inspiratie');
  assert.equal(c.reden, LEARNED);
  // "@maker" in a rule files everything by that maker.
  assert.equal(classify({ titel: 'Iets', auteur: 'Nina (@nina.ai)' }, trainModel([]), parseRules('Eigen werk: @nina.ai')).map, 'Eigen werk');
  // Unsure: Inbox, with the folders to offer.
  const unsure = classify({ titel: 'Design en agents in een workflow' }, trainModel([]), rules);
  assert.ok(unsure.kandidaten.length >= 2, `${unsure.kandidaten}`);
});

test('tidy: an old note gets its text, title and tags; your notes stay', async () => {
  const store = new LocalStore({ storage: memoryStorage() });
  const vault = new Vault(store, { root: 'Contentmachine' });
  vault.flushDelay = 10_000;
  await vault.load();
  const old = vault.create({ titel: 'Jesse Rurka (@jesse) • Instagram reel', url: 'https://www.instagram.com/reel/OUD1/', bron: 'instagram.com', type: 'instagram', auteur: 'Jesse Rurka', map: 'Business & Sales', tags: ['jesse', 'rurka', 'reel'], verrijkt: true, ordening: LEARNED, opgeslagen: '2026-11-04T10:00:00Z', afbeelding: 'https://scontent.cdninstagram.com/o.jpg' },
    '# Jesse Rurka (@jesse) • Instagram reel\n\n## Mijn notities\n\nMijn eigen gedachte\n\n## Lessen\n\n- Een les\n\n## Bron\n\n[instagram.com](https://www.instagram.com/reel/OUD1/) | Jesse Rurka | 2026-11-04\n\n![](https://scontent.cdninstagram.com/o.jpg)\n');
  const li = vault.create({ titel: 'Agents nemen de planning over.', url: 'https://lnkd.in/p/abc', bron: 'lnkd.in', type: 'linkedin', auteur: 'View Profile', map: 'Business & Sales', tags: ['main-content'], verrijkt: true, ordening: 'trefwoordregel', samenvatting: 'Agree & Join LinkedIn By clicking Continue', opgeslagen: '2026-11-05T10:00:00Z' },
    `# Agents nemen de planning over.\n\n> [!abstract] Samenvatting\n> Agree & Join LinkedIn By clicking Continue\n\n## Mijn notities\n\n## Bron\n\n[lnkd.in](https://lnkd.in/p/abc) | View Profile | 2026-11-05\n\n${quote(LINKEDIN)}\n`);
  const tweet = vault.create({ titel: 'Een post op X', url: 'https://x.com/a/status/1', type: 'tweet', map: 'AI Nieuws', tags: ['x'], verrijkt: true, samenvatting: 'tekst' }, 'x');
  assert.deepEqual([needsEnrich(old), needsEnrich(li), needsEnrich(tweet)], [true, true, false]);
  await vault.flush();

  let asked = 0;
  const fake = async (url) => {
    asked += 1;
    if (url.includes('instagram.com/p/OUD1/embed')) return json({ data: { html: '<div class="Caption"><a class="CaptionUsername">jesse</a>Claude bouwt nu je hele website. Zo werkt het.<div class="CaptionComments"></div></div>' } });
    return new Response('nee', { status: 404 });
  };
  const up = await reEnrich(vault, old.id, { fetchImpl: fake });
  assert.equal(up.titel, 'Claude bouwt nu je hele website.');
  assert.equal(up.path, 'Business & Sales/2026-11-04 Claude bouwt nu je hele website.md', 'the file is named after the new title');
  assert.equal(up.samenvatting, 'Claude bouwt nu je hele website. Zo werkt het.');
  assert.ok(!up.tags.includes('jesse') && !up.tags.includes('reel'), `${up.tags}`);
  assert.equal(up.opgehaald, ROUND);
  assert.equal(needsEnrich(up), false);
  const body = (await vault.get(old.id)).body;
  assert.equal(up.auteur, 'Jesse Rurka (@jesse)', 'the name stays, the handle comes along');
  assert.match(body.trimStart(), /^# Claude bouwt nu je hele website\.\n\n> \[!abstract\] Samenvatting\n> Claude bouwt nu je hele website\. Zo werkt het\.\n\n## Mijn notities\n\nMijn eigen gedachte\n\n## Lessen\n\n- Een les\n\n## Bron\n\n\[instagram\.com\]\([^)]+\) \| Jesse Rurka \(@jesse\) \| 2026-11-04\n\n!\[\]\(https:\/\/scontent\.cdninstagram\.com\/o\.jpg\)\n\n> Claude bouwt nu je hele website\. Zo werkt het\.\n$/);

  // LinkedIn: the text is already in the note, so nothing is fetched.
  asked = 0;
  const up2 = await reEnrich(vault, li.id, { fetchImpl: fake });
  assert.equal(asked, 0);
  assert.equal(up2.auteur, 'Nina de Vries');
  assert.match(up2.samenvatting, /^Agents nemen de planning over\. Drie teams/);
  assert.deepEqual(up2.tags.includes('main-content'), false);
  const b2 = (await vault.get(li.id)).body;
  assert.doesNotMatch(b2, /Agree & Join|Ander Persoon/);
  assert.match(getSection(b2, 'Bron'), /\*\*Transcript\*\*/);
  // A note whose stored text holds no post gets no link or address as title.
  const th = vault.create({ titel: 'Iemand (@iemand) on Threads', url: 'https://www.threads.com/share/ABC/', bron: 'threads.com', type: 'threads', map: 'Inbox', tags: ['threads'], verrijkt: true, opgeslagen: '2026-11-08T10:00:00Z' },
    '# Iemand (@iemand) on Threads\n\n## Mijn notities\n\n## Bron\n\n[threads.com](https://www.threads.com/share/ABC/) | 2026-11-08\n\n![](https://scontent.cdninstagram.com/x.jpg)\n');
  const thFetch = async (url) => (url.includes('microlink') ? json({ status: 'success', data: { title: 'Iemand (@iemand) on Threads' } }) : new Response('nee', { status: 404 }));
  const up3 = await reEnrich(vault, th.id, { fetchImpl: thFetch });
  assert.equal(up3.titel, 'Threads-post van Iemand');
  assert.equal(up3.auteur, 'Iemand (@iemand)');
  assert.doesNotMatch(up3.titel, /https?:|\]\(/);
  // No service answers: the note waits for a next try.
  const wait = vault.create({ titel: 'instagram.com', url: 'https://www.instagram.com/p/WEG/', type: 'instagram', map: 'Inbox', tags: ['instagram'], verrijkt: true }, '# instagram.com\n\n## Mijn notities\n\n## Bron\n');
  assert.equal(await reEnrich(vault, wait.id, { fetchImpl: fake }), null);
  assert.equal(needsEnrich(vault.meta(wait.id)), true);
});

test('tidy: a plan to put automatically placed items where they belong', () => {
  const it = (id, titel, map, ordening, extra = {}) => ({ id, titel, map, ordening, verrijkt: true, tags: [], ...extra });
  const items = [
    it('1', 'Gemini 4 release: het nieuwe model van Google', 'Business & Sales', LEARNED),
    it('2', 'Unslop je dashboard design met deze skill', 'Business & Sales', LEARNED),
    it('3', 'Zo win je klanten met sales en marketing', 'Business & Sales', 'trefwoordregel'),
    it('4', 'Iets zonder herkenbare woorden', 'Business & Sales', LEARNED),
    it('5', 'OpenAI model release nummer twee', 'Content', LEARNED),
    it('6', 'Door Haiku geplaatst model nieuws', 'Eigen map', 'haiku'),
    it('7', 'Nog een release van een model', 'Inbox', 'nog niet zeker'),
  ];
  const plan = resortPlan(items, { rulesText: REGELS, correcties: [{ titel: 'OpenAI model release nummer twee', van: 'AI Nieuws', naar: 'Content' }] });
  const to = Object.fromEntries(plan.map((m) => [m.id, m.naar]));
  assert.deepEqual(to, { 1: 'AI Nieuws', 2: 'Design & Vibe Coding', 4: 'Inbox', 7: 'AI Nieuws' });
  assert.equal(to[5], undefined, 'what you moved yourself stays');
  assert.equal(to[6], undefined, 'what Haiku placed stays');
  assert.deepEqual([...handPlaced(items, [{ titel: 'OpenAI model release nummer twee', naar: 'Content' }])], ['5']);
  // With the text of the post, an item without telling title finds its place too.
  const withText = resortPlan(items, { rulesText: REGELS, texts: new Map([['4', 'Een agent met mcp en skills doet het werk']]) });
  assert.equal(withText.find((m) => m.id === '4').naar, 'AI Agents');
});

test('tidy: unopened items the app wrongly put under learning go back', () => {
  const items = [
    { id: 'a', titel: 'Introducing Claude Meetings', doel: 'leren', status: 'nieuw', auteur: 'Claude (@claudeai)' },
    { id: 'b', titel: 'Storytelling for short video', doel: 'leren', status: 'nieuw' },
    { id: 'c', titel: 'Kallaway over camera', doel: 'leren', status: 'gelezen' },
    { id: 'd', titel: 'Nieuws met lessen', doel: 'leren', status: 'nieuw', lessen: 2 },
    { id: 'e', titel: 'Gewoon nieuws', status: 'nieuw' },
  ];
  assert.deepEqual(wronglyLearning(items), ['a'], 'only unopened ones without lessons that the words do not explain');
  assert.deepEqual(wronglyLearning(items, { makers: { claudeai: { leren: 2, posten: 0 } } }), [], 'a maker you put there yourself stays');
});

test('offline: every file the app imports is in the service worker list', async () => {
  const fs = await import('node:fs');
  const dir = new URL('..', import.meta.url);
  const shell = new Set(fs.readFileSync(new URL('sw.js', dir), 'utf8').match(/'[^']+\.js'/g).map((x) => x.slice(1, -1)));
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(new URL(file, dir), 'utf8');
    // Static imports only: what is loaded on demand needs the network anyway.
    for (const m of src.matchAll(/^(?:import|export)[^;]*?from '(\.[^']+)'/gm)) walk(new URL(m[1], new URL(file, 'file:///')).pathname.slice(1));
  };
  walk('app.js');
  const missing = [...seen].filter((f) => !shell.has(f));
  assert.deepEqual(missing, [], `not cached for offline use: ${missing}`);
});

test('stories: items on the same story stack, others stay apart', () => {
  const day = (n) => `2026-11-${String(n).padStart(2, '0')}T10:00:00Z`;
  const it = (id, titel, samenvatting = '', extra = {}) => ({ id, titel, samenvatting, tags: [], opgeslagen: day(10), ...extra });
  const items = [
    it('d1', 'Introducing Nova Duet', 'A new app where Nova works as a proactive agent. The preview opens by waitlist.'),
    it('d2', 'Nova Duet onboarding', 'In case you are curious how it starts.'),
    it('d3', 'Small detail, big feeling', 'In Nova Duet you swipe right to hand off a task.'),
    it('d4', 'Nieuwe agent als antwoord op de concurrentie: Nova Duet-agent', 'Het bedrijf komt met een agent die zelf taken oppakt.'),
    it('r1', 'Robot hond leert lopen in een dag', 'Onderzoekers trainden een robot met simulatie.'),
    it('r2', 'Agents in het mkb: drie voorbeelden', 'Hoe kleine bedrijven agents inzetten voor planning.'),
    // The same post saved twice, and the same announcement on two platforms.
    it('x1', 'This changes everything.', 'Orion 5 just made a full game in one shot and I did it live.', { url: 'https://x.com/a/status/1' }),
    it('x2', 'This changes everything.', 'Orion 5 just made a full game in one shot and I did it live.', { url: 'https://x.com/a/status/1?a=b' }),
    // A site name, a series label and a big brand tie nothing together.
    it('s1', 'Bank zet alle medewerkers op een AI-assistent | TechSite', 'Een grote bank rolt een assistent uit.'),
    it('s2', 'Meeste bedrijven zien nog geen winst van AI | TechSite', 'Volgens een econoom levert AI nog weinig op.'),
    it('v1', 'Weekcheck: Lumen zet een stap vooruit', 'Een test van het nieuwe model Lumen.'),
    it('v2', 'Weekcheck: Kaart-app krijgt een agent', 'Een test van een heel ander product.'),
    it('g1', 'Google brengt een zoekfunctie uit voor recepten', 'Koken wordt makkelijker.'),
    it('g2', 'Google past zijn kantoorbeleid aan', 'Medewerkers komen vaker naar kantoor.'),
    // The same name, but months apart: another story.
    it('o1', 'Nova Duet krijgt een grote update', 'Nieuwe functies voor de agent.', { opgeslagen: '2027-03-01T10:00:00Z' }),
    // A vault holds much more than one story.
    ...['Zo schrijf je een hook die blijft hangen', 'Prijzen verhogen zonder klanten te verliezen', 'Een nieuwsbrief opzetten in een middag', 'Waarom vergaderingen korter kunnen',
      'Stemherkenning op je eigen laptop', 'Wetgeving over data in de zorg', 'Een dashboard bouwen zonder code', 'Hoe een webwinkel zijn voorraad voorspelt',
      'Camera kiezen voor korte video', 'Lessen uit een mislukte lancering', 'Sneller typen met spraak', 'Een chatbot voor de klantenservice testen']
      .map((titel, n) => it(`z${n}`, titel, 'Een praktijkverhaal met een eigen onderwerp en eigen woorden.')),
  ];
  const groups = stories(items);
  const of = (id) => groups.find((g) => g.ids.includes(id));
  assert.deepEqual(of('d1').ids.sort(), ['d1', 'd2', 'd3', 'd4']);
  assert.equal(of('d1').naam, 'Nova Duet', 'called after the name that ties it together');
  assert.deepEqual(of('x1').ids.sort(), ['x1', 'x2']);
  assert.equal(of('x1').naam, 'This changes everything.', 'doubles carry their title');
  for (const id of ['r1', 'r2', 's1', 's2', 'v1', 'v2', 'g1', 'g2', 'o1']) assert.equal(of(id), undefined, `${id} stays apart`);
  assert.equal(new Set(groups.map((g) => g.naam).filter(Boolean)).size, groups.filter((g) => g.naam).length, 'no two groups share a name');
  // Two posts behind the same login wall are not the same story.
  const wall = 'Agree & Join LinkedIn By clicking Continue to join or sign in, you agree to the User Agreement, Privacy Policy and Cookie Policy.';
  const walled = stories([...items, it('w1', 'Een post over prijzen', wall), it('w2', 'Een heel andere post over werving', wall)]);
  assert.equal(walled.find((g) => g.ids.includes('w1')), undefined);
  assert.ok(sameText('Orion 5 just made a full game in one shot and I did it live on stream today', 'Orion 5 just made a full game in one shot and I did it live on stream today!') > 0.9);
  assert.equal(sameText('kort', 'kort'), 0, 'too little to compare');
  assert.equal(sharedName([{ titel: 'Introducing Nova Duet' }, { titel: 'Nova Duet onboarding' }, { titel: 'Iets anders' }]), 'Nova Duet');
});

test('tidy: doubles keep the copy you did most with; a full Inbox suggests a folder', () => {
  const it = (id, url, extra = {}) => ({ id, url, titel: id, status: 'gelezen', opgeslagen: `2026-11-0${id.slice(-1)}T10:00:00Z`, tags: [], ...extra });
  const items = [
    it('a1', 'https://x.com/a/status/1'), it('a2', 'https://x.com/a/status/1?a=zz', { ster: true }), it('a3', 'https://twitter.com/a/status/1', { status: 'archief' }),
    it('b1', 'https://www.instagram.com/reel/AAA/?igsh=1'), it('b2', 'https://www.instagram.com/p/AAA/', { status: 'gebruikt' }),
    it('c1', 'https://example.org/een'), it('c2', 'https://example.org/twee'),
  ];
  assert.deepEqual(duplicatePlan(items), [{ keep: 'a2', drop: ['a1'] }, { keep: 'b2', drop: ['b1'] }]);
  const inbox = (id, tags, extra = {}) => ({ id, map: 'Inbox', status: 'nieuw', tags, ...extra });
  const ideas = folderIdeas([
    inbox('1', ['robots', 'nvidia']), inbox('2', ['robots']), inbox('3', ['robots', 'reel']), inbox('4', ['robots']),
    inbox('5', ['ai-agents']), inbox('6', ['ai-agents']), inbox('7', ['ai-agents']), inbox('8', ['ai-agents']), inbox('9', ['ai-agents']),
    inbox('10', ['robots'], { status: 'archief' }), { id: '11', map: 'AI Nieuws', tags: ['robots'] },
  ], ['Inbox', 'AI Agents', 'AI Nieuws']);
  assert.deepEqual(ideas, [{ tag: 'robots', ids: ['1', '2', '3', '4'], naam: 'Robots' }], 'a topic with a folder already needs none');
});
