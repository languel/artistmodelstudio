/**
 * Editing clips of sound and picture: cut, trim, slip, slide, ripple, fades and crossfades. Pure functions on clips and takes; the
 * Timeline (src/workbench/panels/timeline.js) is the hand that calls them.
 *
 * A clip with a source (a sound, a moment of a video) shows part of it: from its in-point for as long as the clip lasts, at its rate.
 *   audio   in-point `offset` (ms), rate `rate`
 *   media   in-point `in` (s), rate `speed`; a board or a still has no source time
 * All times are ms on the take, except where a name says otherwise.
 *
 *   trimStart / trimEnd   move one edge; the other stays, and what the clip shows stays where it is (the in-point moves with the start)
 *   slip                  the clip stays where it is, and what it shows slides under it (the in-point moves)
 *   slide                 the clip moves between its neighbours; they give way (the one before ends later or sooner, the one after starts
 *                         later or sooner), so the length of the whole stays
 *   rippleTrimStart/End   trim an edge, and every later clip on the track moves by what was gained or lost
 *   fades                 fx.fadeIn / fx.fadeOut (ms), or fx.fade for both; `crossfade` joins two clips with an overlap
 */
import { laneOf } from './take.js';
import { shiftMarks } from './marks.js';

const MIN = 50;
export const hasSource = c => c.track === 'audio' || (c.track === 'media' && !c.board && !c.still);
const rateOf = c => (c.track === 'audio' ? (c.rate > 0 ? c.rate : 1) : c.track === 'media' ? (c.speed > 0 ? c.speed : 1) : 1);
/** Where in its source the clip starts (ms). */
export const inPoint = c => (c.track === 'audio' ? c.offset || 0 : c.track === 'media' ? (c.in || 0) * 1000 : 0);
function setIn(c, ms) {
  ms = Math.max(0, Math.round(ms));
  if (c.track === 'audio') c.offset = ms;
  else if (c.track === 'media') { c.in = ms / 1000; c.out = c.in + (c.dur / 1000) * rateOf(c); }
}
const syncOut = c => { if (c.track === 'media' && !c.board && !c.still) c.out = (c.in || 0) + (c.dur / 1000) * rateOf(c); };
const end = c => c.start + c.dur;

/** The clips on the same track as `c`, in time order. */
export const laneClips = (take, c) => take.clips.filter(k => laneOf(k) === laneOf(c) && k.track === c.track).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

/** How far earlier than now the clip's start can go: what its source has before its in-point (a clip with no source: to 0). */
const headroom = c => (hasSource(c) ? inPoint(c) / rateOf(c) : c.start);

/** Move the start (the end stays). Returns the change in start actually made. */
export function trimStart(c, to, { min = MIN } = {}) {
  const e = end(c), lo = Math.max(0, c.start - headroom(c)), at = Math.round(Math.max(lo, Math.min(e - min, to))), d = at - c.start;
  if (!d) return 0;
  c.start = at; c.dur = e - at;
  if (hasSource(c)) setIn(c, inPoint(c) + d * rateOf(c));
  shiftMarks(c, d);   // (notes keep their place on what the clip shows)
  return d;
}

/** Move the end (the start stays). Returns the change in the end actually made. */
export function trimEnd(c, to, { min = MIN } = {}) {
  const at = Math.round(Math.max(c.start + min, to)), d = at - end(c);
  if (!d) return 0;
  c.dur = at - c.start; syncOut(c);
  return d;
}

/** Slide what the clip shows under it by `d` ms (positive: later in the source). Returns the change made (limited by the start of the source). */
export function slip(c, d) {
  if (!hasSource(c) || !d) return 0;
  const next = Math.max(0, inPoint(c) + d * rateOf(c)), made = (next - inPoint(c)) / rateOf(c);
  setIn(c, next);
  return Math.round(made);
}

const shiftAfter = (take, c, from, by, skip = []) => {
  if (!by) return;
  for (const k of laneClips(take, c)) if (k !== c && !skip.includes(k) && k.start >= from - 1) k.start = Math.max(0, Math.round(k.start + by));
};

/** Trim the end and move every later clip on the track by the change (a ripple edit). Returns the change. */
export function rippleTrimEnd(take, c, to, opts) {
  const was = end(c), d = trimEnd(c, to, opts);
  shiftAfter(take, c, was, d);
  return d;
}

/** Trim the start and close or open the gap: the clip stays where it started, its end moves, and every later clip moves with the end. */
export function rippleTrimStart(take, c, to, opts) {
  const was = end(c), at = c.start, d = trimStart(c, to, opts);
  c.start = at;   // (it stays put: what is cut from its head is taken out of the track)
  shiftAfter(take, c, was, -d);
  return d;
}

