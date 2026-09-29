import { describe, it, expect } from 'vitest';
import { bodyFrom, holds, Recognizer, readGestures, classifier, features, learnedLabels, expressionsOf } from './gestures.js';

// A person facing an unmirrored camera: their left is the image's right.
const W = 1000, H = 1000;
function pose({ lw = [0.7, 0.6], rw = [0.3, 0.6] } = {}) {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, v: 0 }));
  const set = (i, x, y) => { p[i] = { x, y, v: 1 }; };
  set(0, 0.5, 0.2); set(9, 0.49, 0.25); set(10, 0.51, 0.25);
  set(11, 0.6, 0.35); set(12, 0.4, 0.35);   // shoulders: 0.2 apart (the unit: 200 px)
  set(13, 0.65, 0.5); set(14, 0.35, 0.5);
  set(15, ...lw); set(16, ...rw);
  return p;
}
// A hand: wrist at (x, y); fingers up and extended, or curled onto the palm.
function hand(x, y, { curl = [], pinch = false } = {}) {
  const pts = Array.from({ length: 21 }, () => ({ x, y }));
  const s = 0.05;   // hand length (wrist to middle base) in image fractions
  pts[9] = { x, y: y - s };
  const fingers = { thumb: [1, 2, 3, 4], index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };
  const dx = { thumb: -0.04, index: -0.015, middle: 0, ring: 0.015, pinky: 0.03 };
  for (const [f, idx] of Object.entries(fingers)) {
    idx.forEach((i, k) => {
      const reach = curl.includes(f) ? [0.9, 1.0, 0.8, 0.6][k] : [0.9, 1.2, 1.5, 1.8][k];
      pts[i] = { x: x + dx[f] * (f === 'thumb' ? 1 + k * 0.4 : 1), y: y - s * reach * (f === 'thumb' ? 0.5 : 1) };
    });
  }
  if (pinch) pts[4] = { ...pts[8] };
  return pts;
}

describe('bodyFrom', () => {
  it('names points, assigns hands to the person’s wrists, and measures in shoulder widths', () => {
    const b = bodyFrom({ pose: pose(), hands: [hand(0.3, 0.6), hand(0.7, 0.6)], width: W, height: H });
    expect(b.unit).toBeCloseTo(200);
    expect(b.point('nose')).toEqual({ x: 500, y: 200 });
    expect(b.point('left.hand').x).toBeCloseTo(700);   // the person's left: the image's right
    expect(b.point('right.hand').x).toBeCloseTo(300);
    expect(b.point('left.pinky').y).toBeLessThan(600);
  });
  it('without a pose, swaps the model’s labels for an unmirrored camera', () => {
    const b = bodyFrom({ hands: [{ points: hand(0.3, 0.6), label: 'Left' }], width: W, height: H });
    expect(b.hands.right).toBeTruthy();
    expect(bodyFrom({ hands: [{ points: hand(0.3, 0.6), label: 'Left' }], width: W, height: H, mirrored: true }).hands.left).toBeTruthy();
  });
});

describe('conditions', () => {
  it('touch: the left pinky on the nose', () => {
    const near = bodyFrom({ pose: pose({ lw: [0.52, 0.3] }), hands: [hand(0.52, 0.3)], width: W, height: H });
    const far = bodyFrom({ pose: pose(), hands: [hand(0.7, 0.6)], width: W, height: H });
    expect(near.point('left.pinky')).toBeTruthy();
    expect(holds({ touch: ['left.pinky', 'nose'] }, near)).toBe(true);
    expect(holds({ touch: ['left.pinky', 'nose'] }, far)).toBe(false);
    expect(holds({ touch: ['left.pinky', 'nose'], apart: ['right.hand', 'nose'] }, near)).toBe(true);
  });
  it('hand shapes: open, fist, point, pinch, fingers', () => {
    const at = (h, side = 'right') => bodyFrom({ pose: pose(), hands: [side === 'right' ? h : hand(0.3, 0.6), side === 'left' ? h : hand(0.7, 0.6)], width: W, height: H });
    expect(holds({ open: 'right' }, at(hand(0.3, 0.6)))).toBe(true);
    expect(holds({ fist: 'right' }, at(hand(0.3, 0.6, { curl: ['thumb', 'index', 'middle', 'ring', 'pinky'] })))).toBe(true);
    expect(holds({ point: 'right' }, at(hand(0.3, 0.6, { curl: ['middle', 'ring', 'pinky'] })))).toBe(true);
    expect(holds({ fingers: ['right', '11000'] }, at(hand(0.3, 0.6, { curl: ['middle', 'ring', 'pinky'] })))).toBe(true);
    expect(holds({ pinch: 'right' }, at(hand(0.3, 0.6, { pinch: true })))).toBe(true);
    expect(holds({ pinch: 'right' }, at(hand(0.3, 0.6)))).toBe(false);
    expect(holds({ not: { open: 'right' } }, at(hand(0.3, 0.6)))).toBe(false);
  });
  it('above and motion', () => {
    const up = bodyFrom({ pose: pose({ rw: [0.3, 0.1] }), width: W, height: H, t: 0 });
    expect(holds({ above: ['right.wrist', 'nose'] }, up)).toBe(true);
    const later = bodyFrom({ pose: pose({ rw: [0.45, 0.1] }), width: W, height: H, t: 100 });
    expect(holds({ move: ['right.wrist', 'right'] }, later, up)).toBe(true);
    expect(holds({ still: 'right.wrist' }, later, up)).toBe(false);
  });
});

