import { describe, it, expect } from 'vitest';
import { sketchFromPaste, bareThreeImports } from '../src/process/pasteSketch.js';

// a three.js example page, as the site writes them
const THREE_EXAMPLE = `<!DOCTYPE html>
<html lang="en">
<head><title>three.js webgl - orbit controls</title>
<style>body { margin: 0; } #info { position: absolute; top: 10px; }</style></head>
<body>
<div id="info">Orbit controls</div>
<script type="importmap">
{ "imports": { "three": "../build/three.module.js", "three/addons/": "./jsm/" } }
</script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer();
document.body.appendChild(renderer.domElement);
new OrbitControls(camera, renderer.domElement);
</script>
</body></html>`;

describe('a pasted sketch from somewhere else', () => {
  it('a three.js example page: its module script, and no import map', () => {
    const s = sketchFromPaste(THREE_EXAMPLE);
    expect(s.kind).toBe('three');
    expect(s.code.startsWith("import * as THREE from 'three';")).toBe(true);
    expect(s.code).toContain('new OrbitControls(camera');
    expect(s.code).not.toContain('importmap');
    expect(s.code).not.toContain('<script');
    expect(s.note).toMatch(/left out/);
  });

  it('a Codevre/CodePen page with CDN imports: the bare names', () => {
    const page = `<script type="module">\nimport * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";\nimport { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';\nimport gsap from 'https://esm.sh/gsap';\nconsole.log(THREE.REVISION, GLTFLoader, gsap);\n</script>`;
    const s = sketchFromPaste(page);
    expect(s.kind).toBe('three');
    expect(s.code).toContain(`from "three"`);
    expect(s.code).toContain(`'three/addons/loaders/GLTFLoader.js'`);
    expect(s.code).toContain('https://esm.sh/gsap');   // another library: left as it is
  });

  it('an older page with a global THREE gets its import', () => {
    const s = sketchFromPaste(`<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>\nconst scene = new THREE.Scene();\nconst renderer = new THREE.WebGLRenderer();\ndocument.body.append(renderer.domElement);\n</script>`);
    expect(s.kind).toBe('three');
    expect(s.code.startsWith("import * as THREE from 'three';")).toBe(true);
  });

  it('a snippet of three.js code (no page), and a p5.js page', () => {
    const s = sketchFromPaste("import * as THREE from 'https://esm.sh/three@0.170.0';\nconst scene = new THREE.Scene();\nconsole.log(scene);");
    expect(s).toMatchObject({ kind: 'three' });
    expect(s.code).toContain("from 'three'");
    expect(sketchFromPaste(`<html><head><script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script></head><body><script>\nfunction setup() { createCanvas(400, 400); }\nfunction draw() { background(0); }\n</script></body></html>`)).toMatchObject({ kind: 'p5' });
  });

  it('other text is not a sketch (the paste goes on as it was)', () => {
    expect(sketchFromPaste('just a few words, nothing else to see in this sentence at all')).toBeNull();
    expect(sketchFromPaste('const a = 1;\nconst b = 2;\nconsole.log(a + b);')).toBeNull();
    expect(sketchFromPaste('short')).toBeNull();
  });

  it('CDN imports become the bare names, and a dynamic import too', () => {
    expect(bareThreeImports("const m = await import('https://unpkg.com/three@0.150.0/examples/jsm/controls/OrbitControls.js');")).toBe("const m = await import('three/addons/controls/OrbitControls.js');");
  });
});
