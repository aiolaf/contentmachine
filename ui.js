// Interactive pieces from the NinA UI library (nina-ai.nl/ui), rebuilt without
// a framework for this app: toast stack, slide to confirm, swipe deck, rolling
// numbers, a burst for good moments, liquid switches, a generate button and
// tilt cards. Everything respects prefers-reduced-motion.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// ---------- toast stack ----------
// The newest toast is in front, older ones lie compact behind it; hover or tap
// the stack to fan it out. A toast can carry one action, like "Ongedaan maken".
const toasts = [];

function toastRoot() {
  let root = document.getElementById('toasts');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toasts';
    root.setAttribute('aria-live', 'polite');
    root.addEventListener('pointerenter', (ev) => ev.pointerType === 'mouse' && root.classList.add('open'));
    root.addEventListener('pointerleave', () => root.classList.remove('open'));
    root.addEventListener('click', (ev) => {
      if (!ev.target.closest('.toast-act') && toasts.length > 1) root.classList.toggle('open');
    });
    document.body.append(root);
  }
  return root;
}

function layoutToasts() {
  toasts.forEach((t, idx) => {
    const i = toasts.length - 1 - idx;
    t.el.style.setProperty('--i', i);
    t.el.style.zIndex = String(50 - i);
    t.el.classList.toggle('behind', i > 2);
  });
  toastRoot().classList.toggle('many', toasts.length > 1);
}

function dropToast(t) {
  const at = toasts.indexOf(t);
  if (at === -1) return;
  toasts.splice(at, 1);
  clearTimeout(t.timer);
  t.el.classList.add('out');
  setTimeout(() => t.el.remove(), 220);
  layoutToasts();
  if (!toasts.length) toastRoot().classList.remove('open');
}

// opts: { actie: () => void, label = 'Ongedaan maken', soort: 'ok' | 'fout' | 'info' }
export function toast(msg, { actie, label = 'Ongedaan maken', soort = 'info', duur } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-dot ${soort}"></span><span class="toast-msg"></span>${actie ? `<button type="button" class="toast-act">${escHtml(label)}</button>` : ''}`;
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
  while (toasts.length > 5) dropToast(toasts[0]);
  layoutToasts();
  t.timer = setTimeout(() => dropToast(t), duur ?? (actie ? 6500 : 3200));
  return t;
}

