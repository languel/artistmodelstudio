import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPLAINER } from '../examples/lessons/threejs/explainer.js';
import { LESSON } from '../examples/lessons/threejs/lesson.js';

const titles = new Set();
for (const s of LESSON.sections) for (const b of s.boards) titles.add(b.title);

it('the three.js explainer goes only to boards the lesson builds', () => {
  for (const c of EXPLAINER.cues) for (const t of [c.goto, c.restart, c.select?.code?.replace(/ · code$/, ''), c.formula?.on, c.set?.on].filter(Boolean)) {
    expect(titles.has(t.replace(/ · code$/, '')), t).toBe(true);
  }
});

it('the fox is a model the lesson fetches, and the sketch reads it by name', () => {
  expect(LESSON.models[0]).toMatchObject({ title: 'Fox', url: '/models/fox/Fox.glb' });
  const fox = LESSON.sections.flatMap(s => s.boards).find(b => b.title === '1.4 · A model that moves');
  expect(fox.three).toContain("window.__amsFiles?.['Fox.glb']");
  expect(readFileSync('public/models/fox/LICENSE.md', 'utf8')).toMatch(/CC0/);
});
