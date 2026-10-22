// The vault in the browser: Markdown files in a folder of the repo, one per
// item, with the folder as category. Changes are kept locally and committed
// in batches. _systeem/index.json caches every item's properties by blob sha,
// so opening the app costs two GitHub calls instead of one per item.
import {
  parseNote, stringifyNote, normalizeMeta, cleanFolderName, fileSafe, setSection,
  NOTES, INBOX, CONCEPTEN, SYSTEEM, RESERVED,
} from './frontmatter.js';
import { gitBlobSha, ConflictError } from './store.js';
import { Learner, emptyState } from './learn.js';
import { PROFIEL, STIJL, REGELS, LEESMIJ } from './seeds.js';
import { BUNDELS_SEED } from './bundles.js';
import { countHighlights } from './highlights.js';
import { emptyReview } from './review.js';

export class NotFoundError extends Error {}
export class InvalidNoteError extends Error {}

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const INDEX = 'index.json';
const LEREN = 'leren.json';
const HERHALING = 'herhaling.json';
const CONTENT = 'content.json';
const SEEDS = { 'profiel.md': PROFIEL, 'stijl.md': STIJL, 'regels.md': REGELS, 'bundels.md': BUNDELS_SEED, 'LEESMIJ.md': LEESMIJ };

export function newId() {
  const b = new Uint8Array(5);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function fileBase(meta) {
  const date = String(meta.opgeslagen || new Date().toISOString()).slice(0, 10);
  return `${date} ${fileSafe(meta.titel) || meta.id}`;
}

async function pool(list, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, list.length) }, async () => {
    while (i < list.length) await fn(list[i++]);
  });
  await Promise.all(workers);
}

export class Vault {
  // storage: optional localStorage-like object used to survive a closed tab
  // between a change and its commit. textCache: optional { get, set } of note
  // texts by blob sha, so a note is read from the store only once per device.
  constructor(store, { root = 'Contentmachine', storage = null, storageKey = 'cm_pending', textCache = null } = {}) {
    this.store = store;
    this.textCache = textCache;
    this.root = String(root).replace(/^\/+|\/+$/g, '');
    this.storage = storage;
    this.storageKey = storageKey;
    this.items = new Map(); // id -> { meta, path (relative to root), sha }
    this.files = new Map(); // full path -> blob sha, as on the remote
    this.texts = new Map(); // blob sha -> text
    this.pending = new Map(); // full path -> { content } | { delete: true }, plus base sha
    this.system = { 'profiel.md': '', 'stijl.md': '', 'regels.md': '', 'bundels.md': '' };
    this.herhaling = emptyReview();
    this.content = []; // productions, newest first (see content.js)
    this.learner = new Learner(emptyState(), () => {
      this.lerenDirty = true;
      this.schedule();
    });
    this.base = undefined;
    this.indexDirty = false;
    this.lerenDirty = false;
    this.lastIndex = '';
    this.locks = new Map();
    this.timer = null;
    this.flushing = null;
    this.status = { bezig: false, fout: null, laatsteSync: null };
    this.onChange = () => {};
    this.flushDelay = 1200;
  }

  full(rel) {
    return this.root ? `${this.root}/${rel}` : rel;
  }

  rel(full) {
    if (!this.root) return full;
    return full.startsWith(`${this.root}/`) ? full.slice(this.root.length + 1) : null;
  }

  isItemPath(rel) {
    const parts = rel.split('/');
    return parts.length === 2 && parts[1].endsWith('.md') && !parts[1].startsWith('.')
      && !parts[0].startsWith('.') && !RESERVED.has(parts[0]);
  }

  async readPath(full, sha = this.files.get(full)) {
    const p = this.pending.get(full);
    if (p) {
      if (p.delete) throw new NotFoundError(`${full} is verwijderd`);
      return p.content;
    }
    if (!sha) throw new NotFoundError(`${full} niet gevonden`);
    if (!this.texts.has(sha)) {
      let text = this.textCache ? await this.textCache.get(sha).catch(() => undefined) : undefined;
      if (typeof text !== 'string') {
        text = await this.store.readBlob(sha);
        this.textCache?.set(sha, text).catch(() => {});
      }
      this.texts.set(sha, text);
    }
    return this.texts.get(sha);
  }

