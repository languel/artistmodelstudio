import { describe, it, expect } from 'vitest';
import { collectThree, resolveSpec, THREE_ENTRY } from './threeModules.js';

const files = {
  'build/three.module.js': `import { A } from './three.core.js';\nexport { A };`,
  'build/three.core.js': `export const A = 1;`,
  'examples/jsm/controls/OrbitControls.js': `import { A } from 'three';\nimport { u } from '../utils/u.js';\nexport class OrbitControls {}`,
  'examples/jsm/utils/u.js': `export const u = 1;`
};
const load = async id => { if (!(id in files)) throw new Error(`no ${id}`); return files[id]; };

describe('three modules', () => {
  it('resolves specifiers', () => {
    expect(resolveSpec('three', THREE_ENTRY)).toBe('three');
    expect(resolveSpec('three/addons/controls/OrbitControls.js', THREE_ENTRY)).toBe('examples/jsm/controls/OrbitControls.js');
    expect(resolveSpec('../utils/u.js', 'examples/jsm/controls/OrbitControls.js')).toBe('examples/jsm/utils/u.js');
    expect(resolveSpec('https://cdn/x.js', THREE_ENTRY)).toBe(null);
  });
  it('collects the sketch, three and addons, rewriting specifiers', async () => {
    const code = `import * as THREE from 'three';\nimport { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n// import x from 'nothing';\nnew THREE.Scene();`;
    const { modules } = await collectThree(code, load);
    expect(Object.keys(modules).sort()).toEqual([THREE_ENTRY, 'build/three.core.js', 'build/three.module.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/utils/u.js', 'three'].sort());
    expect(modules[THREE_ENTRY]).toContain(`from '@@dep:three@@'`);
    expect(modules[THREE_ENTRY]).toContain(`'@@dep:examples/jsm/controls/OrbitControls.js@@'`);
    expect(modules[THREE_ENTRY]).toContain(`// import x from 'nothing'`);
    expect(modules['examples/jsm/controls/OrbitControls.js']).toContain('@@dep:examples/jsm/utils/u.js@@');
    expect(modules['build/three.module.js']).toContain('@@dep:build/three.core.js@@');
    expect(modules.three).toContain('preserveDrawingBuffer');
  });
  it('fails clearly when an addon is not bundled', async () => {
    await expect(collectThree(`import { X } from 'three/addons/nope.js';`, load)).rejects.toThrow(/nope/);
  });
});
