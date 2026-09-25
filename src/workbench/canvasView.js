/**
 * The workbench canvas: an infinite surface with the artboard at its origin.
 *
 * World units are artboard units. Screen = world × zoom + offset (CSS px; the
 * backing store is scaled for devicePixelRatio).
 *
 * Tools: select (V), hand (H or hold Space), line (P), gesture (E), plane (A),
 * guide (G), point (O), note (T). Freehand tools capture time and pressure
 * (mouse pressure is estimated from speed). Wheel pans; Ctrl/Cmd+wheel or pinch zooms.
 */
import { renderDocument } from '../process/render.js';
import { normalizeElement, DEFAULT_REALIZE } from '../process/document.js';
import { BRUSHES, resolveParams } from '../process/brushes.js';

const CAMERA_KEY = 'ams_workbench_camera_v1';
export const TOOL_KEYS = { v: 'select', h: 'hand', p: 'line', e: 'gesture', a: 'plane', g: 'guide', o: 'point', t: 'note' };

export class CanvasView {
  constructor(host, store, { getTool, getStage, getDefaults, onSelect, onTool, viewMode }) {
    this.host = host;
    this.store = store;
    this.getTool = getTool;
    this.getStage = getStage;
    this.getDefaults = getDefaults;
    this.onSelect = onSelect;
    this.onTool = onTool;
    this.viewMode = viewMode;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wb-canvas';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.selected = new Set();
    this.hovered = null;
    this.draft = null;      // element being drawn
    this.marquee = null;
    this.upTo = Infinity;   // stage scrub
    this.space = false;
    try { this.cam = JSON.parse(localStorage.getItem(CAMERA_KEY)) || null; } catch { this.cam = null; }
    this.resize();
    if (!this.cam) { this.cam = { x: 0, y: 0, z: 1 }; this.fit(); try { localStorage.removeItem(CAMERA_KEY); } catch { /* ignore */ } }
    new ResizeObserver(() => this.resize()).observe(host);
    store.subscribe(() => { this.pruneSelection(); this.invalidate(); });
    this.bind();
  }

  // ---- geometry ------------------------------------------------------------------
  toWorld(sx, sy) { return [(sx - this.cam.x) / this.cam.z, (sy - this.cam.y) / this.cam.z]; }
  toScreen(wx, wy) { return [wx * this.cam.z + this.cam.x, wy * this.cam.z + this.cam.y]; }
  local(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.dpr = dpr;
    this.invalidate();
  }

  fit(pad = 60) {
    const { width, height } = this.store.doc.artboard;
    const z = Math.min((this.w - pad * 2) / width, (this.h - pad * 2) / height);
    this.cam = { z, x: (this.w - width * z) / 2, y: (this.h - height * z) / 2 };
    this.saveCam();
    this.invalidate();
  }

  zoomAt(sx, sy, factor) {
    const z = Math.min(40, Math.max(0.05, this.cam.z * factor));
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam = { z, x: sx - wx * z, y: sy - wy * z };
    this.saveCam();
    this.invalidate();
  }

  saveCam() {
    try { localStorage.setItem(CAMERA_KEY, JSON.stringify(this.cam)); } catch { /* ignore */ }
    this.onCamera?.();
  }

