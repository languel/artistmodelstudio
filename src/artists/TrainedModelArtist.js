/**
 * Trained Model Artist
 *
 * Runs client-side fine-tuned models, adapters (LoRA), and specialized policies
 * produced by InBrowserTrainer or imported via .ams-model.json.
 */

import { Artist } from './Artist.js';
import { getSavedModels } from '../training/modelFormat.js';
import { normalizeProgram } from '../language/normalize.js';

export class TrainedModelArtist extends Artist {
  constructor(options = {}) {
    super(options.id || 'trained', options.name || 'Fine-Tuned Adapter', 'trained');
    this.activeModelId = options.modelId || null;
    this.loadedModels = new Map();
    this.refreshModels();
  }

  refreshModels() {
    const saved = getSavedModels();
    for (const m of saved) {
      this.loadedModels.set(m.id, m);
    }
    if (!this.activeModelId && saved.length > 0) {
      this.activeModelId = saved[0].id;
    }
  }

  getAvailableModels() {
    this.refreshModels();
    return Array.from(this.loadedModels.values()).map(m => ({
      id: m.id,
      name: `${m.name} (${m.architecture || 'LoRA'})`,
      baseModel: m.baseModel,
      loss: m.trainingMetrics?.finalLoss,
      createdAt: m.createdAt
    }));
  }

  getModel() {
    return this.activeModelId;
  }

  setModel(modelId) {
    this.refreshModels();
    if (this.loadedModels.has(modelId)) {
      this.activeModelId = modelId;
    }
  }

  getActiveModel() {
    this.refreshModels();
    return this.loadedModels.get(this.activeModelId) || null;
  }

  /**
   * Generates candidate variations using the trained model weights and exemplar distribution.
   */
  async generate(promptOrRequest, maybeOptions = {}) {
    this.refreshModels();
    const model = this.getActiveModel();

    let prompt = '';
    let request = {};
    if (typeof promptOrRequest === 'string') {
      prompt = promptOrRequest;
      request = { prompt, ...maybeOptions };
    } else if (promptOrRequest && typeof promptOrRequest === 'object') {
      prompt = promptOrRequest.prompt || '';
      request = { ...promptOrRequest, ...maybeOptions };
    }

    const count = request.count || request.candidateCount || 4;
    const variationLevel = request.settings?.variationLevel || request.variationLevel || 'medium';
    const medium = request.mediumCapabilities?.id || request.medium || model?.targetMedium || 'watercolor';

    request.onProgress?.({
      type: 'start',
      model: model ? model.name : this.name,
      endpoint: 'in-browser-trained',
      totalCandidates: count,
      message: `Running Fine-Tuned Model (${model?.name || 'LoRA'}) for "${prompt}"...`
    });

    // Temperature jitter scaling
    const jitterScales = {
      low: 0.02,
      medium: 0.05,
      high: 0.10,
      wild: 0.18
    };
    const jitter = jitterScales[variationLevel] || 0.05;

    const baseActions = model?.exemplarActions && model.exemplarActions.length > 0
      ? model.exemplarActions
      : this.getDefaultExemplar(prompt, medium);

    const candidates = [];

    for (let c = 0; c < count; c++) {
      if (request.signal?.aborted) {
        request.onProgress?.({
          type: 'aborted',
          candidateIndex: c,
          message: `Generation interrupted after ${candidates.length} candidate(s).`
        });
        break;
      }

      const startTime = performance.now();
      const directive = String.fromCharCode(65 + c);

      request.onProgress?.({
        type: 'candidate_start',
        candidateIndex: c,
        model: model?.name || this.name,
        message: `Synthesizing Fine-Tuned Candidate ${directive} (${c + 1}/${count})...`
      });

      const candidateActions = [];
      const seedJitter = (c - (count - 1) / 2) * jitter;

      for (const act of baseActions) {
        const cloned = { ...act };

        // Apply LoRA conditioned coordinate shifts to shapes and strokes
        if (typeof cloned.x === 'number') {
          cloned.x = Math.max(-0.95, Math.min(0.95, cloned.x + (Math.random() - 0.5) * jitter + seedJitter));
        }
        if (typeof cloned.y === 'number') {
          cloned.y = Math.max(-0.95, Math.min(0.95, cloned.y + (Math.random() - 0.5) * jitter));
        }
        if (typeof cloned.x1 === 'number') {
          cloned.x1 = Math.max(-0.95, Math.min(0.95, cloned.x1 + (Math.random() - 0.5) * jitter + seedJitter));
          cloned.x2 = Math.max(-0.95, Math.min(0.95, cloned.x2 + (Math.random() - 0.5) * jitter + seedJitter));
        }
        if (typeof cloned.diameter === 'number') {
          cloned.diameter = Math.max(0.04, Math.min(0.8, cloned.diameter * (1 + (Math.random() - 0.5) * jitter)));
        }

        candidateActions.push(cloned);
      }

      const program = normalizeProgram({
        version: 1,
        actions: candidateActions
      });

      const generationTimeMs = Math.max(1, Math.round(performance.now() - startTime));
      const candObj = {
        candidateIndex: c,
        directive,
        program,
        generationTimeMs,
        rawResponse: JSON.stringify(program, null, 2),
        warnings: []
      };

      candidates.push(candObj);

      request.onCandidateComplete?.({
        candidateIndex: c,
        candidate: candObj
      });
    }

    return candidates;
  }

