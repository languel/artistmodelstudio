// @vitest-environment happy-dom
import { it, expect } from 'vitest';
import { scriptDraw } from '../src/workbench/scriptDraw.js';

const host = () => { const d = document.createElement('div'); Object.defineProperty(d, 'offsetWidth', { value: 800 }); Object.defineProperty(d, 'offsetHeight', { value: 600 }); document.body.append(d); return d; };
const SHAPES = [
  { t: 'dot', p: [0, 0] },
  { t: 'line', a: [0, 0], b: [1, 1], arrow: true },
  { t: 'line', a: [0, 0], b: [1, -1], dash: true },
  { t: 'arc', c: [0, 0], r: 1, from: -90, to: -40 },
  { t: 'label', p: [1, 1], tex: '\\theta_1' },
  { t: 'formula', at: [0.9, 0.7], align: 'right', tex: 'P_1' }
];

it('draws shapes over a board, in the units of its camera, and clears them by layer', async () => {
  const h = host();
  await scriptDraw(h, { space: { frame: 7 }, step: 0, dur: 0, shapes: SHAPES }, { html: t => `<i>${t}</i>`, fast: true });
  const svg = h.querySelector('.sc-over svg');
  expect(svg.querySelectorAll('path')).toHaveLength(3);
  expect(svg.querySelectorAll('circle')).toHaveLength(1);
  expect(h.querySelector('.sc-tag').innerHTML).toBe('<i>\\theta_1</i>');
  expect(h.querySelector('.sc-formula').style.left).toBe('720px');
  // the origin of the camera is the middle of the board
  expect(svg.querySelector('circle').getAttribute('cx')).toBe('400');
  expect(svg.querySelector('circle').getAttribute('cy')).toBe('300');
  await scriptDraw(h, { layer: 'formula', shapes: [{ t: 'formula', tex: 'x' }], fast: true }, { fast: true });
  expect(h.querySelectorAll('.sc-layer')).toHaveLength(2);
  await scriptDraw(h, { clear: 'formula' });
  expect(h.querySelectorAll('.sc-layer')).toHaveLength(1);
  await scriptDraw(h, { clear: true });
  expect(h.querySelectorAll('.sc-layer')).toHaveLength(0);
});
