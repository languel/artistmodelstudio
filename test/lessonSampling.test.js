import { describe, it, expect } from 'vitest';
import { LESSON, BIBLIOGRAPHY } from '../examples/lessons/sampling/lesson.js';
import { LESSONS, buildLesson } from '../src/workbench/lessons.js';

describe('the sampling lesson and explicate mode', () => {
  const allBoards = LESSON.sections.flatMap(s => s.boards.map(b => ({ ...b, section: s })));
  const artDemoBoards = allBoards.filter(b => !b.section.diagram && !b.reference);
  const diagramBoards = allBoards.filter(b => b.section.diagram);

  it('preserves tech diagrams without p5expl and defines p5expl for the 8 plain art demos (the two ml5 ones are held back)', () => {
    // Tech diagrams: eye, mosaic, curves, pixel, timeline
    expect(diagramBoards.length).toBe(5);
    for (const d of diagramBoards) {
      expect(d.p5expl).toBeUndefined();
      expect(d.code).toBeTruthy();
    }

    // Art demos: sample, grid, scatter, divide, along, feel, walkdots, walkfeel, gesture, bodybrush
    expect(artDemoBoards.length).toBe(10);
    const held = ['gesture', 'bodybrush'];   // ml5.js: not yet tried in the p5 editor
    for (const b of artDemoBoards.filter(x => held.includes(x.id))) expect(b.p5expl, b.id).toBeUndefined();
    for (const b of artDemoBoards.filter(x => !held.includes(x.id))) {
      expect(b.p5expl, b.id).toBeTruthy();
      expect(typeof b.p5expl).toBe('string');
      expect(b.p5expl, b.id).not.toMatch(/function preload|curveVertex/);   // p5 2.x style: async setup
      // Ensure the sketch code parses as valid JS
      expect(() => new Function(b.p5expl), b.id).not.toThrow();
    }
  });

  it('each explicate sketch uses standard p5 without AMS helper functions', () => {
    for (const b of artDemoBoards.filter(x => x.p5expl)) {
      // Must not use AMS wrappers
      expect(b.p5expl).not.toMatch(/\bdrawPoint\(/);
      expect(b.p5expl).not.toMatch(/\bdrawLine\(/);
      expect(b.p5expl).not.toMatch(/\bdrawPlane\(/);
      expect(b.p5expl).not.toMatch(/\bfit\(\s*['"]/);
      expect(b.p5expl).not.toMatch(/\bsource\(\s*['"]/);
      // Must define standard p5 functions
      expect(b.p5expl).toMatch(/function setup\(\)/);
      expect(b.p5expl).toMatch(/function draw\(\)/);
      expect(b.p5expl).toMatch(/createCanvas\(/);
    }
  });

  it('exports LESSONS with sampling, sampling-expl and diffusion', () => {
    const ids = LESSONS.map(l => l.id);
    expect(ids).toContain('sampling');
    expect(ids).toContain('sampling-expl');
    expect(ids).toContain('diffusion');

    const explLesson = LESSONS.find(l => l.id === 'sampling-expl');
    expect(explLesson.languages).toContain('expl');
  });
});
