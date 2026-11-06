import { describe, it, expect } from 'vitest';
import { effectsOf, shortInput } from './userActions.js';

describe('effectsOf', () => {
  it('leaves out a selection that is only the tool\'s side effect', () => {
    expect(effectsOf([{ text: 'Select nothing' }, { text: 'add line' }, { text: 'Select 1 mark' }])).toEqual(['add line']);
  });
  it('keeps a selection that is the point of the click, and says it plainly', () => {
    expect(effectsOf([{ text: 'Select 2 marks' }])).toEqual(['Select 2 marks']);
    expect(effectsOf([{ text: 'Select nothing' }])).toEqual(['Deselect']);
  });
  it('is fine with nothing', () => { expect(effectsOf([])).toEqual([]); });
});

describe('shortInput', () => {
  it('abbreviates pointer gestures', () => {
    expect(shortInput({ input: 'left drag' })).toBe('L drag');
    expect(shortInput({ input: '⇧ right click' })).toBe('⇧R click');
    expect(shortInput({ input: 'scroll up' })).toBe('scroll ↑');
    expect(shortInput({ input: '⌘Z' })).toBe('⌘Z');
  });
});
