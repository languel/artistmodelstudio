import { describe, it, expect } from 'vitest';
import { erasePoints, eraseMark, sweepTouches } from './erase.js';

const line = (n = 11, step = 10) => Array.from({ length: n }, (_, i) => [i * step, 0, i * 100, 0.5]);
const at = (x, y, r = 5) => ({ ax: x, ay: y, bx: x, by: y, r });

describe('eraser', () => {
  it('leaves a mark it does not touch', () => {
    expect(erasePoints(line(), at(50, 40))).toBe(null);
  });
  it('cuts a line in two where it crosses the middle', () => {
    const pieces = erasePoints(line(), { ax: 50, ay: -20, bx: 50, by: 20, r: 5 });
    expect(pieces.length).toBe(2);
    expect(pieces[0][0][0]).toBe(0);
    expect(pieces[1].at(-1)[0]).toBe(100);
    // the cut lands near the edge of the tip, not at the next drawn point
    expect(pieces[0].at(-1)[0]).toBeGreaterThan(43);
    expect(pieces[0].at(-1)[0]).toBeLessThan(45.01);
    expect(pieces[1][0][0]).toBeGreaterThan(54.99);
  });
  it('cuts a long segment between two points (no points under the tip)', () => {
    const pieces = erasePoints([[0, 0, 0, 0.5], [100, 0, 1000, 0.5]], { ax: 50, ay: -20, bx: 50, by: 20, r: 4 });
    expect(pieces.length).toBe(2);
    expect(pieces[0].length).toBe(2);
    expect(pieces[0][1][2]).toBeGreaterThan(400);   // time carried to the cut
  });
  it('trims an end without splitting', () => {
    const pieces = erasePoints(line(), at(0, 0, 12));
    expect(pieces.length).toBe(1);
    expect(pieces[0][0][0]).toBeGreaterThanOrEqual(12);
  });
  it('erases all of it', () => {
    expect(erasePoints(line(3, 2), at(2, 0, 20))).toEqual([]);
  });
  it('opens a closed line where it is cut', () => {
    const sq = [[0, 0], [100, 0], [100, 100], [0, 100]].map((p, i) => [...p, i, 0.5]);
    const pieces = erasePoints(sq, { ...at(50, 0, 5), closed: true });
    expect(pieces.length).toBe(1);
    expect(pieces[0][0][0]).toBeGreaterThan(54);
    expect(pieces[0].at(-1)[0]).toBeLessThan(46);
  });
  it('keeps a plane one closed shape', () => {
    const sq = [[0, 0], [100, 0], [100, 100], [0, 100]].map(p => [...p, 0, 0.5]);
    const res = eraseMark({ role: 'plane', points: sq }, at(100, 100, 10));
    expect(res.pieces.length).toBe(1);
    expect(res.pieces[0].length).toBeGreaterThanOrEqual(4);
  });
  it('erases a point under the tip, and leaves notes alone', () => {
    expect(eraseMark({ role: 'point', points: [[3, 3, 0, 0.5]] }, at(0, 0))).toEqual({ pieces: [] });
    expect(eraseMark({ role: 'note', points: [[3, 3, 0, 0.5]] }, at(0, 0))).toBe(null);
    expect(sweepTouches(line(), at(50, 40))).toBe(false);
  });
});
