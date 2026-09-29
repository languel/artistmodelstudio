/**
 * fit(): redraw a source as marks, by greedy shape fitting (the classic Reference Fitter, after
 * Fogleman's primitive). Each shape becomes a plane mark: rectangles and triangles straight, circles
 * smooth. Run once it is a study of the source; with live: true and a board that follows its sources
 * it is the continuous redraw: the shapes are kept, and each new frame replaces the oldest few.
 *
 * In the studio the fitting runs in a worker, off the main thread: fit() returns the last result at
 * once and asks for the new frame; when it is ready the board runs again (see onFitReady) and draws
 * it. Without workers (tests) it fits on the spot. quality: 'fine' (default) or 'fast' (see
 * fitting/fitCore.js; 'fast' is the p5 export's fitter).
 */
import { fitFrame, fitGrid } from '../fitting/fitCore.js';
import { streamState } from './streams.js';

export { shapeToFractions } from '../fitting/fitCore.js';

let worker = null;          // null: not tried yet; false: none (tests, old browsers)
let ready = () => {};
const waiting = new Map();   // key → board, for fits sent to the worker
/** Called with a board's id when a fit it asked for is ready (the studio runs the board again). */
export const onFitReady = fn => { ready = fn; };
/** board → the last fit's time in the worker (ms), for the performance readout. */
export const fitTimes = new Map();

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = typeof Worker !== 'undefined' && typeof window !== 'undefined'
      ? new Worker(new URL('../fitting/fit.worker.js', import.meta.url), { type: 'module' })
      : false;
  } catch { worker = false; }
  // A worker that cannot start (a page opened from disk, file://) or fails: fit on the spot instead.
  const fallBack = () => {
    if (!worker) return;
    worker.terminate?.();
    worker = false;
    for (const [key, board] of waiting) { const st = streamState(key); Object.assign(st, { busy: false, frameAsked: null, pending: null }); ready(board); }
    waiting.clear();
  };
  if (worker) worker.onerror = fallBack;
  if (worker) worker.onmessage = e => {
    const { key, frame, result, error, took } = e.data, st = streamState(key);
    st.busy = false; waiting.delete(key);
    if (error) { console.warn(`fit (worker): ${error}; fitting here instead`); waiting.set(key, st.board); fallBack(); return; }
    fitTimes.set(st.board, took);
    if (st.frameAsked === frame || !st.result) Object.assign(st, { result, frame, took });
    else st.result = result;   // an older frame: still better than nothing
    if (st.pending) { const p = st.pending; st.pending = null; post(key, st, p); }
    ready(st.board);
  };
  return worker;
}

function post(key, st, msg) {
  st.busy = true; waiting.set(key, st.board);
  worker.postMessage({ key, ...msg }, [msg.job.target.buffer]);
}

/**
 * Fit `sampler` (from source()) with `shapes` shapes on a board of aspect `aspect` (width / height).
 * Returns { background, shapes: [{ points, straight, color }] } in fractions of the board (in the
 * studio: the latest finished fit, or only the ground before the first).
 * opts: { shapes = 80, kinds, seed = 1, live = false, turnover = 0.08, quality = 'fine', key, board }
 */
export function fitSource(sampler, aspect, { shapes = 80, kinds = ['rect', 'triangle', 'circle'], seed = 1, live = false, turnover = 0.08, quality = 'fine', key = 'fit', board = null, advance = false } = {}) {
  const { w, h } = fitGrid(aspect, quality);
  const st = streamState(key);
  const sig = [w, h, shapes, kinds.join(), sampler.name, quality, seed].join('|');
  if (st.sig !== sig) { Object.assign(st, { sig, result: null, frame: null, frameAsked: null, pending: null }); }
  st.board = board;
  // advance: a live fit on a board redrawn faster than its source keeps going on the same frame.
  if (st.result && st.frame === sampler.frame && !advance) return st.result;   // nothing new: the same marks
  const job = { target: sampler.pixels(w, h), w, h, shapes, kinds, seed, live, turnover, quality, sig };
  const wk = getWorker();
  if (!wk) {
    st.core ||= {};
    st.result = fitFrame(st.core, job);
    st.frame = sampler.frame;
    return st.result;
  }
  const ground = st.result ? null : meanHex(job.target);   // before the frame goes to the worker
  if (st.frameAsked !== sampler.frame || advance) {
    st.frameAsked = sampler.frame;
    const msg = { frame: sampler.frame, job };
    // One fit at a time per key: while one runs, only the newest frame waits.
    if (st.busy) st.pending = msg; else post(key, st, msg);
  }
  return st.result || { background: ground, shapes: [] };
}

function meanHex(t) {
  const m = [0, 0, 0];
  for (let i = 0; i < t.length; i += 3) { m[0] += t[i]; m[1] += t[i + 1]; m[2] += t[i + 2]; }
  const n = Math.max(1, t.length / 3);
  return `#${m.map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
}
