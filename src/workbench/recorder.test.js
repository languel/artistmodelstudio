import { describe, it, expect, beforeEach } from 'vitest';
import { Recorder } from './recorder.js';
import { createDocument, normalizeDocument, ProcessStore } from '../process/document.js';
import { createTake } from '../process/take.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
/** A stroke drawn over `ms`. */
const stroke = (id, ms) => ({ id, role: 'line', points: [[0, 0, 0], [50, 10, ms / 2], [100, 0, ms]], closed: false });

describe('recording onto the transport (overdub)', () => {
  let app, player, R, now;
  beforeEach(() => {
    globalThis.localStorage = mem();
    const store = new ProcessStore(normalizeDocument(createDocument()));
    now = 0;
    player = { take: createTake({ baseline: store.doc }), loop: true, wrap: [0, 4000], position: () => now, wrapRange() { return this.loop ? this.wrap : null; }, changed() {} };
    app = { store, player, canvas: {}, on() {}, emit() {}, log() {} };
    R = new Recorder(app);
    R.od = { last: JSON.parse(JSON.stringify(store.doc)), added: 0 };   // (as startOverdub leaves it)
  });

  it('a stroke ends where the playhead is and lasts as long as it took to draw', () => {
    now = 2500;
    app.store.change('add line', d => { d.elements.push(stroke('a', 1000)); });
    expect(player.take.clips.map(c => [c.start, c.dur])).toEqual([[1500, 1000]]);
  });

  it('a stroke begun before the loop came round starts with the loop', () => {
    now = 300;
    app.store.change('add line', d => { d.elements.push(stroke('a', 1000)); });
    expect(player.take.clips[0].start).toBe(0);
  });

  it('polyphonic (the default): overlapping gestures share the drawing track', () => {
    now = 2500; app.store.change('add line', d => { d.elements.push(stroke('a', 1000)); });
    now = 2200; app.store.change('add line', d => { d.elements.push(stroke('b', 1000)); });
    expect(new Set(player.take.clips.map(c => c.lane)).size).toBe(1);
  });

  it('a track per pass: overlapping gestures go on tracks of their own; ones that do not overlap share', () => {
    R.settings.overdubLanes = 'tracks';
    now = 2500; app.store.change('add line', d => { d.elements.push(stroke('a', 1000)); });   // 1.5–2.5 s
    now = 2200; app.store.change('add line', d => { d.elements.push(stroke('b', 1000)); });   // 1.2–2.2 s: overlaps
    now = 3900; app.store.change('add line', d => { d.elements.push(stroke('c', 500)); });    // 3.4–3.9 s: free on the first
    const lanes = player.take.clips.map(c => c.lane);
    expect(lanes[0]).not.toBe(lanes[1]);
    expect(lanes[2]).toBe(lanes[0]);
    expect(player.take.tracks.filter(t => t.kind === 'draw')).toHaveLength(2);
  });
});
