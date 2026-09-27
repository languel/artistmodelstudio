import { describe, it, expect, afterEach } from 'vitest';
import { getSource, setSourceProvider, clearStreamState } from '../src/process/streams.js';
import { fitSource, shapeToFractions } from '../src/process/fit.js';
import { runScript } from '../src/process/script.js';
import { ProcessStore, createDocument } from '../src/process/document.js';

// A source: left half red, right half blue.
const fake = (frame = 1) => (name, rect) => ({
  ready: true, name, frame, width: 100, height: 100, rect,
  rgb: x => (x < 0.5 ? [255, 0, 0] : [0, 0, 255]),
  color: x => (x < 0.5 ? '#ff0000' : '#0000ff'), value: () => 0.3,
  pose: [], hands: [], mask: () => 0,
  pixels: (w, h) => { const o = new Float32Array(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; if (x < w / 2) o[i] = 255; else o[i + 2] = 255; } return o; }
});

afterEach(() => { setSourceProvider(null); clearStreamState(); });

describe('sources', () => {
  it('without the studio a source is grey and empty', () => {
    const s = getSource('cam');
    expect(s.ready).toBe(false);
    expect(s.color(0.5, 0.5)).toBe('#808080');
    expect(s.pose).toEqual([]);
  });

  it('scores read sources by name', () => {
    setSourceProvider(fake());
    const res = runScript(`const s = source('cam'); print(s.color(0.2, 0.5), s.color(0.8, 0.5))`);
    expect(res.logs[0]).toBe('#ff0000 #0000ff');
  });

  it('shapes become closed point lists in fractions', () => {
    const r = shapeToFractions({ type: 'rect', x: 0, y: 0, width: 1, height: 1 }, 100, 100);
    expect(r.straight).toBe(true);
    expect(r.points[0][0]).toBeCloseTo(0.25);
    expect(shapeToFractions({ type: 'circle', x: 0, y: 0, diameter: 0.5 }, 100, 100).points).toHaveLength(8);
  });

  // The fitter rasterizes shapes on a canvas: these run where there is one (the browser checks cover them).
  const canvas = typeof document !== 'undefined';
  it.skipIf(!canvas)('fit() redraws a source as plane marks, colored from it, kept on the board', () => {
    setSourceProvider(fake());
    const res = runScript(`fit(source('cam'), { shapes: 12 })`);
    expect(res.error).toBeNull();
    const planes = res.doc.elements.filter(e => e.role === 'plane');
    expect(planes).toHaveLength(13);   // the ground, then the shapes
    expect(planes.every(e => e.points.every(([x, y]) => x >= 0 && y >= 0 && x <= 1000 && y <= 1000))).toBe(true);
    expect(planes.slice(1).some(e => /^#(f|e|d)[0-9a-f]0{2,}/.test(e.color) || e.color.startsWith('#ff'))).toBe(true);
  });

  it.skipIf(!canvas)('a live fit keeps its shapes and replaces a few per new frame', () => {
    let frame = 1;
    setSourceProvider((n, r) => fake(frame)(n, r));
    const a = fitSource(getSource('cam'), 1, { shapes: 20, live: true, key: 't' });
    const first = a.shapes.map(s => JSON.stringify(s.points));
    expect(fitSource(getSource('cam'), 1, { shapes: 20, live: true, key: 't' })).toBe(a);   // same frame: same result
    frame = 2;
    const b = fitSource(getSource('cam'), 1, { shapes: 20, live: true, key: 't' });
    const kept = b.shapes.map(s => JSON.stringify(s.points)).filter(p => first.includes(p)).length;
    expect(b.shapes.length).toBeLessThanOrEqual(20);
    expect(kept).toBeGreaterThanOrEqual(15);
    expect(kept).toBeLessThan(20);
  });

  it('a live board-code run leaves no undo step', () => {
    const store = new ProcessStore(createDocument());
    store.runBoardCode('main', `point(0.5, 0.5)`, runScript);
    const past = store.past.length;
    store.runBoardCode('main', `point(0.4, 0.5)`, runScript, { transient: true });
    expect(store.past.length).toBe(past);
    expect(store.doc.elements.filter(e => e.role === 'point')).toHaveLength(1);
  });
});

import { toP5Code } from '../src/process/p5code.js';
describe('a board\'s code as a p5 sketch', () => {
  it('keeps the code, renames the clashing words, defines only what it uses', () => {
    const src = `const s = source('seurat')
for (const i of range(10)) point(i / 10, 0.5, { size: 8, color: s.color(i / 10, 0.5) })
line([[0.1, 0.2], [0.5, 0.3], [0.9, 0.2]], { width: 4 })`;
    const out = toP5Code(src, { board: { title: 'Dots', width: 400, height: 300, ground: '#fff' }, sources: { seurat: { file: 'seurat.jpg', kind: 'image' } } });
    expect(out).toContain("sources[\"seurat\"] = await loadImage(\"seurat.jpg\")");
    expect(out).toContain("async function setup()");
    expect(out).toContain('drawPoint(i / 10, 0.5');
    expect(out).toContain('drawLine([[0.1, 0.2]');
    expect(out).toContain('function source(name)');
    expect(out).toContain('function range(n)');
    expect(out).not.toContain('function drawPlane');
    expect(out).not.toContain('function walk');
    expect(out).toContain('noLoop()');
    expect(() => new Function(out)).not.toThrow();
  });
  it('says what it cannot carry', () => {
    const out = toP5Code(`fit(source('cam'), { shapes: 50 })`, { sources: { cam: { kind: 'camera' } }, loop: true });
    expect(out).toContain('Not in this sketch: fit()');
    expect(out).toContain('createCapture(VIDEO)');
    expect(out).toContain('frameRate(12)');
    expect(() => new Function(out)).not.toThrow();
  });
});

describe('undo memory', () => {
  it('keeps fewer steps for a large drawing', () => {
    const store = new ProcessStore(createDocument());
    for (let i = 0; i < 20; i++) store.change('x', d => { d.meta = { ...(d.meta || {}), pad: 'x'.repeat(1000) + i }; });
    expect(store.past.length).toBe(20);
    store.trimPast(200, 5000);
    expect(store.past.length).toBeLessThan(20);
    expect(store.past.reduce((a, x) => a + x.length, 0)).toBeLessThanOrEqual(5000 + store.past[0].length);
    expect(store.undo()).toBe(true);
  });
});

describe('p5 sketches with ml5.js and brushes', () => {
  it('loads ml5 bodyPose (BlazePose) for .pose and asks it about the source that uses it', () => {
    const out = toP5Code(`const s = source('walk')
for (const p of s.pose) line([[p[11].x, p[11].y], [p[13].x, p[13].y]])`, { sources: { walk: { file: 'walk.gif', kind: 'animated' }, seurat: { file: 'seurat.jpg', kind: 'image' } }, loop: true });
    expect(out).toContain("bodyPose = await ml5.bodyPose('BlazePose')");
    expect(out).toContain('ask(bodyPose, "walk", \'pose\')');
    expect(out).not.toContain('"seurat"');   // not read: not loaded
    expect(out).toContain('pose: (found[name].pose || [])');
    expect(() => new Function(out)).not.toThrow();
  });
  it('watches a camera continuously', () => {
    const out = toP5Code(`const c = source('cam'); for (const h of c.hands) point(h[8].x, h[8].y)`, { sources: { cam: { kind: 'camera' } }, loop: true });
    expect(out).toContain('handPose = await ml5.handPose()');
    expect(out).toContain('handPose.detectStart(sources["cam"]');
    expect(() => new Function(out)).not.toThrow();
  });
  it('keeps custom brushes as functions, with a small kit', () => {
    const out = toP5Code(`brush({ id: 'teeth', roles: ['line'], params: { bite: [0, 20, 6] }, draw(ctx, e, p, k) { for (const f of k.frames(e)) k.segment(ctx, f.x, f.y, f.x + f.nx * p.bite, f.y + f.ny * p.bite) } })
line([[0.1, 0.5], [0.5, 0.4], [0.9, 0.5]], { brush: 'teeth' })`, { board: { width: 400, height: 300 } });
    expect(out).not.toContain('Not in this sketch');
    expect(out).toContain('function brush(def)');
    expect(out).toContain("if (o.brush && brushes[o.brush]) return useBrush(pts, o, 'line')");
    expect(out).toContain('def.draw(drawingContext, e, p, kit)');
    expect(out).toContain('frames(e, n = 4)');
    expect(() => new Function(out)).not.toThrow();
  });
});
