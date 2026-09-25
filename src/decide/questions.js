/**
 * The decision policy's interface: a compact canvas state plus typed questions per step,
 * in TypeSafe System One form (choice / score / noul), so lev, kev, Laya or hosted Jev can
 * answer them, and so user and agent answers become training labels in the same shape.
 *
 * One step = one pass: what to do next, where, how, how dark, which direction, how dense.
 */
import { describeRegion } from '../perception/analyze.js';

export const STEPS = {
  look: 'Look first: mark the axes and the big masses with light guides',
  block: 'Block in one big mass as a flat plane',
  structure: 'State structure: a contour or a gesture line through a form',
  value: 'Model value inside one region with hatching or stipple',
  accent: 'Add a small accent: a point or short mark of emphasis',
  stop: 'Stop: the drawing says enough'
};

export const TECHNIQUES = {
  flat: 'A flat plane of tone',
  hatch: 'Parallel hatching (value from spacing)',
  crosshatch: 'Crossed hatching for darker value',
  stipple: 'Stippled dots (value from density)',
  contour: 'A contour line around the form',
  walk: 'A line walking through the form along its direction',
  gesture: 'A gesture line: the movement behind the form (construction)',
  point: 'A single point of emphasis'
};

export const DIRECTIONS = {
  follow: "Follow the region's own direction",
  across: 'Cross it at right angles',
  vertical: 'Vertical',
  horizontal: 'Horizontal',
  diagonal: 'Diagonal, rising to the right'
};

export const VALUES = ['light', 'middle', 'dark'];
export const DENSITIES = ['very sparse', 'sparse', 'medium', 'dense', 'very dense'];

/** Compact state text (kept well under ~380 tokens). */
export function stateText({ subject, analysis, history }) {
  const regs = analysis.regions.slice(0, 9);
  const done = history.slice(-6).map(h => `${h.step}${h.region ? ` ${h.region}` : ''}${h.technique && h.step !== 'look' ? ` ${h.technique}` : ''}${h.value && ['block', 'value'].includes(h.step) ? ` ${h.value}` : ''}`);
  const touched = [...new Set(history.map(h => h.region).filter(Boolean))];
  const m = analysis.masses;
  return [
    `Subject: ${subject || 'a study of the reference'}`,
    `Reference masses: dark ${pct(m.filter(x => x.lightness < 0.36))}, middle ${pct(m.filter(x => x.lightness >= 0.36 && x.lightness <= 0.66))}, light ${pct(m.filter(x => x.lightness > 0.66))}`,
    'Regions:', ...regs.map(describeRegion),
    `Steps so far (${history.length}): ${Object.keys(STEPS).filter(k => k !== 'stop').map(k => `${k} ${history.filter(h => h.step === k).length}`).join(', ')}`,
    `Recent: ${done.join('; ') || 'none'}`,
    `Regions worked: ${touched.join(', ') || 'none'}`
  ].join('\n');
}

const pct = arr => `${Math.round(arr.reduce((a, x) => a + x.share, 0) * 100)}%`;

/** The questions for one step. Regions are limited to the most relevant (≤ 12). */
export function stepQuestions({ analysis, history }) {
  const touched = new Set(history.map(h => h.region));
  const regs = [...analysis.regions.filter(r => !touched.has(r.id)), ...analysis.regions.filter(r => touched.has(r.id))].slice(0, 12);
  return {
    next: { type: 'choice', instructions: 'What should the drawing do next?', criteria: { ...STEPS } },
    region: { type: 'choice', instructions: 'Which region of the reference should that step work on?', criteria: Object.fromEntries(regs.map(r => [r.id, describeRegion(r).split(': ')[1]])) },
    technique: { type: 'choice', instructions: 'Which technique suits that step and region?', criteria: { ...TECHNIQUES } },
    value: { type: 'score', instructions: 'How dark should the marks be?', criteria: [...VALUES] },
    direction: { type: 'choice', instructions: 'Which direction should the marks take?', criteria: { ...DIRECTIONS } },
    density: { type: 'score', instructions: 'How dense should the marks be?', criteria: [...DENSITIES] }
  };
}

/** A labelled request (lev / kev training format). */
export function labelledRequest(state, questions, answers, src = 'ams') {
  const q = {};
  for (const [id, spec] of Object.entries(questions)) {
    if (answers[id] === undefined || answers[id] === null) continue;
    q[id] = { ...spec, label: answers[id], src: `${src}_${id}` };
  }
  return { state, questions: q };
}
