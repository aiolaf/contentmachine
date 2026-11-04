// Small helpers shared by the app, the tests and (copied) the MCP server.

export function uid(prefix = 'm') {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const rand = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

const pad = (n) => String(n).padStart(2, '0');

// 75 -> "01:15", 3725 -> "1:02:05"
export function clock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

// "01:15" / "1:02:05" -> seconds
export function parseClock(text) {
  const parts = String(text).trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// 2700 -> "45 min", 5400 -> "1 u 30 min"
export function duration(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 1) return `${Math.max(0, Math.round(sec || 0))} sec`;
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} u ${m % 60 ? `${m % 60} min` : ''}`.trim();
}

export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 864e5);
  if (diff === 0) return 'Vandaag';
  if (diff === 1) return 'Gisteren';
  if (diff === -1) return 'Morgen';
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  const label = d.toLocaleDateString('nl-NL', opts);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

export function longDate(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${timeLabel(iso)}`;
}

// Local ISO with offset, so Markdown files read naturally: 2026-11-04T10:00:00+01:00
export function localIso(date = new Date()) {
  const d = new Date(date);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// "jan.de.vries@acme.nl" -> "Jan De Vries"
export function nameFromEmail(email) {
  const local = String(email || '').split('@')[0].replace(/[._+-]+/g, ' ').replace(/\d+/g, '').trim();
  if (!local) return '';
  return local.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Lowercase, no accents: for search and for matching names.
export function fold(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

// Safe file name for macOS, iCloud Drive and Obsidian.
export function safeFileName(text, max = 80) {
  const clean = String(text || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return (clean.slice(0, max).trim() || 'Opname');
}

export function bytes(n) {
  if (!n) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function randomKey(len = 24) {
  const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => abc[b % abc.length]).join('');
}
