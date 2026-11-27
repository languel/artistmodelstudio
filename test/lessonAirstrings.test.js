import { describe, it, expect } from 'vitest';
import { LESSON } from '../examples/lessons/airstrings/lesson.js';

const boards = LESSON.sections.flatMap(s => s.boards);
const sketch = id => boards.find(b => b.id === id).p5;

// A sketch's own functions, run without p5: the few p5 words they use, given here.
function harness(id, take, extra = {}) {
  const p5 = { width: 800, height: 600, dist: (a, b, c, d) => Math.hypot(c - a, d - b), constrain: (v, a, b) => Math.min(b, Math.max(a, v)), ...extra };
  const f = new Function(...Object.keys(p5), `${sketch(id)}\n;return { ${take.join(', ')} }`);
  return f(...Object.values(p5));
}

describe('the Strings in the Air lesson', () => {
  it('has a board per idea, sketches that parse, the demo last, and a bibliography of links', () => {
    expect(boards.map(b => b.id)).toEqual(['hands', 'pinch', 'stretch', 'pluck', 'tune', 'ring', 'face', 'clap', 'midi', 'together']);
    for (const b of boards) {
      expect(b.title && b.idea, b.id).toBeTruthy();
      if (b.id === 'together') { expect(b.p5).toBeUndefined(); continue; }   // (the demo page, put on an HTML board by setup)
      expect(() => new Function(b.p5), b.id).not.toThrow();
      expect(b.p5, b.id).toMatch(/function setup\(\)/);
      expect(b.p5, b.id).toMatch(/function draw\(\)/);
    }
    expect(typeof LESSON.setup).toBe('function');
    expect(LESSON.bibliography.flatMap(c => c.items).every(([text, url]) => text && /^https:\/\//.test(url))).toBe(true);
  });

  it('every camera sketch can play with the mouse, and asks for the camera only from ▶', () => {
    for (const b of boards.filter(x => x.p5 && /createCapture/.test(x.p5))) {
      expect(b.p5, b.id).toMatch(/onStart\(\)/);
      expect(b.p5, b.id).toMatch(/mouse(Pressed|Moved|X)/);
    }
  });

  it('crossing: where a fingertip\'s path crosses a string, and not when it misses', () => {
    const { crossing } = harness('pluck', ['crossing']);
    const a = { x: 100, y: 100 }, b = { x: 300, y: 100 };
    expect(crossing({ x: 150, y: 80 }, { x: 150, y: 120 }, a, b)).toBeCloseTo(0.25);
    expect(crossing({ x: 250, y: 120 }, { x: 250, y: 80 }, a, b)).toBeCloseTo(0.75);
    expect(crossing({ x: 350, y: 80 }, { x: 350, y: 120 }, a, b)).toBe(-1);   // beyond the end
    expect(crossing({ x: 150, y: 80 }, { x: 150, y: 95 }, a, b)).toBe(-1);    // stopped short
  });

  it('tuning: anywhere a string is drawn, its note is in the scale; higher is higher, and level is brighter than upright', () => {
    const { tune, SCALES } = harness('tune', ['tune', 'SCALES']);
    const s = (ax, ay, bx, by) => tune({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
    for (let i = 0; i < 200; i++) {
      const ax = Math.random() * 800, ay = Math.random() * 600, bx = Math.random() * 800, by = Math.random() * 600;
      if (Math.hypot(bx - ax, by - ay) < 50) continue;
      const pc = ((s(ax, ay, bx, by).midi - 50) % 12 + 12) % 12;
      expect(SCALES['minor pentatonic']).toContain(pc);
    }
    expect(s(300, 100, 500, 100).midi).toBeGreaterThan(s(300, 500, 500, 500).midi);
    expect(s(300, 300, 500, 300).damping).toBeLessThan(s(400, 200, 400, 400).damping);
  });

  it('a pinch has two thresholds: it starts below 0.28 hand sizes and ends only above 0.5', () => {
    // (the sketch keeps hands in a let; reach it through a small setter added here)
    const code = sketch('pinch') + '\n;function setHands(h) { hands = h }';
    const f = new Function('width', 'height', 'dist', 'constrain', `${code}\n;return { pinches, setHands }`);
    const { pinches, setHands } = f(800, 600, (a, b, c, d) => Math.hypot(c - a, d - b), (v, a, b) => Math.min(b, Math.max(a, v)));
    const hand = gap => { const h = Array.from({ length: 21 }, () => ({ x: 400, y: 300 })); h[0] = { x: 400, y: 400 }; h[9] = { x: 400, y: 300 }; h[4] = { x: 400, y: 200 }; h[8] = { x: 400 + gap, y: 200 }; return h; };   // hand size 100
    const at = gap => { setHands([hand(gap)]); return pinches()[0].on; };
    expect(at(40)).toBe(false);   // 0.4: not yet
    expect(at(20)).toBe(true);    // 0.2: starts
    expect(at(40)).toBe(true);    // 0.4: still on (between the thresholds)
    expect(at(60)).toBe(false);   // 0.6: ends
  });
});
