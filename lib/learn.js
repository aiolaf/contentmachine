// Self-learning ranking without AI. Every action is a signal on the item's
// features (tags, folder, source, type, author). The weights are saved in
// _systeem/leren.json, so they sync to Obsidian like everything else.
const MAX_WEIGHT = 5;

export const SIGNALS = {
  geopend: 0.15,
  ster: 1.0,
  duim_op: 1.0,
  duim_neer: -1.0,
  gebruikt: 1.5,
  archief: -0.3,
  verwijderd: -0.8,
  verplaatst: 0.3,
  markering: 0.6,
};

export function emptyState() {
  return { gewichten: {}, correcties: [], geschiedenis: [], totaal: 0 };
}

export class Learner {
  constructor(state, onChange = () => {}) {
    this.state = { ...emptyState(), ...(state || {}) };
    this.onChange = onChange;
  }

  features(meta) {
    const out = [];
    const tags = meta.tags || [];
    const share = tags.length ? 1 / Math.sqrt(tags.length) : 0;
    for (const t of tags) out.push([`tag:${String(t).toLowerCase()}`, share]);
    if (meta.map) out.push([`map:${meta.map}`, 0.6]);
    if (meta.bron) out.push([`bron:${meta.bron}`, 0.6]);
    if (meta.type) out.push([`type:${meta.type}`, 0.3]);
    if (meta.auteur) out.push([`auteur:${String(meta.auteur).toLowerCase()}`, 0.8]);
    return out;
  }

  // Learned adjustment in [-25, 25] on top of the base score.
  boost(meta) {
    const w = this.state.gewichten;
    let sum = 0;
    for (const [f, share] of this.features(meta)) sum += (w[f] || 0) * share;
    return 25 * Math.tanh(sum / 4);
  }

  rank(meta) {
    let r = (meta.score ?? 50) + this.boost(meta);
    if (meta.ster) r += 15;
    r += (meta.oordeel || 0) * 10;
    if (meta.status === 'archief') r -= 40;
    return Math.round(r * 10) / 10;
  }

  signal(meta, kind, factor = 1) {
    const value = (SIGNALS[kind] ?? 0) * factor;
    if (!value) return;
    const w = this.state.gewichten;
    for (const [f, share] of this.features(meta)) {
      const next = (w[f] || 0) + 0.3 * value * share;
      w[f] = Math.max(-MAX_WEIGHT, Math.min(MAX_WEIGHT, Math.round(next * 1000) / 1000));
      if (Math.abs(w[f]) < 0.001) delete w[f];
    }
    this.state.geschiedenis.unshift({ id: meta.id, titel: meta.titel, signaal: kind, datum: new Date().toISOString() });
    this.state.geschiedenis = this.state.geschiedenis.slice(0, 200);
    this.state.totaal += 1;
    this.onChange();
  }

  correction(meta, from, to) {
    this.state.correcties.unshift({ titel: meta.titel, van: from, naar: to, datum: new Date().toISOString() });
    this.state.correcties = this.state.correcties.slice(0, 40);
    this.signal({ ...meta, map: to }, 'verplaatst');
  }

  topWeights(n = 10) {
    const entries = Object.entries(this.state.gewichten);
    return {
      positief: entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n),
      negatief: entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, n),
    };
  }
}
