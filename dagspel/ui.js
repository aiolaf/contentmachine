// Interactive pieces, taken from the Contentmachine (NinA UI library) and
// extended for the game: a swipe deck with three directions, a toast stack
// with undo, a burst, rolling numbers and a floating "+20". Everything
// respects prefers-reduced-motion.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- toasts ----------
const toasts = [];

function toastRoot() {
  let root = document.getElementById('toasts');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toasts';
    root.setAttribute('aria-live', 'polite');
    document.body.append(root);
  }
  return root;
}

function dropToast(t) {
  const at = toasts.indexOf(t);
  if (at === -1) return;
  toasts.splice(at, 1);
  clearTimeout(t.timer);
  t.el.classList.add('out');
  setTimeout(() => t.el.remove(), 220);
}

// opts: { actie, label = 'Ongedaan maken', soort: 'ok' | 'fout' | 'info' }
export function toast(msg, { actie, label = 'Ongedaan maken', soort = 'info', duur } = {}) {
  while (toasts.length > 1) dropToast(toasts[0]);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-dot ${soort}"></span><span class="toast-msg"></span>${actie ? `<button type="button" class="toast-act">${esc(label)}</button>` : ''}`;
  el.querySelector('.toast-msg').textContent = msg;
  const t = { el };
  if (actie) {
    el.querySelector('.toast-act').addEventListener('click', () => {
      dropToast(t);
      actie();
    });
  }
  toastRoot().append(el);
  toasts.push(t);
  t.timer = setTimeout(() => dropToast(t), duur ?? (actie ? 5000 : 2600));
  return t;
}

// ---------- rolling numbers ----------
const lastRoll = new Map();

export function rollHtml(n, key) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  const cols = String(v).split('').map((d) => `<span class="roll-col" style="transform:translateY(-${d * 10}%)">${'0123456789'.split('').map((x) => `<span>${x}</span>`).join('')}</span>`).join('');
  return `<span class="roll" data-roll="${esc(key)}" data-v="${v}" aria-label="${v}" role="img">${cols}</span>`;
}

export function animateRolls(root = document) {
  for (const el of root.querySelectorAll('[data-roll]')) {
    const key = el.dataset.roll;
    const to = el.dataset.v;
    const from = lastRoll.get(key);
    lastRoll.set(key, to);
    if (from === undefined || from === to || reduced()) continue;
    const cols = [...el.querySelectorAll('.roll-col')];
    cols.forEach((col, i) => {
      const fromDigit = Number(from[from.length - (cols.length - i)] ?? 0);
      const toDigit = Number(to[i]);
      if (fromDigit === toDigit) return;
      col.animate([{ transform: `translateY(-${fromDigit * 10}%)` }, { transform: `translateY(-${toDigit * 10}%)` }],
        { duration: 520, easing: 'cubic-bezier(.2,.9,.25,1.15)' });
    });
  }
}

