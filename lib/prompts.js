// Builds a ready-to-paste prompt for Claude, ChatGPT or any other model.
// The app itself never writes the content: you stay in control of model and cost.
import { getSection, NOTES } from './frontmatter.js';

export const SOORTEN = {
  linkedin: {
    label: 'LinkedIn post',
    sub: 'Hook, verhaal, vraag',
    opdracht: `Schrijf een LinkedIn post voor mij (Nederlands, jij-vorm naar de lezer, ik-vorm voor mij).
- Eerste regel is de hook: een concreet cijfer, een scherpe stelling of een herkenbaar moment. Geen vraag als opener.
- Korte alinea's van 1 tot 2 zinnen, veel witruimte. 150 tot 250 woorden.
- Mijn eigen invalshoek als AI-ondernemer: wat betekent dit voor ondernemers in de praktijk?
- Eén alinea die nuanceert of tegengas geeft.
- Sluit af met één vraag aan de lezer. Maximaal 3 hashtags, onderaan.
Geef daarna onder "## Alternatieve hooks" drie andere openingszinnen.`,
  },
  carrousel: {
    label: 'Carrousel',
    sub: '7 tot 9 slides',
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
  nieuwsbrief: {
    label: 'Nieuwsbrief',
    sub: 'Story of weekly',
    opdracht: `Schrijf een editie van mijn nieuwsbrief (Nederlands, jij-vorm, voor ondernemers en professionals die AI praktisch willen inzetten).
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

function sourceBlock({ meta, body }, i) {
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
  const bron = demote(getSection(body, 'Bron').replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim());
  if (bron) lines.push(`Fragment:\n${bron.length > FRAGMENT ? `${bron.slice(0, FRAGMENT)}...` : bron}`);
  return lines.join('\n');
}

export function buildPrompt({ soort, items, instructie = '', profiel = '', stijl = '' }) {
  const spec = SOORTEN[soort] || SOORTEN.vrij;
  const parts = [
    `Je bent mijn ghostwriter. Hieronder staat wie ik ben, hoe ik schrijf, wat je moet maken en de bronnen die ik heb verzameld.`,
    `## Wie ik ben\n\n${profiel.replace(/^# .*\n/, '').trim() || 'Olaf Lemmens, oprichter van NinA AI Agency.'}`,
    `## Mijn stijl\n\n${stijl.replace(/^# .*\n/, '').trim()}`,
    `## Opdracht\n\n${spec.opdracht}`,
  ];
  if (instructie.trim()) parts.push(`## Extra instructie\n\n${instructie.trim()}`);
  parts.push(`## Bronnen\n\n${items.map(sourceBlock).join('\n\n')}`);
  parts.push('Geef alleen het eindresultaat in Markdown, zonder inleiding of uitleg vooraf. Begin met een regel "# " plus een korte werktitel.');
  return parts.join('\n\n');
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
