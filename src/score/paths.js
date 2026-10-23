/**
 * Paths: a line a traveler can follow. Points are [x, y, t, p] as in the process document
 * (t = milliseconds from the start of the gesture, p = pressure 0..1); t and p may be missing.
 *
 *   makePath(points, { closed })  → { pts, cum, length, closed, drawn }
 *   sample(path, u)               → { x, y, tx, ty, p, t }   u in 0..1 by arc length
 *   sampleDrawn(path, ms)         → the same, by the time the hand took (replays the walk as drawn)
 *
 * Pure: no DOM, no clock.
 */
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

export function makePath(points, { closed = false } = {}) {
  const pts = (points || []).map(q => ({ x: num(q[0]), y: num(q[1]), t: q[2] == null ? null : num(q[2]), p: q[3] == null ? null : num(q[3]) }));
  if (closed && pts.length > 2) pts.push({ ...pts[0], t: null });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const length = cum[cum.length - 1] || 0;
  // A recorded walk: every point has a time and they never go back.
  const drawn = !closed && pts.length > 1 && pts.every((q, i) => q.t != null && (i === 0 || q.t >= pts[i - 1].t)) && pts[pts.length - 1].t > pts[0].t;
  return { pts, cum, length, closed, drawn };
}

/** Index i of the segment [i, i+1] holding arc length s (binary search). */
function segmentAt(cum, s) {
  let lo = 0, hi = cum.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= s) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function at(path, i, f) {
  const a = path.pts[i], b = path.pts[i + 1];
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const mix = (m, n) => (m == null || n == null ? (m ?? n) : m + (n - m) * f);
  return { x: a.x + dx * f, y: a.y + dy * f, tx: dx / d, ty: dy / d, p: mix(a.p, b.p), t: mix(a.t, b.t) };
}

/** The place at u (0..1 by arc length), with the direction of travel, pressure and recorded time. */
export function sample(path, u) {
  const n = path.pts.length;
  if (n === 0) return { x: 0, y: 0, tx: 1, ty: 0, p: null, t: null };
  if (n === 1) return { x: path.pts[0].x, y: path.pts[0].y, tx: 1, ty: 0, p: path.pts[0].p, t: path.pts[0].t };
  const s = Math.min(1, Math.max(0, num(u))) * path.length;
  const i = segmentAt(path.cum, s);
  const len = path.cum[i + 1] - path.cum[i];
  return at(path, i, len > 0 ? (s - path.cum[i]) / len : 0);
}

/** A recorded walk, at ms after its start. */
export function sampleDrawn(path, ms) {
  const n = path.pts.length;
  if (n < 2) return sample(path, 0);
  const t0 = path.pts[0].t, t1 = path.pts[n - 1].t;
  const m = Math.min(t1, Math.max(t0, num(ms) + t0));
  let lo = 0, hi = n - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path.pts[mid].t <= m) lo = mid; else hi = mid - 1;
  }
  const a = path.pts[lo].t, b = path.pts[lo + 1].t;
  return at(path, lo, b > a ? (m - a) / (b - a) : 0);
}

/** How long the recorded walk took, in seconds. */
export const drawnDuration = path => (path.drawn ? (path.pts[path.pts.length - 1].t - path.pts[0].t) / 1000 : 0);
