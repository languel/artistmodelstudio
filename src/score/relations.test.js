import { describe, it, expect } from 'vitest';
import { renderScore } from './runner.js';
import { renderEvents } from './world.js';
import { compileDoc } from './compile.js';
import { emitFor, readPreset, DEFAULTS } from './presets.js';
import { normalizeDocument } from '../process/document.js';

const settings = { tempo: 120, signature: { numerator: 4, denominator: 4 }, fps: 30 };
const doc = elements => normalizeDocument({ artboard: { width: 200, height: 100 }, elements });
const notes = out => out.messages.filter(m => (m.bytes[0] & 0xf0) === 0x90).map(m => [+m.t.toFixed(3), m.bytes[1]]);
const trig = (id, x, extra = {}) => ({ id, role: 'point', label: id, points: [[x, 50]], play: { trigger: { ...extra } } });

describe('routes', () => {
  it('a trigger that sends to another sounds, then the other sounds when the traveler arrives', () => {
    const d = doc([
      trig('A', 20, { start: true, emit: 'note(1, 60, 100, 0.1)', to: [{ to: 'B', dur: 1 }] }),
      trig('B', 120, { emit: 'note(1, 64, 100, 0.1)', to: ['C'] }),
      trig('C', 180, { emit: 'note(1, 67, 100, 0.1)' })
    ]);
    const out = renderScore(d, settings, 4);
    expect(out.errors).toEqual([]);
    // 120 bpm: the default route time is one beat (0.5 s).
    expect(notes(out)).toEqual([[0, 60], [1, 64], [1.5, 67]]);
  });
  it('a route\'s traveler touches nothing on the way', () => {
    const d = doc([
      trig('A', 20, { start: true, emit: 'note(1, 60, 100, 0.1)', to: [{ to: 'C', dur: 1 }] }),
      trig('B', 100, { emit: 'note(1, 64, 100, 0.1)' }),   // lies on the way from A to C
      trig('C', 180, { emit: 'note(1, 67, 100, 0.1)' })
    ]);
    expect(notes(renderScore(d, settings, 3)).map(n => n[1])).toEqual([60, 67]);
  });
  it('says what it cannot send to', () => {
    const d = doc([trig('A', 20, { start: true, to: ['nowhere'] })]);
    expect(compileDoc(d).info.skipped).toHaveLength(1);
  });
});

describe('cues', () => {
  it('a traveler waits until its trigger fires, then runs its path', () => {
    const d = doc([
      { id: 'p', role: 'line', label: 'row', path: 'straight', points: [[0, 80], [200, 80]], play: { path: true } },
      { id: 'g', role: 'point', label: 'go', points: [[10, 10]], play: { trigger: { start: 1, emit: 'note(1, 50, 100, 0.1)' } } },
      { id: 't', role: 'point', points: [[0, 80]], play: { travel: { on: 'row', dur: 2, cue: 'go' } } },
      { id: 'z', role: 'plane', path: 'straight', points: [[90, 70], [110, 70], [110, 90], [90, 90]], play: { trigger: { emit: 'note(1, 72, 100, 0.1)' } } }
    ]);
    const { def } = compileDoc(d);
    expect(def.travelers).toEqual([]);                 // not running until cued
    const out = renderScore(d, settings, 5);
    // The cue fires at 1 s; the traveler reaches the plane (x 90) 0.9 s later at 100 units a second.
    expect(notes(out).map(n => n[1])).toEqual([50, 72]);
    expect(notes(out)[1][0]).toBeCloseTo(1.9, 1);
  });
});

describe('offset', () => {
  it('a traveler can begin part way along', () => {
    const def = { paths: { row: { points: [[0, 0], [100, 0]] } }, travelers: [{ id: 'a', on: 'row', dur: 10, at: 0.5 }], triggers: [{ id: 'z', region: { kind: 'circle', x: 75, y: 0, r: 1 } }] };
    const ev = renderEvents(def, 10);
    expect(ev.find(e => e.type === 'enter').t).toBeCloseTo(2.4, 1);   // at 50 units, 75 is 2.5 s on
  });
});

describe('bars and crossings', () => {
  it('a bar across the path reports how far to the side it touched', () => {
    const def = { paths: { row: { points: [[0, 0], [100, 0]] } }, travelers: [{ id: 'bar', on: 'row', dur: 10, width: 20 }],
      triggers: [{ id: 'hi', region: { kind: 'circle', x: 50, y: -8, r: 1 } }, { id: 'mid', region: { kind: 'circle', x: 60, y: 0, r: 1 } }, { id: 'out', region: { kind: 'circle', x: 70, y: 30, r: 1 } }] };
    const ev = renderEvents(def, 10).filter(e => e.type === 'enter');
    expect(ev.map(e => e.trigger)).toEqual(['hi', 'mid']);            // the one 30 to the side is out of reach of a 20 wide bar
    expect(ev[0].lat).toBeCloseTo(-0.8);
    expect(ev[1].lat).toBeCloseTo(0);
  });
  it('a crossing can be limited to one way', () => {
    const d = doc([
      { id: 'p', role: 'line', label: 'down', path: 'straight', points: [[100, 0], [100, 100]], play: { path: true } },
      { id: 't', role: 'point', points: [[100, 0]], play: { travel: { on: 'down', dur: 2, loop: 'pingpong' } } },
      { id: 'g1', role: 'line', path: 'straight', points: [[80, 50], [120, 50]], play: { trigger: { dir: -1, emit: 'note(1, 60, 100, 0.1)' } } },
      { id: 'g2', role: 'line', path: 'straight', points: [[80, 50], [120, 50]], play: { trigger: { dir: 1, emit: 'note(1, 72, 100, 0.1)' } } }
    ]);
    const out = notes(renderScore(d, settings, 4));
    expect(out.map(n => n[1])).toEqual([60, 72]);   // down through it with one, back up with the other
  });
});