  // The note text when it is already on this device, without a network call.
  cachedText(id) {
    const e = this.items.get(id);
    if (!e) return null;
    const p = this.pending.get(this.full(e.path));
    if (p) return p.delete ? null : p.content;
    return this.texts.get(e.sha) ?? null;
  }

  // Reads every note that is not on this device yet, for the full-text search.
  async loadTexts(onProgress = () => {}) {
    const todo = [...this.items.values()].filter((e) => !e.invalid && e.sha && this.cachedText(e.meta.id) === null);
    let done = 0;
    await pool(todo, 4, async (e) => {
      try {
        await this.readPath(this.full(e.path), e.sha);
      } catch {
        // gone or unreadable: it simply stays out of the full-text results
      }
      onProgress(++done, todo.length);
    });
    return todo.length;
  }

  // Reads the remote state. Returns the raw captures waiting in Inbox (shared
  // from the iPhone) and the moves made in Obsidian since the last visit.
  async load() {
    const files = await this.store.snapshot();
    this.base = this.store.head;
    this.files = files || new Map();
    this.restorePending();

    const sysPath = (name) => this.full(`${SYSTEEM}/${name}`);
    const readSys = async (name) => {
      const p = sysPath(name);
      return this.files.has(p) || this.pending.has(p) ? this.readPath(p).catch(() => null) : null;
    };
    for (const name of Object.keys(SEEDS)) {
      const text = await readSys(name);
      if (text === null) this.write(sysPath(name), SEEDS[name]);
      if (name in this.system) this.system[name] = text ?? SEEDS[name];
    }
    let leren = emptyState();
    try {
      leren = JSON.parse((await readSys(LEREN)) || 'null') || emptyState();
    } catch {
      // unreadable: start fresh, the next commit rewrites it
    }
    this.learner.state = { ...emptyState(), ...leren };
    try {
      this.herhaling = { ...emptyReview(), ...JSON.parse((await readSys(HERHALING)) || 'null') };
    } catch {
      this.herhaling = emptyReview();
    }
    try {
      const content = JSON.parse((await readSys(CONTENT)) || '[]');
      this.content = Array.isArray(content) ? content : [];
    } catch {
      this.content = [];
    }
    let index = { items: {} };
    try {
      this.lastIndex = (await readSys(INDEX)) || '';
      index = JSON.parse(this.lastIndex || '{"items":{}}');
    } catch {
      this.indexDirty = true;
    }
    const cachedItems = index.items || {};

    const items = new Map();
    const captures = [];
    const moves = [];
    const toRead = [];
    const register = async (rel, sha, meta, text) => {
      const folder = rel.split('/')[0];
      let m = meta;
      let rewrite = false;
      if (items.has(m.id) || !ID_RE.test(m.id)) {
        // Duplicated in Obsidian, or a hand-made id: this note gets its own id.
        m = { ...m, id: newId() };
        rewrite = true;
      }
      if (m.map !== folder) {
        if (m.map && m.verrijkt) moves.push({ meta: { ...m }, from: m.map, to: folder });
        m = { ...m, map: folder };
        rewrite = true;
      }
      items.set(m.id, { meta: m, path: rel, sha });
      if (rewrite) {
        const parsed = parseNote(text ?? (await this.readPath(this.full(rel), sha)));
        this.write(this.full(rel), stringifyNote({ ...parsed.data, id: m.id, map: m.map }, parsed.body));
        this.indexDirty = true;
      }
    };

    for (const [full, sha] of this.files) {
      const rel = this.rel(full);
      if (rel === null || !this.isItemPath(rel)) continue;
      const cached = cachedItems[rel];
      if (cached && cached.sha === sha && cached.meta?.id) await register(rel, sha, normalizeMeta(cached.meta));
      else toRead.push({ rel, sha, cached });
    }
    for (const rel of Object.keys(cachedItems)) if (!this.files.has(this.full(rel))) this.indexDirty = true;

    await pool(toRead, 6, async ({ rel, sha, cached }) => {
      const text = await this.readPath(this.full(rel), sha);
      const { data, body, invalid } = parseNote(text);
      this.indexDirty = true;
      if (invalid) {
        // Broken YAML from an edit in Obsidian: show the last known properties, never rewrite.
        if (cached?.meta?.id) items.set(cached.meta.id, { meta: normalizeMeta(cached.meta), path: rel, sha, invalid: true });
        return;
      }
      if (!data.id) {
        if (rel.startsWith(`${INBOX}/`)) captures.push({ rel, sha, text });
        return;
      }
      // The highlight count follows the body, also after an edit in Obsidian.
      await register(rel, sha, normalizeMeta({ ...data, markeringen: countHighlights(body) }), text);
    });

    this.items = items;
    for (const mv of moves) this.learner.correction(mv.meta, mv.from, mv.to);
    if (this.pending.size || this.indexDirty) this.schedule();
    this.onChange();
    return { captures, moves };
  }

