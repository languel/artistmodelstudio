import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeImage, describeRegion } from '../src/perception/analyze.js';
import { stateText, stepQuestions, labelledRequest, STEPS } from '../src/decide/questions.js';
import { BACKENDS } from '../src/decide/engine.js';
import { applyStep } from '../src/decide/executors.js';
import { ProcessStore, createDocument } from '../src/process/document.js';

/** A 64×64 grid: dark left half, light right half, a mid-grey square in the right half. */
function grid() {
  const w = 64, h = 64, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let v = x < 32 ? 30 : 230;
    if (x >= 40 && x < 56 && y >= 20 && y < 44) v = 128;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { w, h, data };
}

describe('perception', () => {
  it('finds value masses and regions with polygons in artboard units', () => {
    const a = analyzeImage(grid(), { width: 800, height: 800, k: 3 });
    expect(a.regions.length).toBeGreaterThanOrEqual(3);
    const dark = a.regions.find(r => r.valueClass === 'dark');
    expect(dark.place).toMatch(/left/);
    expect(dark.area).toBeGreaterThan(0.4);
    for (const r of a.regions) {
      expect(r.polygon.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of r.polygon) { expect(x).toBeGreaterThanOrEqual(-1); expect(x).toBeLessThanOrEqual(801); expect(y).toBeLessThanOrEqual(801); }
    }
    expect(describeRegion(dark)).toMatch(/^r\d+: .*dark/);
    expect(a.masses.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1, 1);
  });

  it('is deterministic', () => {
    const a = analyzeImage(grid(), { width: 800, height: 800, k: 3 });
    const b = analyzeImage(grid(), { width: 800, height: 800, k: 3 });
    expect(a.regions.map(describeRegion)).toEqual(b.regions.map(describeRegion));
  });
});

describe('decisions', () => {
  let analysis;
  beforeEach(() => { analysis = analyzeImage(grid(), { width: 800, height: 800, k: 3 }); });

  it('builds compact state and typed questions', () => {
    const state = stateText({ subject: 'test', analysis, history: [] });
    expect(state).toMatch(/Regions:/);
    expect(state.split(/\s+/).length).toBeLessThan(300);
    const q = stepQuestions({ analysis, history: [] });
    expect(Object.keys(q.next.criteria)).toEqual(Object.keys(STEPS));
    expect(q.value.type).toBe('score');
    expect(Object.keys(q.region.criteria)).toEqual(analysis.regions.slice(0, 12).map(r => r.id));
  });

  it('writes labels in lev format, skipping unanswered questions', () => {
    const q = stepQuestions({ analysis, history: [] });
    const req = labelledRequest('s', q, { next: 'block', value: 2, region: null }, 'you');
    expect(req.questions.next).toMatchObject({ type: 'choice', label: 'block', src: 'you_next' });
    expect(req.questions.value.label).toBe(2);
    expect(req.questions.region).toBeUndefined();
  });

  it('rules follow look → block → structure → value → accent → stop', async () => {
    const history = [];
    const seen = [];
    for (let i = 0; i < 12; i++) {
      const questions = stepQuestions({ analysis, history });
      const ans = await BACKENDS.rules({ questions, analysis, history });
      seen.push(ans.next.value);
      if (ans.next.value === 'stop') break;
      expect(questions.region.criteria).toHaveProperty(ans.region.value);
      history.push({ step: ans.next.value, region: ans.region.value, technique: ans.technique.value });
    }
    expect(seen).toEqual(['look', 'block', 'block', 'structure', 'structure', 'value', 'value', 'value', 'accent', 'stop']);
  });

  it('executors add marks with reasons into named stages', () => {
    const store = new ProcessStore(createDocument({ width: 800, height: 800 }));
    const app = { store };
    const r = analysis.regions[0].id;
    const ids = [
      ...applyStep(app, analysis, { step: 'look', region: r, technique: 'gesture', value: 1, direction: 'follow', density: 2 }, { kind: 'policy', name: 'rules' }),
      ...applyStep(app, analysis, { step: 'value', region: r, technique: 'crosshatch', value: 2, direction: 'across', density: 3 }, { kind: 'user', name: 'you' })
    ];
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const hatch = store.doc.elements.find(e => e.realize?.brush === 'hatch');
    expect(hatch.realize.params.cross).toBe(1);
    expect(hatch.why).toMatch(/value · r\d+ .* crosshatch · dark · across · dense/);
    expect(store.doc.stages.map(s => s.name)).toEqual(expect.arrayContaining(['Analysis', 'Value']));
    expect(applyStep(app, analysis, { step: 'stop' }, { kind: 'policy' })).toEqual([]);
  });
});
