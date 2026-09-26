import { describe, it, expect } from 'vitest';
import { runScript } from '../src/process/script.js';
import { selectionCode, applySelectionCode, replaceElements, clipCode, applyClipCode } from '../src/process/codegen.js';

const doc = runScript(`artboard(800, 600)
stage('Ground', 'blocking')
plane(rect(0.1, 0.1, 0.3, 0.3), { brush: 'hatch', angle: 30, spacing: 8, color: '#c63a26', why: 'a block' })
stage('Marks', 'marks')
line(walk({ from: [0.1, 0.8], steps: 12, step: 0.03 }), { width: 3, why: 'a walk' })
point(0.7, 0.3, { size: 20, color: '#2a4f9a' })
note(0.05, 0.05, 'look here')`).doc;
doc.elements[1].label = 'the walk'; doc.elements[1].opacity = 0.6; doc.elements[3].note = { style: 'sticky', size: 18 };
const strip = e => { const { id, seed, created, by, ...rest } = e; return JSON.parse(JSON.stringify(rest, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v))); };

describe('everything as code', () => {
  it('marks round-trip through their code unchanged', () => {
    const ids = doc.elements.map(e => e.id);
    const src = selectionCode(doc.elements, doc);
    expect(src).toMatch(/units\('artboard'\)/);
    expect(src).toMatch(/plane\(/);
    const res = applySelectionCode(doc, ids, src);
    expect(res.error).toBeUndefined();
    expect(res.elements.map(e => e.id)).toEqual(ids);
    expect(res.elements.map(strip)).toEqual(doc.elements.map(strip));
  });

  it('an edit to the code changes the mark in place', () => {
    const id = doc.elements[0].id;
    const src = selectionCode([doc.elements[0]], doc).replace('"angle":30', '"angle":60').replace('angle: 30', 'angle: 60');
    const res = applySelectionCode(doc, [id], src);
    const d = structuredClone(doc);
    replaceElements(d, [id], res.elements, res.stages);
    expect(d.elements[0].id).toBe(id);
    expect(d.elements[0].realize.params.angle).toBe(60);
    expect(d.elements).toHaveLength(doc.elements.length);
  });

  it('errors come back with a line', () => {
    const res = applySelectionCode(doc, [doc.elements[0].id], "units('artboard')\nplane(nope)");
    expect(res.error).toBeTruthy();
  });

  it('clips round-trip through clip({ … })', () => {
    const c = { id: 'c1', track: 'say', start: 1200, dur: 3000, text: 'Look at the weight.', fx: { fade: 250 } };
    const res = applyClipCode(c, clipCode(c).replace('1200', '1500'));
    expect(res.fields).toMatchObject({ track: 'say', start: 1500, dur: 3000, text: 'Look at the weight.' });
    expect(applyClipCode(c, 'clip({ start: "x" })').error).toBeTruthy();
  });
});
