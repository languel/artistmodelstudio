import { describe, it, expect, beforeEach } from 'vitest';
import { Recorder } from './recorder.js';
import { createDocument, normalizeDocument, ProcessStore } from '../process/document.js';
import { createTake, docAt } from '../process/take.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
/** A stroke drawn over `ms`. */
const stroke = (id, ms) => ({ id, role: 'line', points: [[0, 0, 0], [50, 10, ms / 2], [100, 0, ms]], closed: false });

describe('recording onto the transport (overdub)', () => {
  let app, player, R, now;
  beforeEach(() => {
    globalThis.localStorage = mem();
    const store = new ProcessStore(normalizeDocument(createDocument()));
    now = 0;
    player = { take: createTake({ baseline: store.doc }), loop: true, wrap: [0, 4000], t: 0, settings: { fps: 25 }, position: () => now, wrapRange() { return this.loop ? this.wrap : null; }, changed() {} };
    app = { store, player, canvas: { pointer: false, invalidate() {} }, on() {}, emit() {}, log() {} };
    R = new Recorder(app);
    R.od = R.newOd();   // (as startOverdub leaves it)
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

describe('recording a morph: gestures on marks already drawn', () => {
  let app, player, R, now;
  const line = (id, x) => ({ id, role: 'line', points: [[x, 0, 0], [x + 10, 10, 0]], closed: false });
  const xs = () => app.store.doc.elements.map(e => e.points[0][0]);
  beforeEach(() => {
    globalThis.localStorage = mem();
    const doc = normalizeDocument(createDocument());
    doc.elements.push(line('a', 0), line('b', 100));
    const store = new ProcessStore(doc);
    now = 0;
    player = { take: createTake({ baseline: JSON.parse(JSON.stringify(store.doc)) }), loop: true, wrap: [0, 6000], t: 0, settings: { fps: 25 }, position: () => now, wrapRange() { return this.loop ? this.wrap : null; }, changed() {} };
    app = { store, player, canvas: { pointer: false, invalidate() {} }, on() {}, emit() {}, log() {} };
    R = new Recorder(app);
    R.od = R.newOd();
    R.follow(0, true);
  });
  /** Push mark `a` a little each frame while the pointer is down, as the sculpt tools do (in place, committed at the end). */
  const drag = (from, to, dx) => {
    const before = JSON.stringify(app.store.doc);
    app.canvas.pointer = true;
    for (let t = from; t <= to; t += 40) { now = t; player.t = t; app.store.doc.elements[0].points.forEach(q => { q[0] += dx; }); R.frame(t); }
    app.canvas.pointer = false; now = to + 10;
    app.store.commitFrom(before, 'sculpt: grab');
  };

  it('a drag on a mark is sampled as it goes, a frame at a time', () => {
    drag(1000, 1400, 2);
    const frames = player.take.clips.filter(c => c.sample);
    expect(frames.length).toBeGreaterThanOrEqual(8);
    expect(frames.map(c => c.start)).toEqual([...frames.map(c => c.start)].sort((a, b) => a - b));
    expect(docAt(player.take, 1200).elements[0].points[0][0]).toBeLessThan(docAt(player.take, 1400).elements[0].points[0][0]);
    expect(docAt(player.take, 500).elements[0].points[0][0]).toBe(0);   // (before it: as it was)
  });

  it('the live drawing follows the take between gestures', () => {
    drag(1000, 1400, 2);
    app.store.doc.elements[0].points[0][0] = 999;   // (a stray in-place change is put right by the next frame)
    R.od.edit = 0;
    R.od.stEls = null;
    R.frame(500);
    expect(xs()[0]).toBe(0);
    R.frame(2000); R.od.edit = 0; R.frame(2040);
    expect(xs()[0]).toBeGreaterThan(0);
  });

  it('a later pass lays its move over the last: what an earlier pass did later on shifts with it', () => {
    drag(3000, 3400, 5);   // pass one: a push at three seconds
    const after = docAt(player.take, 5000).elements[0].points[0][0];
    R.frame(1000);   // (the loop comes round: the drawing follows the take again)
    drag(1000, 1200, 3);   // pass two: another, earlier
    const moved = (1200 - 1000) / 40 + 1;
    expect(docAt(player.take, 5000).elements[0].points[0][0]).toBeCloseTo(after + moved * 3, 5);
    expect(docAt(player.take, 3000 - 100).elements[0].points[0][0]).toBeCloseTo(moved * 3, 5);
  });

  it('stepping: a frame on at the end of an action', () => {
    R.settings.advance = { end: true };
    R.od.step = R.stepping();
    player.seek = t => { player.t = t; }; player.render = () => {};
    app.store.change('edit', d => { d.elements[0].points[0][0] = 7; });
    expect(player.take.clips.at(-1).start).toBe(0);
    R.od.sdown = true; app.canvas.pointer = false; R.stepPoll();
    expect(player.t).toBe(40);
    expect(xs()[0]).toBe(7);   // (the next frame carries on from the drawing)
  });
});
