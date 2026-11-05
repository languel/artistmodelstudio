/**
 * The Timeline's view: how much time a pixel is (pps, pixels a second) and where the view starts
 * (`left`, the lanes' scrollLeft, in px). Zooming keeps a point in place (the pointer, the
 * playhead); fitting frames a range (the whole take, the loop range, a clip) with a margin each side.
 * Pure functions, so the panel and the tests share them.
 */

/** The closest and farthest zoom: 1 px is 100 s at most, a frame at 30 fps is about 130 px at least. */
export const MIN_PPS = 0.01;
export const MAX_PPS = 4000;
/** The lanes are never drawn wider than this (browsers stop laying out boxes much past it). */
export const MAX_CONTENT_PX = 8e6;

/** The zoom (pps) clamped for a timeline `durMs` long. */
export function clampPps(pps, durMs = 0) {
  const hi = Math.max(MIN_PPS, Math.min(MAX_PPS, MAX_CONTENT_PX / Math.max(1, durMs / 1000 + 1)));
  return Math.max(MIN_PPS, Math.min(hi, Number(pps) || 60));
}

/** The time range (ms) a view shows, `width` px wide. */
export const visibleRange = ({ pps, left }, width) => [(left / pps) * 1000, ((left + width) / pps) * 1000];

/**
 * Zoom by `factor` about `anchorPx` (px from the view's left edge): the time under it stays under it.
 * Returns the new { pps, left }.
 */
export function zoomAt({ pps, left }, factor, anchorPx, durMs = 0) {
  const t = (left + anchorPx) / pps;                // seconds under the anchor
  const next = clampPps(pps * factor, durMs);
  return { pps: next, left: Math.max(0, t * next - anchorPx) };
}

/**
 * The view that shows [loMs, hiMs] in `width` px, with a margin each side (a fraction of the width,
 * at least `minPadPx`). A range of nothing (a point) is shown at the zoom it would have at `minMs`.
 */
export function fitRange(loMs, hiMs, width, { pad = 0.04, minPadPx = 16, minMs = 200, durMs = 0 } = {}) {
  const lo = Math.max(0, Math.min(loMs, hiMs)), hi = Math.max(loMs, hiMs);
  const w = Math.max(40, width);
  const padPx = Math.min(w / 4, Math.max(minPadPx, w * pad));
  const span = Math.max(minMs, hi - lo) / 1000;
  const pps = clampPps((w - 2 * padPx) / span, durMs);
  // Centred: the margins are equal, and a range the clamp made narrower than the view sits in its middle.
  return { pps, left: Math.max(0, ((lo + hi) / 2000) * pps - w / 2) };
}

/** The view moved so that `ms` is in it (unchanged if it is), `margin` px from the edge it came in by. */
export function reveal({ pps, left }, ms, width, margin = 40) {
  const x = (ms / 1000) * pps;
  if (x < left + margin) return { pps, left: Math.max(0, x - margin) };
  if (x > left + width - margin) return { pps, left: Math.max(0, x - width + margin) };
  return { pps, left };
}

/** The view centred on `ms`. */
export const centerOn = ({ pps }, ms, width) => ({ pps, left: Math.max(0, (ms / 1000) * pps - width / 2) });

// ---- the ruler in minutes and seconds ---------------------------------------------------------

/** Labelled steps of the time ruler (s), each with how many minor ticks it splits into. */
const TIME_STEPS = [[0.01, 2], [0.02, 2], [0.05, 5], [0.1, 2], [0.2, 2], [0.5, 5], [1, 2], [2, 2], [5, 5], [10, 2], [15, 3], [30, 3], [60, 2], [120, 2], [300, 5], [600, 2], [900, 3], [1800, 3], [3600, 2], [7200, 2], [14400, 4]];

/** The first [step, minors] of `steps` that leaves `minPx` between labels at `pps`. */
const pick = (steps, pps, minPx) => steps.find(([s]) => s * pps >= minPx) || steps[steps.length - 1];

/** The labelled step (s) of the time ruler. */
export const rulerStep = (pps, minPx = 64) => pick(TIME_STEPS, pps, minPx)[0];

/** Ticks over [t0, t1] (s) for a labelled step split into n: { time, major } (majors are labelled). */
function ticksOver(step, n, t0, t1) {
  const minor = step / n, out = [];
  const i0 = Math.max(0, Math.floor(t0 / minor - 1e-9));
  for (let i = i0; i * minor <= t1 + 1e-9 && out.length < 4000; i++) out.push({ time: Number((i * minor).toFixed(9)), major: i % n === 0 });
  return out;
}

