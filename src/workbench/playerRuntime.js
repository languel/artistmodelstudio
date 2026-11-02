// The player inside an exported page (see playerPage.js). This file is embedded as text (`?raw`), not run by the studio: it is one function,
// it uses nothing outside itself, and nothing here is changed by the build.
function playerRuntime(DATA) {
  const RENDER = /[?&]render\b/.test(location.search);   // a page being turned into a video (scripts/render-video.mjs): no controls, the picture fills the window
  if (RENDER) document.body.classList.add('render');
  const $ = (s, r = document) => r.querySelector(s);
  const stage = $('.stage'), cur = $('.cur'), halo = $('.halo'), mouse = $('.mouse'), sub = $('.sub'), keys = $('.keys');
  const playBtn = $('.play'), ccBtn = $('.cc'), fadeEl = $('.fade');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const ABORT = Symbol('stop');
  let lastLoop = Promise.resolve(), run = null, pos = { x: innerWidth / 2, y: innerHeight - 90 }, at = 0, want = 0, pending = null, starting = false;   // `at`: the cue Play starts from (after a stop, the one it stopped on)
  const fast = () => Boolean(run && run.fast);   // catching up to a cue: state is set at once, with no cursor and no waiting

  // Slides: one section per frame of the script. A slide's sketches run only while it shows; the others are unloaded.
  let slide = -1;
  const fit = () => { const cur = DATA.slides[Math.max(0, slide)] || { w: 800, h: 600 }; const k = Math.min(innerWidth / cur.w, (innerHeight - (RENDER ? 0 : 64)) / cur.h) * 0.97; stage.style.setProperty('--k', k); stage.style.setProperty('--W', cur.w + 'px'); stage.style.setProperty('--H', cur.h + 'px'); };
  const showSlide = i => {
    if (i === slide || i < 0) return;
    slide = i;
    document.querySelectorAll('.slide').forEach((sec, j) => {
      sec.classList.toggle('on', j === i);
      for (const f of sec.querySelectorAll('iframe[data-srcdoc]')) {
        if (j === i) { if (!f.getAttribute('srcdoc')) f.srcdoc = f.dataset.srcdoc; }
        else if (f.getAttribute('srcdoc') != null) { f.removeAttribute('srcdoc'); f.src = 'about:blank'; }
      }
    });
    fit();
  };
  addEventListener('resize', fit);
  showSlide(0);

  const place = (x, y) => { pos = { x, y }; cur.style.transform = `translate(${x - 5}px,${y - 3}px)`; mouse.style.transform = `translate(${x + 18}px,${y + 12}px)`; };
  const press = (btn, on) => { mouse.classList.toggle('on', on); mouse.classList.toggle('left', on && btn === 'left'); };
  const click = async () => { if (fast()) return; halo.style.setProperty('--t', `translate(${pos.x - 14}px,${pos.y - 14}px)`); halo.style.transform = `translate(${pos.x - 14}px,${pos.y - 14}px)`; halo.classList.remove('on'); void halo.offsetWidth; halo.classList.add('on'); await sleep(260); };
  const check = () => { if (!run || run.aborted) throw ABORT; };
  const gate = async () => { while (run && run.paused && !run.aborted) await sleep(80); check(); };
  const pause = async ms => {
    await gate(); if (fast()) return;
    const end = performance.now() + ms;
    while (performance.now() < end) { await sleep(Math.min(40, end - performance.now())); await gate(); }
  };
  // a sketch is ready when its page has run (its controls are there); a new one is loaded a moment after it is shown
  const ready = async f => {
    for (let i = 0; i < 120; i++) { try { const w = f.contentWindow; if (w && w.document.readyState === 'complete' && w.__set) break; } catch { /* not yet */ } await sleep(50); check(); }
    await sleep(150); check();
  };
  const board = t => document.querySelector(`[data-board="${CSS.escape(t)}"]`);

  const glide = async (x, y, ms) => {
    if (fast()) { place(x, y); return; }
    const x0 = pos.x, y0 = pos.y, t0 = performance.now(), d = ms ?? Math.min(900, 250 + Math.hypot(x - x0, y - y0) * 0.6);
    cur.hidden = false;
    await new Promise(res => { const step = now => { if (!run || run.aborted) return res(); const t = Math.min(1, (now - t0) / d), e = ease(t); place(x0 + (x - x0) * e, y0 + (y - y0) * e); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
    check();
  };
  const down = async (drag) => { press('left', true); await click(); };

  const showKeys = chord => {
    const row = document.createElement('div'); row.className = 'key';
    const L = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', escape: 'Esc', enter: '↵', cmd: '⌘', meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' };
    for (const p of String(chord).split('+')) { const k = document.createElement('kbd'); k.textContent = L[p.trim().toLowerCase()] || (p.trim().length === 1 ? p.trim().toUpperCase() : p.trim()); row.append(k); }
    keys.append(row); requestAnimationFrame(() => row.classList.add('on'));
    setTimeout(() => { row.classList.remove('on'); setTimeout(() => row.remove(), 300); }, 1400);
  };

  // text of an element, selected progressively as the cursor passes
  const textNodes = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = []; for (let n; (n = w.nextNode());) if (n.nodeValue.length && !(n.parentElement && (n.parentElement.tagName === 'I' || n.parentElement.closest('.w')))) out.push(n); return out; };
  const selectNodes = async (nodes, onLine) => {
    const total = nodes.reduce((a, n) => a + n.nodeValue.length, 0), sel = getSelection();
    const caret = k => { let left = Math.round(k * total); for (const n of nodes) { if (left <= n.nodeValue.length) return [n, left]; left -= n.nodeValue.length; } const l = nodes[nodes.length - 1]; return [l, l.nodeValue.length]; };
    const rect = k => { const [n, o] = caret(k), r = document.createRange(); r.setStart(n, Math.max(0, o - (o > 0 ? 1 : 0))); r.setEnd(n, Math.max(o, 1)); const b = r.getBoundingClientRect(); return [k === 0 ? b.left : b.right, b.top + b.height / 2, n]; };
    if (fast()) { const [a, ao] = caret(0), [b, bo] = caret(1); sel.setBaseAndExtent(a, ao, b, bo); onLine && onLine(b); return; }
    const [sx, sy] = rect(0), [ex, ey] = rect(1);
    await glide(sx, sy); await down();
    const ms = Math.min(2600, 500 + total * 24), t0 = performance.now();
    const set = k => { const [a, ao] = caret(0), [b, bo] = caret(k); sel.setBaseAndExtent(a, ao, b, bo); onLine && onLine(b); };
    await new Promise(res => { const step = now => { if (!run || run.aborted) return res(); const t = Math.min(1, (now - t0) / ms), k = ease(t); set(k); const [x, y] = rect(k); place(x, y || sy); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
    set(1); place(ex, ey); press('left', false); check();
  };

  const cues = {
    async goto(t) {
      const i = DATA.where[t]; if (i !== undefined && i !== slide) { showSlide(i); await pause(400); }
      const el = board(t); if (el && el.classList.contains('pane') && !fast()) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); }
      await pause(500);
    },
    async restart(t) { const f = $('iframe', board(t)); if (!f) return; await new Promise(r => { f.addEventListener('load', r, { once: true }); f.srcdoc = f.dataset.srcdoc || f.srcdoc; }); if (fast()) await ready(f); await pause(900); },
    async drag(d) {
      const f = $('iframe', board(d.on)); if (!f) return;
      const w = f.contentWindow, aspect = w.innerWidth / w.innerHeight;
      const frac = ([x, y]) => (d.space && d.space.frame ? [0.5 + x / (d.space.frame * aspect), 0.5 - y / d.space.frame] : [x, y]);
      const pts = d.path.map(frac);
      const screen = ([fx, fy]) => { const r = f.getBoundingClientRect(); return [r.left + fx * r.width, r.top + fy * r.height]; };
      const send = (t, [fx, fy], buttons) => {
        const x = fx * w.innerWidth, y = fy * w.innerHeight, el = w.document.elementFromPoint(Math.min(w.innerWidth - 1, Math.max(0, x)), Math.min(w.innerHeight - 1, Math.max(0, y))) || w.document.body;
        const base = { bubbles: true, cancelable: true, view: w, clientX: x, clientY: y, button: 0, buttons };
        el.dispatchEvent(t.startsWith('pointer') ? new w.PointerEvent(t, { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new w.MouseEvent(t, base));
      };
      if (fast()) {
        await ready(f); send('pointermove', pts[0], 0); send('pointerdown', pts[0], 1); send('mousedown', pts[0], 1);
        for (const p of pts) send('pointermove', p, 1);
        const e = pts[pts.length - 1]; send('pointerup', e, 0); send('mouseup', e, 0); return;
      }
      await glide(...screen(pts[0])); send('pointermove', pts[0], 0); await pause(200);
      press('left', true); await click();
      send('pointerdown', pts[0], 1); send('mousedown', pts[0], 1);
      const total = d.ms || 1600, n = pts.length - 1, t0 = performance.now();
      const at = u => { const k = Math.min(n - 1e-9, u * n), i = Math.floor(k), s = k - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * s, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * s]; };
      if (n > 0) await new Promise(res => { const step = now => { if (!run || run.aborted) return res(); const t = Math.min(1, (now - t0) / total), p = at(ease(t)); place(...screen(p)); send('pointermove', p, 1); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
      check();
      const last = pts[pts.length - 1]; send('pointermove', last, 1); send('pointerup', last, 0); send('mouseup', last, 0); press('left', false);
      await pause(350);
    },
    async click(c) {
      const el = c.summary && $('details.md-callout > summary', board(c.summary)); if (!el) return;
      if (fast()) { el.click(); return; }
      el.scrollIntoView({ block: 'nearest' }); await frame();
      const r = el.getBoundingClientRect(); await glide(r.left + Math.min(r.width / 2, 90 * (r.width / (el.offsetWidth || 1))), r.top + r.height / 2);
      press('left', true); await click(); el.click(); press('left', false); await pause(350);
    },
    async select(s) {
      if (s.pseudo) {
        const root = board(s.pseudo), li = root && [...root.querySelectorAll('.pseudo li:not(.gap)')][s.line - 1], code = li && li.querySelector('.code'); if (!code) return;
        code.scrollIntoView({ block: 'nearest' }); await frame();
        for (const x of document.querySelectorAll('li.sc-hl')) x.classList.remove('sc-hl');
        await selectNodes(textNodes(code)); li.classList.add('sc-hl'); await pause(250);
      } else if (s.code) {
        const root = board(s.code), lines = root && [...root.querySelectorAll('.ln')]; if (!lines) return;
        let a = s.lines && s.lines[0], b = s.lines && s.lines[1];
        if (!a) { a = lines.findIndex(l => l.textContent.includes(s.from)) + 1; b = lines.findIndex((l, i) => i >= a - 1 && l.textContent.includes(s.to)) + 1 + (s.extra || 0); }
        if (!a || !b) return;
        const sel = lines.slice(a - 1, b); sel[0].scrollIntoView({ block: 'center' }); await frame();
        for (const l of lines) l.classList.remove('sel');
        const nodes = sel.flatMap(l => textNodes($('.t', l)));
        await selectNodes(nodes, n => { const row = n.parentElement.closest('.ln'); for (const l of sel) l.classList.toggle('sel', sel.indexOf(l) <= sel.indexOf(row)); });
        await pause(300);
      }
    },
    async clear(c) { const b = board(c.on); if (b) await scriptDraw(b, { clear: c.layer || true }); },
    async draw(d, layer) { const b = board(d.on); if (!b) return; await scriptDraw(b, { ...d, layer: d.layer || layer || 'draw' }, { html: t => DATA.math[t] || '', pace: 1, fast: fast() }); check(); },
    async formula(c) { await cues.draw({ on: c.on, layer: c.layer || 'formula', shapes: [{ t: 'formula', at: c.at, align: c.align, tex: c.tex, size: c.size }] }, 'formula'); },
    async set(c) {
      // as a person would: find the control in the code, go to it, then change it: a slider is pressed and dragged to its new place
      const f = $('iframe', board(c.on)), w = widgets.find(x => x.sketch === c.on && x.spec.name === c.name);
      if (f && fast()) await ready(f);
      if (!w) { try { if (f && f.contentWindow && f.contentWindow.__set) f.contentWindow.__set(c.name, c.value); } catch { /* the sketch's own error */ } await pause(300); return; }
      if (fast()) { drive(w, c.value); return; }
      if (w.input.scrollIntoView) w.input.scrollIntoView({ block: 'center' });
      await frame();
      w.box.classList.add('live');
      const r = w.input.getBoundingClientRect(), mid = r.top + r.height / 2;
      if (w.spec.kind === 'range') {
        const min = Number(w.input.min), max = Number(w.input.max), from = Number(w.input.value), to = Number(c.value);
        const xOf = v => r.left + 7 + (r.width - 14) * ((v - min) / ((max - min) || 1));
        await glide(xOf(from), mid); press('left', true); await click(); await pause(150);
        const ms = Math.max(700, Math.min(1800, 500 + Math.abs(to - from) / ((max - min) || 1) * 1500)), t0 = performance.now();
        await new Promise(res => { const step = now => { if (!run || run.aborted) return res(); const t = Math.min(1, (now - t0) / ms), v = from + (to - from) * ease(t); drive(w, v); place(xOf(v), mid); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
        drive(w, to); press('left', false);
      } else {
        await glide(r.left + r.width / 2, mid); press('left', true); await click(); drive(w, c.value); press('left', false);
      }
      w.box.classList.remove('live');
      check();
      await pause(300);
    },
    async point(p) {
      const f = $('iframe', board(p.on)), el = f || board(p.on); if (!el) return;
      const w = f && f.contentWindow, aspect = w ? w.innerWidth / w.innerHeight : 1;
      const frac = ([x, y]) => (p.space && p.space.frame ? [0.5 + x / (p.space.frame * aspect), 0.5 - y / p.space.frame] : [x, y]);
      if (fast()) return;
      for (const spot of Array.isArray(p.at[0]) ? p.at : [p.at]) {
        const r = el.getBoundingClientRect(), [fx, fy] = frac(spot);
        await glide(r.left + fx * r.width, r.top + fy * r.height); await click(); await pause(p.dwell == null ? 700 : p.dwell);
      }
    },
    async key(k) { if (fast()) return; showKeys(k); await pause(500); },
    async wait(ms) { await pause(ms); }
  };

  const speak = (uri, i) => new Promise(res => {
    if (!uri) return res(0);
    const a = new Audio(uri); run.audio = a;
    a.onplaying = () => { const c = window.__ams.cues[i]; if (c && !c.audio) c.audio = Date.now(); };
    a.onended = () => res(1); a.onerror = () => res(0);
    a.play().catch(() => res(0));
  });

  const setSub = t => { sub.textContent = t || ''; sub.classList.toggle('on', Boolean(t)); };

  // ---- the controls in the code: a widget before each value, as in the studio. It drives the sketch, and the script's `set` moves it too.
  const widgets = [];
  const decimals = st => (String(st).split('.')[1] || '').length;
  const textOf = (spec, v) => (spec.kind === 'range' ? String(+(+v).toFixed(Math.min(6, decimals(spec.step)))) : spec.kind === 'toggle' ? String(Boolean(v)) : spec.q + v + spec.q);
  const reflect = (w, v) => {
    if (w.spec.kind === 'toggle') w.input.checked = Boolean(v); else w.input.value = v;
    w.cv.textContent = textOf(w.spec, v);
  };
  /** Change a control: the widget, its value in the code, and the sketch. */
  function drive(w, v) {
    reflect(w, v);
    const f = $('iframe', board(w.sketch)); try { f && f.contentWindow.__set(w.spec.name, v); } catch { /* the sketch's own error */ }
  }
  function showControl(sketch, name, value) { for (const w of widgets) if (w.sketch === sketch && w.spec.name === name) reflect(w, value); }
  function decorateCode() {
    for (const pane of document.querySelectorAll('.pane.code[data-controls]')) {
      const specs = JSON.parse(pane.dataset.controls || '[]'), sketch = pane.dataset.sketch;
      for (const el of pane.querySelectorAll('i.w')) {
        const spec = specs.find(x => x.name === el.dataset.name), cv = el.nextElementSibling;
        if (!spec || !cv || (spec.kind === 'color' && !/^#[0-9a-f]{6}$/i.test(spec.value))) continue;
        let input;
        if (spec.kind === 'select') { input = document.createElement('select'); for (const o of spec.options || []) { const op = document.createElement('option'); op.value = op.textContent = o; input.append(op); } }
        else { input = document.createElement('input'); input.type = spec.kind === 'range' ? 'range' : spec.kind === 'toggle' ? 'checkbox' : 'color'; if (spec.kind === 'range') { input.min = spec.min; input.max = spec.max; input.step = spec.step || 'any'; } }
        const w = { sketch, spec, input, cv, box: el }; widgets.push(w); el.append(input); reflect(w, spec.value);
        input.addEventListener(spec.kind === 'select' || spec.kind === 'toggle' ? 'change' : 'input', () => {
          drive(w, spec.kind === 'range' ? Number(input.value) : spec.kind === 'toggle' ? input.checked : input.value);
        });
      }
    }
  }
  decorateCode();

  // ---- the timeline: where the script is, seeking, and notes ---------------------------------------------------------
  const KEY = 'ams-notes:' + DATA.id;
  const loadNotes = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const saveNotes = n => { try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* the notes can still be copied out */ } };
  const tl = timelineBar($('.tlhost'), {
    title: DATA.title, cues: DATA.cues, spans: DATA.spans, total: DATA.total, notes: loadNotes(),
    onSeek: i => startAt(i), onToggle: () => (run ? togglePause() : startAt(at)), onStop: () => stop(), onNotes: saveNotes
  });
  // typing a note pauses the script
  $('.tlhost').addEventListener('focusin', e => { if (e.target.tagName === 'INPUT' && run && !run.paused) togglePause(); });
  const seconds = r => (performance.now() - r.cueStart - r.pausedMs - (r.paused ? performance.now() - r.pausedAt : 0)) / 1000;
  (function tick() { const typing = document.activeElement && document.activeElement.tagName === 'INPUT'; if (run && !run.fast && !typing) tl.setPos(run.cue, seconds(run)); requestAnimationFrame(tick); })();   // (while a note is typed it keeps the moment it was started at)

  // A fresh page for a run: nothing drawn, nothing selected, every sketch loaded again, so a run from any cue starts from the start.
  const reset = () => {
    fadeEl.style.transitionDuration = '0ms'; fadeEl.classList.remove('on');
    document.querySelectorAll('.sc-over').forEach(o => o.remove());
    document.querySelectorAll('.ln.sel').forEach(l => l.classList.remove('sel'));
    document.querySelectorAll('li.sc-hl').forEach(l => l.classList.remove('sc-hl'));
    document.querySelectorAll('details.md-callout[open]').forEach(d => d.removeAttribute('open'));
    document.querySelectorAll('.pane .lines, .pane.markdown').forEach(e => { e.scrollTop = 0; });
    getSelection().removeAllRanges();
    for (const f of document.querySelectorAll('iframe[data-srcdoc]')) if (f.getAttribute('srcdoc') != null) { f.removeAttribute('srcdoc'); f.src = 'about:blank'; }
    for (const w of widgets) reflect(w, w.spec.value);
    slide = -1;
  };

  // What a cue before the starting one leaves behind, on the slide that will be showing: it is done at once. Boards on other slides, and
  // what a later restart wipes anyway, are left alone.
  const plan = from => {
    let target = 0; const lastRestart = {};
    for (let j = 0; j <= from && j < DATA.cues.length; j++) { const g = DATA.cues[j].goto; if (g !== undefined && DATA.where[g] !== undefined) target = DATA.where[g]; }
    for (let j = 0; j < from; j++) if (DATA.cues[j].restart) lastRestart[DATA.cues[j].restart] = j;
    return { target, lastRestart };
  };
  async function replay(c, j, { target, lastRestart }) {
    const mine = t => DATA.where[t] === target, after = t => lastRestart[t] === undefined || lastRestart[t] <= j;
    if (c.restart && mine(c.restart) && lastRestart[c.restart] === j) await cues.restart(c.restart);
    if (c.drag && mine(c.drag.on) && after(c.drag.on)) await cues.drag(c.drag);
    if (c.click && mine(c.click.summary)) await cues.click(c.click);
    if (c.clear && mine(c.clear.on)) await cues.clear(c.clear);
    if (c.draw && mine(c.draw.on)) await cues.draw(c.draw);
    if (c.formula && mine(c.formula.on)) await cues.formula(c.formula);
    if (c.select && mine(c.select.pseudo || c.select.code)) await cues.select(c.select);
    if (c.set && mine(c.set.on) && after(c.set.on)) await cues.set(c.set);
  }

  /** Play from a cue: the cues before it are done at once, then it plays as it does from the start. */
  async function startAt(i) {
    want = i;   // (where the keys count from, at once: a second press can come before the page has let go of the first)
    if (starting) { pending = i; return; }
    starting = true;
    try {
      if (run) { run.aborted = true; if (run.audio) run.audio.pause(); }
      await lastLoop;   // (the run before has let go of the page)
      reset();
      const r = run = { aborted: false, paused: false, audio: null, fast: false, cue: i, cueStart: performance.now(), pausedMs: 0, pausedAt: 0 };
      playBtn.hidden = true; tl.setState('playing'); tl.setPos(i, 0);
      lastLoop = loop(r, i);
    } finally { starting = false; }
    if (pending !== null) { const p = pending; pending = null; if (p !== i) return startAt(p); }
  }
  const play = () => startAt(at);

  async function loop(r, from) {
    let completed = false;
    try {
      if (from > 0) {
        r.fast = true; cur.hidden = true;
        const p = plan(from); showSlide(p.target);
        for (let j = 0; j < from; j++) { await gate(); await replay(DATA.cues[j], j, p); }
        r.fast = false;
      } else showSlide(plan(0).target);
      for (const f of document.querySelectorAll('.slide.on iframe[data-srcdoc]')) await ready(f);
      for (let i = from; i < DATA.cues.length; i++) {
        await gate();
        const c = DATA.cues[i], t0 = performance.now();
        r.cue = i; r.cueStart = t0; r.pausedMs = 0; if (!r.aborted) want = i;
        setSub(c.say);
        window.__ams.cues[i] = { start: Date.now(), audio: 0 };
        const spoken = speak(DATA.clips[i], i); let done = false; spoken.then(() => { done = true; });
        if (c.goto) await cues.goto(c.goto);
        if (c.restart) await cues.restart(c.restart);
        if (c.drag) await cues.drag(c.drag);
        if (c.click) await cues.click(c.click);
        if (c.clear) await cues.clear(c.clear);
        if (c.draw) await cues.draw(c.draw);
        if (c.formula) await cues.formula(c.formula);
        if (c.select) await cues.select(c.select);
        if (c.set) await cues.set(c.set);
        if (c.point) await cues.point(c.point);
        if (c.key) await cues.key(c.key);
        if (c.wait) await cues.wait(c.wait);
        if (DATA.clips[i]) { while (!done) { await sleep(40); await gate(); } await pause(250); }
        else { const least = Math.max(c.hold || 0, c.say ? 700 + c.say.length * 45 : 0) - (performance.now() - t0); if (least > 0) await pause(least); }
        if (DATA.clips[i] && c.hold) { const left = c.hold - (performance.now() - t0); if (left > 0) await pause(left); }
      }
      if (DATA.fade) { window.__ams.fadeAt = Date.now(); setSub(''); fadeEl.style.transitionDuration = DATA.fade + 'ms'; fadeEl.classList.add('on'); await pause(DATA.fade + 500); }
      window.__ams.endedAt = Date.now();
      completed = true;
    } catch (e) { if (e !== ABORT) console.error(e); }
    finish(r, completed);
  }

  function finish(r, completed) {
    if (run !== r) return;
    if (r.audio) r.audio.pause();
    fadeEl.style.transitionDuration = '0ms'; fadeEl.classList.remove('on');
    run = null; at = want = completed ? 0 : r.cue; setSub(''); press('left', false); cur.hidden = true; playBtn.hidden = false; playBtn.textContent = completed ? '↻ Play again' : '▶ Play';
    tl.setState('stopped'); tl.setPos(completed ? DATA.cues.length : r.cue, 0);
    for (const x of document.querySelectorAll('.pane.flash')) x.classList.remove('flash');
  }
  const stop = () => { if (run) { run.aborted = true; finish(run, false); } };
  const togglePause = () => {
    if (!run) return;
    if (run.paused) { run.pausedMs += performance.now() - run.pausedAt; run.paused = false; if (run.audio && !run.audio.ended) run.audio.play().catch(() => {}); }
    else { run.paused = true; run.pausedAt = performance.now(); if (run.audio) run.audio.pause(); }
    tl.setState(run.paused ? 'paused' : 'playing');
  };

  // MP4: when the page is served by the studio's dev server, it can be rendered there (scripts/render-video.mjs); the button follows the job.
  const mp4 = $('.mp4');
  if (mp4 && /^https?:/.test(location.protocol) && location.pathname.startsWith('/exports/')) {
    fetch('/__render/ping').then(r => r.ok && r.json()).then(j => { if (j && j.ok) mp4.hidden = false; }).catch(() => {});
    mp4.addEventListener('click', async () => {
      if (mp4.classList.contains('busy') || mp4.classList.contains('done')) return;
      mp4.classList.add('busy'); mp4.textContent = 'Rendering…';
      try {
        const start = await (await fetch('/__render/start', { method: 'POST', body: JSON.stringify({ page: location.pathname }) })).json();
        if (!start.id) throw new Error(start.error || 'Could not start.');
        for (;;) {
          await sleep(1500);
          const st = await (await fetch('/__render/status?id=' + start.id)).json();
          if (st.stage === 'error') throw new Error(st.error);
          if (st.stage === 'done') { mp4.classList.remove('busy'); mp4.classList.add('done'); mp4.textContent = '⤓ Save MP4 (' + Math.round(st.bytes / 1e6) + ' MB)'; mp4.href = st.url; mp4.setAttribute('download', st.url.split('/').pop()); return; }
          mp4.textContent = st.stage === 'encode' ? 'Encoding…' : 'Rendering ' + (st.cue || 0) + ' / ' + (st.of || DATA.cues.length);
        }
      } catch (e) { mp4.classList.remove('busy'); mp4.textContent = 'MP4 failed: ' + e.message; setTimeout(() => { mp4.textContent = '⤓ MP4'; }, 6000); }
    });
  }

  playBtn.addEventListener('click', play);
  ccBtn.addEventListener('click', () => { document.body.classList.toggle('nocc'); ccBtn.classList.toggle('on'); });
  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') stop();
    else if (e.key === 'c') ccBtn.click();
    else if (e.key === ' ') { e.preventDefault(); run ? togglePause() : play(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); startAt(Math.min(DATA.cues.length - 1, want + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); startAt(Math.max(0, want - 1)); }
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); if (run && !run.paused) togglePause(); tl.setPos(want, run && run.cue === want ? seconds(run) : 0); tl.addNote(); }
  });
  // for the renderer: where each cue began, and its sound, on the clock the screen is captured on
  window.__ams = { data: DATA, cues: [], fadeAt: 0, endedAt: 0, play: async () => { await startAt(0); await lastLoop; } };
  if (/[?&]autoplay\b/.test(location.search)) play();
}
