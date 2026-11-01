import { describe, it, expect, beforeEach } from 'vitest';
import { sketchPage, controlSpecs } from '../src/workbench/exportPage.js';
import { findControls } from '../src/process/controls.js';
import { TEMPLATES, snippetsFor, saveSnippet, deleteSnippet, isBlank, SNIPPETS } from '../src/workbench/snippets.js';

const code = `import * as THREE from 'three';
const speed = 1 /* 0..5 */;
const spin = true /* toggle */
const shape = 'box' /* box|sphere */
const tint = 'red' /* color */;
const glow = 0x44aaff /* color */;
const colors = ['#e63946', '#2a9d8f'] /* palette */;
let loose = 3 /* 0..9 */ + 1;
renderer.setAnimationLoop(() => {});
`;

const scripts = html => [...html.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

const store = new Map();
beforeEach(() => { store.clear(); globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }; });

describe('exported pages', () => {
  it('the controls that can run in a page', () => {
    const s = controlSpecs(code);
    expect(s.map(c => c.name)).toEqual(['speed', 'spin', 'shape', 'tint', 'glow', 'colors']);   // in the order of the code
    expect(s.find(c => c.name === 'speed')).toMatchObject({ kind: 'range', min: 0, max: 5 });
    expect(s.find(c => c.name === 'glow')).toMatchObject({ kind: 'color', num: true });
    expect(s.find(c => c.name === 'colors')).toMatchObject({ kind: 'palette', nums: [false, false] });
  });

  it('a three.js page carries the library, the loader and, if asked, the panel', async () => {
    const loadFile = async id => `/* ${id} */ export const x = 1;`;
    const plain = await sketchPage({ kind: 'three', title: 'A <title>', code, loadFile });
    expect(plain).toContain('<title>A &lt;title&gt;</title>');
    expect(plain).toContain('id="three-modules"');
    expect(plain).toContain('__ctl(\\"speed\\"');   // (in the sketch's module)
    expect(plain).not.toContain('ams-ui');
    const withUi = await sketchPage({ kind: 'three', title: 't', code, controls: true, loadFile });
    expect(withUi).toContain('ams-ui');
    expect(withUi).toContain('ams-code');   // the code glyph's overlay
    expect(withUi).toContain("e.key === 'H'");   // Shift+H hides the glyph itself
    for (const src of scripts(withUi)) expect(() => new Function(src)).not.toThrow();   // every plain script is valid
  });

  it('a page with controls has the panel and the code glyph even when the code has no controls', async () => {
    const html = await sketchPage({ kind: 'p5', title: 'p', code: 'function draw() {}', controls: true, p5Source: '/*p5*/' });
    expect(html).toContain('ams-ui');
    for (const src of scripts(html)) expect(() => new Function(src)).not.toThrow();
  });

  it('a p5.js page inlines p5 and the instrumented sketch', async () => {
    const html = await sketchPage({ kind: 'p5', title: 'p', code: 'const n = 3 /* 0..9 */\nfunction draw() {}', controls: true, p5Source: '/*p5*/window.p5=1;' });
    expect(html.indexOf('window.p5=1')).toBeLessThan(html.lastIndexOf('function draw'));   // (the sketch comes last; the panel holds a copy to show)
    expect(html).toContain('let n = 3 /* 0..9 */; __ctl("n"');
    expect(html).not.toContain('windowWidth: { get');   // p5 has its own
  });
});

describe('templates and snippets', () => {
  it('a blank start has the setup and none of the content', () => {
    expect(TEMPLATES.three).toContain('renderer.render(scene, camera)');
    expect(TEMPLATES.three).not.toContain('setAnimationLoop');
    expect(TEMPLATES.three).not.toContain('Mesh');
    expect(TEMPLATES.p5).toContain('createCanvas(windowWidth, windowHeight)');
    expect(TEMPLATES.p5).not.toContain('circle');
    expect(isBlank('three', TEMPLATES.three)).toBe(true);
    expect(isBlank('three', '')).toBe(true);
    expect(isBlank('three', 'const a = 1')).toBe(false);
  });
  it('every snippet is code a sketch can start from', () => {
    for (const list of Object.values(SNIPPETS)) for (const s of list) expect(s.code.trim().length).toBeGreaterThan(10);
    expect(SNIPPETS.three.some(s => /windowWidth/.test(s.code))).toBe(true);
    expect(JSON.stringify(SNIPPETS)).not.toContain('ams.width');
  });
  it('every control comment in the catalog is read as a control', () => {
    const comment = /\/\*\s*(?:-?[\d.]+\s*(?:\.{2,3}|…)|toggle\b|colou?r\b|palette\b|[\w-]+\|)/g;
    for (const [kind, list] of Object.entries(SNIPPETS)) for (const s of list) {
      const written = (s.code.match(comment) || []).length;
      expect(findControls(s.code).filter(c => c.kind !== 'param').length, `${kind}: ${s.title}`).toBe(written);
    }
  });
  it('the user keeps their own', () => {
    saveSnippet('p5', 'My start', 'function setup() {}');
    saveSnippet('p5', 'My start', 'function setup() { /* v2 */ }');
    const { user } = snippetsFor('p5');
    expect(user).toHaveLength(1);
    expect(user[0].code).toContain('v2');
    deleteSnippet('p5', user[0].id);
    expect(snippetsFor('p5').user).toHaveLength(0);
  });
});

import { rewriteControl } from '../src/process/controls.js';
describe('writing a panel value back to the code', () => {
  const src = "const speed = 1 /* 0..5 step:0.5 */;\nconst spin = true /* toggle */\nconst shape = 'box' /* box|sphere */\nconst glow = 0x44aaff /* color */;\nconst colors = ['#e63946', 0xf1faee] /* palette */;\n";
  it('each kind of control', () => {
    let t = rewriteControl(src, 'speed', 2.5); t = rewriteControl(t, 'spin', false); t = rewriteControl(t, 'shape', 'sphere'); t = rewriteControl(t, 'glow', 0xff0000); t = rewriteControl(t, 'colors', ['#111111', 0x222222]);
    expect(t).toBe("const speed = 2.5 /* 0..5 step:0.5 */;\nconst spin = false /* toggle */\nconst shape = 'sphere' /* box|sphere */\nconst glow = 0xff0000 /* color */;\nconst colors = ['#111111', 0x222222] /* palette */;\n");
    expect(rewriteControl(src, 'nothing', 1)).toBe(src);
  });
});
