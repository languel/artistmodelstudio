import { it, expect } from 'vitest';
import { highlightCode } from '../src/workbench/codeHighlight.js';

const strip = html => html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

it('colours keywords, strings, numbers, comments and calls, and keeps the text', () => {
  const src = "const a = foo('x', 12); // note";
  const { lines } = highlightCode(src);
  expect(lines[0]).toContain('<span class="k">const</span>');
  expect(lines[0]).toContain('<span class="f">foo</span>');
  expect(lines[0]).toContain('<span class="s">\'x\'</span>');
  expect(lines[0]).toContain('<span class="n">12</span>');
  expect(lines[0]).toContain('<span class="c">// note</span>');
  expect(strip(lines[0])).toBe(src);
});

it('follows a block comment and a template over several lines', () => {
  const { lines } = highlightCode('/* one\ntwo */ let x = 1;\nconst t = `a\nb`;');
  expect(lines[0]).toContain('class="c"'); expect(lines[1]).toMatch(/^<span class="c">two \*\/<\/span>/);
  expect(lines[3]).toContain('class="s"');
});

it('marks a control: an empty widget before its value, and the value kept as text', () => {
  const src = "let fps = 8 /* 3..24 */;\nlet clip = 'Walk' /* Survey|Walk|Run */;\nlet on = true /* toggle */;";
  const { lines, controls } = highlightCode(src);
  expect(controls.map(c => `${c.name}:${c.kind}`).sort()).toEqual(['clip:select', 'fps:range', 'on:toggle']);
  expect(lines[0]).toContain('<i class="w" data-name="fps" data-kind="range"></i><span class="cv" data-name="fps">8</span>');
  expect(lines[1]).toContain('<span class="cv" data-name="clip">\'Walk\'</span>');
  expect(strip(lines[0])).toBe("let fps = 8 /* 3..24 */;");
  expect(controls.find(c => c.name === 'clip').options).toEqual(['Survey', 'Walk', 'Run']);
  expect(controls.find(c => c.name === 'fps')).toMatchObject({ min: 3, max: 24, value: 8 });
});

it('escapes what is not code', () => {
  expect(highlightCode('a < b && c > d').lines[0]).toContain('&lt;');
});
