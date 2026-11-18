// Builds a ready-to-paste prompt for Claude, ChatGPT or any other model.
// The app itself never writes the content: you stay in control of model and cost.
import { getSection, NOTES, TRANSCRIPT } from './frontmatter.js';
import { parseHighlights } from './highlights.js';

export const SOORTEN = {
  linkedin: {
    label: 'LinkedIn post',
    sub: 'Nederlands, hook, verhaal, vraag',
    taal: 'Nederlands',
    opdracht: `Schrijf een LinkedIn post voor mij (jij-vorm naar de lezer, ik-vorm voor mij).
- Eerste regel is de hook: een concreet cijfer, een scherpe stelling of een herkenbaar moment. Geen vraag als opener.
- Korte alinea's van 1 tot 2 zinnen, veel witruimte. 150 tot 250 woorden.
- Mijn eigen invalshoek als AI-ondernemer: wat betekent dit voor ondernemers in de praktijk?
- Eén alinea die nuanceert of tegengas geeft.
- Sluit af met één vraag aan de lezer.
Geef daarna onder "## Alternatieve hooks" drie andere openingszinnen.`,
  },
  x: {
    label: 'Post op X',
    sub: 'Engels, één post',
    taal: 'Engels',
    opdracht: `Schrijf één post voor X voor mij. Geen thread.
- Maximaal 280 tekens: een scherpe observatie, een concreet cijfer of een stelling uit de bronnen, met mijn eigen invalshoek als AI-ondernemer.
- Direct en conversationeel, geen marketingtaal.
- Noem een bron of maker met @ als die op X zit en dat de post sterker maakt. Zet geen link in de post, tenzij ik erom vraag.
Geef daarna onder "## Alternatives" twee andere versies van dezelfde post met een andere invalshoek, als lijst, elk maximaal 280 tekens.`,
  },
  xthread: {
    label: 'Thread op X',
    sub: 'Engels, 4 tot 7 posts',
    taal: 'Engels',
    opdracht: `Schrijf een thread voor X voor mij.
- 4 tot 7 posts, genummerd 1/, 2/ enzovoort, elk maximaal 280 tekens. Zet de thread onder "## Thread".
- Post 1 is de hook en moet op zichzelf staan. De laatste post sluit af met een vraag of een duidelijke conclusie.
- Direct en conversationeel, geen marketingtaal, mijn eigen invalshoek als AI-ondernemer.
Geef onder "## Alternative hooks" drie andere openingsposts, als lijst.`,
  },
  threads: {
    label: 'Threads',
    sub: 'Engels, persoonlijk',
    taal: 'Engels',
    opdracht: `Schrijf één post voor Threads voor mij.
- Maximaal 500 tekens. Persoonlijker en losser dan op X: schrijf zoals ik het tegen een vakgenoot zou zeggen.
- Eén gedachte, met mijn eigen ervaring of mening erbij. Eindig met een vraag als dat natuurlijk voelt.
- Geen link.
Geef daarna onder "## Alternatives" twee andere versies met een andere invalshoek, als lijst.`,
  },
  instagram: {
    label: 'Instagram',
    sub: 'Engels, caption en reel',
    taal: 'Engels',
    opdracht: `Schrijf een Instagram post voor mij.
- Een caption van 80 tot 150 woorden. De eerste regel is de hook en moet werken voordat iemand op "meer" tikt.
- Korte regels met witruimte, mijn eigen invalshoek als AI-ondernemer, concreet en zonder vakjargon.
- Sluit af met een vraag of een duidelijke call to action.
Geef daarna onder "## Reel" een script van 20 tot 30 seconden, met tussen [ ] wat er in beeld komt, en onder "## Alternative hooks" drie andere openingszinnen.`,
  },
  carrousel: {
    label: 'Carrousel',
    sub: 'LinkedIn, 7 tot 9 slides',
    taal: 'Nederlands',
    opdracht: `Schrijf een LinkedIn carrousel van 7 tot 9 slides voor mij.
Per slide een kopje "## Slide N" met een titel (max 8 woorden) en max 30 woorden tekst.
Slide 1 is de hook, de laatste slide is de call to action. Geef daarna onder "## Begeleidende post" een korte post van max 80 woorden.`,
  },
  tiktok: {
    label: 'TikTok script',
    sub: '45 tot 60 seconden',
    opdracht: `Schrijf een TikTok/Reels script van 45 tot 60 seconden voor mij, gesproken Nederlands.
Opbouw met kopjes: Hook (0 tot 3 sec), Probleem, Uitleg, Voorbeeld, Call to action.
- De hook laat in 3 seconden zien waarom je moet blijven kijken.
- Schrijf zoals ik praat: kort, direct, geen schrijftaal.
- Zet bij elk blok tussen [ ] wat er in beeld komt (tekst op scherm, schermopname, b-roll).
Geef daarna onder "## Caption" een caption van max 150 tekens en onder "## Alternatieve hooks" drie andere hooks.`,
  },
  videoscript: {
    label: 'Videoscript',
    sub: 'Eigen versie, 30 tot 60 sec',
    taal: 'Nederlands',
    opdracht: `Schrijf het script voor mijn eigen korte video (TikTok, Reels, Shorts) van 30 tot 60 seconden, gesproken Nederlands.
De bronnen zijn video's of posts van andere makers die ik als inspiratie heb bewaard. Neem het format over, niet de inhoud: het soort hook, de opbouw, het tempo, hoe het beeld werkt en hoe het eindigt. Vul het met mijn eigen onderwerp en mijn invalshoek als AI-ondernemer. Staat in mijn notities een onderwerp, idee of hook, dan gebruik je die. Neem geen zinnen, grappen of voorbeelden van de maker over.
- Begin onder "## Format" met 3 tot 5 korte punten: wat je van de inspiratie overneemt (bijvoorbeeld: opent met het resultaat, drie snelle stappen, praat recht in de camera). Kon je bij een video niet zien wat er gebeurt omdat er geen transcript of beschrijving bij staat, zeg dat dan in één punt.
- Daarna het script, met een kopje per blok, te beginnen met "## Hook (0 tot 3 sec)". De hook laat in 3 seconden zien waarom je moet blijven kijken.
- Schrijf zoals ik praat: kort, direct, geen schrijftaal. Zet bij elk blok tussen [ ] wat er in beeld komt (tekst op scherm, schermopname, b-roll).
Geef daarna onder "## Caption" een caption van max 150 tekens en onder "## Alternatieve hooks" drie andere hooks.`,
  },
  youtube: {
    label: 'YouTube',
    sub: 'Engels, titel en script',
    taal: 'Engels',
    opdracht: `Maak de opzet voor een YouTube-video van 6 tot 10 minuten voor mij.
- Onder "## Titles": vijf titels van maximaal 60 tekens die nieuwsgierig maken zonder te overdrijven, als lijst.
- Onder "## Script": de eerste 30 seconden uitgeschreven (de hook en wat de kijker gaat leren), daarna de opbouw in blokken met per blok een kopje, de kernpunten en tussen [ ] wat er in beeld komt.
- Onder "## Description": een beschrijving van twee korte alinea's en daaronder hoofdstukken met tijden (0:00 Intro enzovoort).
Gebruik alleen feiten uit de bronnen.`,
  },
  nieuwsbrief: {
    label: 'Nieuwsbrief',
    sub: 'Nederlands, story of weekly',
    taal: 'Nederlands',
    opdracht: `Schrijf een editie van mijn nieuwsbrief (jij-vorm, voor ondernemers en professionals die AI praktisch willen inzetten).
Vaste bewegingen: 1) Ik zag iets: open op een concreet moment, cijfer of zin uit de bronnen, nooit op "deze week was er veel nieuws". 2) Dit is wat er echt gebeurde: feiten, namen, cijfers, met nuance. 3) Dit betekent het voor jou: sluit af met drie concrete acties voor maandag.
- Eén bron: diep uitgewerkt (story). Meerdere bronnen: benoem de rode draad in de intro en trek die in het slot weer dicht (weekly).
- Elk kopje is een mini-uitspraak, geen label.
- Minstens één alinea die tegen het eigen verhaal in gaat ("even eerlijk blijven").
- Gebruik alleen feiten uit de bronnen. Verzin geen cijfers of quotes. Twijfel je, zeg het.
Begin met "## Onderwerpregel" (3 opties) en "## TL;DR" (3 bullets), dan de editie, en eindig met "## Bronnen" (links).`,
  },
  vrij: {
    label: 'Vrije opdracht',
    sub: 'Jij bepaalt',
    opdracht: 'Voer de opdracht hieronder uit op basis van de bronnen.',
  },
};

