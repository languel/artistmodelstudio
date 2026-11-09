import { describe, it, expect } from 'vitest';
import { trimStart, trimEnd, slip, slide, rippleTrimEnd, rippleTrimStart, setFade, fadesOf, fadeGain, crossfade, nextToJoin, inPoint } from './clipEdit.js';
import { addMark } from './marks.js';

let n = 0;
const aud = (start, dur, offset = 0, o = {}) => ({ id: `a${n++}`, track: 'audio', start, dur, offset, fx: {}, ...o });
const med = (start, dur, inS = 0, o = {}) => ({ id: `m${n++}`, track: 'media', start, dur, in: inS, out: inS + dur / 1000, speed: 1, fx: {}, ...o });
const take = (...clips) => ({ clips, tracks: [] });

describe('trimming', () => {
  it('moving the start of a sound keeps what it plays where it is', () => {
    const c = aud(1000, 4000, 500);
    expect(trimStart(c, 2000)).toBe(1000);
    expect([c.start, c.dur, c.offset]).toEqual([2000, 3000, 1500]);   // (the end is still 5000)
  });
  it('cannot start before the sound does, nor leave less than a sliver', () => {
    const c = aud(1000, 4000, 300);
    trimStart(c, 0); expect([c.start, c.offset]).toEqual([700, 0]);
    trimStart(c, 99999); expect(c.dur).toBe(50);
  });
  it('a moment of a video keeps its picture: the in-point moves, at its speed', () => {
    const c = med(0, 4000, 10, { speed: 2 });
    trimStart(c, 1000);
    expect(c.in).toBeCloseTo(12); expect(c.dur).toBe(3000); expect(c.out).toBeCloseTo(12 + 3 * 2);
    trimEnd(c, 3000); expect(c.dur).toBe(2000); expect(c.out).toBeCloseTo(12 + 2 * 2);
  });
  it('notes stay on what they were on when the head is cut', () => {
    const c = aud(0, 4000, 0, { marks: [] }); addMark(c, 1500, 'x'); addMark(c, 200, 'gone');
    trimStart(c, 1000);
    expect(c.marks.map(m => [m.text, m.at])).toEqual([['x', 500]]);
  });
});

describe('slip, slide and ripple', () => {
  it('slip changes what is shown, not where, and stops at the start of the source', () => {
    const c = aud(2000, 3000, 1000);
    expect(slip(c, 500)).toBe(500); expect([c.start, c.dur, c.offset]).toEqual([2000, 3000, 1500]);
    expect(slip(c, -5000)).toBe(-1500); expect(c.offset).toBe(0);
    expect(slip(aud(0, 1000, 0, { track: 'say' }), 100)).toBe(0);
  });
  it('slide moves a clip between its neighbours, which give way', () => {
    const a = aud(0, 2000), b = aud(2000, 2000, 5000), c = aud(4000, 2000, 1000), t = take(a, b, c);
    expect(slide(t, b, 500)).toBe(500);
    expect([a.start, a.dur]).toEqual([0, 2500]);
    expect([b.start, b.dur, b.offset]).toEqual([2500, 2000, 5000]);
    expect([c.start, c.dur, c.offset]).toEqual([4500, 1500, 1500]);
    expect(a.start + a.dur).toBe(b.start); expect(b.start + b.dur).toBe(c.start);
  });
  it('slide is limited by how short the neighbours may get', () => {
    const a = aud(0, 500), b = aud(500, 1000), c = aud(1500, 500, 5000), t = take(a, b, c);
    expect(slide(t, b, 5000)).toBe(450);    // (the one after may not get shorter than 50 ms)
    expect(slide(t, b, -5000)).toBe(-900);  // (nor the one before; and the one after has source to show earlier)
    const d = aud(0, 500), e = aud(500, 1000), f = aud(1500, 500, 0);
    expect(slide(take(d, e, f), e, -100)).toBe(0);   // (the one after has nothing of its sound before where it starts)
  });
  it('ripple trim moves every later clip on the track by what was lost or gained', () => {
    const a = aud(0, 3000), b = aud(3000, 1000), c = aud(4500, 1000), other = aud(3200, 500, 0, { lane: 'x' }), t = take(a, b, c, other);
    expect(rippleTrimEnd(t, a, 2000)).toBe(-1000);
    expect([b.start, c.start, other.start]).toEqual([2000, 3500, 3200]);
    rippleTrimEnd(t, a, 2500);
    expect([b.start, c.start]).toEqual([2500, 4000]);
  });
  it('ripple on a head cut: the clip stays, the rest closes up', () => {
    const a = aud(1000, 3000, 0), b = aud(4000, 1000), t = take(a, b);
    rippleTrimStart(t, a, 2000);
    expect([a.start, a.dur, a.offset]).toEqual([1000, 2000, 1000]);
    expect(b.start).toBe(3000);
  });
});

describe('fades and crossfades', () => {
  it('has fades in and out, and fx.fade means both', () => {
    expect(fadesOf({ fx: { fade: 300 } })).toEqual({ in: 300, out: 300 });
    const c = aud(1000, 2000);
    setFade(c, 'in', 500); setFade(c, 'out', 250);
    expect(fadesOf(c)).toEqual({ in: 500, out: 250 });
    expect(fadeGain(c, 1000)).toBe(0); expect(fadeGain(c, 1250)).toBeCloseTo(0.5); expect(fadeGain(c, 2000)).toBe(1); expect(fadeGain(c, 2875)).toBeCloseTo(0.5);
    setFade(c, 'in', 0); expect(fadeGain(c, 1000)).toBe(1);
    expect(setFade(c, 'out', 99999)).toBe(2000);
  });
  it('overlaps two clips that meet, with the sources giving what they can', () => {
    const a = aud(0, 2000, 0), b = aud(2000, 2000, 300);
    expect(crossfade(a, b, 1000)).toBe(1000);
    expect([b.start, b.offset, b.dur]).toEqual([1700, 0, 2300]);   // (300 ms of head from the source, the rest from the first)
    expect(a.dur).toBe(2700);
    expect(a.start + a.dur - b.start).toBe(1000);
    expect(fadesOf(a).out).toBe(1000); expect(fadesOf(b).in).toBe(1000);
    expect(a.fx.xfadeOut && b.fx.xfadeIn).toBe(true);
  });
  it('uses an overlap that is already there, and refuses clips far apart', () => {
    const a = aud(0, 2000), b = aud(1500, 2000);
    expect(crossfade(a, b, 3000)).toBe(500);
    expect(crossfade(aud(0, 1000), aud(5000, 1000), 500)).toBe(0);
  });
  it('a crossfade fades sound with equal power and a picture without fading the one going out', () => {
    const a = med(0, 2000), b = med(1000, 2000);
    crossfade(a, b, 1000);
    expect(fadeGain(a, 1500, { visual: true })).toBe(1);
    expect(fadeGain(b, 1500, { visual: true })).toBeCloseTo(0.5);
    const s1 = aud(0, 2000), s2 = aud(1000, 2000); crossfade(s1, s2, 1000);
    const mid = fadeGain(s1, 1500) ** 2 + fadeGain(s2, 1500) ** 2;
    expect(mid).toBeCloseTo(1, 1);
  });
  it('finds the clip a crossfade would join', () => {
    const a = aud(0, 1000), b = aud(1000, 1000), c = aud(9000, 1000), t = take(a, b, c);
    expect(nextToJoin(t, a)).toBe(b); expect(nextToJoin(t, b)).toBeNull();
    expect(inPoint(med(0, 1000, 2))).toBe(2000);
  });
});
