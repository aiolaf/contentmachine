// Ordering without AI. Two signals pick a folder:
// 1. keyword rules from _systeem/regels.md (works from day one), and
// 2. a naive Bayes model trained on how you sorted earlier items (learns as you go).
// Tags come from the most distinctive words, the summary from the opening sentences.

const STOP = new Set(`
de het een en van in op te dat die is zijn voor met als aan er maar om ook dan door bij nog naar uit
wat wel niet geen dit deze heb hebt heeft had was waren wordt worden werd kan kun kunnen moet moeten
zal zou zullen mijn jouw jij je hij zij ze we wij ons onze hun haar hem mij me u uw over tot meer
veel heel zo nu al alle alles iets niets hoe waar wie waarom want omdat dus toch even weer zelf
the and for are but not you your all any can had her was one our out has have this that with from
they will would there their what about which when make like time just know take into year good some
them see other than then now look only come its over think also back after use two how work first
well way even new want because these give day most into its it's i'm don't via http https www com
nieuwe nieuw eerste tweede grote groot kleine klein goed goede beter beste echt steeds alleen gaan gaat ging
maken maakt gemaakt doen doet laat laten komt komen staat staan zien ziet weet weten wil willen bouw lees
jaar week dag tijd mensen manier waarbij welke elke iedere iemand onder tussen sinds zonder binnen hier daar
best more using get gets got why who made makes still really very much many most first last next
`.split(/\s+/).filter(Boolean));

export function tokenize(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [])
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

// Words that describe an item: title counts double, then summary, text, tags and source.
export function itemTokens(item) {
  const tokens = [
    ...tokenize(item.titel), ...tokenize(item.titel),
    ...tokenize(item.samenvatting),
    ...tokenize(String(item.tekst || '').slice(0, 2000)),
    ...tokenize(item.gedeeld),
  ];
  for (const t of item.tags || []) tokens.push(`tag:${t}`);
  if (item.bron) tokens.push(`bron:${item.bron}`);
  return tokens;
}

export function trainModel(items) {
  const folders = new Map();
  const vocab = new Set();
  for (const it of items) {
    if (!it.map || it.map === 'Inbox' || !it.verrijkt) continue;
    const f = folders.get(it.map) || { docs: 0, total: 0, counts: new Map() };
    f.docs += 1;
    for (const t of itemTokens(it)) {
      f.counts.set(t, (f.counts.get(t) || 0) + 1);
      f.total += 1;
      vocab.add(t);
    }
    folders.set(it.map, f);
  }
  const docs = [...folders.values()].reduce((s, f) => s + f.docs, 0);
  return { folders, vocab: vocab.size, docs };
}

// Folder probabilities, best first.
export function predict(model, tokens) {
  if (model.folders.size < 2 || !tokens.length) return [];
  const scores = [];
  for (const [name, f] of model.folders) {
    let lp = Math.log(f.docs / model.docs);
    for (const t of tokens) lp += Math.log(((f.counts.get(t) || 0) + 1) / (f.total + model.vocab + 1));
    scores.push([name, lp]);
  }
  const max = Math.max(...scores.map((s) => s[1]));
  const exp = scores.map(([n, lp]) => [n, Math.exp(lp - max)]);
  const sum = exp.reduce((s, e) => s + e[1], 0);
  return exp.map(([folder, e]) => ({ folder, p: e / sum })).sort((a, b) => b.p - a.p);
}

// "Mapnaam: woord, nog een woord" lines; headings and comments are ignored.
export function parseRules(text) {
  const rules = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*[-*]?\s*([^:#>`][^:]{0,58}):\s*(.+)$/);
    if (!m) continue;
    const words = m[2].split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.length) rules.push({ folder: m[1].trim(), words });
  }
  return rules;
}

function ruleScores(rules, item) {
  const hay = ` ${[item.titel, item.titel, item.samenvatting, item.gedeeld, String(item.tekst || '').slice(0, 3000), item.bron]
    .filter(Boolean).join(' ').toLowerCase()} `;
  const scores = new Map();
  for (const r of rules) {
    let hits = 0;
    for (const w of r.words) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^\\p{L}\\p{N}]|$)`, 'gu');
      hits += (hay.match(re) || []).length;
    }
    if (hits) scores.set(r.folder, (scores.get(r.folder) || 0) + hits);
  }
  return [...scores].sort((a, b) => b[1] - a[1]);
}

// Returns { map, zekerheid (0..1), reden }. Unsure items stay in Inbox,
// where your own sorting teaches the model.
export function classify(item, model, rules) {
  const bayes = predict(model, itemTokens(item));
  const top = bayes[0];
  const trained = top && (model.folders.get(top.folder)?.docs || 0) >= 3;
  if (trained && top.p >= 0.7) return { map: top.folder, zekerheid: top.p, reden: 'geleerd van jouw mappen' };
  const hits = ruleScores(rules, item);
  if (hits.length && (hits.length === 1 || hits[0][1] > hits[1][1])) {
    return { map: hits[0][0], zekerheid: Math.min(0.9, 0.5 + 0.1 * hits[0][1]), reden: 'trefwoordregel' };
  }
  if (trained && top.p >= 0.5) return { map: top.folder, zekerheid: top.p, reden: 'geleerd van jouw mappen' };
  return { map: 'Inbox', zekerheid: 0, reden: 'nog niet zeker' };
}

// Distinctive words as tags (tf-idf against everything already saved) plus #hashtags.
// The item's own #hashtags when it has them (they drive the bundles), otherwise
// the most distinctive words.
export function suggestTags(item, corpus, max = 4) {
  const hashtags = [...new Set((String(`${item.gedeeld || ''} ${item.tekst || ''}`).match(/#[\p{L}\p{N}_-]{2,30}/gu) || [])
    .map((h) => h.slice(1).toLowerCase().replace(/[-_]+$/, '')))];
  if (hashtags.length) return hashtags.slice(0, 8);
  const tf = new Map();
  for (const t of [...tokenize(item.titel), ...tokenize(item.titel), ...tokenize(String(item.tekst || item.gedeeld || '').slice(0, 3000))]) {
    if (t.includes("'") || t.length > 24) continue;
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  const n = corpus.length + 1;
  const df = new Map();
  for (const it of corpus) for (const t of new Set(tokenize(`${it.titel} ${it.samenvatting || ''}`))) df.set(t, (df.get(t) || 0) + 1);
  const ranked = [...tf].map(([t, f]) => [t, f * Math.log(n / (1 + (df.get(t) || 0)) + 1)]).sort((a, b) => b[1] - a[1]);
  return [...new Set([...hashtags, ...ranked.map(([t]) => t)])].slice(0, max).map((t) => t.replace(/\s+/g, '-'));
}

// Opening sentences, skipping lines that look like navigation or markup.
export function summarize(text, max = 280) {
  const lines = String(text || '').split('\n').map((l) => l.trim())
    .filter((l) => l.length > 40 && !/^(#|!\[|\[|>|\||-{3})/.test(l) && !/cookie|javascript|log in|sign in|inloggen/i.test(l));
  const sentences = lines.join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').match(/[^.!?]+[.!?]+/g) || [];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
  }
  return (out || lines.join(' ').slice(0, max)).trim();
}
