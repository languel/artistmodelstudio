/**
 * MediaPipe (Tasks Vision) for the reference: pose landmarks and a figure mask.
 * Loaded on demand from the jsDelivr CDN; models from Google's MediaPipe storage.
 * Returns artboard-space results so they can become guides, gestures and regions.
 */
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODELS = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  segment: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
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

async function task(kind) {
  if (cache[kind]) return cache[kind];
  const { mod, fileset } = await load();
  if (kind === 'pose') cache.pose = await mod.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELS.pose, delegate: 'GPU' }, runningMode: 'IMAGE', numPoses: 2 });
  if (kind === 'segment') cache.segment = await mod.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELS.segment, delegate: 'GPU' }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true });
  return cache[kind];
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
