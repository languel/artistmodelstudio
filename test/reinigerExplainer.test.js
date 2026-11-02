import { it, expect } from 'vitest';
import { LESSON } from '../examples/lessons/reiniger/lesson.js';
import { FILM_EXPLAINER } from '../examples/lessons/reiniger/explainer.js';
import { SCRIPTS } from '../src/workbench/scripts.js';

const boards = new Map();
for (const s of LESSON.sections) for (const b of s.boards) boards.set(b.title, b);
// What a board's code panel shows: a sketch's three, or the code of a document board.
const codeOf = title => { const b = boards.get(title); return b ? (b.three ?? b.code ?? '') : null; };
const plain = t => t.replace(/ · (code|notes)$/, '');

it('the film explainer is one of the scripts the studio offers', () => {
  expect(SCRIPTS).toContain(FILM_EXPLAINER);
});

it('every cue goes to a board the lesson builds', () => {
  for (const c of FILM_EXPLAINER.cues) {
    for (const t of [c.goto, c.restart, c.select?.code && plain(c.select.code), c.select?.pseudo && plain(c.select.pseudo), c.formula?.on, c.set?.on].filter(Boolean)) {
      expect(boards.has(t), t).toBe(true);
    }
  }
});

it('every code selection has its anchors in that board\'s code, in order', () => {
  for (const c of FILM_EXPLAINER.cues) {
    if (!c.select?.code) continue;
    const src = codeOf(plain(c.select.code)).split('\n');
    const from = src.findIndex(l => l.includes(c.select.from));
    expect(from, `${c.select.code}: from "${c.select.from}"`).toBeGreaterThanOrEqual(0);
    const to = src.findIndex((l, i) => i >= from && l.includes(c.select.to));
    expect(to, `${c.select.code}: to "${c.select.to}"`).toBeGreaterThanOrEqual(0);
  }
});

it('every pseudocode line selected exists in the board\'s notes', () => {
  for (const c of FILM_EXPLAINER.cues) {
    if (!c.select?.pseudo) continue;
    const lines = boards.get(plain(c.select.pseudo)).pseudo.split('\n');
    expect(lines.length, c.select.pseudo).toBeGreaterThanOrEqual(c.select.line);
  }
});

it('every control the script sets is declared by its board', () => {
  for (const c of FILM_EXPLAINER.cues) {
    if (!c.set) continue;
    expect(codeOf(c.set.on), c.set.on).toMatch(new RegExp(`let ${c.set.name} = `));
  }
});