// ---------- slide to confirm ----------
// A sheet with a pill track: drag the knob right; past 80% it finishes on its
// own. Resolves true when confirmed, false on cancel. Enter or space on the
// knob confirms right away.
export function confirmSlide({ titel, tekst = '', label = 'Schuif om te bevestigen', klaar = 'Bevestigd', gevaar = true }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay slide-overlay';
    overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
      <h2></h2>${tekst ? '<p class="small muted slide-text"></p>' : ''}
      <div class="slide ${gevaar ? 'danger' : ''}">
        <div class="slide-fill"></div>
        <span class="slide-label"></span>
        <span class="slide-done"></span>
        <button type="button" class="slide-knob">${ARROW}</button>
      </div>
      <button type="button" class="btn ghost block slide-cancel">Annuleer</button>
    </div>`;
    overlay.querySelector('h2').textContent = titel;
    if (tekst) overlay.querySelector('.slide-text').textContent = tekst;
    overlay.querySelector('.slide-label').textContent = label;
    overlay.querySelector('.slide-done').textContent = klaar;
    const track = overlay.querySelector('.slide');
    const knob = overlay.querySelector('.slide-knob');
    knob.setAttribute('aria-label', label);
    let x = 0;
    let start = null;
    let done = false;
    const max = () => track.clientWidth - knob.offsetWidth - 8;
    const paint = () => {
      knob.style.transform = `translateX(${x}px)`;
      track.style.setProperty('--fill', `${x + knob.offsetWidth}px`);
      track.style.setProperty('--p', String(Math.min(1, x / max())));
    };
    const close = (ok) => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 180);
      resolve(ok);
    };
    const finish = () => {
      if (done) return;
      done = true;
      track.classList.add('done', 'animate');
      x = max();
      paint();
      knob.innerHTML = CHECK;
      setTimeout(() => close(true), 520);
    };
    const onKey = (ev) => ev.key === 'Escape' && !done && close(false);
    knob.addEventListener('pointerdown', (ev) => {
      if (done) return;
      start = ev.clientX - x;
      track.classList.remove('animate');
      knob.setPointerCapture(ev.pointerId);
    });
    knob.addEventListener('pointermove', (ev) => {
      if (start === null) return;
      x = Math.max(0, Math.min(max(), ev.clientX - start));
      paint();
    });
    const release = () => {
      if (start === null) return;
      start = null;
      if (x > max() * 0.8) finish();
      else {
        track.classList.add('animate');
        x = 0;
        paint();
      }
    };
    knob.addEventListener('pointerup', release);
    knob.addEventListener('pointercancel', release);
    knob.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        finish();
      }
    });
    overlay.querySelector('.slide-cancel').addEventListener('click', () => close(false));
    overlay.addEventListener('click', (ev) => ev.target === overlay && !done && close(false));
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    paint();
    knob.focus();
  });
}

// ---------- rolling numbers ----------
// Every digit is its own column 0 to 9 that rolls to its value. Columns keep
// their place from the right, so 99 to 100 only rolls what changes. Rolls with
// the same key remember their last value, also across renders.
const lastRoll = new Map();

export function rollHtml(n, key) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  const cols = String(v).split('').map((d) => `<span class="roll-col" style="transform:translateY(-${d * 10}%)">${'0123456789'.split('').map((x) => `<span>${x}</span>`).join('')}</span>`).join('');
  return `<span class="roll" data-roll="${escHtml(key)}" data-v="${v}" aria-label="${v}" role="img">${cols}</span>`;
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

// ---------- burst ----------
// Eight dots shoot out in a circle from an element and fade, like the like
// button. Lives in its own layer, so a re-render does not cut it short.
export function burst(el, kleuren = ['#ffe25c', '#e0492a']) {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  const layer = document.createElement('span');
  layer.className = 'burst';
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < 8; i++) {
    const dot = document.createElement('i');
    dot.style.background = kleuren[i % kleuren.length];
    layer.append(dot);
    const a = (i / 8) * Math.PI * 2;
    dot.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * 34}px), calc(-50% + ${Math.sin(a) * 34}px)) scale(0)`, opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 700);
}

// A springy tap: 0.86, 1.12, 1.
export function pop(el) {
  if (!el || reduced()) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.86)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: 450, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
}

// ---------- liquid switch ----------
export function switchHtml({ key, aan, label, uitleg = '' }) {
  return `<label class="switch-row"><span class="switch-text">${label}${uitleg ? `<small>${uitleg}</small>` : ''}</span>
    <button type="button" class="switch" role="switch" aria-checked="${aan ? 'true' : 'false'}" data-action="toggle" data-v="${escHtml(key)}"><span class="knob"></span></button></label>`;
}

// The knob stretches while it travels and springs into place.
export function flipSwitch(el) {
  const aan = el.getAttribute('aria-checked') !== 'true';
  el.setAttribute('aria-checked', String(aan));
  el.classList.add('stretch');
  setTimeout(() => el.classList.remove('stretch'), 220);
  return aan;
}

// ---------- checklist ----------
const RING = 2 * Math.PI * 16;

export function ringHtml(done, total) {
  return `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="ring-bg"/><circle cx="20" cy="20" r="16" class="ring-fg" stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - done / total)}"/></svg>`;
}

export function setRing(svg, done, total) {
  svg?.querySelector('.ring-fg')?.setAttribute('stroke-dashoffset', String(RING * (1 - done / total)));
}

export const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-dasharray="24"/></svg>';

