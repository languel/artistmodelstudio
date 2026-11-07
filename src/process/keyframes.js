/**
 * Keyframes: one lane type for any parameter (docs/camera-plan.md §4). A lane is a clip of a take on the `auto`
 * track: { id, track: 'auto', address, start: 0, dur, keys: [{ t (ms), v, ease }] }. `address` names the parameter
 * ('board:board2.opacity', 'mark:abc.opacity', 'ctl:board3.speed'; see params.js). Values are numbers here;
 * between keys they follow the earlier key's ease; before the first and after the last key they hold.
 */
import { clipId, flatClips } from './take.js';

const EASES = {
  linear: u => u,
  ease: u => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2),
  in: u => u * u,
  out: u => 1 - (1 - u) * (1 - u),
  hold: () => 0
};
export const EASE_NAMES = Object.keys(EASES);

/** The value of a lane's keys at time t (ms), or null if it has none. */
export function valueAt(keys, t) {
  if (!keys?.length) return null;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1], u = (t - a.t) / Math.max(1, b.t - a.t);
  return a.v + (b.v - a.v) * (EASES[a.ease] || EASES.linear)(u);
}

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
export function setKey(take, address, t, v, ease = 'ease') {
  t = Math.max(0, Math.round(t));
  let lane = laneFor(take, address);
  if (!lane) { lane = { id: clipId(), track: 'auto', address, start: 0, dur: 1, keys: [], fx: {}, label: address }; take.clips.push(lane); }
  const near = keyNear(lane, t);
  if (near) { near.v = v; near.t = t; } else lane.keys.push({ t, v, ease });
  lane.keys.sort((a, b) => a.t - b.t);
  lane.dur = Math.max(1, lane.keys[lane.keys.length - 1].t);
  return lane;
}

/** Remove the key near t; a lane left with no keys is removed. Returns whether a key was removed. */
export function removeKey(take, address, t) {
  const lane = laneFor(take, address), k = keyNear(lane, t);
  if (!k) return false;
  lane.keys = lane.keys.filter(x => x !== k);
  if (!lane.keys.length) take.clips = take.clips.filter(c => c !== lane);
  else lane.dur = Math.max(1, lane.keys[lane.keys.length - 1].t);
  return true;
}

/** Remove a parameter's whole lane. */
export function clearLane(take, address) { const lane = laneFor(take, address); if (lane) take.clips = take.clips.filter(c => c !== lane); return Boolean(lane); }
