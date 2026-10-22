// Bundles: groups of hashtags that form a topic inside a folder, for example
// "Claude" = #claude #anthropic #claude-code in "AI Agents". Only hashtags that
// recur become a bundle; hashtags that keep appearing together merge into one.
// Everything lives in _systeem/bundels.md, so it can be edited in Obsidian.

export const DEFAULT_THRESHOLD = 3;
export const OTHER = '__overig';
const ACRONYMS = new Set(['ai', 'api', 'llm', 'llms', 'mcp', 'crm', 'seo', 'mkb', 'gpt', 'saas', 'b2b', 'rag', 'eu', 'ux', 'ui', 'roi', 'kpi']);
const BRANDS = {
  openai: 'OpenAI', chatgpt: 'ChatGPT', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', github: 'GitHub',
  deepmind: 'DeepMind', notebooklm: 'NotebookLM', hubspot: 'HubSpot', iphone: 'iPhone', macos: 'macOS', elevenlabs: 'ElevenLabs',
  claudecode: 'Claude Code', midjourney: 'Midjourney', perplexity: 'Perplexity', xai: 'xAI', huggingface: 'Hugging Face',
};

const normTag = (t) => String(t).trim().replace(/^#/, '').toLowerCase();
const tagList = (s) => String(s || '').split(/[\s,]+/).map(normTag).filter(Boolean);

// "ai-agents" -> "AI agents", "n8n" -> "n8n", "claude" -> "Claude".
export function bundleName(tag) {
  const words = String(tag).split('-').map((w) => BRANDS[w] || (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const name = words.join(' ');
  return /\d/.test(name) ? name : name.charAt(0).toUpperCase() + name.slice(1);
}

export function emptyModel() {
  return { intro: '', drempel: DEFAULT_THRESHOLD, folders: new Map() };
}

function folderEntry(model, folder) {
  if (!model.folders.has(folder)) model.folders.set(folder, { bundels: [], genegeerd: new Set() });
  return model.folders.get(folder);
}

// Format:
//   drempel: 3
//   ## AI Agents
//   - Claude: #claude #anthropic
//   Genegeerd: #systemen #nieuwe
export function parseBundles(text) {
  const model = emptyModel();
  const src = String(text || '');
  const first = src.search(/^## /m);
  model.intro = (first === -1 ? src : src.slice(0, first)).replace(/^drempel:.*$/gim, '').trim();
  const d = src.match(/^drempel:\s*(\d+)/im);
  if (d) model.drempel = Math.max(2, Number(d[1]));
  let current = null;
  for (const line of src.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = folderEntry(model, h[1]);
      continue;
    }
    if (!current) continue;
    const ign = line.match(/^\s*genegeerd:\s*(.*)$/i);
    if (ign) {
      for (const t of tagList(ign[1])) current.genegeerd.add(t);
      continue;
    }
    const b = line.match(/^\s*[-*]\s*([^:]+?):\s*(.*)$/);
    if (b) {
      const tags = [...new Set(tagList(b[2]))];
      if (tags.length) current.bundels.push({ naam: b[1].trim(), tags });
    }
  }
  return model;
}

export function stringifyBundles(model) {
  const parts = [model.intro.trim(), `drempel: ${model.drempel}`];
  const folders = [...model.folders].filter(([, f]) => f.bundels.length || f.genegeerd.size).sort(([a], [b]) => a.localeCompare(b));
  for (const [folder, f] of folders) {
    const lines = [`## ${folder}`, ''];
    for (const b of f.bundels) lines.push(`- ${b.naam}: ${b.tags.map((t) => `#${t}`).join(' ')}`);
    if (f.genegeerd.size) lines.push('', `Genegeerd: ${[...f.genegeerd].sort().map((t) => `#${t}`).join(' ')}`);
    parts.push(lines.join('\n'));
  }
  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

export function bundlesFor(model, folder) {
  return model.folders.get(folder)?.bundels || [];
}

// The bundle an item belongs to in its folder: the one sharing most hashtags.
export function bundleOf(item, model) {
  let best = null;
  let bestHits = 0;
  const tags = new Set((item.tags || []).map(normTag));
  for (const b of bundlesFor(model, item.map)) {
    const hits = b.tags.filter((t) => tags.has(t)).length;
    if (hits > bestHits) {
      best = b;
      bestHits = hits;
    }
  }
  return best;
}

// New bundles and additions to existing ones, per folder. Returns
// { model, changes: [{ map, naam, tags, nieuw }] } without touching the input model.
export function autoBundle(items, model) {
  const next = parseBundles(stringifyBundles(model));
  const changes = [];
  const byFolder = new Map();
  for (const it of items) {
    if (!it.map || it.map === 'Inbox' || it.status === 'archief') continue;
    if (!byFolder.has(it.map)) byFolder.set(it.map, []);
    byFolder.get(it.map).push(it);
  }
  for (const [folder, list] of byFolder) {
    const entry = folderEntry(next, folder);
    const taken = new Set(entry.bundels.flatMap((b) => b.tags));
    const itemsWith = new Map();
    list.forEach((it, i) => {
      for (const t of new Set((it.tags || []).map(normTag))) {
        if (!itemsWith.has(t)) itemsWith.set(t, new Set());
        itemsWith.get(t).add(i);
      }
    });
    const frequent = [...itemsWith].filter(([t, s]) => s.size >= next.drempel && !taken.has(t) && !entry.genegeerd.has(t))
      .sort((a, b) => b[1].size - a[1].size);
    const overlap = (a, b) => {
      let both = 0;
      for (const x of a) if (b.has(x)) both += 1;
      return { both, ratio: both / Math.min(a.size, b.size) };
    };
    const together = (a, b) => {
      const o = overlap(a, b);
      return o.both >= 2 && o.ratio >= 0.6;
    };

    // A frequent hashtag that mostly appears with an existing bundle joins it.
    const left = [];
    for (const [tag, set] of frequent) {
      const home = entry.bundels.find((b) => {
        const union = new Set(b.tags.flatMap((t) => [...(itemsWith.get(t) || [])]));
        return union.size && together(set, union);
      });
      if (home) {
        home.tags.push(tag);
        changes.push({ map: folder, naam: home.naam, tags: [tag], nieuw: false });
      } else left.push([tag, set]);
    }

    // The rest clusters on co-occurrence; each cluster becomes a bundle named
    // after its most frequent hashtag.
    const parent = left.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < left.length; i++) {
      for (let j = i + 1; j < left.length; j++) if (together(left[i][1], left[j][1])) parent[find(j)] = find(i);
    }
    const groups = new Map();
    left.forEach(([tag], i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(tag);
    });
    for (const tags of groups.values()) {
      let naam = bundleName(tags[0]);
      while (entry.bundels.some((b) => b.naam.toLowerCase() === naam.toLowerCase())) naam += ' 2';
      entry.bundels.push({ naam, tags });
      changes.push({ map: folder, naam, tags, nieuw: true });
    }
  }
  return { model: next, changes };
}

export function renameFolderInBundles(model, from, to) {
  if (!model.folders.has(from)) return model;
  const next = parseBundles(stringifyBundles(model));
  const moved = next.folders.get(from);
  next.folders.delete(from);
  const target = folderEntry(next, to);
  target.bundels.push(...moved.bundels.filter((b) => !target.bundels.some((x) => x.naam === b.naam)));
  for (const t of moved.genegeerd) target.genegeerd.add(t);
  return next;
}

// Replace one folder's bundles (from the edit sheet). Removed bundles' hashtags
// are remembered as ignored so they are not proposed again.
export function setFolderBundles(model, folder, bundels) {
  const next = parseBundles(stringifyBundles(model));
  const entry = folderEntry(next, folder);
  const keep = new Set(bundels.flatMap((b) => b.tags.map(normTag)));
  for (const b of entry.bundels) for (const t of b.tags) if (!keep.has(t)) entry.genegeerd.add(t);
  for (const t of keep) entry.genegeerd.delete(t);
  entry.bundels = bundels
    .map((b) => ({ naam: String(b.naam || '').trim(), tags: [...new Set(tagList(b.tags.join(' ')))] }))
    .filter((b) => b.naam && b.tags.length);
  return next;
}

export const BUNDELS_SEED = `# Bundels

Bundels groeperen items binnen een map op hashtags. Een hashtag die bij minstens "drempel" items in een map
staat, wordt een bundel; hashtags die vaak samen voorkomen, worden één bundel. Pas namen en hashtags gerust aan.
Haal je een bundel weg, dan zet de app de hashtags bij "Genegeerd" zodat ze niet terugkomen.
Klik in Obsidian op een #hashtag om alle items met die hashtag te zien.

drempel: ${DEFAULT_THRESHOLD}
`;
