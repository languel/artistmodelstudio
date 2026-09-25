/**
 * Ollama Artist with Live Streaming & Real-time Iteration
 *
 * Interacts with a local Ollama model instance with line-by-line token streaming,
 * real-time partial action rendering, throughput calculation, and cancellation support.
 */

import { ollamaMessage, IMAGE_NOTE, DESCRIBE_INSTRUCTION } from './imagePrompt.js';
import { Artist } from './Artist.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { normalizeProgram, parseModelOutput } from '../language/normalize.js';
import { extractPartialActions } from '../language/streaming.js';

export const OLLAMA_DEFAULT_PRESETS = [
  { id: 'liquidai/lfm2.5-1.2b-instruct:latest', name: 'LiquidAI LFM 2.5 (1.2B)' },
  { id: 'llama3.2:latest', name: 'Llama 3.2 (3B)' },
  { id: 'qwen2.5:latest', name: 'Qwen 2.5 (7B / 1.5B)' },
  { id: 'mistral:latest', name: 'Mistral (7B)' },
  { id: 'deepseek-r1:latest', name: 'DeepSeek R1' }
];

export class OllamaArtist extends Artist {
  constructor(options = {}) {
    super(options.id || 'ollama', options.name || 'Ollama Local', 'ollama');
    this.endpoint = options.endpoint || (typeof localStorage !== 'undefined' && localStorage.getItem('ams_ollama_endpoint')) || 'http://localhost:11434';
    this.model = options.model || (typeof localStorage !== 'undefined' && localStorage.getItem('ams_ollama_model')) || 'liquidai/lfm2.5-1.2b-instruct:latest';
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens ?? 1500;
    this.discoveredModels = [];
  }

  getModel() {
    return this.model;
  }

