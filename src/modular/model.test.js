import { describe, it, expect } from 'vitest';
import { normalizeDocument, createDocument } from '../process/document.js';
import { moduleMark, plug, patchOfDoc, scenePatch, syncCables, makeCable, portsOf, portAt, slotNear, moduleAt, remapCables } from './model.js';
import { examplePatch, stepsBetween, toDefs, connect, normalizePatch, parseGrid, gridText } from '../audio/modular/patch.js';

const docWith = marks => normalizeDocument({ ...createDocument(), elements: marks.map((m, i) => ({ id: m.id || `m${i}`, ...m })) });

describe('the modular synth on the canvas', () => {
  it('compiles the drawing into a patch: modules are boxes, cables are paths', () => {
    const d = docWith([{ id: 'seq', ...moduleMark('Euclid', 0, 0) }, { id: 'kit', ...moduleMark('DrumSynth', 300, 0) }, { id: 'out', ...moduleMark('Output', 600, 0) }]);
    expect(plug(d, 'seq', 'kit', 'notes')).toBeTruthy();
    expect(plug(d, 'kit', 'out', 'input')).toBeTruthy();
    const p = patchOfDoc(d);
    expect(p.modules.map(m => m.kind)).toEqual(['Euclid', 'DrumSynth', 'Output']);
    expect(p.cables).toEqual([{ from: 'seq', to: 'kit', slot: 'notes' }, { from: 'kit', to: 'out', slot: 'input' }]);
    // a cable starts at the output port and ends at the slot's port
    const cable = d.elements.find(e => e.play?.cable?.slot === 'input');
    expect(cable.points[0].slice(0, 2)).toEqual([portsOf(d.elements[1]).out.x, portsOf(d.elements[1]).out.y]);
    expect(cable.points.at(-1).slice(0, 2)).toEqual([portAt(d.elements[2], 'input').x, portAt(d.elements[2], 'input').y]);
  });

  it('cables follow their modules, and go when a module goes', () => {
    const d = docWith([{ id: 'a', ...moduleMark('Osc', 0, 0) }, { id: 'o', ...moduleMark('Output', 300, 0) }]);
    const c = plug(d, 'a', 'o', 'input');
    d.elements[1].points = d.elements[1].points.map(q => [q[0] + 50, q[1] + 80, q[2], q[3]]);
    expect(syncCables(d)).toBe(1);
    expect(c.points.at(-1).slice(0, 2)).toEqual([portAt(d.elements[1], 'input').x, portAt(d.elements[1], 'input').y]);
    expect(syncCables(d)).toBe(0);
    d.elements = d.elements.filter(e => e.id !== 'o');
    syncCables(d);
    expect(d.elements.some(e => e.play?.cable)).toBe(false);
  });

  it('makes a cable of a path drawn from one module to another, choosing the slot nearest its end', () => {
    const d = docWith([{ id: 'lfo', ...moduleMark('LFO', 0, 0) }, { id: 'f', ...moduleMark('Filter', 300, 0) }]);
    const f = d.elements[1], res = portAt(f, 'mod:resonance');
    d.elements.push({ id: 'line', role: 'line', points: [[60, 30, 0, 0.5], [200, 150, 0, 0.5], [res.x, res.y + 2, 0, 0.5]], realize: { brush: 'ink', params: {} } });
    expect(makeCable(d, 'line')).toBe(true);
    expect(d.elements[2].play.cable).toMatchObject({ from: 'lfo', to: 'f', slot: 'mod:resonance' });
    syncCables(d);
    expect(d.elements[2].points).toHaveLength(3);   // (drawn by hand: its middle stays)
    expect(d.elements[2].points[1].slice(0, 2)).toEqual([200, 150]);
    expect(moduleAt(d, 310, 10).id).toBe('f');
    expect(slotNear(d, d.elements[0], f)).toBe('mod:cutoff');
  });

  it('merges the Patch panel and the drawing, and leaves out hidden marks', () => {
    const d = docWith([{ id: 'o2', ...moduleMark('Output', 0, 0) }, { id: 'n', ...moduleMark('Noise', 0, 200), hidden: true }]);
    const merged = scenePatch(d, examplePatch('starter'));
    expect(merged.modules.length).toBe(examplePatch('starter').modules.length + 1);
    expect(scenePatch(docWith([]), examplePatch('starter'))).toEqual(examplePatch('starter'));
  });

  it('copies of modules take their cables with them', () => {
    const els = [{ id: 'x2', play: { cable: { from: 'a', to: 'b', slot: 'input' } } }];
    remapCables(els, new Map([['a', 'a2'], ['b', 'b2']]));
    expect(els[0].play.cable).toMatchObject({ from: 'a2', to: 'b2' });
  });
});

