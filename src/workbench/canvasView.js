/**
 * The workbench canvas: an infinite surface with the artboard at its origin.
 *
 * World units are artboard units. Screen = world × zoom + offset (CSS px; the
 * backing store is scaled for devicePixelRatio).
 *
 * Tools: select (V), hand (H or hold Space), line (1; Shift+1 for gesture and guide), plane (2; Shift+2 for
 * circle and rectangle), point (0), note (T). Freehand tools capture time and pressure
 * (mouse pressure is estimated from speed). Wheel pans; Ctrl/Cmd+wheel or pinch zooms.
 */
import { sculptMark, SCULPTABLE, nearMark, falloff, effectiveSculpt } from '../process/sculpt.js';
import { boardsOf, boardDoc, boardAt, boardForPoints, boardsInFrame, MAIN, BLACKBOARD } from '../process/boards.js';
import { closeLasso, lazyFollow, lazyCatchUp, straightEnd, effectiveLazy } from '../process/strokes.js';
import { rdp } from '../process/sculpt.js';
import { renderDocument, nextTimed, drawOutlines } from '../process/render.js';
import { smoothPath } from '../process/walk.js';
import { normalizeElement, DEFAULT_REALIZE } from '../process/document.js';
import { realizeAfter } from '../process/playparts.js';
import { BRUSHES, resolveParams, mulberry32 } from '../process/brushes.js';
import { noteCorners, noteProps, NOTE_FONTS } from '../process/notes.js';
import { shapePoints } from './shapes.js';
import { laserOutline, fillLaserOutline } from './laser.js';

const CAMERA_KEY = 'ams_workbench_camera_v1';
export const TOOL_KEYS = { v: 'select', h: 'hand', '1': 'line', '2': 'plane', '0': 'point', t: 'note' };

/** Tools where Shift+drag over a mark sculpts it (Guide keeps Shift for angle snapping). */
const SHIFT_SCULPT = new Set(['select', 'line', 'plane', 'gesture', 'brush']);
/** Tools that draw (and the laser, and sculpt, where Cmd is a modifier): Ctrl/Cmd there is not Properties or a right-click. */
const DRAW_TOOLS = new Set(['point', 'note', 'line', 'plane', 'circle', 'rect', 'gesture', 'guide', 'brush', 'laser', 'sculpt', 'play']);

const LASER_LIFE = 1000;            // ms a laser trail takes to fade out
const LASER_FALLBACK = '#e5484d';   // when there is no stroke color to use

export class CanvasView {
  constructor(host, store, { getTool, getStage, getDefaults, getSculpt, getLazy, getShape, onSelect, onTool, onNoteStyled, viewMode }) {
    this.host = host;
    this.store = store;
    this.getTool = getTool;
    this.getStage = getStage;
    this.getDefaults = getDefaults;
    this.getSculpt = getSculpt;
    this.getLazy = getLazy;
    this.getShape = getShape;
    this.onSelect = onSelect;
    this.onNoteStyled = onNoteStyled;
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
    this.boardSet = new Set();   // the boards selected together (Shift+click their titles, or a box): they move as a group
    // Note fonts are drawn on the canvas, so ask for them explicitly and redraw when they arrive.
    Promise.all(['22px Caveat', '17px "Patrick Hand"', '17px Newsreader'].map(f => document.fonts?.load(f).catch(() => null))).then(() => this.invalidate());
    this.upTo = Infinity;   // stage scrub
    this.grid = { show: 'paper', style: 'lines', spacing: 100, subdivisions: 4, color: '#8a837840', snap: false, snapMode: 'points' };
    try { Object.assign(this.grid, JSON.parse(localStorage.getItem('ams_grid_v2')) || {}); } catch { /* defaults */ }
    this.space = false;
    try { this.cam = JSON.parse(localStorage.getItem(CAMERA_KEY)) || null; } catch { this.cam = null; }
    this.resize();
    if (!this.cam) { this.cam = { x: 0, y: 0, z: 1 }; this.fit(); try { localStorage.removeItem(CAMERA_KEY); } catch { /* ignore */ } }
    new ResizeObserver(() => this.resize()).observe(host);
    // Baked boards (paused: drawn once into a picture). A live redraw drops only its own board's picture.
    this.baked = new Map();
    // A browser can take every canvas's contents away (memory, a hidden window): when they are back, paint again, and paint the paused boards' pictures anew.
    this.canvas.addEventListener('contextrestored', () => { this.baked.clear(); this.invalidate(); });
    store.subscribe((doc, reason) => { if (reason === 'live board code') this.baked.delete(store.lastLiveBoard); else this.baked.clear(); this.pruneSelection(); this.invalidate(); }, { live: true });
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
    const W = Math.round(this.w * dpr), H = Math.round(this.h * dpr);
    if (W === this.canvas.width && H === this.canvas.height && dpr === this.dpr) return;
    // Resizing clears the canvas; redraw now (ResizeObserver runs before paint) so a dragged
    // dock edge never shows a blank frame.
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.dpr = dpr;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (this.cam) this.draw(); else this.invalidate();
  }

  /** The camera that fits a board (the main one by default) in the view. */
  camFor(board = MAIN, pad = 60) {
    const b = boardsOf(this.store.doc).find(x => x.id === board) || boardsOf(this.store.doc)[0];
    const { width, height } = b;
    const z = Math.min((this.w - pad * 2) / width, (this.h - pad * 2) / height);
    return { z, x: (this.w - width * z) / 2 - b.x * z, y: (this.h - height * z) / 2 - b.y * z };
  }

  /** Move the view to a camera, eased (a transition between boards). */
  animateTo(cam, ms = 550) {
    cancelAnimationFrame(this.camAnim);
    const a = { ...this.cam }, t0 = performance.now();
    // Zoom moves in log space, so the transition feels even at every scale.
    const step = now => {
      const u = Math.min(1, (now - t0) / ms), e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      const z = Math.exp(Math.log(a.z) + (Math.log(cam.z) - Math.log(a.z)) * e);
      // Keep the world point at the screen center moving in a straight line.
      const c0 = [(this.w / 2 - a.x) / a.z, (this.h / 2 - a.y) / a.z], c1 = [(this.w / 2 - cam.x) / cam.z, (this.h / 2 - cam.y) / cam.z];
      const cx = c0[0] + (c1[0] - c0[0]) * e, cy = c0[1] + (c1[1] - c0[1]) * e;
      this.cam = { z, x: this.w / 2 - cx * z, y: this.h / 2 - cy * z };
      this.draw();
      if (u < 1) this.camAnim = requestAnimationFrame(step); else { this.cam = cam; this.saveCam(); this.invalidate(); }
    };
    this.camAnim = requestAnimationFrame(step);
  }

  /** Frame the selection (a rectangle in world units), eased. */
  frameSelection(pad = 60) {
    const b = this.selectionBounds();
    if (!b) return false;
    const w = Math.max(1, b.x1 - b.x0), h = Math.max(1, b.y1 - b.y0);
    const z = Math.min(40, Math.min((this.w - pad * 2) / w, (this.h - pad * 2) / h));
    this.animateTo({ z, x: (this.w - w * z) / 2 - b.x0 * z, y: (this.h - h * z) / 2 - b.y0 * z }, 400);
    return true;
  }

