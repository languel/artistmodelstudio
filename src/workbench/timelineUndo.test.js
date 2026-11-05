import { describe, it, expect } from 'vitest';
import { TimelineUndo } from './timelineUndo.js';

describe('Timeline undo', () => {
  it('goes back and forward through edits', () => {
    const u = new TimelineUndo();
    u.reset({ n: 0 });
    u.push({ n: 1 }, 'edit', 1000);
    u.push({ n: 2 }, 'edit', 5000);
    expect(u.undo()).toEqual({ n: 1 });
    expect(u.undo()).toEqual({ n: 0 });
    expect(u.undo()).toBe(null);
    expect(u.redo()).toEqual({ n: 1 });
    // a new edit drops what was undone
    u.push({ n: 9 }, 'edit', 9000);
    expect(u.canRedo).toBe(false);
    expect(u.undo()).toEqual({ n: 1 });
  });

  it('a drag (many changes of one kind close together) is one step; the same state twice is none', () => {
    const u = new TimelineUndo({ merge: 500 });
    u.reset({ n: 0 });
    for (let k = 1; k <= 10; k++) u.push({ n: k }, 'transport', 1000 + k * 30);
    expect(u.push({ n: 10 }, 'transport', 2000)).toBe(false);
    expect(u.undo()).toEqual({ n: 0 });
    expect(u.redo()).toEqual({ n: 10 });
    // another kind right after is its own step
    u.push({ n: 11 }, 'edit', 1400);
    expect(u.undo()).toEqual({ n: 10 });
  });
});
