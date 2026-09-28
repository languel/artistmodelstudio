/**
 * Streams: where code reaches sources (a camera, an image or video from Assets, later other data).
 * The workbench sets a provider; scores, brushes and sculpts ask it for a sampler by name. Without a
 * provider (tests, an exported sketch) source() gives an empty sampler: grey, no landmarks.
 *
 * A sampler, for a rectangle (a board, in world units):
 *   ready, name, frame (a counter: it changes with each new sampled frame), width, height (the source's)
 *   rgb(x, y) [0..255]×3, color(x, y) '#rrggbb', value(x, y) 0..1 luminance   (fractions of the rect)
 *   colorAt(x, y), valueAt(x, y)                                              (world coordinates)
 *   pose  [[{ x, y, v }] × 33 per person], hands [[{ x, y }] × 21 per hand]   (fractions of the rect)
 *   mask(x, y) 0..1: how much a person is there (segmentation)
 *   pixels(w, h) Float32Array RGB (w×h×3), cover-fitted to the rect's shape
 *
 * Fitting is "cover" (the source fills the rect, cropped to its aspect) or "contain" (all of the
 * source, letterboxed: outside it is black).
 */
let provider = null;
const lastRead = new Map();   // name → when code last asked for it (brushes drawing from a source redraw with it)
/** Whether code asked for `name` in the last `ms` milliseconds. */
export const readRecently = (name, ms = 2000) => Date.now() - (lastRead.get(name) || 0) < ms;
export const setSourceProvider = fn => { provider = fn; };
export const hasSources = () => Boolean(provider);

const EMPTY = { r: 128, g: 128, b: 128 };
function emptySampler(name, rect) {
  const s = {
    ready: false, name, frame: 0, width: 1, height: 1,
    rgb: () => [EMPTY.r, EMPTY.g, EMPTY.b], color: () => '#808080', value: () => 0.5,
    colorAt: () => '#808080', valueAt: () => 0.5,
    pose: [], hands: [], mask: () => 0,
    pixels: (w, h) => new Float32Array(w * h * 3).fill(128)
  };
  s.rect = rect;
  return s;
}

/** A sampler for `name`, fitted to `rect` ({ x, y, width, height }, world units). */
export function getSource(name, rect = { x: 0, y: 0, width: 1000, height: 1000 }, { peek = false, fit = 'cover' } = {}) {
  // peek: read without asking for more (a frozen board drawn from the frames it has).
  if (!peek) lastRead.set(String(name), Date.now());
  return (provider && provider(String(name), rect, fit)) || emptySampler(String(name), rect);
}

/** Persistent state for processes that run again and again (continuous fits), keyed by the caller. */
const states = new Map();
export const streamState = key => { if (!states.has(key)) states.set(key, {}); return states.get(key); };
export const clearStreamState = prefix => { for (const k of states.keys()) if (!prefix || k.startsWith(prefix)) states.delete(k); };
