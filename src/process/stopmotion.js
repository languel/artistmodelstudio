/**
 * A stop-motion board is code: one call that says what to photograph and what has been photographed.
 *
 *   stopmotion({
 *     source: 'Dune',        // the board to photograph (a title or id): a drawing, a sketch, a page, anything that shows
 *     fps: 8,                // playback and export speed (frames a second)
 *     hold: 1,               // exposures per shot (2 is "on twos")
 *     onion: 0.35,           // how strongly the last frame shows over the live view (0 off)
 *     advance: true,         // after a shot, go back to the live view (false: stay on the frame just taken)
 *     loop: true,
 *     frames: ['…', '…']     // the shots, as Assets (ids): the board writes these; edit to reorder, repeat or cut
 *   })
 */
export const STOPMOTION_TEMPLATE = `// A stop-motion board: it photographs its source, a frame at a time (see the docs: Stop motion).
stopmotion({
  source: '',
  fps: 8,
  hold: 1,
  onion: 0.35,
  advance: true,
  loop: true,
  frames: []
})
`;

const q = s => JSON.stringify(s);

/** { source, fps, hold, onion, advance, loop, frames } from the code. */
export function readStopmotion(code) {
  let spec = null;
  const stopmotion = s => { spec = s; };
  // eslint-disable-next-line no-new-func
  new Function('stopmotion', `"use strict";\n${code}`)(stopmotion);
  if (!spec || typeof spec !== 'object') throw new Error('stopmotion({ source, fps, frames: [ … ] })');
  const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : d));
  return {
    source: spec.source != null ? String(spec.source) : '',
    fps: num(spec.fps, 8, 1, 60), hold: Math.round(num(spec.hold, 1, 1, 12)), onion: num(spec.onion, 0.35, 0, 1),
    advance: spec.advance !== false, loop: spec.loop !== false,
    frames: (Array.isArray(spec.frames) ? spec.frames : []).map(String)
  };
}

/** The spec as code (what the board's own controls write; edit it by hand as well). */
export function writeStopmotion({ source = '', fps = 8, hold = 1, onion = 0.35, advance = true, loop = true, frames = [] }) {
  const list = frames.length ? `[\n${frames.map(f => `    ${q(f)}`).join(',\n')}\n  ]` : '[]';
  return `// A stop-motion board: it photographs its source, a frame at a time (see the docs: Stop motion).
stopmotion({
  source: ${q(source)},
  fps: ${fps},
  hold: ${hold},
  onion: ${onion},
  advance: ${advance},
  loop: ${loop},
  frames: ${list}
})
`;
}
