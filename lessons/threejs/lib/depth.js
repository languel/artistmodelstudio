// Monocular depth (Depth Anything V2 small, int8) through transformers.js, run locally from vendor/depth.
// estimate(source) -> { data: Float32Array 0..1 (1 = nearest), width, height }. Relative, not metres.
import { env, AutoModel, Tensor } from '../vendor/depth/transformers.min.js';

env.allowRemoteModels = false; env.allowLocalModels = true;
env.localModelPath = new URL('../vendor/depth/models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/depth/ort/', import.meta.url).href;

export async function createDepth({ width, height, device } = {}) {  // sizes are multiples of 14
  const dev = device || (navigator.gpu ? 'webgpu' : 'wasm');
  // webgpu can afford a finer map; the wasm fallback blocks the page while it runs, so keep it small
  if (!width) [width, height] = dev === 'webgpu' ? [252, 196] : [168, 126];
  let model, used = dev;
  try { model = await AutoModel.from_pretrained('onnx-community/depth-anything-v2-small', { dtype: 'q8', device: dev }); }
  catch (e) { if (dev === 'wasm') throw e; used = 'wasm'; model = await AutoModel.from_pretrained('onnx-community/depth-anything-v2-small', { dtype: 'q8', device: 'wasm' }); }
  const cv = new OffscreenCanvas(width, height), cx = cv.getContext('2d', { willReadFrequently: true });
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225], n = width * height;
  let lo = 0, hi = 1, first = true;
  return {
    device: used, width, height,
    async estimate(source) {
      cx.drawImage(source, 0, 0, width, height);
      const px = cx.getImageData(0, 0, width, height).data, input = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) input[c * n + i] = (px[i * 4 + c] / 255 - mean[c]) / std[c];
      const { predicted_depth } = await model({ pixel_values: new Tensor('float32', input, [1, 3, height, width]) });
      const d = predicted_depth.data; let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < d.length; i++) { if (d[i] < mn) mn = d[i]; if (d[i] > mx) mx = d[i]; }
      // the model's range drifts frame to frame; smooth the normalisation so pins do not breathe
      if (first) { lo = mn; hi = mx; first = false; } else { lo += (mn - lo) * 0.15; hi += (mx - hi) * 0.15; }
      const out = new Float32Array(d.length), k = 1 / Math.max(1e-6, hi - lo);
      for (let i = 0; i < d.length; i++) out[i] = Math.min(1, Math.max(0, (d[i] - lo) * k));
      return { data: out, width: predicted_depth.dims.at(-1), height: predicted_depth.dims.at(-2) };
    },
  };
}
