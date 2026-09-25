/**
 * Watercolor layer for continuous mode.
 *
 * A full p5.brush repaint of ~150 shapes takes about a second, far too slow to
 * redraw every frame. Instead each stroke is painted once, when it is born
 * (~5 ms), onto p5.brush's canvas, which keeps its paint between calls; old
 * paint fades under a thin wash of paper color every `washEvery` seconds, set
 * so a stroke keeps `retention` of its strength after one full cycle. If
 * something else painted with p5.brush meanwhile (the studio's watercolor
 * medium), the canvas was discarded, so the layer repaints the living shapes.
 *
 * Shared by the studio's live preview and the p5.js export (embedded with
 * import/export lines stripped; keep the import on one line).
 */
import { paintWatercolor, lastWatercolorCanvas } from '../media/watercolorBrush.js';

export class WatercolorLayer {
  constructor(brush, { width = 1024, height = 1024, seed = 42 } = {}) {
    this.brush = brush;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.seed = seed;
    this.painted = 0;      // id of the newest stroke already on the paper
    this.sinceWash = 0;
    this.washEvery = 0.5;
    this.background = null;
  }

  /** Paint these shapes as actions on top of the current paper. */
  paintShapes(shapes, opacity = this.opacity ?? 0.9) {
    const actions = [{ op: 'noStroke' }];
    for (const s of shapes) {
      const sh = s.shape;
      actions.push({ op: 'fill', color: s.color, opacity });
      if (sh.type === 'rect') actions.push({ op: 'rect', x: sh.x, y: sh.y, width: sh.width, height: sh.height });
      else if (sh.type === 'circle') actions.push({ op: 'circle', x: sh.x, y: sh.y, diameter: sh.diameter });
      else actions.push({ op: 'polygon', points: sh.points });
    }
    paintWatercolor(this.brush, this.canvas, actions, { clear: false, load: false, seed: this.seed });
  }

  /** Start fresh paper and paint everything currently alive, oldest first. */
  reset(cf, now) {
    this.background = cf.background;
    paintWatercolor(this.brush, this.canvas, [{ op: 'background', color: cf.background }], { seed: this.seed });
    const visible = cf.alive.filter(s => cf.alpha(s, now) > 0);
    if (visible.length) this.paintShapes(visible);
    this.painted = cf.nextId - 1;
    this.sinceWash = 0;
  }

  /** Paint strokes born since the last call, and wash when due. */
  update(cf, now, dt, retention = 0.1) {
    if (this.background !== cf.background || lastWatercolorCanvas() !== this.canvas) return this.reset(cf, now);
    const fresh = cf.alive.filter(s => s.id > this.painted);
    if (fresh.length) {
      this.paintShapes(fresh);
      this.painted = fresh[fresh.length - 1].id;
    }
    this.sinceWash += dt;
    if (this.sinceWash >= this.washEvery) {
      const washesPerCycle = Math.max(1, cf.lifetime / this.sinceWash);
      const alpha = 1 - Math.pow(Math.max(0.001, retention), 1 / washesPerCycle);
      paintWatercolor(this.brush, this.canvas, [
        { op: 'noStroke' },
        { op: 'brush.bleed', amount: 0 },
        { op: 'brush.texture', amount: 0 },
        { op: 'fill', color: cf.background, opacity: Math.min(1, alpha) },
        { op: 'rect', x: 0, y: 0, width: 2.2, height: 2.2 }
      ], { clear: false, load: false, seed: this.seed });
      this.sinceWash = 0;
    }
  }

  draw(ctx, x, y, w, h) {
    ctx.drawImage(this.canvas, x, y, w, h);
  }
}

/** Fade out (0–0.5) → how much of a stroke survives one cycle. */
export function retentionFor(fadeOut) {
  return 0.03 + (fadeOut || 0) * 0.6;
}

/**
 * Watercolor sprites: true per-stroke fades.
 *
 * p5.brush cannot fade one stroke inside its canvas, so each stroke is painted
 * once on white paper and once on black with the same seed (p5.brush output
 * is deterministic per seed), and the pair gives exact per-pixel opacity and
 * color: alpha = 1 - (white - black), color = black / alpha. The result is
 * cached as a small image covering the stroke's bounds plus a bleed margin,
 * and every frame draws the paper and then each living stroke at its current
 * opacity, the same envelope the flat renderer uses.
 */
export class WatercolorSprites {
  constructor(brush, { width = 1024, height = 1024, seed = 42, budgetMs = 12 } = {}) {
    this.brush = brush;
    this.w = width;
    this.h = height;
    this.seed = seed;
    this.budgetMs = budgetMs; // sprite-building time per frame
    this.pending = 0;         // living strokes still waiting for a sprite
    this.scratch = document.createElement('canvas');
    this.scratch.width = width;
    this.scratch.height = height;
    this.read = document.createElement('canvas');
    this.read.width = width;
    this.read.height = height;
    this.readCtx = this.read.getContext('2d', { willReadFrequently: true });
    this.sprites = new Map(); // stroke id -> { canvas, x, y }
    this.opacity = 1;   // fill opacity passed to p5.brush for new strokes
    this.pigment = 0.6; // 0 = color as p5.brush paints it on white, 1 = the stroke's fitted color
    this.paper = null;
    this.background = null;
  }

