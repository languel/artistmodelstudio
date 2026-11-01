// @vitest-environment happy-dom
import { it, expect } from 'vitest';
import { LESSON } from '../examples/lessons/threejs/lesson.js';
import { buildLessonScene } from '../examples/lessons/sampling/scene.js';
import { ProcessStore, createDocument, normalizeDocument } from '../src/process/document.js';

it('asks for a code panel in each slide, and a column with the notes above an editor fills the frame', async () => {
  expect(LESSON.codePanel).toBe(true);
  const store = new ProcessStore(normalizeDocument(createDocument()));
  const app = { store, scenes: { create: async () => {} }, sources: { def: () => true, whenReady: async () => {}, add: async () => {} }, setBoardSource() {}, setBoardLive() {}, setBoardFollow() {}, goToBoard() {} };
  await buildLessonScene(app, { lesson: LESSON });
  const boards = store.doc.boards, codes = boards.filter(b => b.kind === 'code');
  expect(codes.length).toBe(boards.filter(b => b.kind === 'three').length);
  for (const c of codes) {
    const sketch = boards.find(b => b.id === c.of), notes = boards.find(b => b.title === `${sketch.title} · notes`);
    expect(sketch.kind, c.title).toBe('three');
    expect(notes.kind).toBe('markdown');
    // the column: the notes, then the editor right under them, both as wide as the column, ending where the frame does
    expect([c.x, c.width]).toEqual([notes.x, notes.width]);
    expect(c.y).toBeGreaterThan(notes.y + notes.height - 1);
    expect(c.y + c.height - notes.y).toBe(820);
    // and the code is formatted: no line of code is a screenful
    expect(Math.max(...sketch.code.split('\n').map(l => l.replace(/\s*\/\/.*$/, '').length)), sketch.title).toBeLessThan(90);   // (a comment may run on: the editor wraps it)
  }
  expect(boards.find(b => b.title === '0.3 · Controls in code' && b.kind === 'three').code).toContain('const speed = 1 /* 0..4 */');
});