  // ---- drawing ---------------------------------------------------------------------
  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  draw() {
    const { ctx } = this;
    const css = getComputedStyle(document.documentElement);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = css.getPropertyValue('--wb-canvas').trim() || '#1b1c1f';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid(css.getPropertyValue('--wb-grid').trim() || 'rgba(255,255,255,0.08)');
    const doc = this.store.doc;
    const [ax, ay] = this.toScreen(0, 0);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = doc.artboard.ground;
    ctx.fillRect(ax, ay, doc.artboard.width * this.cam.z, doc.artboard.height * this.cam.z);
    ctx.restore();
    if (this.drawReference) {
      ctx.save();
      ctx.translate(this.cam.x, this.cam.y);
      ctx.scale(this.cam.z, this.cam.z);
      this.drawReference(ctx);
      ctx.restore();
    }
    renderDocument(ctx, doc, {
      mode: this.viewMode(), upTo: this.upTo, transform: { x: this.cam.x, y: this.cam.y, scale: this.cam.z },
      selected: this.selected, hovered: this.hovered, ground: false, screenNotes: true,
      selectColor: css.getPropertyValue('--wb-select').trim() || '#8a8a8a'
    });
    if (this.drawOverlay) {
      ctx.save(); ctx.translate(this.cam.x, this.cam.y); ctx.scale(this.cam.z, this.cam.z);
      this.drawOverlay(ctx);
      ctx.restore();
    }
    if (this.draft) {
      renderDocument(ctx, { ...doc, stages: [{ id: 'draft', visible: true }], elements: [this.draft] }, {
        mode: 'process', transform: { x: this.cam.x, y: this.cam.y, scale: this.cam.z }, ground: false
      });
    }
    this.drawFrame(ctx, css.getPropertyValue('--wb-select').trim() || '#8a8a8a');
    if (this.marquee) {
      const [x0, y0] = this.toScreen(this.marquee.x0, this.marquee.y0), [x1, y1] = this.toScreen(this.marquee.x1, this.marquee.y1);
      ctx.save();
      ctx.strokeStyle = css.getPropertyValue('--wb-select').trim(); ctx.fillStyle = css.getPropertyValue('--wb-on').trim();
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    }
  }

  drawGrid(color) {
    const step = 20 * this.cam.z;
    if (step < 6) return;
    const { ctx } = this;
    ctx.fillStyle = color;
    const ox = ((this.cam.x % step) + step) % step, oy = ((this.cam.y % step) + step) % step;
    const r = Math.min(1.2, step / 20);
    for (let x = ox; x < this.w; x += step) for (let y = oy; y < this.h; y += step) ctx.fillRect(x - r / 2, y - r / 2, r, r);
  }

  // ---- selection -------------------------------------------------------------------
  select(ids, additive = false) {
    if (!additive) this.selected.clear();
    for (const id of ids) this.selected.add(id);
    this.onSelect?.([...this.selected]);
    this.invalidate();
  }

  pruneSelection() {
    const ids = new Set(this.store.doc.elements.map(e => e.id));
    let changed = false;
    for (const id of this.selected) if (!ids.has(id)) { this.selected.delete(id); changed = true; }
    if (changed) this.onSelect?.([...this.selected]);
  }

  editable(e) {
    if (e.hidden || e.locked) return false;
    const s = this.store.doc.stages.find(x => x.id === e.stage);
    return s && s.visible && !s.locked;
  }

