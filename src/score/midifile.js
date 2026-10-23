/**
 * A score as a Standard MIDI File (format 0, one track, 480 ticks a quarter note), to take into a DAW
 * or notation program. Input: the messages renderScore makes ({ t seconds, bytes }), the scene's tempo
 * and meter. Overlapping notes of one pitch are handled as playback does (the last note-off ends them).
 *
 *   const bytes = midiFile(messages, { tempo: 120, signature: { numerator: 4, denominator: 4 }, name: 'My score' })  → Uint8Array
 */
import { createVoiceTracker } from './music.js';

const PPQ = 480;

const be = (n, len) => Array.from({ length: len }, (_, i) => (n >> (8 * (len - 1 - i))) & 0xff);
/** A variable-length quantity. */
const vlq = n => {
  let v = Math.max(0, Math.round(n));
  const out = [v & 0x7f];
  while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
  return out;
};
const text = (type, s) => { const b = [...new TextEncoder().encode(s)]; return [0xff, type, ...vlq(b.length), ...b]; };
const LENGTH = { 0x80: 3, 0x90: 3, 0xa0: 3, 0xb0: 3, 0xc0: 2, 0xd0: 2, 0xe0: 3 };

export function midiFile(messages, { tempo = 120, signature = { numerator: 4, denominator: 4 }, name = '' } = {}) {
  const ticksPerSecond = (tempo / 60) * PPQ;
  const tracker = createVoiceTracker();
  const events = [];
  for (const m of [...messages].sort((a, b) => a.t - b.t || ((a.bytes[0] & 0xf0) === 0x80 ? -1 : 1))) {
    const st = m.bytes[0] & 0xf0, len = LENGTH[st];
    if (!len || !tracker.pass(m.bytes)) continue;
    events.push({ tick: Math.max(0, Math.round(m.t * ticksPerSecond)), data: m.bytes.slice(0, len) });
  }
  const track = [];
  if (name) track.push(0, ...text(0x03, name));
  const micros = Math.round(60000000 / tempo);
  track.push(0, 0xff, 0x51, 0x03, ...be(micros, 3));
  track.push(0, 0xff, 0x58, 0x04, signature.numerator, Math.round(Math.log2(signature.denominator)), 24, 8);
  let last = 0;
  for (const e of events) { track.push(...vlq(e.tick - last), ...e.data); last = e.tick; }
  track.push(0, 0xff, 0x2f, 0x00);
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, ...be(6, 4), ...be(0, 2), ...be(1, 2), ...be(PPQ, 2), 0x4d, 0x54, 0x72, 0x6b, ...be(track.length, 4), ...track]);
}

/** Read back the notes of a file made here (for tests and checks): [{ tick, bytes }] of the channel messages. */
export function readMidiFile(bytes) {
  const out = [];
  let p = 14 + 8;
  const end = 22 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(18);
  let tick = 0, status = 0;
  const readVlq = () => { let v = 0, b; do { b = bytes[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  while (p < end) {
    tick += readVlq();
    let b = bytes[p];
    if (b === 0xff) { const type = bytes[p + 1]; p += 2; const len = readVlq(); p += len; if (type === 0x2f) break; continue; }
    if (b & 0x80) { status = b; p++; }
    const len = LENGTH[status & 0xf0];
    out.push({ tick, bytes: [status, ...bytes.slice(p, p + len - 1)] });
    p += len - 1;
  }
  return out;
}
