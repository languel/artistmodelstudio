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
    for (const t of ['', 'fit', 'change the fill to something warm', 'draw a house', 'fill', 'group these', 'frame it']) expect(say(t), t).toBe(null);
  });
  it('makes new things', () => {
    for (const t of ['create a red circle', 'draw a red circle', 'add a red circle', 'red circle', 'make a red circle', 'new red circle', 'a circle in red']) expect(say(t, false), t).toMatchObject({ do: 'create', shape: 'circle', fill: '#ff0000' });
    for (const t of ['draw a blue square', 'add a blue rectangle', 'create a blue box']) expect(say(t, false), t).toMatchObject({ do: 'create', shape: 'rect', fill: '#0000ff' });
    expect(say('create a circle', false)).toMatchObject({ do: 'create', shape: 'circle', fill: null });
    expect(say('create a plaid circle', false)).toBe(null);
  });
  it('several things, and several recolors', () => {
    expect(say('draw three circles in a row', false)).toMatchObject({ do: 'create', shape: 'circle', count: 3, dir: 'row' });
    expect(say('three red squares down the page', false)).toMatchObject({ do: 'create', shape: 'rect', count: 3, dir: 'column', fill: '#ff0000' });
    expect(say('add 4 circles', false)).toMatchObject({ do: 'create', count: 4 });
    expect(say('a red circle', false)).not.toHaveProperty('count');
    expect(say('make the circle blue and the square red', false)).toMatchObject({ do: 'recolor', pairs: [{ target: 'circle', hex: '#0000ff' }, { target: 'square', hex: '#ff0000' }] });
    expect(say('the square should be red and the circle blue', false)).toMatchObject({ do: 'recolor', pairs: [{ target: 'square', hex: '#ff0000' }, { target: 'circle', hex: '#0000ff' }] });
    expect(say('red and blue', false)).toBe(null);
  });
  it('size and place', () => {
    for (const [txt, k] of [['bigger', 1.25], ['make it bigger', 1.25], ['smaller', 0.75], ['50% bigger', 1.5], ['scale it up by half', 1.5], ['double', 2], ['twice as big', 2], ['half the size', 0.5], ['scale it 2x', 2]]) expect(say(txt), txt).toMatchObject({ do: 'transform', scale: k });
    expect(say('move it right')).toMatchObject({ do: 'transform', move: [100, 0] });
    expect(say('move it 200 to the left')).toMatchObject({ do: 'transform', move: [-200, 0] });
    expect(say('shift it up a bit')).toMatchObject({ do: 'transform', move: [0, -40] });
  });
  it('a dot is a point, round things are circles', () => {
    expect(say('add a red dot', false)).toMatchObject({ do: 'create', shape: 'point' });
    expect(say('three round shapes side by side', false)).toMatchObject({ do: 'create', shape: 'circle', count: 3 });
  });
  it('asking for a program', () => {
    for (const t of ['write code for a spiral of 200 points', 'write a program that scatters 500 dots', 'generate code to draw a grid of circles', 'code a ring of twelve dots', 'make some code for a sun with rays'])
      expect(say(t, false), t).toMatchObject({ do: 'code' });
    expect(say('write code for a spiral of 200 points', false).request).toBe('a spiral of 200 points');
    expect(say('code', false)).toBe(null);
    expect(say('write code', false)).toBe(null);
  });
  it('a line between two places', () => {
    for (const t of ['draw a line from the top left to the bottom right', 'a diagonal stroke across the page, upper left to lower right', 'add a diagonal line', 'a diagonal'])
      expect(say(t, false), t).toMatchObject({ do: 'line', from: [100, 100], to: [900, 900] });
    expect(say('draw a horizontal line', false)).toMatchObject({ do: 'line', from: [100, 500], to: [900, 500] });
    expect(say('a vertical line', false)).toMatchObject({ do: 'line', from: [500, 100], to: [500, 900] });
    expect(say('a line from the left to the right', false)).toMatchObject({ do: 'line', from: [100, 500], to: [900, 500] });
    expect(say('draw a line from the bottom left to the top right', false)).toMatchObject({ do: 'line', from: [100, 900], to: [900, 100] });
    for (const t of ['a line', 'draw a line', 'line it up']) expect(say(t, false), t).toBe(null);
  });
});
