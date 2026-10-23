import { describe, it, expect } from 'vitest';
import { midiFile, readMidiFile } from './midifile.js';

describe('MIDI file', () => {
  const msgs = [
    { t: 0, bytes: [0x90, 60, 100] }, { t: 0.5, bytes: [0x80, 60, 0] },
    { t: 0.5, bytes: [0x91, 64, 90] }, { t: 1.5, bytes: [0x81, 64, 0] },
    { t: 1, bytes: [0xc1, 24] }
  ];
  it('writes a valid header and track, in ticks at the scene tempo', () => {
    const f = midiFile(msgs, { tempo: 120, name: 'x' });
    expect(String.fromCharCode(...f.slice(0, 4))).toBe('MThd');
    expect(Array.from(f.slice(8, 14))).toEqual([0, 0, 0, 1, 1, 0xe0]);   // format 0, 1 track, 480 ppq
    expect(String.fromCharCode(...f.slice(14, 18))).toBe('MTrk');
    expect(f.at(-3)).toBe(0xff); expect(f.at(-2)).toBe(0x2f);
    const ev = readMidiFile(f);
    expect(ev).toEqual([
      { tick: 0, bytes: [0x90, 60, 100] },
      { tick: 480, bytes: [0x80, 60, 0] }, { tick: 480, bytes: [0x91, 64, 90] },   // 0.5 s at 120 bpm is one quarter note: 480 ticks
      { tick: 960, bytes: [0xc1, 24] },
      { tick: 1440, bytes: [0x81, 64, 0] }
    ]);
  });
  it('tempo changes the ticks, and overlapping notes end with the last off', () => {
    const ev = readMidiFile(midiFile(msgs, { tempo: 60 }));
    expect(ev[1].tick).toBe(240 * 1 * 1);   // 0.5 s at 60 bpm = 0.5 quarter = 240 ticks
    const over = readMidiFile(midiFile([{ t: 0, bytes: [0x90, 60, 100] }, { t: 0.2, bytes: [0x90, 60, 100] }, { t: 0.5, bytes: [0x80, 60, 0] }, { t: 1, bytes: [0x80, 60, 0] }], { tempo: 120 }));
    expect(over.filter(e => (e.bytes[0] & 0xf0) === 0x80)).toHaveLength(1);
  });
  it('long delays use multi-byte times', () => {
    const ev = readMidiFile(midiFile([{ t: 0, bytes: [0x90, 60, 100] }, { t: 600, bytes: [0x80, 60, 0] }], { tempo: 120 }));
    expect(ev[1].tick).toBe(600 * 960);
  });
});
