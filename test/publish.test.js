// From an answer in a chat to a post on a platform, and what it did there.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newCode, findCode, stripCode, parseResult, listItems, plain, xLength, visiblePart, threadPosts, outputFor, withHook,
  composeLink, hashtags, readMinutes, speakSeconds, KANAAL_VAN,
} from '../lib/platforms.js';
import { buildPrompt, SOORTEN } from '../lib/prompts.js';
import { statusOf, kanaalOf, cleanCijfers, interactie, cijferLine, shortNumber, weekRitme, weekStart, teMeten, resultaten, findProduction, ownChannel, matchProduction } from '../lib/content.js';
import { fetchStats, statsSource } from '../lib/stats.js';

const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });

test('code: an answer finds its way back by its code, and the code never shows', () => {
  const code = newCode(() => 0.5);
  assert.match(code, /^cm-[a-z2-9]{5}$/);
  assert.equal(findCode(`# Titel\n\nTekst.\n\n${code}`), code);
  assert.equal(findCode('Tekst zonder code, wel cm-kort en acm-abcde'), '');
  assert.equal(stripCode(`# Titel\n\nTekst.\n\n${code}\n`), '# Titel\n\nTekst.');
  assert.equal(stripCode(`Tekst.\n\n**Code: \`${code}\`**`), 'Tekst.');
  assert.equal(stripCode(`Tekst (${code}) loopt door.`), 'Tekst loopt door.');
  const prompt = buildPrompt({ soort: 'linkedin', items: [], code });
  assert.match(prompt, new RegExp(`Sluit af met een losse regel met alleen deze code: ${code}`));
  assert.doesNotMatch(buildPrompt({ soort: 'linkedin', items: [] }), /cm-/);
});