describe('distance preset', () => {
  it('writes pitch by the side a bar touches', () => {
    const code = emitFor({ ...DEFAULTS.offset, scale: '' });
    expect(readPreset(code)?.k).toBe('offset');
    expect(code).toContain('lat');
  });
});

import * as R from './relations.js';
describe('relations by pointing', () => {
  const els = () => normalizeDocument({ artboard: { width: 200, height: 100 }, elements: [
    { id: 'line', role: 'line', label: 'row', path: 'straight', points: [[10, 50], [190, 50]] },
    { id: 'dot', role: 'point', points: [[100, 20]] },
    { id: 'zone', role: 'plane', path: 'straight', points: [[80, 30], [120, 30], [120, 70], [80, 70]] },
    { id: 'bell', role: 'point', points: [[150, 80]] }
  ] }).elements;
  const get = (list, id) => list.find(e => e.id === id);

  it('reads what two marks mean', () => {
    const l = els();
    expect(R.infer(get(l, 'dot'), get(l, 'line'))).toMatchObject({ kind: 'travel', from: 'dot', to: 'line' });
    expect(R.infer(get(l, 'line'), get(l, 'dot'))).toMatchObject({ kind: 'travel', from: 'dot', to: 'line' });   // the same either way
    expect(R.infer(get(l, 'zone'), get(l, 'bell'))).toMatchObject({ kind: 'send', from: 'zone', to: 'bell' });
    expect(R.infer(get(l, 'zone'), get(l, 'line'))).toMatchObject({ kind: 'trigger' });
    expect(R.infer(get(l, 'dot'), get(l, 'dot'))).toBe(null);
    expect(R.infer(get(l, 'dot'), get(l, 'bell'))).toMatchObject({ kind: 'send' });
  });

  it('a point pointed at a line travels it from its start', () => {
    const d = { elements: els() };
    expect(R.apply(d, R.infer(get(d.elements, 'dot'), get(d.elements, 'line')))).toBe(true);
    const dot = get(d.elements, 'dot'), line = get(d.elements, 'line');
    expect(dot.play.travel.on).toBe('line');
    expect(dot.points[0].slice(0, 2)).toEqual([10, 50]);    // it goes to where the line starts
    expect(dot.realize.brush).toBe('traveler');
    expect(line.play.path).toBe(true);
    expect(line.realize.brush).toBe('path');
  });

  it('send makes both triggers and links them; cue starts a traveler from a trigger; place puts a mark on a line', () => {
    const d = { elements: els() };
    R.send(d, 'zone', 'bell');
    expect(get(d.elements, 'bell').play.trigger.emit).toContain('preset');
    expect(get(d.elements, 'zone').play.trigger.to).toEqual([{ to: 'bell' }]);
    R.send(d, 'zone', 'bell');
    expect(get(d.elements, 'zone').play.trigger.to).toHaveLength(1);        // once
    R.travel(d, 'dot', 'line');
    expect(R.cue(d, 'bell', 'dot')).toBe(true);
    expect(get(d.elements, 'dot').play.travel.cue).toBe('bell');
    R.place(d, 'bell', 'line');
    expect(get(d.elements, 'bell').points[0].slice(0, 2)).toEqual([150, 50]);
  });

  it('offset moves the marker along the line and remembers how far', () => {
    const d = { elements: els() };
    R.travel(d, 'dot', 'line');
    R.offset(d, 'dot', 0.5);
    expect(get(d.elements, 'dot').play.travel.at).toBe(0.5);
    expect(get(d.elements, 'dot').points[0].slice(0, 2)).toEqual([100, 50]);
    R.offset(d, 'dot', 0);
    expect(get(d.elements, 'dot').play.travel.at).toBeUndefined();
  });

  it('and the score it makes plays: a point on a line, a zone it passes', () => {
    const d = { elements: els() };
    R.travel(d, 'dot', 'line');
    R.trigger(d, 'zone');
    const doc2 = normalizeDocument({ artboard: { width: 200, height: 100 }, elements: d.elements });
    const out = renderScore(doc2, settings, 20);
    expect(out.errors).toEqual([]);
    expect(out.messages.filter(m => (m.bytes[0] & 0xf0) === 0x90).length).toBe(1);
  });
});