  setModel(modelId) {
    if (!modelId) return;
    this.model = modelId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ams_ollama_model', modelId);
    }
  }

  getAvailableModels() {
    if (this.discoveredModels && this.discoveredModels.length > 0) {
      return this.discoveredModels.map(m => ({ id: m, name: m }));
    }
    const presets = [...OLLAMA_DEFAULT_PRESETS];
    if (this.model && !presets.some(p => p.id === this.model)) {
      presets.unshift({ id: this.model, name: this.model });
    }
    return presets;
  }

  async fetchAvailableModels() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`${this.endpoint}/api/tags`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = (data.models || []).map(m => m.name);
      if (list.length > 0) {
        this.discoveredModels = list;
      }
      return list;
    } catch (err) {
      return [];
    }
  }

  async generate(request) {
    const count = request.count || 4;
    const systemPrompt = buildSystemPrompt(request.mediumCapabilities);
    const userPrompt = buildUserPrompt(request);
    const targetModel = request.settings?.model || this.model;

    request.onProgress?.({
      type: 'start',
      model: targetModel,
      endpoint: this.endpoint,
      totalCandidates: count,
      message: `Connecting to Ollama at ${this.endpoint} (model: ${targetModel})...`
    });

    const candidates = [];

    // Generate candidates sequentially for local models to prevent GPU/CPU queue locks
    // and deliver immediate time-to-first-canvas feedback.
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
      const temp = Number(Math.max(0.2, Math.min(1.5, baseTemp + (spreads[i % 4] * spreadFactor))).toFixed(2));

      // Build user prompt tailored with candidate variation directive
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
        message: `Generating Candidate ${String.fromCharCode(65 + i)} (${i + 1}/${count}) [temp: ${temp}]...`
      });

      try {
        const candidate = await this.generateStreamingCandidate({
          candidateIndex: i,
          systemPrompt,
          userPrompt,
          seed,
          temperature: temp,
          model: targetModel,
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
            message: `Generation interrupted during Candidate ${String.fromCharCode(65 + i)}.`
          });
          break;
        }

        const diagnosticError = this.diagnoseError(err, targetModel);
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

  /** One chat completion: { system, user, image?, temperature?, signal } → text. */
  async complete({ system, user, image = null, temperature = 0.7, signal } = {}) {
    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ model: this.model, stream: false, think: false, options: { temperature }, messages: [...(system ? [{ role: 'system', content: system }] : []), ollamaMessage(user, image)] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return String(data.message?.content || '');
  }

  /** Describe an image (data URL) as a drawing prompt with the current (vision) model. */
  async describe(image, { signal } = {}) {
    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ model: this.model, stream: false, messages: [ollamaMessage(DESCRIBE_INSTRUCTION, image)] })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return String(data.message?.content || '').trim();
  }

  async generateStreamingCandidate({
    candidateIndex,
    systemPrompt,
    userPrompt,
    seed,
    temperature,
    model,
    image,
    signal,
    onProgress,
    onPartialCandidate
  }) {
    const startTime = performance.now();
    const warnings = [];

    const payload = {
      model: model || this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ollamaMessage(image ? `${userPrompt}\n\n${IMAGE_NOTE}` : userPrompt, image)
      ],
      format: 'json',
      think: false, // thinking models (gemma4, qwen3) otherwise reason silently for minutes first
      stream: true,
      options: {
        temperature,
        seed
      }
    };

    let rawResponse = '';
    let tokenCount = 0;
    let thinkingTokens = 0;
    let lastParsedActionCount = 0;

    let res;
    try {
      res = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      });
    } catch (fetchErr) {
      throw fetchErr;
    }

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`HTTP 404: Model "${payload.model}" not found in Ollama.`);
      }
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported by browser environment.');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new DOMException('Aborted by user', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunkStr = decoder.decode(value, { stream: true });
      buffer += chunkStr;

      // Ollama streams newline-delimited JSON objects
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsedChunk = JSON.parse(trimmed);
          const thinkingChunk = parsedChunk.message?.thinking || parsedChunk.thinking || '';
          if (thinkingChunk) {
            thinkingTokens = (thinkingTokens || 0) + 1;
            if (thinkingTokens % 8 === 1) onProgress?.({ type: 'thinking', candidateIndex, thinkingTokens, elapsedMs: Math.round(performance.now() - startTime) });
          }
          const contentChunk = parsedChunk.message?.content || parsedChunk.response || '';
          if (contentChunk) {
            rawResponse += contentChunk;
            tokenCount++;

            const elapsedSec = (performance.now() - startTime) / 1000;
            const speedTokPerSec = elapsedSec > 0 ? (tokenCount / elapsedSec).toFixed(1) : '0.0';

            onProgress?.({
              type: 'stream_token',
              candidateIndex,
              tokenChunk: contentChunk,
              tokenCount,
              speedTokPerSec: Number(speedTokPerSec),
              elapsedMs: Math.round(performance.now() - startTime),
              fullText: rawResponse
            });

            // If token contains brackets or periodically, attempt partial action recovery
            if (contentChunk.includes('}') || contentChunk.includes(']') || tokenCount % 4 === 0) {
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
        } catch (jsonErr) {
          // Line wasn't fully formed JSON; skip to next
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

  diagnoseError(err, model) {
    const msg = err?.message || String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
      return `Cannot reach Ollama at ${this.endpoint}. Verify Ollama is running ('ollama serve'). If using Chrome/Safari, enable CORS: OLLAMA_ORIGINS="*" ollama serve`;
    }
    if (msg.includes('404')) {
      return `Model "${model}" is not installed in Ollama. Run: 'ollama pull ${model}' in your terminal.`;
    }
    return msg;
  }

  extractAndParseJSON(text, warnings) {
    if (!text) return null;

    let clean = text.trim();

    // 1. If wrapped in markdown code blocks: ```json ... ```
    const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      clean = codeBlockMatch[1].trim();
    }

    // 2. Direct JSON.parse
    try {
      return JSON.parse(clean);
    } catch (e) {
      // Continue to heuristic repair
    }

    // 3. Find outer { ... }
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = clean.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch (e) {
        // Try removing trailing commas
        const fixed = candidate.replace(/,\s*([}\]])/g, '$1');
        try {
          return JSON.parse(fixed);
        } catch (e2) {
          warnings.push(`JSON repair failed: ${e2.message}`);
        }
      }
    }

    warnings.push('Could not parse model output as JSON.');
    return null;
  }
}
