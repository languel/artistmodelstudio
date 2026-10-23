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
