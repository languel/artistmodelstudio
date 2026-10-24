import { describe, it, expect } from 'vitest';
import { makePath, sample, sampleDrawn, drawnDuration } from './paths.js';
import { localTime, lapEnds } from './travel.js';
import { prepare } from './regions.js';
import { createWorld, renderEvents } from './world.js';
import { compileDoc, pathTime } from './compile.js';
import { normalizeDocument } from '../process/document.js';

const near = (a, b, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const square = (x0, y0, x1, y1) => ({ kind: 'polygon', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
const ofType = (evs, type, trigger) => evs.filter(e => e.type === type && (trigger == null || e.trigger === trigger));
const ROW = { row: { points: [[0, 0], [10, 0]] } };

describe('paths', () => {
  it('samples by arc length with direction and pressure', () => {
    const p = makePath([[0, 0, null, 0], [3, 4, null, 1], [3, 14, null, 1]]);
    near(p.length, 15);
    const mid = sample(p, 5 / 15);
    near(mid.x, 3); near(mid.y, 4);
    const a = sample(p, 0.1);
    near(a.tx, 0.6); near(a.ty, 0.8);
    near(sample(p, 2.5 / 15).p, 0.5);
    expect(sample(p, 2).y).toBe(14);
    expect(sample(p, -1).x).toBe(0);
  });
  it('a closed path comes back to its start', () => {
    const p = makePath([[0, 0], [10, 0], [10, 10]], { closed: true });
    near(p.length, 10 + 10 + Math.hypot(10, 10));
    near(sample(p, 1).x, 0);
  });
  it('a recorded walk replays by its own time', () => {
    const p = makePath([[0, 0, 0], [10, 0, 1000], [20, 0, 1500]]);
    expect(p.drawn).toBe(true);
    near(drawnDuration(p), 1.5);
    near(sampleDrawn(p, 1000).x, 10);
    near(sampleDrawn(p, 1250).x, 15);
    expect(makePath([[0, 0, 0], [10, 0, 0]]).drawn).toBe(false);
  });
});

describe('local time', () => {
  it('once clamps, loop wraps, pingpong reflects', () => {
    const s = { start: 1, dur: 2 };
    expect(localTime(0, s)).toMatchObject({ progress: 0, active: false });
    near(localTime(2, s).progress, 0.5);
    expect(localTime(9, s)).toMatchObject({ progress: 1, active: false });
    near(localTime(4, { ...s, loop: 'loop' }).progress, 0.5);
    near(localTime(4.5, { ...s, loop: 'pingpong' }).progress, 0.25);
    expect(localTime(4.5, { ...s, loop: 'pingpong' }).forward).toBe(false);
    near(localTime(2, { ...s, rate: 2 }).progress, 1);
  });
  it('knows when laps end', () => {
    expect(lapEnds({ start: 1, dur: 2 }, 0, 10)).toEqual([3]);
    expect(lapEnds({ start: 1, dur: 2, loop: 'loop' }, 0, 6)).toEqual([3, 5]);
    expect(lapEnds({ start: 0, dur: 2, loop: 'loop' }, 2, 4)).toEqual([4]);   // (t0, t1]
  });
});

describe('regions', () => {
  it('a circle is entered and left in order', () => {
    const r = prepare({ kind: 'circle', x: 5, y: 0, r: 1 });
    const c = r.crossings({ x: 0, y: 0 }, { x: 10, y: 0 }, false);
    expect(c.map(k => k.type)).toEqual(['enter', 'exit']);
    near(c[0].s, 0.4); near(c[1].s, 0.6);
    expect(r.crossings({ x: 5, y: 0 }, { x: 10, y: 0 }, true).map(k => k.type)).toEqual(['exit']);
  });
  it('a line is crossed with a direction', () => {
    const r = prepare({ kind: 'line', pts: [[5, -1], [5, 1]] });
    const right = r.crossings({ x: 0, y: 0 }, { x: 10, y: 0 })[0];
    const left = r.crossings({ x: 10, y: 0 }, { x: 0, y: 0 })[0];
    expect(right.dir).toBe(-left.dir);
    expect(r.crossings({ x: 0, y: 2 }, { x: 10, y: 2 })).toEqual([]);
  });
  it('a field is found by looking along the move', () => {
    const r = prepare({ kind: 'field', inside: x => x > 3 && x < 6 });
    expect(r.crossings({ x: 0, y: 0 }, { x: 10, y: 0 }, false).map(k => k.type)).toEqual(['enter', 'exit']);
  });
});

describe('world', () => {
  const run = (def, seconds, opts) => renderEvents({ paths: ROW, ...def }, seconds, opts);

  it('enter and exit land at the exact time, whatever the step', () => {
    const def = { travelers: [{ id: 'a', on: 'row', dur: 10 }], triggers: [{ id: 'sq', region: square(4, -1, 6, 1) }] };
    for (const dt of [1 / 240, 1 / 60, 0.5]) {
      const ev = run(def, 12, { dt });
      near(ofType(ev, 'enter')[0].t, 4); near(ofType(ev, 'exit')[0].t, 6);
      near(ofType(ev, 'enter')[0].x, 4);
    }
  });

  it('a thin trigger is not skipped by a fast traveler', () => {
    const def = {
      paths: { fast: { points: [[0, 0], [100, 0]] } },
      travelers: [{ id: 'a', on: 'fast', dur: 0.1 }],
      triggers: [{ id: 'thin', region: square(50, -1, 50.1, 1) }]
    };
    const ev = run(def, 0.2, { dt: 1 / 60 });
    expect(ofType(ev, 'enter')).toHaveLength(1);
    near(ofType(ev, 'enter')[0].t, 0.05, 1e-4);
  });

  it('a bar traveler touches areas and lines with the whole bar, not only the point on the path', () => {
    const def = { travelers: [{ id: 'a', on: 'row', dur: 10, width: 10 }], triggers: [{ id: 'off', region: square(4, 3, 6, 4) }, { id: 'gate', region: { kind: 'line', pts: [[8, 2], [8, 4]] } }, { id: 'far', region: square(4, 9, 6, 10) }] };
    const ev = run(def, 12);
    expect(ofType(ev, 'enter').filter(e => e.trigger === 'off')).toHaveLength(1);
    expect(ofType(ev, 'exit').filter(e => e.trigger === 'off')).toHaveLength(1);
    expect(ofType(ev, 'cross').filter(e => e.trigger === 'gate')).toHaveLength(1);
    expect(ev.filter(e => e.trigger === 'far')).toHaveLength(0);
  });

  it('reports the place as fractions of the frame, y up, and the speed', () => {
    const ev = run({ bounds: { x: 0, y: 0, width: 10, height: 10 }, travelers: [{ on: 'row', dur: 10 }], triggers: [{ id: 't', region: square(4, -1, 6, 1) }] }, 12);
    const e = ofType(ev, 'enter')[0];
    near(e.nx, 0.4); near(e.ny, 1); near(e.speed, 1, 1e-6); near(e.u, 0.4);
  });

  it('latched: one voice for overlapping travelers, closed when the last has left', () => {
    const def = {
      travelers: [{ id: 'a', on: 'row', dur: 10 }, { id: 'b', on: 'row', dur: 10, start: 1 }],
      triggers: [{ id: 'sq', region: square(4, -1, 6, 1) }]
    };
    const ev = run(def, 14);
    expect(ofType(ev, 'enter')).toHaveLength(1);
    expect(ofType(ev, 'exit')).toHaveLength(1);
    near(ofType(ev, 'enter')[0].t, 4); near(ofType(ev, 'exit')[0].t, 7);
    const pair = run({ ...def, triggers: [{ ...def.triggers[0], policy: 'pair' }] }, 14);
    expect(ofType(pair, 'enter')).toHaveLength(2);
    const every = run({ ...def, triggers: [{ ...def.triggers[0], policy: 'every' }] }, 14);
    expect(ofType(every, 'exit')).toHaveLength(2);
  });

  it('gate holds a short contact open; lockout stops a quick retrigger', () => {
    const def = {
      travelers: [{ id: 'a', on: 'row', dur: 4, loop: 'loop' }],
      triggers: [{ id: 'tiny', region: square(4.9, -1, 5.1, 1), gate: 1 }]
    };
    const g = run(def, 3);
    near(ofType(g, 'enter')[0].t, 4.9 * 0.4, 1e-6 + 0.01);
    near(ofType(g, 'exit')[0].t - ofType(g, 'enter')[0].t, 1, 1e-6);
    const l = run({ ...def, triggers: [{ ...def.triggers[0], lockout: 100 }] }, 20);
    expect(ofType(l, 'enter')).toHaveLength(1);
    expect(run(def, 20).filter(e => e.type === 'enter').length).toBeGreaterThan(3);
  });

  it('a loop wrap is a jump, not a sweep', () => {
    // The path runs left to right; a trigger at the far left of the *return* chord would be hit if the wrap swept.
    const def = {
      travelers: [{ id: 'a', on: 'row', dur: 2, loop: 'loop' }],
      triggers: [{ id: 'mid', region: square(4, -1, 6, 1) }]
    };
    const ev = run(def, 6.5);
    expect(ofType(ev, 'enter').map(e => e.t.toFixed(2))).toEqual(['0.80', '2.80', '4.80']);
  });

  it('pingpong passes the trigger on the way back', () => {
    const ev = run({ travelers: [{ on: 'row', dur: 2, loop: 'pingpong' }], triggers: [{ id: 'm', region: square(4, -1, 6, 1) }] }, 4);
    expect(ofType(ev, 'enter').map(e => e.t.toFixed(2))).toEqual(['0.80', '2.80']);
  });

  it('end events: once finishes one lap, loop each lap', () => {
    const once = run({ travelers: [{ id: 'a', on: 'row', dur: 2 }] }, 10);
    expect(ofType(once, 'end').map(e => e.t)).toEqual([2]);
    const loop = run({ travelers: [{ id: 'a', on: 'row', dur: 2, loop: 'loop' }] }, 7);
    expect(ofType(loop, 'end').map(e => e.t)).toEqual([2, 4, 6]);
  });

  it('a line trigger fires when crossed', () => {
    const ev = run({ travelers: [{ on: 'row', dur: 10 }], triggers: [{ id: 'gate', region: { kind: 'line', pts: [[5, -3], [5, 3]] } }] }, 12);
    expect(ofType(ev, 'cross')).toHaveLength(1);
    near(ofType(ev, 'cross')[0].t, 5);
  });

  it('filters by tag', () => {
    const def = {
      travelers: [{ id: 'a', on: 'row', dur: 10, tag: 'bass' }, { id: 'b', on: 'row', dur: 10, tag: 'lead' }],
      triggers: [{ id: 'sq', region: square(4, -1, 6, 1), filter: 'lead', policy: 'pair' }]
    };
    expect(ofType(run(def, 12), 'enter').map(e => e.traveler)).toEqual(['b']);
  });

  it('a traveler that starts inside a trigger enters it at its start', () => {
    const ev = run({ travelers: [{ on: 'row', dur: 10, start: 2 }], triggers: [{ id: 'home', region: { kind: 'circle', x: 0, y: 0, r: 1 } }] }, 5);
    near(ofType(ev, 'enter')[0].t, 2);
    near(ofType(ev, 'exit')[0].t, 3);
  });

  it('handlers launch travelers; launched ones do not retrigger their origin', () => {
    const log = [];
    const def = {
      paths: { a: { points: [[0, 0], [10, 0]] }, b: { points: [[10, 0], [10, 10]] } },
      travelers: [{ id: 'first', on: 'a', dur: 10 }],
      triggers: [
        { id: 'A', region: { kind: 'circle', x: 0, y: 0, r: 1 } },
        { id: 'B', region: { kind: 'circle', x: 10, y: 0, r: 1 }, handle: (e, api) => { if (e.type === 'enter') { log.push(e.t); api.launch('b', { dur: 5 }); } } },
        { id: 'C', region: { kind: 'circle', x: 10, y: 10, r: 1 } }
      ]
    };
    const ev = renderEvents(def, 20);
    expect(ofType(ev, 'enter', 'B')).toHaveLength(1);
    near(ofType(ev, 'enter', 'B')[0].t, 9);
    expect(ofType(ev, 'enter', 'C')).toHaveLength(1);
    near(ofType(ev, 'enter', 'C')[0].t, 9 + 4.5);
    expect(ofType(ev, 'enter', 'B')).toHaveLength(1);   // the launched traveler left B without re-entering it
  });

  it('state persists in a trigger, and a cap bounds the travelers', () => {
    const def = {
      paths: { a: { points: [[0, 0], [10, 0]] } },
      maxTravelers: 3,
      travelers: [{ id: 'a', on: 'a', dur: 1, loop: 'loop' }],
      triggers: [{
        id: 'count', region: square(4, -1, 6, 1), state: { n: 0 },
        handle: (e, api) => { if (e.type === 'enter') { api.state.n++; api.launch('a', { dur: 100 }); } }
      }]
    };
    const w = createWorld(def);
    for (let i = 1; i <= 600; i++) w.step(i / 60);
    expect(w.triggers()[0].state.n).toBeGreaterThan(5);
    expect(w.travelers().length).toBeLessThanOrEqual(3);
  });

  it('a traveler that ends releases what it was inside of', () => {
    const def = {
      paths: { a: { points: [[0, 0], [10, 0]] } },
      travelers: [{ id: 'host', on: 'a', dur: 100 }],
      triggers: [{
        id: 'B', region: { kind: 'circle', x: 5, y: 0, r: 0.5 },
        handle: (e, api) => { if (e.type === 'enter') api.launch('a', { dur: 0.5, loop: 'once' }); }
      }]
    };
    const ev = renderEvents(def, 6);
    expect(ofType(ev, 'exit')).toHaveLength(ofType(ev, 'enter').length);
  });

  it('the same definition gives the same events', () => {
    const def = { travelers: [{ on: 'row', dur: 3, loop: 'loop' }], triggers: [{ id: 'sq', region: square(2, -1, 3, 1) }], seed: 7 };
    expect(run(def, 9)).toEqual(run(def, 9));
  });

  it('a traveler replays the walk as drawn', () => {
    const def = {
      paths: { walk: { points: [[0, 0, 0], [10, 0, 1000], [20, 0, 1500]] } },
      travelers: [{ id: 'w', on: 'walk', as: 'drawn' }],
      triggers: [{ id: 'm', region: { kind: 'circle', x: 10, y: 0, r: 0.01 } }]
    };
    near(ofType(renderEvents(def, 3), 'enter')[0].t, 0.999, 1e-5);   // the circle's near edge, 0.01 before x = 10
  });

  it('a free traveler is any position over time', () => {
    const def = {
      travelers: [{ id: 'f', pos: t => ({ x: t * 10, y: 0 }) }],
      triggers: [{ id: 'sq', region: square(4, -1, 6, 1) }]
    };
    near(ofType(renderEvents(def, 1), 'enter')[0].t, 0.4);
  });
});

describe('compile', () => {
  const doc = normalizeDocument({
    artboard: { width: 100, height: 100 },
    elements: [
      { id: 'p', role: 'line', points: [[0, 50], [100, 50]], path: 'straight', play: { path: true } },
      { id: 'dot', role: 'point', points: [[0, 50]], play: { travel: { on: 'p', dur: 10, tag: 'a' } } },
      { id: 'zone', role: 'plane', path: 'straight', points: [[40, 40], [60, 40], [60, 60], [40, 60]], play: { trigger: { emit: 'seen.push([type, +t.toFixed(2), +ny.toFixed(2), tag])', emitExit: 'seen.push([type, +t.toFixed(2), +ny.toFixed(2), tag])' } } }
    ]
  });

  it('turns marks with play into a world', () => {
    const seen = [];
    const { def, info } = compileDoc(doc, { helpers: { seen } });
    expect(info.skipped).toEqual([]);
    expect(Object.keys(def.paths)).toEqual(['p']);
    renderEvents(def, 12);
    expect(seen).toEqual([['enter', 4, 0.5, 'a'], ['exit', 6, 0.5, 'a']]);
  });

  it('plays what the document says, and reports a traveler with no path', () => {
    const bad = normalizeDocument({ elements: [{ id: 'x', role: 'point', points: [[0, 0]], play: { travel: { on: 'nope' } } }] });
    expect(compileDoc(bad).info.skipped).toHaveLength(1);
    expect(() => compileDoc(normalizeDocument({ elements: [{ id: 'z', role: 'plane', points: [[0, 0], [1, 0], [1, 1]], play: { trigger: { emit: 'foo(' } } }] }))).toThrow();
  });
});

describe('emit code', () => {
  it('is an expression or statements; a syntax error fails at compile time', async () => {
    const { compileEmit } = await import('./compile.js');
    const names = ['note'];
    const got = [];
    const h = { note: (...a) => got.push(a) };
    compileEmit("note(1, 2)", names)(h, {}, {});
    compileEmit("if (true) note(3, 4)", names)(h, {}, {});
    compileEmit("const k = 5;\nnote(k, 6)", names)(h, {}, {});
    expect(got).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(() => compileEmit('note(', names)).toThrow();
  });
});

describe('smooth marks', () => {
  const make = path => normalizeDocument({
    artboard: { width: 100, height: 100 },
    elements: [
      { id: 'p', role: 'line', points: [[0, 50], [50, 0], [100, 50]], ...(path ? { path } : {}), play: { path: true } },
      { id: 'z', role: 'plane', points: [[40, 40], [60, 40], [60, 60], [40, 60]], ...(path ? { path } : {}), play: { trigger: {} } }
    ]
  });
  it('a traveler follows the curve as drawn, not the polyline through its points', () => {
    const at = (path, u) => { const { def } = compileDoc(make(path)); return sample(makePath(def.paths.p.points, { closed: false }), u); };
    // The middle control point is [50, 0]: a straight polyline passes through it; the smooth curve does too (Catmull-Rom is interpolating),
    // but a quarter of the way along they differ: the smooth curve bulges.
    const straight = at('straight', 0.25), smooth = at(undefined, 0.25);
    expect(straight.y).toBeCloseTo(25, 0);
    expect(smooth.y).toBeLessThan(straight.y - 0.5);   // the curve is not the chord
    expect(compileDoc(make()).def.paths.p.points.length).toBeGreaterThan(10);
  });
  it('a plane covers its drawn outline: the curve through its corners, which bulges past the straight edges', () => {
    const inside = (path, x, y) => prepare(compileDoc(make(path)).def.triggers[0].region).inside(x, y);
    expect(inside('straight', 50, 39)).toBe(false);    // above the top edge of the rectangle
    expect(inside(undefined, 50, 39)).toBe(true);      // the drawn outline bulges there
    expect(inside(undefined, 50, 50)).toBe(true);
    expect(inside(undefined, 50, 20)).toBe(false);
  });
});

describe('names', () => {
  const doc = normalizeDocument({
    artboard: { width: 100, height: 100 },
    elements: [
      { id: 'l1', role: 'line', label: 'melody', points: [[0, 50], [100, 50]], path: 'straight', play: { path: true } },
      { id: 't1', role: 'point', points: [[0, 50]], play: { travel: { on: 'melody', dur: 4 } } },
      { id: 't2', role: 'point', points: [[0, 50]], play: { travel: { on: 'l1', dur: 4 } } },
      { id: 'z', role: 'plane', label: 'bell', path: 'straight', points: [[40, 40], [60, 40], [60, 60], [40, 60]], play: { trigger: {} } }
    ]
  });
  it('a traveler finds its path by the line\'s label or its id; a trigger is known by its label', () => {
    const { def, info } = compileDoc(doc);
    expect(info.skipped).toEqual([]);
    expect(def.travelers.map(t => t.on)).toEqual(['l1', 'l1']);
    expect(def.triggers[0].id).toBe('bell');
  });
  it('a line only has to be named to be a path, when something travels it', () => {
    const d2 = normalizeDocument({ artboard: { width: 10, height: 10 }, elements: [
      { id: 'l', role: 'line', label: 'row', points: [[0, 5], [10, 5]] },
      { id: 't', role: 'point', points: [[0, 5]], play: { travel: { on: 'row', dur: 1 } } }
    ] });
    expect(compileDoc(d2).info.skipped).toEqual([]);
  });
  it('a trigger point is as big as its brush', () => {
    const d3 = normalizeDocument({ artboard: { width: 10, height: 10 }, elements: [{ id: 'p', role: 'point', points: [[5, 5]], realize: { brush: 'trigger', params: { size: 30 } }, play: { trigger: {} } }] });
    expect(compileDoc(d3).def.triggers[0].region.r).toBe(15);
  });
});

describe('one way of moving', () => {
  it('a mark that is both a traveler and a body travels', () => {
    const d = normalizeDocument({ artboard: { width: 100, height: 100 }, elements: [
      { id: 'l', role: 'line', label: 'row', points: [[0, 5], [100, 5]], path: 'straight', play: { path: true } },
      { id: 'a', role: 'point', label: 'A', points: [[10, 50]], play: { travel: { on: 'row', dur: 2 }, body: { speed: 50 } } }
    ] });
    const { def, info } = compileDoc(d);
    expect(def.bodies).toEqual([]);
    expect(def.travelers.map(t => t.id)).toEqual(['a']);
    expect(info.skipped).toHaveLength(1);
  });
});

describe('path time quantized', () => {
  const e = { id: 'p', role: 'line', points: [[0, 0], [110, 0]], play: { path: true } };
  it('rounds to a division, the path\'s own over the scene\'s; a written time is exact', () => {
    const beat = pathTime(e, { beatUnits: 25 }).beats;
    expect(beat).toBeCloseTo(4.4, 2);
    expect(pathTime(e, { beatUnits: 25, quant: '1 beat' }).beats).toBeCloseTo(4, 3);
    expect(pathTime(e, { beatUnits: 25, quant: '1 bar' }).beats).toBeCloseTo(4, 3);
    expect(pathTime({ ...e, play: { path: { quant: 'off' } } }, { beatUnits: 25, quant: '1 beat' }).beats).toBeCloseTo(4.4, 2);
    expect(pathTime({ ...e, play: { path: { quant: '0.5 beat' } } }, { beatUnits: 25 }).beats).toBeCloseTo(4.5, 3);
    expect(pathTime({ ...e, play: { path: { len: '3.3 beats', quant: '1 beat' } } }, { beatUnits: 25 }).beats).toBeCloseTo(3.3, 3);
  });
});

describe('loops by default on closed paths', () => {
  const doc = (closed, path = true, travel = {}) => normalizeDocument({ artboard: { width: 100, height: 100 }, elements: [
    { id: 'p', role: 'line', points: [[10, 10], [90, 10], [90, 90]], closed, play: { path } },
    { id: 't', role: 'point', points: [[10, 10]], play: { travel: { on: 'p', dur: 1, ...travel } } }] });
  const loopOf = d => compileDoc(d).def.travelers[0].loop;
  it('closed: loop; open: once; the path or the traveler can say otherwise', () => {
    expect(loopOf(doc(true))).toBe('loop');
    expect(loopOf(doc(false))).toBe('once');
    expect(loopOf(doc(false, { loop: true }))).toBe('loop');
    expect(loopOf(doc(true, { loop: false }))).toBe('once');
    expect(loopOf(doc(true, true, { loop: 'pingpong' }))).toBe('pingpong');
  });
});

describe('event is the name of a trigger', () => {
  it('play.event is stored as play.trigger and plays', () => {
    const d = normalizeDocument({ artboard: { width: 100, height: 100 }, elements: [{ id: 'z', role: 'plane', points: [[10, 10], [20, 10], [20, 20], [10, 20]], play: { event: { emit: 'note(1, 60)' } } }] });
    expect(d.elements[0].play.trigger.emit).toBe('note(1, 60)');
    expect(d.elements[0].play.event).toBeUndefined();
  });
});
