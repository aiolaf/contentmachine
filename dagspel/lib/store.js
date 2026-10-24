// Where the files live. GitHubStore reads and writes JSON files in a private
// repo through the contents API, so the app needs no server. LocalStore keeps
// them on this device: for the demo and for the tests. Same interface.

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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || `GitHub gaf status ${res.status}`;
      // 409: the file changed since we read it. 422 without sha: it now exists.
      if (res.status === 409 || (res.status === 422 && /sha/i.test(msg))) throw new ConflictError(msg);
      if (res.status === 401) throw new StoreError('GitHub-token is ongeldig of verlopen', 401);
      if (res.status === 403 && /rate limit/i.test(msg)) throw new StoreError('GitHub-limiet bereikt, probeer het over een uur opnieuw', 403);
      if (res.status === 403) throw new StoreError('Het token mag niet schrijven. Geef het token bij Repository permissions: Contents, Read and write.', 403);
      throw new StoreError(res.status === 404 ? 'Niet gevonden' : msg, res.status);
    }
    return data;
  }

  // Verifies repo, branch and write access, and says what is off.
  async check() {
    let repo;
    try {
      repo = await this.api('');
    } catch (e) {
      if (e.status === 404) throw new StoreError(`Repo ${this.owner}/${this.repo} niet gevonden, of het token mag hem niet zien. Zet bij het token Repository access op deze repo.`, 404);
      throw e;
    }
    if (repo.permissions && !repo.permissions.push) throw new StoreError('Het token mag niet schrijven in deze repo. Geef het token Contents: Read and write.', 403);
    try {
      await this.api(`/branches/${encodeURIComponent(this.branch)}`);
    } catch (e) {
      if (e.status === 404) throw new StoreError(`Branch "${this.branch}" bestaat niet. De hoofdbranch heet "${repo.default_branch}".`, 404);
      throw e;
    }
    return { private: repo.private };
  }

  // { data, sha } or null when the file does not exist.
  async read(path) {
    try {
      const f = await this.api(`/contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`);
      if (Array.isArray(f) || f.type !== 'file') return null;
      return { text: base64ToUtf8(f.content || ''), sha: f.sha };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // File names in a folder, [] when the folder does not exist.
  async list(dir) {
    try {
      const f = await this.api(`/contents/${encodePath(dir)}?ref=${encodeURIComponent(this.branch)}`);
      return Array.isArray(f) ? f.filter((x) => x.type === 'file').map((x) => x.name) : [];
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  }

  // Writes the file when it is still at `sha` (null: when it does not exist yet).
  // Throws ConflictError when someone else wrote in between. Returns the new sha.
  async write(path, text, sha, message) {
    const res = await this.api(`/contents/${encodePath(path)}`, {
      method: 'PUT',
      body: { message, content: utf8ToBase64(text), branch: this.branch, ...(sha ? { sha } : {}) },
    });
    return res.content.sha;
  }
}

// Files in localStorage (or any object with getItem/setItem).
export class LocalStore {
  constructor({ storage = globalThis.localStorage, key = 'ds_demo' } = {}) {
    this.storage = storage;
    this.key = key;
  }

  files() {
    try {
      return JSON.parse(this.storage.getItem(this.key) || '{}');
    } catch {
      return {};
    }
  }

  async check() {
    return { private: true };
  }

  async read(path) {
    const f = this.files()[path];
    return f ? { text: f.text, sha: f.sha } : null;
  }

  async list(dir) {
    const pre = `${dir.replace(/\/+$/, '')}/`;
    return Object.keys(this.files()).filter((p) => p.startsWith(pre) && !p.slice(pre.length).includes('/')).map((p) => p.slice(pre.length));
  }

  async write(path, text, sha) {
    const all = this.files();
    if ((all[path]?.sha || null) !== (sha || null)) throw new ConflictError('bestand is veranderd');
    const next = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    all[path] = { text, sha: next };
    this.storage.setItem(this.key, JSON.stringify(all));
    return next;
  }
}
