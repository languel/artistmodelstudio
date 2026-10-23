/**
 * Scales, from the Midinous set (via midinojs): intervals in semitones from the root.
 *
 *   scaleNotes(name, root)  every MIDI note 0..127 in the scale
 *   snap(note, name, root)  the nearest note in the scale (ties go down)
 *   step(note, n, name, root)  n scale steps up (or down) from a note (a note off the scale starts at its nearest below/above)
 *   noteName(60) 'C4'; noteNumber('C#4') 61
 *
 * Names are case- and space-insensitive: 'dorian', 'Pentatonic Minor', 'pentatonicminor'.
 */
export const SCALES = {
    'Aeolian': [2, 1, 2, 2, 1, 2, 2], // Minor
    'Altered': [1, 2, 1, 2, 2, 2, 2],
    'Augmented': [3, 1, 3, 1, 3, 1],
    'Blues': [3, 2, 1, 1, 3, 2],
    'Chromatic': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    'Dorian': [2, 1, 2, 2, 2, 1, 2],
    'Flamenco': [1, 3, 1, 2, 1, 3, 1],
    'Half Diminished': [2, 1, 2, 1, 2, 2, 2],
    'Harmonic Major': [2, 2, 1, 2, 1, 3, 1],
    'Harmonic Minor': [2, 1, 2, 2, 1, 3, 1],
    'Hirajoshi': [4, 2, 1, 4, 1],
    'Hungarian': [2, 1, 3, 1, 1, 3, 1],
    'Insen': [1, 4, 2, 4, 2],
    'Ionian': [2, 2, 1, 2, 2, 2, 1], // Major
    'Iwato': [1, 4, 1, 4, 2],
    'Locrian': [1, 2, 2, 1, 2, 2, 2],
    'Locrian Major': [2, 2, 1, 1, 2, 2, 2],
    'Lydian': [2, 2, 2, 1, 2, 2, 1],
    'Lydian Augmented': [2, 2, 2, 2, 1, 2, 1],
    'Pentatonic Major': [2, 2, 3, 2, 3],
    'Pentatonic Minor': [3, 2, 2, 3, 2],
    'Melodic Minor': [2, 1, 2, 2, 2, 2, 1],
    'Mixolydian': [2, 2, 1, 2, 2, 1, 2],
    'Octatonic Whole': [2, 1, 2, 1, 2, 1, 2, 1],
    'Octatonic Half': [1, 2, 1, 2, 1, 2, 1, 2],
    'Persian': [1, 3, 1, 1, 2, 3, 1],
    'Phrygian': [1, 2, 2, 2, 1, 2, 2],
    'Prometheus': [2, 2, 2, 3, 1, 2],
    'Tritone': [1, 3, 2, 1, 3, 2],
    'Two Semitone Tritone': [1, 1, 4, 1, 1],
    'Ukrainian Dorian': [2, 1, 3, 1, 2, 1, 2],
    'Whole Tone': [2, 2, 2, 2, 2, 2]
};

const KEY = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
const BY_KEY = new Map(Object.keys(SCALES).map(n => [KEY(n), n]));
export const scaleNames = () => Object.keys(SCALES);
/** The canonical name of a scale, or null. */
export const scaleName = n => BY_KEY.get(KEY(n)) || null;

const cache = new Map();
/** Sorted MIDI notes of the scale from its root, over the whole range. */
export function scaleNotes(name = 'Chromatic', root = 60) {
  const canon = scaleName(name) || 'Chromatic';
  const r = ((Math.round(root) % 12) + 12) % 12;
  const key = `${canon}|${r}`;
  let notes = cache.get(key);
  if (!notes) {
    const set = new Set();
    const steps = SCALES[canon];
    for (let n = r - 12 * 11, i = 0; n <= 127; i++) {
      if (n >= 0) set.add(n);
      n += steps[i % steps.length];
    }
    notes = [...set].sort((a, b) => a - b);
    cache.set(key, notes);
  }
  return notes;
}

export function snap(note, name, root) {
  const notes = scaleNotes(name, root);
  const n = Math.max(0, Math.min(127, Math.round(note)));
  let best = notes[0], d = Infinity;
  for (const s of notes) { const k = Math.abs(s - n); if (k < d) { d = k; best = s; } }
  return best;
}

export function step(note, n, name, root) {
  const notes = scaleNotes(name, root);
  const i = notes.indexOf(snap(note, name, root));
  return notes[Math.max(0, Math.min(notes.length - 1, i + Math.round(n)))];
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = n => `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
export function noteNumber(name) {
  const m = String(name).match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return 60;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + base;
}
