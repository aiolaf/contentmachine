'use strict';

// Teleprompter that puts the text window (#lens) right next to the camera, so reading looks like eye contact.
// "Per regel" keeps the line you read fixed at the very top of the lens and steps to the next line when its words
// are read at the set pace; "Doorlopend" scrolls the text up continuously.
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = 'teleprompter-v1';

  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isPhone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const canFloat = 'documentPictureInPicture' in window && !isPhone;
  // iPhones with a Dynamic Island (14 Pro and later, every 15, 16 and 17) are 852 pt or taller. The front camera is the
  // round cutout at the right end of the island, about 44 pt right of centre; the island ends about 9 pt above the safe area.
  const island = isIOS && isPhone && Math.max(screen.width, screen.height) >= 852;
  const CAM_OFFSET = island ? 44 : 0;

  const SAMPLE = `Hoi! Dit is je teleprompter.

Deze regel staat pal onder je camera. Zo kijk je altijd in de lens terwijl je leest.

[pauze]

Tik op het scherm om te pauzeren. Sleep om terug te gaan. Met de plus en min onderin pas je het tempo aan.

Plak je eigen tekst en druk op **start**. Succes met opnemen!`;

  const DEFAULTS = {
    script: SAMPLE,
    wpm: 140,
    size: isPhone ? 28 : 40,
    width: isPhone ? 70 : 34,
    lines: 3,
    mode: 'step',
    gap: 0,
    shift: 0,
    anchor: 'auto',
    align: 'center',
    countdown: '3',
    record: false,
    selfview: true,
  };
  const RANGES = {
    wpm: (v) => `${v} w/min`,
    size: (v) => `${v} px`,
    width: (v) => `${v}%`,
    lines: (v) => `${v}`,
    gap: (v) => `${v} px`,
    shift: (v) => `${v} px`,
  };

  let s = { ...DEFAULTS, ...load() };
  // Version 2 narrowed the phone column so it can sit under the camera instead of the middle of the island.
  if (!s.v) {
    if (isPhone && s.width === 86) s.width = DEFAULTS.width;
    s.v = 2;
  }

  const editor = $('editor');
  const prompter = $('prompter');
  const lens = $('lens');
  const track = $('track');
  const textEl = $('text');
  const marker = $('marker');
  const countEl = $('count');
  const preview = $('preview');
  const toastEl = $('toast');
  const settings = $('settings');
  const sheet = $('sheet');
  const result = $('result');
  const scriptEl = $('script');
  // The prompter can move into the floating window's document, so keep direct references instead of looking ids up later.
  const bar = $('bar');
  const hTime = $('h-time');
  const hWpm = $('h-wpm');
  const hPlay = $('h-play');
  const hRec = $('h-rec');
  const hRecTime = $('h-rectime');
  const q = (id) => settings.querySelector(`#${id}`);

  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);

  // ---- Settings ----

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  let saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: settings live for this visit only */ }
    }, 250);
  }

  function syncInputs() {
    for (const [k, fmt] of Object.entries(RANGES)) {
      q(k).value = s[k];
      q(`${k}-out`).textContent = fmt(s[k]);
    }
    for (const seg of settings.querySelectorAll('.seg')) {
      for (const b of seg.querySelectorAll('button')) {
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(b.dataset.value === String(s[seg.dataset.key])));
      }
    }
    q('record').checked = s.record;
    q('selfview').checked = s.selfview;
    q('selfview-wrap').hidden = !s.record;
  }

  for (const k of Object.keys(RANGES)) {
    q(k).addEventListener('input', (e) => {
      s[k] = Number(e.target.value);
      q(`${k}-out`).textContent = RANGES[k](s[k]);
      save();
      if (k === 'wpm') { updateStats(); updateSpeed(); } else layout();
    });
  }
  settings.addEventListener('click', (e) => {
    const b = e.target.closest('.seg button');
    if (!b) return;
    s[b.closest('.seg').dataset.key] = b.dataset.value;
    save();
    syncInputs();
    layout();
  });
  q('record').addEventListener('change', (e) => {
    s.record = e.target.checked;
    save();
    syncInputs();
    if (active && !floatWin) {
      if (s.record) startCamera();
      else if (!recording) stopCamera();
    }
  });
  q('selfview').addEventListener('change', (e) => {
    s.selfview = e.target.checked;
    save();
    prompter.classList.toggle('selfview', s.selfview);
  });

  // ---- Script ----

  const countWords = (t) => t.replace(/\[[^\]\n]*\]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const mmss = (sec) => {
    sec = Math.max(0, Math.round(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  let words = 0;

  function updateStats() {
    words = countWords(s.script);
    $('stats').textContent = words
      ? `${words} woorden · ongeveer ${mmss((words / s.wpm) * 60)} bij ${s.wpm} woorden per minuut`
      : '0 woorden';
  }

  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // Every word gets its own span, so layout() can find where each line starts and how many words it holds.
  const wordsHtml = (text, cls) => text.split(/(\s+)/).map((t) => (!t || /^\s+$/.test(t) ? esc(t) : `<span class="${cls}">${esc(t)}</span>`)).join('');
  function renderText() {
    const src = s.script.trim();
    let html = '';
    let i = 0;
    for (const m of src.matchAll(/\[([^\]\n]+)\]|\*\*([^*\n]+)\*\*/g)) {
      html += wordsHtml(src.slice(i, m.index), 'w');
      html += m[1] !== undefined ? `<span class="cue">${wordsHtml(`[${m[1]}]`, 'w c')}</span>` : `<strong>${wordsHtml(m[2], 'w')}</strong>`;
      i = m.index + m[0].length;
    }
    html += wordsHtml(src.slice(i), 'w');
    textEl.innerHTML = `${html}<span class="end">einde</span>`;
  }

  let renderT;
  scriptEl.addEventListener('input', () => {
    s.script = scriptEl.value;
    save();
    updateStats();
    if (active) {
      clearTimeout(renderT);
      renderT = setTimeout(() => { renderText(); layout(); }, 150);
    }
  });
  scriptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openPrompter(); }
  });

  // ---- Layout: where the text window goes ----

  let host = window; // the window that shows the prompter: this one, or the floating window
  let floatWin = null;
  let active = false;
  let pos = 0; // how far the text has scrolled, in px
  const geo = { readingY: 0, lh: 0, maxPos: 0, pxPerSec: 0 };
  let lines = []; // { top, words, cue, first } per rendered line; first is the index of its first word span
  let cum = [0]; // cum[i]: seconds before line i at the current pace (Per regel)
  let idx = 0; // current line (Per regel)
  let elapsed = 0; // seconds spent on the current line (Per regel)
  const isStep = () => s.mode === 'step';

  function cameraSide() {
    if (floatWin) return 'float';
    if (s.anchor !== 'auto') return s.anchor;
    if (!isPhone || host.innerHeight >= host.innerWidth) return 'top';
    // Phone in landscape: 90 means turned counter-clockwise, so the camera is on the left.
    const a = typeof window.orientation === 'number' ? window.orientation : screen.orientation && screen.orientation.angle;
    return a === -90 || a === 270 ? 'right' : 'left';
  }

  function safeArea() {
    if (floatWin) return { t: 0, r: 0, b: 0, l: 0 };
    const cs = getComputedStyle(probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function layout() {
    if (!active) return;
    const W = host.innerWidth;
    const H = host.innerHeight;
    const sa = safeArea();
    const where = cameraSide();
    prompter.dataset.side = where;
    prompter.classList.toggle('step', isStep());
    const lh = s.size * 1.3;
    const keepWord = lines.length ? lines[currentLine()].first : 0;

    prompter.style.setProperty('--size', `${s.size}px`);
    // Camera on the left (phone turned counter-clockwise): start every line at the lens.
    prompter.style.setProperty('--align', where === 'left' ? 'left' : s.align);
    prompter.style.setProperty('--pad-x', `${Math.round(s.size * 0.4)}px`);

    // Per regel: the line you read is the top line of the lens. Doorlopend: it starts one line lower and drifts up
    // into that headroom while you read it.
    const readingY = isStep() ? 0 : lh;
    // With the page under the status bar (home-screen app), the strip between the island and the safe area is free.
    const edge = (inset) => (island && inset >= 50 ? inset - 9 : inset) + s.gap + 2;
    let left;
    let top;
    let width;
    let height = readingY + s.lines * lh + lh * 0.5;
    if (where === 'float') {
      left = 0;
      top = 0;
      width = W;
      height = H;
    } else if (where === 'top') {
      width = clamp((W * s.width) / 100, Math.min(W, lh * 4), W);
      left = clamp((W - width) / 2 + CAM_OFFSET + s.shift, 0, W - width);
      top = Math.max(0, edge(sa.t));
    } else {
      // Camera on the short side (phone in landscape): same physical width as in portrait, current line at camera height.
      // Turned counter-clockwise the camera sits above the middle of the left edge, turned clockwise below the middle of the right.
      width = clamp((H * s.width) / 100, Math.min(W, lh * 4), W - sa.l - sa.r);
      left = where === 'left' ? edge(sa.l) : W - edge(sa.r) - width;
      left = clamp(left, 0, W - width);
      const camY = where === 'left' ? -CAM_OFFSET : CAM_OFFSET;
      top = clamp(H / 2 - readingY - lh / 2 + camY + s.shift, 0, Math.max(0, H - height));
    }

    Object.assign(lens.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    lens.style.setProperty('--fade-top', `${isStep() ? 0 : lh * 0.45}px`);
    lens.style.setProperty('--fade-bottom', `${Math.min(lh * 0.5, height * 0.25)}px`);
    lens.style.setProperty('--cur-end', `${readingY + lh}px`);
    marker.style.top = `${readingY + lh * 0.14}px`;
    marker.style.height = `${lh * 0.72}px`;
    countEl.style.fontSize = `${Math.round(Math.min(height * 0.7, 140))}px`;

    geo.lh = lh;
    geo.readingY = readingY;
    measureLines();
    // Stay on the same word when size, width or orientation change.
    idx = Math.max(0, lines.findLastIndex((l) => l.first <= keepWord));
    const end = textEl.querySelector('.end');
    geo.maxPos = isStep()
      ? (lines.length ? lines[lines.length - 1].top : 0)
      : Math.max(0, (end ? end.offsetTop : textEl.offsetHeight) - lh * 0.6);
    pos = lines.length ? lines[idx].top : 0;
    elapsed = Math.min(elapsed, lineDur(idx));
    updateSpeed();
  }

  function measureLines() {
    lines = [];
    const spans = textEl.querySelectorAll('.w');
    spans.forEach((sp, n) => {
      // Inline boxes sit half the leading below the top of their line.
      const top = sp.offsetTop - (geo.lh - sp.offsetHeight) / 2;
      let line = lines[lines.length - 1];
      if (!line || top - line.top > geo.lh * 0.5) {
        line = { top: Math.max(0, top), words: 0, cue: 0, first: n };
        lines.push(line);
      }
      if (sp.classList.contains('c')) line.cue += 1;
      else if (/[\p{L}\p{N}]/u.test(sp.textContent)) line.words += 1;
    });
  }

  // Seconds for a line at the set pace; a cue line such as [pauze] gets a beat, a paragraph end a short breath.
  function lineDur(i) {
    const l = lines[i];
    if (!l) return 0;
    let d = l.words ? (l.words * 60) / s.wpm : l.cue ? 1.2 : 0.5;
    if (lines[i + 1] && lines[i + 1].top - l.top > geo.lh * 1.5) d += 0.4;
    return d;
  }

  function currentLine() {
    if (isStep()) return clamp(idx, 0, lines.length - 1);
    const i = lines.findLastIndex((l) => l.top <= pos + geo.lh * 0.5);
    return Math.max(0, i);
  }

  // Pace in words per minute, whatever the font size or width: spread the reading time over the scroll distance.
  function updateSpeed() {
    geo.pxPerSec = words ? (geo.maxPos * s.wpm) / (words * 60) : 0;
    cum = [0];
    lines.forEach((_, i) => cum.push(cum[i] + lineDur(i)));
    hWpm.textContent = `${s.wpm} w/min`;
    applyPos();
  }

  function applyPos() {
    pos = clamp(pos, 0, geo.maxPos);
    track.style.transform = `translate3d(0, ${geo.readingY - pos}px, 0)`;
    if (isStep()) {
      const total = cum[cum.length - 1];
      const done = (cum[idx] || 0) + elapsed;
      bar.style.width = `${total ? (done / total) * 100 : 0}%`;
      hTime.textContent = total ? `nog ${mmss(total - done)}` : '';
    } else {
      bar.style.width = `${geo.maxPos ? (pos / geo.maxPos) * 100 : 0}%`;
      hTime.textContent = geo.pxPerSec ? `nog ${mmss((geo.maxPos - pos) / geo.pxPerSec)}` : '';
    }
  }

  // ---- Scrolling ----

  let playing = false;
  let last = 0;
  let rafId = 0;
  let rafHost = null;
  let dragging = false;

  // Per regel: the text glides to the current line instead of jumping, so the eye can follow.
  const gliding = () => isStep() && !dragging && lines.length > 0 && Math.abs(lines[idx].top - pos) > 0.5;

  function frame(t) {
    rafId = 0;
    if (!active) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    if (isStep()) {
      if (playing && !dragging && lines.length) {
        elapsed += dt;
        while (elapsed >= lineDur(idx) && playing) {
          if (idx >= lines.length - 1) {
            elapsed = lineDur(idx);
            setPlaying(false);
          } else {
            elapsed -= lineDur(idx);
            idx += 1;
          }
        }
      }
      if (!dragging && lines.length) {
        const target = lines[idx].top;
        pos += (target - pos) * Math.min(1, dt * 14);
        if (Math.abs(target - pos) < 0.5) pos = target;
      }
    } else if (playing && !dragging) {
      pos += geo.pxPerSec * dt;
      if (pos >= geo.maxPos) {
        pos = geo.maxPos;
        setPlaying(false);
      }
    }
    applyPos();
    if (playing || gliding()) schedule();
    else last = 0;
  }
  function schedule() {
    if (rafId || !active) return;
    rafHost = host;
    rafId = host.requestAnimationFrame(frame);
  }
  function setHost(w) {
    if (rafId) { try { rafHost.cancelAnimationFrame(rafId); } catch { /* window already closed */ } }
    rafId = 0;
    last = 0;
    host = w;
    schedule();
  }

  function setPlaying(v) {
    playing = v;
    last = 0;
    prompter.classList.toggle('playing', v);
    hPlay.setAttribute('aria-label', v ? 'Pauze' : 'Start');
    if (v) schedule();
  }

  const atEnd = () => (isStep() ? !lines.length || (idx >= lines.length - 1 && elapsed >= lineDur(idx) - 0.01) : pos >= geo.maxPos - 1);
  const atStart = () => (isStep() ? idx === 0 && elapsed === 0 : pos < 1);
  function restart() {
    idx = 0;
    elapsed = 0;
    pos = 0;
    applyPos();
  }

  function togglePlay() {
    if (countTimer) return cancelCountdown();
    if (playing) return setPlaying(false);
    if (atEnd()) restart();
    if (atStart() && !recording) countdown(() => setPlaying(true));
    else setPlaying(true);
  }

  // Per regel: one line back or ahead. Doorlopend: two lines.
  function step(n) {
    if (isStep()) {
      idx = clamp(idx + Math.sign(n), 0, Math.max(0, lines.length - 1));
      elapsed = 0;
      schedule();
    } else {
      pos += n * geo.lh;
    }
    applyPos();
  }

  // After dragging, settle on the line nearest to where you let go.
  function snap() {
    if (!isStep() || !lines.length) return;
    let best = 0;
    lines.forEach((l, i) => { if (Math.abs(l.top - pos) < Math.abs(lines[best].top - pos)) best = i; });
    idx = best;
    elapsed = 0;
    schedule();
  }

  function nudgeWpm(d) {
    s.wpm = clamp(s.wpm + d, 60, 260);
    save();
    syncInputs();
    updateStats();
    updateSpeed();
    toast(`${s.wpm} woorden per minuut`);
  }

  function nudgeSize(d) {
    s.size = clamp(s.size + d, 16, 96);
    save();
    syncInputs();
    layout();
    toast(`tekst ${s.size} px`);
  }

  let countTimer = null;
  let countHost = window;
  function countdown(done) {
    let n = Number(s.countdown);
    if (!n) return done();
    countEl.textContent = n;
    prompter.classList.add('counting');
    // Timers of the visible window: the main tab may be hidden behind Zoom while the floating window counts down.
    countHost = host;
    countTimer = host.setInterval(() => {
      n -= 1;
      if (n > 0) {
        countEl.textContent = n;
        return;
      }
      cancelCountdown();
      done();
    }, 1000);
  }
  function cancelCountdown() {
    try { countHost.clearInterval(countTimer); } catch { /* window already closed */ }
    countTimer = null;
    prompter.classList.remove('counting');
  }

  // ---- Touch, mouse, keyboard ----

  let wakeT;
  function wake() {
    prompter.classList.add('awake');
    clearTimeout(wakeT);
    wakeT = setTimeout(() => prompter.classList.remove('awake'), 2500);
  }

  let toastT;
  function toast(msg, ms = 1300) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  let down = null;
  prompter.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#hud, #sheet')) return;
    down = { id: e.pointerId, y: e.clientY, start: e.clientY, t: Date.now(), moved: false };
    try { prompter.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  });
  prompter.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') wake();
    if (!down || down.id !== e.pointerId) return;
    if (!down.moved && Math.abs(e.clientY - down.start) > 8) {
      down.moved = true;
      dragging = true;
    }
    if (down.moved) {
      pos -= e.clientY - down.y;
      applyPos();
    }
    down.y = e.clientY;
  });
  const endPointer = (e) => {
    if (!down || down.id !== e.pointerId) return;
    const tap = !down.moved && Date.now() - down.t < 500 && e.type === 'pointerup';
    const moved = down.moved;
    down = null;
    dragging = false;
    last = 0;
    if (moved) snap();
    if (tap) {
      togglePlay();
      wake();
    }
  };
  prompter.addEventListener('pointerup', endPointer);
  prompter.addEventListener('pointercancel', endPointer);
  let wheelSum = 0;
  prompter.addEventListener('wheel', (e) => {
    if (e.target.closest('#sheet')) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * geo.lh : e.deltaY;
    if (!isStep()) {
      pos += d;
      applyPos();
      return;
    }
    // Per regel: a line per notch or per stretch of trackpad swipe.
    wheelSum += d;
    if (Math.abs(wheelSum) >= geo.lh * 0.6) {
      step(wheelSum);
      wheelSum = 0;
    }
  }, { passive: false });

  function onKey(e) {
    if (!active) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (!sheet.hidden) {
      if (e.key === 'Escape') closeSheet();
      return;
    }
    if (!result.hidden) return;
    switch (e.key) {
      case ' ': case 'k': case 'K': case 'b': case 'B': case '.': togglePlay(); break;
      case 'ArrowUp': nudgeWpm(5); break;
      case 'ArrowDown': nudgeWpm(-5); break;
      case 'ArrowLeft': case 'PageUp': step(-2); break;
      case 'ArrowRight': case 'PageDown': step(2); break;
      case '+': case '=': nudgeSize(2); break;
      case '-': case '_': nudgeSize(-2); break;
      case 'Home': restart(); break;
      case 'Enter': if (stream) toggleRecord(); else togglePlay(); break;
      case 'Escape': closePrompter(); break;
      default: return;
    }
    e.preventDefault();
    wake();
  }
  window.addEventListener('keydown', onKey);

  hPlay.addEventListener('click', () => { togglePlay(); wake(); });
  $('h-back').addEventListener('click', () => { step(-2); wake(); });
  $('h-fwd').addEventListener('click', () => { step(2); wake(); });
  $('h-home').addEventListener('click', () => { restart(); wake(); });
  $('h-slower').addEventListener('click', () => { nudgeWpm(-5); wake(); });
  $('h-faster').addEventListener('click', () => { nudgeWpm(5); wake(); });
  $('h-close').addEventListener('click', () => closePrompter());
  hRec.addEventListener('click', () => { toggleRecord(); wake(); });
  $('h-gear').addEventListener('click', openSheet);
  $('sheet-done').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  // Settings move into a bottom sheet so you can tune size and position while the text sits under the camera.
  function openSheet() {
    $('sheet-inner').prepend(settings);
    sheet.hidden = false;
  }
  function closeSheet() {
    $('settings-home').append(settings);
    sheet.hidden = true;
  }

  window.addEventListener('resize', () => layout());
  window.addEventListener('orientationchange', () => setTimeout(layout, 300));

  // ---- Camera and recording ----

  let stream = null;
  let recorder = null;
  let chunks = [];
  let recording = false;
  let recStart = 0;
  let recTimer = null;

  async function startCamera() {
    if (stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      toast('Opnemen kan hier niet. Open de app via https in Safari of Chrome.', 4500);
      return false;
    }
    const portrait = window.innerHeight >= window.innerWidth;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: portrait ? 1080 : 1920 }, height: { ideal: portrait ? 1920 : 1080 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false },
      });
    } catch {
      toast('Geen toegang tot camera of microfoon. Geef toestemming in je browser.', 4500);
      return false;
    }
    if (!active) {
      stopCamera();
      return false;
    }
    preview.srcObject = stream;
    preview.play().catch(() => {});
    prompter.classList.add('cam');
    prompter.classList.toggle('selfview', s.selfview);
    return true;
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    preview.srcObject = null;
    prompter.classList.remove('cam');
  }

  function pickMime() {
    const types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  }

  function toggleRecord() {
    if (!stream) return;
    if (countTimer) return cancelCountdown();
    if (recording) return stopRecording();
    if (atEnd()) restart();
    setPlaying(false);
    countdown(() => {
      if (!stream) return;
      startRecording();
      setPlaying(true);
    });
  }

  function startRecording() {
    chunks = [];
    const mimeType = pickMime();
    const opts = { videoBitsPerSecond: 8000000, audioBitsPerSecond: 128000 };
    if (mimeType) opts.mimeType = mimeType;
    try {
      recorder = new MediaRecorder(stream, opts);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = finishRecording;
    recorder.start(1000);
    recording = true;
    recStart = Date.now();
    prompter.classList.add('recording');
    hRec.setAttribute('aria-label', 'Opname stoppen');
    const showTime = () => { hRecTime.textContent = `● ${mmss((Date.now() - recStart) / 1000)}`; };
    showTime();
    recTimer = setInterval(showTime, 500);
  }

  function stopRecording() {
    recording = false;
    setPlaying(false);
    clearInterval(recTimer);
    hRecTime.textContent = '';
    prompter.classList.remove('recording');
    hRec.setAttribute('aria-label', 'Opname starten');
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  let resultUrl = null;
  let resultFile = null;
  function finishRecording() {
    const type = ((recorder && recorder.mimeType) || (chunks[0] && chunks[0].type) || 'video/mp4').split(';')[0];
    const blob = new Blob(chunks, { type });
    chunks = [];
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = `opname-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    resultFile = new File([blob], name, { type });
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    $('result-video').src = resultUrl;
    $('r-download').href = resultUrl;
    $('r-download').download = name;
    $('result-info').textContent = `${mmss((Date.now() - recStart) / 1000)} · ${(blob.size / 1048576).toFixed(1)} MB · ${name}`;
    $('r-share').hidden = !(navigator.canShare && navigator.canShare({ files: [resultFile] }));
    result.hidden = false;
  }

  function hideResult() {
    result.hidden = true;
    $('result-video').removeAttribute('src');
    $('result-video').load();
  }

  $('r-share').addEventListener('click', () => {
    navigator.share({ files: [resultFile] }).catch((err) => {
      if (err.name !== 'AbortError') toast('Delen lukte niet. Gebruik Download.', 3000);
    });
  });
  $('r-again').addEventListener('click', () => {
    hideResult();
    restart();
  });
  $('r-done').addEventListener('click', () => {
    hideResult();
    closePrompter();
  });

  // ---- Open and close ----

  let lock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
    } catch { /* not allowed right now */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (active && document.visibilityState === 'visible') keepAwake();
  });

  function openPrompter() {
    if (floatWin) closePrompter();
    // Full screen on the Mac puts the top of the page right under the notch and camera. iPhone Safari has no full screen for pages.
    if (!isIOS && document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    active = true;
    editor.hidden = true;
    prompter.hidden = false;
    renderText();
    pos = 0;
    geo.maxPos = 0;
    lines = [];
    idx = 0;
    elapsed = 0;
    setPlaying(false);
    layout();
    // Fonts and the full-screen switch can change the size after this frame.
    setTimeout(layout, 120);
    setTimeout(layout, 600);
    schedule();
    keepAwake();
    wake();
    if (s.record) startCamera();
  }

  function closePrompter() {
    if (recording) return stopRecording(); // shows the result first
    if (!active) return;
    cancelCountdown();
    setPlaying(false);
    closeSheet();
    active = false;
    stopCamera();
    prompter.hidden = true;
    editor.hidden = false;
    if (floatWin) {
      const w = floatWin;
      floatWin = null;
      w.close();
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (lock) lock.release().catch(() => {});
    lock = null;
    updateFloatButton();
  }

  // Chrome and Edge: an always-on-top window you drag under the camera, on top of Zoom, Loom, QuickTime or OBS.
  async function openFloat() {
    if (floatWin) return closePrompter();
    if (active) closePrompter();
    const lh = s.size * 1.3;
    let pip;
    try {
      pip = await window.documentPictureInPicture.requestWindow({
        width: Math.round(clamp((screen.width * s.width) / 100, 300, screen.width * 0.6)),
        height: Math.round(lh * (s.lines + 1.5)),
      });
    } catch {
      toast('Zwevend venster openen lukte niet.', 3000);
      return;
    }
    floatWin = pip;
    pip.document.title = 'Teleprompter';
    for (const l of document.querySelectorAll('link[rel=stylesheet]')) {
      const c = pip.document.createElement('link');
      c.rel = 'stylesheet';
      c.href = l.href;
      c.onload = () => layout();
      pip.document.head.append(c);
    }
    pip.document.body.className = 'pip';
    pip.document.body.append(prompter);
    pip.addEventListener('keydown', onKey);
    pip.addEventListener('resize', () => layout());
    pip.addEventListener('pagehide', () => {
      document.body.insertBefore(prompter, result);
      setHost(window);
      if (floatWin === pip) {
        floatWin = null;
        closePrompter();
      }
    });
    setHost(pip);
    active = true;
    prompter.hidden = false;
    renderText();
    pos = 0;
    geo.maxPos = 0;
    lines = [];
    idx = 0;
    elapsed = 0;
    setPlaying(false);
    layout();
    schedule();
    wake();
    updateFloatButton();
  }

  function updateFloatButton() {
    $('float').textContent = floatWin ? 'Sluit zwevend venster' : 'Zwevend venster';
  }

  $('start').addEventListener('click', openPrompter);
  $('float').addEventListener('click', openFloat);

  // ---- Start ----

  scriptEl.value = s.script;
  syncInputs();
  updateStats();
  $('float').hidden = !canFloat;
  // Opened from the Contentmachine (?van=contentmachine): a way back, also after a reload.
  try {
    if (new URLSearchParams(location.search).get('van') === 'contentmachine') sessionStorage.setItem('tp-van', 'contentmachine');
    $('back').hidden = sessionStorage.getItem('tp-van') !== 'contentmachine';
  } catch { /* no session storage: no back link */ }
  $('install-tip').hidden = !(isIOS && isPhone && !standalone);
  $('float-hint').textContent = canFloat
    ? 'Zwevend venster: blijft boven Zoom, Loom, QuickTime of OBS. Sleep het één keer pal onder je camera.'
    : isPhone
      ? 'Wil je opnemen? Zet "Opnemen in de app" aan. Na afloop bewaar je de video in Foto\'s.'
      : 'Wil je opnemen met Zoom, Loom of QuickTime? Open deze pagina in Chrome of Edge voor een zwevend venster.';
})();