  list() {
    return [...this.items.values()].map((e) => ({ ...e.meta, path: e.path, invalid: Boolean(e.invalid) }));
  }

  has(id) {
    return this.items.has(id);
  }

  meta(id) {
    const e = this.items.get(id);
    if (!e) throw new NotFoundError(`Item ${id} niet gevonden`);
    return { ...e.meta, path: e.path };
  }

  folders() {
    const set = new Set([INBOX]);
    for (const full of new Set([...this.files.keys(), ...this.pending.keys()])) {
      if (this.pending.get(full)?.delete) continue;
      const rel = this.rel(full);
      if (!rel || !rel.includes('/')) continue;
      const folder = rel.split('/')[0];
      if (!RESERVED.has(folder) && !folder.startsWith('.')) set.add(folder);
    }
    for (const e of this.items.values()) set.add(e.meta.map);
    return [...set];
  }

  async get(id) {
    const e = this.items.get(id);
    if (!e) throw new NotFoundError(`Item ${id} niet gevonden`);
    const text = await this.readPath(this.full(e.path), e.sha);
    const parsed = parseNote(text);
    return { meta: { ...e.meta, path: e.path }, body: parsed.body, invalid: parsed.invalid };
  }

  // Serialises edits per item so two quick taps cannot overwrite each other.
  lock(key, fn) {
    const prev = this.locks.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.locks.set(key, next);
    next.finally(() => {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }).catch(() => {});
    return next;
  }

  write(full, content) {
    const prev = this.pending.get(full);
    this.pending.set(full, { content, base: prev ? prev.base : this.files.get(full) });
    this.schedule();
  }

  remove_(full) {
    const prev = this.pending.get(full);
    if (!this.files.has(full) && (!prev || prev.base === undefined)) this.pending.delete(full);
    else this.pending.set(full, { delete: true, base: prev ? prev.base : this.files.get(full) });
    this.schedule();
  }

  taken(rel, own) {
    if (rel === own) return false;
    const full = this.full(rel);
    const p = this.pending.get(full);
    if (p) return !p.delete;
    if (this.files.has(full)) return true;
    for (const e of this.items.values()) if (e.path === rel) return true;
    return false;
  }

  uniquePath(folder, base, own) {
    for (let n = 1; n < 1000; n++) {
      const rel = `${folder}/${base}${n > 1 ? ` (${n})` : ''}.md`;
      if (!this.taken(rel, own)) return rel;
    }
    return `${folder}/${base} ${newId()}.md`;
  }

  create(meta, body) {
    const m = normalizeMeta({ opgeslagen: new Date().toISOString(), ...meta, id: meta.id || newId(), markeringen: countHighlights(body) });
    m.map = cleanFolderName(m.map || INBOX);
    const rel = this.uniquePath(m.map, fileBase(m));
    this.write(this.full(rel), stringifyNote(m, body));
    this.items.set(m.id, { meta: m, path: rel, sha: null });
    this.indexDirty = true;
    this.onChange();
    return { ...m, path: rel };
  }