/** Labelled steps of the frames ruler, in frames, each split into minor ticks of whole frames. */
const FRAME_STEPS = fps => {
  const counts = [1, 2, 5, 10, Math.round(fps / 2), fps, 2 * fps, 5 * fps, 10 * fps, 30 * fps, 60 * fps, 300 * fps, 600 * fps, 1800 * fps, 3600 * fps]
    .filter((f, i, a) => i === 0 || f > a[i - 1]);
  // (the most ticks that are whole frames: a second at 30 fps in 3 or 5, at 24 in 4)
  const split = f => (f === 1 ? 1 : [5, 4, 3, 2].find(n => f % n === 0 && f / n >= 1) || 1);
  return counts.map(f => [f / fps, split(f)]);
};
const BEAT_STEPS = (beat, bar, num) => [[beat / 4, 1], [beat / 2, 2], [beat, 4], [bar, num], [bar * 2, 2], [bar * 4, 4], [bar * 8, 2], [bar * 16, 4], [bar * 32, 2], [bar * 64, 4], [bar * 128, 2]];
const meter = ({ tempo = 120, signature = { numerator: 4, denominator: 4 } } = {}) => { const beat = (60 / tempo) * (4 / signature.denominator); return { beat, bar: beat * signature.numerator, num: signature.numerator }; };

/**
 * The ruler's division at a zoom: [labelled step (s), minor ticks in it]. `st` is the scene's
 * transport ({ ruler: 'time' | 'frames' | 'beats', fps, tempo, signature }).
 */
export function rulerDivision(st, pps, minPx) {
  if (st.ruler === 'frames') return pick(FRAME_STEPS(st.fps || 30), pps, minPx ?? 44);
  if (st.ruler === 'beats') { const m = meter(st); return pick(BEAT_STEPS(m.beat, m.bar, m.num), pps, minPx ?? 44); }
  return pick(TIME_STEPS, pps, minPx ?? 64);
}

/** The ruler's ticks over [t0, t1] (s): { step, ticks: [{ time, major }] } (majors are labelled). */
export function rulerTicks(st, t0, t1, pps) {
  const [step, n] = rulerDivision(st, pps);
  return { step, ticks: ticksOver(step, n, t0, t1) };
}
export const timeTicks = (t0, t1, pps, minPx = 64) => { const [step, n] = pick(TIME_STEPS, pps, minPx); return { step, ticks: ticksOver(step, n, t0, t1) }; };
export const frameTicks = (t0, t1, pps, fps = 30) => rulerTicks({ ruler: 'frames', fps }, t0, t1, pps);
export const beatTicks = (t0, t1, pps, st = {}) => rulerTicks({ ...st, ruler: 'beats' }, t0, t1, pps);

/**
 * The grid's step (s) when it follows the zoom: the ruler's minor tick, split further while the lines
 * stay `minPx` apart. Always a division of the ruler's ticks, so the lines fall on the marks (and in
 * frames, on whole frames).
 */
export function autoGrid(st, pps, minPx = 12) {
  const [step, n] = rulerDivision(st, pps), minor = step / n;
  let splits = [5, 4, 2];
  if (st.ruler === 'frames') { const f = Math.round(minor * (st.fps || 30)); splits = [5, 4, 3, 2].filter(k => f % k === 0); }
  if (st.ruler === 'beats') splits = [4, 2];
  for (const k of splits) if ((minor / k) * pps >= minPx) return minor / k;
  return minor;
}

/**
 * A repeating line every `periodPx`, in phase with the content when drawn on a box that starts
 * `startPx` into it (a CSS background layer; the box is only as wide as the view needs).
 */
export const gridLayer = (periodPx, startPx, color) => {
  const o = ((startPx % periodPx) + periodPx) % periodPx;
  const r = n => `${Math.round(n * 1000) / 1000}px`;
  return `repeating-linear-gradient(90deg, ${color} ${r(-o)} ${r(1 - o)}, transparent ${r(1 - o)} ${r(periodPx - o)})`;
};

/** A label for the time ruler: h:mm:ss for hours, m:ss, and decimals only when the step needs them. */
export function timeLabel(sec, step = 1) {
  const neg = sec < 0 ? '-' : '';
  sec = Math.abs(sec);
  const dec = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec - h * 3600 - m * 60;
  const ss = dec ? s.toFixed(dec).padStart(3 + dec, '0') : String(Math.floor(s + 1e-6)).padStart(2, '0');
  return h ? `${neg}${h}:${String(m).padStart(2, '0')}:${ss}` : `${neg}${m}:${ss}`;
}

// ---- edit points ------------------------------------------------------------------------------

/** The times (ms) worth stopping at, sorted: the start, the clips' starts and ends, the ranges given (a range or a list of them). */
export function editPoints(clips = [], loop = null, end = 0) {
  const set = new Set([0]);
  for (const c of clips) { set.add(Math.round(c.start || 0)); set.add(Math.round((c.start || 0) + (c.dur || 0))); }
  for (const r of !loop ? [] : Array.isArray(loop[0]) ? loop : [loop]) { set.add(Math.round(r[0])); set.add(Math.round(r[1])); }
  if (end > 0) set.add(Math.round(end));
  return [...set].sort((a, b) => a - b);
}

/** The next (dir 1) or previous (dir -1) edit point from `t`, or null. */
export function nextEdit(points, t, dir) {
  const eps = 0.5;
  if (dir > 0) return points.find(p => p > t + eps) ?? null;
  for (let i = points.length - 1; i >= 0; i--) if (points[i] < t - eps) return points[i];
  return null;
}
