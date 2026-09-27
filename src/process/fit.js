/**
 * fit(): redraw a source as marks, by greedy shape fitting (the classic Reference Fitter, after
 * Fogleman's primitive). Each shape becomes a plane mark: rectangles and triangles straight, circles
 * smooth. Run once it is a study of the source; with live: true and a board that follows its sources
 * it is the continuous redraw: the shapes are kept, and each new frame replaces the oldest few.
 */
import { ReferenceFitter } from '../fitting/fitReference.js';
import { streamState } from './streams.js';

const SIDE = 128;   // fitting resolution (long side)

/** Shapes (the fitter's -1..1 space on a w×h grid) → closed point lists in fractions of the board. */
export function shapeToFractions(s, w, h) {
  const fx = x => (x + 1) / 2, fy = y => (y + 1) / 2, px = d => d * 0.5 * Math.min(w, h);
  if (s.type === 'rect') {
    const hw = px(s.width) / 2 / w, hh = px(s.height) / 2 / h, cx = fx(s.x), cy = fy(s.y);
    return { points: [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]], straight: true };
  }
  if (s.type === 'circle') {
    const r = Math.max(0.5, px(s.diameter) / 2), cx = fx(s.x), cy = fy(s.y);
    return { points: Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return [cx + Math.cos(a) * r / w, cy + Math.sin(a) * r / h]; }), straight: false };
  }
  return { points: s.points.map(([x, y]) => [fx(x), fy(y)]), straight: true };
}

/**
 * Fit `sampler` (from source()) with `shapes` shapes on a board of aspect `aspect` (width / height).
 * Returns { background, shapes: [{ points, straight, color }] } in fractions of the board.
 * opts: { shapes = 80, kinds = ['rect', 'triangle', 'circle'], seed = 1, live = false, turnover = 0.08, key }
 */
export function fitSource(sampler, aspect, { shapes = 80, kinds = ['rect', 'triangle', 'circle'], seed = 1, live = false, turnover = 0.08, key = 'fit' } = {}) {
  const w = aspect >= 1 ? SIDE : Math.max(8, Math.round(SIDE * aspect)), h = aspect >= 1 ? Math.max(8, Math.round(SIDE / aspect)) : SIDE;
  const st = streamState(key);
  const same = st.fitter && st.w === w && st.h === h && st.shapesWanted === shapes && st.kinds === kinds.join() && st.source === sampler.name;
  if (same && st.frame === sampler.frame) return st.result;   // nothing new: the same marks
  const target = sampler.pixels(w, h);
  if (same && live) {
    // Continuous: the new frame is the target; the oldest shapes give way to a few new ones.
    st.fitter.target = target;
    const k = Math.max(1, Math.round(shapes * turnover));
    st.fitter.shapes.splice(0, Math.max(0, st.fitter.shapes.length + k - shapes));
    for (let i = 0; i < k; i++) if (!st.fitter.step()) break;
  } else {
    st.fitter = new ReferenceFitter(target, w, h, { seed, shapes: kinds, trials: 48, climbs: 64 });
    for (let i = 0; i < shapes; i++) if (!st.fitter.step()) break;
    Object.assign(st, { w, h, shapesWanted: shapes, kinds: kinds.join(), source: sampler.name });
  }
  st.frame = sampler.frame;
  const mean = [0, 0, 0];
  for (let i = 0; i < target.length; i += 3) { mean[0] += target[i]; mean[1] += target[i + 1]; mean[2] += target[i + 2]; }
  const n = target.length / 3;
  const background = `#${mean.map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
  // Kept on the board: points clamped to it (exact for rectangles, close for the rest).
  const clamp = v => Math.max(0, Math.min(1, v));
  st.result = { background, shapes: st.fitter.shapes.map(s => { const f = shapeToFractions(s, w, h); return { ...f, points: f.points.map(([x, y]) => [clamp(x), clamp(y)]), color: s.color }; }) };
  return st.result;
}
