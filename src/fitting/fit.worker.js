/**
 * The fit worker: fits frames off the studio's main thread (see process/fit.js). One fit state per
 * key (a fit() call on a board), carried from frame to frame.
 */
import { fitFrame } from './fitCore.js';

const states = new Map();

self.onmessage = e => {
  const { key, frame, job, drop } = e.data;
  if (drop) { states.delete(key); return; }
  if (!states.has(key)) states.set(key, {});
  const t0 = performance.now();
  try {
    const result = fitFrame(states.get(key), job);
    self.postMessage({ key, frame, result, took: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ key, frame, error: err.message });
  }
};
