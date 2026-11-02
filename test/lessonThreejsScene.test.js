// @vitest-environment happy-dom
import { it, expect } from 'vitest';
import { LESSON } from '../examples/lessons/threejs/lesson.js';
import { LESSON as DIFFUSION } from '../examples/lessons/diffusion/lesson.js';
import { buildLessonScene } from '../examples/lessons/sampling/scene.js';
import { ProcessStore, createDocument, normalizeDocument } from '../src/process/document.js';
import { boardsOf } from '../src/process/boards.js';

const fakeApp = () => {
  const store = new ProcessStore(normalizeDocument(createDocument()));
  return { store, scenes: { create: async () => {} }, sources: { def: () => true, whenReady: async () => {}, add: async () => {} }, setBoardSource() {}, setBoardLive() {}, setBoardFollow() {}, goToBoard() {} };
};
const codeLines = code => code.split('\n').map(l => l.replace(/\s*\/\/.*$/, ''));   // (a comment is wrapped, not counted)

it('asks for a code panel in each slide: the notes above an editor, filling the frame', async () => {
  expect(LESSON.codePanel).toBe(true);
  const app = fakeApp();
  await buildLessonScene(app, { lesson: LESSON });
  const all = boardsOf(app.store.doc), codes = all.filter(b => b.kind === 'code');
  // every sketch, and the route diagram (studio code), has its code view
  expect(codes.length).toBe(all.filter(b => b.kind === 'three').length + 1 - 1);   // (the cover's picture has no code panel: it is the fox of 1.4)
  for (const c of codes) {
    const target = all.find(b => b.id === c.of), notes = all.find(b => b.title === `${target.title} · notes`);
    expect(['three', undefined], c.title).toContain(target.kind);
    expect(notes.kind).toBe('markdown');
    // the column: the notes, then the editor right under them, both as wide as the column, ending where the frame does
    expect([c.x, c.width]).toEqual([notes.x, notes.width]);
    expect(c.y).toBeGreaterThan(notes.y + notes.height - 1);
    expect(c.y + c.height - notes.y).toBe(820);
    // and the code is formatted: no line of code is a screenful
    expect(Math.max(...codeLines(target.code).map(l => l.length)), target.title).toBeLessThan(90);
    // the notes do not repeat it as a conversion
    expect(notes.code, target.title).not.toContain('[!example]');
  }
  expect(all.find(b => b.title === '0.3 · Controls in code' && b.kind === 'three').code).toContain('const speed = 1 /* 0..4 */');
  // the route: studio code, formatted, and it still draws
  const route = all.find(b => b.id === 'main');
  expect(route.code).toContain('const label = (x, y, t, o = {}) =>\n');
  expect(app.store.doc.elements.length).toBeGreaterThan(20);
});

it('shows the code in a callout formatted too (and its comments wrapped) in a lesson without a code panel', async () => {
  const app = fakeApp();
  await buildLessonScene(app, { lesson: { ...DIFFUSION, codePanel: false } });
  const notes = boardsOf(app.store.doc).filter(b => / · notes$/.test(b.title));
  expect(notes.length).toBeGreaterThan(8);
  let fences = 0;
  for (const n of notes) for (const m of n.code.matchAll(/> \[!example\]-[^\n]*\n((?:>[^\n]*\n?)*)/g)) {
    const code = m[1].split('\n').map(l => l.replace(/^> ?/, '')).join('\n');
    fences++;
    const lines = code.replace(/```(js)?/g, '').split('\n');
    expect(Math.max(...lines.filter(l => /^\s*\/\//.test(l)).map(l => l.length), 0), `${n.title}: whole-line comments are wrapped`).toBeLessThan(75);
    expect(Math.max(...codeLines(lines.join('\n')).filter(l => !/['"`]/.test(l)).map(l => l.length), 0), n.title).toBeLessThan(80);   // (a line with a long string stays whole)
  }
  expect(fences).toBeGreaterThan(8);
});

it('the diffusion lecture has the same column: a code view for each diagram (studio code) and each simulation (p5.js)', async () => {
  const app = fakeApp();
  await buildLessonScene(app, { lesson: DIFFUSION });
  const all = boardsOf(app.store.doc), codes = all.filter(b => b.kind === 'code');
  const examples = DIFFUSION.sections.flatMap(s => s.boards);
  expect(codes.length).toBe(examples.length);
  for (const c of codes) {
    const target = all.find(b => b.id === c.of);
    expect(['p5', undefined], c.title).toContain(target.kind);
    expect(c.y + c.height - all.find(b => b.title === `${target.title} · notes`).y, c.title).toBe(820);
  }
});
