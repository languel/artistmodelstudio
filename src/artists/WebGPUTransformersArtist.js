/**
 * WebGPU Transformers.js Artist
 *
 * Runs client-side language models entirely in the browser using
 * WebGPU acceleration via @huggingface/transformers.
 */

import { IMAGE_NOTE, DESCRIBE_INSTRUCTION } from './imagePrompt.js';
import { Artist } from './Artist.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { normalizeProgram, parseModelOutput } from '../language/normalize.js';

let pipelineInstance = null;

/**
 * Vision-language models (LFM2.5-VL) aren't text-generation pipelines: load the
 * processor and model directly and wrap them in a pipeline-shaped function
 * (messages, config) => [{ generated_text }]. Prompts here are text-only.
 */
async function loadVisionLanguage(modelId, options) {
  const { AutoProcessor, AutoModelForImageTextToText, RawImage } = await import('@huggingface/transformers');
  const quant = options.dtype || 'q4f16';
  const processor = await AutoProcessor.from_pretrained(modelId, { progress_callback: options.progress_callback });
  const model = await AutoModelForImageTextToText.from_pretrained(modelId, {
    device: options.device,
    // Recommended split: small fp16 embeddings and vision encoder, quantized decoder.
    dtype: { embed_tokens: 'fp16', vision_encoder: 'fp16', decoder_model_merged: quant },
    progress_callback: options.progress_callback
  });
  let blank = null;
  const run = async (messages, config = {}) => {
    const last = messages[messages.length - 1];
    const imagePart = Array.isArray(last?.content) ? last.content.find(c => c.type === 'image' && c.image) : null;
    if (imagePart) {
      // Image prompt: the processor pairs the image with the {type:'image'} slot in the template.
      const templ = messages.map(m => (Array.isArray(m.content) ? { ...m, content: m.content.map(c => (c.type === 'image' ? { type: 'image' } : c)) } : m));
      const prompt = processor.apply_chat_template(templ, { add_generation_prompt: true });
      const image = await RawImage.fromURL(imagePart.image);
      const inputs = await processor(image, prompt, { add_special_tokens: false });
      const outputs = await model.generate({ ...inputs, ...config });
      const text = processor.batch_decode(outputs.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true })[0];
      return [{ generated_text: [...messages, { role: 'assistant', content: text }] }];
    }
    const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
    let inputs, outputs;
    try {
      inputs = processor.tokenizer(prompt, { add_special_tokens: false });
      outputs = await model.generate({ ...inputs, ...config });
    } catch (err) {
      // Some builds need an image input: pass a tiny blank one.
      blank ||= new RawImage(new Uint8ClampedArray(64 * 64 * 3).fill(255), 64, 64, 3);
      const withImage = messages.map((m, i) => (i === messages.length - 1 && m.role === 'user'
        ? { ...m, content: [{ type: 'image' }, { type: 'text', text: m.content }] } : m));
      const p2 = processor.apply_chat_template(withImage, { add_generation_prompt: true });
      inputs = await processor(blank, p2, { add_special_tokens: false });
      outputs = await model.generate({ ...inputs, ...config });
    }
    const text = processor.batch_decode(outputs.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true })[0];
    return [{ generated_text: [...messages, { role: 'assistant', content: text }] }];
  };
  return run;
}
let currentModelId = null;