// ---------- generate button ----------
// While working, a glowing border spins around the button and the text
// shimmers; then a short "Klaar" with a check, then back to rest.
export function setGenerate(btn, staat, labels) {
  if (!btn) return;
  btn.classList.remove('bezig', 'klaar');
  if (staat !== 'rust') btn.classList.add(staat);
  btn.setAttribute('aria-busy', String(staat === 'bezig'));
  const text = btn.querySelector('.gen-text');
  if (text) text.textContent = labels[staat];
}

// ---------- swipe deck ----------
// Drag the top card right or left: it turns along (1 degree per 14 px), a
// stamp fades in, and past 100 px it flies out. A tap opens it. The handler
// gets 'right', 'left' or 'tap' and the card's id.
let drag = null;

export function flyOut(card, dir, done) {
  if (!card) return done?.();
  card.classList.remove('dragging');
  card.classList.add('flying');
  const deck = card.closest('.deck');
  deck?.classList.add('advance');
  if (dir === 'later') {
    card.style.transform = 'translateY(70px) scale(.92)';
    card.style.opacity = '0';
  } else {
    const s = dir === 'right' ? 1 : -1;
    card.style.transform = `translateX(${s * 120}vw) rotate(${s * 24}deg)`;
    card.style.setProperty('--yes', dir === 'right' ? '1' : '0');
    card.style.setProperty('--no', dir === 'left' ? '1' : '0');
  }
  setTimeout(() => done?.(), reduced() ? 0 : 260);
}

export function setupDeck(handler) {
  document.addEventListener('pointerdown', (ev) => {
    const card = ev.target.closest('.deck-card.top');
    if (!card || ev.button > 0 || ev.target.closest('button, a')) return;
    drag = { card, x0: ev.clientX, dx: 0, moved: false };
    card.setPointerCapture(ev.pointerId);
    card.classList.add('dragging');
  });
  document.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    drag.dx = ev.clientX - drag.x0;
    if (Math.abs(drag.dx) > 5) drag.moved = true;
    const { card, dx } = drag;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 14}deg)`;
    card.style.setProperty('--yes', String(Math.max(0, Math.min(1, dx / 100))));
    card.style.setProperty('--no', String(Math.max(0, Math.min(1, -dx / 100))));
  });
  const release = () => {
    if (!drag) return;
    const { card, dx, moved } = drag;
    drag = null;
    card.classList.remove('dragging');
    if (Math.abs(dx) > 100) {
      const dir = dx > 0 ? 'right' : 'left';
      flyOut(card, dir, () => handler(dir, card.dataset.id));
    } else {
      card.style.transform = '';
      card.style.setProperty('--yes', '0');
      card.style.setProperty('--no', '0');
      if (!moved) handler('tap', card.dataset.id);
    }
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
}

// ---------- tilt ----------
// Cards with class "tilt" lean towards the cursor in 3D (at most about 6
// degrees) with a soft light spot. Only with a mouse or trackpad.
export function setupTilt() {
  let current = null;
  const reset = () => {
    if (!current) return;
    current.style.transform = '';
    current.classList.remove('tilting');
    current = null;
  };
  document.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || reduced()) return;
    const el = ev.target.closest('.tilt');
    if (el !== current) reset();
    if (!el) return;
    current = el;
    const r = el.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width;
    const py = (ev.clientY - r.top) / r.height;
    el.classList.add('tilting');
    el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 8}deg) rotateY(${(px - 0.5) * 10}deg)`;
    el.style.setProperty('--gx', `${px * 100}%`);
    el.style.setProperty('--gy', `${py * 100}%`);
  });
  document.documentElement.addEventListener('pointerleave', reset);
  addEventListener('blur', reset);
}

