/**
 * Ollama Artist with Live Streaming & Real-time Iteration
 *
 * Interacts with a local Ollama model instance with line-by-line token streaming,
 * real-time partial action rendering, throughput calculation, and cancellation support.
 */

import { Artist } from './Artist.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { normalizeProgram } from '../language/normalize.js';
import { extractPartialActions } from '../language/streaming.js';

export class OllamaArtist extends Artist {
  constructor(options = {}) {
    super(options.id || 'ollama', options.name || 'Ollama Local Model', 'ollama');
    this.endpoint = options.endpoint || 'http://localhost:11434';
    this.model = options.model || 'liquidai/lfm2.5-1.2b-instruct:latest';
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens ?? 1500;
  }

  async fetchAvailableModels() {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.models || []).map(m => m.name);
    } catch (err) {
      console.warn('Failed to fetch Ollama models:', err.message);
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

  async generateStreamingCandidate({
    candidateIndex,
    systemPrompt,
    userPrompt,
    seed,
    temperature,
    model,
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
        { role: 'user', content: userPrompt }
      ],
      format: 'json',
      stream: true,
      options: {
        temperature,
        seed
      }
    };

    let rawResponse = '';
    let tokenCount = 0;
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
    const parsedJson = this.extractAndParseJSON(rawResponse, warnings);
    const normalized = normalizeProgram(parsedJson);

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
