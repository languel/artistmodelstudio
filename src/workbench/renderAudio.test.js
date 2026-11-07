import { describe, it, expect } from 'vitest';
import { encodeWav, soundPlan } from './renderAudio.js';

describe('render sound', () => {
  it('writes a 16-bit stereo WAV', () => {
    const w = encodeWav([new Float32Array([0, 1, -1, 0.5]), new Float32Array([0, 0, 0, 0])], 48000);
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF'); expect(String.fromCharCode(...w.slice(8, 12))).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(2); expect(v.getUint32(24, true)).toBe(48000); expect(v.getUint32(40, true)).toBe(4 * 2 * 2);
    expect(v.getInt16(44 + 4, true)).toBe(32767);    // 1.0 on the left of the second frame
    expect(v.getInt16(44 + 8, true)).toBe(-32768);   // -1.0
    expect(w.length).toBe(44 + 16);
  });
  it('plans sounds inside the range: starts, trims, speed, gain, fades; mute and silent media are left out', () => {
    const take = { clips: [
      { id: 'a', track: 'audio', src: 'data:a', start: 1000, dur: 4000, offset: 500, fx: { fade: 250 } },
      { id: 'b', track: 'audio', src: 'data:b', start: 0, dur: 4000, volume: 0.5 },
      { id: 'm', track: 'media', url: 'http://v/clip.mp4', start: 2000, dur: 2000, in: 10, speed: 2, volume: 0.8 },
      { id: 'q', track: 'media', url: 'http://v/quiet.mp4', start: 0, dur: 2000, in: 0, volume: 0 },
      { id: 'x', track: 'audio', src: 'data:x', start: 9000, dur: 1000 },
      { id: 'z', track: 'audio', lane: 'a2', src: 'data:z', start: 1000, dur: 1000 }], tracks: [{ id: 'audio', kind: 'audio' }, { id: 'a2', kind: 'audio', muted: true }] };
    const plan = soundPlan(take, [1500, 5000]);
    const by = Object.fromEntries(plan.map(p => [p.clip, p]));
    expect(Object.keys(by).sort()).toEqual(['a', 'b', 'm']);
    expect(by.a.when).toBe(0); expect(by.a.offset).toBeCloseTo(0.5 + 0.5);    // began 0.5 s before the range: starts 0.5 s in, plus its own 0.5 s offset
    expect(by.a.dur).toBeCloseTo(3.5);                                          // 1.5 s to 5 s of the range
    expect(by.a.fade).toBeCloseTo(0.25);
    expect(by.b.gain).toBe(0.5); expect(by.b.offset).toBeCloseTo(1.5);
    expect(by.m.when).toBeCloseTo(0.5); expect(by.m.rate).toBe(2); expect(by.m.offset).toBe(10); expect(by.m.gain).toBe(0.8);
  });
});
