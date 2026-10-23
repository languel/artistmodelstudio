import { describe, it, expect } from 'vitest';
import { parseNous, nousToScore } from './import/nous.js';
import { runScoreInto } from '../process/script.js';
import { normalizeDocument, createDocument } from '../process/document.js';
import { renderEvents } from './world.js';
import { compileDoc } from './compile.js';
import { musicHelpers } from './music.js';
import { boardsOf } from '../process/boards.js';

const node = (id, col, row, o = {}) => ({ id, x: col * 144, y: row * 144, type: 'note', midi_data: { Primary: 60, Secondary: 100, Channel: 1, Duration: 0.5, Repeat: 0 }, to: [], ...o });

// A ring of three notes, 2 cells apart: C (the start) → E → G → back to C.
const RING = {
  settings: { tempo: 120 },
  points: [
    node(1, 0, 0, { isStart: true, to: [2], midi_data: { Primary: 60, Secondary: 100, Channel: 1, Duration: 0.5 }, forceScale: false }),
    node(2, 2, 0, { to: [3], midi_data: { Primary: 64, Secondary: 90, Channel: 1, Duration: 0.5 }, forceScale: false }),
    node(3, 2, 2, { to: [1], midi_data: { Primary: 67, Secondary: 80, Channel: 2, Duration: 0.5 }, forceScale: false })
  ]
};

const play = (project, seconds, opts) => {
  const res = nousToScore(project, { title: 'T', inBoard: false });
  const run = runScoreInto(normalizeDocument(createDocument()), res.code, { board: 'main' });
  if (run.error) throw new Error(run.error);
  const board = boardsOf(run.doc).find(b => b.title === 'T');
  const msgs = [];
  const ctx = { tempo: opts?.tempo ?? 120, signature: { numerator: 4, denominator: 4 }, fps: 30 };
  const { def } = compileDoc(run.doc, { board: board.id, ctx, helpers: (event, api) => musicHelpers({ out: m => msgs.push(m), ctx, event, api }) });
  renderEvents(def, seconds);
  return { msgs: msgs.sort((a, b) => a.t - b.t), res };
};
const ons = msgs => msgs.filter(m => (m.bytes[0] & 0xf0) === 0x90).map(m => [Math.round(m.t * 1000) / 1000, m.bytes[0] & 15, m.bytes[1], m.bytes[2]]);

describe('Midinous projects', () => {
  it('reads midinojs and legacy files', () => {
    expect(parseNous(RING).nodes.map(n => [n.id, n.start, n.to])).toEqual([[1, true, [2]], [2, false, [3]], [3, false, [1]]]);
    const legacy = parseNous({ _version: 1501, _performance_data: { tempo: 90, doc_scale: 7, doc_root: 2 },
      _note_points: { a: { id: 5, Origin: '288, 144', Start: true, midi_data: { Primary: 62, Secondary: 100, Channel: 1, Duration: 1 }, relative_midi_data: { Primary: 0 }, _Mode: 1, PathMode: 1 } },
      _counter_points: { b: { id: 6, Origin: '576, 144', CountLimit: 3 } },
      _paths: { x: { weight: 50, key: { source_id: 5, target_id: 6 }, logic: false } } });
    expect(legacy.settings).toMatchObject({ tempo: 90, scale: 'Dorian', root: 2 });
    const n5 = legacy.nodes.find(n => n.id === 5);
    expect([n5.x, n5.y, n5.start, n5.mode, n5.pathMode, n5.to, n5.weights]).toEqual([288, 144, true, 1, 1, [6], { 6: 50 }]);
    expect(legacy.nodes.find(n => n.id === 6)).toMatchObject({ type: 'counter', countMax: 3 });
    expect(() => parseNous({ nope: 1 })).toThrow();
  });

  it('plays the ring: a note each time a traveler arrives, a cell a beat', () => {
    const { msgs, res } = play(RING, 5);
    expect(res.stats).toEqual({ nodes: 3, paths: 3 });
    expect(res.warnings).toEqual([]);
    // 120 bpm: a beat is 0.5 s. C starts at 0; E is 2 cells on (1 s), G 2 cells down (2 s), and C again 4 cells back (4 s), then E at 5 s.
    expect(ons(msgs).slice(0, 5)).toEqual([[0, 0, 60, 100], [1, 0, 64, 90], [2, 1, 67, 80], [4, 0, 60, 100], [5, 0, 64, 90]]);
  });

  it('routes by mode: split sends both ways, a terminator ends the flow', () => {
    const split = { points: [
      node(1, 0, 0, { isStart: true, playMode: 'split', to: [2, 3], forceScale: false }),
      node(2, 1, 0, { midi_data: { Primary: 62, Secondary: 100, Channel: 1, Duration: 0.25 }, forceScale: false }),
      node(3, 0, 1, { type: 'terminator', midi_data: { Primary: 65, Secondary: 100, Channel: 1, Duration: 0.25 } })
    ] };
    const { msgs } = play(split, 3);
    expect(ons(msgs).map(o => o[2])).toEqual([60, 62]);   // the terminator plays nothing and sends nothing on
  });

  it('relative notes step in the scale; repeats and chance', () => {
    const rel = { settings: { tempo: 120, scale: 'Ionian', root: 60 }, points: [
      node(1, 0, 0, { isStart: true, to: [2], forceScale: false }),
      node(2, 1, 0, { useRelative: true, relative_midi_data: { Primary: 2, Pass: { Primary: false } }, midi_data: { Primary: 0, Secondary: 100, Channel: 1, Duration: 0.5, Repeat: 2 } })
    ] };
    const { msgs } = play(rel, 3);
    const o = ons(msgs);
    expect(o[1][2]).toBe(64);                               // two scale steps above C in C major
    expect(o.slice(1).map(x => x[0])).toEqual([0.5, 0.75, 1]);   // arrives at 1 beat; repeats every duration (0.5 beat = 0.25 s)
    const never = { points: [node(1, 0, 0, { isStart: true, probability: 0, forceScale: false })] };
    expect(ons(play(never, 1).msgs)).toEqual([]);
  });

  it('a counter lets one signal in N through', () => {
    const c = { points: [
      node(1, 0, 0, { isStart: true, to: [2], forceScale: false }),
      node(2, 1, 0, { type: 'counter', CountLimit: 2, to: [3] }),
      node(3, 2, 0, { midi_data: { Primary: 72, Secondary: 100, Channel: 1, Duration: 0.25 }, forceScale: false })
    ] };
    const { msgs } = play(c, 3);
    expect(ons(msgs).map(o => o[2])).toEqual([60]);   // one start signal reaches a counter that wants two
  });
});