const FRAGMENT = 3000;

// Never hashtags, on any channel. It goes in every prompt, above the style
// guide and the task, and the app also takes any that slip through out of
// what you copy.
export const NO_HASHTAGS = '## Geen hashtags\n\nGebruik nooit hashtags: niet in de tekst, niet onderaan, niet in een caption of beschrijving. Dit gaat voor wat de opdracht, mijn stijlgids of een voorbeeld anders zegt.';

// The transcript as it goes into a prompt: whole when it fits, otherwise the
// start and the end, because that is where makers put their hook and their point.
export function transcriptForPrompt(tekst, max) {
  const t = String(tekst || '').trim();
  if (t.length <= max) return t;
  const head = Math.round(max * 0.7);
  return `${t.slice(0, head).replace(/\s+\S*$/, '')}\n\n[... hier is een stuk weggelaten ...]\n\n${t.slice(-(max - head)).replace(/^\S*\s+/, '')}`;
}

// transcript: how many characters of a video's transcript go along.
function sourceBlock({ meta, body }, i, { transcript = 6000 } = {}) {
  const lines = [`### Bron ${i + 1}: ${meta.titel}`];
  if (meta.url) lines.push(`URL: ${meta.url}`);
  if (meta.auteur) lines.push(`Maker: ${meta.auteur}`);
  if (meta.samenvatting) lines.push(`Samenvatting: ${meta.samenvatting}`);
  const kern = getSection(body, 'Kernpunten');
  if (kern) lines.push(`Kernpunten:\n${kern}`);
  // Headings inside a source must not look like sections of the prompt itself.
  const demote = (t) => t.replace(/^#{1,3} /gm, '#### ');
  const notes = demote(getSection(body, NOTES));
  if (notes) lines.push(`Mijn eigen notities (weegt zwaar):\n${notes}`);
  const marks = parseHighlights(body);
  if (marks.length) {
    lines.push(`Wat ik markeerde (dit vond ik het belangrijkst, citeer letterlijk waar het past):\n${marks
      .map((h) => `- "${h.tekst}"${h.notitie ? `\n  Mijn notitie: ${h.notitie.replace(/\n/g, ' ')}` : ''}`).join('\n')}`);
  }
  const said = demote(getSection(body, TRANSCRIPT));
  if (said) lines.push(`Transcript (wat er in de video gezegd wordt):\n${transcriptForPrompt(said, transcript)}`);
  const bron = demote(getSection(body, 'Bron').replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim());
  if (bron) lines.push(`Fragment:\n${bron.length > FRAGMENT ? `${bron.slice(0, FRAGMENT)}...` : bron}`);
  return lines.join('\n');
}

// eerder: content made before on the same topics, from the content archive.
// lessen: what you learned from other makers, [{ titel, auteur, tekst }].
// taal: your own language for this kind, when it differs from the default.
// basis: { label, tekst } of something you already made from these sources,
// to turn into this kind. code: the line that brings the answer back to the
// right place in the app.
export function buildPrompt({ soort, items, instructie = '', profiel = '', stijl = '', eerder = [], lessen = [], taal = '', basis = null, code = '' }) {
  const spec = { ...(SOORTEN[soort] || SOORTEN.vrij) };
  if (taal && spec.taal) spec.taal = taal;
  const parts = [
    `Je bent mijn ghostwriter. Hieronder staat wie ik ben, hoe ik schrijf, wat je moet maken en de bronnen die ik heb verzameld.`,
    `## Wie ik ben\n\n${profiel.replace(/^# .*\n/, '').trim() || 'Olaf Lemmens, oprichter van NinA AI Agency.'}`,
    `## Mijn stijl\n\n${stijl.replace(/^# .*\n/, '').trim()}`,
    `## Opdracht\n\n${spec.opdracht}`,
  ];
  // Each platform has a fixed language; it wins over what the style guide says.
  if (spec.taal === 'Engels') {
    parts.push('## Taal\n\nSchrijf alles in het Engels: natuurlijk Engels zoals een native speaker het schrijft, geen vertaalde zinnen. Ook als de bronnen Nederlands zijn. Dit gaat voor wat mijn stijlgids over taal zegt; de rest van de stijlgids blijft gelden.');
  } else if (spec.taal) {
    parts.push(`## Taal\n\nSchrijf alles in het ${spec.taal}, ook als de bronnen in een andere taal zijn.`);
  }
  if (basis?.tekst?.trim()) {
    parts.push(`## Wat ik hier al van maakte\n\nDit schreef ik eerder over dezelfde bronnen (${basis.label}). Gebruik het als basis: dezelfde kern, feiten en invalshoek, maar opnieuw geschreven voor wat ik nu vraag. Neem geen zinnen letterlijk over als de vorm of de taal anders is.\n\n${basis.tekst.trim().replace(/^#{1,3} /gm, '#### ')}`);
  }
  parts.push(NO_HASHTAGS);
  if (instructie.trim()) parts.push(`## Extra instructie\n\n${instructie.trim()}`);
  const geleerd = lessen.filter((l) => String(l.tekst || '').trim());
  if (geleerd.length) {
    parts.push(`## Technieken die ik wil toepassen\n\nDit leerde ik van andere makers. Pas het toe in hoe je dit opbouwt en vertelt. Noem de technieken en de makers niet in de tekst zelf.\n\n${geleerd
      .map((l) => `### ${l.auteur ? `Van ${l.auteur}: ` : ''}${l.titel}\n${String(l.tekst).trim().replace(/^#{1,3} /gm, '#### ')}`).join('\n\n')}`);
  }
  if (eerder.length) {
    parts.push(`## Wat ik hier eerder over maakte\n\n${eerder.map((e) => `- ${e.datum}, ${e.label}: ${e.titel}`).join('\n')}\n\nKies een nieuwe invalshoek. Herhaal geen hooks, voorbeelden of conclusies van eerder.`);
  }
  parts.push(`## Bronnen\n\n${items.map((it, i) => sourceBlock(it, i, { transcript: items.length > 2 ? 4000 : 9000 })).join('\n\n')}`);
  parts.push(`Geef alleen het eindresultaat in Markdown, zonder inleiding of uitleg vooraf. Begin met een regel "# " plus een korte werktitel.${code ? ` Sluit af met een losse regel met alleen deze code: ${code} (daarmee komt je antwoord in mijn app op de juiste plek).` : ''}`);
  return parts.join('\n\n');
}

// For an item saved to learn from: what does this maker teach that I can use?
export function buildLessonPrompt({ item, profiel = '' }) {
  const video = ['youtube', 'tiktok', 'instagram', 'threads'].includes(item.meta.type);
  return [
    'Je bent mijn coach als contentmaker. Hieronder staat een bron van een andere maker. Ik wil die niet posten, ik wil ervan leren: wat vertelt of laat deze maker zien over het maken van goede content dat ik zelf kan toepassen?',
    `## Wie ik ben\n\n${profiel.replace(/^# .*\n/, '').trim() || 'Olaf Lemmens, oprichter van NinA AI Agency.'}`,
    `## Opdracht\n\nHaal de lessen uit deze bron.
- Schrijf elke les als één regel die ik kan toepassen, in de gebiedende wijs, met waar het kan een kort voorbeeld uit de bron. Geef de techniek een naam als de maker die gebruikt.
- Alleen wat de maker echt zegt of laat zien. Verzin niets en vul niet aan met algemene tips.${video ? '\n- Dit is een video. Staat hieronder geen transcript of samenvatting van wat er gezegd wordt, zeg dat dan en vraag me om het transcript, in plaats van te raden.' : ''}
- Schrijf in het Nederlands, ook als de bron Engels is.
Geef daarna onder "### Zo pas ik het toe" drie concrete manieren waarop ik dit gebruik in mijn eigen content (LinkedIn, TikTok, nieuwsbrief).`,
    `## Bron\n\n${sourceBlock(item, 0, { transcript: 40000 })}`,
    'Geef alleen het resultaat in Markdown, zonder inleiding: begin direct met de lessen als lijst ("- "), één les per regel.',
  ].join('\n\n');
}

// Prefilled chat links; long prompts go via the clipboard instead.
export function chatLinks(prompt) {
  const short = prompt.length <= 6000;
  const q = encodeURIComponent(prompt);
  return {
    claude: short ? `https://claude.ai/new?q=${q}` : 'https://claude.ai/new',
    chatgpt: short ? `https://chatgpt.com/?q=${q}` : 'https://chatgpt.com/',
  };
}
