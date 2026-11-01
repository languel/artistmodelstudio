// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { ProcessStore, createDocument, normalizeDocument } from '../src/process/document.js';
import { boardsOf, boardKind, BOARD_KINDS } from '../src/process/boards.js';
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
