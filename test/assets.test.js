import { describe, it, expect } from 'vitest';
import { matches, normFolder } from '../src/assets/assetStore.js';

describe('asset search and folders', () => {
  const a = { title: 'Senecio (Baldgreis)', kind: 'klee', folder: 'Klee/1922', tags: ['klee', 'portrait'], meta: { artist: 'Paul Klee' } };
  it('matches every word across title, tags, folder and artist', () => {
    expect(matches(a, 'senecio 1922')).toBe(true);
    expect(matches(a, 'paul portrait')).toBe(true);
    expect(matches(a, 'castle')).toBe(false);
    expect(matches(a, '')).toBe(true);
  });
  it('#tag matches a tag exactly', () => {
    expect(matches(a, '#portrait')).toBe(true);
    expect(matches(a, '#port')).toBe(false);
  });
  it('normalizes folder paths', () => {
    expect(normFolder(' /Klee//1922/ ')).toBe('Klee/1922');
    expect(normFolder('')).toBe('');
  });
});
