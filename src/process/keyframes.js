/**
 * Keyframes: one lane type for any parameter (docs/camera-plan.md §4). A lane is a clip of a take on the `auto`
 * track: { id, track: 'auto', address, start, dur, keys: [{ t (ms, from the lane's start), v, ease }] }. `address` names the parameter
 * ('board:board2.opacity', 'mark:abc.opacity', 'ctl:board3.speed'; see params.js). Values are numbers here;
 * between keys they follow the earlier key's ease; before the first and after the last key they hold.
 */
import { clipId, flatClips, addTrack } from './take.js';

const EASES = {
  linear: u => u,
  ease: u => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2),
  in: u => u * u,
  out: u => 1 - (1 - u) * (1 - u),
  hold: () => 0
};
export const EASE_NAMES = Object.keys(EASES);

const HEX = /^#([0-9a-f]{6})$/i;
const rgb = s => { const m = HEX.exec(s); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const hex = c => `#${c.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;

/**
 * Between two values by their kind: numbers and #rrggbb colours blend; a palette (a list of colours or numbers of the
 * same length) blends colour by colour; a choice (`meta.options`) moves through the options by their order and
 * snaps to the nearest, so it switches half-way (a stepped choice); a toggle or anything else snaps half-way too.
 * A key with ease `hold` keeps the earlier value (u stays 0).
 */
export function mix(a, b, u, meta = null) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
  const ca = rgb(a), cb = rgb(b);
  if (ca && cb) return hex(ca.map((x, i) => x + (cb[i] - x) * u));
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((x, i) => mix(x, b[i], u));
  const o = meta?.options;
  if (o?.length) { const i = o.indexOf(a), j = o.indexOf(b); if (i >= 0 && j >= 0) return o[Math.round(i + (j - i) * u)]; }
  return u < 0.5 ? a : b;
}

/** The value of a lane's keys at time t (ms, relative to the lane), or null if it has none. */
export function valueAt(keys, t, meta = null) {
  if (!keys?.length) return null;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1], u = (t - a.t) / Math.max(1, b.t - a.t);
  return mix(a.v, b.v, (EASES[a.ease] || EASES.linear)(u), meta);
}

/** Whether two parameter values are the same (numbers within `tol`). */
export const sameValue = (a, b, tol = 0.005) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= tol : JSON.stringify(a) === JSON.stringify(b));

/** The lane clip for an address (not muted unless `any`), or null. Looks at the take's own clips (not inside compositions). */
export const laneFor = (take, address) => (take?.clips || []).find(c => c.track === 'auto' && c.address === address) || null;
/** Every lane of a take, compositions opened out. */
export const lanesOf = take => (take ? flatClips(take).filter(c => c.track === 'auto' && c.address && !c.muted) : []);

/** The key within `tol` ms of t, or null. */
export const keyNear = (lane, t, tol = 20) => (lane?.keys || []).find(k => Math.abs(k.t - t) <= tol) || null;

/**
 * Set a key at t (a new lane if the address has none). Returns the lane.
 * An existing key near t is changed (its ease kept) instead of a second one added.
 */
export function setKey(take, address, t, v, ease = 'ease', label = null, meta = null) {
  let lane = laneFor(take, address);
  if (!lane) { lane = { id: clipId(), track: 'auto', address, start: 0, dur: 1000, keys: [], fx: {}, label: label || address, ...(meta ? { meta } : {}), lane: addTrack(take, 'auto', label || address).id }; take.clips.push(lane); }   // (each parameter gets a row of its own, named for it)
  t = Math.max(0, Math.round(t - lane.start));   // (keys are from the lane's start, so moving the lane moves them)
  const near = keyNear(lane, t);
  if (near) { near.v = v; near.t = t; } else lane.keys.push({ t, v, ease });
  lane.keys.sort((a, b) => a.t - b.t);
  lane.dur = Math.max(1000, lane.keys[lane.keys.length - 1].t);
  return lane;
}

/** Remove the key near t; a lane left with no keys is removed. Returns whether a key was removed. */
export function removeKey(take, address, t) {
  const lane = laneFor(take, address), k = lane && keyNear(lane, t - lane.start);
  if (!k) return false;
  lane.keys = lane.keys.filter(x => x !== k);
  if (!lane.keys.length) { take.clips = take.clips.filter(c => c !== lane); dropTrack(take, lane); }
  else lane.dur = Math.max(1000, lane.keys[lane.keys.length - 1].t);
  return true;
}

/** Remove a parameter's whole lane. */
export function clearLane(take, address) { const lane = laneFor(take, address); if (lane) { take.clips = take.clips.filter(c => c !== lane); dropTrack(take, lane); } return Boolean(lane); }

/** The row a lane had goes with it (when nothing else is on it). */
function dropTrack(take, lane) {
  if (lane.lane && !take.clips.some(c => c !== lane && c.lane === lane.lane)) take.tracks = (take.tracks || []).filter(t => t.id !== lane.lane);
}

/**
 * Thin a recorded lane: drop the keys a straight line between their neighbours would reproduce within `tol` (in the
 * value's own units). Numbers only (other kinds keep every key). Returns how many keys were dropped.
 */
export function thinKeys(keys, tol) {
  if (keys.length < 3 || !keys.every(k => typeof k.v === 'number')) return 0;
  const keep = new Array(keys.length).fill(false); keep[0] = keep[keys.length - 1] = true;
  const walk = (a, b) => {
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const u = (keys[i].t - keys[a].t) / Math.max(1, keys[b].t - keys[a].t), line = keys[a].v + (keys[b].v - keys[a].v) * u, d = Math.abs(keys[i].v - line);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = true; walk(a, at); walk(at, b); }
  };
  walk(0, keys.length - 1);
  const dropped = keep.filter(k => !k).length;
  if (dropped) { const kept = keys.filter((_, i) => keep[i]); keys.length = 0; keys.push(...kept); }
  return dropped;
}

/** Set (or change) the key at t whatever is there: a recording writes values, it does not toggle. */
export const keyHere = (take, address, t, v, ease = 'ease', label = null, meta = null) => setKey(take, address, t, v, ease, label, meta);
