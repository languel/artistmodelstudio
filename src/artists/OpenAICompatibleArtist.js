/**
 * OpenAI-Compatible Artist
 *
 * Connects to OpenAI or any OpenAI-compatible API endpoint:
 * - Official OpenAI (GPT-4o, GPT-4o-mini, o3-mini)
 * - ChatGPT subscription reverse proxies / bearer auth
 * - Local inference engines (LM Studio at http://localhost:1234/v1, LocalAI, vLLM)
 * - Cloud providers with OpenAI compatibility (Groq, DeepSeek, Together AI)
 *
 * Supports SSE token streaming, live partial-action canvas painting,
 * throughput tracking, and cancellation.
 */

import { openAIContent, IMAGE_NOTE, DESCRIBE_INSTRUCTION } from './imagePrompt.js';
import { Artist } from './Artist.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { normalizeProgram, parseModelOutput } from '../language/normalize.js';
import { extractPartialActions } from '../language/streaming.js';

export const OPENAI_MODEL_PRESETS = [
  { id: 'gpt-4o', name: 'OpenAI GPT-4o (Frontier Multimodal)' },
  { id: 'gpt-4o-mini', name: 'OpenAI GPT-4o Mini (Fast & Affordable)' },
  { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest (Subscription Dynamic)' },
  { id: 'o3-mini', name: 'OpenAI o3-mini (Reasoning Creative Coder)' },
  { id: 'deepseek-chat', name: 'DeepSeek V3 (OpenAI Compatible)' },
  { id: 'llama-3.3-70b-versatile', name: 'Groq Llama 3.3 70B (Fast Inference)' }
];

function getStorage(key, fallback = '') {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(key)) || fallback;
  } catch (e) {
    return fallback;
  }
}

export class OpenAICompatibleArtist extends Artist {
  constructor(options = {}) {
    super(options.id || 'openai', options.name || 'OpenAI / ChatGPT', 'cloud');
    this.baseURL = options.baseURL || getStorage('ams_openai_base_url', 'https://api.openai.com/v1');
    this.apiKey = options.apiKey || getStorage('ams_openai_key') || '';
    this.model = options.model || getStorage('ams_openai_model', 'gpt-4o');
    this.customHeaders = options.customHeaders || getStorage('ams_openai_headers') || '';
    this.temperature = options.temperature ?? 0.8;
  }

  getModel() {
    return this.model;
  }

