import { describe, it, expect } from 'vitest';
import { parseIntent } from './intents.js';

const COLORS = { red: '#ff0000', blue: '#0000ff', tan: '#d2b48c', '#333': '#333333' };
const say = (t, hasSelection = true) => parseIntent(t, { hasSelection, colorOf: c => COLORS[c] || null });

describe('instant phrases', () => {
  it('reads the fill and the stroke however they are said', () => {
    for (const t of ['change the fill to red', 'set the fill to red', 'fill red', 'fill it red', 'fill it with red', 'red fill', 'make the fill red', 'fill color red', 'please change the fill to red.', '/ change the fill to red'])
      expect(say(t), t).toMatchObject({ do: 'paint', which: 'fill', value: '#ff0000' });
    for (const t of ['stroke blue', 'change the stroke to blue', 'blue outline', 'set outline to blue']) expect(say(t), t).toMatchObject({ do: 'paint', which: 'stroke', value: '#0000ff' });
  });
  it('takes paint away', () => {
    for (const t of ['no fill', 'remove the fill', 'fill none', 'clear the fill']) expect(say(t), t).toMatchObject({ do: 'paint', which: 'fill', value: null });
  });
  it('a color said on its own, or of “it”, needs a selection and leaves which paint to the mark', () => {
    for (const t of ['red', 'make it red', 'turn this red', 'color them red', 'paint it red']) {
      expect(say(t), t).toMatchObject({ do: 'paint', which: 'auto', value: '#ff0000' });
      expect(say(t, false), t).toBe(null);
    }
  });
  it('opacity, blend and brush', () => {
    for (const t of ['opacity 50', 'opacity 50%', 'set opacity to 50%', '50% opacity', 'opacity 0.5', 'make it 50% transparent']) expect(say(t), t).toEqual({ do: 'opacity', value: 0.5 });
    for (const t of ['blend multiply', 'multiply blend', 'set blend mode to multiply']) expect(say(t), t).toEqual({ do: 'blend', value: 'multiply' });
    expect(say('ink brush')).toEqual({ do: 'brush', value: 'ink' });
    expect(say('use the ink brush')).toEqual({ do: 'brush', value: 'ink' });
    expect(say('nonsense brush')).toBe(null);
  });
  it('hide, lock and name the selection, keeping the name as written', () => {
    expect(say('hide it')).toMatchObject({ do: 'flag', key: 'hidden', value: true });
    expect(say('unlock')).toMatchObject({ do: 'flag', key: 'locked', value: false });
    expect(say('call it Big Horizon')).toEqual({ do: 'rename', value: 'Big Horizon' });
    expect(say('hide it', false)).toBe(null);
  });
  it('reads how a fill is painted', () => {
    for (const t of ['change fill to hatch', 'change the fill to hatch', 'fill with hatching', 'hatch fill', 'hatch', 'hatch it', 'make it hatched']) expect(say(t), t).toMatchObject({ do: 'style', brush: 'hatch', params: {}, fill: null });
    for (const t of ['crosshatch', 'cross hatch it', 'fill cross-hatched']) expect(say(t), t).toMatchObject({ do: 'style', brush: 'hatch', params: { cross: 1 } });
    for (const t of ['stipple', 'fill with dots']) expect(say(t), t).toMatchObject({ do: 'style', brush: 'stipple' });
    expect(say('solid fill')).toMatchObject({ do: 'style', brush: 'flat' });
    expect(say('change the fill to red hatch')).toMatchObject({ do: 'style', brush: 'hatch', fill: '#ff0000' });
    expect(say('hatch it', false)).toBe(null);
    expect(say('change fill to hatch', false)).toMatchObject({ do: 'style' });   // (intentCommand then finds no plane to change)
  });
  it('leaves everything else to the commands and the assistant', () => {
    for (const t of ['', 'fit', 'make it bigger', 'change the fill to something warm', 'draw a house', 'fill', 'group these', 'frame it']) expect(say(t), t).toBe(null);
  });
  it('makes new things', () => {
    for (const t of ['create a red circle', 'draw a red circle', 'add a red circle', 'red circle', 'make a red circle', 'new red circle', 'a circle in red']) expect(say(t, false), t).toMatchObject({ do: 'create', shape: 'circle', fill: '#ff0000' });
    for (const t of ['draw a blue square', 'add a blue rectangle', 'create a blue box']) expect(say(t, false), t).toMatchObject({ do: 'create', shape: 'rect', fill: '#0000ff' });
    expect(say('create a circle', false)).toMatchObject({ do: 'create', shape: 'circle', fill: null });
    expect(say('create a plaid circle', false)).toBe(null);
  });
});
