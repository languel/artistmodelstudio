import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPLAINER } from '../examples/lessons/threejs/explainer.js';
import { LESSON } from '../examples/lessons/threejs/lesson.js';

const boards = new Map();
for (const s of LESSON.sections) for (const b of s.boards) boards.set(b.title, b);
boards.set(LESSON.title, { title: LESSON.title });   // (the cover frame)
boards.set(LESSON.cover.title, LESSON.cover);
const plain = t => t.replace(/ · (code|notes)$/, '');
const codeOf = t => { const b = boards.get(t); return b ? (b.three ?? b.code ?? '') : null; };

it('the three.js explainer goes only to boards the lesson builds', () => {
  for (const c of EXPLAINER.cues) for (const t of [c.goto, c.restart, c.select?.code && plain(c.select.code), c.select?.pseudo && plain(c.select.pseudo), c.formula?.on, c.set?.on, c.point?.on, c.drag?.on, c.click?.summary && plain(c.click.summary)].filter(Boolean)) {
    expect(boards.has(t), t).toBe(true);
  }
});

it('every code selection finds its lines in the sketch, anchors without arrow functions (the editor reformats them)', () => {
  for (const c of EXPLAINER.cues) {
    if (!c.select?.code) continue;
    for (const a of [c.select.from, c.select.to]) expect(a, a).not.toContain('=>');
    const src = codeOf(plain(c.select.code)).split('\n');
    const from = src.findIndex(l => l.includes(c.select.from));
    expect(from, `${c.select.code}: from "${c.select.from}"`).toBeGreaterThanOrEqual(0);
    expect(src.findIndex((l, i) => i >= from && l.includes(c.select.to)), `${c.select.code}: to "${c.select.to}"`).toBeGreaterThanOrEqual(0);
  }
});

it('every control it sets is declared by its sketch, and an effect is held long enough to see', () => {
  for (const c of EXPLAINER.cues) {
    if (c.set) expect(codeOf(c.set.on), c.set.on).toMatch(new RegExp(`let ${c.set.name} = `));
    if (c.set || c.drag) expect((c.wait || 0) + (c.hold || 0) + (c.drag?.ms || 0), c.say).toBeGreaterThanOrEqual(1500);
  }
});

it('walks the whole set-up of a scene in the first step: renderer, scene, camera, controls, light, mesh and loop', () => {
  const said = EXPLAINER.cues.filter(c => c.select?.code?.startsWith('0.1')).map(c => c.select.from);
  for (const part of ['WebGLRenderer', 'new THREE.Scene', 'PerspectiveCamera', 'OrbitControls', 'DirectionalLight', 'new THREE.Mesh', 'setAnimationLoop']) {
    expect(said.some(f => f.includes(part)), part).toBe(true);
  }
});

it('the fox is a model the lesson fetches, and the sketch reads it by name', () => {
  expect(LESSON.models[0]).toMatchObject({ title: 'Fox', url: '/models/fox/Fox.glb' });
  const fox = boards.get('1.4 · A model that moves');
  expect(fox.three).toContain("window.__amsFiles?.['Fox.glb']");
  expect(readFileSync('public/models/fox/LICENSE.md', 'utf8')).toMatch(/CC0/);
});
