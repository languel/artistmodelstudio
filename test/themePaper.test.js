import { describe, it, expect, afterEach } from 'vitest';
import { createDocument, inkOn, LIGHT_GROUND, DARK_GROUND } from '../src/process/document.js';

afterEach(() => { delete globalThis.document; });

describe('paper and pen by theme', () => {
  it('a new drawing starts on the theme\'s paper', () => {
    expect(createDocument().artboard.ground).toBe(LIGHT_GROUND);
    globalThis.document = { documentElement: { dataset: { theme: 'dark' } } };
    expect(createDocument().artboard.ground).toBe(DARK_GROUND);
    expect(createDocument({ ground: '#336699' }).artboard.ground).toBe('#336699');
  });
  it('picks a bright pen on dark paper and the brush\'s own ink on light paper', () => {
    expect(inkOn(DARK_GROUND)).toBe('#f1efe8');
    expect(inkOn('#000')).toBe('#f1efe8');
    expect(inkOn(LIGHT_GROUND)).toBe(null);
    expect(inkOn('#ffffff')).toBe(null);
    expect(inkOn('transparent')).toBe(null);
    expect(inkOn(undefined)).toBe(null);
  });
});
