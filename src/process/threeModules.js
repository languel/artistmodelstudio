/**
 * three.js boards: a sketch is an ES module (`import * as THREE from 'three'`, `import { OrbitControls } from
 * 'three/addons/controls/OrbitControls.js'`) that runs in a sandboxed frame. A sandboxed frame has no origin to fetch
 * modules from, so the studio finds every module the sketch imports (three.js and its addons, bundled with the studio
 * as text), embeds them in the frame's page and turns each into a blob URL there, rewriting the import specifiers to
 * point at the blobs. No bundler, no network. This file is the pure part: finding and rewriting; boardFrames.js
 * supplies the source text and builds the page.
 */

// import specifiers must start a statement (line start, or after ; or }) so lines quoted in comments are ignored
const IMPORT_RE = /(?:^|[;}])\s*(?:import|export)\s*(?:[^'"();]*?\bfrom\s*)?(['"])([^'"\n]+)\1|\bimport\(\s*(['"])([^'"\n]+)\3\s*\)/gm;

export const THREE_ENTRY = 'user.js';
const CORE = 'build/three.module.js';
export const THREE_SHIM = 'three';

/** A shim for 'three': everything in three.js, except a renderer that keeps its drawing buffer so the board can keep a still picture while paused. */
export const threeShim = `export * from '@@dep:${CORE}@@';
import { WebGLRenderer as R } from '@@dep:${CORE}@@';
export class WebGLRenderer extends R { constructor(p = {}) { super({ preserveDrawingBuffer: true, ...p }); } }
`;

const dirOf = id => id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '';
function normalise(path) {
  const out = [];
  for (const part of path.split('/')) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
  return out.join('/');
}

/** The module id a specifier names, from the module `from`: 'three', 'three/addons/…', or a relative path; anything else (a URL) is left for the browser. */
export function resolveSpec(spec, from) {
  if (spec === 'three') return THREE_SHIM;
  if (spec.startsWith('three/addons/')) return `examples/jsm/${spec.slice('three/addons/'.length)}`;
  if (spec.startsWith('three/examples/jsm/')) return `examples/jsm/${spec.slice('three/examples/jsm/'.length)}`;
  if (/^\.\.?\//.test(spec) && from !== THREE_ENTRY) return normalise(`${dirOf(from)}/${spec}`);
  return null;
}

/**
 * Collect the sketch and everything it imports. `load(id)` returns a module's text (or throws). Returns
 * { modules: { id: text with @@dep:id@@ in place of local specifiers }, entry }.
 */
export async function collectThree(code, load) {
  const modules = {};
  const rewrite = (text, from) => text.replace(IMPORT_RE, (all, q1, s1, q3, s2) => {
    const spec = s1 ?? s2, id = resolveSpec(spec, from);
    return id ? all.replace(spec, `@@dep:${id}@@`) : all;
  });
  const crawl = async (id, text) => {
    if (id in modules) return;
    modules[id] = null;
    const deps = new Set();
    for (const m of text.matchAll(IMPORT_RE)) { const d = resolveSpec(m[2] ?? m[4], id); if (d) deps.add(d); }
    modules[id] = id === THREE_SHIM ? threeShim : rewrite(text, id);
    for (const d of deps) {
      if (d === THREE_SHIM) { await crawl(d, threeShim); if (!(CORE in modules)) await crawl(CORE, await load(CORE)); }
      else if (!(d in modules)) await crawl(d, await load(d));
    }
  };
  await crawl(THREE_ENTRY, code);
  return { modules, entry: THREE_ENTRY };
}

/** The script a frame runs: make a blob URL for each module (dependencies first, specifiers swapped for blob URLs), then run the sketch. */
export const threeLoader = (token) => `const M = JSON.parse(document.getElementById('three-modules').textContent), U = {};
const make = id => U[id] ??= URL.createObjectURL(new Blob([M[id].replace(/@@dep:(.+?)@@/g, (_, d) => make(d))], { type: 'text/javascript' }));
import(make(${JSON.stringify(THREE_ENTRY)})).catch(e => parent.postMessage({ amsFrame: ${JSON.stringify(token)}, type: 'error', message: String(e && e.message || e) }, '*'));`;

/** A starter sketch: the lesson's spinning cube, filling the board. */
export const THREE_STARTER = `import * as THREE from 'three';

// A scene, a camera that looks at it, and a renderer that draws it onto the board.
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, ams.width / ams.height, 0.1, 100);
camera.position.z = 3;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(ams.width, ams.height);
document.body.append(renderer.domElement);

// Something to look at, and a light to see it by.
const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#e0a030' }));
scene.add(cube, new THREE.DirectionalLight('#ffffff', 3), new THREE.AmbientLight('#ffffff', 0.6));

renderer.setAnimationLoop(t => {
  cube.rotation.set(t / 1500, t / 1000, 0);
  renderer.render(scene, camera);
});
`;