// ---------- swipe a card away ----------
// Like Mail: drag a card in a list sideways and an action shows behind it.
// Past about a third of its width (or with a quick flick) the action counts.
// actionFor(card, dir) returns { label, icon, fly }: a flying action takes the
// card out of the list and folds the gap, the other springs back. Vertical
// scrolling stays free: a swipe only starts when the finger moves clearly sideways.
export function setupSwipeAway({ selector, actionFor, onSwipe }) {
  let s = null;
  let suppressClick = 0;
  const reset = () => {
    if (!s) return;
    s.card.classList.remove('swiping');
    s.card.style.transform = '';
    s.bg?.remove();
    s = null;
  };
  const paintBg = (dir) => {
    const a = actionFor(s.card, dir) || { label: '' };
    s.bg.className = `swipe-bg ${dir} ${a.soort || ''}`;
    s.bg.innerHTML = `<span class="swipe-label">${a.icon || ''}<span>${escHtml(a.label)}</span></span>`;
    s.dir = dir;
    s.action = a;
  };
  document.addEventListener('pointerdown', (ev) => {
    const card = ev.target.closest(selector);
    if (!card || ev.button > 0 || ev.target.closest('button, a, input, textarea, select')) return;
    s = { card, x0: ev.clientX, y0: ev.clientY, t0: performance.now(), dx: 0, active: false, id: ev.pointerId };
  });
  document.addEventListener('pointermove', (ev) => {
    if (!s || ev.pointerId !== s.id) return;
    const dx = ev.clientX - s.x0;
    const dy = ev.clientY - s.y0;
    if (!s.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return reset(); // a scroll, not a swipe
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      s.active = true;
      const { card } = s;
      const bg = document.createElement('div');
      bg.style.top = `${card.offsetTop}px`;
      bg.style.height = `${card.offsetHeight}px`;
      card.parentElement.insertBefore(bg, card);
      s.bg = bg;
      s.width = card.offsetWidth;
      card.classList.add('swiping');
      try {
        card.setPointerCapture(ev.pointerId);
      } catch {
        // the pointer is gone already
      }
    }
    const dir = dx < 0 ? 'left' : 'right';
    if (dir !== s.dir) paintBg(dir);
    s.dx = dx;
    const p = Math.min(1, Math.abs(dx) / (s.width * 0.35));
    s.card.style.transform = `translateX(${dx}px) rotate(${dx / 60}deg)`;
    s.bg.classList.toggle('armed', p >= 1);
    s.bg.style.setProperty('--p', String(p));
  });
  const release = (ev) => {
    if (!s || (ev && ev.pointerId !== s.id)) return;
    if (!s.active) {
      s = null;
      return;
    }
    const { card, bg, dx, width, t0, dir, action } = s;
    s = null;
    const fast = Math.abs(dx) / Math.max(1, performance.now() - t0) > 0.6 && Math.abs(dx) > 60;
    suppressClick = performance.now();
    card.classList.remove('swiping');
    if (!((Math.abs(dx) > width * 0.35 || fast) && card.isConnected && action?.label)) {
      card.style.transform = '';
      bg?.classList.add('fade');
      setTimeout(() => bg?.remove(), 250);
      return;
    }
    if (!action.fly) {
      // Springs back with the action done, like flagging a mail.
      card.style.transform = '';
      bg?.classList.add('fade');
      setTimeout(() => bg?.remove(), 250);
      onSwipe(card, dir);
      return;
    }
    card.classList.add('swiped');
    card.style.transform = `translateX(${dx < 0 ? -120 : 120}%) rotate(${dx < 0 ? -6 : 6}deg)`;
    // Fold the gap closed, then hand over.
    card.style.height = `${card.offsetHeight}px`;
    setTimeout(() => {
      card.style.height = '0px';
      card.style.paddingTop = '0px';
      card.style.paddingBottom = '0px';
      card.style.marginBottom = `-${getComputedStyle(card.parentElement).rowGap || '0px'}`;
      bg?.style.setProperty('height', '0px');
    }, reduced() ? 0 : 180);
    setTimeout(() => {
      bg?.remove();
      onSwipe(card, dir);
    }, reduced() ? 0 : 420);
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', (ev) => {
    if (s && ev.pointerId === s.id && !s.active) s = null;
    else release(ev);
  });
  // A swipe ends with a click on the card; that must not open it.
  document.addEventListener('click', (ev) => {
    if (performance.now() - suppressClick < 400 && ev.target.closest(selector)) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  }, true);
}
