import { describe, it, expect } from 'vitest';
import { clampPps, zoomAt, fitRange, reveal, centerOn, visibleRange, rulerStep, timeTicks, frameTicks, beatTicks, gridLayer, timeLabel, editPoints, nextEdit, MIN_PPS, MAX_PPS } from './timelineView.js';

describe('timeline view', () => {
  it('clamps the zoom, closer for short timelines than for long ones', () => {
    expect(clampPps(0)).toBe(60);
    expect(clampPps(1e-6)).toBe(MIN_PPS);
    expect(clampPps(1e9, 10_000)).toBe(MAX_PPS);
    // A three-hour film cannot be drawn at a frame a hundred pixels wide: the lanes would be too wide.
    expect(clampPps(1e9, 3 * 3600_000)).toBeLessThan(1000);
  });

  it('zooms about a point: the time under the pointer stays under it', () => {
    const v = { pps: 50, left: 300 };
    const anchor = 120, t = (v.left + anchor) / v.pps;
    const z = zoomAt(v, 2, anchor);
    expect(z.pps).toBe(100);
    expect((z.left + anchor) / z.pps).toBeCloseTo(t, 9);
    const out = zoomAt(z, 0.5, anchor);
    expect(out.pps).toBe(50);
    expect(out.left).toBeCloseTo(300, 9);
    // never scrolled before the start
    expect(zoomAt({ pps: 50, left: 0 }, 0.5, 100).left).toBe(0);
  });

  it('fits a range with equal margins', () => {
    const v = fitRange(10_000, 20_000, 1000, { pad: 0.05 });
    const [t0, t1] = visibleRange(v, 1000);
    expect(t0).toBeCloseTo(10_000 - (t1 - t0) * 0.05, 3);
    expect(t1).toBeCloseTo(20_000 + (t1 - t0) * 0.05, 3);
    expect(t0).toBeLessThan(10_000);
    expect(t1).toBeGreaterThan(20_000);
  });

  it('fits a point (a clip of no length) at a sensible zoom, centred', () => {
    const v = fitRange(5000, 5000, 800);
    const [t0, t1] = visibleRange(v, 800);
    expect((t0 + t1) / 2).toBeCloseTo(5000, 3);
    expect(t1 - t0).toBeGreaterThan(200);
  });

  it('fits from the start without scrolling before it', () => {
    expect(fitRange(0, 60_000, 600).left).toBe(0);
  });

  it('reveals and centres', () => {
    const v = { pps: 100, left: 0 };
    expect(reveal(v, 2000, 500)).toEqual(v);               // in view
    expect(reveal(v, 10_000, 500).left).toBe(1000 - 500 + 40);
    expect(reveal({ pps: 100, left: 900 }, 1000, 500).left).toBe(60);
    expect(centerOn(v, 10_000, 500).left).toBe(750);
  });

  it('labels the time ruler with steps that leave room', () => {
    expect(rulerStep(60) * 60).toBeGreaterThanOrEqual(64);
    expect(rulerStep(2000)).toBeLessThan(0.1);
    expect(rulerStep(0.02)).toBeGreaterThanOrEqual(3600);
    const { step, ticks } = timeTicks(0, 10, 60);
    expect(ticks.filter(k => k.major).every(k => Math.abs(k.time / step - Math.round(k.time / step)) < 1e-6)).toBe(true);
    expect(ticks.some(k => !k.major)).toBe(true);
    // only the range asked for, not the whole timeline
    expect(timeTicks(3000, 3010, 60).ticks.length).toBeLessThan(40);
  });

  it('writes ruler labels', () => {
    expect(timeLabel(0, 1)).toBe('0:00');
    expect(timeLabel(75, 5)).toBe('1:15');
    expect(timeLabel(1.5, 0.5)).toBe('0:01.5');
    expect(timeLabel(0.25, 0.05)).toBe('0:00.25');
    expect(timeLabel(3725, 60)).toBe('1:02:05');
  });

  it('steps between edit points', () => {
    const pts = editPoints([{ start: 1000, dur: 500 }, { start: 4000, dur: 1000 }], [2000, 3000], 6000);
    expect(pts).toEqual([0, 1000, 1500, 2000, 3000, 4000, 5000, 6000]);
    expect(nextEdit(pts, 1000, 1)).toBe(1500);
    expect(nextEdit(pts, 1200, -1)).toBe(1000);
    expect(nextEdit(pts, 0, -1)).toBe(null);
    expect(nextEdit(pts, 6000, 1)).toBe(null);
  });

  it('labels frames as often as they have room', () => {
    // 30 fps at 670 px a second: a frame is 22 px, so every second frame is labelled
    const { step, ticks } = frameTicks(1, 2, 670, 30);
    expect(step).toBeCloseTo(2 / 30, 9);
    expect(ticks.filter(k => k.major).length).toBeGreaterThan(10);
    // far out: seconds, then minutes
    expect(frameTicks(0, 60, 40, 30).step).toBeCloseTo(2, 9);
    expect(frameTicks(0, 600, 1, 30).step).toBeGreaterThanOrEqual(60);
  });

  it('labels beats, bars, or groups of bars', () => {
    const sig = { numerator: 4, denominator: 4 };
    expect(beatTicks(0, 8, 200, { tempo: 120, signature: sig }).step).toBeCloseTo(0.25, 9);   // eighths (a beat is 100 px)
    expect(beatTicks(0, 8, 30, { tempo: 120, signature: sig }).step).toBeCloseTo(2, 9);       // bars
    expect(beatTicks(0, 80, 5, { tempo: 120, signature: sig }).step).toBeCloseTo(16, 9);      // eight bars
  });

  it('draws grid lines in phase with the content, wherever the box starts', () => {
    expect(gridLayer(50, 0, 'red')).toBe('repeating-linear-gradient(90deg, red 0px 1px, transparent 1px 50px)');
    // a box 120 px in: the next line is 30 px into it (at 150)
    expect(gridLayer(50, 120, 'red')).toBe('repeating-linear-gradient(90deg, red -20px -19px, transparent -19px 30px)');
  });
});
