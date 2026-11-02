// @vitest-environment happy-dom
import { it, expect } from 'vitest';
import { LESSON } from '../examples/lessons/reiniger/lesson.js';
import { LESSONS } from '../src/workbench/lessons.js';
import { buildLessonScene } from '../examples/lessons/sampling/scene.js';
import { ProcessStore, createDocument, normalizeDocument } from '../src/process/document.js';
import { boardsOf } from '../src/process/boards.js';
import { findControls } from '../src/process/controls.js';

const fakeApp = () => {
  const store = new ProcessStore(normalizeDocument(createDocument()));
  return { store, scenes: { create: async () => {} }, sources: { def: () => true, whenReady: async () => {}, add: async () => {} }, setBoardSource() {}, setBoardLive() {}, setBoardFollow() {}, goToBoard() {} };
};

it('is its own lesson, listed with the others', () => {
  expect(LESSONS.some(l => l.id === 'reiniger')).toBe(true);
  expect(LESSON.title).toBe('The silhouette film');
});

it('builds as a scene: a board per step, each sketch parses and the last one is the whole program', async () => {
  const app = fakeApp();
  await buildLessonScene(app, { lesson: LESSON });
  const sketches = boardsOf(app.store.doc).filter(b => b.kind === 'three');
  expect(sketches.map(b => b.title)).toEqual(['1.1 · The lightbox', '1.2 · A piece of paper', '1.3 · A hinge', '1.4 · The puppet', '1.5 · A set in layers', '1.6 · Two cameras', '1.7 · A walk',
    '2.1 · Paper fibre and film grain', '2.2 · A lamp, a mask', '3.1 · Stop motion', '3.2 · The look of film', '4.1 · The moon']);
  for (const b of sketches) {
    // (parsed, not run: the sketch is a module and needs three)
    expect(() => new Function(b.code.replace(/^import .*$/gm, '')), b.title).not.toThrow();
    expect(b.code, b.title).toContain('new THREE.WebGLRenderer');
  }
  const last = sketches.find(b => b.title === '1.7 · A walk').code;
  expect(findControls(last).map(c => c.name).sort()).toEqual(['joints', 'moon', 'tint', 'view', 'walk']);
  // each board adds to the one before
  const size = t => sketches.find(b => b.title.includes(t)).code.length;
  expect(size('The puppet')).toBeLessThan(size('A set in layers'));
  expect(size('A set in layers')).toBeLessThan(size('A walk'));
});

it('has a performed script whose cues name boards the lesson builds, and whose code lines are in the code', async () => {
  const { HINGE } = await import('../examples/lessons/reiniger/script.js');
  const app = fakeApp();
  await buildLessonScene(app, { lesson: LESSON });
  const boards = boardsOf(app.store.doc), has = t => boards.some(b => b.title === t);
  const ACTIONS = ['goto', 'restart', 'drag', 'click', 'select', 'key', 'wait'];
  for (const c of HINGE.cues) {
    expect(Object.keys(c).filter(k => ACTIONS.includes(k)).length, c.say).toBeLessThanOrEqual(4);
    for (const t of [c.goto, c.restart, c.drag?.on, c.click?.summary, c.select?.pseudo, c.select?.code]) if (t) expect(has(t), t).toBe(true);
    if (c.select?.code) {
      const code = boards.find(b => b.title === c.select.code.replace(/ · code$/, '') && b.kind === 'three').code;
      expect(code).toContain(c.select.from); expect(code).toContain(c.select.to);
    }
  }
});
