/**
 * OpenRouter Artist
 *
 * Integrates with OpenRouter API for cloud frontier models (Claude 3.5 Sonnet,
 * GPT-4o, Gemini 2.5, DeepSeek, Llama 3.3) with SSE token streaming, real-time
 * canvas iterations, and cancellation support.
 */

import { openAIContent, IMAGE_NOTE, DESCRIBE_INSTRUCTION } from './imagePrompt.js';
import { Artist } from './Artist.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { normalizeProgram, parseModelOutput } from '../language/normalize.js';
import { extractPartialActions } from '../language/streaming.js';

export const OPENROUTER_CURATED_FREE_MODELS = [
  { id: 'openrouter/free', name: 'OpenRouter Free Models Router', contextLength: 128000, description: 'Auto-routed free models with zero cost' },
  { id: 'liquid/lfm-2.5-2.6b:free', name: 'LiquidAI LFM 2.5 2.6B (free)', contextLength: 65536, description: 'Liquid AI dynamic adaptive architecture' },
  { id: 'google/gemma-4-31b-it:free', name: 'Google Gemma 4 31B (free)', contextLength: 262144, description: 'High-capability Google open weights model' },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Google Gemma 4 26B A4B (free)', contextLength: 262144, description: 'Google MoE architecture' },
  { id: 'qwen/qwen3.8-27b:free', name: 'Qwen 3.8 27B (free)', contextLength: 262144, description: 'Alibaba Qwen reasoning & creative coding' },
  { id: 'cohere/north-mini-code:free', name: 'Cohere North Mini Code (free)', contextLength: 256000, description: 'Specialized code generation model' },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'NVIDIA Nemotron 3.5 Lightning (free)', contextLength: 1000000, description: 'Fast inference with 1M context' },
  { id: 'z-ai/glm-5.2:free', name: 'Z.ai GLM 5.2 (free)', contextLength: 32768, description: 'General language model' },
  { id: 'poolside/laguna-s-2.1:free', name: 'Poolside Laguna S 2.1 (free)', contextLength: 262144, description: 'Poolside code model' },
  { id: 'thinkingmachines/inkling:free', name: 'Thinking Machines Inkling (free)', contextLength: 1048576, description: 'Reasoning model with 1M context' },
  { id: 'nex-agi/nex-n2.5-mini:free', name: 'Nex AGI Nex-N2.5-Mini (free)', contextLength: 262144, description: 'Fast lightweight model' },
  { id: 'inclusionai/ling-3.0-flash-vl:free', name: 'inclusionAI Ling 3.0 Flash (free)', contextLength: 262144, description: 'Multimodal vision-language' }
];

export const OPENROUTER_FRONTIER_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Best Creative Coder)', contextLength: 200000, description: 'Top aesthetic coding model' },
  { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o (Frontier Multimodal)', contextLength: 128000, description: 'High precision multimodal generation' },
  { id: 'google/gemini-2.5-flash', name: 'Google Gemini 2.5 Flash (Ultra Fast)', contextLength: 1000000, description: 'Sub-second frontier generation' },
  { id: 'google/gemini-2.5-pro', name: 'Google Gemini 2.5 Pro (Deep Reasoning)', contextLength: 2000000, description: 'Complex algorithmic reasoning' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (High Value)', contextLength: 64000, description: 'Excellent reasoning-to-cost ratio' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', contextLength: 128000, description: 'Meta open weights flagship' }
];

export const OPENROUTER_MODEL_PRESETS = OPENROUTER_FRONTIER_MODELS;

export const DEFAULT_OPENROUTER_FAVORITES = [
  'liquid/lfm-2.5-2.6b:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
  'cohere/north-mini-code:free',
  'openrouter/free',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.5-flash'
];

export function isFreeModel(m) {
  if (!m) return false;
  const id = typeof m === 'string' ? m : (m.id || '');
  if (id.endsWith(':free')) return true;
  if (typeof m === 'object') {
    if (m.isFree) return true;
    if (m.pricing && m.pricing.prompt === '0' && m.pricing.completion === '0') return true;
  }
  return false;
}

function getStorage(key, fallback = '') {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(key)) || fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * fetch with retries for rate limits (429) and transient 5xx: waits Retry-After or
 * 4 s, 8 s, 16 s. Free models are often rate-limited upstream.
 */
