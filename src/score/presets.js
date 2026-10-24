/**
 * What an event (or body) plays, as a few settings that write the `emit` code, and back. The
 * Properties editor is a view of the code: a preset's code starts with a comment that holds its settings
 * (`// preset {"k":"height",…}`), and `readPreset` gives the settings back only while the code is exactly
 * what the settings would write. Edit the code by hand and it is "custom": the settings step aside, the
 * code stays.
 *
 *   emitFor({ k: 'height', ch: 1, lo: 48, hi: 72, scale: 'dorian', root: 62, vel: 90, dur: 'gate' })  → code
 *   readPreset(code)                                                                                   → settings | null
 */
import { scaleName } from './scale.js';

export const PRESETS = Object.freeze([
  { k: 'note', label: 'A fixed note', hint: 'The same note each time' },
  { k: 'height', label: 'Pitch by height', hint: 'Higher on the board, higher the note (in a scale)' },
  { k: 'along', label: 'Pitch by place on the path', hint: 'The note follows how far along its path the traveler is' },
  { k: 'offset', label: 'Pitch by distance from the path', hint: 'IanniX style: a traveler that is a bar across its path sounds what it touches by how far to the side it is' },
  { k: 'cc', label: 'Controller by height', hint: 'A MIDI controller follows the height' },
  { k: 'collide', label: 'Note on collision', hint: 'For bodies: a note when two touch, louder when harder' }
]);

export const DEFAULTS = Object.freeze({
  note: { k: 'note', ch: 1, pitch: 60, vel: 100, dur: 0.25 },
  height: { k: 'height', ch: 1, lo: 48, hi: 72, scale: 'dorian', root: 62, vel: 90, dur: 'gate' },
  offset: { k: 'offset', ch: 1, lo: 48, hi: 72, scale: 'dorian', root: 62, vel: 90, dur: 0.25 },
  along: { k: 'along', ch: 1, lo: 48, hi: 72, scale: 'dorian', root: 62, vel: 90, dur: 0.25 },
  cc: { k: 'cc', ch: 1, cc: 1 },
  collide: { k: 'collide', ch: 1, lo: 36, hi: 84, scale: 'pentatonicminor', root: 60, dur: 0.2 }
});

const int = (v, d, a, b) => Math.max(a, Math.min(b, Math.round(Number.isFinite(Number(v)) ? Number(v) : d)));
const q = v => JSON.stringify(v);
const dur = v => (v === 'gate' ? q('gate') : typeof v === 'number' ? String(v) : q(String(v)));

/** Settings made sound: every field is brought in range, so what is written is what is read back. */
export function clean(p) {
  const d = DEFAULTS[p?.k] || DEFAULTS.height;
  const out = { k: d.k, ch: int(p?.ch, d.ch, 1, 16) };
  if (d.k === 'note') Object.assign(out, { pitch: int(p?.pitch, d.pitch, 0, 127), vel: int(p?.vel, d.vel, 1, 127), dur: p?.dur ?? d.dur });
  else if (d.k === 'cc') out.cc = int(p?.cc, d.cc, 0, 127);
  else {
    const lo = int(p?.lo, d.lo, 0, 127), hi = int(p?.hi, d.hi, 0, 127);
    Object.assign(out, { lo: Math.min(lo, hi), hi: Math.max(lo, hi), scale: p?.scale === '' ? '' : scaleName(p?.scale) ? scaleName(p.scale).toLowerCase().replace(/[^a-z]/g, '') : d.scale, root: int(p?.root, d.root, 0, 127), dur: p?.dur ?? d.dur });
    if (d.k !== 'collide') out.vel = int(p?.vel, d.vel, 1, 127);
  }
  return out;
}

/** The code for settings. */
export function emitFor(settings) {
  const p = clean(settings);
  const head = `// preset ${JSON.stringify(p)}\n`;
  if (p.k === 'note') return `${head}note(${p.ch}, ${p.pitch}, ${p.vel}, ${dur(p.dur)})`;
  if (p.k === 'cc') return `${head}ccf(${p.ch}, ${p.cc}, ny)`;
  const axis = p.k === 'along' ? 'u' : p.k === 'offset' ? '((lat ?? 0) + 1) / 2' : 'ny';
  const raw = `${p.lo} + lane(${axis}, ${p.hi - p.lo + 1})`;
  const pit = p.scale ? `snap(${raw}, ${q(p.scale)}, ${p.root})` : raw;
  if (p.k === 'collide') return `${head}if (type === 'collide' && traveler < other) note(${p.ch}, ${pit}, clamp(30 + speed * 0.5, 30, 120), ${dur(p.dur)})`;
  return `${head}note(${p.ch}, ${pit}, ${p.vel}, ${dur(p.dur)})`;
}

/** The settings behind some code, or null when the code is not exactly a preset's. */
export function readPreset(code) {
  const m = /^\/\/ preset (\{.*\})\n/.exec(String(code || ''));
  if (!m) return null;
  let p;
  try { p = JSON.parse(m[1]); } catch { return null; }
  if (!DEFAULTS[p?.k]) return null;
  const settings = clean(p);
  return emitFor(settings) === code ? settings : null;
}
