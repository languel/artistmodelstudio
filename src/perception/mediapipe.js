/**
 * MediaPipe (Tasks Vision) for the reference: pose landmarks and a figure mask.
 * Loaded on demand from the jsDelivr CDN; models from Google's MediaPipe storage.
 * Returns artboard-space results so they can become guides, gestures and regions.
 */
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODELS = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  poseFull: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  segment: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  hands: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
};

let vision = null;
const cache = {};

async function load() {
  if (vision) return vision;
  const mod = await import(/* @vite-ignore */ `${CDN}/vision_bundle.mjs`);
  const fileset = await mod.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  vision = { mod, fileset };
  return vision;
}

/**
 * Trackers: the models that read a source's picture, by kind. Each: create(mod, fileset, mode, full)
 * → a MediaPipe task; image / video: the task's method names; read(result) → the answer, normalized to
 * the picture (0..1). A new kind is one entry (registerTracker), and then source('cam').track('kind').
 */
const TRACKERS = {
  pose: {
    create: (mod, fileset, mode, full) => mod.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: mode === 'VIDEO' || full ? MODELS.poseFull : MODELS.pose, delegate: 'GPU' }, runningMode: mode, numPoses: 2 }),
    image: 'detect', video: 'detectForVideo',
    read: r => (r.landmarks || []).map(p => p.map(q => ({ x: q.x, y: q.y, v: q.visibility ?? 1 })))
  },
  hands: {
    create: (mod, fileset, mode) => mod.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELS.hands, delegate: 'GPU' }, runningMode: mode, numHands: 2 }),
    image: 'detect', video: 'detectForVideo',
    // Each hand keeps the model's label (Left/Right, as if the picture were mirrored) as .label.
    read: r => (r.landmarks || []).map((p, i) => Object.assign(p.map(q => ({ x: q.x, y: q.y })), { label: r.handedness?.[i]?.[0]?.categoryName || null }))
  },
  mask: {
    create: (mod, fileset, mode) => mod.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELS.segment, delegate: 'GPU' }, runningMode: mode, outputCategoryMask: false, outputConfidenceMasks: true }),
    image: 'segment', video: 'segmentForVideo',
    read: r => { const m = r.confidenceMasks?.[0]; if (!m) return null; const out = { w: m.width, h: m.height, data: Float32Array.from(m.getAsFloat32Array()) }; m.close?.(); return out; }
  },
  // Faces: 478 points each (x, y, z) and 52 expression scores (0..1) by name (jawOpen, mouthSmileLeft, eyeBlinkRight…).
  face: {
    create: (mod, fileset, mode) => mod.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELS.face, delegate: 'GPU' }, runningMode: mode, numFaces: 2, outputFaceBlendshapes: true }),
    image: 'detect', video: 'detectForVideo',
    read: r => (r.faceLandmarks || []).map((p, i) => ({ points: p.map(q => ({ x: q.x, y: q.y, z: q.z })), shapes: Object.fromEntries((r.faceBlendshapes?.[i]?.categories || []).map(c => [c.categoryName, c.score])) }))
  }
};
/** Add a tracker kind: { create(mod, fileset, mode, full), image, video, read(result) }. */
export const registerTracker = (kind, def) => { TRACKERS[kind] = def; };

// mode: 'IMAGE' (each picture on its own) or 'VIDEO' (a stream: tracks between frames, steadier).
// A video task belongs to one stream (its timestamps must increase), so it is kept per stream.
async function task(kind, mode = 'IMAGE', stream = '', full = false) {
  const key = mode === 'VIDEO' ? `${kind}:video:${stream}` : full ? `${kind}:full` : kind;
  if (cache[key]) return cache[key];
  const t = TRACKERS[kind];
  if (!t) throw new Error(`No tracker “${kind}”`);
  const { mod, fileset } = await load();
  cache[key] = await t.create(mod, fileset, mode, full);
  return cache[key];
}

/** Cover-fit mapping from normalized image coordinates to the artboard. */
function mapper(img, width, height) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.max(width / iw, height / ih), ox = (width - iw * k) / 2, oy = (height - ih * k) / 2;
  return (u, v) => [Math.round(ox + u * iw * k), Math.round(oy + v * ih * k)];
}

export const POSE_LIMBS = [
  ['spine', [11, 23], [12, 24]], ['left arm', [11, 13, 15]], ['right arm', [12, 14, 16]],
  ['left leg', [23, 25, 27]], ['right leg', [24, 26, 28]], ['shoulders', [11, 12]], ['hips', [23, 24]]
];

/** Pose landmarks → named limb polylines in artboard units (visibility-filtered). */
export async function detectPose(img, { width, height }) {
  const lm = await task('pose');
  const res = lm.detect(img);
  const map = mapper(img, width, height);
  return (res.landmarks || []).map(pts => {
    const P = i => (pts[i] && (pts[i].visibility ?? 1) > 0.4 ? map(pts[i].x, pts[i].y) : null);
    const limbs = [];
    for (const [name, a, b] of POSE_LIMBS) {
      if (b) { const m = [P(a[0]) && P(b[0]) ? mid(P(a[0]), P(b[0])) : null, P(a[1]) && P(b[1]) ? mid(P(a[1]), P(b[1])) : null]; if (m.every(Boolean)) limbs.push({ name, points: m }); continue; }
      const line = a.map(P);
      if (line.every(Boolean)) limbs.push({ name, points: line });
    }
    const head = P(0);
    return { limbs, head };
  });
}

const mid = (a, b) => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];

/** Figure mask (people) → coverage share and a coarse outline polygon in artboard units. */
export async function detectFigure(img, { width, height }) {
  const seg = await task('segment');
  const res = seg.segment(img);
  const mask = res.confidenceMasks?.[0];
  if (!mask) return null;
  const w = mask.width, h = mask.height, data = mask.getAsFloat32Array();
  let count = 0;
  for (const v of data) if (v > 0.5) count++;
  // Outline: for each row, leftmost/rightmost inside points, walked down the left and up the right.
  const left = [], right = [];
  for (let y = 0; y < h; y += Math.max(1, Math.round(h / 60))) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (data[y * w + x] > 0.5) { if (a < 0) a = x; b = x; }
    if (a >= 0) { left.push([a / w, y / h]); right.push([b / w, y / h]); }
  }
  mask.close?.();
  const map = mapper(img, width, height);
  const outline = [...left, ...right.reverse()].map(([u, v]) => map(u, v));
  return { share: count / (w * h), outline: outline.length >= 3 ? outline : null };
}

/**
 * Raw results for streams, normalized to the picture (0..1): whatever the kind's tracker reads (pose:
 * 33 landmarks per person; hands: 21 per hand; face: 478 points and expressions; mask: a confidence grid).
 */
export async function detectRaw(kind, img, { stream = null, t = 0, full = false } = {}) {
  const tr = TRACKERS[kind];
  if (!tr) return null;
  // A stream (a camera, a video, an animated image) is tracked in video mode: steadier, and faster.
  const tk = await task(kind, stream ? 'VIDEO' : 'IMAGE', stream || '', full);
  return tr.read(stream ? tk[tr.video](img, t) : tk[tr.image](img));
}

/** The kinds of tracker there are. */
export const trackerKinds = () => Object.keys(TRACKERS);