  /** Pixel bounds of a shape, padded for bleed. */
  bounds(sh) {
    const W = this.w, H = this.h, m = Math.min(W, H);
    const X = v => (v + 1) * 0.5 * W, Y = v => (v + 1) * 0.5 * H, S = v => v * 0.5 * m;
    let x0, y0, x1, y1, size;
    if (sh.type === 'rect') {
      const w = S(sh.width), h = S(sh.height);
      x0 = X(sh.x) - w / 2; x1 = x0 + w; y0 = Y(sh.y) - h / 2; y1 = y0 + h; size = Math.max(w, h);
    } else if (sh.type === 'circle') {
      const r = S(sh.diameter) / 2;
      x0 = X(sh.x) - r; x1 = X(sh.x) + r; y0 = Y(sh.y) - r; y1 = Y(sh.y) + r; size = 2 * r;
    } else {
      const xs = sh.points.map(p => X(p[0])), ys = sh.points.map(p => Y(p[1]));
      x0 = Math.min(...xs); x1 = Math.max(...xs); y0 = Math.min(...ys); y1 = Math.max(...ys);
      size = Math.max(x1 - x0, y1 - y0);
    }
    const pad = 0.2 * size + 0.02 * m;
    const bx = Math.max(0, Math.floor(x0 - pad)), by = Math.max(0, Math.floor(y0 - pad));
    const bw = Math.min(W, Math.ceil(x1 + pad)) - bx, bh = Math.min(H, Math.ceil(y1 + pad)) - by;
    return bw > 0 && bh > 0 ? { bx, by, bw, bh } : null;
  }

  /** Paint `actions` on a flat ground of `paper` and read back the region `r`. */
  pass(paper, actions, seed, r) {
    paintWatercolor(this.brush, this.scratch, [{ op: 'background', color: paper }, ...actions], { seed });
    this.readCtx.clearRect(r.bx, r.by, r.bw, r.bh);
    this.readCtx.drawImage(this.scratch, r.bx, r.by, r.bw, r.bh, r.bx, r.by, r.bw, r.bh);
    return this.readCtx.getImageData(r.bx, r.by, r.bw, r.bh).data;
  }

  build(s) {
    const r = this.bounds(s.shape);
    if (!r) return null;
    const sh = s.shape;
    const shapeAction = sh.type === 'rect' ? { op: 'rect', x: sh.x, y: sh.y, width: sh.width, height: sh.height }
      : sh.type === 'circle' ? { op: 'circle', x: sh.x, y: sh.y, diameter: sh.diameter }
      : { op: 'polygon', points: sh.points };
    const actions = [{ op: 'noStroke' }, { op: 'fill', color: s.color, opacity: this.opacity }, shapeAction];
    const seed = this.seed * 7919 + s.id;
    const white = this.pass('#ffffff', actions, seed, r);
    const black = this.pass('#000000', actions, seed, r);
    const out = new ImageData(r.bw, r.bh);
    const d = out.data;
    // p5.brush paints a pale, translucent wash of the fill color; Pigment pulls the
    // recovered color back toward the fitted color while keeping the brush texture.
    const k = Math.min(1, Math.max(0, this.pigment));
    const [fr, fg, fb] = s.rgb;
    for (let i = 0; i < d.length; i += 4) {
      const a = 1 - ((white[i] - black[i]) + (white[i + 1] - black[i + 1]) + (white[i + 2] - black[i + 2])) / 765;
      if (a <= 0.01) continue;
      d[i] = Math.min(255, black[i] / a) * (1 - k) + fr * k;
      d[i + 1] = Math.min(255, black[i + 1] / a) * (1 - k) + fg * k;
      d[i + 2] = Math.min(255, black[i + 2] / a) * (1 - k) + fb * k;
      d[i + 3] = Math.round(Math.min(1, a) * 255);
    }
    const canvas = document.createElement('canvas');
    canvas.width = r.bw;
    canvas.height = r.bh;
    canvas.getContext('2d').putImageData(out, 0, 0);
    return { canvas, x: r.bx, y: r.by };
  }

  /** Paper texture in the ground color; repainted only when that color moves noticeably. */
  ensurePaper(cf) {
    if (this.paper && this.background) {
      const a = [1, 3, 5].map(i => parseInt(this.background.slice(i, i + 2), 16));
      const b = cf.bgRGB;
      if (a.every((v, i) => Math.abs(v - b[i]) <= 6)) return;
    }
    this.background = cf.background;
    paintWatercolor(this.brush, this.scratch, [{ op: 'background', color: cf.background }], { seed: this.seed });
    this.paper = document.createElement('canvas');
    this.paper.width = this.w;
    this.paper.height = this.h;
    this.paper.getContext('2d').drawImage(this.scratch, 0, 0);
  }

  /**
   * Build sprites for new strokes, newest first, within a per-frame time budget,
   * and drop sprites of dead strokes. A stroke whose sprite arrives late is
   * re-timed to start its life now, so it still gets its whole fade-in.
   */
  update(cf, now) {
    this.ensurePaper(cf);
    const aliveIds = new Set(cf.alive.map(s => s.id));
    for (const id of this.sprites.keys()) if (!aliveIds.has(id)) this.sprites.delete(id);
    const waiting = cf.alive.filter(s => !this.sprites.has(s.id)).sort((a, b) => b.born - a.born);
    const t0 = performance.now();
    let built = 0;
    for (const s of waiting) {
      if (built > 0 && performance.now() - t0 > this.budgetMs) break;
      this.sprites.set(s.id, this.build(s));
      if (now !== undefined && now > s.born) s.born = now; // late sprite: begin its fade-in now
      built++;
    }
    this.pending = waiting.length - built;
  }

  draw(ctx, x, y, w, h, cf, now, { ground = true } = {}) {
    const kx = w / this.w, ky = h / this.h;
    ctx.save();
    if (ground && this.paper) ctx.drawImage(this.paper, x, y, w, h);
    for (const s of cf.alive) {
      const sp = this.sprites.get(s.id);
      if (!sp) continue;
      const a = cf.alpha(s, now);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(sp.canvas, x + sp.x * kx, y + sp.y * ky, sp.canvas.width * kx, sp.canvas.height * ky);
    }
    ctx.restore();
  }
}
