/**
 * The channel mixer: what each MIDI channel of a score sounds like and where it goes, plus a scale
 * every note is held to. It sits between a score's messages and the outputs, so the score's code
 * stays the same whatever instruments or ports are chosen.
 *
 *   mixer = { channels: { '1': { program, out, vol, pan, mute, solo, transpose } … }, scale: { name, root }, transpose }
 *     program    0..127 GM instrument (null: whatever the score or the synth has)
 *     out        'auto' (every output that is on) | 'gm' | 'midi' | 'both' | 'off'
 *     vol        0..127 (CC 7; null: untouched);  pan  -1..1 (CC 10; null: untouched)
 *     mute, solo, transpose (semitones)
 *   scale      the global filter: with a name, every note snaps to that scale (root 0..11); name '' is off
 *
 * Only what differs from the default is stored. createRouter() turns each message into { bytes, to } or null.
 */
import { scaleName, snap } from './scale.js';

export const OUTS = Object.freeze(['auto', 'gm', 'midi', 'both', 'off']);
const num = (v, d) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const DEFAULT_STRIP = Object.freeze({ program: null, out: 'auto', vol: null, pan: null, mute: false, solo: false, transpose: 0 });

export function normalizeStrip(s) {
  const o = s && typeof s === 'object' ? s : {};
  const strip = {
    program: num(o.program, null) === null ? null : clamp(Math.round(num(o.program, 0)), 0, 127),
    out: OUTS.includes(o.out) ? o.out : 'auto',
    vol: num(o.vol, null) === null ? null : clamp(Math.round(num(o.vol, 100)), 0, 127),
    pan: num(o.pan, null) === null ? null : clamp(num(o.pan, 0), -1, 1),
    mute: Boolean(o.mute), solo: Boolean(o.solo),
    transpose: clamp(Math.round(num(o.transpose, 0)), -48, 48)
  };
  return strip;
}
const isDefault = s => Object.keys(DEFAULT_STRIP).every(k => s[k] === DEFAULT_STRIP[k]);

export function normalizeMixer(m) {
  const src = m && typeof m === 'object' ? m : {};
  const channels = {};
  for (let c = 1; c <= 16; c++) {
    const s = normalizeStrip(src.channels?.[c] ?? src.channels?.[String(c)]);
    if (!isDefault(s)) channels[c] = s;
  }
  const name = src.scale?.name ? scaleName(src.scale.name) || '' : '';
  return {
    channels,
    scale: { name, root: ((Math.round(num(src.scale?.root, 0)) % 12) + 12) % 12 },
    transpose: clamp(Math.round(num(src.transpose, 0)), -48, 48)
  };
}

export const stripOf = (mixer, ch) => ({ ...DEFAULT_STRIP, ...mixer.channels?.[ch] });

/** A change to one channel (or to the scale or global transpose), as a new mixer. */
export function patchMixer(mixer, patch) {
  const next = { channels: { ...mixer.channels }, scale: { ...mixer.scale }, transpose: mixer.transpose };
  if (patch.channel) for (const [ch, p] of Object.entries(patch.channel)) next.channels[ch] = { ...stripOf(mixer, ch), ...p };
  if (patch.scale) next.scale = { ...next.scale, ...patch.scale };
  if ('transpose' in patch) next.transpose = patch.transpose;
  return normalizeMixer(next);
}

/** Does any channel solo? */
export const anySolo = mixer => Object.values(mixer.channels).some(s => s.solo);

/** Does a channel sound (not muted; and, when some are soloed, soloed)? */
export function audible(mixer, ch) {
  const s = stripOf(mixer, ch);
  return !s.mute && s.out !== 'off' && (!anySolo(mixer) || s.solo);
}

/** The messages that set a channel's instrument, volume and pan up (sent when they change and when play starts). */
export function strips(mixer, ch) {
  const s = stripOf(mixer, ch), c = ch - 1, msgs = [];
  if (s.program !== null && ch !== 10) msgs.push([0xc0 | c, s.program]);
  if (s.vol !== null) msgs.push([0xb0 | c, 7, s.vol]);
  if (s.pan !== null) msgs.push([0xb0 | c, 10, clamp(Math.round(64 + s.pan * 63), 0, 127)]);
  return msgs;
}

/**
 * The router: route(bytes) → { bytes, to } | null. A note is moved by the channel's and the global
 * transpose, then snapped to the scale; its note-off follows the pitch its note-on went out as, so a
 * change in the middle of a note cannot leave it hanging. `to` is 'auto', 'gm', 'midi' or 'both'.
 * getMixer is read for every message, so the panel's changes are heard at once.
 */
export function createRouter(getMixer) {
  const sounding = new Map();   // channel<<8|original pitch → [pitches sent]
  const levels = new Array(16).fill(0), lastOn = new Array(16).fill(0);
  return {
    levels, lastOn,
    route(bytes, now = Date.now()) {
      const m = getMixer(), st = bytes[0] & 0xf0, c = bytes[0] & 0x0f, ch = c + 1, s = stripOf(m, ch);
      if (st === 0x90 && bytes[2] > 0) {
        if (!audible(m, ch)) return null;
        let n = bytes[1] + s.transpose + m.transpose;
        if (m.scale.name) n = snap(n, m.scale.name, m.scale.root);
        n = clamp(n, 0, 127);
        const key = (c << 8) | bytes[1];
        (sounding.get(key) || sounding.set(key, []).get(key)).push(n);
        levels[c] = bytes[2]; lastOn[c] = now;
        return { bytes: [bytes[0], n, bytes[2]], to: s.out };
      }
      if (st === 0x80 || st === 0x90) {
        const key = (c << 8) | bytes[1], list = sounding.get(key);
        if (!list?.length) return s.out === 'off' ? null : { bytes, to: s.out };   // (a note-off for a note not held: pass it)
        const n = list.shift();
        if (!list.length) sounding.delete(key);
        return { bytes: [bytes[0], n, bytes[2]], to: s.out };
      }
      if (s.out === 'off') return null;
      if (st === 0xc0 && s.program !== null && ch !== 10) return null;   // (the mixer's instrument stands)
      if (st === 0xb0 && ((bytes[1] === 7 && s.vol !== null) || (bytes[1] === 10 && s.pan !== null))) return null;
      return { bytes, to: s.out };
    },
    reset() { sounding.clear(); levels.fill(0); }
  };
}
