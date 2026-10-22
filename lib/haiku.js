// Optional: smarter summaries and folder choice with Claude Haiku, the
// smallest Claude model. Off by default; needs your own API key, which stays
// on this device. Costs roughly a tenth of a cent per item.
const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@1.1.0';
export const HAIKU_MODEL = 'claude-haiku-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titel', 'samenvatting', 'kernpunten', 'map', 'tags', 'score'],
  properties: {
    titel: { type: 'string', description: 'Korte, concrete titel, max 90 tekens' },
    samenvatting: { type: 'string', description: '2 tot 3 zinnen in het Nederlands' },
    kernpunten: { type: 'array', items: { type: 'string' }, description: '3 tot 5 korte kernpunten in het Nederlands' },
    map: { type: 'string', description: 'Een bestaande map, of een nieuwe van 1 tot 3 woorden als niets past' },
    tags: { type: 'array', items: { type: 'string' }, description: '3 tot 5 tags, kleine letters, koppeltekens' },
    score: { type: 'number', description: '0 tot 100: hoe waardevol voor mijn content' },
  },
};

let cached = { key: '', client: null };
async function client(apiKey) {
  if (cached.key !== apiKey || !cached.client) {
    const { default: Anthropic } = await import(SDK_URL);
    cached = { key: apiKey, client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) };
  }
  return cached.client;
}

export async function enrichWithHaiku(apiKey, item, { folders, profiel }) {
  const claude = await client(apiKey);
  const msg = await claude.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: `Je ordent bewaarde links voor een AI-ondernemer en contentmaker. Schrijf Nederlands, kort, zonder em dashes en zonder emoji.\n\n<profiel>\n${profiel.slice(0, 3000)}\n</profiel>\n\nBestaande mappen: ${folders.join(', ') || '(nog geen)'}. Kies bij voorkeur een bestaande map, nooit "Inbox", "Concepten" of "Overig".`,
    messages: [{
      role: 'user',
      content: `<item>\nurl: ${item.url || '(geen)'}\ntype: ${item.type}\ntitel: ${item.titel || ''}\ngedeelde tekst: ${item.gedeeld || ''}\ninhoud:\n${String(item.tekst || '').slice(0, 12000)}\n</item>`,
    }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('Haiku wilde dit item niet verwerken');
  if (msg.stop_reason === 'max_tokens') throw new Error('Antwoord van Haiku werd afgekapt');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}
