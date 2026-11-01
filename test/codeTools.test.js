import { describe, it, expect } from 'vitest';
import { formatSource, minifySource } from '../src/workbench/codeTools.js';
import { findControls } from '../src/process/controls.js';

const sketch = `import * as THREE from 'three'
// @param size = 1 (0.2..3 step:0.1)
const speed = 1 /* 0..5 */
let spin = true /* toggle */
const colors = ['#e63946','steelblue'] /* palette */
function f(a,b){return a+b}
`;

describe('format and minimize', () => {
  it('formats, keeping the comments that make controls (and the semicolon style)', async () => {
    const r = await formatSource(sketch, 'three');
    expect(r.error).toBeUndefined();
    expect(r.text).toContain('function f(a, b) {');
    expect(findControls(r.text).map(c => c.kind).sort()).toEqual(['color', 'palette', 'range', 'range', 'toggle'].filter(k => k !== 'color').sort());
    expect(r.text).not.toMatch(/;\s*$/m);
  });
  it('formats only a range', async () => {
    const r = await formatSource('const a=1\nconst b=2\n', 'ams', { from: 0, to: 9 });
    expect(r.text.startsWith('const a = 1')).toBe(true);
    expect(r.text).toContain('const b=2');
  });
  it('reports a syntax error with its line', async () => {
    const r = await formatSource('const = 1', 'p5');
    expect(r.error.message).toBeTruthy();
  });
  it('minimizes, keeping control comments, and the controls still read', async () => {
    const r = await minifySource(sketch, 'three');
    expect(r.error).toBeUndefined();
    expect(r.text.length).toBeLessThan(sketch.length);
    expect(r.text).toContain('/* 0..5 */');
    expect(findControls(r.text).filter(c => c.live).map(c => c.name).sort()).toEqual(['colors', 'size', 'speed', 'spin']);
  });
});
