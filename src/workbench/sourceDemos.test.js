import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SOURCE_DEMOS } from './sourceDemos.js';
import { runScript } from '../process/script.js';
import { setSourceProvider, clearStreamState } from '../process/streams.js';

// A picture with structure: dark ground, a bright disc, a blue bar.
const picture = (x, y) => {
  if ((x - 0.5) ** 2 + (y - 0.4) ** 2 < 0.04) return [230, 190, 60];
  if (y > 0.8) return [40, 70, 160];
  return [90, 30, 25];
};
const sampler = name => ({
  ready: true, name, frame: 1, width: 100, height: 100,
  rgb: (x, y) => picture(x, y),
  color: (x, y) => '#' + picture(x, y).map(v => v.toString(16).padStart(2, '0')).join(''),
  value: (x, y) => { const [r, g, b] = picture(x, y); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; },
  pose: [], hands: [], face: [], mask: () => 0, point: () => null, track: () => []
});

describe('demo: painterly, fading strokes', () => {
  const demo = SOURCE_DEMOS.find(d => d.id === 'paint');
  const by = { kind: 'code', name: 'paint-test' };
  beforeEach(() => { setSourceProvider(sampler); clearStreamState('state:paint-test'); });
  afterEach(() => { setSourceProvider(null); clearStreamState('state:paint-test'); });

  it('paints timed strokes, layer by layer, in the source’s colors', () => {
    let res;
    for (let i = 0; i < 25; i++) res = runScript(demo.code('pic'), { seed: 3 + i, by, fresh: true });   // it paints a few strokes at a time
    expect(res.error).toBeNull();
    const strokes = res.doc.elements.filter(e => e.role === 'line');
    expect(strokes.length).toBeGreaterThan(10);
    for (const e of strokes) {
      expect(e.time?.life).toBeGreaterThan(0);
      expect(Number.isFinite(e.born)).toBe(true);
      expect(e.realize.brush).toBe('oil');
    }
    // A stroke on the dark ground is dark red, one in the blue bar is blue.
    const near = (e, f) => { const [x, y] = e.points[0]; return f(x / res.doc.artboard.width, y / res.doc.artboard.height); };
    const blue = strokes.filter(e => near(e, (x, y) => y > 0.9)), ground = strokes.filter(e => near(e, (x, y) => y < 0.2 && Math.abs(x - 0.5) > 0.4));
    const chan = (e, i) => parseInt(e.color.slice(1 + 2 * i, 3 + 2 * i), 16);
    if (blue.length) expect(blue.reduce((t, e) => t + chan(e, 2) - chan(e, 0), 0) / blue.length).toBeGreaterThan(20);
    if (ground.length) expect(ground.reduce((t, e) => t + chan(e, 0) - chan(e, 2), 0) / ground.length).toBeGreaterThan(20);
  });

  it('runs again and again: strokes it made are kept (same birth and seed), and new ones join', () => {
    const first = runScript(demo.code('pic'), { seed: 3, by, fresh: true }).doc.elements.filter(e => e.role === 'line');
    const second = runScript(demo.code('pic'), { seed: 4, by, fresh: true }).doc.elements.filter(e => e.role === 'line');
    const seeds = new Set(second.map(e => e.seed));
    expect(first.every(e => seeds.has(e.seed))).toBe(true);
    expect(second.length).toBeGreaterThan(first.length);
    const born = new Map(second.map(e => [e.seed, e.born]));
    expect(first.every(e => born.get(e.seed) === e.born)).toBe(true);
  });

  it('paints less where the picture already matches: after many runs the births slow', () => {
    let counts = [];
    for (let i = 0; i < 60; i++) counts.push(runScript(demo.code('pic'), { seed: 10 + i, by, fresh: true }).doc.elements.filter(e => e.role === 'line').length);
    const early = counts[5] - counts[0], late = counts[59] - counts[54];
    expect(late).toBeLessThan(early);
  });
});
