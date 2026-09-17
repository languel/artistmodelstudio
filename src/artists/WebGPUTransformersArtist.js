/**
 * WebGPU Transformers.js Artist
 *
 * Runs client-side language models entirely in the browser using
 * WebGPU acceleration via @huggingface/transformers.
 */

import { Artist } from './Artist.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { normalizeProgram } from '../language/normalize.js';

let pipelineInstance = null;
let currentModelId = null;

export const WEBGPU_MODEL_PRESETS = [
  { id: 'HuggingFaceTB/SmolLM-360M-Instruct', name: 'SmolLM 360M (Fast, ~200MB)' },
  { id: 'onnx-community/Qwen2.5-0.5B-Instruct', name: 'Qwen 2.5 0.5B (~350MB)' },
  { id: 'onnx-community/gemma-2-2b-it', name: 'Gemma 2 2B (~1.5GB, High VRAM)' }
];

export class WebGPUTransformersArtist extends Artist {
  constructor(options = {}) {
    super(options.id || 'webgpu', options.name || 'In-Browser WebGPU (Transformers.js)', 'webgpu');
    this.modelId = options.modelId || 'HuggingFaceTB/SmolLM-360M-Instruct';
    this.dtype = options.dtype || 'q4';
    this.onProgress = options.onProgress || null;
    this.isLoading = false;
    this.isReady = false;
    this.device = this.checkWebGPUSupport() ? 'webgpu' : 'wasm';
  }

  checkWebGPUSupport() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  async initPipeline(modelId = this.modelId, progressCallback = null) {
    if (pipelineInstance && currentModelId === modelId) {
      return pipelineInstance;
    }

    this.isLoading = true;
    try {
      const { pipeline } = await import('@huggingface/transformers');
      pipelineInstance = await pipeline('text-generation', modelId, {
        device: this.device,
        dtype: this.dtype,
        progress_callback: (progress) => {
          if (progressCallback) progressCallback(progress);
          if (this.onProgress) this.onProgress(progress);
        }
      });
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

  async generate(request) {
    const count = request.count || 4;
    const systemPrompt = buildSystemPrompt(request.mediumCapabilities);
    const userPrompt = buildUserPrompt(request);

    const candidates = [];

    // Ensure pipeline is ready
    if (!pipelineInstance || currentModelId !== (request.settings?.modelId || this.modelId)) {
      await this.initPipeline(request.settings?.modelId || this.modelId, request.onProgress);
    }

    for (let i = 0; i < count; i++) {
      const startTime = performance.now();
      const warnings = [];
      let rawText = '';
      let parsed = null;

      try {
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ];

        const output = await pipelineInstance(messages, {
          max_new_tokens: request.settings?.maxTokens || 600,
          temperature: (request.settings?.temperature || 0.7) + (i * 0.05),
          do_sample: true
        });

        // output format is typically [{ generated_text: [...] }]
        if (Array.isArray(output) && output[0]?.generated_text) {
          const gen = output[0].generated_text;
          const lastMsg = Array.isArray(gen) ? gen[gen.length - 1] : gen;
          rawText = typeof lastMsg === 'object' ? lastMsg.content : String(lastMsg);
        } else {
          rawText = JSON.stringify(output);
        }

        parsed = this.extractJSON(rawText, warnings);
      } catch (err) {
        warnings.push(`WebGPU inference error: ${err.message}`);
      }

      const generationTimeMs = Math.round(performance.now() - startTime);

      candidates.push({
        program: normalizeProgram(parsed),
        generationTimeMs,
        rawResponse: rawText,
        warnings
      });
    }

    return candidates;
  }

  extractJSON(text, warnings) {
    if (!text) return null;
    let clean = text.trim();

    const codeMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeMatch) clean = codeMatch[1].trim();

    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const jsonCandidate = clean.slice(start, end + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (e) {
        // try removing trailing commas
        try {
          return JSON.parse(jsonCandidate.replace(/,\s*([}\]])/g, '$1'));
        } catch (e2) {
          warnings.push(`WebGPU JSON parse warning: ${e2.message}`);
        }
      }
    }

    warnings.push('Model response did not contain valid JSON.');
    return null;
  }
}
