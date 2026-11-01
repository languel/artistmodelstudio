import { describe, it, expect } from 'vitest';
import { findControls, instrument, liveValues, literalOf } from '../src/process/controls.js';

const src = `// @param radius = 1.5 (0.25..3 step:0.05)
// @param tint = #ff8800 (color)
const n = 6.3 /* 1..40 */;
let on = true /* toggle */
const mode = 'perspective' /* perspective|orthographic */
const sky = "#102030" /* color */;
const used = n * 2 + (7 /* 0..9 */);
`;

describe('decorated controls', () => {
  const cs = findControls(src);
  it('finds every kind', () => {
    expect(cs.find(c => c.name === 'radius')).toMatchObject({ kind: 'range', min: 0.25, max: 3, step: 0.05, value: 1.5, line: true });
    expect(cs.find(c => c.name === 'tint')).toMatchObject({ kind: 'color', value: '#ff8800' });
    expect(cs.find(c => c.name === 'n')).toMatchObject({ kind: 'range', value: 6.3, live: true });
    expect(cs.find(c => c.name === 'on')).toMatchObject({ kind: 'toggle', value: true });
    expect(cs.find(c => c.name === 'mode')).toMatchObject({ kind: 'select', value: 'perspective', options: ['perspective', 'orthographic'] });
    expect(cs.find(c => c.name === 'sky')).toMatchObject({ kind: 'color', value: '#102030', q: '"' });
  });
  it('a number in an expression is a slider but not live', () => {
    const r = cs.filter(c => c.kind === 'range' && !c.name);
    expect(r).toHaveLength(1);
    expect(r[0].live).toBeUndefined();
  });
  it('writes values back as the literal they replace', () => {
    const c = cs.find(x => x.name === 'sky');
    expect(src.slice(c.from, c.to)).toBe('"#102030"');
    expect(literalOf(c, '#ffffff')).toBe('"#ffffff"');
    expect(literalOf(cs.find(x => x.name === 'on'), false)).toBe('false');
  });
  it('instruments declarations and keeps lines in place', () => {
    const i = instrument(src);
    expect(i.code.split('\n')).toHaveLength(src.split('\n').length);
    expect(i.code).toContain('let n = 6.3 /* 1..40 */; __ctl("n", v => { n = v; });;');
    expect(i.code).toContain('let mode = ');
    expect(i.values).toMatchObject({ n: 6.3, on: true, radius: 1.5 });
    expect(liveValues(src).tint).toBe('#ff8800');
  });
  it('the signature ignores values only', () => {
    expect(instrument(src.replace('6.3', '9')).sig).toBe(instrument(src).sig);
    expect(instrument(src.replace('1..40', '1..50')).sig).not.toBe(instrument(src).sig);
    expect(instrument(src.replace("'perspective'", "'orthographic'")).sig).toBe(instrument(src).sig);
  });
});

describe('colours and dots', () => {
  it('any css colour, or a 0x number, with a color comment', () => {
    const c = findControls("const a = 'red' /* color */\nconst b = 'rgb(10, 20, 30)' /* colour */\nconst d = 0xff8800 /* color */;\nconst e = 'hello'");
    expect(c.filter(x => x.kind === 'color').map(x => x.css)).toEqual(['red', 'rgb(10, 20, 30)', '#ff8800']);
    const num = c.find(x => x.num);
    expect(num.value).toBe(0xff8800);
    expect(literalOf(num, '#112233')).toBe('0x112233');
    expect(literalOf(c[0], '#112233')).toBe("'#112233'");
  });
  it('a range may be written with two dots, three, or an ellipsis', () => {
    for (const d of ['..', '...', '…']) expect(findControls(`const n = 3 /* 0${d}5 */`)[0]).toMatchObject({ kind: 'range', min: 0, max: 5, value: 3 });
    expect(findControls('// @param s = 1 (0.2...3 step:0.1)')[0]).toMatchObject({ min: 0.2, max: 3, step: 0.1 });
  });
});

describe('palette', () => {
  const src = "const colors = ['#e63946', 'steelblue', 0xf1faee] /* palette */;\nlet i = 0";
  it('is an array of colours, live in place', () => {
    const c = findControls(src).find(x => x.kind === 'palette');
    expect(c).toMatchObject({ name: 'colors', live: true, css: ['#e63946', 'steelblue', '#f1faee'], value: ['#e63946', 'steelblue', 0xf1faee] });
    expect(src.slice(c.from, c.to)).toBe("['#e63946', 'steelblue', 0xf1faee]");
    expect(literalOf(c, ['#e63946', '#4682b4', '#f1faee', '#000000'])).toBe("['#e63946', '#4682b4', 0xf1faee, '#000000']");
    expect(instrument(src).code).toContain('colors.splice(0, colors.length, ...v)');
  });
});

it('a decimal number with a color comment is a colour too (what a minifier writes for 0xff8800)', () => {
  const c = findControls('const c = 16746496 /* color */;')[0];
  expect(c).toMatchObject({ kind: 'color', css: '#ff8800', num: true, value: 16746496 });
});

import { findColors } from '../src/workbench/colorDots.js';
it('finds colours written in code, and skips those that have a control', () => {
  const t = "const a = '#fa0'; const b = rgb(10, 20, 30); const c = 0xe63946; // #123456\nconst d = '#ff0000' /* color */;\nconst p = ['#111111', '#222222'] /* palette */;\nconst h = hsl(200, 60%, 20%); background: #ffffffff;";
  expect(findColors(t).map(c => c.text)).toEqual(['#fa0', 'rgb(10, 20, 30)', '0xe63946', '#123456', 'hsl(200, 60%, 20%)', '#ffffffff']);
});

it('a range comment takes a step as "step:100", "step 100" or ": 100"', () => {
  for (const c of ['/* 100..10000 step:100 */', '/* 100..10000 step 100 */', '/* 100..10000 : 100 */', '/* 100..10000 step: 100 */'])
    expect(findControls(`const count = 2000 ${c};`)[0]).toMatchObject({ kind: 'range', min: 100, max: 10000, step: 100, value: 2000, live: true });
  expect(findControls('const a = 3 /* 0..5 */;')[0].step).toBeNull();
});
