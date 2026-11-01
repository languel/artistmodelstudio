import { describe, it, expect } from 'vitest';
import { cdnThree, resolveSpec, collectThree, THREE_SHIM } from '../src/process/threeModules.js';

describe('three.js from a CDN is three.js here', () => {
  it('reads the usual CDN forms as the bare names', () => {
    const core = [
      'https://unpkg.com/three@0.160.0/build/three.module.js', 'https://unpkg.com/three@0.160.0/build/three.module.min.js', 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js',
      'https://cdn.jsdelivr.net/npm/three@0.187/+esm', 'https://esm.sh/three', 'https://esm.sh/three@0.160.0', 'https://esm.sh/three@0.160.0?dev', 'https://cdn.skypack.dev/three',
      'https://cdn.jsdelivr.net/npm/three/build/three.module.js'
    ];
    for (const u of core) expect(cdnThree(u), u).toBe('three');
    expect(cdnThree('https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js')).toBe('three/addons/controls/OrbitControls.js');
    expect(cdnThree('https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js?external=three')).toBe('three/addons/loaders/GLTFLoader.js');
    expect(cdnThree('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/lil-gui.module.min.js')).toBe('three/addons/libs/lil-gui.module.min.js');
    expect(cdnThree('https://esm.sh/three-mesh-bvh')).toBeNull();      // another library
    expect(cdnThree('https://example.com/three.js')).toBeNull();
    expect(cdnThree('three')).toBeNull();
  });

  it('is found by the loader: the CDN import becomes the bundled file, other URLs are left to the browser', async () => {
    expect(resolveSpec('https://unpkg.com/three@0.160.0/build/three.module.js', 'user.js')).toBe(THREE_SHIM);
    expect(resolveSpec('https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js', 'user.js')).toBe('examples/jsm/controls/OrbitControls.js');
    expect(resolveSpec('https://esm.sh/gsap', 'user.js')).toBeNull();
    const seen = [];
    const m = await collectThree(`import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';\nimport { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";\nimport gsap from 'https://esm.sh/gsap';`, async id => { seen.push(id); return id.includes('OrbitControls') ? "import { Vector3 } from 'three';" : '/* three */ export const REVISION = 1;'; });
    expect(seen).toContain('build/three.module.js');
    expect(seen).toContain('examples/jsm/controls/OrbitControls.js');
    expect(m.modules['user.js']).toContain('@@dep:three@@');
    expect(m.modules['user.js']).toContain('@@dep:examples/jsm/controls/OrbitControls.js@@');
    expect(m.modules['user.js']).toContain('https://esm.sh/gsap');
  });
});
