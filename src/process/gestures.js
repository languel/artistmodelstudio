/**
 * Gestures: a body (pose and hands, from a source) read as named points, and recognizers that
 * turn it into events. A gesture is a sequence of steps; a step is a set of conditions that must
 * all hold for a moment. Steps follow each other within a time limit.
 *
 *   gesture('pick color', [{ touch: ['left.pinky', 'nose'], hold: 300 }], 'color next')
 *   gesture('clear', [{ fist: 'right' }, { open: 'right' }, { fist: 'right' }], 'undo', { within: 1200 })
 *   gesture('wave', [{ learned: 'palm out' }, { learned: 'palm in' }, { learned: 'palm out' }], 'board next')
 *
 * Conditions (a step's keys; all must hold):
 *   touch: [a, b, tol?]    two points close (tol in body units: shoulder widths, default 0.3)
 *   apart: [a, b, tol?]    two points far apart (default 0.8)
 *   above: [a, b]          a higher than b (below: the reverse)
 *   pinch: side            thumb and index tips together
 *   fist / open / point: side     all fingers curled / all extended / only the index extended
 *   fingers: [side, '01100']      which fingers are extended (thumb, index, middle, ring, pinky)
 *   still: point           barely moving;   move: [point, 'left' | 'right' | 'up' | 'down', speed?]
 *   expr: [name, min, max?] a facial expression (smile, frown, blink, browUp, browDown, squint, jawOpen, mouthPucker… 0..1)
 *   learned: label         the nearest recorded example has this label
 *   not: step              the step does not hold;   any: [steps]   one of them holds
 * A step can also say hold (ms, default 120).
 *
 * Points: nose, mouth, head (the nose), neck (between the shoulders), and for side left or right:
 * side.eye, side.ear, side.shoulder, side.elbow, side.wrist, side.hip, side.knee, side.ankle,
 * side.thumb, side.index, side.middle, side.ring, side.pinky (tips), side.palm, side.hand (the wrist).
 * Left and right are the person's own (their left hand, however the camera sees it).
 *
 * Distances are in body units (a shoulder width, or the torso's length / 1.4 when turned sideways;
 * with no body in view, about two hand lengths),
 * so a gesture works near the camera and far from it.
 */

const POSE = {
  nose: 0, 'left.eye': 2, 'right.eye': 5, 'left.ear': 7, 'right.ear': 8,
  'left.shoulder': 11, 'right.shoulder': 12, 'left.elbow': 13, 'right.elbow': 14, 'left.wrist': 15, 'right.wrist': 16,
  'left.hip': 23, 'right.hip': 24, 'left.knee': 25, 'right.knee': 26, 'left.ankle': 27, 'right.ankle': 28,
  // Rough fingertips from the pose (used when the hand itself is not tracked).
  'left.pinky': 17, 'right.pinky': 18, 'left.index': 19, 'right.index': 20, 'left.thumb': 21, 'right.thumb': 22
};
/** The face model's 52 scores plus a few blends of them (smile, frown, blink, browUp, browDown, squint): 0..1. */
export function expressionsOf(shapes = {}) {
  const avg = (...n) => n.reduce((s, k) => s + (shapes[k] || 0), 0) / n.length;
  return { ...shapes, smile: avg('mouthSmileLeft', 'mouthSmileRight'), frown: avg('mouthFrownLeft', 'mouthFrownRight'), blink: avg('eyeBlinkLeft', 'eyeBlinkRight'), browUp: avg('browInnerUp', 'browOuterUpLeft', 'browOuterUpRight'), browDown: avg('browDownLeft', 'browDownRight'), squint: avg('eyeSquintLeft', 'eyeSquintRight') };
}

/** A few named points of the face (indices into its 478). */
const FACE_POINT = { 'nose': 1, 'chin': 152, 'lip.top': 13, 'lip.bottom': 14, 'mouth.left': 291, 'mouth.right': 61, 'eye.left': 263, 'eye.right': 33, 'brow.left': 276, 'brow.right': 46 };
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const PIP = { thumb: 2, index: 6, middle: 10, ring: 14, pinky: 18 };
export const POINT_NAMES = ['nose', 'mouth', 'head', 'neck', 'chin', 'lip.top', 'lip.bottom', 'mouth.left', 'mouth.right', ...['left', 'right'].flatMap(s => ['eye', 'ear', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'hand', 'palm', ...FINGERS].map(p => `${s}.${p}`))];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null);

