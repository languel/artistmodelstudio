import { describe, it, expect } from 'vitest';
import { normalizeTransport, loopRange, timeContext, DEFAULT_TRANSPORT } from './sceneTransport.js';
import { normalizeDocument, createDocument } from '../process/document.js';

describe('scene transport', () => {
  it('fills defaults and clamps', () => {
    expect(normalizeTransport(undefined)).toEqual({ ...DEFAULT_TRANSPORT, signature: { numerator: 4, denominator: 4 }, loop: { start: 0, end: 0 } });
    const t = normalizeTransport({ tempo: 9000, signature: { numerator: 7, denominator: 8 }, fps: 29, ruler: 'nope', loop: { start: 4, end: 2 } });
    expect(t).toMatchObject({ tempo: 400, signature: { numerator: 7, denominator: 8 }, fps: 30, ruler: 'time' });
    expect(loopRange(t)).toBe(null);
  });
  it('a loop range needs an end after its start', () => {
    expect(loopRange(normalizeTransport({ loop: { start: 1, end: 5 } }))).toEqual([1, 5]);
    expect(timeContext(normalizeTransport({ tempo: 90 }))).toEqual({ tempo: 90, signature: { numerator: 4, denominator: 4 }, fps: 30 });
  });
  it('travels with the document, and is absent until set', () => {
    expect(createDocument().transport).toBeUndefined();
    expect(normalizeDocument(createDocument()).transport).toBeUndefined();
    const d = normalizeDocument({ ...createDocument(), transport: { tempo: 90, ruler: 'beats' } });
    expect(d.transport).toMatchObject({ tempo: 90, ruler: 'beats' });
  });
});

import { formatLength } from './sceneTransport.js';
describe('length in words', () => {
  it('says bars when it is whole bars', () => {
    expect(formatLength(4)).toBe('1 bar'); expect(formatLength(8)).toBe('2 bars'); expect(formatLength(3)).toBe('3 beats');
    expect(formatLength(1)).toBe('1 beat'); expect(formatLength(1.5)).toBe('1.5 beats'); expect(formatLength(6, 3)).toBe('2 bars');
  });
});

import { snapStep, snapTime } from './sceneTransport.js';
describe('the Timeline grid', () => {
  const t = (o = {}) => normalizeTransport({ tempo: 120, ruler: 'beats', ...o });
  it('auto follows the zoom: finer divisions as you zoom in', () => {
    expect(snapStep(t(), 20)).toBeCloseTo(0.5, 6);          // a beat (0.5 s) is 10 px
    expect(snapStep(t(), 200)).toBeCloseTo(0.0625, 6);      // an eighth of a beat
    expect(snapStep(t(), 2)).toBeCloseTo(8, 6);             // four bars
    expect(snapStep(t({ ruler: 'frames', fps: 30 }), 300)).toBeCloseTo(1 / 30, 6);
    expect(snapStep(t({ ruler: 'time' }), 60)).toBeCloseTo(0.25, 6);
  });
  it('a chosen division, or none', () => {
    expect(snapStep(t({ snap: '0.25 beat' }), 1)).toBeCloseTo(0.125, 6);
    expect(snapStep(t({ snap: '1 bar' }), 1)).toBeCloseTo(2, 6);
    expect(snapStep(t({ snap: 'off' }), 100)).toBe(0);
    expect(snapTime(1.3, t({ snap: '1 beat' }), 100)).toBeCloseTo(1.5, 6);
    expect(snapTime(1.3, t({ snap: 'off' }), 100)).toBe(1.3);
  });
});
