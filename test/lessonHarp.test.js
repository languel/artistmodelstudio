import { describe, expect, it } from 'vitest';
import { Harp } from '../lessons/threejs/lib/harp.js';
import { noteMidi, midiHz, noteName } from '../lessons/threejs/lib/synth.js';

const harp = (o = {}) => { const h = new Harp({ beams: 5, span: 1, fan: 1, ...o }); h.place({ x: 0, y: 0, z: -2 }); return h; };
const tip = (x, y, z, ok = true, id = 'r') => ({ id, p: { x, y, z }, ok });

describe('laser harp', () => {
  it('a fingertip at the plane on a beam interrupts it, with the height as a 0..1 control', () => {
    const h = harp(), r = h.update([tip(0, 0.1, -2)], 0);
    expect(r.on).toEqual([2]);
    expect(r.holds[0].h).toBeCloseTo((0.1 - h.yMin) / (h.yMax - h.yMin));
    expect(h.update([tip(0, 0.4, -2)], 0.03).holds[0].h).toBeGreaterThan(r.holds[0].h);   // higher up the beam
  });
  it('is not interrupted from in front of the plane, between beams, or above and below the beams', () => {
    const h = harp();
    expect(h.update([tip(0, 0, -1.8)], 0).on).toEqual([]);          // 20 cm in front: depth says it is not touching
    expect(h.update([tip(0.125, 0, -2)], 0.03).on).toEqual([]);     // in the gap between beams
    expect(h.update([tip(0, 0.9, -2)], 0.06).on).toEqual([]);       // above
    expect(h.update([tip(0, -1.2, -2)], 0.09).on).toEqual([]);      // below the emitters
  });
  it('holds through depth jitter (hysteresis) and releases after the grace time when the hand leaves', () => {
    const h = harp(); h.update([tip(0, 0, -2)], 0);
    expect(h.update([tip(0, 0, -2.07)], 0.03).off).toEqual([]);      // 7 cm: past enter, inside leave
    expect(h.update([tip(0, 0, -1.7)], 0.06).off).toEqual([]);       // gone, but within the grace time
    expect(h.update([tip(0, 0, -1.7)], 0.2).off).toEqual([2]);       // now released
  });
  it('a dropped frame does not end the note', () => {
    const h = harp(); h.update([tip(0, 0, -2)], 0);
    expect(h.update([tip(0, 0, -2, false)], 0.03).off).toEqual([]);
    expect(h.update([tip(0, 0, -2)], 0.06).on).toEqual([]);           // still the same hold, no new onset
  });
  it('two hands play two beams; two fingers on one beam count once', () => {
    const h = harp();
    expect(h.update([tip(-0.25, 0, -2, true, 'l'), tip(0.25, 0, -2, true, 'r')], 0).on.sort()).toEqual([1, 3]);
    const h2 = harp(); const r = h2.update([tip(0.01, 0, -2, true, 'a'), tip(0.03, 0.1, -2, true, 'b')], 0);
    expect(r.holds.length).toBe(1); expect(r.holds[0].tip).toBe('a');
  });
  it('beams fan out from the emitters: the contact x follows the tilted beam', () => {
    const h = harp({ fan: 0.2 });
    expect(h.beamXAt(4, h.yMin)).toBeCloseTo(0.5 * 0.2);   // near the middle at the bottom
    expect(h.beamXAt(4, h.yMax)).toBeCloseTo(0.5);         // full spread at the top
    expect(h.update([tip(0.5, h.yMax - 0.01, -2)], 0).on).toEqual([4]);
    expect(harp({ fan: 0.2 }).update([tip(0.5, 0.0, -2)], 0).on).toEqual([]);   // at mid height the beam has not reached x = 0.5 yet
  });
});

describe('notes', () => {
  it('climbs the scale and wraps by an octave', () => {
    expect([0, 1, 4, 5, 6].map(i => noteMidi(60, 'pentatonic minor', i))).toEqual([60, 63, 70, 72, 75]);
    expect(midiHz(69)).toBeCloseTo(440); expect(noteName(60)).toBe('C4');
  });
});
