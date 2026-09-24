/**
 * Watercolor layer for continuous mode.
 *
 * A full p5.brush repaint of ~150 shapes takes about a second, far too slow to
 * redraw every frame. Instead each stroke is painted once, when it is born
 * (~5 ms), onto p5.brush's canvas, which keeps its paint between calls; old
 * paint fades under a thin wash of paper colour every `washEvery` seconds, set
 * so a stroke keeps `retention` of its strength after one full cycle. If
 * something else painted with p5.brush meanwhile (the studio's watercolor
 * medium), the canvas was discarded, so the layer repaints the living shapes.
 *
 * Shared by the studio's live preview and the p5.js export (embedded with
 * import/export lines stripped; keep the import on one line).
 */
import { paintWatercolor, lastWatercolorCanvas } from '../media/watercolorBrush.js';

export class WatercolorLayer {
  constructor(brush, { size = 1024, seed = 42 } = {}) {
    this.brush = brush;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.seed = seed;
    this.painted = 0;      // id of the newest stroke already on the paper
    this.sinceWash = 0;
    this.washEvery = 0.5;
    this.background = null;
  }

  /** Paint these shapes as actions on top of the current paper. */
  paintShapes(shapes, opacity = 0.9) {
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

  draw(ctx, x, y, side) {
    ctx.drawImage(this.canvas, x, y, side, side);
  }
}

/** Fade out (0–0.5) → how much of a stroke survives one cycle. */
export function retentionFor(fadeOut) {
  return 0.03 + (fadeOut || 0) * 0.6;
}
