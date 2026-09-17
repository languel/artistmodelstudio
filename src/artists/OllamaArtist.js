/**
 * Ollama Artist
 *
 * Interacts with a local Ollama model instance for structured JSON generation.
 */

import { Artist } from './Artist.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { normalizeProgram } from '../language/normalize.js';

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

    const candidates = [];

    // Run generations with varying seeds/temperatures to produce diverse candidates
    const promises = [];
    for (let i = 0; i < count; i++) {
      const seed = (request.settings?.seed ?? Date.now()) + i * 1000;
      const temp = Math.min(1.0, (this.temperature ?? 0.7) + (i > 0 ? 0.05 * i : 0));

      promises.push(
        this.generateSingleCandidate({
          systemPrompt,
          userPrompt,
          seed,
          temperature: temp,
          model: request.settings?.model || this.model
        })
      );
    }

    const results = await Promise.allSettled(promises);

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === 'fulfilled' && res.value) {
        candidates.push(res.value);
      } else {
        candidates.push({
          program: { version: 1, actions: [] },
          generationTimeMs: 0,
          rawResponse: '',
          warnings: [`Generation failed for candidate ${String.fromCharCode(65 + i)}: ${res.reason?.message || 'Unknown error'}`]
        });
      }
    }

    return candidates;
  }

  async generateSingleCandidate({ systemPrompt, userPrompt, seed, temperature, model }) {
    const startTime = performance.now();
    const warnings = [];

    const payload = {
      model: model || this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      format: 'json',
      stream: false,
      options: {
        temperature,
        seed
      }
    };

    let rawResponse = '';
    let parsedJson = null;

    try {
      const res = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Ollama request failed: HTTP ${res.status} ${res.statusText}`);
      }

      const jsonRes = await res.json();
      rawResponse = jsonRes.message?.content || jsonRes.response || '';

      parsedJson = this.extractAndParseJSON(rawResponse, warnings);
    } catch (err) {
      warnings.push(`Ollama API error: ${err.message}`);
    }

    const generationTimeMs = Math.round(performance.now() - startTime);
    const normalized = normalizeProgram(parsedJson);

    return {
      program: normalized,
      generationTimeMs,
      rawResponse,
      warnings
    };
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
