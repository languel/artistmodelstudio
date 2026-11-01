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

  it('honours // @panel: off has no panel, hidden starts as only the gear, open (or none) starts open', async () => {
    const mk = line => sketchPage({ kind: 'p5', title: 'p', code: `${line}\nconst n = 3 /* 0..9 */\nfunction draw() {}`, controls: true, p5Source: '/*p5*/' });
    expect(await mk('// @panel off')).not.toContain('ams-ui');
    expect(await mk('// @panel hidden')).toContain('{"start":"hidden"}');
    const open = await mk('// @panel open');
    expect(open).toContain('ams-ui');
    expect(open).not.toContain('{"start":"hidden"}');
    expect(await mk('')).toContain('ams-ui');
  });

  it('a p5.js page inlines p5 and the instrumented sketch', async () => {
    const html = await sketchPage({ kind: 'p5', title: 'p', code: 'const n = 3 /* 0..9 */\nfunction draw() {}', controls: true, p5Source: '/*p5*/window.p5=1;' });
    expect(html.indexOf('window.p5=1')).toBeLessThan(html.lastIndexOf('function draw'));   // (the sketch comes last; the panel holds a copy to show)
    expect(html).toContain('let n = 3 /* 0..9 */; __ctl("n"');
    expect(html).not.toContain('innerWidth: { get');   // p5 has its own
  });
});

describe('templates and snippets', () => {
  it('a blank start has the setup and none of the content', () => {
    expect(TEMPLATES.three).toContain('renderer.render(scene, camera)');
    expect(TEMPLATES.three).not.toContain('setAnimationLoop');
    expect(TEMPLATES.three).not.toContain('Mesh');
    expect(TEMPLATES.p5).toContain('createCanvas(innerWidth, innerHeight)');
    expect(TEMPLATES.p5).not.toContain('circle');
    expect(isBlank('three', TEMPLATES.three)).toBe(true);
    expect(isBlank('three', '')).toBe(true);
    expect(isBlank('three', 'const a = 1')).toBe(false);
  });
  it('every snippet is code a sketch can start from', () => {
    for (const list of Object.values(SNIPPETS)) for (const s of list) expect(s.code.trim().length).toBeGreaterThan(10);
    expect(SNIPPETS.three.some(s => /innerWidth/.test(s.code))).toBe(true);
    expect(JSON.stringify(SNIPPETS)).not.toContain('ams.width');
  });
  it('every control comment in the catalog is read as a control', () => {
    const comment = /\/\*\s*(?:-?[\d.]+\s*(?:\.{2,3}|…)|toggle\b|colou?r\b|palette\b|[\w-]+\|)/g;
    for (const [kind, list] of Object.entries(SNIPPETS)) for (const s of list) {
      const written = (s.code.match(comment) || []).length;
      expect(findControls(s.code).filter(c => c.kind !== 'param').length, `${kind}: ${s.title}`).toBe(written);
    }
  });
  it('the particles rebuild when their count changes (a control only changes the variable)', () => {
    const code = SNIPPETS.three.find(x => x.id === 'particles').code;
    expect(code).toContain('if (count !== built) build();');
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

import { modulePage } from '../src/workbench/exportPage.js';
describe('a page for other editors', () => {
  const code = "import * as THREE from 'three';\nimport { OrbitControls } from 'three/addons/controls/OrbitControls.js';\nconst speed = 1 /* 0..4 */;\n";
  it('three.js: the code as it is, the import map at the studio\'s version, and a line about the comments', () => {
    const html = modulePage({ kind: 'three', title: 'A <b> sketch', code, ground: '#101010', version: '0.187.0' });
    expect(html).toContain('"three": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js"');
    expect(html).toContain('"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/"');
    expect(html).toContain(code.trimEnd());
    expect(html).toContain('<script type="module">');
    expect(html).toContain('only a comment');
    expect(html).toContain('<title>A &lt;b&gt; sketch</title>');
    expect(html).not.toContain('window.ams');   // (the code does not use it)
  });
  it('p5.js: the library by a script tag; ams, when the code uses it, gets its values', () => {
    const html = modulePage({ kind: 'p5', title: 'p', code: 'function setup() { createCanvas(ams.width, 300); }\n// @param size = 2 (0..5)\nconst k = ams.params.size;', p5Version: '2.3.3' });
    expect(html).toContain('p5@2.3.3/lib/p5.min.js');
    expect(html).toContain('window.ams = { width: innerWidth');
    expect(html).toContain('"size":2');
  });
  it('a script tag in the code cannot end the page\'s script', () => {
    expect(modulePage({ kind: 'three', title: 't', code: "const s = '</script><b>';", version: '0.187.0' })).not.toMatch(/'<\/script>/);
  });
});

describe('app.js for a template that maps only three', () => {
  it('points addons at esm.sh with three shared, and leaves three alone', async () => {
    const { appJsFor } = await import('../src/workbench/exportPage.js');
    const out = appJsFor(`import * as THREE from 'three';\nimport { OrbitControls } from "three/addons/controls/OrbitControls.js";\nimport GUI from 'lil-gui';\nconst x = 1;`);
    expect(out).toContain(`from 'three';`);
    expect(out).toContain('https://esm.sh/three@latest/addons/controls/OrbitControls.js?external=three');
    expect(out).toContain(`from 'https://esm.sh/lil-gui'`);
  });
});

describe('controls as lil-gui', () => {
  it('adds a control per value through a getter/setter, and the import', async () => {
    const { guiCode } = await import('../src/workbench/exportGui.js');
    const { projectFiles } = await import('../src/workbench/exportProject.js');
    const src = `import * as THREE from 'three';\nlet speed = 1 /* 0..3 */;\nlet wire = false /* toggle */;\nlet shape = 'box' /* box | sphere */;\nlet tint = '#ff8844' /* color */;\n`;
    const out = guiCode(src);
    expect(out.startsWith(`import { GUI } from 'three/addons/libs/lil-gui.module.min.js';`)).toBe(true);
    expect(out).toContain(`gui.add(live(() => speed, v => { speed = v; }), 'v', 0, 3`);
    expect(out).toContain(`gui.add(live(() => wire`);
    expect(out).toContain(`["box","sphere"]`);
    expect(out).toContain(`gui.addColor(live(() => tint`);
    expect(out.indexOf('const gui')).toBeLessThan(out.indexOf('let speed'));
    expect(guiCode(`const a = 1;`)).toBe(`const a = 1;`);
    const files = projectFiles({ kind: 'three', title: 'T', code: src, versions: { three: '0.187.0', p5: '1.9.0' }, gui: true });
    expect(files.find(f => f.name.endsWith('src/main.js')).data).toContain('lil-gui.module.min.js');
  });
});
