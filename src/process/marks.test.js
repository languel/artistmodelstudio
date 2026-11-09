import { describe, it, expect } from 'vitest';
import { addMark, setMark, removeMark, splitMarks, shiftMarks, marksOf, findClip, marksText } from './marks.js';

const clip = (o = {}) => ({ id: 'c1', track: 'audio', start: 1000, dur: 4000, ...o });

describe('marks on clips', () => {
  it('adds marks in time order, clamped to the clip', () => {
    const c = clip();
    addMark(c, 3000, 'late'); addMark(c, -50, 'early'); addMark(c, 9999, 'past the end', 'feedback');
    expect(c.marks.map(m => [m.at, m.text, m.kind])).toEqual([[0, 'early', 'note'], [3000, 'late', 'note'], [4000, 'past the end', 'feedback']]);
  });
  it('knows only three kinds', () => {
    const c = clip(); const m = addMark(c, 0, 'x', 'whatever');
    expect(m.kind).toBe('note');
    setMark(c, m.id, { kind: 'instruction' });
    expect(m.kind).toBe('instruction');
  });
  it('moving a stretch keeps its length and stays inside the clip', () => {
    const c = clip(); const m = addMark(c, 1000, 'line', 'note', { end: 1500 });
    setMark(c, m.id, { at: 3900 });
    expect([m.at, m.end]).toEqual([3900, 4000]);
  });
  it('removes a mark and drops the empty list', () => {
    const c = clip(); const m = addMark(c, 10, 'a');
    expect(removeMark(c, m.id)).toBe(true);
    expect(c.marks).toBeUndefined();
  });
  it('splits with the clip: later marks go to the second half, renumbered', () => {
    const c = clip(); addMark(c, 500, 'a'); addMark(c, 2500, 'b', 'instruction', { end: 3000 });
    const moved = splitMarks(c, 2000);
    expect(c.marks.map(m => m.text)).toEqual(['a']);
    expect(moved.map(m => [m.text, m.at, m.end])).toEqual([['b', 500, 1000]]);
  });
  it('a clip trimmed at the start loses what falls before it', () => {
    const c = clip({ dur: 3000 }); addMark(c, 200, 'gone'); addMark(c, 1200, 'kept');
    shiftMarks(c, 500);
    expect(c.marks.map(m => [m.text, m.at])).toEqual([['kept', 700]]);
  });
  it('lists every mark in a take at take time, filtered', () => {
    const a = clip({ id: 'a' }), b = clip({ id: 'b', track: 'say', start: 0, dur: 2000, text: 'hello' });
    addMark(a, 500, 'drums louder', 'instruction'); addMark(b, 100, 'nice', 'feedback');
    const take = { clips: [a, b], tracks: [] };
    expect(marksOf(take).map(m => [m.t, m.clip])).toEqual([[100, 'b'], [1500, 'a']]);
    expect(marksOf(take, { kind: 'instruction' }).map(m => m.text)).toEqual(['drums louder']);
    expect(marksOf(take, { text: 'NICE' }).length).toBe(1);
    expect(marksText(take, { kind: 'instruction' })).toBe('0:01.5 [instruction]: drums louder');
  });
  it('finds a clip inside a composition', () => {
    const inner = clip({ id: 'in' });
    expect(findClip({ clips: [{ id: 'comp1', track: 'comp', comp: { clips: [inner] } }] }, 'in')).toBe(inner);
  });
});
