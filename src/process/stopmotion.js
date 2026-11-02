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
 *     record: 'rate',        // what the record button does: 'rate' (a frame every 1/fps) or 'change' (a frame only when the source moved, at most fps a second)
 *     change: 1,             // 'change' and the start of a recording: the percent of the picture that has to differ
 *     in: 0, out: 40,        // the range that plays and is exported (frame numbers from 0; leave out for all of it)
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
  record: 'rate',
  change: 1,
  frames: []
})
`;

const q = s => JSON.stringify(s);

/** { source, fps, hold, onion, advance, loop, record, change, in, out, frames } from the code. (`out` is null for "to the end".) */
export function readStopmotion(code) {
  let spec = null;
  const stopmotion = s => { spec = s; };
  // eslint-disable-next-line no-new-func
  new Function('stopmotion', `"use strict";\n${code}`)(stopmotion);
  if (!spec || typeof spec !== 'object') throw new Error('stopmotion({ source, fps, frames: [ … ] })');
  const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : d));
  const frames = (Array.isArray(spec.frames) ? spec.frames : []).map(String);
  const last = Math.max(0, frames.length - 1);
  const lo = Math.round(num(spec.in, 0, 0, last));
  const hi = spec.out == null || !Number.isFinite(Number(spec.out)) ? null : Math.round(num(spec.out, last, lo, last));
  return {
    source: spec.source != null ? String(spec.source) : '',
    fps: num(spec.fps, 8, 1, 60), hold: Math.round(num(spec.hold, 1, 1, 12)), onion: num(spec.onion, 0.35, 0, 1),
    advance: spec.advance !== false, loop: spec.loop !== false,
    record: spec.record === 'change' ? 'change' : 'rate', change: num(spec.change, 1, 0.1, 100),
    in: lo, out: hi >= last ? null : hi,
    frames
  };
}

/** The first and last frame that play: [in, out] (the whole list when no range is set). */
export const rangeOf = sm => { const n = sm.frames.length; return n ? [Math.min(sm.in || 0, n - 1), sm.out == null ? n - 1 : Math.min(sm.out, n - 1)] : [0, -1]; };

/** The spec as code (what the board's own controls write; edit it by hand as well). */
export function writeStopmotion({ source = '', fps = 8, hold = 1, onion = 0.35, advance = true, loop = true, record = 'rate', change = 1, in: lo = 0, out = null, frames = [] }) {
  const list = frames.length ? `[\n${frames.map(f => `    ${q(f)}`).join(',\n')}\n  ]` : '[]';
  return `// A stop-motion board: it photographs its source, a frame at a time (see the docs: Stop motion).
stopmotion({
  source: ${q(source)},
  fps: ${fps},
  hold: ${hold},
  onion: ${onion},
  advance: ${advance},
  loop: ${loop},
  record: ${q(record)},
  change: ${change},${lo > 0 ? `\n  in: ${lo},` : ''}${out != null ? `\n  out: ${out},` : ''}
  frames: ${list}
})
`;
}

/** The percent of the thumbnail that differs between two pictures (a cell counts when it moved by more than a twenty-fifth of the grey range). */
export function changedPercent(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 10) n++;
  return (n / a.length) * 100;
}