export const WEBGPU_MODEL_PRESETS = [
  // Liquid AI (Edge & WebGPU Optimized - Recommended)
  {
    id: 'onnx-community/LFM2-350M-ONNX',
    name: 'LFM2 350M (Ultra Fast, ~312MB) ',
    group: 'Liquid AI (Edge & WebGPU Optimized)',
    isDefault: true,
    isLiquid: true,
    size: '~312MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/LFM2.5-350M-ONNX',
    name: 'LFM2.5 350M (Latest Hybrid Edge, ~300MB)',
    group: 'Liquid AI (Edge & WebGPU Optimized)',
    isLiquid: true,
    size: '~300MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/LFM2.5-VL-450M-ONNX',
    name: 'LFM2.5-VL 450M (Vision-Language Ultra-Light, ~450MB)',
    group: 'Liquid AI (Edge & WebGPU Optimized)',
    isLiquid: true,
    isVL: true,
    size: '~450MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/LFM2-700M-ONNX',
    name: 'LFM2 700M (Balanced, ~579MB)',
    group: 'Liquid AI (Edge & WebGPU Optimized)',
    isLiquid: true,
    size: '~579MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/LFM2-1.2B-ONNX',
    name: 'LFM2 1.2B (High Quality Edge, ~868MB)',
    group: 'Liquid AI (Edge & WebGPU Optimized)',
    isLiquid: true,
    size: '~868MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'LiquidAI/LFM2.5-1.2B-Instruct-ONNX',
    name: 'LFM2.5 1.2B Instruct (~900MB)',
    group: 'Liquid AI (Edge & WebGPU Optimized)',
    isLiquid: true,
    size: '~900MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'LiquidAI/LFM2.5-VL-3B-ONNX',
    name: 'LFM2.5-VL 3B (Flagship Multimodal, ~2.2GB)',
    group: 'Liquid AI (Edge & WebGPU Optimized)',
    isLiquid: true,
    isVL: true,
    size: '~2.2GB',
    recommendedDtype: 'q4f16'
  },

  // Gemma 4 (WebGPU Kernel Accelerated)
  {
    id: 'google/gemma-4-E2B-it-qat-mobile-transformers',
    name: 'Gemma 4 E2B (QAT Mobile · WebGPU Kernels, ~980MB) ',
    group: 'Gemma 4 (WebGPU Kernel Accelerated)',
    isGemma4: true,
    size: '~980MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/gemma-4-E2B-it-webgpu',
    name: 'Gemma 4 E2B WebGPU (~1.1GB)',
    group: 'Gemma 4 (WebGPU Kernel Accelerated)',
    isGemma4: true,
    size: '~1.1GB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/gemma-2-2b-it',
    name: 'Gemma 2 2B (Classic ONNX, ~1.5GB)',
    group: 'Gemma 4 (WebGPU Kernel Accelerated)',
    size: '~1.5GB',
    recommendedDtype: 'q4f16'
  },

  // Qwen 3.5 (In-Browser WebGPU)
  {
    id: 'onnx-community/Qwen3.5-0.8B-ONNX-OPT',
    name: 'Qwen 3.5 0.8B (Optimized WebGPU, ~550MB) ',
    group: 'Qwen 3.5 (In-Browser WebGPU)',
    isQwen35: true,
    size: '~550MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/Qwen3.5-2B-ONNX-OPT',
    name: 'Qwen 3.5 2B (Optimized WebGPU, ~1.3GB)',
    group: 'Qwen 3.5 (In-Browser WebGPU)',
    isQwen35: true,
    size: '~1.3GB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/Qwen3.5-4B-ONNX-OPT',
    name: 'Qwen 3.5 4B (Optimized WebGPU, ~2.6GB)',
    group: 'Qwen 3.5 (In-Browser WebGPU)',
    isQwen35: true,
    size: '~2.6GB',
    recommendedDtype: 'q4'
  },
  {
    id: 'onnx-community/Qwen3.5-0.8B-ONNX',
    name: 'Qwen 3.5 0.8B (Standard ONNX, ~600MB)',
    group: 'Qwen 3.5 (In-Browser WebGPU)',
    isQwen35: true,
    size: '~600MB',
    recommendedDtype: 'q4f16'
  },
  {
    id: 'onnx-community/Qwen3.5-2B-ONNX',
    name: 'Qwen 3.5 2B (Standard ONNX, ~1.4GB)',
    group: 'Qwen 3.5 (In-Browser WebGPU)',
    isQwen35: true,
    size: '~1.4GB',
    recommendedDtype: 'q4f16'
  },

  // Ultra-Lightweight (< 400MB)
  { id: 'HuggingFaceTB/SmolLM2-135M-Instruct', name: 'SmolLM2 135M (Ultra Fast, ~100MB)', group: 'Ultra-Lightweight (<400MB)' },
  { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', name: 'SmolLM2 360M (Fast Balanced, ~250MB)', group: 'Ultra-Lightweight (<400MB)' },
  { id: 'HuggingFaceTB/SmolLM-360M-Instruct', name: 'SmolLM 360M (Classic, ~200MB)', group: 'Ultra-Lightweight (<400MB)' },
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct', name: 'Qwen 2.5 0.5B (~350MB)', group: 'Ultra-Lightweight (<400MB)' },
  { id: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct', name: 'Qwen 2.5 Coder 0.5B (Code Specialized, ~350MB)', group: 'Ultra-Lightweight (<400MB)' },

  // Midweight & Code Specialists (~700MB – 1.2GB)
  { id: 'onnx-community/Qwen2.5-Coder-1.5B-Instruct', name: 'Qwen 2.5 Coder 1.5B (High Capability Code, ~1GB)', group: 'Midweight & Code Specialists (~1GB)' },
  { id: 'onnx-community/Qwen2.5-1.5B-Instruct', name: 'Qwen 2.5 1.5B (High Quality, ~1GB)', group: 'Midweight & Code Specialists (~1GB)' },
  { id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct', name: 'SmolLM2 1.7B (High Quality, ~1GB)', group: 'Midweight & Code Specialists (~1GB)' },
  { id: 'onnx-community/Llama-3.2-1B-Instruct', name: 'Llama 3.2 1B (Meta Open Weights, ~700MB)', group: 'Midweight & Code Specialists (~1GB)' },
  { id: 'onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX', name: 'DeepSeek R1 Distill Qwen 1.5B (Reasoning, ~1GB)', group: 'Midweight & Code Specialists (~1GB)' },

  // High VRAM & Frontier (1.5GB – 3B)
  { id: 'onnx-community/Llama-3.2-3B-Instruct', name: 'Llama 3.2 3B (Meta High VRAM, ~1.8GB)', group: 'High VRAM / 2B+ Models' }
];

export class WebGPUTransformersArtist extends Artist {
  constructor(options = {}) {
    super(options.id || 'webgpu', options.name || 'WebGPU (Browser)', 'webgpu');
    this.modelId = options.modelId || (typeof localStorage !== 'undefined' && localStorage.getItem('ams_webgpu_model')) || 'onnx-community/LFM2-350M-ONNX';
    this.dtype = options.dtype || null; // dynamic detection
    this.onProgress = options.onProgress || null;
    this.isLoading = false;
    this.isReady = false;
    this.device = this.checkWebGPUSupport() ? 'webgpu' : 'wasm';
    this.activeDtype = null;
  }

  getModel() {
    return this.modelId;
  }

  setModel(modelId) {
    if (!modelId) return;
    this.modelId = modelId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ams_webgpu_model', modelId);
    }
  }

  getAvailableModels() {
    const list = [...WEBGPU_MODEL_PRESETS];
    if (this.modelId && !list.some(p => p.id === this.modelId)) {
      list.push({ id: this.modelId, name: `Custom ONNX (${this.modelId})`, group: 'Custom ONNX Models' });
    }
    return list;
  }

  checkWebGPUSupport() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  async detectOptimalDtype(modelPreset) {
    if (this.dtype) return this.dtype;
    if (this.device !== 'webgpu' || typeof navigator === 'undefined' || !navigator.gpu) {
      return 'q4';
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter?.features?.has('shader-f16')) {
        // shader-f16 is available; q4f16 provides 2x throughput on Apple Silicon & modern GPUs
        return modelPreset?.recommendedDtype || 'q4f16';
      }
    } catch {
      // Fallback
    }

    return 'q4';
  }

  async initPipeline(modelId = this.modelId, progressCallback = null) {
    if (pipelineInstance && currentModelId === modelId) {
      return pipelineInstance;
    }

    this.isLoading = true;
    try {
      const { pipeline, env } = await import('@huggingface/transformers');

      // Optimize ONNX Runtime WebGPU environment
      if (env?.backends?.onnx) {
        env.backends.onnx.logLevel = 'warning';
        if (env.backends.onnx.webgpu) {
          env.backends.onnx.webgpu.powerPreference = 'high-performance';
        }
      }

      const preset = WEBGPU_MODEL_PRESETS.find(p => p.id === modelId);
      const chosenDtype = await this.detectOptimalDtype(preset);
      this.activeDtype = chosenDtype;

      // In-browser transformers.js pipelines generate procedural drawing code via text-generation
      const task = 'text-generation';

      const options = {
        device: this.device,
        dtype: chosenDtype,
        progress_callback: (progress) => {
          if (progressCallback) progressCallback(progress);
          if (this.onProgress) this.onProgress(progress);
        }
      };

      try {
        pipelineInstance = preset?.isVL
          ? await loadVisionLanguage(modelId, options)
          : await pipeline(task, modelId, options);
      } catch (firstErr) {
        // If q4f16 failed, fallback to standard q4
        if (chosenDtype === 'q4f16') {
          console.warn(`[WebGPU] q4f16 pipeline failed for ${modelId}, falling back to q4:`, firstErr);
          this.activeDtype = 'q4';
          options.dtype = 'q4';
          pipelineInstance = preset?.isVL ? await loadVisionLanguage(modelId, options) : await pipeline(task, modelId, options);
        } else {
          throw firstErr;
        }
      }

      currentModelId = modelId;
      this.isReady = true;
      return pipelineInstance;
    } catch (err) {
      console.error('Failed to initialize WebGPU pipeline:', err);
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  /** One completion with the in-browser model: { system, user, image?, temperature } → text. */
  async complete({ system, user, image = null, temperature = 0.7, maxTokens = 1500 } = {}) {
    const preset = WEBGPU_MODEL_PRESETS.find(p => p.id === this.modelId);
    const pipe = await this.initPipeline(this.modelId, this.onProgress);
    const userMsg = image && preset?.isVL ? { role: 'user', content: [{ type: 'image', image }, { type: 'text', text: user }] } : { role: 'user', content: user };
    const out = await pipe([...(system ? [{ role: 'system', content: system }] : []), userMsg], { max_new_tokens: maxTokens, temperature, do_sample: temperature > 0 });
    const gen = out[0]?.generated_text;
    const last = Array.isArray(gen) ? gen[gen.length - 1] : gen;
    return String(typeof last === 'object' ? last.content : last || '');
  }

  /** Describe an image with a vision-language model (LFM2.5-VL). */
  async describe(image) {
    const preset = WEBGPU_MODEL_PRESETS.find(p => p.id === this.modelId);
    if (!preset?.isVL) throw new Error('Pick a vision-language model (LFM2.5-VL) to describe images');
    const pipe = await this.initPipeline(this.modelId);
    const out = await pipe([{ role: 'user', content: [{ type: 'image', image }, { type: 'text', text: DESCRIBE_INSTRUCTION }] }], { max_new_tokens: 120, do_sample: false });
    return String(out[0].generated_text.at(-1).content || '').trim();
  }

  async preloadModel(modelId = this.modelId, progressCallback = null) {
    return this.initPipeline(modelId, (p) => {
      const shardName = p.file ? p.file.split('/').pop() : '';
      const loadedMB = p.loaded ? (p.loaded / (1024 * 1024)).toFixed(1) : '0.0';
      const totalMB = p.total ? (p.total / (1024 * 1024)).toFixed(1) : null;
      const pct = Math.round(p.progress || (p.status === 'ready' || p.status === 'done' ? 100 : 0));
      const progressDetail = totalMB ? `${pct}% · ${loadedMB}/${totalMB} MB` : `${pct}%`;
      const msg = p.file ? `Loading ${shardName}: ${progressDetail}` : (p.message || 'Preparing weights...');

      progressCallback?.({
        status: p.status,
        model: modelId,
        file: p.file,
        shardName,
        progress: pct,
        loadedMB,
        totalMB,
        message: msg
      });
    });
  }

  async generate(request) {
    const count = request.count || 4;
    const targetModel = request.settings?.modelId || this.modelId;
    const preset = WEBGPU_MODEL_PRESETS.find(p => p.id === targetModel);
    const isLiquid = Boolean(preset?.isLiquid || targetModel.includes('LFM'));
    const isEdgeModel = Boolean(isLiquid || preset?.size?.includes('MB') || targetModel.includes('350M') || targetModel.includes('135M') || targetModel.includes('450M') || targetModel.includes('0.5B') || targetModel.includes('700M') || targetModel.includes('1.2B'));

    const systemPrompt = buildSystemPrompt(request.mediumCapabilities, { compact: isEdgeModel });
    const userPrompt = buildUserPrompt(request, { compact: isEdgeModel });

    request.onProgress?.({
      type: 'start',
      model: targetModel,
      endpoint: `webgpu (${this.device}) · ${this.activeDtype || 'q4'}`,
      totalCandidates: count,
      message: `Preparing WebGPU pipeline for ${targetModel} on ${this.device} (${this.activeDtype || 'detecting precision'})...`
    });

    const candidates = [];

    // Ensure pipeline is ready
    if (!pipelineInstance || currentModelId !== targetModel) {
      request.onProgress?.({
        type: 'loading_model',
        model: targetModel,
        message: `Downloading/loading weights for ${targetModel}...`
      });

      await this.initPipeline(targetModel, (p) => {
        const shardName = p.file ? p.file.split('/').pop() : '';
        const loadedMB = p.loaded ? (p.loaded / (1024 * 1024)).toFixed(1) : '0.0';
        const totalMB = p.total ? (p.total / (1024 * 1024)).toFixed(1) : null;
        const pct = Math.round(p.progress || (p.status === 'ready' || p.status === 'done' ? 100 : 0));
        const progressDetail = totalMB ? `${pct}% · ${loadedMB}/${totalMB} MB` : `${pct}%`;
        const msg = p.file ? `Loading ${shardName}: ${progressDetail}` : (p.message || 'Preparing weights...');

        request.onProgress?.({
          type: 'download_progress',
          model: targetModel,
          file: p.file,
          shardName,
          progress: pct,
          loadedMB,
          totalMB,
          status: p.status,
          message: msg
        });
      });

      request.onProgress?.({
        type: 'model_ready',
        model: targetModel,
        message: `Model ${targetModel} initialized and ready on WebGPU!`
      });
    }

    for (let i = 0; i < count; i++) {
      if (request.signal?.aborted) {
        request.onProgress?.({
          type: 'aborted',
          candidateIndex: i,
          message: `Generation interrupted after ${candidates.length} candidate(s).`
        });
        break;
      }

      request.onProgress?.({
        type: 'candidate_start',
        candidateIndex: i,
        model: targetModel,
        message: `WebGPU inferencing Candidate ${String.fromCharCode(65 + i)} (${i + 1}/${count})...`
      });

      const startTime = performance.now();
      const warnings = [];
      let rawText = '';
      let program = null;

      try {
        const withImage = Boolean(request.image && preset?.isVL);
        if (request.image && !preset?.isVL && i === 0) warnings.push('This model has no image input; the reference image was not sent.');
        const messages = [
          { role: 'system', content: systemPrompt },
          withImage
            ? { role: 'user', content: [{ type: 'image', image: request.image }, { type: 'text', text: `${userPrompt}\n\n${IMAGE_NOTE}` }] }
            : { role: 'user', content: userPrompt }
        ];

        const temperature = isLiquid
          ? (request.settings?.temperature ? Math.min(request.settings.temperature, 0.45) : 0.3) + (i * 0.03)
          : (request.settings?.temperature || 0.7) + (i * 0.05);

        const genConfig = {
          max_new_tokens: request.settings?.maxTokens || 896,
          temperature,
          do_sample: true,
          repetition_penalty: isLiquid ? 1.05 : 1.0,
          top_p: isLiquid ? 0.85 : 0.95
        };

        const output = await pipelineInstance(messages, genConfig);

        if (Array.isArray(output) && output[0]?.generated_text) {
          const gen = output[0].generated_text;
          const lastMsg = Array.isArray(gen) ? gen[gen.length - 1] : gen;
          rawText = typeof lastMsg === 'object' ? lastMsg.content : String(lastMsg);
        } else {
          rawText = JSON.stringify(output);
        }

        program = parseModelOutput(rawText, warnings);
      } catch (err) {
        warnings.push(`WebGPU inference error: ${err.message}`);
        program = { version: 1, actions: [] };
      }

      const generationTimeMs = Math.round(performance.now() - startTime);
      const candObj = {
        program,
        generationTimeMs,
        rawResponse: rawText,
        warnings
      };

      candidates.push(candObj);

      request.onCandidateComplete?.({
        candidateIndex: i,
        candidate: candObj
      });
    }

    return candidates;
  }
}
