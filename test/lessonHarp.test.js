import { describe, expect, it } from 'vitest';
import { Harp } from '../lessons/threejs/lib/harp.js';
import { noteMidi, midiHz, noteName } from '../lessons/threejs/lib/synth.js';

const harp = (o = {}) => { const h = new Harp({ beams: 5, span: 1, ...o }); h.place({ x: 0, y: 0, z: -2 }); return h; };
// a fingertip moving along z at x, y: from z0 to z1 in n steps at 30 fps
let ids = 0;   // each sweep is a new fingertip, so one test sweep does not teleport into the next
const sweep = (h, x, y, z0, z1, n = 12, t0 = 0) => {
  const out = [], id = 'tip' + ids++;
  for (let k = 0; k <= n; k++) out.push(...h.update([{ id, p: { x, y, z: z0 + (z1 - z0) * k / n }, ok: true }], t0 + k / 30));
  return out;
};

describe('laser harp', () => {
  it('plucks the beam a fingertip passes through, in either direction', () => {
    const h = harp();
    expect(sweep(h, 0, 0, -1.8, -2.2).map(p => p.beam)).toEqual([2]);      // away from the camera, middle beam
    expect(sweep(h, 0.5, 0, -2.2, -1.8, 12, 1).map(p => p.beam)).toEqual([4]);   // back toward it, outer beam
  });
  it('maps x to the nearest beam and ignores gaps, height and width outside the harp', () => {
    const h = harp();
    expect(sweep(h, -0.25, 0, -1.8, -2.2)[0].beam).toBe(1);
    expect(sweep(h, 0.7, 0, -1.8, -2.2, 12, 1)).toEqual([]);            // right of the last beam
    expect(sweep(h, 0, 0.9, -1.8, -2.2, 12, 2)).toEqual([]);            // above the beams
  });
  it('does not pluck on jitter within the hysteresis band', () => {
    const h = harp(); let n = 0;
    for (let k = 0; k < 60; k++) n += h.update([{ id: 'r', p: { x: 0, y: 0, z: -2 + (k % 2 ? 0.02 : -0.02) }, ok: true }], k / 30).length;
    expect(n).toBe(0);
  });
  it('reports speed and respects the refractory time', () => {
    const h = harp(), at = z => ({ id: 'r', p: { x: 0, y: 0, z }, ok: true });
    h.update([at(-1.9)], 0);
    const [p] = h.update([at(-2.1)], 1 / 30);                              // through the plane: a pluck, with speed
    expect(p.speed).toBeGreaterThan(0.5);
    expect(h.update([at(-1.9)], 2 / 30)).toEqual([]);                      // straight back 33 ms later: too soon for the same beam
    expect(h.update([at(-1.9)], 0.3).length + h.update([at(-2.1)], 0.33).length).toBe(1);   // later it can pluck again
  });
  it('forgets a hand that is not tracked', () => {
    const h = harp();
    h.update([{ id: 'r', p: { x: 0, y: 0, z: -1.8 }, ok: true }], 0);
    h.update([{ id: 'r', p: { x: 0, y: 0, z: -1.8 }, ok: false }], 0.03);
    expect(h.update([{ id: 'r', p: { x: 0, y: 0, z: -2.2 }, ok: true }], 0.06)).toEqual([]);   // reappears behind the plane: no pluck
  });
});

describe('notes', () => {
  it('climbs the scale and wraps by an octave', () => {
    expect([0, 1, 4, 5, 6].map(i => noteMidi(60, 'pentatonic minor', i))).toEqual([60, 63, 70, 72, 75]);
    expect(midiHz(69)).toBeCloseTo(440); expect(noteName(60)).toBe('C4');
  });
});
