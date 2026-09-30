import { describe, it, expect } from 'vitest';
import { envelope, reveal, lifeOf, expired, changing, nextChange, cutPath, normalizeTime } from './envelope.js';

describe('time envelopes', () => {
  it('fades in, holds and fades out', () => {
    const t = { in: 1, hold: 2, out: 1, curve: 'linear' };
    expect(lifeOf(t)).toBe(4);
    expect(envelope(t, 0)).toBe(0);
    expect(envelope(t, 0.5)).toBeCloseTo(0.5);
    expect(envelope(t, 2)).toBe(1);
    expect(envelope(t, 3.5)).toBeCloseTo(0.5);
    expect(envelope(t, 4)).toBe(0);
    expect(expired(t, 4.1)).toBe(true);
    expect(expired(t, 3)).toBe(false);
  });
  it('life fixes the end; the hold follows', () => {
    const t = { in: 0.5, out: 1, life: 5, curve: 'linear' };
    expect(lifeOf(t)).toBe(5);
    expect(envelope(t, 1)).toBe(1);
    expect(envelope(t, 4.5)).toBeCloseTo(0.5);
    expect(envelope(t, 5)).toBe(0);
  });
  it('a number is a fade out; no time is always there', () => {
    expect(normalizeTime(3)).toEqual({ in: 0, out: 3, curve: 'smooth' });
    expect(envelope(3, 0)).toBe(1);
    expect(envelope(3, 3)).toBe(0);
    expect(envelope(null, 100)).toBe(1);
    expect(lifeOf({ in: 1 })).toBe(Infinity);
    expect(expired({ in: 1 }, 1000)).toBe(false);
  });
  it('smooth curves stay between 0 and 1 and are monotonic', () => {
    const t = { in: 2, out: 2, life: 8 };
    let last = -1;
    for (let a = 0; a <= 2; a += 0.1) { const v = envelope(t, a); expect(v).toBeGreaterThanOrEqual(last); expect(v).toBeLessThanOrEqual(1); last = v; }
  });
  it('loops', () => {
    const t = { out: 2, loop: true, curve: 'linear' };
    expect(envelope(t, 3)).toBeCloseTo(envelope(t, 1));
    expect(expired(t, 100)).toBe(false);
    expect(changing(t, 100)).toBe(true);
  });
  it('draws a stroke on over time, and cuts the path to it', () => {
    const t = { draw: 2, curve: 'linear' };
    expect(reveal(t, 1)).toBeCloseTo(0.5);
    expect(reveal(t, 5)).toBe(1);
    expect(reveal(null, 0)).toBe(1);
    const path = [[0, 0], [10, 0], [10, 10]];
    expect(cutPath(path, 0.5)).toEqual([[0, 0], [10, 0]]);
    const q = cutPath(path, 0.75);
    expect(q.at(-1)[0]).toBeCloseTo(10); expect(q.at(-1)[1]).toBeCloseTo(5);
    expect(cutPath(path, 1)).toBe(path);
  });
  it('knows when a mark still changes', () => {
    expect(changing({ out: 2 }, 1)).toBe(true);
    expect(changing({ out: 2 }, 3)).toBe(false);
    expect(changing({ in: 1 }, 5)).toBe(false);
    expect(changing(null, 0)).toBe(false);
  });

  it('says when the next change is due: now while it moves, later while it stays, never when nothing changes', () => {
    const t = { in: 1, hold: 4, out: 2, draw: 3 };   // life 7
    expect(nextChange(t, 0.5)).toBe(0);          // fading in
    expect(nextChange(t, 2)).toBe(0);            // drawing on
    expect(nextChange(t, 4)).toBeCloseTo(1);     // it stays until 5, then fades out
    expect(nextChange(t, 6)).toBe(0);            // fading out
    expect(nextChange(t, 8)).toBe(Infinity);     // gone
    expect(nextChange({ life: 3 }, 1)).toBeCloseTo(2);   // it stays, then is gone at once
    expect(nextChange({ in: 1 }, 5)).toBe(Infinity);     // forever
    expect(nextChange({ in: 1, loop: true, out: 1 }, 5)).toBe(0);
    expect(changing({ life: 3 }, 1)).toBe(false);
  });
});
