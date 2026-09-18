/**
 * AMS Model Format Specification & Serialization
 *
 * Provides a standardized, portable container (.ams-model.json) for
 * in-browser trained models, Low-Rank Adapters (LoRA), and fine-tuned policies.
 */

export const AMS_MODEL_VERSION = 1;

/**
 * Validates whether an object conforms to the AMS Model Specification.
 */
export function validateModelFormat(model) {
  if (!model || typeof model !== 'object') {
    return { valid: false, error: 'Model payload must be an object' };
  }
  if (model.type !== 'ams-model') {
    return { valid: false, error: 'Model type must be "ams-model"' };
  }
  if (!model.id || typeof model.id !== 'string') {
    return { valid: false, error: 'Model requires a non-empty string id' };
  }
  if (!model.name || typeof model.name !== 'string') {
    return { valid: false, error: 'Model requires a string name' };
  }
  if (!model.baseModel || typeof model.baseModel !== 'string') {
    return { valid: false, error: 'Model requires a baseModel specification' };
  }
  if (!model.weights || typeof model.weights !== 'object') {
    return { valid: false, error: 'Model requires a weights object' };
  }
  return { valid: true };
}

/**
 * Creates a standardized AMS model object.
 */
export function createAmsModel({
  id,
  name,
  baseModel = 'HuggingFaceTB/SmolLM2-135M-Instruct',
  architecture = 'lora-r4',
  targetMedium = 'watercolor',
  hyperparameters = {},
  weights = {},
  trainingMetrics = {},
  specializedPrompt = '',
  exemplarActions = []
}) {
  const modelId = id || `trained/${(name || 'custom-model').toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${Date.now().toString(36)}`;
  
  return {
    version: AMS_MODEL_VERSION,
    type: 'ams-model',
    id: modelId,
    name: name || 'Custom In-Browser Model',
    baseModel,
    architecture, // 'lora-r4' | 'lora-r8' | 'nano-policy'
    targetMedium,
    hyperparameters: {
      rank: 4,
      alpha: 8,
      learningRate: 0.001,
      epochs: 5,
      batchSize: 1,
      ...hyperparameters
    },
    weights,
    trainingMetrics: {
      finalLoss: 0,
      epochsCompleted: 0,
      samplesCount: 0,
      lossHistory: [],
      trainedAt: new Date().toISOString(),
      ...trainingMetrics
    },
    specializedPrompt,
    exemplarActions,
    createdAt: new Date().toISOString()
  };
}

const STORAGE_KEY = 'ams_trained_models';
const inMemoryCache = [];

/**
 * Returns all saved trained models from persistent local storage or in-memory cache.
 */
export function getSavedModels() {
  if (typeof localStorage === 'undefined') {
    return inMemoryCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return inMemoryCache;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : inMemoryCache;
  } catch (e) {
    console.error('Failed to parse saved models from localStorage:', e);
    return inMemoryCache;
  }
}

/**
 * Saves or updates a trained model in local storage and in-memory cache.
 */
export function saveTrainedModel(model) {
  const validation = validateModelFormat(model);
  if (!validation.valid) {
    throw new Error(`Invalid model format: ${validation.error}`);
  }

  const existing = getSavedModels();
  const index = existing.findIndex(m => m.id === model.id);
  if (index >= 0) {
    existing[index] = model;
  } else {
    existing.push(model);
  }

  const memIndex = inMemoryCache.findIndex(m => m.id === model.id);
  if (memIndex >= 0) {
    inMemoryCache[memIndex] = model;
  } else {
    inMemoryCache.push(model);
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch (e) {
      console.warn('Failed to save model to localStorage, using in-memory cache:', e);
    }
  }
  return model;
}

/**
 * Removes a saved trained model by ID.
 */
export function deleteTrainedModel(modelId) {
  const existing = getSavedModels();
  const filtered = existing.filter(m => m.id !== modelId);
  const memIndex = inMemoryCache.findIndex(m => m.id === modelId);
  if (memIndex >= 0) inMemoryCache.splice(memIndex, 1);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      // ignore
    }
  }
  return filtered;
}

/**
 * Clears all saved models from memory and storage.
 */
export function clearSavedModels() {
  inMemoryCache.length = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Serializes model to downloadable JSON string.
 */
export function exportModelToJSON(model) {
  const validation = validateModelFormat(model);
  if (!validation.valid) {
    throw new Error(`Cannot export invalid model: ${validation.error}`);
  }
  return JSON.stringify(model, null, 2);
}

/**
 * Parses and validates an imported JSON string into a model object.
 */
export function importModelFromJSON(jsonString) {
  let parsed;
  try {
    parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
  } catch (e) {
    throw new Error(`Failed to parse model JSON: ${e.message}`);
  }

  const validation = validateModelFormat(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid model package: ${validation.error}`);
  }

  saveTrainedModel(parsed);
  return parsed;
}