  setModel(modelId) {
    if (!modelId) return;
    this.model = modelId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ams_openai_model', modelId);
    }
  }

  getAvailableModels() {
    const list = [...OPENAI_MODEL_PRESETS];
    if (this.model && !list.some(p => p.id === this.model)) {
      list.push({ id: this.model, name: `Custom (${this.model})` });
    }
    return list;
  }

  getEndpoint() {
    const base = (this.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

  async generate(request) {
    const count = request.count || 4;
    const systemPrompt = buildSystemPrompt(request.mediumCapabilities);
    
    // Resolve dynamic settings
    const targetModel = request.settings?.model || getStorage('ams_openai_model') || this.model || 'gpt-4o';
    const apiKey = request.settings?.apiKey || getStorage('ams_openai_key') || this.apiKey;
    const baseURL = request.settings?.baseURL || getStorage('ams_openai_base_url') || this.baseURL || 'https://api.openai.com/v1';
    const customHeadersStr = request.settings?.customHeaders || getStorage('ams_openai_headers') || this.customHeaders;

    this.baseURL = baseURL;
    const endpoint = this.getEndpoint();

    if (!apiKey && !endpoint.includes('localhost') && !endpoint.includes('127.0.0.1')) {
      const errorMsg = 'OpenAI API key or Bearer token is missing. Click Settings to enter your API key.';
      request.onProgress?.({ type: 'error', error: errorMsg, message: errorMsg });
      throw new Error(errorMsg);
    }

    let parsedCustomHeaders = {};
    if (customHeadersStr) {
      try {
        parsedCustomHeaders = typeof customHeadersStr === 'object' ? customHeadersStr : JSON.parse(customHeadersStr);
      } catch (e) {
        console.warn('Could not parse custom headers as JSON:', e);
      }
    }

    request.onProgress?.({
      type: 'start',
      model: targetModel,
      endpoint: endpoint,
      totalCandidates: count,
      message: `Connecting to OpenAI-compatible endpoint (${targetModel} at ${endpoint})...`
    });

    const candidates = [];

    for (let i = 0; i < count; i++) {
      if (request.signal?.aborted) {
        request.onProgress?.({
          type: 'aborted',
          candidateIndex: i,
          message: `Generation interrupted by user after ${candidates.length} candidate(s).`
        });
        break;
      }

      const seed = (request.settings?.seed ?? Date.now()) + i * 1000;
      const baseTemp = request.settings?.temperature ?? this.temperature ?? 0.8;
      const spreadFactor = request.settings?.variationSpread ?? 0.25;
      const spreads = [-1, -0.33, 0.33, 1];
      const temp = Number(Math.max(0.2, Math.min(1.4, baseTemp + (spreads[i % 4] * spreadFactor))).toFixed(2));

      const userPrompt = buildUserPrompt({
        prompt: request.prompt,
        previousProgram: request.previousProgram,
        feedback: request.feedback,
        candidateIndex: i
      });

      request.onProgress?.({
        type: 'candidate_start',
        candidateIndex: i,
        model: targetModel,
        temperature: temp,
        message: `Streaming Candidate ${String.fromCharCode(65 + i)} (${i + 1}/${count}) via OpenAI API [temp: ${temp}]...`
      });

      try {
        const candidate = await this.generateStreamingCandidate({
          candidateIndex: i,
          endpoint,
          systemPrompt,
          userPrompt,
          seed,
          temperature: temp,
          model: targetModel,
          apiKey,
          customHeaders: parsedCustomHeaders,
          image: request.image,
          signal: request.signal,
          onProgress: request.onProgress,
          onPartialCandidate: request.onPartialCandidate
        });

        candidates.push(candidate);

        request.onCandidateComplete?.({
          candidateIndex: i,
          candidate
        });
      } catch (err) {
        if (err.name === 'AbortError' || request.signal?.aborted) {
          request.onProgress?.({
            type: 'aborted',
            candidateIndex: i,
            message: `OpenAI generation interrupted during Candidate ${String.fromCharCode(65 + i)}.`
          });
          break;
        }

        const diagnosticError = this.diagnoseError(err, endpoint);
        request.onProgress?.({
          type: 'error',
          candidateIndex: i,
          error: diagnosticError,
          message: `Candidate ${String.fromCharCode(65 + i)} failed: ${diagnosticError}`
        });

        candidates.push({
          program: { version: 1, actions: [] },
          generationTimeMs: 0,
          rawResponse: '',
          warnings: [`Generation failed for candidate ${String.fromCharCode(65 + i)}: ${diagnosticError}`]
        });
      }
    }

    return candidates;
  }

  /** Describe an image (data URL) as a drawing prompt with the current model. */
  async describe(image, { signal } = {}) {
    const apiKey = getStorage('ams_openai_key') || this.apiKey;
    const headers = { 'Content-Type': 'application/json' };
    const custom = getStorage('ams_openai_headers') || this.customHeaders;
    if (custom) { try { Object.assign(headers, typeof custom === 'object' ? custom : JSON.parse(custom)); } catch { /* ignore */ } }
    if (apiKey) headers.Authorization = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    const res = await fetch(this.getEndpoint(), {
      method: 'POST', headers, signal,
      body: JSON.stringify({ model: getStorage('ams_openai_model') || this.model || 'gpt-4o', messages: [{ role: 'user', content: openAIContent(DESCRIBE_INSTRUCTION, image) }] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return String(data.choices?.[0]?.message?.content || '').trim();
  }

  async generateStreamingCandidate({
    candidateIndex,
    endpoint,
    systemPrompt,
    userPrompt,
    seed,
    temperature,
    model,
    apiKey,
    customHeaders,
    image,
    signal,
    onProgress,
    onPartialCandidate
  }) {
    const startTime = performance.now();
    const warnings = [];

    // Reasoning models (like o1, o3-mini) do not accept custom temperature
    const isReasoningModel = model.startsWith('o1') || model.startsWith('o3');

    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: openAIContent(image ? `${userPrompt}\n\n${IMAGE_NOTE}` : userPrompt, image) }
      ],
      stream: true
    };

    if (!isReasoningModel) {
      payload.temperature = temperature;
      payload.seed = seed;
      // Many OpenAI-compatible providers accept json_object
      payload.response_format = { type: 'json_object' };
    }

    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders
    };

    if (apiKey) {
      headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    }

    let res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });

    // Fallback: if response_format caused a 400 rejection on certain non-compliant providers, retry without it
    if (!res.ok && res.status === 400 && payload.response_format) {
      delete payload.response_format;
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });
    }

    if (!res.ok) {
      let errorBody = '';
      try {
        const errJson = await res.json();
        errorBody = errJson.error?.message || JSON.stringify(errJson);
      } catch (e) {
        errorBody = res.statusText;
      }
      throw new Error(`HTTP ${res.status}: ${errorBody}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported.');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let rawResponse = '';
    let tokenCount = 0;
    let lastParsedActionCount = 0;

    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new DOMException('Aborted by user', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') break;

        if (trimmed.startsWith('data: ')) {
          try {
            const dataJson = JSON.parse(trimmed.slice(6));
            const delta = dataJson.choices?.[0]?.delta?.content || '';
            if (delta) {
              rawResponse += delta;
              tokenCount++;

              const elapsedSec = (performance.now() - startTime) / 1000;
              const speedTokPerSec = elapsedSec > 0 ? (tokenCount / elapsedSec).toFixed(1) : '0.0';

              onProgress?.({
                type: 'stream_token',
                candidateIndex,
                tokenChunk: delta,
                tokenCount,
                speedTokPerSec: Number(speedTokPerSec),
                elapsedMs: Math.round(performance.now() - startTime),
                fullText: rawResponse
              });

              if (delta.includes('}') || delta.includes(']') || tokenCount % 4 === 0) {
                const partialActions = extractPartialActions(rawResponse);
                if (partialActions.length > 0 && partialActions.length !== lastParsedActionCount) {
                  lastParsedActionCount = partialActions.length;
                  onPartialCandidate?.({
                    candidateIndex,
                    partialProgram: { version: 1, actions: partialActions },
                    actionCount: partialActions.length,
                    rawText: rawResponse
                  });
                }
              }
            }
          } catch (e) {
            // Incomplete JSON in chunk
          }
        }
      }
    }

    const generationTimeMs = Math.round(performance.now() - startTime);
    const normalized = parseModelOutput(rawResponse, warnings);

    return {
      program: normalized,
      generationTimeMs,
      rawResponse,
      tokenCount,
      warnings
    };
  }

  diagnoseError(err, endpoint) {
    const msg = err?.message || String(err);
    if (msg.includes('401') || msg.includes('Incorrect API key') || msg.includes('Unauthorized')) {
      return 'Authentication failed. Please verify your OpenAI API key or ChatGPT Bearer token in Settings.';
    }
    if (msg.includes('429')) {
      return 'Rate limit reached or quota exceeded. Check your OpenAI / provider plan balance.';
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ECONNREFUSED')) {
      return `Cannot connect to ${endpoint}. If using local LM Studio or Ollama, ensure it is running and CORS is enabled.`;
    }
    return msg;
  }

  extractAndParseJSON(text, warnings) {
    if (!text) return null;
    let clean = text.trim();

    const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) clean = codeBlockMatch[1].trim();

    try {
      return JSON.parse(clean);
    } catch (e) {}

    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = clean.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (e) {
        try {
          return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
        } catch (e2) {
          warnings.push(`JSON repair warning: ${e2.message}`);
        }
      }
    }

    warnings.push('Could not parse model output as JSON.');
    return null;
  }
}
