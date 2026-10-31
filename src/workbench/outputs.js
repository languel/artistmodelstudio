/**
 * Outputs: a board as a stream, sent somewhere. The board is the source (a drawing, a p5 or three.js sketch, a page: a
 * livecode node); an output is a place its picture goes, live:
 *
 *   pin     a window-like overlay on this screen that stays put while you move around the canvas (drag it by its
 *           bar, resize it from its corner, set its opacity, let clicks through to what is under it)
 *   window  a window of its own that can go on another display or a projector (double-click it for full screen)
 *
 * Both are fed by one loop. A drawing board's picture is composed here (paper, source, marks, effects, mask); a sketch's
 * is piped out of its frame (the frame sends a bitmap of its canvas each frame, see boardFrames.js). A board that has an
 * output keeps running when it is off screen or paused, because the output is what it is for.
 */
import { h } from './ui.js';
import { boardById, MAIN } from '../process/boards.js';

const PIPED = new Set(['p5', 'three', 'html']);   // boards whose picture comes out of a frame
const FPS = 30;

export class Outputs {
  constructor(app) {
    this.app = app;
    this.items = new Map();   // key → { key, board, kind: 'pin' | 'window', canvas, win?, el? }
    this.latest = new Map();  // board id → the newest bitmap piped out of its frame
    this.raf = 0; this.last = 0;
    app.on?.('scene', () => this.closeAll());
  }

  /** Is a board being sent somewhere (so it keeps running)? */
  wants(id) { for (const o of this.items.values()) if (o.board === id) return true; return false; }
  list() { return [...this.items.values()].map(({ key, board, kind }) => ({ key, board, kind })); }

  // ---- the picture of a board -------------------------------------------------------------------------------------
  /** The board's picture now, as something drawImage takes, or null (a page of text has none). */
  picture(id, width) {
    const app = this.app, doc = app.store.doc, b = boardById(doc, id);
    if (!b) return null;
    if (PIPED.has(b.kind)) return this.latest.get(id) || null;
    if (b.kind && b.kind !== 'drawing') return null;
    const composer = app.composer;
    if (!composer) return null;
    const scale = Math.min(2048, Math.max(64, width)) / Math.max(1, b.width);
    const now = performance.now();
    composer.begin(doc, now);
    return composer.compose(b, { doc, scale, now, mode: 'picture', chain: [] });
  }

  // ---- starting and stopping ---------------------------------------------------------------------------------------
  pin(id) {
    const b = boardById(this.app.store.doc, id);
    if (!b) return null;
    const key = `pin:${id}`;
    if (this.items.has(key)) { this.close(key); return null; }   // (pinning a pinned board unpins it)
    const canvas = h('canvas', { class: 'wb-pin-canvas' });
    const opacity = h('input', { type: 'range', class: 'wb-pin-opacity', min: 20, max: 100, step: 1, value: 100, title: 'Opacity' });
    const ghost = h('button', { class: 'wb-pin-btn', title: 'Let clicks through to the canvas under it', html: '◌' });
    const out = h('button', { class: 'wb-pin-btn', title: 'Also open in a window (another display, a projector)', html: '⧉', onclick: () => this.openWindow(id) });
    const x = h('button', { class: 'wb-pin-btn', title: 'Unpin', html: '×', onclick: () => this.close(key) });
    const bar = h('div', { class: 'wb-pin-bar' }, h('span', { class: 'wb-pin-title' }, b.title || 'Board'), opacity, ghost, out, x);
    const el = h('div', { class: 'wb-pin' }, bar, canvas);
    const w = 320, hgt = Math.round(w * b.height / b.width) + 26, n = this.items.size;
    Object.assign(el.style, { width: `${w}px`, height: `${hgt}px`, right: `${16 + n * 24}px`, bottom: `${16 + n * 24}px` });
    document.body.append(el);
    opacity.addEventListener('input', () => { el.style.opacity = String(opacity.value / 100); });
    ghost.addEventListener('click', () => { const on = el.classList.toggle('through'); ghost.classList.toggle('on', on); });
    this.drag(el, bar);
    const o = { key, board: id, kind: 'pin', canvas, el };
    this.items.set(key, o);
    this.startPipe(id);
    this.app.canvas?.invalidate?.();
    this.loop();
    return o;
  }

