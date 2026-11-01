// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { ProcessStore, createDocument, normalizeDocument } from '../src/process/document.js';
import { boardsOf, boardKind, boardNumbers, BOARD_KINDS } from '../src/process/boards.js';
import { pageBoards } from '../src/process/page.js';
import { boardPart } from '../src/process/parts.js';

const store = () => new ProcessStore(normalizeDocument(createDocument()));

describe('a code board: an editor on another board\'s code', () => {
  it('is a kind of board that says which board it is on, and keeps that through a reload', () => {
    expect(BOARD_KINDS).toContain('code');
    const s = store(), sketch = s.addBoard({ title: 'Sketch' }), cb = s.addBoard({ title: 'Sketch · code' });
    s.updateBoard(sketch.id, { kind: 'three', code: 'const a = 1' });
    s.updateBoard(cb.id, { kind: 'code', of: sketch.id });
    const now = boardsOf(s.doc).find(b => b.id === cb.id);
    expect([boardKind(now), now.of]).toEqual(['code', sketch.id]);
    const again = normalizeDocument(JSON.parse(JSON.stringify(s.doc)));
    expect(boardsOf(again).find(b => b.id === cb.id)).toMatchObject({ kind: 'code', of: sketch.id });
    s.updateBoard(cb.id, { of: '' });
    expect(boardsOf(s.doc).find(b => b.id === cb.id).of).toBeUndefined();
  });

  it('is left out of an exported page (the sketch has its own code box there) and travels with a board part', () => {
    const s = store(), sketch = s.addBoard({ title: 'Sketch' }), cb = s.addBoard({ title: 'Sketch · code' });
    s.updateBoard(sketch.id, { kind: 'p5', code: 'function draw() {}' });
    s.updateBoard(cb.id, { kind: 'code', of: sketch.id });
    expect(pageBoards(s.doc).map(b => b.id)).toContain(sketch.id);
    expect(pageBoards(s.doc).map(b => b.id)).not.toContain(cb.id);
    expect(boardPart(s.doc, cb.id).artboard.of).toBe(sketch.id);
  });
});

describe('the numbers of boards', () => {
  it('are the places in the presentation: the frames in reading order, and nothing else when there are frames', () => {
    const s = store();
    // made out of order: the lower row first, then the upper row's second frame, then its first
    const mk = (title, x, y) => { const b = s.addBoard({ title, x, y, width: 1600, height: 900 }); s.updateBoard(b.id, { kind: 'frame' }); return b; };
    const low = mk('Low', 0, 3000), right = mk('Right', 2000, 0), left = mk('Left', 0, 0);
    const inner = s.addBoard({ title: 'Inside', x: 100, y: 100, width: 400, height: 300 });
    const loose = s.addBoard({ title: 'Loose', x: 9000, y: 0, width: 400, height: 300 });
    const n = boardNumbers(s.doc);
    expect([n.get(left.id), n.get(right.id), n.get(low.id)]).toEqual([1, 2, 3]);
    expect([n.has('main'), n.has(inner.id), n.has(loose.id)]).toEqual([false, false, false]);
  });
  it('without frames every board is a slide, in sequence, the main board first', () => {
    const s = store(), a = s.addBoard({ title: 'A' }), b = s.addBoard({ title: 'B' });
    const n = boardNumbers(s.doc);
    expect([n.get('main'), n.get(a.id), n.get(b.id)]).toEqual([1, 2, 3]);
  });
  it('are the same ones the Boards panel and the titles on the canvas show (one function)', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['../src/workbench/panels/boards.js', '../src/workbench/canvasView.js']) expect(readFileSync(new URL(f, import.meta.url), 'utf8'), f).toContain('boardNumbers');
  });
});
