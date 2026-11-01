import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const installed = JSON.parse(read('../node_modules/three/package.json')).version;   // 0.187.0
const types = JSON.parse(read('../node_modules/@types/three/package.json')).version;

it('the three.js the studio bundles is the one its docs name, and its types are the same release', () => {
  const rev = installed.split('.')[1];   // 187
  expect(read('../src/workbench/docsContent.js')).toContain(`three.js (r${rev})`);
  expect(types.split('.')[1]).toBe(rev);
});
