/**
 * Music from events: the helpers a trigger's `emit` code calls, and the filter that keeps
 * overlapping notes from cutting each other off. Everything turns into raw MIDI messages,
 * { t, bytes } (t in transport seconds), which any output can play (outputs/gm.js, outputs/log.js).
 *
 *   note(ch, pitch, vel = 100, dur = 0.25)   ch 1..16; pitch a number or a name ('C#4'); vel 0..127;
 *                                            dur seconds, a time ('1 beat', '8n') or 'gate' (held until the trigger is left)
 *   notef(ch, pitch, vel, dur)               pitch and vel as 0..1
 *   cc(ch, n, v) / ccf(ch, n, v 0..1)        controllers;  bend(ch, v -1..1);  program(ch, n);  panic()
 *   map(v, [a, b], [c, d])  clamp(v, a, b)  lane(v 0..1, n)  quant(v, n)
 *   snap(n, scale, root)  step(n, k, scale, root)  noteName(n)  noteNumber(name)   (scale.js)
 *   rng()  launch(pathId, opts)  kill(id)  state   (the world's)
 *
 * The event's own fields (t, type, x, y, nx, ny, u, speed, p, dir, tag, traveler, trigger) are in scope
 * of the emit code as plain names; nx and ny run 0..1 across the board, y up.
 */
import { snap, step, noteName, noteNumber } from './scale.js';
import { resolveTimeValue } from '../time/timeValue.js';

const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || 0)));
const chan = ch => clampI(ch, 1, 16) - 1;

export const FIELDS = ['t', 'type', 'x', 'y', 'nx', 'ny', 'u', 'speed', 'p', 'dir', 'tag', 'traveler', 'trigger', 'data'];

/** Names of the helpers (the code compiled from `emit` gets these in scope). */
export const HELPER_NAMES = ['note', 'notef', 'cc', 'ccf', 'bend', 'program', 'panic', 'release', 'map', 'clamp', 'lane', 'quant', 'snap', 'step', 'noteName', 'noteNumber', 'rng', 'launch', 'kill', 'state', 'beats', 'seconds'];

/**
 * The helpers for one event. `out(msg)` receives { t, bytes }; `ctx` is the time context
 * ({ tempo, signature, fps }) that durations written as times are read in.
 */
export function musicHelpers({ out, ctx, event, api }) {
  const at = event.t;
  const seconds = v => {
    if (typeof v === 'number') return v;
    const s = resolveTimeValue(String(v), ctx);
    return Number.isFinite(s) ? s : 0;
  };
  const held = () => (api.state._held ||= []);
  const send = (t, ...bytes) => out({ t, bytes });
  const pitchOf = p => (typeof p === 'string' && !/^-?\d+(\.\d+)?$/.test(p) ? noteNumber(p) : Number(p));
  const note = (ch, pitch, vel = 100, dur = 0.25) => {
    const c = chan(ch), n = clampI(pitchOf(pitch), 0, 127), v = clampI(vel, 1, 127);
    send(at, 0x90 | c, n, v);
    if (dur === 'gate' && event.type === 'enter') held().push([c, n]);
    else send(at + Math.max(0.005, seconds(dur === 'gate' ? 0.25 : dur)), 0x80 | c, n, 0);
  };
  const release = () => {
    const h = held();
    for (const [c, n] of h.splice(0)) send(at, 0x80 | c, n, 0);
  };
  const lerp = (v, [a, b], [c, d]) => (b === a ? c : c + ((v - a) / (b - a)) * (d - c));
  return {
    note, release,
    notef: (ch, pitch, vel, dur) => note(ch, Math.trunc(pitchOf(pitch) * 127), Math.max(1, Math.trunc(vel * 127)), dur),
    cc: (ch, n, v) => send(at, 0xb0 | chan(ch), clampI(n, 0, 127), clampI(v, 0, 127)),
    ccf: (ch, n, v) => send(at, 0xb0 | chan(ch), clampI(n, 0, 127), clampI(v * 127, 0, 127)),
    bend: (ch, v) => { const b = clampI(8192 + v * 8191, 0, 16383); send(at, 0xe0 | chan(ch), b & 0x7f, b >> 7); },
    program: (ch, n) => send(at, 0xc0 | chan(ch), clampI(n, 0, 127)),
    panic: () => { for (let c = 0; c < 16; c++) send(at, 0xb0 | c, 123, 0); },
    map: lerp,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lane: (v, n) => Math.max(0, Math.min(n - 1, Math.floor(v * n))),
    quant: (v, n) => Math.round(v * n) / n,
    snap: (n, scale, root) => snap(n, scale, root),
    step: (n, k, scale, root) => step(n, k, scale, root),
    noteName, noteNumber,
    rng: api.rng, launch: api.launch, kill: api.kill, state: api.state,
    beats: n => seconds(`${n} beats`), seconds
  };
}

/**
 * Overlapping notes of one pitch share a count, so the first note-off does not end the second
 * note: a note-off is let through only when the last note on that channel and pitch ends. Feed it
 * messages in time order; it answers whether to send each one.
 */
export function createVoiceTracker() {
  const counts = new Map();
  return {
    pass(bytes) {
      const st = bytes[0] & 0xf0;
      if (st !== 0x90 && st !== 0x80) return true;
      const key = ((bytes[0] & 0x0f) << 8) | bytes[1];
      const on = st === 0x90 && bytes[2] > 0;
      if (on) { counts.set(key, (counts.get(key) || 0) + 1); return true; }
      const n = (counts.get(key) || 0) - 1;
      if (n > 0) { counts.set(key, n); return false; }
      counts.delete(key);
      return true;
    },
    reset() { counts.clear(); }
  };
}
