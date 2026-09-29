/**
 * Time envelopes: how a mark (or anything) changes over its life. A mark has a birth time and an
 * optional time spec; at any moment its age gives an opacity, and a share of its stroke drawn.
 *
 *   { in, hold, out, life, draw, curve, loop }        all in seconds
 *
 *   in      fade in over this long (0: at once)
 *   hold    stay fully there this long after that (default: until the fade out starts)
 *   out     fade out over this long, then the mark is gone
 *   life    the whole life: the fade out ends there (hold follows); with none, and an out, it is
 *           in + hold + out; with no out, the mark stays for ever
 *   draw    the stroke draws itself over this long (a line grows from its start)
 *   curve   'smooth' (default), 'linear', 'ease-in', 'ease-out'
 *   loop    start again when it ends
 *
 * A number stands for { out: n }: fade out over n seconds. Used by the renderer (opacity and
 * reveal per mark), by brushes (k.age, k.envelope) and by board code (line(…, { time: {…} })).
 */
const CURVES = {
  linear: t => t,
  smooth: t => t * t * (3 - 2 * t),
  'ease-in': t => t * t,
  'ease-out': t => 1 - (1 - t) * (1 - t)
};
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

/** A time spec in its full form (numbers, seconds), or null when there is none. */
export function normalizeTime(spec) {
  if (spec == null || spec === false) return null;
  if (typeof spec === 'number') return spec > 0 ? { in: 0, out: spec, curve: 'smooth' } : null;
  if (typeof spec !== 'object') return null;
  const t = { in: Math.max(0, num(spec.in)), curve: CURVES[spec.curve] ? spec.curve : 'smooth' };
  if (spec.out !== undefined) t.out = Math.max(0, num(spec.out));
  if (spec.hold !== undefined) t.hold = Math.max(0, num(spec.hold));
  if (spec.life !== undefined && num(spec.life) > 0) t.life = num(spec.life);
  if (spec.draw !== undefined && num(spec.draw) > 0) t.draw = num(spec.draw);
  if (spec.loop) t.loop = true;
  return t;
}

/** Seconds the mark lasts, or Infinity when it never fades out. */
export function lifeOf(spec) {
  const t = normalizeTime(spec);
  if (!t) return Infinity;
  if (t.life !== undefined) return t.life;
  if (t.out === undefined) return Infinity;
  return t.in + (t.hold ?? 0) + t.out;
}

/** Opacity (0..1) at an age in seconds. */
export function envelope(spec, age) {
  const t = normalizeTime(spec);
  if (!t) return 1;
  const life = lifeOf(t);
  if (t.loop && Number.isFinite(life) && life > 0) age = ((age % life) + life) % life;
  if (age < 0) return 0;
  const ease = CURVES[t.curve];
  let a = t.in > 0 ? ease(clamp01(age / t.in)) : 1;
  if (t.out !== undefined && Number.isFinite(life)) {
    const outStart = life - t.out;
    if (age >= life) return 0;
    if (age > outStart && t.out > 0) a *= 1 - ease(clamp01((age - outStart) / t.out));
  }
  return a;
}

/** How much of the stroke is drawn (0..1) at an age: 1 without a draw time. */
export function reveal(spec, age) {
  const t = normalizeTime(spec);
  if (!t || !t.draw) return 1;
  return CURVES[t.curve](clamp01(age / t.draw));
}

/** Is the mark gone at this age (past its life, and not looping)? */
export const expired = (spec, age) => { const t = normalizeTime(spec); return Boolean(t) && !t.loop && age >= lifeOf(t); };

/** Does anything about this mark still change at this age (fading, drawing, or looping)? */
export function changing(spec, age) {
  const t = normalizeTime(spec);
  if (!t) return false;
  if (t.loop) return true;
  if (age < t.in) return true;
  if (t.draw && age < t.draw) return true;
  const life = lifeOf(t);
  return Number.isFinite(life) && age < life;
}

/** The first `share` of a polyline by length (a stroke being drawn). */
export function cutPath(points, share) {
  if (share >= 1 || points.length < 2) return points;
  if (share <= 0) return points.slice(0, 1);
  const len = [0];
  for (let i = 1; i < points.length; i++) len.push(len[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const target = len[len.length - 1] * share;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (len[i] <= target) { out.push(points[i]); continue; }
    const u = (target - len[i - 1]) / ((len[i] - len[i - 1]) || 1), a = points[i - 1], b = points[i];
    if (u <= 1e-9) break;   // (it ended exactly on the last point)
    out.push(a.map((v, j) => v + (b[j] - v) * u));
    break;
  }
  return out;
}