  // patch: properties (undefined removes one). opts.body replaces the body,
  // opts.transform(body) edits it, opts.notities replaces the notes section,
  // opts.rename renames the file after the title.
  update(id, patch = {}, opts = {}) {
    return this.lock(id, async () => {
      const e = this.items.get(id);
      if (!e) throw new NotFoundError(`Item ${id} niet gevonden`);
      const parsed = parseNote(await this.readPath(this.full(e.path), e.sha));
      if (parsed.invalid) throw new InvalidNoteError('De eigenschappen van deze notitie zijn ongeldig. Herstel ze eerst in Obsidian.');
      const merged = { ...parsed.data, ...patch, id };
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete merged[k];
      const meta = normalizeMeta(merged);
      meta.map = cleanFolderName(meta.map || e.path.split('/')[0]);
      let body = opts.body ?? parsed.body;
      if (opts.transform) body = opts.transform(body);
      if (opts.notities !== undefined) body = setSection(body, NOTES, opts.notities);
      const marks = countHighlights(body);
      if (marks) meta.markeringen = marks;
      else delete meta.markeringen;
      const currentBase = e.path.split('/')[1].replace(/\.md$/, '');
      const base = opts.rename ? fileBase(meta) : currentBase;
      const same = e.path.split('/')[0] === meta.map && base === currentBase;
      const rel = same ? e.path : this.uniquePath(meta.map, base, e.path);
      this.write(this.full(rel), stringifyNote(meta, body));
      if (rel !== e.path) this.remove_(this.full(e.path));
      this.items.set(id, { meta, path: rel, sha: null });
      this.indexDirty = true;
      this.onChange();
      return { ...meta, path: rel };
    });
  }

  remove(id) {
    return this.lock(id, async () => {
      const e = this.items.get(id);
      if (!e) throw new NotFoundError(`Item ${id} niet gevonden`);
      this.remove_(this.full(e.path));
      this.items.delete(id);
      this.indexDirty = true;
      this.onChange();
    });
  }

  removeFile(rel) {
    this.remove_(this.full(rel));
  }

  createFolder(name) {
    const folder = cleanFolderName(name);
    if (!this.folders().includes(folder)) this.write(this.full(`${folder}/.gitkeep`), '');
    this.onChange();
    return folder;
  }

  async renameFolder(from, to) {
    const dst = this.createFolder(to);
    if (dst === from) return dst;
    for (const e of [...this.items.values()].filter((x) => x.meta.map === from)) await this.update(e.meta.id, { map: dst });
    const keep = this.full(`${from}/.gitkeep`);
    if (this.files.has(keep) || this.pending.has(keep)) this.remove_(keep);
    this.onChange();
    return dst;
  }

  saveContent(list) {
    this.content = list;
    this.write(this.full(`${SYSTEEM}/${CONTENT}`), `${JSON.stringify(list, null, 1)}\n`);
  }

  saveReview(state) {
    this.herhaling = state;
    this.write(this.full(`${SYSTEEM}/${HERHALING}`), `${JSON.stringify(state, null, 1)}\n`);
  }

  writeSystem(name, text) {
    this.write(this.full(`${SYSTEEM}/${name}`), text);
    if (name in this.system) this.system[name] = text;
    this.onChange();
  }

  concepts() {
    const out = [];
    const prefix = `${CONCEPTEN}/`;
    const paths = new Set([...this.files.keys(), ...this.pending.keys()]);
    for (const full of paths) {
      const rel = this.rel(full);
      if (!rel || !rel.startsWith(prefix) || !rel.endsWith('.md') || this.pending.get(full)?.delete) continue;
      const name = rel.slice(prefix.length);
      if (name.includes('/')) continue;
      const m = name.replace(/\.md$/, '').match(/^(\d{4}-\d{2}-\d{2}) (.*?)(?: - (.*))?$/);
      out.push({ file: name, datum: m?.[1] || '', soort: m?.[3] ? m[2] : '', titel: (m?.[3] || m?.[2] || name).trim() });
    }
    return out.sort((a, b) => b.datum.localeCompare(a.datum) || b.file.localeCompare(a.file));
  }

  async readConcept(name) {
    return parseNote(await this.readPath(this.conceptPath(name)));
  }

  conceptPath(name) {
    if (!/^[^/\\]+\.md$/.test(name) || name.includes('..')) throw new NotFoundError('Concept niet gevonden');
    return this.full(`${CONCEPTEN}/${name}`);
  }

  updateConcept(name, meta, body) {
    this.write(this.conceptPath(name), stringifyNote(meta, body));
    this.onChange();
  }

  removeConcept(name) {
    this.remove_(this.conceptPath(name));
    this.onChange();
  }

  writeConcept(meta, body) {
    const base = `${String(meta.datum).slice(0, 10)} ${fileSafe(`${meta.soort} - ${meta.titel}`)}`;
    const rel = this.uniquePath(CONCEPTEN, base);
    this.write(this.full(rel), stringifyNote(meta, body));
    this.onChange();
    return rel.slice(CONCEPTEN.length + 1);
  }

