import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LESSON } from '../examples/lessons/threejs/lesson.js';
import { findControls, instrument } from '../src/process/controls.js';

const boards = LESSON.sections.flatMap(s => s.boards).filter(b => b.three);

describe('the three.js lesson', () => {
  it('has the new boards after the old ones', () => {
    const ids = LESSON.sections.flatMap(s => s.boards).map(b => b.id);
    expect(ids).toContain('controls');
    expect(ids.at(-1)).toBe('install');
    expect(boards.length).toBe(13 - 1);   // (the route is studio code)
  });

  it('every sketch is valid code (imports aside) and uses the standard window size', () => {
    for (const b of boards) {
      const code = b.three.replace(/^import .*$/gm, '');
      expect(() => new Function(code), b.title).not.toThrow();
      expect(b.three, b.title).not.toContain('ams.width');
    }
  });

  it('every control comment is read as a control, live, and survives the instrumenting', () => {
    const comment = /\/\*\s*(?:-?[\d.]+\s*(?:\.{2,3}|…)|toggle\b|colou?r\b|palette\b|[\w-]+\|)/g;
    let total = 0;
    for (const b of boards) {
      const written = (b.three.match(comment) || []).length;
      const found = findControls(b.three).filter(c => c.kind !== 'param');
      expect(found.length, b.title).toBe(written);
      expect(found.every(c => c.live), b.title).toBe(true);
      const code = instrument(b.three).code;
      expect(() => new Function(code.replace(/^import .*$/gm, '')), b.title).not.toThrow();
      total += written;
    }
    expect(total).toBe(13);   // the controls board (5), the installation (3), the pinboard (2) and the harp (3)
  });

  it('the tour goes only to boards the lecture has', () => {
    const src = readFileSync(new URL('../src/workbench/walkthroughs.js', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf("id: 'lesson-threejs'"), src.indexOf("id: 'lesson-diffusion'"));
    const titles = new Set([...LESSON.sections.flatMap(s => s.boards).map(b => b.title), 'Three.js for body and sound', 'Bibliography']);
    const asked = [...block.matchAll(/goTo\(app, '([^']+)'\)/g)].map(m => m[1]);
    expect(asked.length).toBeGreaterThanOrEqual(14);
    for (const t of asked) expect(titles.has(t), t).toBe(true);
    // and the new boards are on the tour
    expect(asked).toContain('0.3 · Controls in code');
    expect(asked).toContain('4.1 · An installation');
  });
});