// ---------- burst and floating points ----------
export function burst(el, kleuren = ['#bf80ff', '#fde68b', '#9952e0'], n = 10) {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  const layer = document.createElement('span');
  layer.className = 'burst';
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < n; i++) {
    const dot = document.createElement('i');
    dot.style.background = kleuren[i % kleuren.length];
    layer.append(dot);
    const a = (i / n) * Math.PI * 2;
    const afstand = 30 + (i % 3) * 8;
    dot.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * afstand}px), calc(-50% + ${Math.sin(a) * afstand}px)) scale(0)`, opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 700);
}

// A big celebration: confetti from the top of the screen.
export function confetti(n = 60) {
  if (reduced()) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  const kleuren = ['#9952e0', '#bf80ff', '#fde68b', '#4fd1a1', '#6aa8f0', '#f2f2f2'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = kleuren[i % kleuren.length];
    p.style.width = `${6 + Math.random() * 6}px`;
    p.style.height = `${8 + Math.random() * 8}px`;
    layer.append(p);
    const x = (Math.random() - 0.5) * 160;
    p.animate([
      { transform: `translate(0, -20px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x}px, ${innerHeight * (0.7 + Math.random() * 0.4)}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0.9, offset: 0.85 },
      { transform: `translate(${x * 1.1}px, ${innerHeight + 40}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 1200, delay: Math.random() * 300, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'forwards' });
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3300);
}

export function floatPoints(el, tekst) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('span');
  f.className = 'float-points';
  f.textContent = tekst;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top}px`;
  document.body.append(f);
  if (reduced()) {
    setTimeout(() => f.remove(), 900);
    return;
  }
  f.animate([{ transform: 'translate(-50%, 0) scale(.8)', opacity: 0 }, { transform: 'translate(-50%, -18px) scale(1.15)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%, -64px) scale(1)', opacity: 0 }],
    { duration: 1100, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  setTimeout(() => f.remove(), 1150);
}

export function pop(el) {
  if (!el || reduced()) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.86)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: 450, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
}

// ---------- progress ring ----------
const RING = 2 * Math.PI * 16;

export function ringHtml(done, total) {
  const f = total ? done / total : 0;
  return `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="ring-bg"/><circle cx="20" cy="20" r="16" class="ring-fg" stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - f)}"/></svg>`;
}

// ---------- swipe deck ----------
// Drag the top card right, left or up: it turns along, a stamp fades in, and
// past the threshold it flies out. A tap is passed on as well. The handler
// gets 'right', 'left', 'up' or 'tap' and the card's id.
const DREMPEL = 90;
let drag = null;

export function flyOut(card, dir, done) {
  if (!card) return done?.();
  card.classList.remove('dragging');
  card.classList.add('flying');
  card.closest('.deck')?.classList.add('advance');
  card.style.setProperty('--yes', dir === 'right' ? '1' : '0');
  card.style.setProperty('--no', dir === 'left' ? '1' : '0');
  card.style.setProperty('--up', dir === 'up' ? '1' : '0');
  if (dir === 'up') card.style.transform = 'translateY(-110vh) scale(.9)';
  else {
    const s = dir === 'right' ? 1 : -1;
    card.style.transform = `translateX(${s * 120}vw) rotate(${s * 22}deg)`;
  }
  setTimeout(() => done?.(), reduced() ? 0 : 240);
}

export function setupDeck(handler) {
  document.addEventListener('pointerdown', (ev) => {
    const card = ev.target.closest('.deck-card.top');
    if (!card || ev.button > 0 || ev.target.closest('button, a')) return;
    drag = { card, x0: ev.clientX, y0: ev.clientY, dx: 0, dy: 0, moved: false };
    card.setPointerCapture(ev.pointerId);
    card.classList.add('dragging');
  });
  document.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    drag.dx = ev.clientX - drag.x0;
    drag.dy = Math.min(0, ev.clientY - drag.y0);
    if (Math.hypot(drag.dx, drag.dy) > 6) drag.moved = true;
    const { card, dx, dy } = drag;
    const omhoog = -dy > Math.abs(dx);
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 16}deg)`;
    card.style.setProperty('--yes', String(omhoog ? 0 : Math.max(0, Math.min(1, dx / DREMPEL))));
    card.style.setProperty('--no', String(omhoog ? 0 : Math.max(0, Math.min(1, -dx / DREMPEL))));
    card.style.setProperty('--up', String(omhoog ? Math.min(1, -dy / DREMPEL) : 0));
  });
  const release = () => {
    if (!drag) return;
    const { card, dx, dy, moved } = drag;
    drag = null;
    card.classList.remove('dragging');
    const omhoog = -dy > Math.abs(dx);
    if (omhoog && -dy > DREMPEL) flyOut(card, 'up', () => handler('up', card.dataset.id));
    else if (!omhoog && Math.abs(dx) > DREMPEL) {
      const dir = dx > 0 ? 'right' : 'left';
      flyOut(card, dir, () => handler(dir, card.dataset.id));
    } else {
      card.style.transform = '';
      for (const k of ['--yes', '--no', '--up']) card.style.setProperty(k, '0');
      if (!moved) handler('tap', card.dataset.id);
    }
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
}
