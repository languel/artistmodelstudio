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
 *   fades                 fx.fadeIn / fx.fadeOut (ms), or fx.fade for both; `crossfade` joins two clips with an overlap, in a style
 *                         (a dissolve, a dip to a colour, a wipe): fx.transition on the clip coming in, read by `transitionAt`
 *   ripple on every track `{ all: true }` moves the later clips of every track, not only of the clip's own (the tracks stay in step)
 *   slide of several      `slideMany` moves clips on different tracks together, each giving way to its own neighbours
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

const shiftAfter = (take, c, from, by, skip = [], all = false) => {
  if (!by) return;
  for (const k of all ? take.clips : laneClips(take, c)) if (k !== c && !skip.includes(k) && k.start >= from - 1) k.start = Math.max(0, Math.round(k.start + by));
};

/** Trim the end and move every later clip on the track (with `all`, on every track) by the change (a ripple edit). Returns the change. */
export function rippleTrimEnd(take, c, to, opts = {}) {
  const was = end(c), d = trimEnd(c, to, opts);
  shiftAfter(take, c, was, d, [], opts.all);
  return d;
}

/** Trim the start and close or open the gap: the clip stays where it started, its end moves, and every later clip moves with the end. */
export function rippleTrimStart(take, c, to, opts = {}) {
  const was = end(c), at = c.start, d = trimStart(c, to, opts);
  c.start = at;   // (it stays put: what is cut from its head is taken out of the track)
  shiftAfter(take, c, was, -d, [], opts.all);
  return d;
}

/** Delete clips and close the gaps: later clips on their tracks (with `all`, on every track) move earlier by each one's length. */
export function rippleDelete(take, list, { all = false } = {}) {
  const gone = new Set(list);
  for (const c of [...list].sort((a, b) => b.start - a.start)) shiftAfter(take, c, end(c), -c.dur, [...gone], all);
  take.clips = take.clips.filter(k => !gone.has(k));
}

/** How far the clip can slide: [lo, hi] ms (negative earlier), or null when it has overlapping neighbours (nothing to slide between). */
export function slideRange(take, c, { min = MIN } = {}) {
  const list = laneClips(take, c), i = list.indexOf(c), prev = list[i - 1] || null, next = list[i + 1] || null;
  if (prev && end(prev) > c.start + 1) return null;
  let lo = -Infinity, hi = Infinity;
  if (prev) lo = Math.max(lo, -(prev.dur - min)); else lo = Math.max(lo, -c.start);
  if (next) { hi = Math.min(hi, next.dur - min); if (hasSource(next)) lo = Math.max(lo, -headroom(next)); }
  return { lo, hi, prev, next };
}
function slideBy(c, r, d) {
  if (r.prev) trimEnd(r.prev, end(r.prev) + d, { min: 1 });
  c.start += d;
  if (r.next) trimStart(r.next, r.next.start + d, { min: 1 });
}

/**
 * Slide the clip by `d` between its neighbours on the track: the clip before ends `d` later, the clip after starts `d` later (each
 * shortened or lengthened by it), so nothing else moves. Limited by how short they may get and by the source before the next clip's
 * in-point. Returns the change made.
 */
export function slide(take, c, d, opts) {
  const r = slideRange(take, c, opts);
  if (!r) return 0;
  d = Math.round(Math.max(r.lo, Math.min(r.hi, d))) || 0;
  if (d) slideBy(c, r, d);
  return d;
}

/**
 * Slide several clips by the same amount, usually on different tracks (a picture and its sound): each gives way to its own
 * neighbours, and the slide is the most they all allow. Returns the change made.
 */
