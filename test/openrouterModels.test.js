import { describe, it, expect, beforeEach } from 'vitest';
import {
  OpenRouterArtist,
  isFreeModel,
  DEFAULT_OPENROUTER_FAVORITES,
  OPENROUTER_CURATED_FREE_MODELS,
  OPENROUTER_FRONTIER_MODELS
} from '../src/artists/OpenRouterArtist.js';
import { WEBGPU_MODEL_PRESETS, WebGPUTransformersArtist } from '../src/artists/WebGPUTransformersArtist.js';
import { WatercolorMedium } from '../src/media/WatercolorMedium.js';
import { FlatCanvasMedium } from '../src/media/FlatCanvasMedium.js';

describe('OpenRouter Models, Search & Favorites', () => {
  let artist;

  beforeEach(() => {
    artist = new OpenRouterArtist();
  });

  it('detects free models accurately', () => {
    expect(isFreeModel('liquid/lfm-2.5-2.6b:free')).toBe(true);
    expect(isFreeModel('google/gemma-4-31b-it:free')).toBe(true);
    expect(isFreeModel({ id: 'openrouter/free', pricing: { prompt: '0', completion: '0' } })).toBe(true);
    expect(isFreeModel({ id: 'custom-model', pricing: { prompt: '0', completion: '0' } })).toBe(true);
    expect(isFreeModel('anthropic/claude-3.5-sonnet')).toBe(false);
    expect(isFreeModel({ id: 'openai/gpt-4o', pricing: { prompt: '0.000005', completion: '0.000015' } })).toBe(false);
  });

  it('seeds default favorites mostly with :free models', () => {
    const favs = artist.getFavorites();
    expect(favs.length).toBeGreaterThan(0);
    const freeCount = favs.filter(id => id.endsWith(':free') || id === 'openrouter/free').length;
    expect(freeCount).toBeGreaterThanOrEqual(4); // mostly free!
  });

  it('toggles favorites and persists state', () => {
    const testModel = 'test/new-experimental-model:free';
    expect(artist.isFavorite(testModel)).toBe(false);

    const added = artist.toggleFavorite(testModel);
    expect(added).toBe(true);
    expect(artist.isFavorite(testModel)).toBe(true);
    expect(artist.getFavorites()).toContain(testModel);

    const removed = artist.toggleFavorite(testModel);
    expect(removed).toBe(false);
    expect(artist.isFavorite(testModel)).toBe(false);
  });

  it('searches models with query and onlyFree filter', () => {
    const freeOnly = artist.searchModels({ onlyFree: true });
    expect(freeOnly.length).toBeGreaterThan(0);
    for (const m of freeOnly) {
      expect(m.isFree).toBe(true);
    }

    const liquidModels = artist.searchModels({ query: 'liquid' });
    expect(liquidModels.length).toBeGreaterThan(0);
    expect(liquidModels.some(m => m.id.includes('liquid'))).toBe(true);

    const favsOnly = artist.searchModels({ onlyFavorites: true });
    expect(favsOnly.length).toBe(artist.getFavorites().length);
    for (const m of favsOnly) {
      expect(m.isFavorite).toBe(true);
    }
  });

  it('groups available models into favorites, free models, and frontier', () => {
    const models = artist.getAvailableModels();
    expect(models.length).toBeGreaterThan(0);

    const groups = new Set(models.map(m => m.group));
    expect(groups.has('Favorites (Mostly Free)')).toBe(true);
    expect(groups.has('🆓 Free Models (:free)')).toBe(true);
    expect(groups.has('Cloud Frontier & Other')).toBe(true);
  });
});

describe('WebGPU Expanded Model Presets', () => {
  it('includes lightweight, midweight code specialists, and high VRAM models', () => {
    expect(WEBGPU_MODEL_PRESETS.length).toBeGreaterThanOrEqual(15);

    const ids = WEBGPU_MODEL_PRESETS.map(p => p.id);
    expect(ids).toContain('onnx-community/LFM2-350M-ONNX');
    expect(ids).toContain('onnx-community/LFM2.5-VL-450M-ONNX');
    expect(ids).toContain('LiquidAI/LFM2.5-VL-3B-ONNX');

    // Gemma 4 presets
    expect(ids).toContain('google/gemma-4-E2B-it-qat-mobile-transformers');
    expect(ids).toContain('onnx-community/gemma-4-E2B-it-webgpu');

    // Qwen 3.5 presets
    expect(ids).toContain('onnx-community/Qwen3.5-0.8B-ONNX-OPT');
    expect(ids).toContain('onnx-community/Qwen3.5-2B-ONNX-OPT');
    expect(ids).toContain('onnx-community/Qwen3.5-4B-ONNX-OPT');
    expect(ids).toContain('onnx-community/Qwen3.5-0.8B-ONNX');

    expect(ids).toContain('HuggingFaceTB/SmolLM2-135M-Instruct');
    expect(ids).toContain('HuggingFaceTB/SmolLM2-360M-Instruct');
    expect(ids).toContain('onnx-community/Qwen2.5-Coder-0.5B-Instruct');
    expect(ids).toContain('onnx-community/Qwen2.5-Coder-1.5B-Instruct');
    expect(ids).toContain('onnx-community/Llama-3.2-1B-Instruct');
    expect(ids).toContain('onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX');
  });

  it('WebGPUTransformersArtist returns available models with custom support', () => {
    const artist = new WebGPUTransformersArtist();
    const models = artist.getAvailableModels();
    expect(models.length).toBeGreaterThanOrEqual(15);

    artist.setModel('custom-org/custom-model-onnx');
    const updated = artist.getAvailableModels();
    expect(updated.some(m => m.id === 'custom-org/custom-model-onnx')).toBe(true);
  });
});

describe('Aspect Ratio and Coordinate Centering', () => {
  it('centers normalized (0,0) at exact canvas center (width/2, height/2)', () => {
    const watercolor = new WatercolorMedium({ width: 1024, height: 1024 });
    // Watercolor uses WebGL mode with center at (0, 0) spanning [-w/2, w/2]
    expect(watercolor.toX(0)).toBe(0);
    expect(watercolor.toY(0)).toBe(0);
    expect(watercolor.toX(-1)).toBe(-512);
    expect(watercolor.toX(1)).toBe(512);
    expect(watercolor.toY(-1)).toBe(-512);
    expect(watercolor.toY(1)).toBe(512);

    // Flat canvas uses 2D canvas mode with top-left origin spanning [0, w]
    const flat = new FlatCanvasMedium({ width: 1024, height: 1024 });
    expect(flat.toX(0)).toBe(512);
    expect(flat.toY(0)).toBe(512);
    expect(flat.toX(-1)).toBe(0);
    expect(flat.toX(1)).toBe(1024);
    expect(flat.toY(-1)).toBe(0);
    expect(flat.toY(1)).toBe(1024);
  });
});
