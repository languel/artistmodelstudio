// The player inside an exported page (see playerPage.js). This file is embedded as text (`?raw`), not run by the studio: it is one function,
// it uses nothing outside itself, and nothing here is changed by the build.
function playerRuntime(DATA) {
  const $ = (s, r = document) => r.querySelector(s);
  const stage = $('.stage'), cur = $('.cur'), halo = $('.halo'), mouse = $('.mouse'), sub = $('.sub'), keys = $('.keys');
  const playBtn = $('.play'), ctl = $('.ctl'), pauseBtn = $('.pause'), ccBtn = $('.cc');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const ABORT = Symbol('stop');
  let run = null, pos = { x: innerWidth / 2, y: innerHeight - 90 };

  const fit = () => { const k = Math.min(innerWidth / DATA.W, innerHeight / DATA.H) * 0.97; stage.style.setProperty('--k', k); };
  addEventListener('resize', fit); fit();

  const place = (x, y) => { pos = { x, y }; cur.style.transform = `translate(${x - 3}px,${y - 2}px)`; mouse.style.transform = `translate(${x + 18}px,${y + 12}px)`; };
  const press = (btn, on) => { mouse.classList.toggle('on', on); mouse.classList.toggle('left', on && btn === 'left'); };
  const click = async () => { halo.style.setProperty('--t', `translate(${pos.x - 14}px,${pos.y - 14}px)`); halo.style.transform = `translate(${pos.x - 14}px,${pos.y - 14}px)`; halo.classList.remove('on'); void halo.offsetWidth; halo.classList.add('on'); await sleep(260); };
  const check = () => { if (!run || run.aborted) throw ABORT; };
  const gate = async () => { while (run && run.paused && !run.aborted) await sleep(80); check(); };
  const pause = async ms => { await gate(); await sleep(ms); check(); };
  const board = t => document.querySelector(`[data-board="${CSS.escape(t)}"]`);

  const glide = async (x, y, ms) => {
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
  const textNodes = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = []; for (let n; (n = w.nextNode());) if (n.nodeValue.length && !(n.parentElement && n.parentElement.tagName === 'I')) out.push(n); return out; };
  const selectNodes = async (nodes, onLine) => {
    const total = nodes.reduce((a, n) => a + n.nodeValue.length, 0), sel = getSelection();
    const caret = k => { let left = Math.round(k * total); for (const n of nodes) { if (left <= n.nodeValue.length) return [n, left]; left -= n.nodeValue.length; } const l = nodes[nodes.length - 1]; return [l, l.nodeValue.length]; };
    const rect = k => { const [n, o] = caret(k), r = document.createRange(); r.setStart(n, Math.max(0, o - (o > 0 ? 1 : 0))); r.setEnd(n, Math.max(o, 1)); const b = r.getBoundingClientRect(); return [k === 0 ? b.left : b.right, b.top + b.height / 2, n]; };
    const [sx, sy] = rect(0), [ex, ey] = rect(1);
    await glide(sx, sy); await down();
    const ms = Math.min(2600, 500 + total * 24), t0 = performance.now();
    const set = k => { const [a, ao] = caret(0), [b, bo] = caret(k); sel.setBaseAndExtent(a, ao, b, bo); onLine && onLine(b); };
    await new Promise(res => { const step = now => { if (!run || run.aborted) return res(); const t = Math.min(1, (now - t0) / ms), k = ease(t); set(k); const [x, y] = rect(k); place(x, y || sy); t < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
    set(1); place(ex, ey); press('left', false); check();
  };

  const cues = {
    async goto(t) { const el = board(t) || document.querySelector('.stage'); if (el && el.classList.contains('pane')) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); } await pause(500); },
    async restart(t) { const f = $('iframe', board(t)); if (!f) return; await new Promise(r => { f.addEventListener('load', r, { once: true }); f.srcdoc = f.srcdoc; }); await pause(900); },
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
    async key(k) { showKeys(k); await pause(500); },
    async wait(ms) { await pause(ms); }
  };

  const speak = (uri) => new Promise(res => {
    if (!uri) return res(0);
    const a = new Audio(uri); run.audio = a;
    a.onended = () => res(1); a.onerror = () => res(0);
    a.play().catch(() => res(0));
  });

  const setSub = t => { sub.textContent = t || ''; sub.classList.toggle('on', Boolean(t)); };

  async function play() {
    if (run) return;
    run = { aborted: false, paused: false, audio: null };
    playBtn.hidden = true; ctl.hidden = false; pauseBtn.textContent = 'Pause';
    // the slide starts as the script found it
    for (const f of document.querySelectorAll('.pane iframe')) { await new Promise(r => { f.addEventListener('load', r, { once: true }); f.srcdoc = f.srcdoc; }); }
    try {
      for (let i = 0; i < DATA.cues.length; i++) {
        await gate();
        const c = DATA.cues[i], t0 = performance.now();
        setSub(c.say);
        const spoken = speak(DATA.clips[i]); let done = false; spoken.then(() => { done = true; });
        if (c.goto) await cues.goto(c.goto);
        if (c.restart) await cues.restart(c.restart);
        if (c.drag) await cues.drag(c.drag);
        if (c.click) await cues.click(c.click);
        if (c.select) await cues.select(c.select);
        if (c.key) await cues.key(c.key);
        if (c.wait) await cues.wait(c.wait);
        if (DATA.clips[i]) { while (!done) { await sleep(40); check(); } await pause(250); }
        else { const least = Math.max(c.hold || 0, c.say ? 700 + c.say.length * 45 : 0) - (performance.now() - t0); if (least > 0) await pause(least); }
        if (DATA.clips[i] && c.hold) { const left = c.hold - (performance.now() - t0); if (left > 0) await pause(left); }
      }
    } catch (e) { if (e !== ABORT) console.error(e); }
    finish();
  }

  function finish() {
    if (run && run.audio) run.audio.pause();
    run = null; setSub(''); press('left', false); cur.hidden = true; ctl.hidden = true; playBtn.hidden = false; playBtn.textContent = '↻ Play again';
    for (const x of document.querySelectorAll('.pane.flash')) x.classList.remove('flash');
  }
  const stop = () => { if (run) { run.aborted = true; finish(); } };
  const togglePause = () => { if (!run) return; run.paused = !run.paused; pauseBtn.textContent = run.paused ? 'Go on' : 'Pause'; };

  playBtn.addEventListener('click', play);
  $('.stop').addEventListener('click', stop);
  pauseBtn.addEventListener('click', togglePause);
  ccBtn.addEventListener('click', () => { document.body.classList.toggle('nocc'); ccBtn.classList.toggle('on'); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') stop();
    else if (e.key === 'c' && !e.metaKey && !e.ctrlKey) ccBtn.click();
    else if (e.key === ' ' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); run ? togglePause() : play(); }
  });
  if (/[?&]autoplay\b/.test(location.search)) play();
}