/**
 * A body from raw landmarks (fractions of the image, as MediaPipe gives them) and the image size:
 *   pose: [{ x, y, v }] × 33 (the first person), hands: [{ points: [{ x, y }] × 21, label? }]
 * Hands are matched to the person's wrists when the pose is there; otherwise by the model's label
 * (which assumes a mirrored image: the camera's is not, so it is swapped; mirrored: true keeps it).
 */
export function bodyFrom({ pose = null, hands = [], face = null, width = 1, height = 1, mirrored = false, t = 0 } = {}) {
  const px = q => (q ? { x: q.x * width, y: q.y * height } : null);
  const P = pose && pose.length >= 33 ? pose.map(q => ((q.v ?? 1) > 0.4 ? px(q) : null)) : null;
  const H = { left: null, right: null };
  const list = (hands || []).map(h => ({ pts: (h.points || h).map(px), label: h.label }));
  if (P && (P[15] || P[16])) {
    // Each hand to the nearer wrist (the pose knows whose it is).
    const cost = (h, w) => (P[w] ? dist(h.pts[0], P[w]) : Infinity);
    if (list.length === 1) { const h = list[0]; H[cost(h, 15) <= cost(h, 16) ? 'left' : 'right'] = h.pts; }
    else if (list.length >= 2) {
      const [a, b] = list;
      if (cost(a, 15) + cost(b, 16) <= cost(a, 16) + cost(b, 15)) { H.left = a.pts; H.right = b.pts; } else { H.left = b.pts; H.right = a.pts; }
    }
  } else {
    for (const h of list) {
      if (!h.label) continue;
      const own = /left/i.test(h.label) ? 'left' : 'right';
      const side = mirrored ? own : own === 'left' ? 'right' : 'left';
      if (!H[side]) H[side] = h.pts;
    }
  }
  const handSize = side => (H[side] ? dist(H[side][0], H[side][9]) : 0);
  // The unit: a shoulder width, or (turned sideways, where the shoulders overlap) the torso's length / 1.4.
  const shoulders = P && P[11] && P[12] ? dist(P[11], P[12]) : 0;
  const torso = P && P[11] && P[12] && P[23] && P[24] ? dist(mid(P[11], P[12]), mid(P[23], P[24])) / 1.4 : 0;
  const unit = Math.max(shoulders, torso) || Math.max(handSize('left'), handSize('right')) * 2.2 || Math.min(width, height) * 0.25;
  const point = name => {
    if (name === 'head') name = 'nose';
    if (name === 'mouth') return face ? px(mid(face.points[13], face.points[14])) : P ? mid(P[9], P[10]) : null;
    if (face && name in FACE_POINT) return px(face.points[FACE_POINT[name]]);
    if (name === 'neck') return P ? mid(P[11], P[12]) : null;
    const [side, part] = name.split('.');
    const hand = H[side];
    if (hand) {
      if (part in TIP) return hand[TIP[part]];
      if (part === 'hand' || (part === 'wrist' && !P?.[POSE[name]])) return hand[0];
      if (part === 'palm') return mid(hand[0], hand[9]);
    }
    if (part === 'palm' || part === 'hand') return P ? P[POSE[`${side}.wrist`]] : null;
    return P && name in POSE ? P[POSE[name]] : null;
  };
  // A finger is extended when its tip is farther from the wrist than its middle joint (the thumb:
  // farther from the little finger's base than its own base is).
  const extended = (side, finger) => {
    const h = H[side];
    if (!h) return null;
    if (finger === 'thumb') return dist(h[TIP.thumb], h[17]) > dist(h[2], h[17]) * 1.25;
    return dist(h[TIP[finger]], h[0]) > dist(h[PIP[finger]], h[0]) * 1.1;
  };
  // Expressions by name (the face model's 52 scores, 0..1) and a few blends of them.
  const expr = face ? expressionsOf(face.shapes || {}) : null;
  return { t, width, height, unit, pose: P, hands: H, face: face || null, expr, point, extended, handSize };
}

// ---- conditions -------------------------------------------------------------------------

