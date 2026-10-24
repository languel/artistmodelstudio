import { describe, it, expect } from 'vitest';
import { outlineOf, centerOf, lengthOf, pointAt, nearestOn, nearestPath } from './geometry.js';

describe('geometry', () => {
  const row = [[0, 0], [10, 0], [10, 10]];
  it('measures and walks a polyline', () => {
    expect(lengthOf(row)).toBe(20);
    expect(pointAt(row, 0.25)).toEqual([5, 0, 1, 0]);
    expect(pointAt(row, 0.75)).toEqual([10, 5, 0, 1]);
    expect(pointAt(row, 2).slice(0, 2)).toEqual([10, 10]);
  });
  it('finds the nearest place and how far along it is', () => {
    const h = nearestOn(row, 4, 3);
    expect([h.x, h.y, h.d]).toEqual([4, 0, 3]);
    expect(h.u).toBeCloseTo(0.2);
    expect(nearestOn(row, 12, 6).u).toBeCloseTo(0.8);
    expect(nearestOn(row, -5, 0).u).toBe(0);
  });
  it('uses the drawn outline: smooth unless straight', () => {
    const e = { role: 'line', points: [[0, 0, 0, 0.5], [50, 40, 0, 0.5], [100, 0, 0, 0.5]] };
    expect(outlineOf(e).length).toBeGreaterThan(10);
    expect(outlineOf({ ...e, path: 'straight' })).toBe(e.points);
    expect(outlineOf({ role: 'line', points: [[0, 0], [1, 1]] }).length).toBe(2);
  });
  it('centers marks', () => {
    expect(centerOf({ role: 'point', points: [[3, 4]] })).toEqual([3, 4]);
    expect(centerOf({ role: 'plane', points: [[0, 0], [10, 0], [10, 10], [0, 10]] })).toEqual([5, 5]);
    expect(centerOf({ role: 'line', path: 'straight', points: [[0, 0], [10, 0]] })).toEqual([5, 0]);
  });
  it('picks the nearest path within a radius', () => {
    const a = { id: 'a', role: 'line', path: 'straight', points: [[0, 0], [100, 0]] }, b = { id: 'b', role: 'line', path: 'straight', points: [[0, 20], [100, 20]] };
    expect(nearestPath([a, b], 50, 12, 15)?.mark.id).toBe('b');
    expect(nearestPath([a, b], 50, 50, 15)).toBe(null);
    expect(nearestPath([a, b], 50, 3, 15, m => m.id !== 'a')).toBe(null);
  });
});