/**
 * Slide the clip by `d` between its neighbours on the track: the clip before ends `d` later, the clip after starts `d` later (each
 * shortened or lengthened by it), so nothing else moves. Limited by how short they may get and by the source before the next clip's
 * in-point. Returns the change made.
 */
export function slide(take, c, d, { min = MIN } = {}) {
  const list = laneClips(take, c), i = list.indexOf(c), prev = list[i - 1] || null, next = list[i + 1] || null;
  if (prev && prev.start + prev.dur > c.start + 1) return 0;   // (overlapping: nothing to slide between)
  let lo = -Infinity, hi = Infinity;
  if (prev) lo = Math.max(lo, -(prev.dur - min)); else lo = Math.max(lo, -c.start);
  if (next) { hi = Math.min(hi, next.dur - min); if (hasSource(next)) lo = Math.max(lo, -headroom(next) - 0); }
  d = Math.round(Math.max(lo, Math.min(hi, d)));
  if (!d) return 0;
  if (prev) trimEnd(prev, end(prev) + d, { min: 1 });
  c.start += d;
  if (next) trimStart(next, next.start + d, { min: 1 });
  return d;
}

// ---- fades and crossfades -------------------------------------------------------------------------------------------------
/** { in, out }: the lengths of a clip's fades (ms). `fx.fade` is both. */
export const fadesOf = c => ({ in: Math.max(0, c.fx?.fadeIn ?? c.fx?.fade ?? 0), out: Math.max(0, c.fx?.fadeOut ?? c.fx?.fade ?? 0) });

/** Set a fade ('in' | 'out'); 0 takes it away. Returns the length kept (a fade is no longer than the clip). */
export function setFade(c, side, ms) {
  c.fx = { ...(c.fx || {}) };
  const f = fadesOf(c); delete c.fx.fade;   // (from now on the two are kept apart)
  c.fx.fadeIn = f.in; c.fx.fadeOut = f.out;
  const key = side === 'in' ? 'fadeIn' : 'fadeOut', v = Math.max(0, Math.min(Math.round(ms || 0), Math.round(c.dur)));
  c.fx[key] = v;
  if (!v) { delete c.fx[key]; delete c.fx[side === 'in' ? 'xfadeIn' : 'xfadeOut']; }
  if (!c.fx.fadeIn && !c.fx.fadeOut) { delete c.fx.fadeIn; delete c.fx.fadeOut; }
  return v;
}

/**
 * The gain of a clip's fades at time t (0..1). `visual`: a picture's outgoing side of a crossfade is not faded (the clip coming in
 * covers it, which is what a dissolve is). A sound that is crossfading fades with equal power (so the middle is not quieter).
 */
export function fadeGain(c, t, { visual = false } = {}) {
  const f = fadesOf(c);
  let g = 1;
  if (f.in > 0 && t < c.start + f.in) { const u = Math.max(0, (t - c.start) / f.in); g *= c.fx?.xfadeIn && !visual ? Math.sin(u * Math.PI / 2) : u; }
  if (f.out > 0 && t > end(c) - f.out && !(visual && c.fx?.xfadeOut)) { const u = Math.max(0, (end(c) - t) / f.out); g *= c.fx?.xfadeOut && !visual ? Math.sin(u * Math.PI / 2) : u; }
  return Math.max(0, Math.min(1, g));
}

/**
 * Join `a` to the clip `b` after it with a crossfade of `ms`: they overlap for that long (centred on the cut where the sources allow it:
 * `a` plays on past its end and `b` starts earlier), a fades out as b fades in. If they already overlap, that overlap is the crossfade.
 * Returns the overlap in ms (0 when they are not next to each other).
 */
export function crossfade(a, b, ms) {
  if (b.start < a.start) [a, b] = [b, a];
  const gap = b.start - end(a);
  let overlap;
  if (gap < -1) overlap = -gap;
  else {
    if (gap > 500) return 0;
    ms = Math.max(MIN, Math.round(ms));
    if (gap > 0) a.dur += gap, syncOut(a);   // (a little gap: closed by lengthening the first)
    const h = Math.min(ms / 2, headroom(b));   // (what the second can show before where it starts)
    if (h > 0) { b.start -= h; b.dur += h; if (hasSource(b)) setIn(b, inPoint(b) - h * rateOf(b)); syncOut(b); }
    a.dur += ms - h; syncOut(a);
    overlap = ms;
  }
  overlap = Math.round(Math.min(overlap, a.dur, b.dur));
  setFade(a, 'out', overlap); setFade(b, 'in', overlap);
  a.fx.xfadeOut = true; b.fx.xfadeIn = true;
  return overlap;
}

/** The clip after `c` on its track that it touches or overlaps (the one a crossfade joins it to), or null. */
export function nextToJoin(take, c, tol = 500) {
  const list = laneClips(take, c), i = list.indexOf(c), n = list[i + 1];
  return n && n.start - end(c) <= tol ? n : null;
}