describe('Recognizer', () => {
  const touching = t => bodyFrom({ pose: pose({ lw: [0.52, 0.3] }), hands: [hand(0.52, 0.3)], width: W, height: H, t });
  const idle = t => bodyFrom({ pose: pose(), hands: [hand(0.7, 0.6)], width: W, height: H, t });
  it('fires a held step once, then waits out its cooldown', () => {
    const r = new Recognizer(readGestures("gesture('pick color', [{ touch: ['left.pinky', 'nose'], hold: 300 }], 'color next')"));
    const fired = [];
    for (let t = 0; t <= 1000; t += 50) fired.push(...r.feed(touching(t)));
    expect(fired).toEqual(['pick color']);
    expect(r.gestures[0].action).toBe('color next');
  });
  it('a sequence: each step in order, within the time limit', () => {
    const g = [{ name: 'tap tap', steps: [{ touch: ['left.pinky', 'nose'] }, { apart: ['left.pinky', 'nose'] }, { touch: ['left.pinky', 'nose'] }], within: 600 }];
    const run = frames => { const r = new Recognizer(g); let out = []; frames.forEach((f, i) => { out = out.concat(r.feed(f(i * 50))); }); return out; };
    const quick = [...Array(4).fill(touching), ...Array(4).fill(idle), ...Array(4).fill(touching)];
    expect(run(quick)).toEqual(['tap tap']);
    const slow = [...Array(4).fill(touching), ...Array(20).fill(idle), ...Array(4).fill(touching)];
    expect(run(slow)).toEqual([]);
  });
  it('learned poses: nearest recorded example', () => {
    const open = bodyFrom({ pose: pose(), hands: [hand(0.3, 0.6), hand(0.7, 0.6)], width: W, height: H });
    const fist = bodyFrom({ pose: pose(), hands: [hand(0.3, 0.6, { curl: ['thumb', 'index', 'middle', 'ring', 'pinky'] }), hand(0.7, 0.6)], width: W, height: H });
    const classify = classifier([{ label: 'hi', features: features(open) }, { label: 'rock', features: features(fist) }]);
    expect(classify(open)).toBe('hi');
    expect(classify(fist)).toBe('rock');
    const gs = readGestures("gesture('greet', ['hi'], 'undo')");
    expect(learnedLabels(gs)).toEqual(['hi']);
    const r = new Recognizer(gs, { classify });
    expect([0, 100, 200].flatMap(t => r.feed({ ...open, t }))).toEqual(['greet']);
  });
});

describe('face', () => {
  const face = shapes => ({ points: Array.from({ length: 478 }, (_, i) => ({ x: 0.4 + (i % 10) * 0.01, y: 0.3 + Math.floor(i / 10) * 0.002, z: 0 })), shapes });
  it('expressions: blends of the model\'s scores, and a condition on them', () => {
    const e = expressionsOf({ mouthSmileLeft: 0.8, mouthSmileRight: 0.6, eyeBlinkLeft: 0.1, eyeBlinkRight: 0.3 });
    expect(e.smile).toBeCloseTo(0.7);
    expect(e.blink).toBeCloseTo(0.2);
    const b = bodyFrom({ face: face({ mouthSmileLeft: 0.8, mouthSmileRight: 0.6 }), width: 1000, height: 1000 });
    expect(holds({ expr: ['smile', 0.5] }, b)).toBe(true);
    expect(holds({ expr: ['smile', 0.9] }, b)).toBe(false);
    expect(holds({ expr: ['jawOpen', 0, 0.2] }, b)).toBe(false);   // not scored: not a match
    expect(holds({ expr: ['smile', 0.5] }, bodyFrom({ width: 1, height: 1 }))).toBe(false);   // no face
  });
  it('face points, and the mouth from the face when there is one', () => {
    const b = bodyFrom({ face: face({}), width: 1000, height: 1000 });
    expect(b.point('chin')).toBeTruthy();
    expect(b.point('mouth').x).toBeGreaterThan(0);
    expect(b.point('lip.top')).toBeTruthy();
  });
});
