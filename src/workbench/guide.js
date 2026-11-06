/**
 * Guide: visible automation (after underscores' walkthrough layer).
 *
 * When an agent (or a replayed session) acts, a virtual cursor travels to the
 * control it uses, a halo marks the click, strokes are traced on the canvas as they
 * are made, and a narration card says what is happening and why.
 *
 * Targets are semantic names, never CSS selectors from outside:
 *   tool:<id>  panel:<id>  button:<id>  view:picture|process  stage:<id>  title  menu
 * Elements opt in with data-guide="<name>".
 *
 * Pace: 0 = instant (no animation), 1 = normal, 2 = slow. Reduced motion → instant.
 */
import { h } from './ui.js';

const PACE_KEY = 'ams_guide_pace';
// The pointer is the arrowhead of the direct-select tool (icons.js), as an outline, with a soft glow (the CSS).
/** The pointer's shapes: the SVG inside a 24-unit box, and where in it the point is (the arrow's tip; the middle of the others). The look is set in CSS (outline or filled, in the pointer color). */
export const POINTER_SHAPES = {
  arrow: { label: 'Arrow', hot: [5, 3], svg: '<path d="M5 3l14 8-6 1.5L10 19z" stroke-linejoin="round"/>' },
  ring: { label: 'Ring', hot: [12, 12], svg: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/>' },
  cross: { label: 'Crosshair', hot: [12, 12], svg: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke-linecap="round"/><circle cx="12" cy="12" r="1.5"/>' },
  dot: { label: 'Dot', hot: [12, 12], svg: '<circle cx="12" cy="12" r="5"/>' }
};
const pointerSvg = shape => `<svg viewBox="0 0 24 24" width="24" height="24">${(POINTER_SHAPES[shape] || POINTER_SHAPES.arrow).svg}</svg>`;

export class Guide {
  constructor(app) {
    this.app = app;
    this.enabled = true;
    try { this.pace = Number(localStorage.getItem(PACE_KEY) ?? 1); } catch { this.pace = 1; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.pace = 0;
    this.cursor = h('div', { class: 'wb-guide-cursor', html: pointerSvg('arrow') });
    this.hot = POINTER_SHAPES.arrow.hot;
    this.halo = h('div', { class: 'wb-guide-halo' });
    this.text = h('div', { class: 'wb-guide-text' });
    this.meta = h('div', { class: 'wb-guide-meta' });
    this.card = h('div', { class: 'wb-guide-card', hidden: true },
      h('div', { class: 'wb-guide-head' }, h('span', { class: 'wb-guide-dot' }), this.meta,
        this.paceSel = h('select', { class: 'wb-guide-pace', title: 'Pace' }, ...[['0', 'Instant'], ['0.5', 'Fast'], ['1', 'Normal'], ['2', 'Slow']].map(([v, l]) => h('option', { value: v, selected: Number(v) === this.pace }, l))),
        h('button', { class: 'wb-icon-btn', title: 'Hide until the next action', onclick: () => { this.card.hidden = true; } }, '×')),
      this.text,
      this.controls = h('div', { class: 'wb-guide-controls', hidden: true }));
    this.paceSel.addEventListener('change', () => { this.pace = Number(this.paceSel.value); try { localStorage.setItem(PACE_KEY, String(this.pace)); } catch { /* ignore */ } });
    this.layer = h('div', { class: 'wb-guide-layer' }, this.halo, this.cursor);
    this.applyLook();
    document.body.append(this.layer, this.card);
    this.pos = { x: window.innerWidth / 2, y: window.innerHeight - 80 };
    this.place(this.pos.x, this.pos.y);
    this.cursor.style.opacity = '0';
    this.dragCard();
    this.hideTimer = 0;
  }

  /**
   * How the pointer looks (Settings › Guide): an outline in the accent color or filled, how much it glows (0 to 1), and whether the glow pulses.
   * Global, remembered in this browser.
   */
  applyLook() {
    const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
    const style = get('ams_guide_style', 'outline'), glow = Math.max(0, Math.min(1, Number(get('ams_guide_glow', '0.7')))), pulse = get('ams_guide_pulse', '0') === '1';
    const shape = POINTER_SHAPES[get('ams_guide_shape', 'arrow')] ? get('ams_guide_shape', 'arrow') : 'arrow', color = get('ams_guide_color', '');
    if (this.cursor.dataset.shape !== shape) { this.cursor.dataset.shape = shape; this.cursor.innerHTML = pointerSvg(shape); this.hot = POINTER_SHAPES[shape].hot; if (this.pos) this.place(this.pos.x, this.pos.y); }
    // the pointer's color: the accent color unless one was chosen (Settings › Guide)
    for (const el of [this.cursor, this.halo]) { if (color) el.style.setProperty('--gc', color); else el.style.removeProperty('--gc'); }
    this.cursor.dataset.style = style;
    this.cursor.classList.toggle('pulse', pulse && glow > 0);
    this.cursor.style.setProperty('--glow', String(glow));
  }

  get active() { return this.enabled && this.pace > 0; }
  wait(ms) { return new Promise(r => setTimeout(r, ms * this.pace)); }

  place(x, y) { this.pos = { x, y }; this.cursor.style.transform = `translate(${x - this.hot[0]}px, ${y - this.hot[1]}px)`; }

  /** Resolve a semantic target to a screen rect. */
  rect(target) {
    if (!target) return null;
    if (target.x !== undefined && target.y !== undefined) return { left: target.x, top: target.y, width: 0, height: 0 };
    const [kind, id] = String(target).split(':');
    let el = document.querySelector(`[data-guide="${CSS.escape(String(target))}"]`);
    if (!el && kind === 'view') el = document.querySelector('[data-guide="menu"]');   // the view controls live in the menu
    if (!el && kind === 'panel') {
      this.app.docks.open(id);
      const real = this.app.docks.aliases?.[id]?.[0] || id;
      el = document.querySelector(`[data-guide="tab:${CSS.escape(real)}"]`) || document.querySelector(`[data-panel="${CSS.escape(real)}"]`);
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width || r.height ? r : null;
  }

  async moveTo(target, { click = true } = {}) {
    if (!this.active) return;
    const r = this.rect(target);
    if (!r) return;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    this.cursor.style.opacity = '1';
    const x0 = this.pos.x, y0 = this.pos.y;
    const dist = Math.hypot(x - x0, y - y0);
    const ms = Math.min(900, 250 + dist * 0.6) * this.pace;
    const t0 = performance.now();
    await new Promise(res => {
      const step = now => {
        const t = Math.min(1, (now - t0) / Math.max(1, ms));
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        this.place(x0 + (x - x0) * e, y0 + (y - y0) * e);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    if (click) await this.click();
  }

  /**
   * A recorded interaction, shown: for a control, the cursor travels to it and clicks; for a drag, from where it began to where it ended; a key or a scroll
   * is only said. Nothing is redone (the drawing is the History track's). Quiet when the pace is Instant.
   */
  /** Where the pointer was `frac` (0 to 1) of the way through a recorded interaction, in window coordinates (null if it cannot be told). */
  pointAt(ui, frac = 0) {
    if (ui.where === 'Timeline') return null;
    const cv = this.app.canvas, r = cv.canvas.getBoundingClientRect();
    if (ui.drag && ui.path?.length > 1) {
      const total = ui.path.at(-1)[2] || 1, ms = Math.max(0, Math.min(1, frac)) * total, path = ui.path;
      let i = 0; while (i < path.length - 2 && path[i + 1][2] <= ms) i++;
      const a = path[i], b = path[Math.min(i + 1, path.length - 1)], k = Math.max(0, Math.min(1, (ms - a[2]) / ((b[2] - a[2]) || 1)));
      const at = ([x, y]) => (ui.pathSpace === 'world' ? [r.left + x * cv.cam.z + cv.cam.x, r.top + y * cv.cam.z + cv.cam.y] : [x, y]);
      const [ax, ay] = at(a), [bx, by] = at(b);
      return [ax + (bx - ax) * k, ay + (by - ay) * k];
    }
    if (ui.target) { const rc = this.rect(ui.target); if (rc) return [rc.left + rc.width / 2, rc.top + rc.height / 2]; }
    return ui.from ? [...ui.from] : null;
  }

  /** What a recorded interaction inside the colour picker needs: the picker open where it was (it closes again at the next interaction outside it). */
  popupFor(ui) {
    if (ui?.popup === 'paint') {
      if (!this._popup && !document.querySelector('.wb-cp-pop')) this._popup = this.app.openPaintPicker?.(ui.popupAt?.[0] ?? 200, ui.popupAt?.[1] ?? 200) || null;
    } else if (this._popup) { try { this._popup.close?.(); } catch { /* already closed */ } this._popup = null; }
  }

  async cue(ui, label = '', { rate = 1 } = {}) {
    if (!this.active || !ui) return;
    if (ui.where === 'Timeline') return;   // (clicks on the Timeline itself, recorded before they were left out: replaying them would send the pointer and its halo flying down to the Timeline)
    this.popupFor(ui);
    this.say(label, 'Interaction', { sticky: false });
    if (ui.kind === 'key' || (!ui.target && !ui.from)) return;
    if (ui.drag && ui.path?.length > 1) { await this.follow(ui.path, ui.pathSpace, rate); return; }
    if (ui.target && this.rect(ui.target)) { await this.moveTo(ui.target); return; }
    const [x0, y0] = ui.from || [], [x1, y1] = ui.to || ui.from || [];
    if (x0 == null) return;
    await this.moveTo({ x: x0, y: y0 }, { click: false });
    if (ui.drag) await this.moveTo({ x: x1, y: y1 }, { click: false }); else await this.click();
  }

  /**
   * Follow a recorded path, at the pace it was drawn (and the playback rate): the cursor goes where the pen went, so it traces the stroke as the stroke appears.
   * path is [[x, y, ms], …]; space 'world' is the drawing's own coordinates (they follow the view), 'screen' is the window's.
   */
  async follow(path, space = 'screen', rate = 1) {
    const cv = this.app.canvas, r = cv.canvas.getBoundingClientRect();
    const toS = ([x, y]) => (space === 'world' ? [r.left + x * cv.cam.z + cv.cam.x, r.top + y * cv.cam.z + cv.cam.y] : [x, y]);
    const [x0, y0] = toS(path[0]);
    this.cursor.style.opacity = '1';
    // a quick glide to where it starts (the drawing has begun already), then the path in its own time
    const g0 = this.pos, gt0 = performance.now();
    await new Promise(res => { const step = now => { const k = Math.min(1, (now - gt0) / 110); this.place(g0.x + (x0 - g0.x) * k, g0.y + (y0 - g0.y) * k); if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    this.following = true;
    const total = path.at(-1)[2] || 1, t0 = performance.now();
    await new Promise(res => {
      let i = 0;
      const step = now => {
        const el = Math.min(total, (now - t0) * rate);
        while (i < path.length - 2 && path[i + 1][2] <= el) i++;
        const a = path[i], b = path[Math.min(i + 1, path.length - 1)], span = (b[2] - a[2]) || 1, k = Math.max(0, Math.min(1, (el - a[2]) / span));
        const [ax, ay] = toS(a), [bx, by] = toS(b);
        this.place(ax + (bx - ax) * k, ay + (by - ay) * k);
        if (el < total) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    this.following = false;
  }

  async click() {
    if (!this.active) return;
    this.halo.style.transform = `translate(${this.pos.x - 14}px, ${this.pos.y - 14}px)`;
    this.halo.classList.remove('on'); void this.halo.offsetWidth; this.halo.classList.add('on');
    await this.wait(260);
  }

  /** Trace artboard points on screen with the cursor (the stroke appears along it). */
  async trace(points, onProgress) {
    const cv = this.app.canvas;
    if (!this.active || !points?.length) { onProgress?.(points.length); return; }
    const r = cv.canvas.getBoundingClientRect();
    const toS = ([x, y]) => [r.left + x * cv.cam.z + cv.cam.x, r.top + y * cv.cam.z + cv.cam.y];
    await this.moveTo({ x: toS(points[0])[0], y: toS(points[0])[1] }, { click: false });
    const total = Math.min(1600, 300 + points.length * 12) * this.pace;
    const t0 = performance.now();
    await new Promise(res => {
      const step = now => {
        const t = Math.min(1, (now - t0) / Math.max(1, total));
        const n = Math.max(1, Math.round(t * points.length));
        const [x, y] = toS(points[n - 1]);
        this.place(x, y);
        onProgress?.(n);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  say(text, meta = 'Agent', { sticky = this.sticky } = {}) {
    if (text) this.app.emit('say', text, this.label || meta);   // the recorder keeps narration even when the guide is hidden
    if (!this.enabled || !text) return;
    this.text.textContent = text;
    this.meta.textContent = this.label || meta;
    this.card.hidden = false;
    clearTimeout(this.hideTimer);
    if (!sticky) this.hideTimer = setTimeout(() => { this.card.hidden = true; this.cursor.style.opacity = '0'; }, 9000);
  }

  /** Walkthroughs put their controls (back, pause, next, stop) on the card and keep it open. */
  setControls(nodes) {
    this.sticky = Boolean(nodes);
    this.controls.hidden = !nodes;
    this.controls.replaceChildren(...(nodes || []));
    if (!nodes) { clearTimeout(this.hideTimer); this.hideTimer = setTimeout(() => { this.card.hidden = true; this.cursor.style.opacity = '0'; }, 4000); }
  }

  dragCard() {
    const head = this.card.firstChild;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('select, button')) return;
      const r = this.card.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      const mv = ev => { Object.assign(this.card.style, { left: `${ev.clientX - sx}px`, top: `${ev.clientY - sy}px`, bottom: 'auto', transform: 'none' }); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }
}
