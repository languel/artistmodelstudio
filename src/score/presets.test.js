import { describe, it, expect } from 'vitest';
import { emitFor, readPreset, clean, DEFAULTS, PRESETS } from './presets.js';
import { compileEmit } from './compile.js';
import { musicHelpers } from './music.js';

const ctx = { tempo: 120, signature: { numerator: 4, denominator: 4 }, fps: 30 };
const run = (code, event) => {
  const out = [];
  const api = { state: {}, rng: Math.random, launch() {}, kill() {}, arrive() {}, spawn() {}, effect() {} };
  const h = musicHelpers({ out: m => out.push(m), ctx, event: { t: 1, ...event }, api });
  compileEmit(code, Object.keys(h))(h, { t: 1, ...event }, api);
  return out;
};

describe('presets', () => {
  it('write code the settings can be read back from', () => {
    for (const p of PRESETS) {
      const code = emitFor(DEFAULTS[p.k]);
      expect(readPreset(code)).toEqual(clean(DEFAULTS[p.k]));
    }
  });
  it('are custom the moment the code is edited', () => {
    const code = emitFor(DEFAULTS.height);
    expect(readPreset(code + '\n')).toBe(null);
    expect(readPreset(code.replace('90', '91'))).toBe(null);
    expect(readPreset('note(1, 60)')).toBe(null);
    expect(readPreset('// preset {not json}\nnote()')).toBe(null);
  });
  it('bring settings into range', () => {
    expect(clean({ k: 'height', ch: 99, lo: 90, hi: 20, vel: 0, scale: 'Dorian' })).toMatchObject({ ch: 16, lo: 20, hi: 90, vel: 1, scale: 'dorian' });
    expect(clean({ k: 'height', scale: '' }).scale).toBe('');
    expect(clean({ k: 'nope' }).k).toBe('height');
  });
  it('play what they say', () => {
    const fixed = run(emitFor({ k: 'note', ch: 2, pitch: 64, vel: 80, dur: 0.5 }), { type: 'enter' });
    expect(fixed.map(m => m.bytes)).toEqual([[0x91, 64, 80], [0x81, 64, 0]]);
    expect(fixed[1].t).toBeCloseTo(1.5);
    // Height 0.5 of 49 steps from 48 is 72; D dorian root 62 has no... it snaps to the nearest scale note.
    const high = run(emitFor({ k: 'height', ch: 1, lo: 48, hi: 72, scale: '', vel: 90, dur: 0.1 }), { type: 'enter', ny: 1 });
    expect(high[0].bytes).toEqual([0x90, 72, 90]);
    const low = run(emitFor({ k: 'height', ch: 1, lo: 48, hi: 72, scale: '', vel: 90, dur: 0.1 }), { type: 'enter', ny: 0 });
    expect(low[0].bytes[1]).toBe(48);
    const gate = run(emitFor(DEFAULTS.height), { type: 'enter', ny: 0.5 });
    expect(gate).toHaveLength(1);   // held until the trigger is left
    const along = run(emitFor({ ...DEFAULTS.along, scale: '' }), { type: 'enter', u: 0.5, ny: 0 });
    expect(along[0].bytes[1]).toBe(60);
    expect(run(emitFor({ k: 'cc', ch: 3, cc: 74 }), { type: 'enter', ny: 0.5 })[0].bytes).toEqual([0xb2, 74, 64]);
    const hit = run(emitFor(DEFAULTS.collide), { type: 'collide', traveler: 'a', other: 'b', ny: 0.5, speed: 100 });
    expect(hit).toHaveLength(2);
    expect(run(emitFor(DEFAULTS.collide), { type: 'collide', traveler: 'b', other: 'a', ny: 0.5, speed: 100 })).toHaveLength(0);   // one voice a collision
  });
});
