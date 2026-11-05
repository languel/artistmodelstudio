/**
 * Browser only: everything runs in this page on the person's own GPU, with nothing to install and no server (for students who do not
 * want to manage Ollama). Two tiers, picked from what the lesson test showed (docs/quick-commands.md):
 *   conversation, commands, drawing and voice: LFM3-Omni 2B (about 1.6 GB, Liquid's own WebGPU runtime)
 *   writing board code: a coder in transformers.js: Light, Qwen2.5-Coder 1.5B (about 1 GB, 10/14); Standard, Qwen3 4B Instruct 2507
 *   (about 2.1 GB, 12/14). Each downloads the first time it is used, and the browser keeps it.
 */
import { useModel, setCodeTarget } from './modelStore.js';
import { LFM3_MODEL } from '../artists/Lfm3WebGPUArtist.js';

export const BROWSER_TIERS = {
  light: { label: 'Light', code: 'onnx-community/Qwen2.5-Coder-1.5B-Instruct', codeName: 'Qwen2.5-Coder 1.5B', gb: 2.6, score: '10/14' },
  standard: { label: 'Standard', code: 'onnx-community/Qwen3-4B-Instruct-2507-ONNX', codeName: 'Qwen3 4B Instruct', gb: 3.7, score: '12/14' }
};

export const hasWebGPU = () => typeof navigator !== 'undefined' && Boolean(navigator.gpu);

/** Switch the assistant to the browser models. → the tier used */
export function browserSetup(app, tier = 'standard') {
  const t = BROWSER_TIERS[tier] || BROWSER_TIERS.standard;
  useModel(app, 'lfm3', LFM3_MODEL);
  app.artists.get('webgpu')?.setModel?.(t.code);
  setCodeTarget('webgpu', t.code);
  return BROWSER_TIERS[tier] ? tier : 'standard';
}
