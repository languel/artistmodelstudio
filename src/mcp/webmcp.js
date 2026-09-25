/**
 * WebMCP - Browser Agent & Programmatic Bridge for Artist Model Studio
 *
 * Exposes window.ams with full studio automation, program rendering,
 * candidate selection, reward evaluation, and standard Model Context Protocol
 * (MCP) tool schemas for in-browser autonomous agents.
 */

import { evaluateReward } from '../rewards/combine.js';
import { STUDIO_TOOLS, STUDIO_TOOL_MAP } from './studioTools.js';
import { normalizeProgram } from '../language/normalize.js';
import { exportSFTJSONL, exportPreferenceJSONL, exportSessionJSON } from '../sessions/exportDataset.js';
import { InBrowserTrainer } from '../training/inBrowserTrainer.js';
import {
  getSavedModels,
  exportModelToJSON,
  importModelFromJSON
} from '../training/modelFormat.js';
import {
  estimateTrainingResources,
  HARDWARE_PRESETS,
  MODEL_SPECS
} from '../training/trainingEstimates.js';

export const MCP_TOOLS_SPEC = [
  {
    name: 'ams_generate',
    description: 'Generates artistic candidates for a creative coding prompt using the active or specified AI artist.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Artistic prompt (e.g. "three red flowers in watercolor", "sunset over mountains")' },
        artist: { type: 'string', enum: ['mock', 'openrouter', 'openai', 'ollama', 'webgpu'], description: 'Optional artist generator ID' },
        model: { type: 'string', description: 'Specific model ID (e.g. "anthropic/claude-3.5-sonnet", "gpt-4o", "liquidai/lfm2.5-1.2b-instruct:latest")' },
        medium: { type: 'string', enum: ['watercolor', 'flat', 'pixel'], description: 'Optional drawing medium' },
        count: { type: 'integer', default: 4, description: 'Number of candidate variations to produce (default 4)' },
        variationLevel: { type: 'string', enum: ['low', 'medium', 'high', 'wild'], description: 'Variation temperature spread' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ams_render_program',
    description: 'Renders a JSON drawing program using the active or specified medium and returns the rendered data URL and execution metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'object', description: 'Normalized drawing program with version and actions array' },
        medium: { type: 'string', enum: ['watercolor', 'flat', 'pixel'], description: 'Medium to render with' }
      },
      required: ['program']
    }
  },
  {
    name: 'ams_set_program',
    description: 'Replaces the active hero candidate drawing program with new code and paints the canvas immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'object', description: 'The new drawing program { version: 1, actions: [...] }' }
      },
      required: ['program']
    }
  },
  {
    name: 'ams_get_studio_state',
    description: 'Retrieves the complete state of the studio, including active artist, medium, resolution, current candidates, and hero candidate code.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'ams_select_candidate',
    description: 'Selects a candidate variation (A=0, B=1, C=2, D=3 or ID string) to display on the large Hero Canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        candidate: { type: ['integer', 'string'], description: 'Candidate index (0 to 3) or unique candidate ID' }
      },
      required: ['candidate']
    }
  },
  {
    name: 'ams_rate_candidate',
    description: 'Assigns a human or agent preference rating (1 to 5 stars) to a candidate.',
    inputSchema: {
      type: 'object',
      properties: {
        candidate: { type: ['integer', 'string'], description: 'Candidate index (0 to 3) or unique ID' },
        rating: { type: 'integer', minimum: 1, maximum: 5, description: 'Star rating from 1 to 5' }
      },
      required: ['candidate', 'rating']
    }
  },
  {
    name: 'ams_critique',
    description: 'Breeds new variations based on textual critique/feedback directed at a specific candidate.',
    inputSchema: {
      type: 'object',
      properties: {
        candidate: { type: ['integer', 'string'], description: 'Candidate index or ID to critique' },
        feedback: { type: 'string', description: 'Artistic guidance (e.g. "shift blooms left", "use translucent wash", "more negative space")' }
      },
      required: ['feedback']
    }
  },
  {
    name: 'ams_evaluate_rewards',
    description: 'Computes objective aesthetic reward metrics (validity, redness, leftness, 3-shape rule, empty space, total score) on a drawing program.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'object', description: 'Optional program to evaluate. If omitted, evaluates the active hero program.' }
      }
    }
  },
  {
    name: 'ams_interrupt',
    description: 'Immediately halts any currently streaming or running generation in the studio.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'ams_get_candidate',
    description: 'Retrieves full details of a specific candidate (or hero candidate if omitted), including rendered image data URL, normalized program actions, prompt, rating, render metrics, and aesthetic rewards.',
    inputSchema: {
      type: 'object',
      properties: {
        candidate: { type: ['integer', 'string'], description: 'Candidate index (0 to 3) or unique candidate ID' }
      }
    }
  },
  {
    name: 'ams_grade_candidates',
    description: 'Submits formal agent evaluation, multi-criteria scores, ratings, and chosen winner for candidate artworks.',
    inputSchema: {
      type: 'object',
      properties: {
        grades: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              candidate: { type: ['integer', 'string'], description: 'Candidate index or ID' },
              rating: { type: 'integer', minimum: 1, maximum: 5, description: 'Star rating (1 to 5)' },
              score: { type: 'number', description: 'Overall aesthetic or quality score (0 to 100)' },
              feedback: { type: 'string', description: 'Agent critique or qualitative notes' },
              criteria: {
                type: 'object',
                properties: {
                  aesthetic: { type: 'number' },
                  promptAdherence: { type: 'number' },
                  colorHarmony: { type: 'number' },
                  composition: { type: 'number' }
                }
              }
            },
            required: ['candidate']
          },
          description: 'Array of candidate grading evaluations'
        },
        chosenCandidate: { type: ['integer', 'string'], description: 'The winning candidate index or ID to mark as selected' }
      },
      required: ['grades']
    }
  },
  {
    name: 'ams_get_dataset',
    description: 'Exports collected training data in SFT chat format (JSONL), DPO/RLHF pairwise ranking format (JSONL), or complete session records (JSON).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['sft', 'preference', 'session'], default: 'sft', description: 'Dataset format' },
        filter: { type: 'string', enum: ['selected', 'rated', 'all', 'edited'], default: 'all', description: 'Filtering mode for SFT samples' }
      }
    }
  },
  {
    name: 'ams_train_model',
    description: 'Executes an in-browser training run using the lightest model architecture (SmolLM2-135M LoRA / NanoPolicy) on the chosen candidate drawing programs.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Target domain prompt (e.g. "hummingbird hovering by vibrant fuchsia flowers in watercolor")' },
        modelName: { type: 'string', description: 'Descriptive name for the fine-tuned model' },
        baseModel: { type: 'string', default: 'HuggingFaceTB/SmolLM2-135M-Instruct', description: 'Base model ID to adapt' },
        epochs: { type: 'integer', default: 6, description: 'Number of training epochs' },
        learningRate: { type: 'number', default: 0.002, description: 'Learning rate for AdamW optimizer' }
      }
    }
  },
  {
    name: 'ams_export_model',
    description: 'Exports a fine-tuned model or adapter as a portable .ams-model.json bundle.',
    inputSchema: {
      type: 'object',
      properties: {
        modelId: { type: 'string', description: 'Optional ID of the trained model to export (defaults to latest/active model)' }
      }
    }
  },
  {
    name: 'ams_import_model',
    description: 'Imports and registers a trained model or adapter package (.ams-model.json) into the studio, making it immediately selectable and usable.',
    inputSchema: {
      type: 'object',
      properties: {
        modelData: { type: ['string', 'object'], description: 'Serialized JSON string or object of the AMS model' },
        selectImmediately: { type: 'boolean', default: true, description: 'Whether to activate the model immediately for generation' }
      },
      required: ['modelData']
    }
  },
  {
    name: 'ams_list_trained_models',
    description: 'Lists all fine-tuned models and adapters available in local browser storage.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'ams_estimate_training',
    description: 'Calculates fine-tuning resource requirements, durations, memory footprints, and tokens/sec for Apple Silicon (M5 Max) and browser environments.',
    inputSchema: {
      type: 'object',
      properties: {
        modelId: { type: 'string', description: 'Model ID (e.g. "HuggingFaceTB/SmolLM2-135M-Instruct", "LiquidAI/LFM2.5-1.2B-Instruct-ONNX", "gemma4:12b-mlx")' },
        hardwareId: { type: 'string', enum: ['m5-max', 'm4-max', 'm3-pro', 'm1-base', 'browser-webgpu', 'browser-pure-js'], description: 'Hardware profile ID (defaults to m5-max)' },
        sampleCount: { type: 'integer', default: 50, description: 'Number of training samples' },
        epochs: { type: 'integer', default: 6, description: 'Number of epochs' },
        precision: { type: 'string', enum: ['4bit', 'fp16'], default: '4bit', description: 'Weight precision' }
      }
    }
  }
];