  // ---------- sync ----------

  persistPending() {
    if (!this.storage) return;
    try {
      if (this.pending.size) this.storage.setItem(this.storageKey, JSON.stringify([...this.pending]));
      else this.storage.removeItem(this.storageKey);
    } catch {
      // storage full or blocked: the in-memory queue still syncs
    }
  }

  // A change made just before the app was closed: replay it if the file did
  // not change remotely in the meantime, otherwise the remote version wins.
  restorePending() {
    if (!this.storage || this.pending.size) return;
    try {
      const saved = JSON.parse(this.storage.getItem(this.storageKey) || '[]');
      for (const [path, entry] of saved) if (this.files.get(path) === entry.base) this.pending.set(path, entry);
    } catch {
      // ignore
    }
    this.persistPending();
  }

  schedule() {
    this.persistPending();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush().catch(() => {}), this.flushDelay);
  }

  indexJson() {
    const items = {};
    for (const e of [...this.items.values()].sort((a, b) => a.path.localeCompare(b.path))) {
      if (e.invalid) continue;
      items[e.path] = { sha: e.sha, meta: e.meta };
    }
    return `${JSON.stringify({ versie: 1, items })}\n`;
  }

  async buildChanges() {
    for (const e of this.items.values()) {
      const p = this.pending.get(this.full(e.path));
      if (p && !p.delete) e.sha = await gitBlobSha(p.content);
    }
    const changes = [...this.pending].map(([path, p]) => (p.delete ? { path, delete: true } : { path, content: p.content }));
    const index = this.indexJson();
    if (index !== this.lastIndex) changes.push({ path: this.full(`${SYSTEEM}/${INDEX}`), content: index, index: true });
    if (this.lerenDirty) changes.push({ path: this.full(`${SYSTEEM}/${LEREN}`), content: `${JSON.stringify(this.learner.state, null, 1)}\n`, leren: true });
    return changes;
  }

  flush() {
    clearTimeout(this.timer);
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      this.status = { ...this.status, bezig: true };
      this.onChange();
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          this.flushAgain = false;
          const committed = new Map(this.pending);
          const changes = await this.buildChanges();
          if (!changes.length) break;
          try {
            const n = changes.filter((c) => !c.index && !c.leren).length;
            await this.store.commit(`Contentmachine: ${n || 'index'} ${n === 1 ? 'bestand' : 'bestanden'} bijgewerkt`, changes, this.base);
          } catch (e) {
            if (!(e instanceof ConflictError)) throw e;
            await this.rebase();
            continue;
          }
          this.base = this.store.head;
          for (const c of changes) {
            if (c.delete) {
              this.files.delete(c.path);
              continue;
            }
            const sha = await gitBlobSha(c.content);
            this.files.set(c.path, sha);
            this.texts.set(sha, c.content);
            if (!c.index) this.textCache?.set(sha, c.content).catch(() => {});
            if (c.index) this.lastIndex = c.content;
            if (c.leren) this.lerenDirty = false;
          }
          for (const [p, v] of committed) if (this.pending.get(p) === v) this.pending.delete(p);
          this.persistPending();
          if (!this.pending.size && !this.flushAgain) break;
        }
        this.indexDirty = false;
        this.status = { bezig: false, fout: null, laatsteSync: new Date().toISOString() };
        if (this.needsReload) {
          // A conflict was resolved in favour of the remote: show what is really there.
          this.needsReload = false;
          await this.load();
        }
      } catch (e) {
        this.status = { ...this.status, bezig: false, fout: e.message };
        throw e;
      } finally {
        this.flushing = null;
        this.onChange();
      }
    })();
    return this.flushing;
  }

  // The branch moved (Obsidian or the iPhone pushed). Keep our changes to files
  // nobody else touched; for a file changed on both sides the remote wins.
  async rebase() {
    const remote = (await this.store.snapshot()) || new Map();
    this.base = this.store.head;
    for (const [path, p] of [...this.pending]) {
      if (remote.get(path) !== p.base) this.pending.delete(path);
    }
    this.files = remote;
    this.needsReload = true;
  }
}