test('prompts: one post for X, a thread apart, Threads and YouTube, your own language', () => {
  assert.deepEqual(Object.keys(SOORTEN), ['linkedin', 'x', 'xthread', 'threads', 'instagram', 'carrousel', 'tiktok', 'videoscript', 'youtube', 'nieuwsbrief', 'vrij']);
  const x = buildPrompt({ soort: 'x', items: [] });
  assert.match(x, /Schrijf één post voor X voor mij\. Geen thread\./);
  assert.match(x, /## Alternatives/);
  assert.doesNotMatch(x, /## Thread/);
  assert.match(buildPrompt({ soort: 'xthread', items: [] }), /4 tot 7 posts, genummerd 1\/, 2\//);
  assert.match(buildPrompt({ soort: 'threads', items: [] }), /Maximaal 500 tekens[\s\S]*## Taal\n\nSchrijf alles in het Engels/);
  assert.match(buildPrompt({ soort: 'youtube', items: [] }), /## Titles[\s\S]*## Script[\s\S]*## Description/);
  // Your own language for a channel wins over the default.
  assert.match(buildPrompt({ soort: 'threads', items: [], taal: 'Nederlands' }), /## Taal\n\nSchrijf alles in het Nederlands/);
  assert.doesNotMatch(buildPrompt({ soort: 'vrij', items: [], taal: 'Engels' }), /## Taal/, 'a free task has no fixed language');
  // Turning what you made into another kind.
  const re = buildPrompt({ soort: 'x', items: [], basis: { label: 'LinkedIn post', tekst: '# Titel\n\nMijn post over agents.' } });
  assert.match(re, /## Wat ik hier al van maakte\n\nDit schreef ik eerder over dezelfde bronnen \(LinkedIn post\)[\s\S]*#### Titel\n\nMijn post over agents\./);
  assert.ok(re.indexOf('## Wat ik hier al van maakte') < re.indexOf('## Bronnen'));
  for (const soort of Object.keys(SOORTEN)) if (soort !== 'vrij') assert.ok(KANAAL_VAN[soort], `${soort} has a channel`);
});

const LINKEDIN = `# Agents in de planning

Drie teams lieten een agent hun week plannen.

Het leverde elk een **dag per week** op. Lees het [onderzoek](https://nina-ai.nl/onderzoek).

Wat zou jij met die dag doen?

#agents #planning

## Alternatieve hooks

- Een dag per week terug, zonder harder te werken.
- "Plannen is geen werk." Dat dachten drie teams ook.
- 20% van je week zit in overdrachten.

cm-ab2cd`;

test('result: parts, plain text and what you copy for LinkedIn', () => {
  const r = parseResult(LINKEDIN);
  assert.equal(r.titel, 'Agents in de planning');
  assert.match(r.hoofd, /^Drie teams[\s\S]*#agents #planning$/);
  assert.deepEqual(r.delen.map((d) => d.kop), ['Alternatieve hooks']);
  assert.doesNotMatch(r.delen[0].tekst, /cm-/);
  const out = outputFor('linkedin', LINKEDIN);
  assert.equal(out.kanaal, 'linkedin');
  assert.deepEqual(out.blokken.map((b) => [b.naam, b.rol]), [['Post', 'post'], ['Andere hook 1', 'keuze'], ['Andere hook 2', 'keuze'], ['Andere hook 3', 'keuze']]);
  const post = out.blokken[0];
  assert.equal(post.tekst, 'Drie teams lieten een agent hun week plannen.\n\nHet leverde elk een dag per week op. Lees het onderzoek (https://nina-ai.nl/onderzoek).\n\nWat zou jij met die dag doen?');
  assert.equal(post.limiet, 3000);
  assert.equal(post.tel, [...post.tekst].length);
  assert.equal(out.blokken[2].tekst, 'Plannen is geen werk." Dat dachten drie teams ook.', 'quotes around a whole option go');
  assert.equal(withHook(post.tekst, out.blokken[1].tekst).split('\n\n')[0], 'Een dag per week terug, zonder harder te werken.');
  assert.deepEqual(hashtags(post.tekst), [], 'never hashtags in what you copy');
  assert.ok(post.tekst.endsWith('Wat zou jij met die dag doen?'));
  // What shows before "...more".
  assert.deepEqual(visiblePart('Kort.'), { tekst: 'Kort.', meer: false });
  const long = visiblePart(`${'woord '.repeat(60)}\n\nTweede alinea.`);
  assert.equal(long.meer, true);
  assert.ok(long.tekst.length <= 210 && !long.tekst.endsWith(' '));
  assert.deepEqual(visiblePart('Een\n\nTwee\n\nDrie\n\nVier'), { tekst: 'Een\n\nTwee\n\nDrie', meer: true });
  assert.equal(plain('## Kop\n\n> citaat met *nadruk* en `code`\n\n---\n\n- punt'), 'Kop\n\ncitaat met nadruk en code\n\n- punt');
});

test('result: X counts its own way, a thread splits into posts', () => {
  assert.equal(xLength('Kort'), 4);
  assert.equal(xLength('Lees https://nina-ai.nl/een/heel/lang/adres/dat/niet/meetelt/als/lengte hier'), 5 + 23 + 5);
  assert.equal(xLength('Top 🚀'), 6, 'an emoji counts for two');
  const single = outputFor('x', '# T\n\nAgents plan your week now. Three teams got a day back.\n\n## Alternatives\n\n1. A day a week, back.\n2. Planning is not work.\n');
  assert.deepEqual(single.blokken.map((b) => [b.naam, b.rol, b.limiet]), [['Post', 'post', 280], ['Andere versie 1', 'keuze', 280], ['Andere versie 2', 'keuze', 280]]);
  assert.match(composeLink('x', single.blokken[0].tekst), /^https:\/\/x\.com\/intent\/post\?text=Agents%20plan/);
  const thread = outputFor('xthread', '# T\n\n## Thread\n\n1/ Agents plan your week.\n\n2/ Three teams tried it.\nA month long.\n\n3/ Would you?\n\n## Alternative hooks\n\n- Another opening.\n');
  assert.deepEqual(thread.blokken.map((b) => b.naam), ['Post 1', 'Post 2', 'Post 3', 'Andere opening 1']);
  assert.equal(thread.blokken[1].tekst, 'Three teams tried it.\nA month long.');
  // Not numbered: paragraphs are packed up to the limit.
  const packed = threadPosts(`${'a'.repeat(200)}\n\n${'b'.repeat(70)}\n\n${'c'.repeat(100)}`);
  assert.deepEqual(packed.map((p) => p.length), [272, 100]);
  assert.deepEqual(listItems('- een\n- twee\n  vervolg\n\n- drie'), ['een', 'twee\nvervolg', 'drie']);
  assert.deepEqual(listItems('Eerste alinea.\n\nTweede alinea.'), ['Eerste alinea.', 'Tweede alinea.']);
});

test('result: Instagram, TikTok, carrousel, YouTube and the newsletter', () => {
  const ig = outputFor('instagram', '# T\n\nThe caption. #ai\n\n## Reel\n\n[close-up] Say this out loud.\n\n## Alternative hooks\n\n- Hook one\n');
  assert.deepEqual(ig.blokken.map((b) => [b.naam, b.rol]), [['Caption', 'post'], ['Reel-script', 'script'], ['Andere hook 1', 'keuze']]);
  assert.equal(ig.blokken[0].limiet, 2200);
  const tt = outputFor('tiktok', '# T\n\n## Hook\n\n[tekst in beeld] Dit geloof je niet.\n\n## Uitleg\n\nZo werkt het.\n\n## Caption\n\nKort en krachtig #ai\n\n## Alternatieve hooks\n\n- Andere hook\n');
  assert.deepEqual(tt.blokken.map((b) => [b.naam, b.rol]), [['Script', 'script'], ['Caption', 'post'], ['Andere hook 1', 'keuze']]);
  assert.match(tt.blokken[0].tekst, /^Hook\n\[tekst in beeld\] Dit geloof je niet\.\n\nUitleg\nZo werkt het\.$/);
  assert.equal(speakSeconds('[in beeld: een hele lange aanwijzing die niet wordt uitgesproken] ' + 'woord '.repeat(150)), 60);
  const car = outputFor('carrousel', '# T\n\n## Slide 1\n\n**Titel**\nTekst\n\n## Slide 2\n\nMeer\n\n## Begeleidende post\n\nDe post.\n');
  assert.deepEqual(car.blokken.map((b) => [b.naam, b.rol]), [['Slide 1', 'tekst'], ['Slide 2', 'tekst'], ['Begeleidende post', 'post']]);
  const yt = outputFor('youtube', '# T\n\n## Titles\n\n- How agents plan your week\n- A day back, every week\n\n## Script\n\nThe hook.\n\n## Description\n\nTwo paragraphs.\n');
  assert.deepEqual(yt.blokken.map((b) => [b.naam, b.rol, b.limiet]), [['Titel 1', 'keuze', 100], ['Titel 2', 'keuze', 100], ['Beschrijving', 'post', 5000], ['Script', 'script', 0]]);
  const nb = outputFor('nieuwsbrief', '# T\n\n## Onderwerpregel\n\n1. Een\n2. Twee\n\n## TL;DR\n\n- punt\n\nDe editie.\n');
  assert.deepEqual(nb.blokken.map((b) => b.naam), ['Onderwerpregel 1', 'Onderwerpregel 2'], 'the edition itself goes to the editor');
  assert.equal(nb.kanaal, 'substack');
  assert.equal(composeLink('substack', '', { substack: 'https://nina.substack.com/' }), 'https://nina.substack.com/publish/post');
  assert.equal(composeLink('linkedin', 'x'.repeat(7000)), 'https://www.linkedin.com/feed/', 'too long for a link: the clipboard carries it');
  assert.equal(composeLink('instagram', 'caption'), 'https://www.instagram.com/');
  assert.equal(readMinutes('woord '.repeat(460)), 2);
});

test('monitor: stages, numbers, the week and what is worth measuring', () => {
  const now = new Date('2026-11-18T12:00:00').getTime(); // a Wednesday
  assert.equal(new Date(weekStart(now)).getDay(), 1);
  const p = (extra) => ({ file: `${extra.soort}-${extra.gepost || 'x'}.md`, datum: '2026-11-10T10:00:00Z', label: extra.soort, titel: 'T', bronnen: [], onderwerpen: [], klaar: true, ...extra });
  assert.deepEqual([statusOf({}), statusOf({ klaar: true }), statusOf({ klaar: true, gepost: '2026-11-16' })], ['prompt', 'klaar', 'gepost']);
  assert.deepEqual([kanaalOf({ soort: 'carrousel' }), kanaalOf({ soort: 'nieuwsbrief' }), kanaalOf({ soort: 'vrij' }), kanaalOf({ soort: 'vrij', kanaal: 'x' })], ['linkedin', 'substack', '', 'x']);
  assert.deepEqual(cleanCijfers({ weergaven: '1.234', likes: '1,2K', reacties: ' 5 ', gedeeld: '', bewaard: 'veel' }), { weergaven: 1234, likes: 1200, reacties: 5 });
  assert.equal(interactie({ likes: 10, reacties: 2, gedeeld: 1 }), 17);
  assert.equal(cijferLine({ weergaven: 12345, likes: 34 }), '12K weergaven · 34 likes');
  assert.deepEqual([shortNumber(999), shortNumber(1234), shortNumber(2500000)], ['999', '1,2K', '2,5 mln']);
  const list = [
    p({ soort: 'linkedin', gepost: '2026-11-16T09:00:00' }),
    p({ soort: 'carrousel', gepost: '2026-11-17T09:00:00' }),
    p({ soort: 'x', gepost: '2026-11-18T08:00:00' }),
    p({ soort: 'x', gepost: '2026-11-10T08:00:00' }),
    p({ soort: 'tiktok' }),
  ];
  assert.deepEqual(weekRitme(list, { linkedin: 3, x: 5, tiktok: 2 }, now).map((r) => `${r.naam} ${r.gepost}/${r.doel}`), ['LinkedIn 2/3', 'X 1/5', 'TikTok 0/2']);
  assert.deepEqual(weekRitme(list, {}, now).map((r) => r.naam), ['LinkedIn', 'X'], 'without goals: where you posted');
  // Measuring: after two days without numbers, and once more after a week.
  const measure = teMeten([
    p({ soort: 'x', gepost: '2026-11-17T12:00:00' }),
    p({ soort: 'linkedin', gepost: '2026-11-15T12:00:00' }),
    p({ soort: 'threads', gepost: '2026-11-08T12:00:00', cijfers: { likes: 3, gemeten: '2026-11-10T12:00:00' } }),
    p({ soort: 'tiktok', gepost: '2026-11-08T12:00:00', cijfers: { likes: 3, gemeten: '2026-11-16T12:00:00' } }),
    p({ soort: 'instagram' }),
  ], now);
  assert.deepEqual(measure.map((x) => x.soort), ['threads', 'linkedin']);
});

test('monitor: what works, per channel and per topic', () => {
  const p = (soort, onderwerpen, cijfers, n) => ({ file: `${soort}${n}.md`, soort, label: soort, titel: `${soort} ${n}`, onderwerpen, klaar: true, gepost: '2026-11-10', cijfers });
  const list = [
    p('x', ['claude'], { weergaven: 1000, likes: 10 }, 1),
    p('x', ['claude'], { weergaven: 9000, likes: 90, gedeeld: 10 }, 2),
    p('x', ['gemini'], { weergaven: 800, likes: 8 }, 3),
    p('linkedin', ['claude'], { weergaven: 5000, likes: 200, reacties: 30 }, 1),
    p('linkedin', ['gemini'], { weergaven: 4000, likes: 100, reacties: 10 }, 2),
    p('linkedin', ['gemini'], undefined, 3),
    { file: 'open.md', soort: 'x', label: 'x', titel: 'niet gepost', onderwerpen: ['claude'], klaar: true },
  ];
  const r = resultaten(list);
  assert.deepEqual([r.gepost, r.gemeten], [6, 5]);
  assert.deepEqual(r.kanalen.map((k) => `${k.naam} ${k.gepost}/${k.gemeten}`), ['X 3/3', 'LinkedIn 3/2']);
  assert.equal(r.beste[0].file, 'x2.md', 'far above the usual on its own channel');
  assert.equal(r.beste[0].keer, 12);
  assert.deepEqual(r.onderwerpen.map((t) => t.naam), ['claude', 'gemini']);
  assert.equal(r.scoort(list[1]), true);
  assert.equal(r.scoort(list[0]), false);
  assert.equal(r.scoort(list[5]), false, 'no numbers, no verdict');
  // A result finds its production by code, else the newest one still waiting.
  const prods = [{ file: 'b.md', soort: 'x', datum: '2026-11-12', code: 'cm-bbbbb' }, { file: 'a.md', soort: 'linkedin', datum: '2026-11-11', code: 'cm-aaaaa' }, { file: 'c.md', soort: 'x', datum: '2026-11-13', klaar: true }];
  assert.equal(findProduction(prods, { code: 'cm-aaaaa' }).file, 'a.md');
  assert.equal(findProduction(prods, { code: 'cm-zzzzz' }).file, 'b.md');
  assert.equal(findProduction(prods, { soort: 'linkedin' }).file, 'a.md');
  assert.equal(findProduction([{ file: 'c.md', klaar: true }]), null);
});

test('stats: X and TikTok give their numbers, others are typed', async () => {
  assert.deepEqual([statsSource('https://x.com/nina/status/123'), statsSource('https://www.tiktok.com/@nina/video/7300'), statsSource('https://www.linkedin.com/posts/x-activity-1')], ['x', 'tiktok', '']);
  const fake = async (url) => {
    if (url.startsWith('https://api.fxtwitter.com/status/123')) return json({ tweet: { text: 'Agents plan your week.', views: 12034, likes: 210, replies: 14, retweets: 30, quotes: 5, bookmarks: 44, created_at: 'Mon Nov 16 09:00:00 +0000 2026', author: { screen_name: 'nina_ai' } } });
    if (url.startsWith('https://www.tikwm.com/api/')) return json({ code: 0, data: { title: 'Drie hooks', play_count: 5400, digg_count: 320, comment_count: 12, share_count: 8, collect_count: 40, create_time: 1793000000, author: { unique_id: 'nina.ai' } } });
    return new Response('nee', { status: 404 });
  };
  const x = await fetchStats('https://x.com/nina_ai/status/123?s=20', { fetchImpl: fake });
  assert.deepEqual([x.weergaven, x.likes, x.reacties, x.gedeeld, x.bewaard, x.auteur], [12034, 210, 14, 35, 44, 'nina_ai']);
  assert.match(x.gepost, /^2026-11-16T09:00/);
  const tt = await fetchStats('https://www.tiktok.com/@nina.ai/video/7300', { fetchImpl: fake });
  assert.deepEqual([tt.weergaven, tt.likes, tt.reacties, tt.gedeeld, tt.bewaard], [5400, 320, 12, 8, 40]);
  assert.equal(await fetchStats('https://www.linkedin.com/posts/x', { fetchImpl: fake }), null);
  await assert.rejects(fetchStats('https://x.com/a/status/999', { fetchImpl: fake }));
});

test('own posts: recognised by your handle, matched to what you made', () => {
  const kanalen = { x: { naam: '@Nina_AI' }, tiktok: { naam: 'nina.ai' }, instagram: { naam: 'nina.ai' }, threads: { naam: 'nina.ai' }, linkedin: { naam: 'Olaf Lemmens' } };
  assert.equal(ownChannel({ type: 'tweet', url: 'https://x.com/nina_ai/status/123' }, kanalen), 'x');
  assert.equal(ownChannel({ type: 'tweet', url: 'https://x.com/nina_ai_fan/status/123' }, kanalen), '');
  assert.equal(ownChannel({ type: 'tiktok', url: 'https://www.tiktok.com/@nina.ai/video/7300' }, kanalen), 'tiktok');
  assert.equal(ownChannel({ type: 'instagram', url: 'https://www.instagram.com/reel/ABC/', auteur: 'NinA AI (@nina.ai)' }, kanalen), 'instagram');
  assert.equal(ownChannel({ type: 'instagram', url: 'https://www.instagram.com/reel/ABC/', auteur: 'Ander (@nina.ai.fans)' }, kanalen), '');
  assert.equal(ownChannel({ type: 'threads', url: 'https://www.threads.com/@nina.ai/post/ABC' }, kanalen), 'threads');
  assert.equal(ownChannel({ type: 'linkedin', url: 'https://lnkd.in/p/abc', auteur: 'Olaf  Lemmens' }, kanalen), 'linkedin');
  assert.equal(ownChannel({ type: 'linkedin', url: 'https://lnkd.in/p/abc', auteur: 'Olaf Lemmens' }, {}), '', 'no handle set: nothing is yours');
  const now = Date.parse('2026-11-18T12:00:00Z');
  const prods = [
    { file: 'a.md', soort: 'x', datum: '2026-11-16T10:00:00Z', klaar: true },
    { file: 'b.md', soort: 'x', datum: '2026-11-17T10:00:00Z', klaar: true },
    { file: 'c.md', soort: 'linkedin', datum: '2026-11-17T10:00:00Z', klaar: true },
    { file: 'd.md', soort: 'x', datum: '2026-11-10T10:00:00Z', klaar: true, gepost: '2026-11-11' },
  ];
  const texts = new Map([['a.md', '# T\n\nThree teams let an agent plan their week. Each got a day back.'], ['b.md', '# T\n\nSomething else entirely about image models and their new release.']]);
  assert.equal(matchProduction(prods, 'x', 'Three teams let an agent plan their week. Each got a day back!', texts, now).file, 'a.md');
  assert.equal(matchProduction(prods, 'x', 'A post that I wrote by hand about pricing and sales.', texts, now), null, 'not made here');
  assert.equal(matchProduction(prods, 'linkedin', '', texts, now).file, 'c.md', 'no text, one candidate');
  assert.equal(matchProduction(prods, 'x', '', texts, now), null, 'no text, two candidates: no guess');
});

test('videoscript: your own version of a video you saved as an example', async () => {
  const { normalizeMeta } = await import('../lib/frontmatter.js');
  const { Learner, emptyState } = await import('../lib/learn.js');
  assert.equal(normalizeMeta({ id: 'a', titel: 'T', doel: 'Maken' }).doel, 'maken');
  assert.equal(normalizeMeta({ id: 'a', titel: 'T', doel: 'iets' }).doel, undefined);
  const item = { meta: { titel: 'Drie fouten met AI-agents', type: 'tiktok', auteur: '@maker', url: 'https://www.tiktok.com/@maker/video/1' }, body: '# Drie fouten\n\n## Mijn notities\n\nOver AI in de bouw\n\n## Bron\n\nfragment\n' };
  const prompt = buildPrompt({ soort: 'videoscript', items: [item], code: 'cm-abc23' });
  assert.match(prompt, /Neem het format over, niet de inhoud/);
  assert.match(prompt, /## Hook \(0 tot 3 sec\)/);
  assert.match(prompt, /Mijn eigen notities \(weegt zwaar\):\nOver AI in de bouw/);
  assert.match(prompt, /Schrijf alles in het Nederlands/);
  assert.match(prompt, /cm-abc23/);
  const answer = ['# Drie fouten in de bouw', '', '## Format', '', '- Opent met het resultaat', '- Drie snelle stappen', '', '## Hook (0 tot 3 sec)', '', 'Dit kostte een aannemer 40 uur. [tekst op scherm: 40 uur]', '', '## Fout 1', '', 'Je begint met de tool.', '', '## Caption', '', 'Drie fouten die ik elke week zie', '', '## Alternatieve hooks', '', '- Stop met dit', '- Niemand vertelt je dit', '', 'cm-abc23'].join('\n');
  const out = outputFor('videoscript', answer);
  assert.equal(out.kanaal, 'tiktok');
  assert.deepEqual(out.blokken.map((b) => [b.naam, b.rol]), [['Format van de inspiratie', 'tekst'], ['Script', 'script'], ['Caption', 'post'], ['Andere hook 1', 'keuze'], ['Andere hook 2', 'keuze']]);
  const script = out.blokken[1].tekst;
  assert.ok(script.includes('Dit kostte een aannemer 40 uur') && script.includes('Je begint met de tool.'), 'the script holds every block');
  assert.ok(!script.includes('Opent met het resultaat') && !script.includes('cm-abc23'), 'without the format notes and the code, ready for the Teleprompter');
  if (Learner) {
    const l = new Learner(emptyState());
    l.maker('@maker', 'maken');
    assert.deepEqual(l.state.makers, {}, 'an example for a video says nothing about the maker');
  }
});

test('kanaalVanLink: the channel a link to a post is on', async () => {
  const { kanaalVanLink } = await import('../lib/platforms.js');
  const cases = {
    'https://www.linkedin.com/posts/olaf_agents-activity-1': 'linkedin', 'https://lnkd.in/abc': 'linkedin', 'https://nl.linkedin.com/feed/update/urn:li:activity:1': 'linkedin',
    'https://x.com/olaf/status/1': 'x', 'https://twitter.com/olaf/status/1': 'x', 'https://www.threads.com/@olaf/post/1': 'threads', 'https://www.threads.net/@olaf/post/1': 'threads',
    'https://www.instagram.com/reel/ABC/': 'instagram', 'https://www.tiktok.com/@olaf/video/1': 'tiktok', 'https://vm.tiktok.com/ZM1/': 'tiktok',
    'https://youtu.be/abc': 'youtube', 'https://www.youtube.com/shorts/abc': 'youtube', 'https://olaf.substack.com/p/agents': 'substack',
    'https://example.org/x': '', 'geen link': '', '': '',
  };
  for (const [url, k] of Object.entries(cases)) assert.equal(kanaalVanLink(url), k, url);
});

test('hashtags: never in a prompt, never in what you copy', async () => {
  const { withoutHashtags } = await import('../lib/platforms.js');
  const { forSubstack } = await import('../lib/richtext.js');
  for (const soort of Object.keys(SOORTEN)) {
    const prompt = buildPrompt({ soort, items: [], instructie: soort === 'vrij' ? 'Iets' : '', stijl: 'Gebruik 3 hashtags.' });
    assert.match(prompt, /## Geen hashtags\n\nGebruik nooit hashtags/, soort);
    assert.doesNotMatch(SOORTEN[soort].opdracht, /\d+ (tot \d+ )?(relevante )?hashtags|hashtags?, onderaan|Hooguit één hashtag/, `${soort} asks for none`);
  }
  assert.equal(withoutHashtags('Wat denk jij?\n\n#ai #agents #mkb'), 'Wat denk jij?');
  assert.equal(withoutHashtags('Wat denk jij? #ai #agents'), 'Wat denk jij?');
  assert.equal(withoutHashtags('Zo helpt #AI het #mkb vandaag.'), 'Zo helpt AI het mkb vandaag.');
  assert.equal(withoutHashtags('Stap #1 in C# met https://x.com/a#frag (#tip)'), 'Stap #1 in C# met https://x.com/a#frag (tip)');
  assert.equal(withoutHashtags('Één\n\n#a\n\nTwee'), 'Één\n\nTwee');
  const ig = outputFor('instagram', '# T\n\nCaption met een vraag?\n\n#reels #ai #agents\n\n## Reel\n\n[beeld] Zeg dit. #ai\n\n## Alternative hooks\n\n- Hook #een\n');
  assert.ok(ig.blokken.every((b) => !/(^|\s)#\p{L}/u.test(b.tekst)), JSON.stringify(ig.blokken.map((b) => b.tekst)));
  assert.equal(ig.blokken[0].tekst, 'Caption met een vraag?');
  const sub = forSubstack('Een alinea over #AI.\n\n#nieuwsbrief #ai');
  assert.ok(!sub.plain.includes('#') && !sub.html.includes('#'), sub.plain);
});
