// The newsletter editor: Markdown in, rich text that pastes into Substack out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toHtml, splitNewsletter, withoutSubjects, joinNewsletter, forSubstack, applyFormat } from '../lib/richtext.js';

const NIEUWSBRIEF = `# Agents plannen je week

## Onderwerpregel

1. **Een dag per week terug**
2. "Plannen is geen werk"
3. Drie teams, één agent

## TL;DR

- Agents plannen sneller dan mensen.
- De winst zit in minder overdrachten.

## Dit zag ik

Drie teams lieten een **agent** hun week plannen. Lees het [onderzoek](https://nina-ai.nl/onderzoek).
Tweede regel van dezelfde alinea.

> Even eerlijk blijven: het werkt niet voor elk team.

---

### Drie acties voor maandag

1. Kies één terugkerende afspraak.
2. Laat de agent hem plannen.

## Bronnen

- https://nina-ai.nl/onderzoek

cm-ab2cd`;

test('richtext: Markdown becomes clean HTML and nothing else', () => {
  const html = toHtml('## Kop\n\nEen **vette** en _schuine_ zin met `code` en een [link](https://nina-ai.nl).\nTweede regel.\n\n- een\n- twee\n  vervolg\n\n1. eerst\n2. dan\n\n> citaat\n\n---\n\n![alt](https://nina-ai.nl/a.png)');
  assert.equal(html, [
    '<h2>Kop</h2>',
    '<p>Een <strong>vette</strong> en <em>schuine</em> zin met <code>code</code> en een <a href="https://nina-ai.nl">link</a>.<br>Tweede regel.</p>',
    '<ul><li>een</li><li>twee<br>vervolg</li></ul>',
    '<ol><li>eerst</li><li>dan</li></ol>',
    '<blockquote><p>citaat</p></blockquote>',
    '<hr>',
    '<p><img src="https://nina-ai.nl/a.png" alt="alt"></p>',
  ].join('\n'));
  // Nothing that could run or style: text is escaped, odd addresses are no link.
  assert.equal(toHtml('<script>alert(1)</script> [x](javascript:alert(1)) & "q"'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; x &amp; &quot;q&quot;</p>');
  assert.doesNotMatch(html, /class=|style=|target=/);
  assert.equal(toHtml('Zie https://nina-ai.nl/x. Klaar.'), '<p>Zie <a href="https://nina-ai.nl/x">https://nina-ai.nl/x</a>. Klaar.</p>');
  assert.equal(toHtml('> [!tip] Onthoud\n> Begin klein.'), '<blockquote><p><strong>Onthoud</strong></p>\n<p>Begin klein.</p></blockquote>');
  assert.equal(toHtml('`**niet vet**`'), '<p><code>**niet vet**</code></p>', 'code stays as typed');
  assert.equal(toHtml('###### Diep'), '<h4>Diep</h4>');
});

test('editor: the title apart, subject lines as choices, and what goes to Substack', () => {
  const n = splitNewsletter(NIEUWSBRIEF);
  assert.equal(n.titel, 'Agents plannen je week');
  assert.deepEqual(n.onderwerpregels, ['Een dag per week terug', 'Plannen is geen werk', 'Drie teams, één agent']);
  assert.match(n.tekst, /^## Onderwerpregel[\s\S]*## Bronnen\n\n- https:\/\/nina-ai\.nl\/onderzoek$/);
  assert.doesNotMatch(n.tekst, /cm-ab2cd|# Agents plannen je week/);
  assert.equal(joinNewsletter({ titel: n.titel, tekst: n.tekst }), `${NIEUWSBRIEF.replace('\n\ncm-ab2cd', '')}\n`);
  assert.match(withoutSubjects(n.tekst), /^## TL;DR/);
  assert.equal(withoutSubjects('Geen opties hier.'), 'Geen opties hier.');
  const out = forSubstack(n.tekst);
  assert.match(out.html, /^<h2>TL;DR<\/h2>\n<ul><li>Agents plannen sneller dan mensen\.<\/li>/);
  assert.match(out.html, /<h2>Dit zag ik<\/h2>\n<p>Drie teams lieten een <strong>agent<\/strong> hun week plannen\. Lees het <a href="https:\/\/nina-ai\.nl\/onderzoek">onderzoek<\/a>\.<br>Tweede regel van dezelfde alinea\.<\/p>\n<blockquote><p>Even eerlijk blijven: het werkt niet voor elk team\.<\/p><\/blockquote>\n<hr>\n<h3>Drie acties voor maandag<\/h3>\n<ol>/);
  assert.doesNotMatch(out.html, /Onderwerpregel|Een dag per week terug|cm-ab2cd|<h1>/);
  assert.match(out.plain, /^TL;DR\n\n- Agents plannen sneller/);
});

test('editor: the toolbar wraps a selection or marks lines', () => {
  const t = 'Eerste regel\nTweede regel\nDerde';
  assert.deepEqual(applyFormat(t, 0, 6, 'vet'), { tekst: '**Eerste** regel\nTweede regel\nDerde', start: 2, end: 8 });
  assert.deepEqual(applyFormat(t, 7, 7, 'cursief'), { tekst: 'Eerste _tekst_regel\nTweede regel\nDerde', start: 8, end: 13 });
  assert.equal(applyFormat(t, 0, 6, 'link').tekst, '[Eerste](https://) regel\nTweede regel\nDerde');
  assert.equal(applyFormat('Zie https://nina-ai.nl', 4, 22, 'link').tekst, 'Zie [tekst](https://nina-ai.nl)');
  assert.equal(applyFormat(t, 3, 3, 'h2').tekst, '## Eerste regel\nTweede regel\nDerde');
  assert.equal(applyFormat('## Eerste regel', 3, 3, 'h2').tekst, 'Eerste regel', 'twice takes it off');
  assert.equal(applyFormat('## Eerste regel', 3, 3, 'h3').tekst, '### Eerste regel', 'another level replaces it');
  assert.equal(applyFormat(t, 0, 20, 'lijst').tekst, '- Eerste regel\n- Tweede regel\nDerde');
  assert.equal(applyFormat(t, 0, t.length, 'nummers').tekst, '1. Eerste regel\n2. Tweede regel\n3. Derde');
  assert.equal(applyFormat(t, 14, 14, 'citaat').tekst, 'Eerste regel\n> Tweede regel\nDerde');
  assert.equal(applyFormat(t, 5, 5, 'lijn').tekst, 'Eerste regel\n\n---\n\nTweede regel\nDerde');
});
