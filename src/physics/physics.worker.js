/**
 * The physics worker: one Rapier world per board (src/physics/core.js), off the page's thread. Rapier is
 * loaded on the first message. Messages are handled in order:
 *   { type: 'load', board, scene }      build (or rebuild) a board's world
 *   { type: 'to', board, t, seq }       bring it to time t → { type: 'frame', board, seq, key, n, t, poses, events }
 *   { type: 'motor', board, id, speed } · { type: 'impulse', board, id, v } · { type: 'drop', board }
 */
import R from '@dimforge/rapier2d-deterministic-compat';
import { handle } from './host.js';

let ready = null;
const cores = new Map();
self.onmessage = async ({ data }) => {
  ready ||= R.init({});
  await ready;
  try { handle(R, cores, data, (msg, transfer) => self.postMessage(msg, transfer)); }
  catch (e) { self.postMessage({ type: 'error', board: data.board, message: e.message }); }
};
