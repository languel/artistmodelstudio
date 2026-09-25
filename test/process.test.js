import { describe, it, expect } from 'vitest';
import { runScript } from '../src/process/script.js';
import { ProcessStore, createDocument } from '../src/process/document.js';
import { toSVG, fromSVG, toExcalidraw, fromExcalidraw, toP5 } from '../src/process/exports.js';
import { resolveParams, BRUSHES } from '../src/process/brushes.js';

const SCORE = `
artboard(800, 600, '#f1ebdd')
stage('Construction', 'construction')
decide('Where does the weight sit?', ['low left', 'high right'], 'low left', 'Kandinsky: below and left feels heavy')
guide([[0, 400], [800, 400]], { why: 'horizon' })
stage('Marks', 'marks')
const path = walk({ from: [80, 450], heading: -15, steps: 40, step: 14, turn: i => sin(i / 5) * 8 })
line(path, { width: 3, why: 'the active line walks to the right' })
plane(rect(500, 150, 180, 120), { brush: 'hatch', angle: 30, spacing: 8, why: 'a light plane, high right' })
point(160, 480, { size: 36, why: 'the weight' })
note(20, 20, 'Point, line, plane')
`;

describe('process scripts', () => {
  it('records stages, elements with reasons and authors, and decisions', () => {
    const { doc, error } = runScript(SCORE, { seed: 7, by: { kind: 'model', name: 'test' } });
    expect(error).toBeNull();
    expect(doc.artboard).toEqual({ width: 800, height: 600, ground: '#f1ebdd' });
    expect(doc.stages.map(s => s.name)).toEqual(['Construction', 'Marks']);
    expect(doc.elements.map(e => e.role)).toEqual(['guide', 'line', 'plane', 'point', 'note']);
    const line = doc.elements[1];
    expect(line.points.length).toBe(41);
    expect(line.why).toMatch(/walks/);
    expect(line.by.name).toBe('test');
    expect(line.points[5][2]).toBeGreaterThan(line.points[0][2]); // time increases
    expect(doc.decisions[0]).toMatchObject({ chosen: 'low left' });
    expect(doc.meta.script).toContain('walk(');
  });

  it('is deterministic for a seed', () => {
    const src = 'line(walk({ from: [0, 0], steps: 10, step: 5, turn: () => random(-30, 30) }))';
    const a = runScript(src, { seed: 3 }).doc.elements[0].points;
    const b = runScript(src, { seed: 3 }).doc.elements[0].points;
    const c = runScript(src, { seed: 4 }).doc.elements[0].points;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('reports script errors instead of throwing', () => {
    expect(runScript('line(nope)').error).toMatch(/nope/);
    expect(runScript("plane(rect(0,0,1,1), { brush: 'glitter' })").error).toMatch(/Unknown brush/);
  });
});

describe('brushes', () => {
  it('clamps params to their declared ranges and fills defaults', () => {
    const p = resolveParams('hatch', { spacing: 1000, angle: 'x' });
    expect(p.spacing).toBe(80);
    expect(p.angle).toBe(45);
    for (const b of Object.values(BRUSHES)) for (const s of b.params) expect(s.doc.length).toBeGreaterThan(5);
  });
});

describe('store', () => {
  it('undoes and redoes element edits', () => {
    const s = new ProcessStore(createDocument());
    const e = s.addElement({ role: 'line', points: [[0, 0], [10, 10]] });
    s.updateElement(e.id, { why: 'because' });
    expect(s.doc.elements[0].why).toBe('because');
    s.undo();
    expect(s.doc.elements[0].why).toBe('');
    s.redo();
    expect(s.doc.elements[0].why).toBe('because');
  });
});

describe('exports', () => {
  const { doc } = runScript(SCORE, { seed: 7 });

  it('round-trips through SVG without losing the record', () => {
    const svg = toSVG(doc);
    expect(svg).toContain('data-ams-stage');
    expect(svg).toContain('<title>the weight</title>');
    const back = fromSVG(svg);
    expect(back.elements).toEqual(doc.elements);
    expect(back.stages.map(s => s.name)).toEqual(doc.stages.map(s => s.name));
    expect(back.decisions).toEqual(doc.decisions);
    expect(back.meta.script).toBe(doc.meta.script);
  });

  it('round-trips through Excalidraw', () => {
    const ex = toExcalidraw(doc);
    expect(ex.elements.find(e => e.type === 'freedraw').pressures.length).toBeGreaterThan(10);
    const back = fromExcalidraw(ex);
    expect(back.elements.map(e => e.id)).toEqual(doc.elements.map(e => e.id));
  });

  it('imports plain Excalidraw drawings', () => {
    const back = fromExcalidraw({ elements: [
      { id: 'a', type: 'freedraw', x: 10, y: 10, points: [[0, 0], [5, 5], [10, 3]], pressures: [0.2, 0.8, 0.4], strokeColor: '#111', strokeWidth: 2 },
      { id: 'b', type: 'text', x: 50, y: 50, text: 'hello' },
      { id: 'c', type: 'line', x: 0, y: 0, points: [[0, 0], [20, 0]], strokeStyle: 'dashed' }
    ] });
    expect(back.elements.map(e => e.role)).toEqual(['line', 'note', 'guide']);
    expect(back.elements[0].points[1][3]).toBe(0.8);
  });

  it('writes a p5 sketch that parses and avoids p5 global names', () => {
    const src = toP5(doc);
    expect(() => new Function(src)).not.toThrow();
    for (const name of ['rotate', 'smooth', 'point', 'line', 'plane', 'circle', 'rect', 'random', 'noise', 'map', 'lerp']) {
      expect(src).not.toMatch(new RegExp(`^(function|const|let|class)\\s+${name}\\b`, 'm'));
    }
    expect(src).toContain('const SCORE =');
    expect(src).toContain('Kandinsky');
  });
});

import { EXERCISES } from '../src/process/exercises.js';
describe('exercises', () => {
  for (const x of EXERCISES) {
    it(`${x.id} runs, names its stages and explains its marks`, () => {
      const { doc, error } = runScript(x.source, { seed: 1 });
      expect(error).toBeNull();
      expect(doc.stages.length).toBeGreaterThan(1);
      const marks = doc.elements.filter(e => e.role !== 'note');
      expect(marks.length).toBeGreaterThan(0);
      expect(marks.every(e => e.why)).toBe(true);
    });
  }
});
