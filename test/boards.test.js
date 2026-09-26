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

describe('board code', () => {
  it('runs into its board (fractions of the board) and replaces its last run', () => {
    const s = new ProcessStore();
    const b = s.addBoard({ title: 'Points', x: 2000, y: 100, width: 400, height: 200 });
    s.addElement({ role: 'line', board: b.id, points: [[2010, 110], [2020, 120]] });   // drawn by hand: kept
    let r = s.runBoardCode(b.id, `for (const i of range(3)) point(i / 2, 0.5)`, runScript);
    expect(r.error).toBeNull();
    expect(r.marks).toBe(3);
    const pts = s.doc.elements.filter(e => e.role === 'point');
    expect(pts.map(e => e.points[0].slice(0, 2))).toEqual([[2000, 200], [2200, 200], [2400, 200]]);
    expect(pts.every(e => e.board === b.id)).toBe(true);
    r = s.runBoardCode(b.id, `point(0.5, 0.5)`, runScript);
    expect(s.doc.elements.filter(e => e.role === 'point').length).toBe(1);
    expect(s.doc.elements.filter(e => e.role === 'line').length).toBe(1);
    expect(s.doc.boards[0].code).toBe('point(0.5, 0.5)');
    expect(s.runBoardCode(b.id, `point(`, runScript).error).toBeTruthy();
  });
});

import { sceneHtml, pageRuntime, docFromPage } from '../src/process/page.js';
describe('the page', () => {
  it('its runtime parses, and the drawing comes back out of it', () => {
    expect(() => new Function(pageRuntime())).not.toThrow();
    const s = new ProcessStore();
    const b = s.addBoard({ title: 'Points', width: 400, height: 200 });
    s.runBoardCode(b.id, `const n = 3 /* 1..9 */\nfor (const i of range(n)) point(i / 2, 0.5)`, runScript);
    s.updateBoard(b.id, { text: 'Three **points**.' });
    const html = sceneHtml(s.doc);
    expect(html).toContain('<strong>points</strong>');
    expect(html).toContain('data-code-for="' + b.id + '"');
    expect(docFromPage(html).boards[0].title).toBe('Points');
  });
});

import { runScoreInto } from '../src/process/script.js';
describe('running a score into a board', () => {
  it('replaces that board\'s marks, and keeps the other boards and the blackboard', () => {
    const s = new ProcessStore();
    s.updateBoard(MAIN, { title: 'Title slide', text: 'hello' });
    const b = s.addBoard({ title: 'Two', width: 400, height: 200 });
    s.addElement({ role: 'line', points: [[10, 10], [20, 20]] });                 // main
    s.addElement({ role: 'line', board: b.id, points: [[0, 0], [1, 1]] });        // board Two
    s.addElement({ role: 'line', points: [[-500, -500], [-400, -400]] });         // blackboard
    const res = runScoreInto(s.doc, `artboard(800, 600)\npoint(0.5, 0.5)`, { board: b.id });
    expect(res.error).toBeNull();
    const d = res.doc, two = boardsOf(d).find(x => x.id === b.id);
    expect(boardsOf(d).map(x => x.title)).toEqual(['Title slide', 'Two']);
    expect(d.artboard.text).toBe('hello');
    expect([two.width, two.height]).toEqual([800, 600]);
    expect(d.elements.filter(e => e.board === b.id).map(e => e.role)).toEqual(['point']);
    expect(d.elements.find(e => e.role === 'point').points[0].slice(0, 2)).toEqual([two.x + 400, two.y + 300]);
    expect(d.elements.filter(e => !e.board).length).toBe(1);
    expect(d.elements.filter(e => e.board === BLACKBOARD).length).toBe(1);
  });
  it('into the main board keeps the main board\'s title and text', () => {
    const s = new ProcessStore();
    s.updateBoard(MAIN, { title: 'Intro', text: 'words' });
    const res = runScoreInto(s.doc, `artboard(500, 500)\npoint(0.5, 0.5)`);
    expect(res.doc.artboard).toMatchObject({ width: 500, height: 500, title: 'Intro', text: 'words' });
  });
});

import { closeLasso, lazyStep } from '../src/process/strokes.js';
describe('strokes', () => {
  it('a lasso whose ends overshoot is cut where they cross', () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const a = -0.3 + (i / 40) * (Math.PI * 2 + 0.6); pts.push([100 + 50 * Math.cos(a), 100 + 50 * Math.sin(a), i, 0.5]); }
    const out = closeLasso(pts, 6);
    expect(out.length).toBeLessThan(pts.length);
    const gap = Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]);
    expect(gap).toBeLessThan(20);
  });
  it('the lazy pen stays until the string is taut', () => {
    expect(lazyStep([0, 0], [5, 0], 10)).toEqual([0, 0]);
    const p = lazyStep([0, 0], [30, 0], 10);
    expect(p[0]).toBeCloseTo(20);
  });
});

import { rdp } from '../src/process/sculpt.js';
describe('simplify on a closed path', () => {
  it('keeps the shape when the ends coincide', () => {
    const sq = [[0, 0], [50, 0], [100, 0], [100, 50], [100, 100], [50, 100], [0, 100], [0, 50], [0, 0]];
    const out = rdp(sq, 1);
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(out.map(p => p.join(','))).toEqual(expect.arrayContaining(['100,0', '100,100', '0,100']));
  });
});

describe('snapping marks', () => {
  it('points, tidy, and position', () => {
    const s = new ProcessStore();
    const a = s.addElement({ role: 'line', points: [[12, 3], [24, 2], [37, 1], [49, 26], [51, 49]] });
    s.snapMarks([a.id], 'points', 25);
    expect(s.doc.elements[0].points.map(p => p.slice(0, 2))).toEqual([[0, 0], [25, 0], [25, 0], [50, 25], [50, 50]]);
    s.snapMarks([a.id], 'tidy', 25);
    expect(s.doc.elements[0].points.map(p => p.slice(0, 2))).toEqual([[0, 0], [25, 0], [50, 25], [50, 50]]);
    const b = s.addElement({ role: 'line', points: [[13, 13], [33, 20]] });
    s.snapMarks([b.id], 'topleft', 25);
    expect(s.doc.elements[1].points[0].slice(0, 2)).toEqual([25, 25]);
  });
});
