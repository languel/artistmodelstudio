import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAmsModel,
  validateModelFormat,
  exportModelToJSON,
  importModelFromJSON,
  saveTrainedModel,
  getSavedModels,
  deleteTrainedModel,
  clearSavedModels
} from '../src/training/modelFormat.js';

describe('AMS Model Format & Serialization', () => {
  let mockStorage = {};

  beforeEach(() => {
    clearSavedModels();
    mockStorage = {};
    const fakeLocalStorage = {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => { mockStorage[key] = String(val); },
      removeItem: (key) => { delete mockStorage[key]; }
    };
    globalThis.localStorage = fakeLocalStorage;
  });

  it('creates and validates a standard AMS model container', () => {
    const model = createAmsModel({
      name: 'Hummingbird Specialist',
      baseModel: 'HuggingFaceTB/SmolLM2-135M-Instruct',
      architecture: 'lora-r4',
      weights: { matrixA: [[0.1, 0.2]], matrixB: [[0.0], [0.0]] },
      trainingMetrics: { finalLoss: 0.042, epochsCompleted: 6 },
      specializedPrompt: 'hummingbird'
    });

    expect(model.type).toBe('ams-model');
    expect(model.id).toContain('hummingbird-specialist');
    expect(model.hyperparameters.rank).toBe(4);
    expect(model.hyperparameters.alpha).toBe(8);

    const check = validateModelFormat(model);
    expect(check.valid).toBe(true);
  });

  it('rejects malformed model payloads', () => {
    expect(validateModelFormat(null).valid).toBe(false);
    expect(validateModelFormat({ type: 'other' }).valid).toBe(false);
    expect(validateModelFormat({ type: 'ams-model', id: '1' }).valid).toBe(false);
  });

  it('exports and imports model JSON consistently', () => {
    const model = createAmsModel({
      name: 'Watercolor Flower Adapter',
      baseModel: 'HuggingFaceTB/SmolLM2-135M-Instruct',
      weights: { test: 123 },
      specializedPrompt: 'flower'
    });

    const json = exportModelToJSON(model);
    expect(typeof json).toBe('string');
    expect(json).toContain('Watercolor Flower Adapter');

    const imported = importModelFromJSON(json);
    expect(imported.id).toBe(model.id);
    expect(imported.name).toBe('Watercolor Flower Adapter');

    const saved = getSavedModels();
    expect(saved.length).toBe(1);
    expect(saved[0].id).toBe(model.id);
  });

  it('saves, lists, and deletes trained models in persistent storage', () => {
    const m1 = createAmsModel({ id: 'm1', name: 'Model 1', weights: {} });
    const m2 = createAmsModel({ id: 'm2', name: 'Model 2', weights: {} });

    saveTrainedModel(m1);
    saveTrainedModel(m2);

    expect(getSavedModels().length).toBe(2);

    deleteTrainedModel('m1');
    const remaining = getSavedModels();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('m2');
  });
});
