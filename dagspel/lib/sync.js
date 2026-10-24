// Keeps the state in step with the repo. The app works on a local copy that
// is saved on the device right away (so a closed app loses nothing) and
// written to GitHub a moment later. When the iPhone and the Mac both wrote,
// the two versions merge (see voegSamen) and the write is tried again.
import { leesStaat, leesVoorstel, legeStaat, ruimOp, voegSamen } from './core.js';
import { ConflictError } from './store.js';

const DAG_JSON = /^\d{4}-\d{2}-\d{2}\.json$/;

export class Sync {
  constructor(store, { map = 'Taken', storage = globalThis.localStorage, key = 'ds_cache', delay = 1500 } = {}) {
    this.store = store;
    this.map = String(map).replace(/^\/+|\/+$/g, '');
    this.storage = storage;
    this.key = key;
    this.delay = delay;
    this.staat = legeStaat();
    this.sha = null;
    this.voorstel = null;
    this.dirty = false;
    this.versie = 0;
    this.timer = null;
    this.bezig = null;
    this.status = { bezig: false, fout: null, laatste: null };
    this.onStatus = () => {};
    this.leesCache();
  }

  get staatPad() {
    return `${this.map}/staat.json`;
  }

  get voorstelMap() {
    return `${this.map}/voorstellen`;
  }

  leesCache() {
    try {
      const c = JSON.parse(this.storage?.getItem(this.key) || 'null');
      if (!c) return;
      this.staat = leesStaat(c.staat);
      this.sha = c.sha || null;
      this.voorstel = leesVoorstel(c.voorstel);
      this.dirty = Boolean(c.dirty);
      this.status.laatste = c.laatste || null;
    } catch {
      // a broken cache is simply ignored; the repo has the truth
    }
  }

  bewaarCache() {
    try {
      this.storage?.setItem(this.key, JSON.stringify({ staat: this.staat, sha: this.sha, voorstel: this.voorstel, dirty: this.dirty, laatste: this.status.laatste }));
    } catch {
      // storage full or blocked: the next write to GitHub still saves everything
    }
  }

  zet(status) {
    Object.assign(this.status, status);
    this.onStatus(this.status);
  }

  // A broken staat.json is never overwritten with an empty state.
  leesBestand(f) {
    if (!f) return legeStaat();
    const raw = parse(f.text);
    if (!raw) throw new Error(`${this.staatPad} is geen geldige JSON. Herstel het bestand in GitHub of Obsidian.`);
    return leesStaat(raw);
  }

  // Reads the state and the newest proposals of today (or the last day before it).
  async laad(vandaag) {
    this.zet({ bezig: true, fout: null });
    try {
      const f = await this.store.read(this.staatPad);
      const remote = this.leesBestand(f);
      this.staat = this.dirty ? voegSamen(remote, this.staat) : remote;
      this.sha = f?.sha || null;
      this.voorstel = await this.laadVoorstel(vandaag);
      this.zet({ laatste: new Date().toISOString() });
      this.bewaarCache();
      if (this.dirty) await this.schrijf();
      else this.zet({ bezig: false });
    } catch (e) {
      this.zet({ bezig: false, fout: e.message || String(e) });
      throw e;
    }
  }

  async laadVoorstel(vandaag) {
    let f = await this.store.read(`${this.voorstelMap}/${vandaag}.json`);
    if (!f) {
      const namen = (await this.store.list(this.voorstelMap)).filter((n) => DAG_JSON.test(n) && n <= `${vandaag}.json`).sort();
      if (namen.length) f = await this.store.read(`${this.voorstelMap}/${namen.at(-1)}`);
    }
    return f ? leesVoorstel(parse(f.text)) : null;
  }

  // Call after every change to this.staat.
  wijzig() {
    this.dirty = true;
    this.versie++;
    this.bewaarCache();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.schrijf().catch(() => {}), this.delay);
  }

  // Writes now. Safe to call while a write is running: it then follows it.
  async schrijf() {
    clearTimeout(this.timer);
    if (this.bezig) {
      await this.bezig.catch(() => {});
      if (!this.dirty) return;
    }
    this.bezig = this.schrijfNu().finally(() => {
      this.bezig = null;
    });
    return this.bezig;
  }

  async schrijfNu() {
    this.zet({ bezig: true, fout: null });
    try {
      for (let poging = 0; poging < 4; poging++) {
        const versie = this.versie;
        ruimOp(this.staat);
        try {
          this.sha = await this.store.write(this.staatPad, `${JSON.stringify(this.staat, null, 1)}\n`, this.sha, 'Dagspel: taken bijgewerkt');
          if (versie === this.versie) this.dirty = false;
          this.zet({ bezig: false, laatste: new Date().toISOString() });
          this.bewaarCache();
          if (this.dirty) this.timer = setTimeout(() => this.schrijf().catch(() => {}), this.delay);
          return;
        } catch (e) {
          if (!(e instanceof ConflictError)) throw e;
          const f = await this.store.read(this.staatPad);
          this.staat = voegSamen(this.leesBestand(f), this.staat);
          this.sha = f?.sha || null;
          this.bewaarCache();
        }
      }
      throw new Error('Opslaan lukt niet: het bestand verandert steeds. Probeer het zo opnieuw.');
    } catch (e) {
      this.zet({ bezig: false, fout: e.message || String(e) });
      throw e;
    }
  }
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