  /**
   * A window of its own for a board. Click it for full screen on whatever display it is on (then nothing of the browser
   * shows: no title bar, no address bar; F or Esc leaves). A browser always draws a pop-up's bar until then.
   * borderless: a Document Picture-in-Picture window (Chrome) instead: no address bar, always on top, any size you drag.
   */
  async openWindow(id, { borderless = false } = {}) {
    const b = boardById(this.app.store.doc, id);
    if (!b) return null;
    const key = `window:${id}`;
    const have = this.items.get(key);
    if (have?.win && !have.win.closed) { have.win.focus?.(); return have; }
    let win = null;
    if (borderless && window.documentPictureInPicture) {
      try { const w = 640; win = await window.documentPictureInPicture.requestWindow({ width: w, height: Math.round(w * b.height / b.width) }); } catch { win = null; }
    }
    if (!win) {
      // On another display when the browser will say where it is (the Window Management API asks permission once).
      let place = '';
      try {
        const d = await window.getScreenDetails?.();
        const s = d?.screens.find(x => !x.isPrimary && x !== d.currentScreen) || null;
        if (s) place = `,left=${s.availLeft},top=${s.availTop},width=${s.availWidth},height=${s.availHeight}`;
      } catch { /* not allowed or not there: wherever the browser puts it */ }
      win = window.open('', `ams-output-${id}`, `popup=yes${place || `,width=${Math.min(1280, b.width)},height=${Math.min(800, b.height)}`}`);
      if (!win) { this.app.log?.('The output window was blocked: allow pop-ups for this page.', 'error'); return null; }
      try { win.history.replaceState(null, '', `${location.pathname.replace(/[^/]*$/, '')}output`); } catch { /* it stays about:blank */ }   // (so the bar reads the studio's address, not about:blank)
    }
    win.document.title = `${b.title || 'Board'} · output`;
    win.document.body.style.cssText = 'margin:0;height:100vh;background:#000;overflow:hidden;cursor:default';
    const canvas = win.document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    win.document.body.append(canvas);
    const full = () => { if (win.document.fullscreenElement) win.document.exitFullscreen?.(); else canvas.requestFullscreen?.().catch(() => {}); };
    canvas.addEventListener('click', () => { if (!win.document.fullscreenElement) full(); });
    win.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') full(); });
    win.addEventListener('mousemove', () => { win.document.body.style.cursor = 'default'; clearTimeout(win.__hide); win.__hide = setTimeout(() => { win.document.body.style.cursor = 'none'; }, 1500); });
    win.addEventListener('pagehide', () => this.close(key));
    const o = { key, board: id, kind: 'window', canvas, win };
    this.items.set(key, o);
    this.startPipe(id);
    this.loop();
    return o;
  }

  close(key) {
    const o = this.items.get(key);
    if (!o) return;
    o.el?.remove();
    if (o.win && !o.win.closed) o.win.close();
    this.items.delete(key);
    if (!this.wants(o.board)) { this.app.frames?.unpipe(o.board); this.latest.get(o.board)?.close?.(); this.latest.delete(o.board); }
    this.app.canvas?.invalidate?.();
  }
  closeAll() { for (const key of [...this.items.keys()]) this.close(key); }

  startPipe(id) {
    const b = boardById(this.app.store.doc, id);
    if (!b || !PIPED.has(b.kind)) return;
    this.app.frames?.pipe(id, bitmap => { const old = this.latest.get(id); this.latest.set(id, bitmap); old?.close?.(); });
    this.app.canvas?.invalidate?.();
  }

  // ---- the loop ----------------------------------------------------------------------------------------------------
  loop() {
    if (this.raf || !this.items.size) return;
    const tick = t => {
      this.raf = 0;
      if (!this.items.size) return;
      this.raf = requestAnimationFrame(tick);
      if (t - this.last < 1000 / FPS) return;
      this.last = t;
      for (const o of [...this.items.values()]) {
        if (o.win?.closed || (o.el && !o.el.isConnected)) { this.close(o.key); continue; }
        if (!boardById(this.app.store.doc, o.board)) { this.close(o.key); continue; }
        this.paint(o);
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  paint(o) {
    const c = o.canvas, win = o.win || window, dpr = win.devicePixelRatio || 1;
    const W = Math.max(2, Math.round(c.clientWidth * dpr)), H = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = o.kind === 'window' ? '#000' : 'transparent';
    g.clearRect(0, 0, W, H);
    if (o.kind === 'window') g.fillRect(0, 0, W, H);
    let pic = null;
    try { pic = this.picture(o.board, W); } catch (err) { pic = null; }
    if (!pic) { g.fillStyle = 'rgba(160,160,160,.8)'; g.font = `${12 * dpr}px system-ui`; g.textAlign = 'center'; g.fillText('no picture yet', W / 2, H / 2); return; }
    const pw = pic.width, ph = pic.height, k = Math.min(W / pw, H / ph), dw = pw * k, dh = ph * k;
    g.drawImage(pic, (W - dw) / 2, (H - dh) / 2, dw, dh);
    // A window not yet full screen says how (a hint that is gone once it is).
    if (o.kind === 'window' && !o.win.document.fullscreenElement && performance.now() - (o.t0 ||= performance.now()) < 8000) { g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `${13 * dpr}px system-ui`; g.textAlign = 'center'; g.fillText('click for full screen · F toggles', W / 2, H - 18 * dpr); }
  }

  /** Drag an element by a handle (kept inside the screen). */
  drag(el, handle) {
    handle.addEventListener('pointerdown', e => {
      if (e.target.closest('button, input')) return;
      const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const move = ev => { el.style.left = `${Math.max(0, Math.min(innerWidth - 60, ev.clientX - ox))}px`; el.style.top = `${Math.max(0, Math.min(innerHeight - 30, ev.clientY - oy))}px`; el.style.right = 'auto'; el.style.bottom = 'auto'; };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
  }
}
