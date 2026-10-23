/**
 * Local time of a traveler from the clock: the one function every moving thing shares.
 *
 *   spec: { start = 0, dur = 1, rate = 1, loop = 'once' | 'loop' | 'pingpong' }   (seconds)
 *
 *   unbounded = (T - start) * rate / dur
 *   progress  = once clamps, loop wraps, pingpong reflects
 *
 * Before `start` the progress is 0 and `active` is false. `cycle` counts whole laps, so a caller
 * can tell a wrap from a smooth move (a wrap is a jump, not a sweep).
 */
export const LOOPS = Object.freeze(['once', 'loop', 'pingpong']);

export function localTime(T, spec) {
  const dur = Math.max(1e-6, Number(spec.dur) || 1);
  const rate = Math.max(0, spec.rate ?? 1);
  const start = Number(spec.start) || 0;
  if (T < start) return { progress: 0, cycle: 0, active: false, forward: true };
  const raw = ((T - start) * rate) / dur;
  const mode = LOOPS.includes(spec.loop) ? spec.loop : 'once';
  if (mode === 'once') return { progress: Math.min(1, raw), cycle: 0, active: raw < 1, forward: true };
  const cycle = Math.floor(raw);
  const f = raw - cycle;
  if (mode === 'loop') return { progress: f, cycle, active: true, forward: true };
  const back = cycle % 2 === 1;
  return { progress: back ? 1 - f : f, cycle, active: true, forward: !back };
}

/** Clock times at which a traveler finishes a lap, in (t0, t1]. A once-traveler finishes one lap. */
export function lapEnds(spec, t0, t1) {
  const dur = Math.max(1e-6, Number(spec.dur) || 1);
  const rate = Math.max(0, spec.rate ?? 1);
  const start = Number(spec.start) || 0;
  if (rate <= 0) return [];
  const lap = dur / rate;
  const mode = LOOPS.includes(spec.loop) ? spec.loop : 'once';
  const out = [];
  const first = Math.max(1, Math.floor((t0 - start) / lap) + 1);
  for (let k = first; start + k * lap <= t1 + 1e-12; k++) {
    const t = start + k * lap;
    if (t <= t0) continue;
    out.push(t);
    if (mode === 'once') break;
  }
  return out;
}