describe('new kinds: sources, modulation, the Grid', () => {
  it('an LFO only modulates; an Osc into an Osc is FM', () => {
    let p = normalizePatch({ modules: [{ id: 'l', kind: 'LFO' }, { id: 'f', kind: 'Filter' }, { id: 'o', kind: 'Osc' }, { id: 'c', kind: 'Osc' }, { id: 'out', kind: 'Output' }] });
    expect(connect(p, 'l', 'f', 'input').cables).toHaveLength(0);
    p = connect(p, 'l', 'f', 'mod:cutoff', 0.5);
    p = connect(p, 'o', 'c', 'mod:freq');
    p = connect(p, 'c', 'f', 'input');
    p = connect(p, 'f', 'out', 'input');
    expect(p.cables).toHaveLength(4);
    expect(p.cables[0].amount).toBe(0.5);
    const { defs } = toDefs(p);
    expect(defs.get('f').inputs).toEqual({ 'mod:cutoff': 'l', input: 'c' });
    expect(defs.get('f').amounts).toEqual({ 'mod:cutoff': 0.5 });
  });

  it('a Grid plays the notes of its rows, the top row highest', () => {
    const m = { id: 'g', kind: 'Grid', settings: { cells: 'x...\n..x.\nx...', scale: 'major', root: 60, division: 4 } };
    const ev = stepsBetween(m, 0, 1);
    expect(ev.map(e => [e.step, e.note])).toEqual([[0, 64], [0, 60], [2, 62]]);
    expect(gridText(parseGrid('x.X.\n..x.'))).toBe('x.X.\n..x.');
  });
});

import { addExample, EXAMPLES } from './examples.js';
describe('examples', () => {
  it('each example draws a patch that reaches the speakers', () => {
    for (const name of Object.keys(EXAMPLES)) {
      const d = docWith([]);
      const ids = addExample(d, name, 100, 100);
      const p = patchOfDoc(d);
      expect(ids.length).toBe(p.modules.length + p.cables.length);
      expect(p.modules.some(m => m.kind === 'Output')).toBe(true);
      expect(p.cables.length).toBeGreaterThanOrEqual(p.modules.length - 1);
    }
  });
});

import { faceEdit } from './interact.js';
import { seqLayout } from './face.js';
describe('editing a face with a double-click', () => {
  it('toggles a Grid cell and adds a hit to a Euclid ring', () => {
    const g = docWith([moduleMark('Grid', 0, 0, { cells: '....\n....' })]).elements[0];
    const L = seqLayout(g);
    expect(faceEdit(g, L.x0 + L.cw * 2.5, L.y0 + L.ch * 1.5)).toEqual({ cells: '....\n..x.' });
    const eu = docWith([moduleMark('Euclid', 0, 0, { rings: '8 3 0 36' })]).elements[0], R = seqLayout(eu);
    expect(faceEdit(eu, R.cx + R.rings[0].r, R.cy)).toEqual({ rings: '8 4 0 36' });
    expect(faceEdit(eu, R.cx, R.cy)).toBe(null);   // (the middle: no ring)
  });
});