/** Whether one step holds for a body (and the one before it, for motion). */
export function holds(step, body, prev = null, ctx = {}) {
  if (!step || !body) return false;
  const u = body.unit;
  const pt = n => body.point(n);
  for (const [k, v] of Object.entries(step)) {
    if (k === 'hold' || k === 'label') continue;
    let ok;
    if (k === 'touch' || k === 'apart') {
      const [a, b, tol = k === 'touch' ? 0.3 : 0.8] = v;
      const A = pt(a), B = pt(b);
      ok = Boolean(A && B) && (k === 'touch' ? dist(A, B) < tol * u : dist(A, B) > tol * u);
    } else if (k === 'above' || k === 'below') {
      const A = pt(v[0]), B = pt(v[1]);
      ok = Boolean(A && B) && (k === 'above' ? A.y < B.y - 0.05 * u : A.y > B.y + 0.05 * u);
    } else if (k === 'pinch') {
      const h = body.hands[v];
      ok = Boolean(h) && dist(h[TIP.thumb], h[TIP.index]) < 0.35 * body.handSize(v);
    } else if (k === 'fist' || k === 'open' || k === 'point' || k === 'fingers') {
      const side = k === 'fingers' ? v[0] : v;
      const ext = FINGERS.map(f => body.extended(side, f));
      if (ext[1] === null) ok = false;
      else if (k === 'fist') ok = !ext[1] && !ext[2] && !ext[3] && !ext[4];
      else if (k === 'open') ok = ext.every(Boolean);
      else if (k === 'point') ok = ext[1] && !ext[2] && !ext[3] && !ext[4];
      else ok = [...String(v[1])].every((c, i) => (c === '1') === ext[i]);
    } else if (k === 'still' || k === 'move') {
      const name = k === 'still' ? v : v[0];
      const A = pt(name), B = prev?.point(name), dt = prev ? (body.t - prev.t) / 1000 : 0;
      if (!A || !B || dt <= 0) { ok = false; }
      else {
        const vx = (A.x - B.x) / u / dt, vy = (A.y - B.y) / u / dt;
        if (k === 'still') ok = Math.hypot(vx, vy) < 0.5;
        else {
          const speed = v[2] ?? 1.5, along = { left: -vx, right: vx, up: -vy, down: vy }[v[1]] ?? 0;
          ok = along > speed;
        }
      }
    } else if (k === 'expr') {
      // expr: ['smile', 0.5]: at least; expr: ['jawOpen', 0, 0.2]: within a range
      const [name, lo, hi = 1.01] = v, x = body.expr?.[name];
      ok = x !== undefined && x >= lo && x <= hi;
    } else if (k === 'learned') {
      ok = Boolean(ctx.classify) && ctx.classify(body) === v;
    } else if (k === 'not') {
      ok = !holds(v, body, prev, ctx);
    } else if (k === 'any') {
      ok = v.some(s => holds(s, body, prev, ctx));
    } else throw new Error(`Unknown gesture condition “${k}”`);
    if (!ok) return false;
  }
  return true;
}

// ---- sequences --------------------------------------------------------------------------

/**
 * Recognizes gestures over time. feed(body) → the names of the gestures that completed.
 * For each gesture: the step it is on, how far along (progress, 0..1) for showing it.
 */
export class Recognizer {
  constructor(gestures = [], { classify = null } = {}) {
    this.classify = classify;
    this.set(gestures);
  }

  set(gestures) {
    this.gestures = gestures.map(g => ({ within: 1500, cooldown: 800, ...g }));
    this.state = new Map(this.gestures.map(g => [g.name, { step: 0, since: null, doneAt: 0, firedAt: -Infinity }]));
  }

  feed(body) {
    const fired = [];
    const t = body.t, ctx = { classify: this.classify ? memo(this.classify) : null };
    for (const g of this.gestures) {
      const s = this.state.get(g.name);
      if (t - s.firedAt < g.cooldown) continue;
      // Too long since the last step: start again.
      if (s.step > 0 && s.since === null && t - s.doneAt > g.within) s.step = 0;
      const step = g.steps[s.step];
      let ok = false;
      try { ok = holds(step, body, this.prev, ctx); } catch (err) { s.error = err.message; }
      if (!ok && s.step > 0) {
        // The first step may begin again while waiting for the next one (a restart, not a stall).
        if (s.since === null && holds(g.steps[0], body, this.prev, ctx) && g.steps.length > 1 && !sameStep(g.steps[0], step)) { s.step = 0; s.since = t; continue; }
      }
      if (!ok) { s.since = null; continue; }
      if (s.since === null) s.since = t;
      if (t - s.since >= (step.hold ?? 120)) {
        s.step++; s.since = null; s.doneAt = t;
        if (s.step >= g.steps.length) { s.step = 0; s.firedAt = t; fired.push(g.name); }
      }
    }
    this.prev = body;
    return fired;
  }