async function fetchWithRetry(url, init, tries = 4) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (!(res.status === 429 || res.status >= 500) || attempt >= tries - 1) return res;
    const after = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(after) && after > 0 ? Math.min(60, after) * 1000 : 4000 * 2 ** attempt;
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, wait);
      init?.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Interrupted')); });
    });
  }
}

export class OpenRouterArtist extends Artist {
  constructor(options = {}) {
    super(options.id || 'openrouter', options.name || 'OpenRouter', 'cloud');
    this.endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    this.apiKey = options.apiKey || getStorage('ams_openrouter_key') || '';
    this.model = options.model || getStorage('ams_openrouter_model', 'anthropic/claude-3.5-sonnet');
    this.temperature = options.temperature ?? 0.8;
    this.catalog = null;
    this.isFetchingCatalog = false;

    this.loadCachedCatalog();
  }

  loadCachedCatalog() {
    if (typeof localStorage === 'undefined') return;
    try {
      const cached = localStorage.getItem('ams_openrouter_catalog_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.catalog = parsed;
        }
      }
    } catch (e) {}
  }

  getDefaultCatalog() {
    const combined = [];
    const seen = new Set();
    for (const m of OPENROUTER_CURATED_FREE_MODELS) {
      combined.push({ ...m, isFree: true });
      seen.add(m.id);
    }
    for (const m of OPENROUTER_FRONTIER_MODELS) {
      if (!seen.has(m.id)) {
        combined.push({ ...m, isFree: false });
        seen.add(m.id);
      }
    }
    return combined;
  }

  async fetchModels(force = false) {
    if (!force && this.catalog && this.catalog.length > 0) {
      return this.catalog;
    }

    if (this.isFetchingCatalog) {
      return this.catalog || this.getDefaultCatalog();
    }

    if (!force && typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem('ams_openrouter_catalog_cache');
        const timestamp = Number(localStorage.getItem('ams_openrouter_catalog_time') || 0);
        if (cached && (Date.now() - timestamp < 4 * 3600 * 1000)) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.catalog = parsed;
            return this.catalog;
          }
        }
      } catch (e) {}
    }

    this.isFetchingCatalog = true;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'HTTP-Referer': typeof window !== 'undefined' ? (window.location?.origin || 'http://localhost:3000') : 'http://localhost:3000',
          'X-Title': 'Artist Model Studio'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.data)) {
        this.catalog = data.data.map(m => {
          const isFree = Boolean(
            m.id?.endsWith(':free') ||
            (m.pricing?.prompt === '0' && m.pricing?.completion === '0')
          );
          return {
            id: m.id,
            name: m.name || m.id,
            contextLength: m.context_length || 0,
            description: m.description || '',
            pricing: m.pricing || null,
            isFree
          };
        });

        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('ams_openrouter_catalog_cache', JSON.stringify(this.catalog));
            localStorage.setItem('ams_openrouter_catalog_time', String(Date.now()));
          } catch (e) {}
        }
        return this.catalog;
      }
    } catch (err) {
      console.warn('[OpenRouterArtist] Failed to fetch remote models catalog:', err);
    } finally {
      this.isFetchingCatalog = false;
    }

    if (!this.catalog || this.catalog.length === 0) {
      this.catalog = this.getDefaultCatalog();
    }
    return this.catalog;
  }

  getFavorites() {
    if (this.favorites && Array.isArray(this.favorites)) {
      return this.favorites;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('ams_openrouter_favorites');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.favorites = parsed;
            return this.favorites;
          }
        }
      }
    } catch (e) {}
    this.favorites = [...DEFAULT_OPENROUTER_FAVORITES];
    return this.favorites;
  }

  saveFavorites(favs) {
    this.favorites = [...favs];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ams_openrouter_favorites', JSON.stringify(favs));
      }
    } catch (e) {}
  }

  isFavorite(modelId) {
    if (!modelId) return false;
    return this.getFavorites().includes(modelId);
  }

  toggleFavorite(modelId) {
    if (!modelId) return false;
    const favs = this.getFavorites();
    const idx = favs.indexOf(modelId);
    let isNowFav = false;
    if (idx >= 0) {
      favs.splice(idx, 1);
      isNowFav = false;
    } else {
      favs.push(modelId);
      isNowFav = true;
    }
    this.saveFavorites(favs);
    return isNowFav;
  }

  searchModels({ query = '', onlyFree = false, onlyFavorites = false } = {}) {
    const catalog = (this.catalog && this.catalog.length > 0) ? this.catalog : this.getDefaultCatalog();
    const q = query.trim().toLowerCase();
    const favSet = new Set(this.getFavorites());

    let results = catalog.map(m => ({
      ...m,
      isFavorite: favSet.has(m.id)
    }));

    if (onlyFavorites) {
      results = results.filter(m => m.isFavorite);
    }

    if (onlyFree) {
      results = results.filter(m => m.isFree);
    }

    if (q) {
      results = results.filter(m => (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
      ));
    }

    // Sort: favorites first, then free models, then alphabetized
    results.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (a.isFree && !b.isFree) return -1;
      if (!a.isFree && b.isFree) return 1;
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  getModel() {
    return this.model;
  }

  setModel(modelId) {
    if (!modelId) return;
    this.model = modelId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ams_openrouter_model', modelId);
    }
  }

  getAvailableModels() {
    const favorites = this.getFavorites();
    const catalog = (this.catalog && this.catalog.length > 0) ? this.catalog : this.getDefaultCatalog();
    const catalogMap = new Map();
    for (const m of catalog) {
      catalogMap.set(m.id, m);
    }

    const result = [];
    const addedIds = new Set();

    // 1. Group: Favorites (Mostly Free)
    for (const favId of favorites) {
      const modelObj = catalogMap.get(favId) || { id: favId, name: favId, isFree: isFreeModel(favId) };
      result.push({
        id: modelObj.id,
        name: `${modelObj.name}${modelObj.isFree ? ' [FREE]' : ''}`,
        isFree: modelObj.isFree,
        isFavorite: true,
        group: 'Favorites (Mostly Free)'
      });
      addedIds.add(favId);
    }

    // 2. Group: 🆓 Free Models (:free)
    const freeModels = catalog.filter(m => m.isFree && !addedIds.has(m.id));
    for (const m of freeModels) {
      result.push({
        id: m.id,
        name: `🆓 ${m.name}`,
        isFree: true,
        isFavorite: false,
        group: '🆓 Free Models (:free)'
      });
      addedIds.add(m.id);
    }

    // 3. Group: Cloud Frontier & Other
    for (const m of OPENROUTER_FRONTIER_MODELS) {
      if (!addedIds.has(m.id)) {
        result.push({
          id: m.id,
          name: m.name,
          isFree: false,
          isFavorite: false,
          group: 'Cloud Frontier & Other'
        });
        addedIds.add(m.id);
      }
    }

    // If active model is not in list, add it
    if (this.model && !addedIds.has(this.model)) {
      result.push({
        id: this.model,
        name: `Custom (${this.model})`,
        isFree: isFreeModel(this.model),
        isFavorite: false,
        group: 'Cloud Frontier & Other'
      });
    }

    return result;
  }

  async generate(request) {
    const count = request.count || 4;
    const systemPrompt = buildSystemPrompt(request.mediumCapabilities);
    const targetModel = request.settings?.model || getStorage('ams_openrouter_model') || this.model;
    const apiKey = request.settings?.apiKey || getStorage('ams_openrouter_key') || this.apiKey;

    if (!apiKey) {
      const errorMsg = 'OpenRouter API key is missing. Click Settings to enter your OpenRouter key (sk-or-...).';
      request.onProgress?.({ type: 'error', error: errorMsg, message: errorMsg });
      throw new Error(errorMsg);
    }

    request.onProgress?.({
      type: 'start',
      model: targetModel,
      endpoint: 'openrouter.ai',
      totalCandidates: count,
      message: `Connecting to OpenRouter API (model: ${targetModel})...`
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
        message: `Streaming Candidate ${String.fromCharCode(65 + i)} (${i + 1}/${count}) via OpenRouter [temp: ${temp}]...`
      });

      try {
        const candidate = await this.generateStreamingCandidate({
          candidateIndex: i,
          systemPrompt,
          userPrompt,
          seed,
          temperature: temp,
          model: targetModel,
          apiKey,
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
            message: `OpenRouter generation interrupted during Candidate ${String.fromCharCode(65 + i)}.`
          });
          break;
        }

        const diagnosticError = this.diagnoseError(err);
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

  /**
   * One chat completion: { system, user, image?, temperature?, signal } → text.
   * Used by the workbench, where models write scores rather than drawing programs.
   */
  async complete({ system, user, image = null, temperature = 0.7, maxTokens = 4000, signal } = {}) {
    const apiKey = getStorage('ams_openrouter_key') || this.apiKey;
    if (!apiKey) throw new Error('OpenRouter API key missing (Generate panel → Keys)');
    const res = await fetchWithRetry(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'X-Title': 'Artist Model Studio' },
      body: JSON.stringify({ model: getStorage('ams_openrouter_model') || this.model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: openAIContent(user, image) }], temperature, max_tokens: maxTokens }),
      signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(300000)].filter(Boolean)) : signal
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.metadata?.raw || data?.error?.message || `HTTP ${res.status}`);
    return String(data.choices?.[0]?.message?.content || '');
  }

  /** Describe an image (data URL) as a drawing prompt with the current model. */
  async describe(image, { signal } = {}) {
    const apiKey = getStorage('ams_openrouter_key') || this.apiKey;
    if (!apiKey) throw new Error('OpenRouter API key missing');
    const res = await fetchWithRetry(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: getStorage('ams_openrouter_model') || this.model, messages: [{ role: 'user', content: openAIContent(DESCRIBE_INSTRUCTION, image) }], temperature: 0.3 }),
      signal
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return String(data.choices?.[0]?.message?.content || '').trim();
  }

  async generateStreamingCandidate({
    candidateIndex,
    systemPrompt,
    userPrompt,
    seed,
    temperature,
    model,
    apiKey,
    image,
    signal,
    onProgress,
    onPartialCandidate
  }) {
    const startTime = performance.now();
    const warnings = [];

    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: openAIContent(image ? `${userPrompt}\n\n${IMAGE_NOTE}` : userPrompt, image) }
      ],
      response_format: { type: 'json_object' },
      stream: true,
      temperature,
      seed
    };

    let thinkingTokens = 0;
    const res = await fetchWithRetry(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? (window.location?.origin || 'http://localhost:3000') : 'http://localhost:3000',
        'X-Title': 'Artist Model Studio'
      },
      body: JSON.stringify(payload),
      // Give up on a candidate after 4 minutes (reasoning models can stall silently).
      signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(240000)].filter(Boolean)) : signal
    });

    if (!res.ok) {
      let errorBody = '';
      try {
        const errJson = await res.json();
        errorBody = errJson.error?.message || JSON.stringify(errJson);
      } catch (e) {
        errorBody = res.statusText;
      }
      throw new Error(`OpenRouter HTTP ${res.status}: ${errorBody}`);
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
        if (!trimmed || trimmed.startsWith(':')) continue; // keep-alive
        if (trimmed === 'data: [DONE]') break;

        if (trimmed.startsWith('data: ')) {
          try {
            const dataJson = JSON.parse(trimmed.slice(6));
            const reasoning = dataJson.choices?.[0]?.delta?.reasoning || dataJson.choices?.[0]?.delta?.reasoning_content || '';
            if (reasoning) {
              thinkingTokens++;
              if (thinkingTokens % 8 === 1) onProgress?.({ type: 'thinking', candidateIndex, thinkingTokens, elapsedMs: Math.round(performance.now() - startTime) });
            }
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

  diagnoseError(err) {
    const msg = err?.message || String(err);
    if (msg.includes('401') || msg.includes('Invalid API key') || msg.includes('Unauthorized')) {
      return 'Invalid OpenRouter API Key. Please verify your key in Settings.';
    }
    if (msg.includes('402') || msg.includes('credit') || msg.includes('balance')) {
      return 'Insufficient OpenRouter credits. Please add credits at openrouter.ai/credits or select a free (:free) model using the Browse button.';
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

    warnings.push('Could not parse OpenRouter output as JSON.');
    return null;
  }
}
