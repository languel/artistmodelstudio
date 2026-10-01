import { describe, it, expect } from 'vitest';
import { LESSON } from '../examples/lessons/diffusion/lesson.js';
import { runScoreInto } from '../src/process/script.js';
import { createDocument } from '../src/process/document.js';

const boards = LESSON.sections.flatMap(s => s.boards.map(b => ({ ...b, section: s })));

// A seeded Gaussian for the sketches, which run here without p5.
function harness(id, replace = []) {
  let seed = 4321; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let code = boards.find(b => b.id === id).p5;
  for (const [a, b] of replace) code = code.replace(a, b);
  const f = new Function('randomSeed', 'noiseSeed', 'randomGaussian', 'createCanvas', 'pixelDensity', 'constrain', 'frameCount',
    `${code}\n;return { setup, advance, get x() { return x }, get mu() { return mu }, get stat() { return typeof stat === 'undefined' ? null : stat }, get pics() { return typeof pics === 'undefined' ? null : pics }, get wts() { return typeof wts === 'undefined' ? null : wts } }`);
  return f(() => {}, () => {}, gauss, () => {}, () => {}, (v, a, b) => Math.min(b, Math.max(a, v)), 0);
}
const nearest = (p, mu) => { let bi = 0, bd = Infinity; mu.forEach((m, i) => { const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < bd) { bd = d; bi = i; } }); return [bi, bd]; };

describe('the diffusion lecture', () => {
  it('has diagrams that run, sketches that parse, and a bibliography of links', () => {
    expect(boards.length).toBe(11);
    for (const b of boards) {
      expect(b.title && b.idea && (b.code || b.p5), b.id).toBeTruthy();
      if (b.p5) expect(() => new Function(b.p5), b.id).not.toThrow();
      else {
        const r = runScoreInto(createDocument(), b.code, { board: 'main' });
        expect(r.error, b.id).toBeNull();
        expect(r.doc.elements.length, b.id).toBeGreaterThan(20);
      }
    }
    expect(LESSON.bibliography.flatMap(c => c.items).every(([text, url]) => text && /^https:\/\//.test(url))).toBe(true);
    expect(LESSON.sections[0].boards.every(b => b.code && !b.p5)).toBe(true);   // diagrams: studio code
    expect(LESSON.sections[1].boards.every(b => b.p5)).toBe(true);              // simulations: p5 sketches
  });

  it('the reverse sketch, DDIM and DDPM, turns noise into the six blobs', () => {
    for (const [eta, steps] of [[0, 40], [1, 100]]) {
      const s = harness('reverse-points', [['const steps = 40', `const steps = ${steps}`], ['const eta = 0', `const eta = ${eta}`]]);
      s.setup(); for (let i = 0; i < steps; i++) s.advance();
      const near = s.x.map(p => nearest(p, s.mu)), counts = new Array(6).fill(0);
      near.forEach(([i]) => counts[i]++);
      const spread = near.reduce((a, [, d]) => a + d, 0) / near.length;
      expect(spread, `eta ${eta}`).toBeLessThan(0.26);                 // the blobs have 0.20
      expect(Math.min(...counts) / near.length, `eta ${eta}`).toBeGreaterThan(0.12);   // all six, about a sixth each
    }
  });

  it('guidance: w = 1 is the conditional model, more w crowds one blob', () => {
    const run = w => { const s = harness('guidance', [['const w = 3', `const w = ${w}`]]); s.setup(); for (let i = 0; i < 40; i++) s.advance(); return s.stat; };
    expect(run(0).share).toBeGreaterThan(0.35); expect(run(0).share).toBeLessThan(0.65);
    expect(run(1).share).toBeGreaterThan(0.99);
    expect(run(1).top).toBeLessThan(0.45);
    expect(run(8).top).toBeGreaterThan(0.7);
  });

  it('the picture sampler ends on one of its three pictures, with the weights on it', () => {
    const s = harness('sample-image');
    s.setup(); for (let i = 0; i < 30; i++) s.advance();
    const rms = q => Math.sqrt(q.reduce((a, v, i) => a + (v - s.x[i]) ** 2, 0) / q.length);
    const d = s.pics.map(rms);
    expect(Math.min(...d)).toBeLessThan(0.05);       // the last step lands on the picture it chose
    expect(Math.max(...s.wts)).toBeGreaterThan(0.99);
  });
});
