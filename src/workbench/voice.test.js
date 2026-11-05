import { describe, it, expect } from 'vitest';
import { looksReady, silenceFor } from './voice.js';

describe('knowing when someone has finished', () => {
  it('sends whole requests and holds back dangling ones', () => {
    for (const t of ['create a red circle', 'change the fill to red.', 'make it bigger', 'delete it']) expect(looksReady(t), t).toBe(true);
    for (const t of ['', 'create', 'make a circle and', 'change the fill to', 'um', 'draw a red, ', 'move it to the']) expect(looksReady(t), t).toBe(false);
  });
  it('waits less after a sentence and more after a dangling word', () => {
    expect(silenceFor('delete it.')).toBeLessThan(silenceFor('delete it'));
    expect(silenceFor('delete it')).toBeLessThan(silenceFor('delete it and'));
  });
});
