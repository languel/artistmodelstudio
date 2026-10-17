import { describe, it, expect } from 'vitest';
import { defaultCommands } from '../src/workbench/shortcuts.js';

// The registry only builds closures: nothing runs until a command is called.
const commands = defaultCommands({ canvas: {}, store: {} });
const byKey = new Map();
for (const c of commands) for (const k of c.keys) byKey.set(k, [...(byKey.get(k) || []), c.id]);

describe('default shortcuts', () => {
  it('no key combo is bound to two commands', () => {
    const clashes = [...byKey].filter(([, ids]) => ids.length > 1);
    expect(clashes).toEqual([]);
  });

  it('the tool keys', () => {
    const idOf = k => byKey.get(k)?.[0];
    expect(idOf('v')).toBe('tool.select');
    expect(idOf('h')).toBe('tool.hand');
    expect(idOf('k')).toBe('tool.laser');
    expect(idOf(';')).toBe('tool.board');
    expect(idOf('0')).toBe('tool.point');
    expect(idOf('1')).toBe('tool.line');
    expect(idOf('2')).toBe('tool.plane');
    expect(idOf('t')).toBe('tool.note');
    expect(idOf('b')).toBe('tool.brush');
    expect(idOf('s')).toBe('tool.sculpt');
  });

  it('Shift cycles the stacks: select and direct, line, plane, brushes, sculpt tools', () => {
    const idOf = k => byKey.get(k)?.[0];
    expect(idOf('shift+v')).toBe('tool.cycle.select');
    expect(idOf('shift+1')).toBe('tool.cycle.line');
    expect(idOf('shift+2')).toBe('tool.cycle.plane');
    expect(idOf('shift+b')).toBe('tool.cycle.brush');
    expect(idOf('shift+s')).toBe('tool.cycle.sculpt');
  });

  it('smooth and straight are on tilde and backtick', () => {
    expect(byKey.get('`')).toEqual(['path.straight']);
    expect(byKey.get('~')).toEqual(['path.smooth']);
  });

  it('gesture, guide, circle, rectangle and direct have commands but no keys of their own', () => {
    for (const id of ['tool.gesture', 'tool.guide', 'tool.circle', 'tool.rect', 'tool.direct']) {
      const c = commands.find(x => x.id === id);
      expect(c, id).toBeTruthy();
      expect(c.keys).toEqual([]);
    }
  });

  it('the old letters for point, line, plane, gesture and guide are free', () => {
    for (const k of ['o', 'p', 'a', 'e', 'g', 'shift+o', 'shift+e', 'shift+g']) expect(byKey.has(k), k).toBe(false);
  });
});