  /** How far along each gesture is: { name: 0..1 } (steps done, plus the current step's hold). */
  progress(t = this.prev?.t || 0) {
    const out = {};
    for (const g of this.gestures) {
      const s = this.state.get(g.name), step = g.steps[s.step] || {};
      const part = s.since === null ? 0 : Math.min(1, (t - s.since) / Math.max(1, step.hold ?? 120));
      out[g.name] = t - s.firedAt < 400 ? 1 : (s.step + part) / g.steps.length;
    }
    return out;
  }
}

const sameStep = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const memo = fn => { let body = null, out; return b => (b === body ? out : (body = b, out = fn(b))); };

// ---- learned poses ----------------------------------------------------------------------

/**
 * What a recorded example keeps: each hand's shape (its points around the wrist, in hand lengths),
 * where the hands are around the head (in body units), and the arms. Missing parts are null.
 */
export function features(body) {
  const out = [];
  const u = body.unit, head = body.point('nose') || body.point('neck');
  for (const side of ['left', 'right']) {
    const h = body.hands[side], s = body.handSize(side);
    for (let i = 1; i < 21; i++) { out.push(h && s ? (h[i].x - h[0].x) / s : null, h && s ? (h[i].y - h[0].y) / s : null); }
    const p = body.point(`${side}.palm`);
    out.push(p && head ? (p.x - head.x) / u : null, p && head ? (p.y - head.y) / u : null);
    for (const j of ['elbow', 'wrist']) { const q = body.point(`${side}.${j}`), sh = body.point(`${side}.shoulder`); out.push(q && sh ? (q.x - sh.x) / u : null, q && sh ? (q.y - sh.y) / u : null); }
  }
  return out;
}

/** Distance between two feature lists: over the parts both have; parts only one has count against. */
export function featureDistance(a, b) {
  let sum = 0, n = 0, missing = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === null && y === null) continue;
    if (x === null || y === null) { missing++; continue; }
    sum += (x - y) ** 2; n++;
  }
  if (!n) return Infinity;
  return Math.sqrt(sum / n) + (missing / (n + missing)) * 1.5;
}

/** Nearest neighbours over recorded examples ({ label, features }): a label, or null if none is close. */
export function classifier(examples, { k = 3, near = 0.45 } = {}) {
  if (!examples?.length) return () => null;
  return body => {
    const f = features(body);
    const ranked = examples.map(e => ({ label: e.label, d: featureDistance(f, e.features) })).filter(e => e.d < near).sort((a, b) => a.d - b.d).slice(0, k);
    if (!ranked.length) return null;
    const votes = {};
    for (const r of ranked) votes[r.label] = (votes[r.label] || 0) + 1 / (r.d + 0.05);
    return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  };
}

// ---- the gesture script -----------------------------------------------------------------

/**
 * Gestures are written as code: gesture(name, steps, action, options). Returns [{ name, steps,
 * action, within, cooldown }]. An action is a studio action ('color next', 'undo', '!board next'…)
 * or a function (called with the studio and the body).
 */
export function readGestures(code) {
  const out = [];
  const gesture = (name, steps, action = null, opts = {}) => {
    if (!name || !Array.isArray(steps) || !steps.length) throw new Error('gesture(name, [steps], action)');
    out.push({ name: String(name), steps: steps.map(s => (typeof s === 'string' ? { learned: s } : s)), action, ...opts });
  };
  // eslint-disable-next-line no-new-func
  new Function('gesture', `"use strict";\n${code}`)(gesture);
  return out;
}

/** The labels a set of gestures asks the classifier for (the examples to record). */
export const learnedLabels = gestures => [...new Set(JSON.stringify(gestures.map(g => g.steps)).match(/"learned":"[^"]+"/g)?.map(m => m.slice(11, -1)) || [])];