  // ---- transform frame ---------------------------------------------------------------
  /** World bounds of the selection (points and notes padded so small marks get a usable frame). */
  selectionBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of this.store.doc.elements) {
      if (!this.selected.has(e.id)) continue;
      for (const [x, y] of e.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (!Number.isFinite(x0)) return null;
    return { x0, y0, x1, y1 };
  }

  /** Screen-space frame around the selection, with a minimum size so handles stay apart. */
  frame() {
    const b = this.selectionBounds();
    if (!b) return null;
    let [l, t] = this.toScreen(b.x0, b.y0), [r, btm] = this.toScreen(b.x1, b.y1);
    const pad = 8;
    l -= pad; t -= pad; r += pad; btm += pad;
    if (r - l < 24) { const c = (l + r) / 2; l = c - 12; r = c + 12; }
    if (btm - t < 24) { const c = (t + btm) / 2; t = c - 12; btm = c + 12; }
    return { l, t, r, b: btm, world: b };
  }

  /**
   * What the pointer is over: a corner (scale both axes), a side (scale one), just inside a
   * corner (rotate), or nothing. hx / hy: -1 left/top, 1 right/bottom, 0 not on that axis.
   */
  handleAt(sx, sy) {
    if (this.getTool() !== 'select' || !this.selected.size) return null;
    const f = this.frame();
    if (!f) return null;
    const near = 7, ring = 22;
    for (const hx of [-1, 1]) for (const hy of [-1, 1]) {
      const cx = hx < 0 ? f.l : f.r, cy = hy < 0 ? f.t : f.b;
      const dx = (sx - cx) * -hx, dy = (sy - cy) * -hy;   // positive = inside the frame
      if (Math.abs(dx) <= near && Math.abs(dy) <= near) return { kind: 'scale', hx, hy };
      if (dx > near * 0.5 && dy > near * 0.5 && dx < ring && dy < ring) return { kind: 'rotate', hx, hy };
      if (dx < -near * 0.5 && dy < -near * 0.5 && dx > -ring && dy > -ring) return { kind: 'rotate', hx, hy };
    }
    if (sy > f.t + near && sy < f.b - near) for (const hx of [-1, 1]) if (Math.abs(sx - (hx < 0 ? f.l : f.r)) <= 5) return { kind: 'scale', hx, hy: 0 };
    if (sx > f.l + near && sx < f.r - near) for (const hy of [-1, 1]) if (Math.abs(sy - (hy < 0 ? f.t : f.b)) <= 5) return { kind: 'scale', hx: 0, hy };
    return null;
  }

  cursorFor(hd) {
    if (!hd) return null;
    if (hd.kind === 'rotate') return ROTATE_CURSOR;
    if (hd.hx && hd.hy) return hd.hx === hd.hy ? 'nwse-resize' : 'nesw-resize';
    return hd.hx ? 'ew-resize' : 'ns-resize';
  }

  startTransform(e, hd) {
    const f = this.frame();
    const b = f.world;
    const before = JSON.stringify(this.store.doc);
    const originals = new Map(this.store.doc.elements.filter(el => this.selected.has(el.id)).map(el => [el.id, el.points.map(p => p.slice())]));
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const [wx0, wy0] = this.toWorld(...this.local(e));
    const a0 = Math.atan2(wy0 - cy, wx0 - cx);
    let changed = false;
    this.pointer = true;
    this.transforming = hd;
    const apply = fn => {
      for (const el of this.store.doc.elements) {
        const o = originals.get(el.id);
        if (o) el.points = o.map(([x, y, t, p]) => { const [nx, ny] = fn(x, y); return [nx, ny, t, p]; });
      }
      changed = true;
      this.invalidate();
    };
    const mv = ev => {
      const [x, y] = this.toWorld(...this.local(ev));
      if (hd.kind === 'rotate') {
        let a = Math.atan2(y - cy, x - cx) - a0;
        if (ev.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        const c = Math.cos(a), s = Math.sin(a);
        this.transformLabel = `${Math.round((a * 180) / Math.PI)}°`;
        apply((px, py) => [cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c]);
        return;
      }
      // Scale about the opposite side or corner (Alt: about the centre).
      const ax = ev.altKey ? cx : hd.hx < 0 ? b.x1 : b.x0, ay = ev.altKey ? cy : hd.hy < 0 ? b.y1 : b.y0;
      const hx0 = hd.hx < 0 ? b.x0 : b.x1, hy0 = hd.hy < 0 ? b.y0 : b.y1;
      let sx = hd.hx && hx0 !== ax ? (x - ax) / (hx0 - ax) : 1;
      let sy = hd.hy && hy0 !== ay ? (y - ay) / (hy0 - ay) : 1;
      if (hd.hx && hd.hy && ev.shiftKey) { const k = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * k; sy = Math.sign(sy || 1) * k; }
      if (!Number.isFinite(sx)) sx = 1;
      if (!Number.isFinite(sy)) sy = 1;
      this.transformLabel = `${Math.round(sx * 100)}% × ${Math.round(sy * 100)}%`;
      apply((px, py) => [ax + (px - ax) * sx, ay + (py - ay) * sy]);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false; this.transforming = null; this.transformLabel = null;
      if (changed) this.store.commitFrom(before, hd.kind === 'rotate' ? 'rotate' : 'scale');
      this.invalidate();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  drawFrame(ctx, color) {
    if (this.getTool() !== 'select' || !this.selected.size || this.marquee) return;
    const f = this.frame();
    if (!f) return;
    const hd = this.transforming || this.hoverHandle;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = hd ? 0.9 : 0.35;
    if (this.selected.size > 1 || hd) ctx.strokeRect(Math.round(f.l) + 0.5, Math.round(f.t) + 0.5, Math.round(f.r - f.l), Math.round(f.b - f.t));
    if (hd) {
      // Only when the pointer is near: small corner ticks, and the active handle filled.
      ctx.globalAlpha = 1;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--wb-panel').trim() || '#222';
      for (const [x, y, hx, hy] of [[f.l, f.t, -1, -1], [f.r, f.t, 1, -1], [f.l, f.b, -1, 1], [f.r, f.b, 1, 1]]) {
        const on = hd.hx === hx && hd.hy === hy;
        ctx.beginPath(); ctx.rect(x - 3.5, y - 3.5, 7, 7);
        if (on && hd.kind === 'scale') { ctx.fillStyle = color; ctx.fill(); } else { ctx.fill(); ctx.stroke(); }
      }
      if (hd.kind === 'scale' && (!hd.hx || !hd.hy)) {
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (hd.hx) { const x = hd.hx < 0 ? f.l : f.r; ctx.moveTo(x, f.t + 8); ctx.lineTo(x, f.b - 8); } else { const y = hd.hy < 0 ? f.t : f.b; ctx.moveTo(f.l + 8, y); ctx.lineTo(f.r - 8, y); }
        ctx.stroke();
      }
      if (this.transformLabel) {
        ctx.font = '11px Inter, sans-serif'; ctx.fillStyle = color;
        ctx.fillText(this.transformLabel, f.r + 8, f.b + 14);
      }
    }
    ctx.restore();
  }

  hitTest(wx, wy) {
    const tol = 6 / this.cam.z;
    const els = this.store.ordered().filter(e => this.editable(e));
    for (let i = els.length - 1; i >= 0; i--) {
      const e = els[i];
      const params = resolveParams(e.realize.brush, e.realize.params);
      if (e.role === 'point') {
        if (e.points.some(([x, y]) => Math.hypot(x - wx, y - wy) < (params.size || 10) / 2 + tol)) return e;
      } else if (e.role === 'note') {
        const [x, y] = e.points[0];
        if (wx >= x && wx <= x + 230 / this.cam.z && wy >= y && wy <= y + 60 / this.cam.z) return e;
      } else {
        if (e.role === 'plane' && inside(e.points, wx, wy)) return e;
        const w = (params.width || 2) / 2 + tol;
        if (distToPath(e.points, wx, wy, e.closed || e.role === 'plane') < w) return e;
      }
    }
    return null;
  }

  // ---- input ------------------------------------------------------------------------
  bind() {
    const c = this.canvas;
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const [sx, sy] = this.local(e);
      if (e.ctrlKey || e.metaKey) this.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.01));
      else { this.cam.x -= e.deltaX; this.cam.y -= e.deltaY; this.saveCam(); this.invalidate(); }
    }, { passive: false });

    window.addEventListener('keydown', e => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'Space') { this.space = true; c.style.cursor = 'grab'; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { if (e.code === 'Space') { this.space = false; this.updateCursor(); } });

    c.addEventListener('pointermove', e => {
      if (this.pointer) return;
      const [sx, sy] = this.local(e);
      const [wx, wy] = this.toWorld(sx, sy);
      const tool = this.getTool();
      const hd = this.space ? null : this.handleAt(sx, sy);
      if (JSON.stringify(hd) !== JSON.stringify(this.hoverHandle)) { this.hoverHandle = hd; this.canvas.style.cursor = this.cursorFor(hd) || ''; if (!hd) this.updateCursor(); this.invalidate(); }
      const h = tool === 'select' && !hd ? this.hitTest(wx, wy)?.id || null : null;
      if (h !== this.hovered) { this.hovered = h; this.invalidate(); }
    });

    c.addEventListener('pointerdown', e => {
      if (e.button === 1 || this.space || this.getTool() === 'hand') return this.startPan(e);
      if (e.button !== 0) return;
      c.setPointerCapture(e.pointerId);
      const [sx, sy] = this.local(e);
      const [wx, wy] = this.toWorld(sx, sy);
      const tool = this.getTool();
      if (tool === 'select') {
        const hd = this.handleAt(sx, sy);
        if (hd) return this.startTransform(e, hd);
        return this.startSelect(e, wx, wy);
      }
      const stage = this.getStage();
      if (!stage || stage.locked) { this.flash('This stage is locked'); return; }
      if (tool === 'point') return this.commitNew('point', [[wx, wy, 0, 0.5]]);
      if (tool === 'note') return this.startNote(sx, sy, wx, wy);
      this.startStroke(e, tool, wx, wy);
    });
  }

  startPan(e) {
    const sx = e.clientX, sy = e.clientY, x0 = this.cam.x, y0 = this.cam.y;
    this.canvas.style.cursor = 'grabbing';
    const mv = ev => { this.cam.x = x0 + ev.clientX - sx; this.cam.y = y0 + ev.clientY - sy; this.invalidate(); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.saveCam(); this.updateCursor(); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  startSelect(e, wx, wy) {
    const hit = this.hitTest(wx, wy);
    if (hit) {
      // Clicking a grouped element selects its group; Cmd/Ctrl-click selects just the element.
      const ids = hit.group && !(e.metaKey || e.ctrlKey) ? this.store.doc.elements.filter(x => x.group === hit.group && this.editable(x)).map(x => x.id) : [hit.id];
      if (!this.selected.has(hit.id) || (e.metaKey || e.ctrlKey)) this.select(ids, e.shiftKey);
      const before = JSON.stringify(this.store.doc);
      let lx = wx, ly = wy, moved = false;
      this.pointer = true;
      const mv = ev => {
        const [x, y] = this.toWorld(...this.local(ev));
        const dx = x - lx, dy = y - ly; lx = x; ly = y;
        if (!dx && !dy) return;
        moved = true;
        for (const el of this.store.doc.elements) if (this.selected.has(el.id)) el.points = el.points.map(([px, py, t, p]) => [px + dx, py + dy, t, p]);
        this.invalidate();
      };
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
        this.pointer = false;
        if (moved) this.store.commitFrom(before, 'move');
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
      return;
    }
    if (!e.shiftKey) this.select([]);
    this.marquee = { x0: wx, y0: wy, x1: wx, y1: wy };
    this.pointer = true;
    const mv = ev => { const [x, y] = this.toWorld(...this.local(ev)); this.marquee.x1 = x; this.marquee.y1 = y; this.invalidate(); };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false;
      const m = this.marquee; this.marquee = null;
      const [x0, x1] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)], [y0, y1] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
      if (x1 - x0 > 2 / this.cam.z || y1 - y0 > 2 / this.cam.z) {
        const ids = this.store.doc.elements.filter(el => this.editable(el) && el.points.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)).map(el => el.id);
        const groups = new Set(this.store.doc.elements.filter(el => ids.includes(el.id) && el.group).map(el => el.group));
        this.select([...ids, ...this.store.doc.elements.filter(el => groups.has(el.group) && this.editable(el)).map(el => el.id)], true);
      }
      this.invalidate();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  startStroke(e, tool, wx, wy) {
    const t0 = performance.now();
    const role = tool;
    const d = this.getDefaults(role);
    this.draft = normalizeElement({ role, stage: 'draft', points: [[wx, wy, 0, pressureOf(e, 0)]], realize: d.realize, color: d.color, seed: 1 }, 'draft');
    let last = [wx, wy, t0];
    this.pointer = true;
    const straight = tool === 'guide';
    const mv = ev => {
      const [x, y] = this.toWorld(...this.local(ev));
      const now = performance.now();
      if (straight) {
        let [x1, y1] = [x, y];
        if (ev.shiftKey) { const a = Math.round(Math.atan2(y - wy, x - wx) / (Math.PI / 12)) * (Math.PI / 12), r = Math.hypot(x - wx, y - wy); x1 = wx + Math.cos(a) * r; y1 = wy + Math.sin(a) * r; }
        this.draft.points = [this.draft.points[0], [x1, y1, now - t0, 0.5]];
      } else {
        const dist = Math.hypot(x - last[0], y - last[1]);
        if (dist < 1.5 / this.cam.z) return;
        const speed = dist * this.cam.z / Math.max(1, now - last[2]);
        this.draft.points.push([x, y, now - t0, pressureOf(ev, speed)]);
        last = [x, y, now];
      }
      this.invalidate();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false;
      let pts = this.draft.points;
      this.draft = null;
      // A lasso that ends where it started: drop the duplicate closing points (no notch).
      if (role === 'plane') while (pts.length > 3 && Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < 6 / this.cam.z) pts = pts.slice(0, -1);
      const minPts = role === 'plane' ? 3 : 2;
      if (pts.length >= minPts) this.commitNew(role, straight ? pts : decimate(pts, 0.75 / this.cam.z));
      else this.invalidate();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  startNote(sx, sy, wx, wy) {
    const ta = document.createElement('textarea');
    ta.className = 'wb-note-input';
    Object.assign(ta.style, { left: `${sx}px`, top: `${sy}px` });
    ta.placeholder = 'Note…';
    this.host.appendChild(ta);
    setTimeout(() => ta.focus());
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      const text = ta.value.trim();
      ta.remove();
      if (ok && text) this.commitNew('note', [[wx, wy, 0, 0.5]], { text });
    };
    ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') finish(false); if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); } ev.stopPropagation(); });
    ta.addEventListener('blur', () => finish(true));
  }

  commitNew(role, points, extra = {}) {
    const d = this.getDefaults(role);
    const stage = this.getStage();
    const e = this.store.addElement({
      role, stage: stage.id, points, realize: structuredClone(d.realize || DEFAULT_REALIZE[role]),
      color: d.color || null, why: d.why || '', by: { kind: 'user', name: 'you' }, ...extra
    });
    if (d.sticky === false || role === 'note') this.onTool?.('select');
    this.select([e.id]);
    return e;
  }

  flash(text) {
    const f = document.createElement('div');
    f.className = 'wb-flash';
    f.textContent = text;
    this.host.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  updateCursor() {
    const t = this.getTool();
    this.canvas.style.cursor = this.space || t === 'hand' ? 'grab' : t === 'select' ? 'default' : t === 'note' ? 'text' : 'crosshair';
  }

  /** PNG of the artboard as currently shown (picture or process view). */
  snapshot(mode = this.viewMode(), scale = 1) {
    const c = document.createElement('canvas');
    const { width, height } = this.store.doc.artboard;
    c.width = Math.round(width * scale); c.height = Math.round(height * scale);
    renderDocument(c.getContext('2d'), this.store.doc, { mode, upTo: this.upTo, transform: { x: 0, y: 0, scale } });
    return c;
  }
}

// ---- helpers -------------------------------------------------------------------------

const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 1 3 5.7" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M5 12a7 7 0 1 1 3 5.7" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round"/><path d="M2 9l3 4 3-4" fill="black" stroke="white" stroke-width="1"/></svg>')}") 12 12, crosshair`;

/** Pen pressure when available; for mice, faster movement reads as lighter pressure. */
function pressureOf(e, speed) {
  if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
  return Math.max(0.15, Math.min(1, 0.85 - speed * 0.25));
}

/** Drop points closer than `tol` to their predecessor (keeps the last). */
function decimate(pts, tol) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    if (Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]) >= tol) out.push(pts[i]);
  }
  if (pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
}

function distToPath(pts, x, y, closed) {
  let best = Infinity;
  const n = pts.length;
  if (n === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
  }
  return best;
}

function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export { BRUSHES };
