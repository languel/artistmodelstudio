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
const ARROW = '<svg viewBox="0 0 28 34" width="22" height="27"><path d="M2 2v25l7-7 5 12 5-2-5-12h10L2 2z" fill="var(--wb-guide-fill)" stroke="var(--wb-guide-stroke)" stroke-width="1.6" stroke-linejoin="round"/></svg>';

export class Guide {
  constructor(app) {
    this.app = app;
    this.enabled = true;
    try { this.pace = Number(localStorage.getItem(PACE_KEY) ?? 1); } catch { this.pace = 1; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.pace = 0;
    this.cursor = h('div', { class: 'wb-guide-cursor', html: ARROW });
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
    document.body.append(this.layer, this.card);
    this.pos = { x: window.innerWidth / 2, y: window.innerHeight - 80 };
    this.place(this.pos.x, this.pos.y);
    this.cursor.style.opacity = '0';
    this.dragCard();
    this.hideTimer = 0;
  }

  get active() { return this.enabled && this.pace > 0; }
  wait(ms) { return new Promise(r => setTimeout(r, ms * this.pace)); }

  place(x, y) { this.pos = { x, y }; this.cursor.style.transform = `translate(${x - 3}px, ${y - 2}px)`; }

  /** Resolve a semantic target to a screen rect. */
  rect(target) {
    if (!target) return null;
    if (target.x !== undefined && target.y !== undefined) return { left: target.x, top: target.y, width: 0, height: 0 };
    const [kind, id] = String(target).split(':');
    let el = document.querySelector(`[data-guide="${CSS.escape(String(target))}"]`);
    if (!el && kind === 'view') el = document.querySelector('[data-guide="view"]');
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
