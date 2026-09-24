import { describe, it, expect } from 'vitest';
import { crc32, createZip } from '../src/export/zip.js';
import { buildP5Sketch, buildIndexHtml, frameSteps, buildContinuousSketch } from '../src/export/p5Export.js';

const program = {
  version: 1,
  actions: [
    { op: 'background', color: '#7a3b2e' },
    { op: 'noStroke' },
    { op: 'fill', color: '#d4a017', opacity: 1 },
    { op: 'rect', x: 0.1, y: -0.5, width: 0.3, height: 0.25 },
    { op: 'circle', x: 0, y: 0.2, diameter: 0.4 }
  ]
};

describe('zip writer', () => {
  it('computes standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
  });

  it('writes a stored archive with a matching central directory', () => {
    const bytes = createZip([{ name: 'a.txt', data: 'hi' }, { name: 'b/c.js', data: 'x=1' }]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
  });
});

describe('p5 export', () => {
  it('embeds the program and the U-key controls', async () => {
    const sketch = await buildP5Sketch(program, { mediumId: 'flat', title: 'Castle study' });
    expect(sketch).toContain('const PROGRAM = {');
    expect(sketch).toContain('"op": "rect"');
    expect(sketch).toContain('const PIXEL = null;');
    expect(sketch).toContain("k === 'u'");
    expect(sketch).toContain('const TITLE_SLUG = "castle-study"');
    expect(() => new Function(sketch)).not.toThrow();
  });

  it('embeds the studio watercolor routine and a renderer toggle', async () => {
    const sketch = await buildP5Sketch(program, { mediumId: 'watercolor' });
    expect(sketch).toContain('const MEDIUM = "watercolor"');
    expect(sketch).toContain('function paintWatercolor(brush, canvas, actions');
    expect(sketch).not.toMatch(/^export /m);
    expect(sketch).toContain("k === 'w'");
    expect(() => new Function(sketch)).not.toThrow();
  });

  it('builds an index page that loads vendored p5 before the sketch', () => {
    const html = buildIndexHtml('A <b> title');
    expect(html.indexOf('p5.min.js')).toBeLessThan(html.indexOf('brush.js'));
    expect(html.indexOf('brush.js')).toBeLessThan(html.indexOf('sketch.js'));
    expect(html).toContain('A &lt;b&gt; title');
  });

  it('caps animation frames', () => {
    expect(frameSteps(1602).length).toBeLessThanOrEqual(150);
    expect(frameSteps(1602).at(-1)).toBe(1602);
    expect(frameSteps(5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('builds a self-contained continuous sketch', () => {
    const target = { rgb: new Float32Array(8 * 6 * 3).fill(128), width: 8, height: 6 };
    const sketch = buildContinuousSketch(target, { density: 50, lifetime: 5, fade: 0.3, shapes: ['rect'], seed: 1 }, { title: 'Test' });
    expect(sketch).toContain('class ReferenceFitter');
    expect(sketch).toContain('class ContinuousFitter');
    expect(sketch).not.toMatch(/^(import|export) /m);
    expect(sketch).toContain('const TARGET_W = 8;');
    expect(sketch).toContain('const TARGET_H = 6;');
    expect(() => new Function(sketch)).not.toThrow();
    expect(sketch).toContain('class WatercolorLayer');
    expect(sketch).toContain('class WatercolorSprites');
    expect(sketch).toContain('function drawScene(');
    expect(sketch).toContain('const REF_DATA_URL = ');
    // Top-level names must not collide with p5 globals (p5 refuses to redefine them).
    const p5Globals = ['set', 'get', 'fill', 'stroke', 'text', 'image', 'color', 'random', 'noise', 'map', 'line', 'rect',
      'circle', 'point', 'save', 'loop', 'redraw', 'remove', 'clear', 'erase', 'shape', 'triangle', 'filter', 'blend', 'copy', 'mask', 'print'];
    const topLevel = [...sketch.matchAll(/^(?:function|let|const|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    expect(topLevel.filter(n => p5Globals.includes(n))).toEqual([]);
    // brush.js declares globals t and e; a top-level let/const with those names breaks the page.
    expect(sketch).not.toMatch(/^(let|const|var)\s+(t|e)\b|^let [^;]*\b(t|e)\s*=/m);
    expect(sketch).toContain("k === 'w'");
    expect(buildIndexHtml('x', { brush: false })).not.toContain('brush.js');
  });

  it('starts the continuous player with the panel settings at export time', () => {
    const target = { rgb: new Float32Array(4 * 4 * 3).fill(100), width: 4, height: 4 };
    const panel = { render: 'layered', mode: 'fade', density: 1000, lifetime: 3, fadeIn: 0.2, fadeOut: 0.4,
      opacity: 0.7, pigment: 0.3, shapes: ['circle'], overlay: 'over', refOpacity: 0.25, seed: 1 };
    const sketch = buildContinuousSketch(target, panel, { title: 'Settings' });
    const params = JSON.parse(sketch.match(/^const PARAMS = (.*);$/m)[1]);
    expect(params).toEqual(panel);
    // The player's state starts from PARAMS (defaults only fill gaps).
    expect(sketch).toContain("const state = Object.assign({ render: 'flat', overlay: 'off', refOpacity: 0.5, opacity: 1, pigment: 0.6 }, PARAMS);");
  });
});
