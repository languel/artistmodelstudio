/**
 * Fitting a frame, with no DOM: used by the fit worker (in the background) and directly where there
 * are no workers (tests). Two qualities:
 *
 *   fine   the Reference Fitter: a 128-cell grid, rectangles, triangles and circles, each shape the
 *          best of random tries then refined by small changes (hill climbing). Better per shape.
 *   fast   a 64-cell grid, rectangles and circles, each shape the best of random tries. About ten
 *          times cheaper; the same fitter as the p5 export's fit(), so a board and its sketch match.
 *
 * fitFrame(state, job) → { background, shapes: [{ points, straight, color }] } in fractions of the
 * board. `state` carries the fitter from frame to frame (live: the oldest shapes give way).
 */
import { ReferenceFitter, toHex } from './fitReference.js';

export const FIT_SIDE = { fine: 128, fast: 64 };

/** The grid a fit compares on, for a board of this aspect (width / height). */
export function fitGrid(aspect, quality = 'fine') {
  const side = FIT_SIDE[quality] || FIT_SIDE.fine;
  return aspect >= 1 ? { w: side, h: Math.max(8, Math.round(side / aspect)) } : { w: Math.max(8, Math.round(side * aspect)), h: side };
}

/** Reference Fitter shapes (its -1..1 space on a w×h grid) → closed point lists in fractions. */
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

// ---- fast: the best of random tries -------------------------------------------------------

function fastFit(st, target, w, h, { shapes: n, live, turnover, tries = 40, seed = 1 }) {
  let r = st.rand || (st.rand = mulberry(seed));
  const cells = sh => {
    const out = [];
    if (sh.kind === 'rect') { for (let y = sh.y0; y < sh.y1; y++) for (let x = sh.x0; x < sh.x1; x++) out.push(y * w + x); }
    else for (let y = Math.max(0, Math.ceil(sh.cy - sh.r)); y <= Math.min(h - 1, sh.cy + sh.r); y++)
      for (let x = Math.max(0, Math.ceil(sh.cx - sh.r)); x <= Math.min(w - 1, sh.cx + sh.r); x++)
        if ((x - sh.cx) ** 2 + (y - sh.cy) ** 2 <= sh.r ** 2) out.push(y * w + x);
    return out;
  };
  const colorOf = cs => { const c = [0, 0, 0]; for (const j of cs) { c[0] += target[j * 3]; c[1] += target[j * 3 + 1]; c[2] += target[j * 3 + 2]; } const k = Math.max(1, cs.length); return [c[0] / k, c[1] / k, c[2] / k]; };
  const gain = (img, cs, c) => { let g = 0; for (const j of cs) for (let k = 0; k < 3; k++) { const t = target[j * 3 + k]; g += (img[j * 3 + k] - t) ** 2 - (c[k] - t) ** 2; } return g; };
  const paint = (img, cs, c) => { for (const j of cs) { img[j * 3] = c[0]; img[j * 3 + 1] = c[1]; img[j * 3 + 2] = c[2]; } };
  const side = Math.max(w, h);
  const tryShape = () => {
    const size = 2 + r() * side / 3;
    if (r() < 0.5) {
      const x0 = Math.floor(r() * w), y0 = Math.floor(r() * h);
      return { kind: 'rect', x0, y0, x1: Math.min(w, x0 + 1 + Math.floor(r() * size)), y1: Math.min(h, y0 + 1 + Math.floor(r() * size)) };
    }
    return { kind: 'circle', cx: r() * w, cy: r() * h, r: 1 + r() * size / 2 };
  };
  const all = []; for (let j = 0; j < w * h; j++) all.push(j);
  const ground = colorOf(all);
  const img = new Float32Array(w * h * 3);
  for (let j = 0; j < w * h; j++) paint(img, [j], ground);
  let kept = live && st.fast && st.w === w && st.h === h ? st.fast : [];
  kept = kept.slice(kept.length >= n ? Math.min(kept.length, turnover) : 0);
  for (const sh of kept) { const cs = cells(sh); sh.c = colorOf(cs); paint(img, cs, sh.c); }
  while (kept.length < n) {
    let best = null;
    for (let i = 0; i < tries; i++) {
      const sh = tryShape(), cs = cells(sh);
      if (!cs.length) continue;
      const c = colorOf(cs), g = gain(img, cs, c);
      if (!best || g > best.g) best = { sh, cs, c, g };
    }
    if (!best || best.g <= 0) break;
    best.sh.c = best.c; paint(img, best.cs, best.c); kept.push(best.sh);
  }
  Object.assign(st, { fast: kept, w, h });
  const shapes = kept.map(sh => (sh.kind === 'rect'
    ? { points: [[sh.x0 / w, sh.y0 / h], [sh.x1 / w, sh.y0 / h], [sh.x1 / w, sh.y1 / h], [sh.x0 / w, sh.y1 / h]], straight: true, color: toHex(sh.c) }
    : { points: Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return [(sh.cx + sh.r * Math.cos(a)) / w, (sh.cy + sh.r * Math.sin(a)) / h]; }), straight: false, color: toHex(sh.c) }));
  return { background: toHex(ground), shapes };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- one frame --------------------------------------------------------------------------

/**
 * job: { target (Float32Array rgb, w×h), w, h, shapes, kinds, seed, live, turnover, quality, sig }.
 * A change of sig (grid, shape count, kinds, source, quality) starts the fit again.
 */
export function fitFrame(st, { target, w, h, shapes = 80, kinds = ['rect', 'triangle', 'circle'], seed = 1, live = false, turnover = 0.08, quality = 'fine', sig = '' }) {
  const fresh = st.sig !== sig;
  if (fresh) { for (const k of Object.keys(st)) delete st[k]; st.sig = sig; }
  const k = Math.max(1, Math.round(shapes * turnover));
  let result;
  if (quality === 'fast') result = fastFit(st, target, w, h, { shapes, live: live && !fresh, turnover: k, seed });
  else {
    if (st.fitter && live) {
      // Continuous: the new frame is the target; the oldest shapes give way to a few new ones.
      st.fitter.target = target;
      st.fitter.shapes.splice(0, Math.max(0, st.fitter.shapes.length + k - shapes));
      for (let i = 0; i < k; i++) if (!st.fitter.step()) break;
    } else {
      st.fitter = new ReferenceFitter(target, w, h, { seed, shapes: kinds, trials: 48, climbs: 64 });
      for (let i = 0; i < shapes; i++) if (!st.fitter.step()) break;
    }
    const mean = [0, 0, 0];
    for (let i = 0; i < target.length; i += 3) { mean[0] += target[i]; mean[1] += target[i + 1]; mean[2] += target[i + 2]; }
    const n = target.length / 3;
    result = { background: toHex(mean.map(v => v / n)), shapes: st.fitter.shapes.map(s => ({ ...shapeToFractions(s, w, h), color: s.color })) };
  }
  // Kept on the board: points clamped to it (exact for rectangles, close for the rest).
  const clamp = v => Math.max(0, Math.min(1, v));
  for (const s of result.shapes) s.points = s.points.map(([x, y]) => [clamp(x), clamp(y)]);
  return result;
}