export function slideMany(take, clips, d, opts) {
  const rs = clips.map(c => [c, slideRange(take, c, opts)]);
  if (rs.some(([, r]) => !r)) return 0;
  const picked = new Set(clips);
  // (a neighbour that is itself slid does not give way: two picked clips side by side on a track move as one)
  let lo = -Infinity, hi = Infinity;
  for (const [, r] of rs) { if (!r.prev || !picked.has(r.prev)) lo = Math.max(lo, r.lo); if (!r.next || !picked.has(r.next)) hi = Math.min(hi, r.hi); }
  d = Math.round(Math.max(lo, Math.min(hi, d))) || 0;
  if (!d) return 0;
  for (const [c, r] of rs) {
    if (r.prev && !picked.has(r.prev)) trimEnd(r.prev, end(r.prev) + d, { min: 1 });
    c.start += d;
    if (r.next && !picked.has(r.next)) trimStart(r.next, r.next.start + d, { min: 1 });
  }
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
  const own = visual && c.fx?.xfadeIn && c.fx?.transition && c.fx.transition.kind !== 'dissolve';   // (a wipe or a dip shows the clip coming in its own way)
  if (f.in > 0 && !own && t < c.start + f.in) { const u = Math.max(0, (t - c.start) / f.in); g *= c.fx?.xfadeIn && !visual ? Math.sin(u * Math.PI / 2) : u; }
  if (f.out > 0 && t > end(c) - f.out && !(visual && c.fx?.xfadeOut)) { const u = Math.max(0, (end(c) - t) / f.out); g *= c.fx?.xfadeOut && !visual ? Math.sin(u * Math.PI / 2) : u; }
  return Math.max(0, Math.min(1, g));
}

/**
 * Join `a` to the clip `b` after it with a crossfade of `ms`: they overlap for that long (centred on the cut where the sources allow it:
 * `a` plays on past its end and `b` starts earlier), a fades out as b fades in. If they already overlap, that overlap is the crossfade.
 * Returns the overlap in ms (0 when they are not next to each other).
 */
export function crossfade(a, b, ms, style = null) {
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
  setTransition(b, style);
  return overlap;
}

// ---- the style of a crossfade between pictures -----------------------------------------------------------------------------
/** The styles: a dissolve, a dip through a colour, and a wipe from each side. (A sound always crosses with equal power.) */
export const TRANSITIONS = [
  { id: 'dissolve', label: 'Dissolve', kind: 'dissolve' },
  { id: 'dip-black', label: 'Dip to black', kind: 'dip', color: '#000000' },
  { id: 'dip-white', label: 'Dip to white', kind: 'dip', color: '#ffffff' },
  { id: 'wipe-right', label: 'Wipe, left to right', kind: 'wipe', dir: 'right' },
  { id: 'wipe-left', label: 'Wipe, right to left', kind: 'wipe', dir: 'left' },
  { id: 'wipe-down', label: 'Wipe, top to bottom', kind: 'wipe', dir: 'down' },
  { id: 'wipe-up', label: 'Wipe, bottom to top', kind: 'wipe', dir: 'up' }
];
/** Give the clip coming in a style (a TRANSITIONS id or entry; null or a dissolve is the plain crossfade). */
export function setTransition(b, style) {
  const t = typeof style === 'string' ? TRANSITIONS.find(x => x.id === style) : style;
  b.fx = { ...(b.fx || {}) };
  if (!t || t.kind === 'dissolve') delete b.fx.transition;
  else b.fx.transition = { id: t.id, kind: t.kind, ...(t.dir ? { dir: t.dir } : {}), ...(t.color ? { color: t.color } : {}) };
  return b.fx.transition || null;
}
/** While a clip is coming in by a crossfade: { u (0..1 how far), kind, dir?, color? }; null when it is not. */
export function transitionAt(c, t) {
  const f = fadesOf(c).in;
  if (!c.fx?.xfadeIn || f <= 0 || t < c.start || t >= c.start + f) return null;
  return { u: (t - c.start) / f, kind: c.fx.transition?.kind || 'dissolve', dir: c.fx.transition?.dir, color: c.fx.transition?.color };
}

/** The clip after `c` on its track that it touches or overlaps (the one a crossfade joins it to), or null. */
export function nextToJoin(take, c, tol = 500) {
  const list = laneClips(take, c), i = list.indexOf(c), n = list[i + 1];
  return n && n.start - end(c) <= tol ? n : null;
}
