'use strict';

// Teleprompter that puts the text window (#lens) right next to the camera, so reading looks like eye contact.
// The line being read sits in the top band of the lens; the text scrolls up at a pace set in words per minute.
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = 'teleprompter-v1';

  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isPhone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const canFloat = 'documentPictureInPicture' in window && !isPhone;

  const SAMPLE = `Hoi! Dit is je teleprompter.

Deze regel staat pal onder je camera. Zo kijk je altijd in de lens terwijl je leest.

[pauze]

Tik op het scherm om te pauzeren. Sleep om terug te gaan. Met de plus en min onderin pas je het tempo aan.

Plak je eigen tekst en druk op **start**. Succes met opnemen!`;

  const DEFAULTS = {
    script: SAMPLE,
    wpm: 140,
    size: isPhone ? 28 : 40,
    width: isPhone ? 86 : 34,
    lines: 3,
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
  function renderText() {
    const html = esc(s.script.trim())
      .replace(/\[([^\]\n]+)\]/g, '<span class="cue">[$1]</span>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
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
    const lh = s.size * 1.3;
    const progress = geo.maxPos > 0 ? pos / geo.maxPos : 0;

    prompter.style.setProperty('--size', `${s.size}px`);
    prompter.style.setProperty('--align', s.align);
    prompter.style.setProperty('--pad-x', `${Math.round(s.size * 0.4)}px`);

    // The line being read starts one line below the lens top and drifts up into that headroom while you read it.
    const readingY = lh;
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
      left = clamp((W - width) / 2 + s.shift, 0, W - width);
      top = Math.max(0, sa.t + s.gap + 4);
    } else {
      // Camera on the short side (phone in landscape): same physical width as in portrait, current line at camera height.
      width = clamp((H * s.width) / 100, Math.min(W, lh * 4), W - sa.l - sa.r);
      left = where === 'left' ? sa.l + s.gap + 4 : W - sa.r - s.gap - 4 - width;
      left = clamp(left, 0, W - width);
      top = clamp(H / 2 - readingY - lh / 2 + s.shift, 0, Math.max(0, H - height));
    }

    Object.assign(lens.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    lens.style.setProperty('--fade-top', `${lh * 0.45}px`);
    lens.style.setProperty('--fade-bottom', `${Math.min(lh * 0.5, height * 0.25)}px`);
    marker.style.top = `${readingY + lh * 0.14}px`;
    marker.style.height = `${lh * 0.72}px`;
    countEl.style.fontSize = `${Math.round(Math.min(height * 0.7, 140))}px`;

    const end = textEl.querySelector('.end');
    geo.lh = lh;
    geo.readingY = readingY;
    geo.maxPos = Math.max(0, (end ? end.offsetTop : textEl.offsetHeight) - lh * 0.6);
    pos = progress * geo.maxPos;
    updateSpeed();
    applyPos();
  }

  // Pace in words per minute, whatever the font size or width: spread the reading time over the scroll distance.
  function updateSpeed() {
    geo.pxPerSec = words ? (geo.maxPos * s.wpm) / (words * 60) : 0;
    hWpm.textContent = `${s.wpm} w/min`;
    applyPos();
  }

  function applyPos() {
    pos = clamp(pos, 0, geo.maxPos);
    track.style.transform = `translate3d(0, ${geo.readingY - pos}px, 0)`;
    bar.style.width = `${geo.maxPos ? (pos / geo.maxPos) * 100 : 0}%`;
    hTime.textContent = geo.pxPerSec ? `nog ${mmss((geo.maxPos - pos) / geo.pxPerSec)}` : '';
  }

  // ---- Scrolling ----

  let playing = false;
  let last = 0;
  let rafId = 0;
  let rafHost = null;
  let dragging = false;

  function frame(t) {
    rafId = 0;
    if (!active || !playing) {
      last = 0;
      return;
    }
    if (last && !dragging) {
      pos += geo.pxPerSec * Math.min(0.1, (t - last) / 1000);
      if (pos >= geo.maxPos) {
        pos = geo.maxPos;
        setPlaying(false);
      }
      applyPos();
    }
    last = t;
    schedule();
  }
  function schedule() {
    if (rafId || !active || !playing) return;
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

  function togglePlay() {
    if (countTimer) return cancelCountdown();
    if (playing) return setPlaying(false);
    if (pos >= geo.maxPos - 1) pos = 0;
    if (pos < 1 && !recording) countdown(() => setPlaying(true));
    else setPlaying(true);
  }

  function step(n) {
    pos += n * geo.lh;
    applyPos();
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
    down = null;
    dragging = false;
    last = 0;
    if (tap) {
      togglePlay();
      wake();
    }
  };
  prompter.addEventListener('pointerup', endPointer);
  prompter.addEventListener('pointercancel', endPointer);
  prompter.addEventListener('wheel', (e) => {
    if (e.target.closest('#sheet')) return;
    e.preventDefault();
    pos += e.deltaMode === 1 ? e.deltaY * geo.lh : e.deltaY;
    applyPos();
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
      case 'Home': pos = 0; applyPos(); break;
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
  $('h-home').addEventListener('click', () => { pos = 0; applyPos(); wake(); });
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
    if (pos >= geo.maxPos - 1) pos = 0;
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
    pos = 0;
    applyPos();
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