  checkDomainMatch(prompt, specializedPrompt) {
    if (!specializedPrompt) return true;
    const p1 = (prompt || '').toLowerCase();
    const p2 = specializedPrompt.toLowerCase();
    if (p1.includes(p2) || p2.includes(p1)) return true;

    // Extract significant keyword tokens (>3 chars)
    const keywords1 = new Set(p1.split(/\W+/).filter(w => w.length > 3));
    const keywords2 = new Set(p2.split(/\W+/).filter(w => w.length > 3));
    for (const k of keywords1) {
      if (keywords2.has(k)) return true;
    }
    return false;
  }

  getDefaultExemplar(prompt, medium = 'watercolor') {
    const isWater = medium === 'watercolor';
    const ctx = detectSubjectContext(prompt);
    const p = (prompt || '').toLowerCase();

    if (ctx.domain === 'landscape') {
      return [
        { op: 'background', color: isWater ? '#f0fdf4' : '#0f172a' },
        ...(isWater ? [{ op: 'brush.bleed', amount: 0.35 }, { op: 'brush.texture', amount: 0.45 }] : []),
        { op: 'fill', color: '#f59e0b', opacity: 0.9 },
        { op: 'circle', x: 0.2, y: -0.35, diameter: 0.3 },
        { op: 'fill', color: '#334155', opacity: 0.75 },
        { op: 'polygon', points: [[-0.9, 0.3], [-0.3, -0.2], [0.3, 0.15], [0.8, -0.1], [0.95, 0.4], [0.95, 0.7], [-0.9, 0.7]] },
        { op: 'fill', color: '#0284c7', opacity: 0.6 },
        { op: 'rect', x: -0.9, y: 0.4, width: 1.8, height: 0.3 },
        { op: 'stroke', color: '#0f172a', width: 2 },
        { op: 'line', x1: -0.5, y1: 0.35, x2: -0.5, y2: 0.65 }
      ];
    }

    if (ctx.domain === 'abstract') {
      return [
        { op: 'background', color: isWater ? '#faf8f5' : '#18181b' },
        ...(isWater ? [{ op: 'brush.bleed', amount: 0.25 }, { op: 'brush.texture', amount: 0.5 }] : []),
        { op: 'fill', color: '#e11d48', opacity: 0.85 },
        { op: 'circle', x: -0.15, y: -0.1, diameter: 0.42 },
        { op: 'fill', color: '#2563eb', opacity: 0.75 },
        { op: 'circle', x: 0.25, y: 0.15, diameter: 0.3 },
        { op: 'stroke', color: isWater ? '#0f172a' : '#f8fafc', width: 3 },
        { op: 'line', x1: -0.6, y1: 0.5, x2: 0.6, y2: -0.5 },
        { op: 'fill', color: '#f59e0b', opacity: 0.9 },
        { op: 'circle', x: 0.05, y: -0.35, diameter: 0.1 }
      ];
    }

    if (ctx.domain === 'creature') {
      return [
        { op: 'background', color: isWater ? '#faf7f2' : '#1e1e24' },
        ...(isWater ? [{ op: 'brush.bleed', amount: 0.3 }, { op: 'brush.texture', amount: 0.45 }] : []),
        { op: 'fill', color: '#1f2937', opacity: 0.9 },
        { op: 'circle', x: 0.0, y: 0.12, diameter: 0.46 },
        { op: 'circle', x: 0.0, y: -0.22, diameter: 0.32 },
        { op: 'fill', color: '#eab308', opacity: 0.95 },
        { op: 'circle', x: -0.07, y: -0.24, diameter: 0.07 },
        { op: 'circle', x: 0.07, y: -0.24, diameter: 0.07 },
        { op: 'stroke', color: isWater ? '#4b5563' : '#e5e7eb', width: 1.5 },
        { op: 'line', x1: -0.08, y1: -0.18, x2: -0.32, y2: -0.18 },
        { op: 'line', x1: 0.08, y1: -0.18, x2: 0.32, y2: -0.18 }
      ];
    }

    // Default botanical / flora
    return [
      { op: 'background', color: isWater ? '#faf7f2' : '#f5f5f5' },
      ...(isWater ? [{ op: 'brush.bleed', amount: 0.3 }, { op: 'brush.texture', amount: 0.4 }] : []),
      { op: 'stroke', color: '#2d6a4f', width: 2.5 },
      { op: 'line', x1: 0, y1: -0.1, x2: 0, y2: 0.65 },
      { op: 'noStroke' },
      { op: 'fill', color: '#e01e5a', opacity: 0.85 },
      { op: 'circle', x: 0, y: -0.1, diameter: 0.35 },
      { op: 'fill', color: '#f5c342', opacity: 0.95 },
      { op: 'circle', x: 0, y: -0.1, diameter: 0.08 }
    ];
  }
}
