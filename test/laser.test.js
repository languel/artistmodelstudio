import { describe, it, expect } from 'vitest';
import { laserOutline, laserWidth } from '../src/workbench/laser.js';

const LIFE = 1000;

describe('laser trail outline', () => {
  it('the width is the dot at the head and thins to a hairline at the tail', () => {
    expect(laserWidth(0)).toBeCloseTo(12, 6);
    expect(laserWidth(1)).toBeCloseTo(1, 6);
    expect(laserWidth(0.5)).toBeGreaterThan(laserWidth(0.8));
    expect(laserWidth(-1)).toBeCloseTo(12, 6);   // clamped
    expect(laserWidth(3)).toBeCloseTo(1, 6);
  });

  it('nothing to draw with fewer than two points', () => {
    expect(laserOutline([], 0, LIFE)).toBeNull();
    expect(laserOutline([{ x: 0, y: 0, t: 0 }], 0, LIFE)).toBeNull();
  });

  it('a held pointer whose trail has aged out is still a dot at the head', () => {
    const o = laserOutline([], 5000, LIFE, { head: { x: 3, y: 4 } });
    expect(o.left).toEqual([]);
    expect(o.head).toEqual([3, 4, 6]);
    expect(laserOutline([{ x: 0, y: 0, t: 0 }], 0, LIFE, { head: { x: 3, y: 4 } }).head).toBeTruthy();
  });

  it('a straight trail is a thin shape about the head width across, with both sides the same length', () => {
    const pts = [0, 10, 20, 30, 40].map((x, i) => ({ x, y: 0, t: i * 10 }));
    const o = laserOutline(pts, 50, LIFE);
    expect(o.left.length).toBe(o.right.length);
    // at the head the two sides are one width apart, perpendicular to the path (the path runs along x); the head is 10 ms old
    const head = o.left.at(-1), other = o.right.at(-1);
    expect(Math.abs(head[1] - other[1])).toBeCloseTo(laserWidth(10 / LIFE), 6);
    expect(laserWidth(10 / LIFE)).toBeGreaterThan(11);
    expect(Math.abs(head[0] - other[0])).toBeLessThan(1e-6);
  });

  it('the trail is continuous: consecutive outline points are never far apart', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ x: 100 * Math.cos(i / 6), y: 100 * Math.sin(i / 6), t: i * 16 }));
    const o = laserOutline(pts, 40 * 16, LIFE);
    const gap = side => Math.max(...side.slice(1).map((p, i) => Math.hypot(p[0] - side[i][0], p[1] - side[i][1])));
    expect(gap(o.left)).toBeLessThan(20);
    expect(gap(o.right)).toBeLessThan(20);
  });

  it('the head point is the newest point (the pointer), and the head dot matches the head width', () => {
    const pts = [{ x: 0, y: 0, t: 0 }, { x: 5, y: 0, t: 10 }];
    const o = laserOutline(pts, 10, LIFE, { head: { x: 20, y: 7 } });
    expect(o.head[0]).toBeCloseTo(20, 6);
    expect(o.head[1]).toBeCloseTo(7, 6);
    expect(o.head[2]).toBeCloseTo(6, 6);
  });
});