export function initWebMCP(studioApp) {
  if (typeof window === 'undefined') return null;

  const bridge = {
    studio: studioApp,
    spec: MCP_TOOLS_SPEC,

    listTools() {
      return [...MCP_TOOLS_SPEC, ...STUDIO_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))];
    },

    getStudioState() {
      const activeArtist = studioApp.getActiveArtist();
      const activeModel = (typeof activeArtist?.getModel === 'function') ? activeArtist.getModel() : '';
      const activeCand = studioApp.sessionStore?.getActiveCandidate();
      const candidates = studioApp.activeCandidates && studioApp.activeCandidates.length > 0
        ? studioApp.activeCandidates
        : (studioApp.sessionStore?.getCurrentCandidates() || []);

      return {
        activeArtist: activeArtist?.id,
        activeArtistName: activeArtist?.name,
        activeModel: activeModel,
        activeMedium: studioApp.getActiveMedium()?.id,
        activeMediumName: studioApp.getActiveMedium()?.name,
        canvasSize: studioApp.canvasSize,
        variationLevel: studioApp.variationLevel,
        isGenerating: Boolean(studioApp.abortController),
        prompt: activeCand?.prompt || '',
        activeCandidateId: studioApp.selectedCandidateId || activeCand?.id,
        candidateCount: candidates.length,
        candidates: candidates.map((c, idx) => ({
          index: idx,
          tag: String.fromCharCode(65 + idx),
          id: c.id,
          model: c.model || activeModel,
          prompt: c.prompt,
          rating: c.rating,
          actionCount: c.program?.actions?.length || 0,
          generationTimeMs: c.renderMetadata?.executionTimeMs || 0,
          renderTimeMs: c.renderMetadata?.renderTimeMs || 0,
          hasImage: Boolean(c.renderedImage)
        })),
        activeProgram: activeCand?.program || null
      };
    },

    async generate(options) {
      const opts = typeof options === 'string' ? { prompt: options } : (options || {});
      const prompt = opts.prompt;
      if (!prompt) throw new Error('Prompt is required for ams.generate()');

      if (opts.artist) {
        bridge.setArtist(opts.artist);
      }
      if (opts.model) {
        bridge.setModel(opts.model);
      }
      if (opts.medium) {
        await bridge.setMedium(opts.medium);
      }
      if (opts.variationLevel) {
        studioApp.handleVariationChange(opts.variationLevel);
      }

      // Return a promise that resolves when the generation finishes
      return new Promise(async (resolve, reject) => {
        try {
          await studioApp.handleGenerate(prompt);
          const cands = studioApp.activeCandidates && studioApp.activeCandidates.length > 0
            ? studioApp.activeCandidates
            : studioApp.sessionStore.getCurrentCandidates();
          resolve(cands);
        } catch (err) {
          reject(err);
        }
      });
    },

    async renderProgram(program, options = {}) {
      const mediumId = options.medium || studioApp.activeMediumId;
      const medium = studioApp.mediaRegistry.get(mediumId) || studioApp.getActiveMedium();
      const normalized = normalizeProgram(program);
      const start = performance.now();
      const res = await medium.render(normalized);
      const elapsed = Math.round(performance.now() - start);

      return {
        image: res.image,
        warnings: res.warnings || [],
        renderTimeMs: elapsed,
        medium: mediumId,
        actionCount: normalized.actions?.length || 0
      };
    },

    async setProgram(program) {
      const activeCand = studioApp.sessionStore?.getActiveCandidate();
      const candidateId = activeCand?.id || studioApp.selectedCandidateId;
      if (!candidateId) throw new Error('No active candidate to set program on.');
      const normalized = normalizeProgram(program);
      await studioApp.handleProgramEdit(candidateId, normalized);
      return { success: true, candidateId, actionCount: normalized.actions?.length || 0 };
    },

    getProgram() {
      const activeCand = studioApp.sessionStore?.getActiveCandidate();
      return activeCand?.program || null;
    },

    getCandidates() {
      return (studioApp.activeCandidates && studioApp.activeCandidates.length > 0)
        ? studioApp.activeCandidates
        : studioApp.sessionStore?.getCurrentCandidates() || [];
    },

    getCandidate(indexOrId) {
      const cands = bridge.getCandidates();
      let cand = null;
      if (indexOrId === undefined || indexOrId === null) {
        cand = studioApp.sessionStore?.getActiveCandidate() || cands[0] || null;
      } else if (typeof indexOrId === 'number') {
        cand = cands[indexOrId] || null;
      } else {
        cand = cands.find(c => c.id === indexOrId) || studioApp.sessionStore?.findCandidate?.(indexOrId) || null;
      }

      if (!cand) return null;

      let rewards = null;
      try {
        if (cand.program) {
          rewards = bridge.evaluateRewards(cand.program);
        }
      } catch (e) {
        // ignore
      }

      return {
        id: cand.id,
        prompt: cand.prompt,
        model: cand.model,
        medium: cand.medium || studioApp.activeMediumId,
        rating: cand.rating || 0,
        feedback: cand.feedback || '',
        agentEvaluation: cand.agentEvaluation || null,
        selected: Boolean(cand.selected),
        program: cand.program || null,
        actionCount: cand.program?.actions?.length || 0,
        renderedImage: cand.renderedImage || null,
        renderMetadata: cand.renderMetadata || null,
        rewards
      };
    },

    gradeCandidates(grades = [], chosenCandidate = null) {
      const cands = bridge.getCandidates();
      const results = [];

      for (const item of grades) {
        const target = item.candidate !== undefined ? item.candidate : (item.candidateIndex !== undefined ? item.candidateIndex : item.candidateId);
        let cand = null;
        if (typeof target === 'number') {
          cand = cands[target];
        } else {
          cand = cands.find(c => c.id === target) || studioApp.sessionStore?.findCandidate?.(target);
        }

        if (!cand) continue;

        if (typeof item.rating === 'number') {
          studioApp.handleRate(cand.id, Math.max(1, Math.min(5, item.rating)));
        }
        const feedback = item.feedback || item.critique;
        if (feedback) {
          studioApp.sessionStore?.setFeedback?.(cand.id, feedback);
        }

        cand.agentEvaluation = {
          score: item.score,
          feedback: feedback,
          criteria: item.criteria || {},
          gradedAt: new Date().toISOString()
        };

        results.push({
          candidateId: cand.id,
          rating: cand.rating,
          score: item.score,
          feedback: feedback
        });
      }

      let chosenCandidateId = null;
      if (chosenCandidate !== null && chosenCandidate !== undefined) {
        let chosen = null;
        if (typeof chosenCandidate === 'number') {
          chosen = cands[chosenCandidate];
        } else {
          chosen = cands.find(c => c.id === chosenCandidate) || studioApp.sessionStore?.findCandidate?.(chosenCandidate);
        }
        if (chosen) {
          chosenCandidateId = chosen.id;
          bridge.selectCandidate(chosen.id);
          chosen.selected = true;
          studioApp.sessionStore?.selectCandidate?.(chosen.id);
        }
      }

      return {
        success: true,
        gradedCount: results.length,
        chosenCandidateId,
        evaluations: results
      };
    },

    getDataset(type = 'sft', filter = 'all') {
      const store = studioApp.sessionStore;
      if (!store) throw new Error('Session store is not initialized.');

      if (type === 'preference') {
        const text = exportPreferenceJSONL(store);
        const count = text.trim() ? text.trim().split('\n').length : 0;
        return { type: 'preference', format: 'jsonl', sampleCount: count, content: text };
      } else if (type === 'session') {
        const text = exportSessionJSON(store);
        return { type: 'session', format: 'json', sampleCount: store.generations?.length || 0, content: text };
      } else {
        const text = exportSFTJSONL(store, filter);
        const count = text.trim() ? text.trim().split('\n').length : 0;
        return { type: 'sft', format: 'jsonl', sampleCount: count, content: text };
      }
    },

    async trainModel(options = {}) {
      const cands = bridge.getCandidates();
      const activeCand = studioApp.sessionStore?.getActiveCandidate();
      const prompt = options.prompt || activeCand?.prompt || 'artistic drawing';
      const epochs = options.epochs || 6;
      const baseModel = options.baseModel || 'HuggingFaceTB/SmolLM2-135M-Instruct';
      const learningRate = options.learningRate || 0.002;

      // Positive samples: chosen or highest rated candidates
      let positives = cands.filter(c => c.selected || (c.rating && c.rating >= 4));
      if (positives.length === 0 && activeCand) {
        positives = [activeCand];
      }
      if (positives.length === 0 && cands.length > 0) {
        positives = [cands[0]];
      }

      // Negative samples for DPO margin
      const posIds = new Set(positives.map(p => p.id));
      const negatives = cands.filter(c => !posIds.has(c.id));

      const trainer = new InBrowserTrainer({
        baseModel,
        learningRate,
        rank: 4
      });

      const trainedModel = await trainer.train({
        prompt,
        samples: positives,
        rejectedSamples: negatives,
        epochs,
        modelName: options.modelName || `${prompt.slice(0, 20).trim()} (LoRA)`,
        targetMedium: studioApp.activeMediumId || 'watercolor',
        onProgress: (prog) => {
          if (studioApp.statusBanner?.setDownloadProgress) {
            studioApp.statusBanner.setDownloadProgress({
              progress: prog.progressPct,
              message: `Training epoch ${prog.epoch}/${prog.totalEpochs} (Loss: ${prog.loss.toFixed(4)})...`
            });
          }
        }
      });

      if (studioApp.statusBanner?.clearDownloadProgress) {
        studioApp.statusBanner.clearDownloadProgress();
      }

      const trainedArtist = studioApp.artistRegistry?.get('trained');
      if (trainedArtist) {
        trainedArtist.refreshModels();
        trainedArtist.setModel(trainedModel.id);
      }
      if (typeof studioApp.controls?.updateModels === 'function') {
        studioApp.controls.updateModels(studioApp.artistRegistry?.activeId);
      }

      return {
        success: true,
        modelId: trainedModel.id,
        name: trainedModel.name,
        baseModel: trainedModel.baseModel,
        architecture: trainedModel.architecture,
        epochsCompleted: trainedModel.trainingMetrics.epochsCompleted,
        finalLoss: trainedModel.trainingMetrics.finalLoss,
        lossHistory: trainedModel.trainingMetrics.lossHistory
      };
    },

    exportModel(modelId = null) {
      const models = getSavedModels();
      const target = modelId ? models.find(m => m.id === modelId) : (models[models.length - 1] || null);
      if (!target) throw new Error(`No trained model found to export.`);
      const json = exportModelToJSON(target);
      return {
        success: true,
        modelId: target.id,
        name: target.name,
        json
      };
    },

    importModel(modelData, selectImmediately = true) {
      const imported = importModelFromJSON(modelData);
      const trainedArtist = studioApp.artistRegistry?.get('trained');
      if (trainedArtist) {
        trainedArtist.refreshModels();
        trainedArtist.setModel(imported.id);
      }

      if (selectImmediately) {
        bridge.setArtist('trained');
        bridge.setModel(imported.id);
      }

      if (typeof studioApp.controls?.updateModels === 'function') {
        studioApp.controls.updateModels(studioApp.artistRegistry?.activeId);
      }

      return {
        success: true,
        model: {
          id: imported.id,
          name: imported.name,
          baseModel: imported.baseModel,
          architecture: imported.architecture
        }
      };
    },

    listTrainedModels() {
      return getSavedModels().map(m => ({
        id: m.id,
        name: m.name,
        baseModel: m.baseModel,
        architecture: m.architecture,
        targetMedium: m.targetMedium,
        finalLoss: m.trainingMetrics?.finalLoss,
        createdAt: m.createdAt
      }));
    },

    getTrainingEstimates(options = {}) {
      return estimateTrainingResources(options);
    },

    openHelp(tab = null) {
      if (typeof studioApp.helpModal?.open === 'function') {
        studioApp.helpModal.open(tab);
        return { success: true, tab: tab || 'benchmarks' };
      }
      return { success: false, error: 'HelpModal not available' };
    },

    selectCandidate(indexOrId) {
      let candId = indexOrId;
      if (typeof indexOrId === 'number') {
        const cands = bridge.getCandidates();
        const cand = cands[indexOrId];
        if (!cand) throw new Error(`Candidate at index ${indexOrId} not found.`);
        candId = cand.id;
      }
      studioApp.handleSelectCandidate(candId);
      return { success: true, selectedCandidateId: candId };
    },

    rateCandidate(indexOrId, rating) {
      let candId = indexOrId;
      if (typeof indexOrId === 'number') {
        const cands = bridge.getCandidates();
        const cand = cands[indexOrId];
        if (!cand) throw new Error(`Candidate at index ${indexOrId} not found.`);
        candId = cand.id;
      }
      studioApp.handleRate(candId, Math.max(1, Math.min(5, rating)));
      return { success: true, candidateId: candId, rating };
    },

    async critique(critiqueText, candidateIndexOrId = 0) {
      let candId = candidateIndexOrId;
      if (typeof candidateIndexOrId === 'number') {
        const cands = bridge.getCandidates();
        const cand = cands[candidateIndexOrId];
        if (!cand) throw new Error(`Candidate at index ${candidateIndexOrId} not found.`);
        candId = cand.id;
      }
      const cand = studioApp.sessionStore.findCandidate(candId) || bridge.getCandidate(candId);
      if (!cand) throw new Error(`Candidate not found: ${candId}`);

      studioApp.sessionStore.setFeedback(candId, critiqueText);
      await studioApp.handleGenerate(cand.prompt, cand.program, critiqueText, cand.id);
      return bridge.getCandidates();
    },

    async variations(candidateIndexOrId = 0) {
      let candId = candidateIndexOrId;
      if (typeof candidateIndexOrId === 'number') {
        const cands = bridge.getCandidates();
        const cand = cands[candidateIndexOrId];
        if (!cand) throw new Error(`Candidate at index ${candidateIndexOrId} not found.`);
        candId = cand.id;
      }
      const cand = studioApp.sessionStore.findCandidate(candId) || bridge.getCandidate(candId);
      if (!cand) throw new Error(`Candidate not found: ${candId}`);

      await studioApp.handleGenerate(cand.prompt, cand.program, null, cand.id);
      return bridge.getCandidates();
    },

    evaluateRewards(programOrCand, options = {}) {
      let prog = programOrCand;
      if (!prog) {
        prog = bridge.getProgram();
      } else if (prog.program) {
        prog = prog.program;
      }
      if (!prog) throw new Error('No program available for reward evaluation.');

      return evaluateReward(prog, {
        capabilities: studioApp.getActiveMedium()?.capabilities(),
        ...options
      });
    },

    interrupt() {
      studioApp.handleInterrupt();
      return { success: true, message: 'Interrupted active generation.' };
    },

    stop() {
      return bridge.interrupt();
    },

    setArtist(artistId) {
      studioApp.handleArtistChange(artistId);
      studioApp.controls.activeArtist = artistId;
      const select = studioApp.root?.querySelector('#artist-select');
      if (select) select.value = artistId;
      return { success: true, activeArtist: studioApp.getActiveArtist().name };
    },

    setModel(modelId) {
      studioApp.handleModelChange(modelId);
      const modelSelect = studioApp.root?.querySelector('#model-select');
      if (modelSelect) modelSelect.value = modelId;
      return { success: true, activeModel: modelId };
    },

    getModels(artistId) {
      const targetId = artistId || studioApp.getActiveArtist()?.id;
      const artist = studioApp.artistRegistry.get(targetId);
      return (typeof artist?.getAvailableModels === 'function') ? artist.getAvailableModels() : [];
    },

    getOpenRouterCatalog() {
      const or = studioApp.artistRegistry.get('openrouter');
      return or ? (or.catalog || or.getDefaultCatalog()) : [];
    },

    searchOpenRouterModels(query = '', filters = {}) {
      const or = studioApp.artistRegistry.get('openrouter');
      return or ? or.searchModels({ query, ...filters }) : [];
    },

    getFavorites() {
      const or = studioApp.artistRegistry.get('openrouter');
      return or ? or.getFavorites() : [];
    },

    toggleFavorite(modelId) {
      const or = studioApp.artistRegistry.get('openrouter');
      if (!or) return false;
      const isFav = or.toggleFavorite(modelId);
      if (studioApp.artistRegistry.activeId === 'openrouter') {
        studioApp.controls.updateModels('openrouter');
      }
      return isFav;
    },

    setZoom(scale, panX = 0, panY = 0) {
      if (studioApp.candidateGrid) {
        studioApp.candidateGrid.zoomScale = scale;
        studioApp.candidateGrid.panX = panX;
        studioApp.candidateGrid.panY = panY;
        studioApp.candidateGrid.applyTransform();
      }
      return { success: true, zoomScale: scale, panX, panY };
    },

    getZoom() {
      return {
        zoomScale: studioApp.candidateGrid?.zoomScale || 1,
        panX: studioApp.candidateGrid?.panX || 0,
        panY: studioApp.candidateGrid?.panY || 0
      };
    },

    async setMedium(mediumId) {
      await studioApp.handleMediumChange(mediumId);
      studioApp.controls.activeMedium = mediumId;
      const select = studioApp.root?.querySelector('#medium-select');
      if (select) select.value = mediumId;
      return { success: true, activeMedium: studioApp.getActiveMedium().name };
    },

    setCanvasSize(size) {
      studioApp.handleCanvasSizeChange(size);
      return { success: true, canvasSize: size };
    },

    exportCanvas() {
      const activeCand = studioApp.sessionStore?.getActiveCandidate();
      return {
        image: activeCand?.renderedImage || null,
        prompt: activeCand?.prompt || '',
        medium: studioApp.getActiveMedium().name,
        canvasSize: studioApp.canvasSize
      };
    },

    async callTool(name, args = {}) {
      // Agent actions show up in the Log (read-only queries stay quiet).
      if (!/^ams_(get_|list_|screenshot|ui_query|agent_pending|assets_list|asset_get|agent_brief|studio_status)/.test(name)) {
        const brief = JSON.stringify(args || {}, (k, v) => (typeof v === 'string' && v.length > 80 ? v.slice(0, 77) + '…' : Array.isArray(v) && v.length > 6 ? `[${v.length} items]` : v));
        studioApp.processLog?.log(`Agent → ${name.replace(/^ams_/, '')} ${brief === '{}' ? '' : brief}`, 'agent');
      }
      if (STUDIO_TOOL_MAP[name]) return STUDIO_TOOL_MAP[name].run(studioApp, args || {});
      switch (name) {
        case 'ams_generate': {
          const cands = await bridge.generate(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: `Generated ${cands.length} candidates.`,
                  candidates: cands.map((c, i) => ({
                    index: i,
                    tag: String.fromCharCode(65 + i),
                    id: c.id,
                    actionCount: c.program?.actions?.length || 0,
                    generationTimeMs: c.renderMetadata?.executionTimeMs || 0
                  }))
                }, null, 2)
              }
            ]
          };
        }

        case 'ams_render_program': {
          const result = await bridge.renderProgram(args.program, { medium: args.medium });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  actionCount: result.actionCount,
                  renderTimeMs: result.renderTimeMs,
                  medium: result.medium,
                  hasImage: Boolean(result.image),
                  imageSnippet: result.image?.slice(0, 100) + '...'
                }, null, 2)
              }
            ]
          };
        }

        case 'ams_set_program': {
          const res = await bridge.setProgram(args.program);
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        case 'ams_get_studio_state': {
          const state = bridge.getStudioState();
          return {
            content: [{ type: 'text', text: JSON.stringify(state, null, 2) }]
          };
        }

        case 'ams_select_candidate': {
          const res = bridge.selectCandidate(args.candidate);
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        case 'ams_rate_candidate': {
          const res = bridge.rateCandidate(args.candidate, args.rating);
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        case 'ams_critique': {
          const cands = await bridge.critique(args.feedback, args.candidate ?? 0);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: `Refined variations generated for critique: "${args.feedback}".`,
                  candidateCount: cands.length
                }, null, 2)
              }
            ]
          };
        }

        case 'ams_evaluate_rewards': {
          const scores = bridge.evaluateRewards(args.program);
          return {
            content: [{ type: 'text', text: JSON.stringify(scores, null, 2) }]
          };
        }

        case 'ams_interrupt': {
          const res = bridge.interrupt();
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        case 'ams_get_candidate': {
          const cand = bridge.getCandidate(args.candidate);
          if (!cand) throw new Error(`Candidate not found.`);
          return {
            content: [{ type: 'text', text: JSON.stringify(cand, null, 2) }]
          };
        }

        case 'ams_grade_candidates': {
          const res = bridge.gradeCandidates(args.grades, args.chosenCandidate);
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        case 'ams_get_dataset': {
          const dataset = bridge.getDataset(args.type, args.filter);
          return {
            content: [{ type: 'text', text: JSON.stringify(dataset, null, 2) }]
          };
        }

        case 'ams_train_model': {
          const res = await bridge.trainModel(args);
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        case 'ams_export_model': {
          const res = bridge.exportModel(args.modelId);
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        case 'ams_import_model': {
          const res = bridge.importModel(args.modelData, args.selectImmediately ?? true);
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        case 'ams_list_trained_models': {
          const list = bridge.listTrainedModels();
          return {
            content: [{ type: 'text', text: JSON.stringify(list, null, 2) }]
          };
        }

        case 'ams_estimate_training': {
          const res = bridge.getTrainingEstimates(args);
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
          };
        }

        default:
          throw new Error(`Unknown WebMCP tool: ${name}`);
      }
    }
  };

  // Attach to window for direct console / DevTools / in-page agent scripting
  window.ams = bridge;
  window.webmcp = bridge;

  // WebMCP (navigator.modelContext) where the browser supports it.
  try {
    const mc = navigator.modelContext;
    if (mc?.provideContext) {
      mc.provideContext({
        tools: bridge.listTools().map(t => ({ ...t, execute: async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await bridge.callTool(t.name, args)) }] }) }))
      });
    }
  } catch (err) { console.warn('WebMCP registration failed', err); }

  // Dev relay: external MCP clients (src/mcp/mcpServer.js) reach this tab through the
  // dev server (vite.config.js, /__ams/*) by HTTP long-polling.
  if (import.meta.env?.DEV && typeof document !== 'undefined' && !import.meta.env?.VITEST) {
    const tab = Math.random().toString(36).slice(2);
    const hello = () => fetch('/__ams/hello', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab, title: document.title, url: location.href, tools: bridge.listTools() }) }).catch(() => {});
    const handle = async ({ id, name, args }) => {
      let body;
      try {
        const result = name === 'tools/list' ? bridge.listTools() : await bridge.callTool(name, args);
        body = { id, result: JSON.parse(JSON.stringify(result ?? null)) };
      } catch (err) {
        body = { id, error: err?.message || String(err) };
      }
      fetch('/__ams/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    };
    (async function poll() {
      await hello();
      for (;;) {
        try {
          const res = await fetch(`/__ams/poll?tab=${tab}`);
          if (res.status === 404) { await hello(); continue; }
          if (res.status === 200) handle(await res.json()); // don't await: calls run concurrently
        } catch {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    })();
  }

  // WebMCP PostMessage JSON-RPC 2.0 Dispatcher
  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object' || data.jsonrpc !== '2.0') return;

    const { id, method, params } = data;

    try {
      if (method === 'tools/list') {
        event.source?.postMessage({
          jsonrpc: '2.0',
          id,
          result: { tools: bridge.listTools() }
        }, event.origin === 'null' ? '*' : event.origin);
      } else if (method === 'tools/call') {
        const res = await bridge.callTool(params?.name, params?.arguments);
        event.source?.postMessage({
          jsonrpc: '2.0',
          id,
          result: res
        }, event.origin === 'null' ? '*' : event.origin);
      } else if (method === 'ping') {
        event.source?.postMessage({
          jsonrpc: '2.0',
          id,
          result: 'pong'
        }, event.origin === 'null' ? '*' : event.origin);
      }
    } catch (err) {
      event.source?.postMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err.message }
      }, event.origin === 'null' ? '*' : event.origin);
    }
  });

  return bridge;
}
