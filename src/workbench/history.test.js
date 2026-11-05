import { describe, it, expect, beforeEach } from 'vitest';
import { History } from './history.js';
import { createDocument, normalizeDocument, ProcessStore } from '../process/document.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const line = (id, t0 = 0, ms = 600) => ({ id, role: 'line', points: [[0, 0, t0], [50, 10, t0 + ms / 2], [100, 0, t0 + ms]], closed: false });

describe('History: playing and muting changes', () => {
  let store, H;
  beforeEach(() => {
    globalThis.localStorage = mem();
    store = new ProcessStore(normalizeDocument(createDocument()));
    H = new History({ store });
    for (const id of ['a', 'b', 'c']) store.change(`add ${id}`, d => { d.elements.push(line(id)); });
  });

  it('a stroke plays as long as it took to draw', () => {
    expect(H.entries).toHaveLength(3);
    expect(H.durationOf(H.entries[0])).toBe(600);
  });

  it('a muted change is left out of the states after it and of the clips made from it', () => {
    const ids = H.entries.map(e => e.id);
    expect(H.stateAfter(2).elements.map(e => e.id)).toEqual(['a', 'b', 'c']);
    H.setMuted([ids[1]], true);
    expect(H.stateAfter(2).elements.map(e => e.id)).toEqual(['a', 'c']);
    const clips = H.clipsFrom(ids, 1000);
    expect(clips.map(c => c.diff.add[0].id)).toEqual(['a', 'c']);
    expect(clips[0].start).toBe(1000);
    expect(clips[1].start).toBe(1000 + 600 + 250);   // one after the other, with a breath
    H.setMuted([ids[1]], false);
    expect(H.stateAfter(2).elements.map(e => e.id)).toEqual(['a', 'b', 'c']);
  });
});
