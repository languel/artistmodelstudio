import { describe, it, expect } from 'vitest';
import { readStopmotion, writeStopmotion, rangeOf, changedPercent, STOPMOTION_TEMPLATE } from '../src/process/stopmotion.js';

const frames = Array.from({ length: 10 }, (_, i) => `a${i}`);

describe('the stop-motion spec', () => {
  it('reads the template with the recorder defaults and no range', () => {
    const sm = readStopmotion(STOPMOTION_TEMPLATE);
    expect(sm).toMatchObject({ record: 'rate', change: 1, in: 0, out: null, frames: [] });
  });

  it('writes and reads back the recorder mode, the threshold and the range', () => {
    const code = writeStopmotion({ source: 'x', fps: 12, record: 'change', change: 2.5, in: 2, out: 6, frames });
    const sm = readStopmotion(code);
    expect(sm).toMatchObject({ fps: 12, record: 'change', change: 2.5, in: 2, out: 6 });
    expect(rangeOf(sm)).toEqual([2, 6]);
  });

  it('leaves the range out of the code when it is all of the frames', () => {
    const code = writeStopmotion({ frames });
    expect(code).not.toMatch(/\bin:|\bout:/);
    expect(rangeOf(readStopmotion(code))).toEqual([0, 9]);
  });

  it('keeps a range inside the frames and in order', () => {
    expect(rangeOf(readStopmotion(writeStopmotion({ in: 40, out: 99, frames })))).toEqual([9, 9]);
    const sm = readStopmotion(writeStopmotion({ in: 5, out: 3, frames }));
    expect(sm.out).toBeGreaterThanOrEqual(sm.in);
    expect(sm.out == null || sm.out >= 5).toBe(true);
  });

  it('an out at the last frame is "to the end"; no frames have an empty range', () => {
    expect(readStopmotion(writeStopmotion({ out: 9, frames })).out).toBeNull();
    expect(rangeOf(readStopmotion(writeStopmotion({ frames: [] })))).toEqual([0, -1]);
  });

  it('takes only "change" as the other recorder mode', () => {
    expect(readStopmotion("stopmotion({ record: 'nonsense', frames: [] })").record).toBe('rate');
  });
});

describe('changedPercent', () => {
  const a = new Uint8Array(100).fill(100);
  it('is 0 for the same picture and for a change too small to see', () => {
    expect(changedPercent(a, a)).toBe(0);
    expect(changedPercent(a, a.map(v => v + 8))).toBe(0);
  });
  it('is the percent of cells that moved', () => {
    const b = a.slice(); for (let i = 0; i < 5; i++) b[i] = 200;
    expect(changedPercent(a, b)).toBe(5);
    expect(changedPercent(a, a.map(v => v + 40))).toBe(100);
  });
});
