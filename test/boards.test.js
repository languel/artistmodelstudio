import { describe, it, expect } from 'vitest';
import { runScript } from '../src/process/script.js';
import { normalizeDocument, ProcessStore } from '../src/process/document.js';
import { boardsOf, boardDoc, boardForPoints, BLACKBOARD, MAIN, trainBoard } from '../src/process/boards.js';

describe('boards', () => {
  it('older drawings: marks wholly outside the artboard go to the blackboard', () => {
    const d = normalizeDocument({ artboard: { width: 100, height: 100 }, elements: [
      { id: 'a', role: 'line', points: [[10, 10], [20, 20]] },
      { id: 'b', role: 'line', points: [[200, 10], [220, 20]] },
      { id: 'c', role: 'line', points: [[90, 10], [120, 20]] }
    ] });
    expect(d.elements.find(e => e.id === 'a').board).toBeUndefined();
    expect(d.elements.find(e => e.id === 'b').board).toBe(BLACKBOARD);
    expect(d.elements.find(e => e.id === 'c').board).toBeUndefined();
    expect(boardDoc(d).elements.map(e => e.id)).toEqual(['a', 'c']);
  });

  it('scores: board() makes a board and fractions are of that board', () => {
    const { doc, error } = runScript(`
      point(0.5, 0.5)
      board('Lines', { width: 400, height: 200 })
      line([[0, 0], [1, 1]])
      board()
      point(0.1, 0.1)
    `);
    expect(error).toBeNull();
    const bs = boardsOf(doc);
    expect(bs.map(b => b.title)).toEqual(['Main', 'Lines']);
    const lines = bs[1];
    const ln = doc.elements.find(e => e.role === 'line');
    expect(ln.board).toBe(lines.id);
    expect(ln.points[0].slice(0, 2)).toEqual([lines.x, lines.y]);
    expect(ln.points[1].slice(0, 2)).toEqual([lines.x + 400, lines.y + 200]);
    // As its own document, the board's marks sit at its origin.
    const bd = boardDoc(doc, lines.id);
    expect(bd.artboard).toMatchObject({ width: 400, height: 200 });
    expect(bd.elements[0].points[1].slice(0, 2)).toEqual([400, 200]);
    expect(doc.elements.filter(e => e.role === 'point').every(e => !e.board)).toBe(true);
  });

  it('the store: new marks join the board they land on; moving a board moves its marks', () => {
    const s = new ProcessStore();
    const b = s.addBoard({ title: 'Two', x: 2000, y: 0, width: 500, height: 500 });
    const e = s.addElement({ role: 'line', points: [[2100, 100], [2200, 200]] });
    expect(e.board).toBe(b.id);
    expect(boardForPoints(s.doc, [[5000, 5000]])).toBe(BLACKBOARD);
    s.updateBoard(b.id, { x: 2100 });
    expect(s.doc.elements[0].points[0][0]).toBe(2200);
    s.removeBoard(b.id);
    expect(s.doc.elements[0].board).toBe(BLACKBOARD);
    expect(trainBoard(s.doc)).toBe(MAIN);
  });
});

import { toP5, toSVG } from '../src/process/exports.js';
describe('exports with boards', () => {
  it('the p5 sketch (runtime bundled) still parses', () => {
    const { doc } = runScript(`point(0.5, 0.5)\nboard('Two')\nline([[0, 0], [1, 1]])`);
    const src = toP5(doc);
    expect(() => new Function(src)).not.toThrow();
  });
  it('SVG of a board holds only its marks, at its origin', () => {
    const { doc } = runScript(`point(0.5, 0.5)\nboard('Two', { width: 200, height: 100 })\nline([[0, 0], [1, 1]], { why: 'diag' })`);
    const two = boardsOf(doc)[1];
    const svg = toSVG(boardDoc(doc, two.id));
    expect(svg).toContain('width="200"');
    expect(svg).toContain('data-ams-role="line"');
    expect(svg).not.toContain('data-ams-role="point"');
  });
});