  /** Fit a board (the main one by default) in the view. */
  fit(pad = 60, board = MAIN) {
    this.cam = this.camFor(board, pad);
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

  /** The next frame of something that moves by itself (marks fading or drawing on): at most `animFps` a second, and never more than about a fifth of the main thread. */
  invalidateSoon(t0) {
    clearTimeout(this.timer);
    const gap = Math.max(1000 / (this.animFps || 15), (this.stats?.avg || 0) * 5);   // (a draw of 10 ms waits 50 ms: animation takes about a fifth of the main thread)
    this.timer = setTimeout(() => { this.timer = 0; this.invalidate(); }, Math.max(0, gap - (performance.now() - t0)));
  }

  /** What the canvas shows, in world units: [x0, y0, x1, y1] (marks outside it are not drawn). */
  viewRect(margin = 40) {
    const z = this.cam.z;
    return [(-this.cam.x) / z - margin, (-this.cam.y) / z - margin, (this.w - this.cam.x) / z + margin, (this.h - this.cam.y) / z + margin];
  }

  draw() {
    clearTimeout(this.timer); this.timer = 0;
    const t0 = performance.now();
    this.frameNow = Date.now();   // the moment marks with a time envelope are drawn at
    this.drawFrame_();
    const ms = performance.now() - t0;
    this.stats = { draw: ms, avg: this.stats ? this.stats.avg * 0.9 + ms * 0.1 : ms, frames: (this.stats?.frames || 0) + 1 };
    this.onDrawn?.();   // layers over the canvas (document boards) follow the camera
    // Marks still fading, drawing themselves or looping: the next frame.
    if (!this.previewDoc) {
      // Marks fading or drawing: the next frame soon. Marks that only stay: a frame when the next one goes or starts to fade.
      const wait = nextTimed(this.store.doc, this.frameNow);
      if (wait === 0) this.invalidateSoon(t0);
      else if (wait < Infinity) { clearTimeout(this.timer); this.timer = setTimeout(() => { this.timer = 0; this.invalidate(); }, Math.max(250, Math.min(wait + 15, 5000))); }   // (not sooner than a quarter second: a picture that repaints itself redraws with each run anyway)
    }
  }

  /** Boards with a mask or effects: each composed into a picture (kept while nothing it depends on changes) and put where the board is. */
  drawComposed(ctx, doc, composed, css) {
    const z = this.cam.z, scale = z * this.dpr, mode = this.viewMode();
    for (const b of composed) {
      if (!this.boardOnScreen(b)) continue;
      const c = this.composer.compose(b, { doc, scale, now: this.frameNow, mode, chain: [] });
      const [sx, sy] = this.toScreen(b.x, b.y);
      ctx.drawImage(c, sx, sy, b.width * z, b.height * z);
    }
    // Their marks' outlines (selected, hovered), which the marks' own drawing would have made.
    if (!this.previewDoc && (this.selected.size || this.hovered)) {
      const marks = doc.elements.filter(e => this.composedIds.has(e.board || MAIN));
      ctx.save(); ctx.translate(this.cam.x, this.cam.y); ctx.scale(z, z);
      drawOutlines(ctx, marks, this.selected, this.hovered, css.getPropertyValue('--wb-select').trim() || '#8a8a8a', z);
      ctx.restore();
    }
  }

  drawFrame_() {
    const { ctx } = this;
    const css = getComputedStyle(document.documentElement);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Cleared first: the workspace color may be transparent (or partly).
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = css.getPropertyValue('--wb-canvas').trim() || '#1b1c1f';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid(false);
    const doc = this.previewDoc || this.store.doc;   // a take being played shows its own document
    const boards = boardsOf(doc);
    // Boards with a mask or effects (opt-in) are composed apart, and drawn on top of the rest (see masks.js).
    const composed = this.composer ? boards.filter(b => b.kind !== 'frame' && !b.hidden && this.composer.needs(b)) : [];
    this.composedIds = composed.length ? new Set(composed.map(b => b.id)) : null;
    if (composed.length) this.composer.begin(doc, this.frameNow);
    else if (this.composer && (this.composer.pictures.size || this.composer.masks.size || this.composer.views.size) && !(this.sweptAt > this.frameNow - 3000)) { this.composer.sweep(doc); this.sweptAt = this.frameNow; }   // (masks taken away: give back what was kept)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    for (const b of boards) {
      if (b.kind === 'frame' || b.hidden || this.composedIds?.has(b.id)) continue;
      const [bx, by] = this.toScreen(b.x, b.y);
      ctx.shadowColor = b.hideBorder ? 'transparent' : 'rgba(0,0,0,0.35)';   // no border: no shadow either
      ctx.fillStyle = b.ground;
      ctx.fillRect(bx, by, b.width * this.cam.z, b.height * this.cam.z);
    }
    ctx.restore();
    // A hidden board: only where it is (a dashed outline), none of its marks.
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = css.getPropertyValue('--wb-line').trim() || '#353535';
    for (const b of boards) {
      if (!b.hidden || b.kind === 'player') continue;   // (a hidden player leaves no trace: its switch is in Properties)
      const [bx, by] = this.toScreen(b.x, b.y);
      ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(b.width * this.cam.z), Math.round(b.height * this.cam.z));
    }
    ctx.restore();
    // Frames (slides): a quiet outline around the boards they hold, drawn under them.
    ctx.save();
    for (const b of boards) {
      if (b.kind !== 'frame' || b.hideBorder) continue;
      const [bx, by] = this.toScreen(b.x, b.y);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.fillRect(bx, by, b.width * this.cam.z, b.height * this.cam.z);
      ctx.strokeStyle = css.getPropertyValue('--wb-line').trim() || '#353535';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(b.width * this.cam.z), Math.round(b.height * this.cam.z));
    }
    ctx.restore();
    this.drawGrid(true);
    if (this.grid.show === 'everywhere') { const keep = this.grid.show; this.grid.show = 'paper'; this.drawGrid(true); this.grid.show = keep; }
    if (this.drawReference) {
      ctx.save();
      ctx.translate(this.cam.x, this.cam.y);
      ctx.scale(this.cam.z, this.cam.z);
      this.drawReference(ctx);
      ctx.restore();
    }
    const skip = this.drawBaked(ctx, doc);
    for (const b of boards) if (b.hidden || this.composedIds?.has(b.id)) skip.add(b.id);
    renderDocument(ctx, skip.size ? { ...doc, elements: doc.elements.filter(e => !skip.has(e.board || MAIN)) } : doc, {
      mode: this.viewMode(), upTo: this.upTo, transform: { x: this.cam.x, y: this.cam.y, scale: this.cam.z },
      selected: this.previewDoc ? new Set() : this.selected, hovered: this.previewDoc ? null : this.hovered, ground: false, screenNotes: true, now: this.frameNow, view: this.viewRect(),
      selectColor: css.getPropertyValue('--wb-select').trim() || '#8a8a8a'
    });
    if (composed.length) this.drawComposed(ctx, doc, composed, css);
    if (this.drawOverlay) {
      ctx.save(); ctx.translate(this.cam.x, this.cam.y); ctx.scale(this.cam.z, this.cam.z);
      this.drawOverlay(ctx);
      ctx.restore();
    }
    if (this.draft) {
      // A plane being drawn is closed the way it will be on release (no spikes where the ends meet).
      // Shown as it will be on release: a plane closed smoothly, and simplified live when Simplify is on.
      let d = this.draft;
      // The rubber band sits on the point just clicked until the pointer moves, and a repeated point makes a
      // smooth curve loop at that corner: it is left out of the picture (as is one on a plane's first point).
      if (this.clickPath) {
        const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
        let pts = d.points.filter((p, i, a) => !i || !same(p, a[i - 1]));
        if (d.role === 'plane' && pts.length > 2 && same(pts[0], pts.at(-1))) pts = pts.slice(0, -1);
        d = { ...d, points: pts };
      }
      const simp = this.getLazy?.()?.simplify || 0;
      // (A path made point by point keeps its points as clicked.)
      if (!this.clickPath && !this.draftShape && simp > 0 && d.points.length > 3 && !this.draftStraight) d = { ...d, points: rdp(d.points, simp / this.cam.z) };
      if (!this.clickPath && !this.draftShape && d.role === 'plane' && d.points.length > 5) d = { ...d, points: closeLasso(d.points, 6 / this.cam.z) };
      this.draftShown = d;
      if (d.role === 'plane' && d.points.length < 3) {
        // A plane has no area until it has three points: until then its outline so far (rubber band included) is drawn.
        const ink = d.color || '#1d1b19';
        ctx.save(); ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        d.points.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
        ctx.stroke();
        for (const [x, y] of d.points) { const [sx, sy] = this.toScreen(x, y); ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      } else renderDocument(ctx, { ...doc, stages: [{ id: 'draft', visible: true }], elements: [d] }, {
        mode: 'process', transform: { x: this.cam.x, y: this.cam.y, scale: this.cam.z }, ground: false
      });
    }
    if (this.previewDoc) { this.drawPreviewOverlay?.(ctx, { x: this.cam.x, y: this.cam.y, scale: this.cam.z }, this.w, this.h); return; }
    this.drawBoards(ctx, css);
    // Direct selection: the selected (and hovered) marks' points as small squares; selected points filled.
    if (this.getTool() === 'direct') {
      const sel = new Set((this.selPoints || []).map(p => `${p.id}:${p.i}`));
      const ids = new Set([...this.selected, this.hovered].filter(Boolean));
      const text = css.getPropertyValue('--wb-text').trim() || '#ddd', panel = css.getPropertyValue('--wb-panel').trim() || '#222', accent = css.getPropertyValue('--wb-accent-2').trim() || '#c8664f';
      ctx.save(); ctx.lineWidth = 1;
      for (const el of this.store.doc.elements) {
        if (!ids.has(el.id)) continue;
        el.points.forEach((q, i) => {
          const [x, y] = this.toScreen(q[0], q[1]), on = sel.has(`${el.id}:${i}`);
          ctx.fillStyle = on ? accent : panel; ctx.strokeStyle = on ? accent : text;
          ctx.fillRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7); ctx.strokeRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7);
        });
      }
      ctx.restore();
    }
    this.drawFrame(ctx, css.getPropertyValue('--wb-select').trim() || '#8a8a8a');
    // Points: every mark's points as faint dots (brighter on the selection).
    if (this.showPoints) {
      const doc = this.previewDoc || this.store.doc;
      const vis = new Set(doc.stages.filter(s => s.visible).map(s => s.id));
      const col = css.getPropertyValue('--wb-accent-2').trim() || '#c8664f';
      ctx.save();
      ctx.fillStyle = col;
      ctx.strokeStyle = css.getPropertyValue('--wb-bg').trim() || css.getPropertyValue('--wb-panel').trim() || '#111'; ctx.lineWidth = 1;
      for (const e of doc.elements) {
        if (e.hidden || !vis.has(e.stage) || ['note', 'image'].includes(e.role)) continue;
        const sel = this.selected.has(e.id);
        ctx.globalAlpha = sel ? 0.95 : 0.6;
        const rr = sel ? 2 : 1.5;
        for (const q of e.points) { const [x, y] = this.toScreen(q[0], q[1]); ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
      }
      // The stroke being drawn shows its points too (as they will be kept).
      if (this.draft && this.draftShown) {
        ctx.globalAlpha = 0.95;
        for (const q of this.draftShown.points) { const [x, y] = this.toScreen(q[0], q[1]); ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }
    if (this.rope) {
      const [px, py] = this.toScreen(...this.rope.pen), [cx, cy] = this.toScreen(...this.rope.cursor);
      ctx.save();
      ctx.strokeStyle = css.getPropertyValue('--wb-muted').trim() || '#888'; ctx.globalAlpha = 0.8; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke(); ctx.setLineDash([]);
      if (this.rope.radius > 0) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(cx, cy, this.rope.radius, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 0.9; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (this.brushAt) {
      const sc = this.getSculpt?.();
      ctx.save();
      ctx.strokeStyle = css.getPropertyValue('--wb-text').trim() || '#888'; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(this.brushAt[0], this.brushAt[1], sc?.radius || 40, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(this.brushAt[0], this.brushAt[1], (sc?.radius || 40) * (sc?.strength ?? 0.5), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    this.paintAffected();
    if (this.marquee) {
      const [x0, y0] = this.toScreen(this.marquee.x0, this.marquee.y0), [x1, y1] = this.toScreen(this.marquee.x1, this.marquee.y1);
      ctx.save();
      ctx.strokeStyle = css.getPropertyValue('--wb-select').trim(); ctx.fillStyle = css.getPropertyValue('--wb-on').trim();
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    }
  }

  setGrid(patch) {
    Object.assign(this.grid, patch);
    try { localStorage.setItem('ams_grid_v2', JSON.stringify(this.grid)); } catch { /* ignore */ }
    this.invalidate();
    this.onGrid?.(this.grid);
  }

  /**
   * Where a point snaps in the current snap mode: a grid point ('points', and 'increments' when
   * drawing), or the nearest point of another mark within 12 screen px ('objects'; unchanged if none).
   */
  snapTarget(x, y, exclude = null) {
    if (this.grid.snapMode !== 'objects') return this.snapPt(x, y, true);
    const r = 12 / this.cam.z;
    let best = r, hit = null;
    for (const e of this.store.doc.elements) {
      if (e.hidden || (exclude && exclude.has(e.id)) || e.role === 'note') continue;
      for (const q of e.points) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < best) { best = d; hit = q; } }
    }
    return hit ? [hit[0], hit[1]] : [x, y];
  }

  /** Nearest grid point (a subdivision) when snapping is on. */
  snapPt(x, y, force = false) {
    if (!this.grid.snap && !force) return [x, y];
    const q = this.grid.spacing / Math.max(1, this.grid.subdivisions);
    return [Math.round(x / q) * q, Math.round(y / q) * q];
  }

  /** The drawing grid, anchored at the artboard's origin: major lines every `spacing`, minor between. */
  drawGrid(onlyPaper) {
    const g = this.grid;
    if (!g.show || g.show === 'off' || this.presenting) return;
    if (onlyPaper !== (g.show === 'paper')) return;
    const { ctx } = this;
    const z = this.cam.z, major = g.spacing * z, minor = major / Math.max(1, g.subdivisions);
    if (major < 4) return;
    let x0 = 0, y0 = 0, x1 = this.w, y1 = this.h;
    ctx.save();
    if (onlyPaper) {
      // Every board's paper (anchored at the world origin, so boards share one grid).
      ctx.beginPath();
      for (const b of boardsOf(this.previewDoc || this.store.doc)) { const [bx, by] = this.toScreen(b.x, b.y); ctx.rect(bx, by, b.width * z, b.height * z); }
      ctx.clip();
    }
    ctx.strokeStyle = ctx.fillStyle = g.color;
    const strength = g.snap ? 1 : 0.5;   // fainter when marks don't snap to it
    const lines = (step, alpha, width) => {
      if (step < 5) return;
      ctx.globalAlpha = alpha * strength;
      const ox = this.cam.x - Math.floor((this.cam.x - x0) / step) * step, oy = this.cam.y - Math.floor((this.cam.y - y0) / step) * step;
      if (g.style === 'dots') {
        const r = Math.max(1, Math.min(2.2, step / 25)) * width;
        for (let x = ox; x <= x1; x += step) for (let y = oy; y <= y1; y += step) ctx.fillRect(Math.round(x) - r / 2, Math.round(y) - r / 2, r, r);
        return;
      }
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let x = ox; x <= x1; x += step) { const X = Math.round(x) + 0.5; ctx.moveTo(X, y0); ctx.lineTo(X, y1); }
      for (let y = oy; y <= y1; y += step) { const Y = Math.round(y) + 0.5; ctx.moveTo(x0, Y); ctx.lineTo(x1, Y); }
      ctx.stroke();
    };
    if (g.subdivisions > 1) lines(minor, Math.min(1, (minor - 5) / 10) * 0.55, 1);
    lines(major, 1, g.style === 'dots' ? 1.4 : 1);
    ctx.restore();
  }


  // ---- selection -------------------------------------------------------------------
  select(ids, additive = false) {
    if (!additive) this.selected.clear();
    for (const id of ids) this.selected.add(id);
    if (ids.length && this.selectedBoard) { this.selectedBoard = null; this.boardSet.clear(); }   // marks or boards, not both
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
    if (this.boardShut().has(e.board || MAIN)) return false;   // on a locked or hidden board
    const s = this.store.doc.stages.find(x => x.id === e.stage);
    return s && s.visible && !s.locked;
  }

  /** Boards whose marks cannot be edited (locked or hidden), cached per document. */
  boardShut() {
    const doc = this.store.doc;
    if (this.shutFor !== doc) { this.shutFor = doc; this.shut = new Set(boardsOf(doc).filter(b => b.locked || b.hidden).map(b => b.id)); }
    return this.shut;
  }

  // ---- transform frame ---------------------------------------------------------------
  /** World bounds of the selection (points and notes padded so small marks get a usable frame). */
  selectionBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of this.store.doc.elements) {
      if (!this.selected.has(e.id)) continue;
      for (const [x, y] of e.role === 'note' ? noteCorners(e) : e.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (!Number.isFinite(x0)) return null;
    return { x0, y0, x1, y1 };
  }

  /** Screen-space frame around the selection, with a minimum size so handles stay apart. */
  frame() {
    const b = this.selectionBounds();
    if (!b) return null;
    let [l, t] = this.toScreen(b.x0, b.y0), [r, btm] = this.toScreen(b.x1, b.y1);
    // No pad: the frame passes through the points' centers, so a snapped selection's edges sit on grid lines.
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
    // A small mark (a point) is mostly corner handles: inside it you move it; rotating is only from just outside the corner.
    const roomy = Math.min(f.r - f.l, f.b - f.t) >= 3 * ring;
    for (const hx of [-1, 1]) for (const hy of [-1, 1]) {
      const cx = hx < 0 ? f.l : f.r, cy = hy < 0 ? f.t : f.b;
      const dx = (sx - cx) * -hx, dy = (sy - cy) * -hy;   // positive = inside the frame
      if (Math.abs(dx) <= near && Math.abs(dy) <= near) return { kind: 'scale', hx, hy };
      if (roomy && dx > near * 0.5 && dy > near * 0.5 && dx < ring && dy < ring) return { kind: 'rotate', hx, hy };
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
    const notes = new Map(this.store.doc.elements.filter(el => this.selected.has(el.id) && el.role === 'note').map(el => [el.id, noteProps(el)]));
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const tb = this.selectionBounds();   // the marks' own bounds (the frame is padded)
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
        for (const el of this.store.doc.elements) if (notes.has(el.id)) el.note = { ...(el.note || {}), angle: notes.get(el.id).angle + a };
        return;
      }
      // Scale about the opposite side or corner (Alt: about the center).
      const ax = ev.altKey ? cx : hd.hx < 0 ? b.x1 : b.x0, ay = ev.altKey ? cy : hd.hy < 0 ? b.y1 : b.y0;
      const hx0 = hd.hx < 0 ? b.x0 : b.x1, hy0 = hd.hy < 0 ? b.y0 : b.y1;
      // Move the grabbed edge by the pointer's travel (the frame is padded, so not to the pointer itself).
      const ex = hx0 + (x - wx0), ey = hy0 + (y - wy0);
      let sx = hd.hx && hx0 !== ax ? (ex - ax) / (hx0 - ax) : 1;
      let sy = hd.hy && hy0 !== ay ? (ey - ay) / (hy0 - ay) : 1;
      // Ctrl: the marks' own edges (not the padded frame) land on the grid.
      if (ev.ctrlKey && tb) {
        const tax = ev.altKey ? (tb.x0 + tb.x1) / 2 : hd.hx < 0 ? tb.x1 : tb.x0, tay = ev.altKey ? (tb.y0 + tb.y1) / 2 : hd.hy < 0 ? tb.y1 : tb.y0;
        const tex = hd.hx < 0 ? tb.x0 : tb.x1, tey = hd.hy < 0 ? tb.y0 : tb.y1;
        // Edges land on grid lines in every snap mode. (Steps counts from where the edge started, so an edge
        // that is off the grid would stay off it.)
        const [gx, gy] = this.snapPt(tex + (x - wx0), tey + (y - wy0), true);
        if (hd.hx && tex !== tax) sx = (gx - tax) / (tex - tax);
        if (hd.hy && tey !== tay) sy = (gy - tay) / (tey - tay);
        if (!ev.altKey) { apply((px, py) => [tax + (px - tax) * sx, tay + (py - tay) * sy]); this.transformLabel = `${Math.round(sx * 100)}% × ${Math.round(sy * 100)}%`; return; }
      }
      if (hd.hx && hd.hy && ev.shiftKey) { const k = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * k; sy = Math.sign(sy || 1) * k; }
      if (!Number.isFinite(sx)) sx = 1;
      if (!Number.isFinite(sy)) sy = 1;
      this.transformLabel = `${Math.round(sx * 100)}% × ${Math.round(sy * 100)}%`;
      apply((px, py) => [ax + (px - ax) * sx, ay + (py - ay) * sy]);
      // Notes: a side re-wraps the text (width); a corner, or the top/bottom, scales the lettering too.
      for (const el of this.store.doc.elements) {
        const o = notes.get(el.id);
        if (!o) continue;
        const k = hd.hx && hd.hy ? Math.abs(sx) : hd.hy ? Math.abs(sy) : 1;
        el.note = { ...(el.note || {}), width: Math.max(40, o.width * (hd.hx ? Math.abs(sx) : 1)), size: Math.max(4, o.size * k) };
        if (hd.hy && !hd.hx) el.note.width = o.width * k;
        // Keep the note's top-left at the scaled corner of its box, not flipped.
        if (sx < 0 || sy < 0) { const [px, py] = el.points[0]; el.points[0] = [px - (sx < 0 ? el.note.width : 0), py, el.points[0][2], el.points[0][3]]; }
        this.transformLabel = hd.hx && !hd.hy ? `width ${Math.round(el.note.width)}` : `${Math.round(el.note.size)} pt`;
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false; this.transforming = null; this.transformLabel = null;
      if (changed) { this.rehome(originals.keys()); this.store.commitFrom(before, hd.kind === 'rotate' ? 'rotate' : 'scale'); }
      // A resized note sets the size and width of the next one (not its angle).
      if (changed && hd.kind !== 'rotate' && notes.size === 1) {
        const n = this.store.doc.elements.find(el => notes.has(el.id));
        if (n) { const { angle, ...rest } = n.note || {}; this.onNoteStyled?.(rest); }
      }
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

  /**
   * Pick a mark with the pointer (an eyedropper): the next click on a mark that `accept` allows calls
   * onPick(mark); Esc, or a click on nothing, cancels. The mark under the pointer is lit meanwhile.
   */
  startPick({ accept = () => true, onPick, onEnd } = {}) {
    this.endPick();
    this.pick = { accept, onPick, onEnd };
    this.canvas.style.cursor = 'crosshair';
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); this.endPick(); } };
    window.addEventListener('keydown', key, true);
    this.pick.key = key;
  }

  endPick() {
    const p = this.pick;
    if (!p) return;
    this.pick = null; this.pickHover = null;
    window.removeEventListener('keydown', p.key, true);
    this.updateCursor?.();
    this.invalidate();
    p.onEnd?.();
  }

  hitTest(wx, wy, accept) {
    const tol = 6 / this.cam.z;
    const els = this.store.ordered().filter(e => this.editable(e));
    for (let i = els.length - 1; i >= 0; i--) {
      const e = els[i];
      if (accept && !accept(e)) continue;
      const params = resolveParams(e.realize.brush, e.realize.params);
      if (e.role === 'point') {
        if (e.points.some(([x, y]) => Math.hypot(x - wx, y - wy) < (params.size || 10) / 2 + tol)) return e;
      } else if (e.role === 'note') {
        if (inside(noteCorners(e), wx, wy)) return e;
      } else if (e.role === 'image') {
        if (inside(e.points, wx, wy)) return e;
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
      if (e.code === 'Space' && !e.shiftKey && !e.altKey) { this.space = true; c.style.cursor = 'grab'; e.preventDefault(); }   // (Shift+Space: the radial menu)
    });
    window.addEventListener('keyup', e => { if (e.code === 'Space') { const tap = this.space && !this.spaceUsed && this.getTool() === 'play'; this.space = false; this.spaceUsed = false; this.updateCursor(); if (tap) this.onSpaceTap?.(); } });   // (in the Play tool a tap of Space is play / pause; held, it pans)
    // Option (Alt) held: the sculpt brush shows the control points it would move, in any tool.
    const altState = e => { const on = Boolean(e.altKey); if (on !== this.altHeld) { this.altHeld = on; this.paintAffected(); } };
    window.addEventListener('keydown', altState);
    window.addEventListener('keyup', altState);
    // While drawing, a point-by-point path takes
    // Enter or Esc (finish) and Backspace (remove the last point).
    // Double-tap CapsLock (it ends as it was, so typing is unchanged): flips the path between smooth
    // and straight, on the stroke being drawn, or else on the selected marks.
    const capsPress = e => {
      if (e.key !== 'CapsLock' && e.code !== 'CapsLock') return;
      if (e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor')) return;
      const now = performance.now();
      // On a Mac a press is one event (keydown turning it on, keyup turning it off); elsewhere a press
      // is a keydown and a keyup, so only keydowns count.
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      if (!mac && e.type === 'keyup') return;
      if (now - (this.lastCaps || 0) < 450) { this.lastCaps = 0; this.flipPath(); } else this.lastCaps = now;
    };
    window.addEventListener('keydown', capsPress, true);
    window.addEventListener('keyup', capsPress, true);
    window.addEventListener('keydown', e => {
      if (this.getTool() === 'direct' && this.selPoints?.length && !e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor')) {
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); this.deletePoints(); return; }
        if (e.key === 'Escape') { e.stopPropagation(); this.selPoints = []; this.invalidate(); return; }
      }
    }, true);
    window.addEventListener('keydown', e => {
      if (!this.draft) return;
      if (!this.clickPath) return;
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.finishClickPath(); }
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault(); e.stopPropagation();
        const pts = this.draft.points;
        if (pts.length > 2) { pts.splice(pts.length - 2, 1); this.clickPath.last = { t: 0, p: pts.at(-2) }; this.invalidate(); } else { this.clickPath = null; this.draft = null; window.removeEventListener('pointermove', this.clickMove); this.invalidate(); }
      }
    }, true);

    c.addEventListener('pointermove', e => {
      if (this.pointer) return;
      const [sx, sy] = this.local(e);
      const [wx, wy] = this.toWorld(sx, sy);
      const tool = this.getTool();
      const hd = this.space ? null : this.handleAt(sx, sy);
      if (JSON.stringify(hd) !== JSON.stringify(this.hoverHandle)) { this.hoverHandle = hd; this.canvas.style.cursor = this.cursorFor(hd) || ''; if (!hd) this.updateCursor(); this.invalidate(); }
      const h = (tool === 'select' || tool === 'direct') && !hd ? this.hitTest(wx, wy)?.id || null : null;
      if (h !== this.hovered) { this.hovered = h; this.invalidate(); }
      const brush = tool === 'sculpt' || (e.shiftKey && SHIFT_SCULPT.has(tool) && this.sculptTargets(wx, wy).length);
      if (brush || this.brushAt) { this.brushAt = brush ? [sx, sy] : null; this.invalidate(); }
      this.lastLocal = [sx, sy];
      if (this.affectedShown() || this.affectedCanvas?.width) this.paintAffected();
    });
    c.addEventListener('pointerleave', () => { this.lastLocal = null; this.paintAffected(); if (this.brushAt) { this.brushAt = null; this.invalidate(); } });

    // Drop an asset (from the Assets panel) or image files anywhere on the canvas: it becomes a layer.
    // Drop a source (from the Sources panel): a board previewing it.
    // Listen on the whole stage area (islands and overlays sit above the canvas element).
    const zone = this.host;
    zone.addEventListener('dragover', e => {
      if (![...e.dataTransfer.types].some(t => t === 'text/asset-id' || t === 'text/ams-source' || t === 'Files')) return;
      e.preventDefault();
      // The effect must be one the source allows (asset cards allow copy and move).
      const allowed = e.dataTransfer.effectAllowed;
      e.dataTransfer.dropEffect = allowed === 'move' ? 'move' : 'copy';
      zone.classList.add('wb-drop-target');
    });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('wb-drop-target'); });
    zone.addEventListener('drop', e => {
      zone.classList.remove('wb-drop-target');
      e.preventDefault();
      const at = this.toWorld(...this.local(e));
      const id = e.dataTransfer.getData('text/asset-id'), source = e.dataTransfer.getData('text/ams-source');
      if (source) this.onDropSource?.(source, at);
      else if (id) this.onDropAsset?.(id, at);
      else if (e.dataTransfer.files?.length) this.onDropFiles?.([...e.dataTransfer.files], at);
    });
    c.addEventListener('dblclick', e => {
      if (this.getTool() === 'direct') { this.insertPointAt(...this.local(e)); return; }
      const bh = this.boardHandleAt(...this.local(e));
      // Double-click a board's title frames it; Shift+double-click renames it.
      if (bh?.kind === 'title') { if (e.shiftKey) this.onBoardRename?.(bh.id); else this.animateTo(this.camFor(bh.id), 400); }
    });
    c.addEventListener('contextmenu', e => {
      e.preventDefault();
      // Ctrl held while drawing (snap) is not a right-click. (On macOS Ctrl+click fires this event too, and a
      // click that closes a path has already cleared the draft by then, so the tool decides.)
      if (this.pointer || this.draft) return;
      // Ctrl+right-click (the button, not macOS's Ctrl+click) opens stroke and fill together at the pointer; with Shift, the grid.
      if (e.ctrlKey && e.button === 2 && this.onPaintPicker) { (e.shiftKey && this.onGridMenu ? this.onGridMenu : this.onPaintPicker)(e); return; }
      if (e.ctrlKey && DRAW_TOOLS.has(this.getTool())) return;
      if (e.shiftKey && this.onToolDetails) { this.onToolDetails(e); return; }   // Shift+right-click: the tool's settings at the pointer
      const bh = this.boardHandleAt(...this.local(e));
      if (bh) { this.selectBoard(bh.id); (e.altKey && this.onBoardParams ? this.onBoardParams : this.onBoardContext)?.(bh.id, e); return; }
      const [wx, wy] = this.toWorld(...this.local(e));
      const hit = this.hitTest(wx, wy);
      if (hit && !this.selected.has(hit.id)) {
        const ids = hit.group && !(e.metaKey || e.ctrlKey) ? this.store.doc.elements.filter(x => x.group === hit.group && this.editable(x)).map(x => x.id) : [hit.id];
        this.select(ids);
      }
      this.onContext?.(e, hit, [wx, wy]);
    });
    // Cmd/Ctrl+click anywhere in a board (not only its title) selects it and opens its Properties.
    // (Over a mark, the mark is what is selected: its Properties open too.) Boards drawn as pages over
    // the canvas (documents, sketches, players) are reached through the layer that holds them.
    const properties = (e, target) => {
      if ((!e.metaKey && !e.ctrlKey) || e.button !== 0 || this.previewDoc || this.space) return false;
      // While drawing (or part-way through a path made point by point), Ctrl snaps the click to the grid.
      if (this.clickPath || this.draft || DRAW_TOOLS.has(this.getTool())) return false;
      // A transform handle is grabbed with Ctrl too (the frame is padded past the marks, so it can sit on empty board).
      if (target === c && this.getTool() === 'select' && this.handleAt(...this.local(e))) return false;
      const [wx, wy] = this.toWorld(...this.local(e));
      const hit = target === c ? this.hitTest(wx, wy) : null;
      if (hit) { queueMicrotask(() => this.onOpenProperties?.()); return false; }   // the mark's selection goes on as before
      const b = boardAt(this.store.doc, wx, wy);
      if (!b) return false;
      e.preventDefault(); e.stopPropagation();
      this.selectBoard(b.id);
      this.onOpenProperties?.();
      return true;
    };
    this.host.addEventListener('pointerdown', e => { if (e.target !== c && e.target.closest?.('.wb-frames')) properties(e, e.target); }, true);
    c.addEventListener('pointermove', e => {
      if (!this.pick && this.getTool() === 'play' && !this.pointer) this.playTool?.hover(e);
      if (!this.pick) return;
      const [wx, wy] = this.toWorld(...this.local(e));
      const hit = this.hitTest(wx, wy, this.pick.accept);
      if ((hit?.id || null) !== this.pickHover) { this.pickHover = hit?.id || null; this.invalidate(); }
    });
    c.addEventListener('pointerdown', e => {
      if (this.pick && e.button === 0) {
        e.preventDefault(); e.stopPropagation();
        const [wx, wy] = this.toWorld(...this.local(e));
        const hit = this.hitTest(wx, wy, this.pick.accept), pick = this.pick;
        this.endPick();
        if (hit) pick.onPick?.(hit);
        return;
      }
      if (properties(e, c)) return;
      // Working on the canvas takes the keyboard back from panel fields, so tool keys (V, H, P…) work.
      const f = document.activeElement;
      if (f && f !== document.body && f.closest?.('input, textarea, select, [contenteditable]') && !f.classList.contains('wb-note-input')) f.blur();
      if (this.space) this.spaceUsed = true;
      if (e.button === 1 || this.space || this.getTool() === 'hand' || this.previewDoc) return this.startPan(e);
      if (e.button !== 0) return;
      if (this.clickPath) { this.clickPathClick(e); return; }
      c.setPointerCapture(e.pointerId);
      const [sx, sy] = this.local(e);
      const [wx, wy] = this.toWorld(sx, sy);
      // The board being worked on is drawn live (not baked) while the pointer is down.
      this.workBoard = boardAt(this.store.doc, wx, wy)?.id || BLACKBOARD;
      let tool = this.getTool();
      // A board's play / pause button works with any tool.
      const run = this.runButtonAt(sx, sy);
      if (run) { this.pointer = false; this.onToggleRun?.(run, e); return; }
      // The laser pointer works anywhere: on locked stages and boards too, since it leaves no mark.
      if (tool === 'laser') return this.startLaser(e, wx, wy);
      if (tool === 'play') return this.playTool?.down(e, wx, wy);
      // Boards: their titles (and the selected board's corner) work with Select and the Board tool.
      if (tool === 'direct') return this.startDirect(e, sx, sy, wx, wy);
      if (tool === 'select' || tool === 'board') {
        const bh = this.boardHandleAt(sx, sy);
        if (bh) return this.startBoardDrag(e, bh);
        if (tool === 'board') return this.startBoardRect(e, wx, wy);
        if (this.selectedBoard && !this.hitTest(wx, wy) && !e.shiftKey) this.selectBoard(null);
      }
      // Sculpt: the Sculpt tool, or Shift+drag over a mark with most tools.
      if (tool === 'sculpt' || (e.shiftKey && SHIFT_SCULPT.has(tool) && this.sculptTargets(wx, wy).length && !(tool === 'select' && this.handleAt(sx, sy)))) {
        return this.startSculpt(e, wx, wy, tool === 'sculpt' ? null : () => { if (tool === 'select') this.startSelectClick(e, wx, wy); });
      }
      if (tool === 'select') {
        const hd = this.handleAt(sx, sy);
        if (hd) return this.startTransform(e, hd);
        return this.startSelect(e, wx, wy);
      }
      const stage = this.getStage();
      if (!stage || stage.locked) { this.flash('This stage is locked'); return; }
      const under = boardAt(this.store.doc, wx, wy);
      if (under && (under.locked || under.hidden)) { this.flash(under.locked ? 'This board is locked' : 'This board is hidden'); return; }
      if (tool === 'point') { const [px, py] = this.snapPt(wx, wy); return this.commitNew('point', [[px, py, 0, 0.5]]); }
      if (tool === 'note') { const [nx, ny] = this.snapPt(wx, wy); const [nsx, nsy] = this.toScreen(nx, ny); return this.startNote(nsx, nsy, nx, ny); }
      if (tool === 'circle' || tool === 'rect') return this.startShape(e, tool, wx, wy);
      this.startStroke(e, tool, wx, wy);
    });
  }

  // ---- baked boards ------------------------------------------------------------------
  /** Is a board (with a margin for marks that spill over it) on screen? */
  boardOnScreen(b, margin = 0.25) {
    const m = margin * Math.max(b.width, b.height);
    const [x0, y0] = this.toScreen(b.x - m, b.y - m), [x1, y1] = this.toScreen(b.x + b.width + m, b.y + b.height + m);
    return x1 > 0 && y1 > 0 && x0 < this.w && y0 < this.h;
  }

  /**
   * Paused boards (not live: see app.isBoardLive) are baked: their marks drawn once into a picture at
   * about this zoom, then shown as that picture until they change or run again. Boards off screen are
   * not drawn at all. Boards being worked on (a selection, the board under the pointer, the selected
   * board) are always drawn live. Returns the boards drawn here (their marks are skipped after).
   */
  drawBaked(ctx, doc) {
    const done = new Set();
    if (this.previewDoc || !this.isBoardLive || this.bakeOff) return done;
    const boards = boardsOf(doc);
    if (boards.length < 2) return done;
    const byId = new Map(doc.elements.map(e => [e.id, e]));
    const busy = new Set([this.selectedBoard, this.pointer ? this.workBoard : null, ...[...this.selected, this.hovered].map(id => byId.get(id)).filter(Boolean).map(e => e.board || MAIN)]);
    const mode = this.viewMode(), dpr = this.dpr, z = this.cam.z;
    // Baked at a zoom in half-octave steps, so zooming reuses a picture for a while.
    const zb = Math.pow(2, Math.round(Math.log2(z) * 2) / 2);
    let marks = null;
    for (const b of boards) {
      if (b.hidden || this.composedIds?.has(b.id)) { this.baked.delete(b.id); done.add(b.id); continue; }   // not drawn at all, or composed (masks.js)
      if (this.isBoardLive(b.id)) { this.baked.delete(b.id); continue; }
      if (busy.has(b.id)) continue;   // its picture is kept: edits end in a store change, which drops it
      // Off screen: not drawn, and its picture is let go (memory stays with what you see).
      if (!this.boardOnScreen(b)) { done.add(b.id); this.baked.delete(b.id); continue; }
      const m = 0.25 * Math.max(b.width, b.height), W = b.width + 2 * m, H = b.height + 2 * m;
      const s = zb * dpr;
      // Zoomed in so far that its picture would be larger than twice the screen: drawn live instead
      // (only a few boards can be that close, and a huge picture costs more than it saves).
      if (Math.max(W, H) * s > 2 * Math.max(this.w, this.h) * dpr) { this.baked.delete(b.id); continue; }
      done.add(b.id);
      const key = `${s.toFixed(4)}|${mode}|${this.upTo}`;
      let c = this.baked.get(b.id);
      if (!c || c.key !== key || !c.canvas.width || !c.canvas.height) {   // (a canvas the browser has emptied is baked again)
        if (!marks) { marks = new Map(); for (const e of doc.elements) { const k = e.board || MAIN; (marks.get(k) || marks.set(k, []).get(k)).push(e); } }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(W * s)); canvas.height = Math.max(1, Math.round(H * s));
        renderDocument(canvas.getContext('2d'), { ...doc, elements: marks.get(b.id) || [] }, { mode, upTo: this.upTo, transform: { x: (m - b.x) * s, y: (m - b.y) * s, scale: s }, ground: false, screenNotes: true, frozen: true, now: this.frameNow });
        c = { key, canvas };
        this.baked.set(b.id, c);
      }
      const [sx, sy] = this.toScreen(b.x - m, b.y - m);
      ctx.drawImage(c.canvas, sx, sy, W * z, H * z);
    }
    return done;
  }

  // ---- boards --------------------------------------------------------------------
  /** Titles above the boards (click to select, drag to move with their marks), the selected board's frame and corner. */
  drawBoards(ctx, css) {
    const doc = this.store.doc, boards = boardsOf(doc);
    this.boardLabels = [];
    this.runButtons = [];
    if (this.presenting || (boards.length < 2 && !this.selectedBoard)) return;
    const text = css.getPropertyValue('--wb-text').trim() || '#ddd', muted = css.getPropertyValue('--wb-muted').trim() || '#888';
    const accent = css.getPropertyValue('--wb-accent-2').trim() || '#c8664f', sel = css.getPropertyValue('--wb-select').trim() || '#8a8a8a';
    ctx.save();
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    boards.forEach((b, i) => {
      const [bx, by] = this.toScreen(b.x, b.y), w = b.width * this.cam.z, h = b.height * this.cam.z;
      const on = this.selectedBoard === b.id || this.boardSet.has(b.id);
      // Its performance, under it (the board's own switch, or View → Performance under boards).
      const perf = this.boardPerf?.(b);
      if (perf) { ctx.save(); ctx.fillStyle = muted; ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'top'; ctx.fillText(perf, bx, by + h + 6, Math.max(120, w * 1.6)); ctx.restore(); }
      const noTitle = b.hideLabel && !on;   // no title (selected, it shows, so it can be moved); a board that runs keeps its play button
      if (b.kind === 'player' && b.hidden) return;
      const label = `${i + 1}  ${b.title}${this.showTrain !== false && (doc.train === b.id || (!doc.train && b.main && boards.length > 1)) ? '  ·  trains' : ''}`;   // (an embedded editor has no model to train: the host sets showTrain false)
      // Boards with processes (code, following sources, a source under them) get a play / pause button
      // after the title. Like a player's, it shows what a click does: pause while running, play when paused.
      const runs = b.kind === 'p5' || (!b.kind && Boolean(b.follow || b.source || b.code));   // documents (markdown, html) and frames have nothing to play
      // The play / pause button comes first, then the title, then icons for what is switched on.
      if (noTitle && !runs) return;
      const lead = runs ? 14 : 0, marks = (b.locked ? 1 : 0) + (b.hidden ? 1 : 0);
      const room = Math.max(40, w - lead - marks * 16);
      const tw = Math.min(ctx.measureText(label).width, room);
      if (runs) {
        // Sized and centred on the title's digits.
        // (The text sits on a 'bottom' baseline: its letters' own baseline is a descent higher.)
        const dm = ctx.measureText('0'), cy = Math.round(by - 5 - (dm.fontBoundingBoxDescent ?? 3) - dm.actualBoundingBoxAscent / 2) + 0.5;
        const live = Boolean(this.isBoardLive?.(b.id)), gx = bx;
        ctx.save();
        ctx.fillStyle = muted;
        if (live) { ctx.fillRect(gx, cy - 3.5, 2.5, 7); ctx.fillRect(gx + 5, cy - 3.5, 2.5, 7); }   // pause
        else { ctx.beginPath(); ctx.moveTo(gx, cy - 3.5); ctx.lineTo(gx + 7, cy); ctx.lineTo(gx, cy + 3.5); ctx.closePath(); ctx.fill(); }   // play
        ctx.restore();
        this.runButtons.push({ id: b.id, x: gx - 4, y: cy - 10, w: 18, h: 20 });
      }
      if (noTitle) return;
      ctx.fillStyle = on ? text : muted;
      ctx.fillText(label, bx + lead, by - 5, room);
      this.boardLabels.push({ id: b.id, x: bx + lead - 2, y: by - 20, w: tw + 4, h: 18 });
      // Locked and hidden: just an icon after the title.
      let ix = bx + lead + tw + 8;
      ctx.save();
      ctx.strokeStyle = muted; ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (b.locked) {
        ctx.strokeRect(ix + 1.5, by - 12, 8, 6);
        ctx.beginPath(); ctx.moveTo(ix + 3.5, by - 12); ctx.lineTo(ix + 3.5, by - 14.5); ctx.arc(ix + 5.5, by - 14.5, 2, Math.PI, 0); ctx.lineTo(ix + 7.5, by - 12); ctx.stroke();
        ix += 16;
      }
      if (b.hidden) {
        ctx.beginPath(); ctx.moveTo(ix, by - 9); ctx.quadraticCurveTo(ix + 5.5, by - 16, ix + 11, by - 9); ctx.quadraticCurveTo(ix + 5.5, by - 2, ix, by - 9); ctx.moveTo(ix + 1, by - 3); ctx.lineTo(ix + 10, by - 15); ctx.stroke();
      }
      ctx.restore();
      if (on) {
        ctx.strokeStyle = sel; ctx.lineWidth = 1.5; ctx.strokeRect(bx - 0.5, by - 0.5, w + 1, h + 1);
        if (this.boardSet.size <= 1) { ctx.fillStyle = accent; ctx.fillRect(bx + w - 5, by + h - 5, 10, 10); }   // (its corner: for one board)
      }
    });
    ctx.restore();
  }

  /** The play / pause button after a board's title under a screen point (its board id), or null. */
  runButtonAt(sx, sy) {
    const r = (this.runButtons || []).find(q => sx >= q.x && sx <= q.x + q.w && sy >= q.y && sy <= q.y + q.h);
    return r ? r.id : null;
  }

  /** The board title (or the selected board's resize corner) under a screen point. */
  boardHandleAt(sx, sy) {
    const doc = this.store.doc;
    if (this.selectedBoard && this.boardSet.size <= 1) {
      const b = boardsOf(doc).find(x => x.id === this.selectedBoard);
      if (b) { const [bx, by] = this.toScreen(b.x + b.width, b.y + b.height); if (Math.abs(sx - bx) < 8 && Math.abs(sy - by) < 8) return { id: b.id, kind: 'resize' }; }
    }
    const l = (this.boardLabels || []).find(r => sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h);
    return l ? { id: l.id, kind: 'title' } : null;
  }

  /** Select a board (add: Shift, toggling it in the group of selected boards). */
  selectBoard(id, add = false) {
    if (id && this.selected.size) this.select([]);
    if (!id) { this.boardSet.clear(); this.selectedBoard = null; }
    else if (add) {
      if (this.boardSet.has(id)) { this.boardSet.delete(id); this.selectedBoard = [...this.boardSet].at(-1) || null; }
      else { if (this.selectedBoard) this.boardSet.add(this.selectedBoard); this.boardSet.add(id); this.selectedBoard = id; }
    } else { this.boardSet = new Set([id]); this.selectedBoard = id; }
    if (this.selectedBoard) this.onBoardSelect?.(this.selectedBoard);
    this.invalidate();
  }

  /** Select several boards (a box around them). */
  selectBoards(ids, add = false) {
    if (!ids.length) return;
    if (this.selected.size) this.select([]);
    this.boardSet = new Set([...(add ? [...this.boardSet, ...(this.selectedBoard ? [this.selectedBoard] : [])] : []), ...ids]);
    this.selectedBoard = ids.at(-1);
    this.onBoardSelect?.(this.selectedBoard);
    this.invalidate();
  }

  /** Drag a board by its title (its marks come along), or resize it from its corner. One undo step. */
  startBoardDrag(e, hd) {
    const doc = this.store.doc;
    const b0 = boardsOf(doc).find(b => b.id === hd.id);
    if (!b0) return;
    // Shift+click a title: in or out of the group (no drag); dragging a selected one moves them all.
    if (e.shiftKey && hd.kind === 'title') { this.selectBoard(hd.id, true); return; }
    if (!(hd.kind === 'title' && this.boardSet.has(hd.id) && this.boardSet.size > 1)) this.selectBoard(hd.id);
    const group = hd.kind === 'title' && this.boardSet.size > 1 ? boardsOf(doc).filter(b => this.boardSet.has(b.id) && !b.main && !b.locked) : [];
    if (hd.kind === 'title' && b0.main && !group.length) return;   // the main board stays at the origin
    if (b0.locked) { this.flash('This board is locked'); return; }
    const before = JSON.stringify(doc);
    const [wx, wy] = this.toWorld(...this.local(e));
    // A frame carries the boards it holds (and their marks) along.
    // (a frame in a group carries its boards too)
    const movers = group.length ? group : [b0];
    const carried = hd.kind === 'title' ? movers.filter(b => b.kind === 'frame').flatMap(f => boardsInFrame(doc, f)).filter(b => !b.main && !movers.some(m => m.id === b.id)) : [];
    const carriedIds = new Set(carried.map(b => b.id));
    const moverIds = new Set(movers.filter(b => !b.main).map(b => b.id));
    const marks = doc.elements.filter(el => moverIds.has(el.board) || carriedIds.has(el.board)).map(el => [el, el.points.map(p => p.slice())]);
    const starts = carried.map(b => [doc.boards.find(x => x.id === b.id), b.x, b.y]);
    const groupStarts = movers.filter(b => b.id !== hd.id && !b.main).map(b => [doc.boards.find(x => x.id === b.id), b.x, b.y]);
    let moved = false;
    this.pointer = true;
    const mv = ev => {
      const [x, y] = this.toWorld(...this.local(ev));
      let dx = x - wx, dy = y - wy;
      if (!moved && Math.hypot(dx, dy) * this.cam.z < 3) return;
      moved = true;
      if (hd.kind === 'resize') {
        let [w, h] = [Math.max(40, b0.width + dx), Math.max(40, b0.height + dy)];
        if (this.grid.snap) [w, h] = this.snapPt(w, h);
        if (b0.main) Object.assign(doc.artboard, { width: Math.round(w), height: Math.round(h) });
        else Object.assign(doc.boards.find(b => b.id === hd.id), { width: Math.round(w), height: Math.round(h) });
      } else {
        if (this.grid.snap) { const [sx0, sy0] = this.snapPt(b0.x + dx, b0.y + dy); dx = sx0 - b0.x; dy = sy0 - b0.y; }
        Object.assign(doc.boards.find(b => b.id === hd.id) || {}, { x: Math.round(b0.x + dx), y: Math.round(b0.y + dy) });
        for (const [b, x0, y0] of groupStarts) Object.assign(b, { x: x0 + Math.round(b0.x + dx) - b0.x, y: y0 + Math.round(b0.y + dy) - b0.y });
        for (const [b, x0, y0] of starts) Object.assign(b, { x: x0 + Math.round(b0.x + dx) - b0.x, y: y0 + Math.round(b0.y + dy) - b0.y });
        for (const [el, pts] of marks) el.points = pts.map(([px, py, t, p]) => [px + Math.round(b0.x + dx) - b0.x, py + Math.round(b0.y + dy) - b0.y, t, p]);
      }
      this.invalidate();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false;
      if (moved) this.store.commitFrom(before, hd.kind === 'resize' ? 'resize board' : 'move board');
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /** Flip the path (smooth ↔ straight): the stroke being drawn, or else the selected marks (one undo step). */
  /** The selected marks that have a path to be smooth or straight (more than two points, not points, notes or images). */
  pathMarks() {
    return [...this.selected].map(id => this.store.doc.elements.find(x => x.id === id)).filter(e => e && e.points.length > 2 && !['point', 'note', 'image'].includes(e.role));
  }

  /** Is the stroke being drawn (or else the first selected mark) straight? */
  pathIsStraight() { return (this.draft || this.pathMarks()[0])?.path === 'straight'; }

  /**
   * Smooth or straight: the stroke being drawn, or else (unless marks is false) the selected marks.
   * False when neither applies.
   */
  setPath(to, { marks = true } = {}) {
    const straight = to === 'straight';
    if (this.draft) {
      this.draft.path = straight ? 'straight' : undefined;
      this.flash(straight ? 'Straight' : 'Smooth');
      this.invalidate();
      return true;
    }
    const ids = marks ? this.pathMarks().map(e => e.id) : [];
    if (!ids.length) return false;
    this.store.change('path', d => { for (const e of d.elements) if (ids.includes(e.id)) { if (straight) e.path = 'straight'; else delete e.path; } });
    this.flash(straight ? 'Straight' : 'Smooth');
    return true;
  }

  /** Double-tap CapsLock: the other path (the app decides what it applies to; see Workbench.flipPathChoice). */
  flipPath() {
    if (this.onFlipPath) return this.onFlipPath();
    return this.setPath(this.pathIsStraight() ? 'smooth' : 'straight');
  }

  // ---- direct selection: editing points --------------------------------------------------
  /** The point (of a shown mark: selected or hovered) under a screen point: { id, i } or null. */
  pointAt(sx, sy) {
    const r = 7;
    const ids = new Set([...this.selected, this.hovered].filter(Boolean));
    let best = r, hit = null;
    for (const e of this.store.doc.elements) {
      if (!ids.has(e.id) || !this.editable(e)) continue;
      e.points.forEach((q, i) => { const [x, y] = this.toScreen(q[0], q[1]); const d = Math.hypot(x - sx, y - sy); if (d < best) { best = d; hit = { id: e.id, i }; } });
    }
    return hit;
  }

  /** Direct selection: points are selected and moved (Ctrl snaps); a click on a mark shows its points. */
  startDirect(e, sx, sy, wx, wy) {
    this.selPoints ||= [];
    const hit = this.pointAt(sx, sy);
    const key = p => `${p.id}:${p.i}`;
    if (!hit) {
      const m = this.hitTest(wx, wy);
      if (m) { this.select([m.id], e.shiftKey); if (!e.shiftKey) this.selPoints = []; this.invalidate(); return; }
      // Empty canvas: a marquee selects points (and their marks).
      if (!e.shiftKey) { this.selPoints = []; this.select([]); }
      this.marquee = { x0: wx, y0: wy, x1: wx, y1: wy };
      this.pointer = true;
      const mv = ev => { const [x, y] = this.toWorld(...this.local(ev)); this.marquee.x1 = x; this.marquee.y1 = y; this.invalidate(); };
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
        this.pointer = false;
        const m2 = this.marquee; this.marquee = null;
        const [x0, x1] = [Math.min(m2.x0, m2.x1), Math.max(m2.x0, m2.x1)], [y0, y1] = [Math.min(m2.y0, m2.y1), Math.max(m2.y0, m2.y1)];
        const got = [];
        for (const el of this.store.doc.elements) {
          if (!this.editable(el) || el.hidden || ['note', 'image'].includes(el.role)) continue;
          el.points.forEach((q, i) => { if (q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1) got.push({ id: el.id, i }); });
        }
        const have = new Set(this.selPoints.map(key));
        this.selPoints = [...this.selPoints, ...got.filter(p => !have.has(key(p)))];
        this.select([...new Set(this.selPoints.map(p => p.id))], true);
        this.invalidate();
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      return;
    }
    // A point: select it (Shift adds or removes), then drag the selected points.
    const on = this.selPoints.some(p => key(p) === key(hit));
    if (e.shiftKey) this.selPoints = on ? this.selPoints.filter(p => key(p) !== key(hit)) : [...this.selPoints, hit];
    else if (!on) this.selPoints = [hit];
    if (!this.selected.has(hit.id)) this.select([...this.selected, hit.id]);
    const before = JSON.stringify(this.store.doc);
    const orig = this.selPoints.map(p => { const el = this.store.doc.elements.find(x => x.id === p.id); return { ...p, q: el.points[p.i].slice() }; });
    const grab = this.store.doc.elements.find(x => x.id === hit.id).points[hit.i].slice();
    let moved = false;
    this.pointer = true;
    const mv = ev => {
      let [x, y] = this.toWorld(...this.local(ev));
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      moved = true;
      let dx = x - wx, dy = y - wy;
      if (ev.ctrlKey || this.grid.snap) {
        const q = this.grid.spacing / Math.max(1, this.grid.subdivisions);
        if (this.grid.snapMode === 'increments') { dx = Math.round(dx / q) * q; dy = Math.round(dy / q) * q; }
        else { const exclude = new Set(); const [gx, gy] = this.snapTarget(grab[0] + dx, grab[1] + dy, exclude); dx = gx - grab[0]; dy = gy - grab[1]; }
      }
      for (const o of orig) { const el = this.store.doc.elements.find(x => x.id === o.id); if (el?.points[o.i]) el.points[o.i] = [o.q[0] + dx, o.q[1] + dy, o.q[2], o.q[3]]; }
      this.invalidate();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false;
      if (moved) this.store.commitFrom(before, 'move points');
      this.invalidate();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  /** Double-click a segment of a shown mark: a new point there (time and pressure in between). */
  insertPointAt(sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy), tol = 6 / this.cam.z;
    for (const el of this.store.doc.elements) {
      if (!this.selected.has(el.id) || el.points.length < 2) continue;
      const n = el.points.length, segs = el.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = el.points[i], b = el.points[(i + 1) % n];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((wx - a[0]) * dx + (wy - a[1]) * dy) / L)) : 0;
        if (Math.hypot(a[0] + dx * u - wx, a[1] + dy * u - wy) > tol) continue;
        const p = a.map((v, c) => v + ((b[c] ?? v) - v) * u);
        this.store.change('add point', d => { const e2 = d.elements.find(x => x.id === el.id); e2.points.splice(i + 1, 0, p); });
        this.selPoints = [{ id: el.id, i: i + 1 }];
        this.invalidate();
        return true;
      }
    }
    return false;
  }

  /** Delete the selected points (a mark left with too few points goes too). */
  deletePoints() {
    if (!this.selPoints?.length) return false;
    const by = new Map();
    for (const p of this.selPoints) { if (!by.has(p.id)) by.set(p.id, new Set()); by.get(p.id).add(p.i); }
    this.store.change('delete points', d => {
      d.elements = d.elements.filter(e => {
        const drop = by.get(e.id);
        if (!drop) return true;
        e.points = e.points.filter((_, i) => !drop.has(i));
        return e.points.length >= (e.role === 'plane' ? 3 : e.role === 'point' ? 1 : 2);
      });
    });
    this.selPoints = [];
    this.invalidate();
    return true;
  }

  // ---- paths made point by point ---------------------------------------------------------
  /** After a click (no drag): each click adds a point; a rubber band shows the next segment. */
  startClickPath(role, dkey) {
    const first = this.draft.points[0];
    this.clickPath = { role, dkey, t0: performance.now(), last: { t: performance.now(), p: first } };
    this.draft.points = [first, first.slice()];
    this.clickMove = ev => {
      if (!this.clickPath || !this.draft) return;
      let [x, y] = this.toWorld(...this.local(ev));
      if (ev.ctrlKey) [x, y] = this.snapTarget(x, y);
      if (ev.shiftKey && this.clickPath.role === 'guide') [x, y] = straightEnd(this.draft.points[this.draft.points.length - 2], [x, y]);
      this.draft.points[this.draft.points.length - 1] = [x, y, performance.now() - this.clickPath.t0, 0.5];
      this.invalidate();
    };
    window.addEventListener('pointermove', this.clickMove);
    this.invalidate();
  }

  /** A click while making a path: a new point, or close (on the first point), or finish (double-click). */
  clickPathClick(e) {
    const cp = this.clickPath, pts = this.draft.points.slice(0, -1);
    let [x, y] = this.toWorld(...this.local(e));
    if (e.ctrlKey) [x, y] = this.snapTarget(x, y);
    if (e.shiftKey && cp.role === 'guide' && pts.length) [x, y] = straightEnd(pts.at(-1), [x, y]);
    const now = performance.now(), near = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) < r / this.cam.z;
    if (pts.length >= 2 && near([x, y], pts[0], 8)) return this.finishClickPath({ close: true });
    if (now - cp.last.t < 350 && near([x, y], cp.last.p, 6)) return this.finishClickPath();
    const p = [x, y, now - cp.t0, 0.5];
    cp.last = { t: now, p };
    this.draft.points = [...pts, p, p.slice()];
    this.invalidate();
  }

  /** End a point-by-point path: it becomes a mark (closed if asked; a plane always is). */
  finishClickPath({ close = false } = {}) {
    const cp = this.clickPath;
    if (!cp) return;
    window.removeEventListener('pointermove', this.clickMove);
    let pts = this.draft ? this.draft.points.slice(0, -1) : [];
    const path = this.draft?.path;
    // Drop a double-click's repeated last point.
    while (pts.length > 1 && Math.hypot(pts.at(-1)[0] - pts.at(-2)[0], pts.at(-1)[1] - pts.at(-2)[1]) < 1e-6) pts = pts.slice(0, -1);
    this.clickPath = null; this.draft = null;
    const extra = { ...(path === 'straight' ? { path: 'straight' } : {}), ...(close && cp.role !== 'plane' ? { closed: true } : {}) };
    if (pts.length >= (cp.role === 'plane' ? 3 : 2)) this.commitNew(cp.role, pts, extra, cp.dkey);
    this.invalidate();
  }

  /** Board tool: drag out a rectangle, it becomes a board. */
  startBoardRect(e, wx, wy) {
    [wx, wy] = this.snapPt(wx, wy);
    this.marquee = { x0: wx, y0: wy, x1: wx, y1: wy };
    this.pointer = true;
    const mv = ev => { let [x, y] = this.toWorld(...this.local(ev)); [x, y] = this.snapPt(x, y); if (ev.shiftKey) { const s = Math.max(Math.abs(x - wx), Math.abs(y - wy)); x = wx + Math.sign(x - wx || 1) * s; y = wy + Math.sign(y - wy || 1) * s; } this.marquee.x1 = x; this.marquee.y1 = y; this.invalidate(); };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false;
      const m = this.marquee; this.marquee = null;
      const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1), w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
      if (w * this.cam.z > 12 && h * this.cam.z > 12) { const b = this.store.addBoard({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) }); this.selectBoard(b.id); this.onTool?.('select'); }
      this.invalidate();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /** Marks that moved go to the board they now lie on (the blackboard outside boards). Mutates the doc. */
  rehome(ids) {
    const set = new Set(ids);
    for (const el of this.store.doc.elements) {
      if (!set.has(el.id)) continue;
      const b = boardForPoints(this.store.doc, el.points);
      if (b === MAIN) delete el.board; else el.board = b;
    }
  }

  /** Marks the brush can sculpt at a world point: the selection if any, else any mark near it. */
  /** Direct is active, or Option is held: the sculpt brush's preview shows (not while dragging, pan or the laser). */
  affectedShown() {
    const t = this.getTool();
    return Boolean(this.lastLocal) && (!this.pointer || Boolean(this.sculptDrag)) && !this.space && (t === 'direct' || Boolean(this.altHeld)) && !['hand', 'laser', 'note', 'point', 'board'].includes(t);
  }

  /**
   * The sculpt preview on its own overlay canvas (above the marks, like the laser's): cleared and redrawn for the
   * pointer's position, or cleared when the preview is off.
   */
  paintAffected() {
    if (!this.affectedCanvas) {
      const c = document.createElement('canvas');
      c.className = 'wb-affected';
      Object.assign(c.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '55' });
      this.host.appendChild(c);
      this.affectedCanvas = c;
    }
    const oc = this.affectedCanvas, W = this.canvas.width, H = this.canvas.height;
    if (oc.width !== W || oc.height !== H) { oc.width = W; oc.height = H; }
    oc.style.width = this.canvas.style.width; oc.style.height = this.canvas.style.height;
    const ctx = oc.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.affectedShown()) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawAffected(ctx, getComputedStyle(document.documentElement));
  }

  /** The brush's ring, the affected curve, and a dot on each control point it would move (bigger within the brush). */
  drawAffected(ctx, css) {
    const [bx, by] = this.lastLocal, R = this.getSculpt?.()?.radius || 40;
    const [wx, wy] = this.toWorld(bx, by);
    ctx.save();
    ctx.strokeStyle = css.getPropertyValue('--wb-text').trim() || '#888'; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2); ctx.stroke();
    const accent = css.getPropertyValue('--wb-accent-2').trim() || '#c8664f', panel = css.getPropertyValue('--wb-panel').trim() || '#f3efe6';
    const targets = this.sculptTargets(wx, wy);
    // The whole curve the brush would act on: the mark drawn as it is (smoothed, or straight), highlighted.
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = accent;
    for (const el of targets) {
      const screen = el.points.map(q => { const [x, y] = this.toScreen(q[0], q[1]); return [x, y, 0, 0.5]; });
      const path = el.path === 'straight' || screen.length < 3 ? screen : smoothPath(screen, Boolean(el.closed));
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (el.closed) ctx.closePath();
      ctx.stroke();
    }
    // Its control points: those within the brush larger and stronger, the rest small.
    for (const el of targets) {
      for (const q of el.points) {
        const [sx, sy] = this.toScreen(q[0], q[1]);
        const d = Math.hypot(sx - bx, sy - by);
        const inside = d < R, w = inside ? falloff(d, R) : 0;
        ctx.globalAlpha = inside ? 0.5 + 0.5 * w : 0.7;
        ctx.beginPath(); ctx.arc(sx, sy, inside ? 3 + 3 * w : 2, 0, Math.PI * 2);
        ctx.fillStyle = accent; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = panel; ctx.stroke();
      }
    }
    ctx.restore();
  }

  sculptTargets(wx, wy) {
    const r = (this.getSculpt?.().radius || 40) / this.cam.z;
    const doc = this.store.doc;
    const stageOk = e => { const st = doc.stages.find(x => x.id === e.stage); return st && st.visible && !st.locked; };
    const pool = doc.elements.filter(e => SCULPTABLE(e) && this.editable(e) && !e.hidden && stageOk(e));
    const sel = pool.filter(e => this.selected.has(e.id));
    return (sel.length ? sel : pool).filter(e => nearMark(e.points, wx, wy, r, e.closed));
  }

  /**
   * Sculpt stroke: every pointer move runs the current sculpt tool over the marks under the brush
   * (the selection, if there is one). One undo step. `onClick` runs instead if the pointer never moved.
   */
  startSculpt(e, wx, wy, onClick = null) {
    const sc = this.getSculpt();
    const before = JSON.stringify(this.store.doc);
    const marks = new Map();
    let last = [wx, wy], moved = false, first = true;
    const selIds = [...this.selected].filter(id => this.store.doc.elements.some(x => x.id === id && SCULPTABLE(x)));
    const rng = mulberry32((Date.now() & 0xffff) + 1);
    const sb = boardAt(this.store.doc, wx, wy) || boardsOf(this.store.doc)[0], sBoard = { x: sb.x, y: sb.y, width: sb.width, height: sb.height };
    this.pointer = true;
    this.sculptDrag = true;   // the affected points stay visible while the sculpt drags
    const pass = ev => {
      const [sx, sy] = this.local(ev);
      const [x, y] = this.toWorld(sx, sy);
      this.brushAt = [sx, sy];
      this.lastLocal = [sx, sy];
      const s = {
        x, y, dx: x - last[0], dy: y - last[1], radius: sc.radius / this.cam.z, strength: sc.strength,
        pressure: ev.pointerType === 'pen' ? (ev.pressure || 0.5) * 2 : 1, invert: ev.altKey, boost: ev.metaKey || ev.ctrlKey, first, start: [wx, wy], board: sBoard
      };
      const els = selIds.length ? this.store.doc.elements.filter(el => selIds.includes(el.id)) : this.store.doc.elements.filter(el => SCULPTABLE(el) && this.editable(el) && !el.hidden);
      for (const el of els) {
        if (!marks.has(el.id)) marks.set(el.id, { orig: el.points.map(q => q.slice()), state: {} });
        const tool = effectiveSculpt(sc.tool, s.boost);   // Cmd: the tool's opposite (with its own settings)
        const out = sculptMark(tool, el, s, sc.params?.[tool], rng, marks.get(el.id));
        if (out) el.points = out;
      }
      first = false;
      last = [x, y];
      this.invalidate();
      this.paintAffected();
    };
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return;
      moved = true;
      pass(ev);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false; this.sculptDrag = false;
      if (moved) this.store.commitFrom(before, `sculpt: ${sc.tool}`);
      else if (onClick) onClick();
      else { pass(e); this.store.commitFrom(before, `sculpt: ${sc.tool}`); }
      this.invalidate();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /** Shift-click in Select without dragging: add or remove the mark from the selection. */
  startSelectClick(e, wx, wy) {
    const hit = this.hitTest(wx, wy);
    if (!hit) return;
    const ids = hit.group && !(e.metaKey || e.ctrlKey) ? this.store.doc.elements.filter(x => x.group === hit.group && this.editable(x)).map(x => x.id) : [hit.id];
    if (this.selected.has(hit.id)) this.select([...this.selected].filter(id => !ids.includes(id)));
    else this.select(ids, true);
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
      let moved = false;
      this.pointer = true;
      const orig = new Map(this.store.doc.elements.filter(el => this.selected.has(el.id)).map(el => [el.id, el.points.map(p => p.slice())]));
      const b0 = this.selectionBounds();
      // The selected point nearest the grab: it is what lands on the grid.
      let anchor = null, best = Infinity;
      for (const [, pts] of orig) for (const q of pts) { const d = Math.hypot(q[0] - wx, q[1] - wy); if (d < best) { best = d; anchor = q; } }
      const mv = ev => {
        const [x, y] = this.toWorld(...this.local(ev));
        let dx = x - wx, dy = y - wy;
        // With snap on, the selection's top-left corner lands on the grid.
        // With snap on, or Ctrl held: 'points' puts the mark's point nearest the grab on a grid point;
        // 'increments' moves in whole grid steps from where the selection started.
        if (this.grid.snap || ev.ctrlKey) {
          const q = this.grid.spacing / Math.max(1, this.grid.subdivisions);
          if (this.grid.snapMode === 'increments') { dx = Math.round(dx / q) * q; dy = Math.round(dy / q) * q; }
          else if (anchor) { const [gx, gy] = this.snapTarget(anchor[0] + dx, anchor[1] + dy, this.selected); dx = gx - anchor[0]; dy = gy - anchor[1]; }
        }
        if (!dx && !dy && !moved) return;
        moved = true;
        for (const el of this.store.doc.elements) { const o = orig.get(el.id); if (o) el.points = o.map(([px, py, t, p]) => [px + dx, py + dy, t, p]); }
        this.invalidate();
      };
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
        this.pointer = false;
        if (moved) { this.rehome(orig.keys()); this.store.commitFrom(before, 'move'); }
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
        // Boards wholly inside the box are selected as a group (their marks go with them, so are not picked).
        const inside = boardsOf(this.store.doc).filter(b => !b.main && b.x >= x0 && b.y >= y0 && b.x + b.width <= x1 && b.y + b.height <= y1);
        const insideIds = new Set(inside.map(b => b.id));
        const ids = this.store.doc.elements.filter(el => this.editable(el) && !insideIds.has(el.board) && el.points.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)).map(el => el.id);
        if (inside.length && !ids.length) { this.selectBoards(inside.map(b => b.id), e.shiftKey); this.invalidate(); return; }
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
    // A new stroke takes the focus: the mark selected before it is let go.
    if (this.selected.size) this.select([]);
    if (tool === 'guide') [wx, wy] = this.snapPt(wx, wy);
    // The Brush tool draws with the active brush: a line, or a plane for a plane-only brush.
    if (e.ctrlKey && tool !== 'guide') [wx, wy] = this.snapTarget(wx, wy);
    const role = tool === 'brush' ? (this.getDefaults('brush').role || 'line') : tool;
    const dkey = tool === 'brush' ? 'brush' : role;
    const d = this.getDefaults(dkey);
    this.draft = normalizeElement({ role, stage: 'draft', points: [[wx, wy, 0, pressureOf(e, 0)]], realize: d.realize, color: d.color, ...(d.fill ? { fill: d.fill } : {}), ...(d.path === 'straight' ? { path: 'straight' } : {}), seed: 1 }, 'draft');
    let last = [wx, wy, t0];
    this.pointer = true;
    const straight = tool === 'guide';
    this.draftStraight = straight;
    // Lazy drawing: the pen trails the cursor on a string (screen px), smoothed (an editor setting).
    // The tool's Pen (right-click the tool): Lazy takes its laziness (the string's length) and the editor's Smoothing.
    const lazyTool = d.lazy || {};
    const lazy = effectiveLazy(this.getLazy?.(), lazyTool);
    const lazyOn = !straight && (lazy.radius > 0 || lazy.smoothing > 0);   // (lazy.simplify applies on release)
    const catchOn = lazyOn && lazyTool.catch !== false;   // the pen catches up to a still pointer (the tool's Catch up setting)
    let pen = [wx, wy], cursor = [wx, wy], snapped = Boolean(e.ctrlKey);
    // Where a point lands on the stroke (a freehand stroke's points; the lazy pen's as well).
    const place = (x, y, ev) => {
      // Ctrl held: every point lands on the grid (whether grid snap is on or not).
      if (ev.ctrlKey) {
        snapped = true;
        [x, y] = this.snapTarget(x, y);
        const prev = this.draft.points[this.draft.points.length - 1];
        if (prev && prev[0] === x && prev[1] === y) return;
      }
      const dist = Math.hypot(x - last[0], y - last[1]);
      if (dist < 1.5 / this.cam.z && !ev.ctrlKey) return;
      const speed = dist * this.cam.z / Math.max(1, performance.now() - last[2]);
      this.draft.points.push([x, y, performance.now() - t0, pressureOf(ev, speed)]);
      last = [x, y, performance.now()];
    };
    // Lazy: the pen catches up to a cursor that has stopped (see catchUp), so the line reaches the pointer.
    const CATCH_MS = 360, STILL_MS = 80;   // (a time constant: the gap closes by about two thirds in 360 ms)
    let lastMove = performance.now(), catchAt = performance.now(), catchRaf = 0;
    const mv = ev => {
      lastMove = performance.now();
      let [x, y] = this.toWorld(...this.local(ev));
      if (lazyOn) {
        // The pen follows the cursor's whole path since the last event, in ~2 px steps (no snap at a sharp turn).
        pen = lazyFollow(pen, cursor, [x, y], lazy.radius / this.cam.z, lazy.smoothing, 2 / this.cam.z);
        cursor = [x, y];
        this.rope = { pen: pen.slice(), cursor: [x, y], radius: lazy.radius };
        [x, y] = pen;
      }
      if (straight) {
        let [x1, y1] = [x, y];
        if (ev.shiftKey) [x1, y1] = straightEnd([wx, wy], [x, y]);
        else [x1, y1] = this.snapPt(x1, y1);
        this.draft.points = [this.draft.points[0], [x1, y1, performance.now() - t0, 0.5]];
      } else place(x, y, ev);
      this.invalidate();
    };
    // While the pointer is still, the lazy pen eases to it: the line catches up to the pointer, then stops there.
    const catchUp = () => {
      catchRaf = 0;
      if (!this.draft) return;
      const now = performance.now(), dt = now - catchAt;
      catchAt = now;
      if (now - lastMove >= STILL_MS && Math.hypot(cursor[0] - pen[0], cursor[1] - pen[1]) * this.cam.z > 0.5) {
        pen = lazyCatchUp(pen, cursor, dt, CATCH_MS);
        this.rope = { pen: pen.slice(), cursor: cursor.slice(), radius: lazy.radius };
        place(pen[0], pen[1], { ctrlKey: false, pointerType: 'mouse' });
        this.invalidate();
      }
      catchRaf = requestAnimationFrame(catchUp);
    };
    if (catchOn) catchRaf = requestAnimationFrame(catchUp);
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false;
      cancelAnimationFrame(catchRaf); catchRaf = 0;
      // A lazy stroke ends where the pointer is: the pen catches up on release.
      if (catchOn && this.draft && this.draft.points.length > 1) { pen = cursor; place(cursor[0], cursor[1], { ctrlKey: false, pointerType: 'mouse' }); }
      // A click without a drag starts a path made point by point (click, click, … double-click or Enter).
      if (this.draft.points.length === 1 && tool !== 'point') { this.rope = null; this.startClickPath(role, dkey); return; }
      let pts = this.draft.points;
      const pathMode = this.draft.path;
      this.draft = null;
      this.rope = null;
      // A lasso: cut the tails where start and end overshoot, and smooth the seam (no spikes at the closure).
      // Snapped strokes keep their grid points (no seam relaxing, no decimation).
      if (role === 'plane' && !snapped) pts = closeLasso(decimate(pts, 0.75 / this.cam.z), 6 / this.cam.z);
      else if (role === 'plane' && pts.length > 3 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts = pts.slice(0, -1);
      const minPts = role === 'plane' ? 3 : 2;
      if (!straight && role !== 'plane' && !snapped) pts = decimate(pts, 0.75 / this.cam.z);
      // Auto simplify: fewer points within a tolerance (screen px), same shape; ends and time kept.
      if (!straight && lazy.simplify > 0 && pts.length > 3) { const out = rdp(pts, lazy.simplify / this.cam.z); if (out.length >= minPts) pts = out; }
      // A line drawn back to where it started closes: a closed path, without a duplicate end point.
      let extra = pathMode === 'straight' ? { path: 'straight' } : {};
      if (role !== 'plane' && !straight && pts.length > 3 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 6 / this.cam.z) { pts = pts.slice(0, -1); extra = { ...extra, closed: true }; }
      if (pts.length >= minPts) this.commitNew(role, pts, extra, dkey);
      else this.invalidate();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /**
   * Circle and Rectangle (under Plane): drag a box. Shift keeps the sides equal (a circle, a square), Alt draws from
   * the center, Ctrl snaps. Both make plane marks: a rectangle keeps its corners, a circle follows the plane's path.
   */
  startShape(e, tool, wx, wy) {
    if (this.selected.size) this.select([]);   // a new mark takes the focus
    const snapAt = (ev, x, y) => (ev.ctrlKey ? this.snapTarget(x, y) : this.snapPt(x, y));
    const [x0, y0] = snapAt(e, wx, wy);
    const d = this.getDefaults('plane');
    const path = tool === 'rect' || d.path === 'straight' ? 'straight' : undefined;
    let moved = false;
    this.pointer = true;
    this.draftShape = true;
    const mv = ev => {
      let [x, y] = this.toWorld(...this.local(ev));
      [x, y] = snapAt(ev, x, y);
      let dx = x - x0, dy = y - y0;
      if (!moved && Math.hypot(dx, dy) * this.cam.z < 3) return;
      moved = true;
      if (ev.shiftKey) { const s = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s; }
      const [ax, ay] = ev.altKey ? [x0 - dx, y0 - dy] : [x0, y0], [bx, by] = [x0 + dx, y0 + dy];
      const points = shapePoints(tool, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), this.getShape?.(tool));
      this.draft = normalizeElement({ role: 'plane', stage: 'draft', points, realize: d.realize, color: d.color, ...(d.fill ? { fill: d.fill } : {}), ...(path ? { path } : {}), seed: 1 }, 'draft');
      this.invalidate();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      this.pointer = false; this.draftShape = false;
      const pts = this.draft?.points;
      this.draft = null;
      if (moved && pts) this.commitNew('plane', pts, tool === 'rect' ? { path: 'straight' } : {}, 'plane');
      else this.invalidate();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  // ---- laser pointer ---------------------------------------------------------------
  /** The laser's color: the current stroke color (red when there is none). */
  laserColor() {
    const c = this.getDefaults?.('line')?.color;
    return c && c !== 'none' ? c : LASER_FALLBACK;
  }

  /**
   * Laser pointer (K): a pen that leaves a trail that fades out and no mark. A dot in the stroke color follows the
   * pointer while it is down. The trails are world points with the time they were made, drawn on their own overlay
   * canvas, so the drawing is not redrawn for them and nothing reaches the document or the undo history.
   */
  startLaser(e, wx, wy) {
    const trail = { color: this.laserColor(), pts: [{ x: wx, y: wy, t: performance.now() }], head: { x: wx, y: wy }, down: true };
    (this.laser ||= []).push(trail);
    this.pointer = true;
    const mv = ev => {
      const list = ev.getCoalescedEvents?.();
      for (const c of list && list.length ? list : [ev]) {
        const [x, y] = this.toWorld(...this.local(c));
        trail.pts.push({ x, y, t: performance.now() });
        trail.head = { x, y };
      }
      this.tickLaser();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      trail.down = false; this.pointer = false;
      this.tickLaser();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    this.tickLaser();
  }

  /** Keep the laser trails moving: one frame at a time, until every trail has faded out. */
  tickLaser() {
    if (this.laserRaf) return;
    const step = () => {
      this.laserRaf = 0;
      const now = performance.now();
      for (const tr of this.laser) tr.pts = tr.pts.filter(p => now - p.t < LASER_LIFE);
      this.laser = this.laser.filter(tr => tr.down || tr.pts.length > 1);
      this.drawLaser(now);
      if (this.laser.length) this.laserRaf = requestAnimationFrame(step);
    };
    this.laserRaf = requestAnimationFrame(step);
  }

  /** Paint the laser trails on the overlay canvas: each stretch fades and thins with its age, a dot marks the pointer. */
  drawLaser(now = performance.now()) {
    if (!this.laserCanvas) {
      const c = document.createElement('canvas');
      c.className = 'wb-laser';
      Object.assign(c.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '60' });
      this.host.appendChild(c);
      this.laserCanvas = c;
    }
    const lc = this.laserCanvas, W = this.canvas.width, H = this.canvas.height;
    if (lc.width !== W || lc.height !== H) { lc.width = W; lc.height = H; }
    lc.style.width = this.canvas.style.width; lc.style.height = this.canvas.style.height;
    const ctx = lc.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    for (const tr of this.laser || []) {
      // One shape per trail, in screen px: smoothed, tapering with age, filled once (see laser.js).
      const pts = tr.pts.map(p => { const [x, y] = this.toScreen(p.x, p.y); return { x, y, t: p.t }; });
      const head = tr.down && tr.head ? (() => { const [x, y] = this.toScreen(tr.head.x, tr.head.y); return { x, y }; })() : null;
      fillLaserOutline(ctx, laserOutline(pts, now, LASER_LIFE, { head }), tr.color);
    }
  }

  startNote(sx, sy, wx, wy) {
    const ta = document.createElement('textarea');
    ta.className = 'wb-note-input';
    // Look like the note it will become (the note tool's current style), at the current zoom.
    const np = noteProps({ note: this.getDefaults('note').note, color: this.getDefaults('note').color, points: [] });
    const z = this.cam.z;
    Object.assign(ta.style, {
      left: `${sx}px`, top: `${sy}px`, width: `${np.width * z}px`, minHeight: `${np.size * 1.6 * z}px`,
      font: `${np.size * z}px ${NOTE_FONTS[np.font][1]}`, lineHeight: np.font === 'hand' ? '1.15' : '1.32',
      color: np.ink, background: np.bg || 'transparent', padding: `${(np.bg ? np.size * 0.55 : np.size * 0.15) * z}px`
    });
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

  /** What a mark made by the Play tool carries: its `play`, and the marker brush that goes with it. */
  playExtraFor(role, play) {
    const d = this.getDefaults(role);
    return { play, realize: realizeAfter({ role, realize: structuredClone(d.realize || DEFAULT_REALIZE[role]) }, play) };
  }

  commitNew(role, points, extra = {}, dkey = role) {
    const pn = this.playNew; this.playNew = null;   // (set by the Play tool for the mark being drawn)
    if (pn?.play && !extra.play) extra = { ...this.playExtraFor(role, pn.play), ...extra };
    const d = this.getDefaults(dkey);
    const stage = this.getStage();
    const e = this.store.addElement({
      role, stage: stage.id, points, realize: structuredClone(d.realize || DEFAULT_REALIZE[role]),
      color: d.color || null, ...(d.fill ? { fill: d.fill } : {}), why: d.why || '', by: { kind: 'user', name: 'you' },
      ...(d.opacity < 1 ? { opacity: d.opacity } : {}), ...(d.blend && d.blend !== 'normal' ? { blend: d.blend } : {}), ...(d.path === 'straight' ? { path: 'straight' } : {}),
      ...(role === 'note' ? { note: structuredClone(d.note || {}) } : {}), ...extra
    });
    if (d.sticky === false || role === 'note') this.onTool?.('select');
    this.select([e.id]);
    if (pn?.after) this.onPlayAfter?.(e, pn.after);
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
    this.canvas.style.cursor = this.space || t === 'hand' ? 'grab' : t === 'select' || t === 'direct' ? 'default' : t === 'note' ? 'text' : t === 'sculpt' ? 'none' : 'crosshair';
  }

  /** PNG of the artboard as currently shown (picture or process view). */
  snapshot(mode = this.viewMode(), scale = 1, board = MAIN) {
    const c = document.createElement('canvas');
    const doc = boardDoc(this.store.doc, board);
    const { width, height } = doc.artboard;
    c.width = Math.round(width * scale); c.height = Math.round(height * scale);
    renderDocument(c.getContext('2d'), doc, { mode, upTo: this.upTo, transform: { x: 0, y: 0, scale }, now: Date.now() });
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
