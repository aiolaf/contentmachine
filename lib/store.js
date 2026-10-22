// Storage backends. GitHubStore keeps the vault in a (private) GitHub repo via
// the REST API, so the app needs no server; LocalStore keeps files on this
// device only and doubles as a test fake. Both expose the same interface.

export class ConflictError extends Error {
  name = 'ConflictError';
}
export class StoreError extends Error {
  name = 'StoreError';
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const enc = new TextEncoder();

// Git's own blob id, so we know a file's sha without asking GitHub again.
export async function gitBlobSha(text) {
  const bytes = enc.encode(text);
  const head = enc.encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  const hash = await globalThis.crypto.subtle.digest('SHA-1', all);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function utf8ToBase64(text) {
  let bin = '';
  for (const b of enc.encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

// Accepts what people paste: "naam", "eigenaar/naam", a github.com link or a clone URL.
export function parseRepoInput(owner, repo) {
  const o = String(owner || '').trim();
  const r = String(repo || '').trim();
  const m = `${o} ${r}`.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i) || r.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (m) return { owner: m[1].replace(/^@/, ''), repo: m[2].replace(/\.git$/, '') };
  return { owner: o.replace(/^@/, ''), repo: r.replace(/\.git$/, '') };
}

export function cleanToken(token) {
  return String(token || '').replace(/^\s*(bearer|token)\s+/i, '').replace(/\s+/g, '');
}

export class GitHubStore {
  constructor({ owner, repo, branch = 'main', token, fetchImpl }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.head = null; // { commit, tree }
  }

  async api(path, { method = 'GET', body } = {}) {
    const res = await this.fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || `GitHub gaf status ${res.status}`;
      if (res.status === 422 && /fast forward|Update is not a fast forward/i.test(msg)) throw new ConflictError(msg);
      if (res.status === 401) throw new StoreError('GitHub-token is ongeldig of verlopen', 401);
      if (res.status === 403 && /rate limit/i.test(msg)) throw new StoreError('GitHub-limiet bereikt, probeer het over een uur opnieuw', 403);
      if (res.status === 403 && /not accessible by (personal access )?token|integration/i.test(msg)) {
        throw new StoreError('Het token mag niet schrijven. Geef het token bij Repository permissions: Contents, Read and write.', 403);
      }
      if (res.status === 404) throw new StoreError('Repo of branch niet gevonden, of het token heeft geen toegang', 404);
      throw new StoreError(msg, res.status);
    }
    return data;
  }

  // Verifies the settings and, when something is off, says what exactly.
  async check() {
    let repo;
    try {
      repo = await this.api('');
    } catch (e) {
      if (e.status === 404) throw new StoreError(await this.explainMissing(), 404);
      throw e;
    }
    if (repo.permissions && !repo.permissions.push) throw new StoreError('Het token mag niet schrijven in deze repo. Geef het token Contents: Read and write.', 403);
    try {
      await this.api(`/branches/${encodeURIComponent(this.branch)}`);
    } catch (e) {
      // An empty repo has no branches yet; that is fine for its default branch.
      if (e.status === 404 && this.branch !== repo.default_branch) {
        throw new StoreError(`Branch "${this.branch}" bestaat niet in ${this.owner}/${this.repo}. De hoofdbranch heet "${repo.default_branch}".`, 404);
      }
      if (e.status !== 404) throw e;
    }
    return { private: repo.private, defaultBranch: repo.default_branch };
  }

  // GitHub answers 404 both for a missing repo and for one the token may not see.
  async explainMissing() {
    const name = `${this.owner}/${this.repo}`;
    try {
      const res = await this.fetch('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28' },
        cache: 'no-store',
      });
      if (res.status === 401) return 'Het token is ongeldig of verlopen. Maak een nieuw token en plak het opnieuw.';
      const me = await res.json().catch(() => ({}));
      if (me.login && me.login.toLowerCase() !== this.owner.toLowerCase()) {
        return `Het token hoort bij ${me.login}, maar je vulde ${this.owner} in als GitHub-gebruiker. Controleer ${name}.`;
      }
      return `Het token werkt${me.login ? ` (ingelogd als ${me.login})` : ''}, maar mag ${name} niet zien. Open het token op GitHub en zet Repository access op "Only select repositories" met ${this.repo} aangevinkt. Controleer ook de spelling van de repo.`;
    } catch {
      return `Repo ${name} niet gevonden, of het token heeft geen toegang.`;
    }
  }

