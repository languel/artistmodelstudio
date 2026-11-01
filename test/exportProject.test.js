import { describe, it, expect } from 'vitest';
import { projectFiles, slugOf } from '../src/workbench/exportProject.js';
import { createZip } from '../src/export/zip.js';

const code = "import * as THREE from 'three';\nimport { OrbitControls } from 'three/addons/controls/OrbitControls.js';\nconst speed = 1 /* 0..4 */;\nconst spin = true /* toggle */\nrenderer.setSize(innerWidth, innerHeight);\n";
const versions = { three: '0.187.0', p5: '2.3.3' };
const get = (files, name) => files.find(f => f.name.endsWith(name))?.data;
const names = files => files.map(f => f.name.split('/').slice(1).join('/')).sort();

describe('a sketch as a project', () => {
  it('ES modules: an index.html with the import map at the studio\'s version, and the code as it was written', () => {
    const f = projectFiles({ kind: 'three', title: 'My Sketch!', code, versions });
    expect(names(f)).toEqual(['README.md', 'index.html', 'package.json', 'src/main.js']);
    expect(f.every(x => x.name.startsWith('my-sketch/'))).toBe(true);
    const html = get(f, 'index.html');
    expect(html).toContain('"three": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js"');
    expect(html).toContain('"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/"');
    expect(html).toContain('<script type="module" src="./src/main.js">');
    expect(get(f, 'src/main.js')).toBe(code);
    expect(get(f, 'README.md')).toContain('only comments');
  });

  it('latest: the library without a version', () => {
    const html = get(projectFiles({ kind: 'three', title: 't', code, versions, latest: true }), 'index.html');
    expect(html).toContain('npm/three/build/three.module.js');
    expect(html).not.toContain('0.187.0');
  });

  it('Vite: package.json with three installed, a config, and a root script', () => {
    const f = projectFiles({ kind: 'three', flavor: 'vite', title: 'v', code, versions });
    expect(names(f)).toEqual(['README.md', 'index.html', 'package.json', 'src/main.js', 'vite.config.js']);
    const pkg = JSON.parse(get(f, 'package.json'));
    expect(pkg.dependencies.three).toBe('^0.187.0');
    expect(pkg.scripts.dev).toBe('vite');
    expect(get(f, 'index.html')).toContain('src="/src/main.js"');
    expect(get(f, 'index.html')).not.toContain('importmap');
    expect(JSON.parse(get(projectFiles({ kind: 'three', flavor: 'vite', title: 'v', code, versions, latest: true }), 'package.json')).dependencies.three).toBe('latest');
  });

  it('with the panel: controls.js, and the sketch carries the lines that let it change values', () => {
    const f = projectFiles({ kind: 'three', title: 'c', code, versions, panel: true });
    expect(names(f)).toContain('src/controls.js');
    const main = get(f, 'src/main.js');
    expect(main.startsWith("import './controls.js';")).toBe(true);
    expect(main).toContain('let speed = 1 /* 0..4 */; __ctl("speed"');
    expect(() => new Function(main.replace(/^import .*$/gm, ''))).not.toThrow();
    const controls = get(f, 'src/controls.js');
    expect(() => new Function(controls)).not.toThrow();
    expect(controls).toContain('"name":"speed"');
    expect(get(f, 'README.md')).toContain('controls.js');
  });

  it('no controls to show, no panel files, even if asked', () => {
    expect(names(projectFiles({ kind: 'three', title: 'n', code: "import * as THREE from 'three';\nconst a = 1;", versions, panel: true }))).not.toContain('src/controls.js');
  });

  it('p5.js: a page with p5 from a CDN and sketch.js (the panel loads before it)', () => {
    const sketch = 'const size = 20 /* 5..60 */;\nfunction setup() { createCanvas(innerWidth, innerHeight); }\nfunction draw() { circle(width / 2, height / 2, size); }\n';
    const plain = projectFiles({ kind: 'p5', flavor: 'vite', title: 'p', code: sketch, versions });
    expect(names(plain)).toEqual(['README.md', 'index.html', 'package.json', 'src/sketch.js']);   // (no Vite flavor for p5)
    expect(get(plain, 'index.html')).toContain('p5@2.3.3/lib/p5.min.js');
    const panel = projectFiles({ kind: 'p5', title: 'p', code: sketch, versions, panel: true });
    const html = get(panel, 'index.html');
    expect(html.indexOf('controls.js')).toBeGreaterThan(-1);
    expect(html.indexOf('controls.js')).toBeLessThan(html.indexOf('sketch.js'));
    expect(get(panel, 'src/sketch.js')).toContain('__ctl("size"');
  });

  it('makes a zip a person can open (names under one folder)', () => {
    const f = projectFiles({ kind: 'three', title: 'Zip me', code, versions });
    const bytes = createZip(f);
    expect(bytes.length).toBeGreaterThan(500);
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe('PK');
    expect(slugOf('  A  B — c ')).toBe('a-b-c');
  });
});
