// Webcam / video -> one "frame" of landmarks in the shared format (see body.js).
import { PoseLandmarker, HandLandmarker, FaceLandmarker } from 'mediapipe';
import { assetUrl } from './assets.js';

const MP = 'vendor/mediapipe/';
// Round to 3 decimals: small recordings, no visible loss.
const r3 = v => Math.round(v * 1000) / 1000;
const pt = (l, vis) => vis ? [r3(l.x), r3(l.y), r3(l.z), r3(l.visibility ?? 0)] : [r3(l.x), r3(l.y), r3(l.z)];

export async function createTracker({ pose = true, hands = true, face = true, mask = false } = {}) {
  // the runtime is two files: a loader script and the wasm binary (a fileset is just these two paths)
  const fileset = { wasmLoaderPath: assetUrl(MP + 'wasm/vision_wasm_internal.js'), wasmBinaryPath: assetUrl(MP + 'wasm/vision_wasm_internal.wasm') };
  // @key Create a landmarker | GPU delegate first; fall back to CPU. The same helper builds pose, hands and face.
  const make = async (Cls, file, opts) => {
    for (const delegate of ['GPU', 'CPU']) {
      try { return await Cls.createFromOptions(fileset, { baseOptions: { modelAssetPath: assetUrl(MP + 'models/' + file), delegate }, runningMode: 'VIDEO', ...opts }); }
      catch (e) { if (delegate === 'CPU') throw e; }
    }
  };
  // @/key
  const P = pose ? await make(PoseLandmarker, 'pose_landmarker_full.task', { numPoses: 1, outputSegmentationMasks: mask }) : null;
  const H = hands ? await make(HandLandmarker, 'hand_landmarker.task', { numHands: 2 }) : null;
  const F = face ? await make(FaceLandmarker, 'face_landmarker.task', { numFaces: 1 }) : null;
  let last = 0;
  const self = {
    mask: null,   // latest person mask { data: Float32Array 0..1, width, height } when created with mask: true
    // t is the clip/capture time in seconds, kept in the frame; MediaPipe gets its own always-increasing clock
    detect(video, t) {
      // @key MediaPipe's clock | VIDEO mode wants strictly increasing timestamps, so it gets its own clock; the frame keeps the clip time.
      const ts = Math.max(last + 1, performance.now()); last = ts;
      // @/key
      const p = P?.detectForVideo(video, ts);
      if (mask && p?.segmentationMasks?.length) { const m = p.segmentationMasks[0]; self.mask = { data: new Float32Array(m.getAsFloat32Array()), width: m.width, height: m.height }; p.segmentationMasks.forEach(x => x.close()); }
      if (!p?.landmarks?.length) return { t, pose: null, world: null, hands: { left: null, right: null }, face: null };
      const pl = p.landmarks[0], wl = p.worldLandmarks[0];
      const out = { t: r3(t), pose: pl.map(l => pt(l, true)), world: wl.map(l => pt(l)), hands: { left: null, right: null }, face: null };
      const h = H?.detectForVideo(video, ts);
      // @key Which hand is which | Compare each hand's wrist to the pose wrists: robust whether the image is mirrored or not.
      // label hands by the pose wrist they sit nearest
      for (const hl of h?.landmarks ?? []) {
        const w = hl[0], d = i => Math.hypot(pl[i].x - w.x, pl[i].y - w.y);
        const side = d(15) < d(16) ? 'left' : 'right';
        if (!out.hands[side]) out.hands[side] = hl.map(l => pt(l));
      }
      // @/key
      const f = F?.detectForVideo(video, ts);
      if (f?.faceLandmarks?.length) out.face = f.faceLandmarks[0].map(l => pt(l));
      return out;
    },
  };
  return self;
}

export { PoseLandmarker, HandLandmarker };