  // Current files as Map(path -> blob sha). Null when the repo or branch is still empty.
  async snapshot() {
    let branch;
    try {
      branch = await this.api(`/branches/${encodeURIComponent(this.branch)}`);
    } catch (e) {
      if (e.status === 404 || e.status === 409) {
        this.head = null;
        return null;
      }
      throw e;
    }
    this.head = { commit: branch.commit.sha, tree: branch.commit.commit.tree.sha };
    const tree = await this.api(`/git/trees/${this.head.tree}?recursive=1`);
    if (tree.truncated) throw new StoreError('De repo is te groot om in één keer te lezen', 413);
    const files = new Map();
    for (const e of tree.tree) if (e.type === 'blob') files.set(e.path, e.sha);
    return files;
  }

  async readBlob(sha) {
    const blob = await this.api(`/git/blobs/${sha}`);
    return base64ToUtf8(blob.content);
  }

  // changes: [{ path, content } | { path, delete: true }]. Throws ConflictError
  // when the branch moved since the last snapshot (e.g. Obsidian pushed).
  // The parent is always the head of the last snapshot or commit.
  async commit(message, changes) {
    if (!this.head) {
      // An empty repo has no tree to build on: the contents API creates the first commit.
      const first = changes.find((c) => !c.delete);
      await this.api(`/contents/${encodePath(first.path)}`, {
        method: 'PUT',
        body: { message, content: utf8ToBase64(first.content), branch: this.branch },
      });
      await this.snapshot();
      const rest = changes.filter((c) => c !== first);
      return rest.length ? this.commit(message, rest) : this.head.commit;
    }
    const tree = await this.api('/git/trees', {
      method: 'POST',
      body: {
        base_tree: this.head.tree,
        tree: changes.map((c) => (c.delete
          ? { path: c.path, mode: '100644', type: 'blob', sha: null }
          : { path: c.path, mode: '100644', type: 'blob', content: c.content })),
      },
    });
    const commit = await this.api('/git/commits', {
      method: 'POST',
      body: { message, tree: tree.sha, parents: [this.head.commit] },
    });
    await this.api(`/git/refs/heads/${encodeURIComponent(this.branch)}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
    this.head = { commit: commit.sha, tree: tree.sha };
    return commit.sha;
  }
}

// Files in localStorage (or any object with getItem/setItem). No sync, no Obsidian.
export class LocalStore {
  constructor({ storage, key = 'cm_lokaal' } = {}) {
    this.storage = storage || globalThis.localStorage;
    this.key = key;
    this.files = new Map(); // path -> { sha, content }
    this.head = null;
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    try {
      const raw = this.storage.getItem(this.key);
      if (raw) {
        const data = JSON.parse(raw);
        this.files = new Map(Object.entries(data.files || {}));
        this.head = data.head || null;
      }
    } catch {
      this.files = new Map();
    }
    this.loaded = true;
  }

  persist() {
    this.storage.setItem(this.key, JSON.stringify({ head: this.head, files: Object.fromEntries(this.files) }));
  }

  async check() {
    return { private: true, defaultBranch: 'lokaal' };
  }

  async snapshot() {
    this.load();
    if (!this.files.size) return null;
    return new Map([...this.files].map(([p, f]) => [p, f.sha]));
  }

  async readBlob(sha) {
    for (const f of this.files.values()) if (f.sha === sha) return f.content;
    throw new StoreError('Bestand niet gevonden', 404);
  }

  // `base` is the head the caller last read; a different head means another
  // writer got there first, just like a non-fast-forward push on GitHub.
  async commit(message, changes, base) {
    this.load();
    if (base !== undefined && base !== this.head) throw new ConflictError('branch is verschoven');
    for (const c of changes) {
      if (c.delete) this.files.delete(c.path);
      else this.files.set(c.path, { sha: await gitBlobSha(c.content), content: c.content });
    }
    this.head = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.persist();
    return this.head;
  }

  // Test helper: write as if Obsidian pushed a change.
  async external(path, content) {
    this.load();
    if (content === null) this.files.delete(path);
    else this.files.set(path, { sha: await gitBlobSha(content), content });
    this.head = `ext-${Math.random().toString(36).slice(2, 8)}`;
    this.persist();
  }
}
