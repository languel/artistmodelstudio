import { describe, it, expect } from 'vitest';
import { markerFor, realizeAfter, partsOf, newPart, canBePath } from './playparts.js';

describe('play parts', () => {
  it('name the marker of a mark by what it is and plays', () => {
    expect(markerFor('point', { travel: {} })).toBe('traveler');
    expect(markerFor('point', { travel: {}, trigger: {} })).toBe('trigger');
    expect(markerFor('line', { path: true })).toBe('path');
    expect(markerFor('plane', { trigger: {} })).toBe('trigger');
    expect(markerFor('plane', { path: true })).toBe(null);   // no marker for a plane that is only a path
    expect(partsOf({ path: true, trigger: {} })).toEqual(['path', 'trigger']);
  });
  it('change the brush with the play, but leave a brush chosen on purpose', () => {
    const dot = { role: 'point', realize: { brush: 'dot', params: { size: 30 } } };
    expect(realizeAfter(dot, { travel: {} })).toEqual({ brush: 'traveler', params: {} });
    const marked = { role: 'point', realize: { brush: 'traveler', params: {} } };
    expect(realizeAfter(marked, { trigger: {} }).brush).toBe('trigger');
    expect(realizeAfter(marked, undefined)).toEqual({ brush: 'dot', params: {} });
    const custom = { role: 'point', realize: { brush: 'oil', params: {} } };
    expect(realizeAfter(custom, { travel: {} })).toBe(custom.realize);
    expect(realizeAfter(custom, undefined)).toBe(custom.realize);
  });
  it('start parts sensibly', () => {
    expect(newPart('travel', { path: 'row' })).toEqual({ on: 'row', dur: '8 beats', loop: 'once' });
    expect(canBePath({ role: 'line', points: [[0, 0], [1, 1]] })).toBe(true);
    expect(canBePath({ role: 'point', points: [[0, 0]] })).toBe(false);
  });
});
