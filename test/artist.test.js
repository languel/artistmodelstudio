import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '../src/artists/promptBuilder.js';
import { MockArtist } from '../src/artists/MockArtist.js';
import { defaultArtistRegistry } from '../src/artists/artistRegistry.js';

describe('Artist Layer', () => {
  it('builds proper system prompts per medium', () => {
    const flatCaps = { id: 'flat', coordinateSystem: 'normalized', core: ['circle'] };
    const flatPrompt = buildSystemPrompt(flatCaps);
    expect(flatPrompt).toContain('-1.0 to 1.0');
    expect(flatPrompt).not.toContain('WATERCOLOR EXTENSIONS');

    const waterCaps = { id: 'watercolor', coordinateSystem: 'normalized', core: ['circle'], extensions: ['brush.bleed'] };
    const waterPrompt = buildSystemPrompt(waterCaps);
    expect(waterPrompt).toContain('WATERCOLOR EXTENSIONS');
    expect(waterPrompt).toContain('brush.bleed');

    const pixelCaps = { id: 'pixel', coordinateSystem: 'pixel', dimensions: { cols: 32, rows: 48 } };
    const pixelPrompt = buildSystemPrompt(pixelCaps);
    expect(pixelPrompt).toContain('32x48 pixel grid');
    expect(pixelPrompt).toContain('mirrorX');
  });

  it('MockArtist generates 4 candidates for vector media', async () => {
    const artist = new MockArtist();
    const candidates = await artist.generate({
      prompt: 'three red flowers',
      count: 4,
      mediumCapabilities: { id: 'flat', coordinateSystem: 'normalized' }
    });

    expect(candidates.length).toBe(4);
    for (const cand of candidates) {
      expect(cand.program.version).toBe(1);
      expect(cand.program.actions.length).toBeGreaterThan(3);
      expect(cand.generationTimeMs).toBeGreaterThan(0);
    }
  });

  it('MockArtist generates pixel candidates for pixel media', async () => {
    const artist = new MockArtist();
    const candidates = await artist.generate({
      prompt: 'red flower sprite',
      count: 4,
      mediumCapabilities: { id: 'pixel', coordinateSystem: 'pixel', dimensions: { cols: 32, rows: 48 } }
    });

    expect(candidates.length).toBe(4);
    const actions = candidates[0].program.actions;
    const ops = actions.map(a => a.op);
    expect(ops).toContain('palette');
    expect(ops).toContain('rect');
  });

  it('MockArtist generates variations maintaining parent lineage', async () => {
    const artist = new MockArtist();
    const parent = {
      version: 1,
      actions: [
        { op: 'background', color: '#ffffff' },
        { op: 'circle', x: 0, y: 0, diameter: 0.5 }
      ]
    };

    const candidates = await artist.generate({
      prompt: 'a circle',
      count: 4,
      previousProgram: parent,
      mediumCapabilities: { id: 'flat', coordinateSystem: 'normalized' }
    });

    expect(candidates.length).toBe(4);
    // Actions should vary slightly around 0, 0
    expect(candidates[0].program.actions[1].op).toBe('circle');
  });

  it('artist registry lists all artists', () => {
    const list = defaultArtistRegistry.list();
    const ids = list.map(a => a.id);
    expect(ids).toContain('mock');
    expect(ids).toContain('openrouter');
    expect(ids).toContain('openai');
    expect(ids).toContain('ollama');
    expect(ids).toContain('webgpu');
  });

  it('all artists support getModel, setModel, and getAvailableModels', () => {
    const openrouter = defaultArtistRegistry.get('openrouter');
    expect(openrouter.getModel()).toBeDefined();
    expect(openrouter.getAvailableModels().length).toBeGreaterThan(0);
    openrouter.setModel('openai/gpt-4o');
    expect(openrouter.getModel()).toBe('openai/gpt-4o');

    const openai = defaultArtistRegistry.get('openai');
    expect(openai.getModel()).toBeDefined();
    expect(openai.getAvailableModels().length).toBeGreaterThan(0);
    openai.setModel('chatgpt-4o-latest');
    expect(openai.getModel()).toBe('chatgpt-4o-latest');

    const ollama = defaultArtistRegistry.get('ollama');
    expect(ollama.getModel()).toBeDefined();
    expect(ollama.getAvailableModels().length).toBeGreaterThan(0);
    ollama.setModel('llama3.2:latest');
    expect(ollama.getModel()).toBe('llama3.2:latest');

    const webgpu = defaultArtistRegistry.get('webgpu');
    expect(webgpu.getModel()).toBeDefined();
    expect(webgpu.getAvailableModels().length).toBeGreaterThan(0);
    webgpu.setModel('onnx-community/LFM2-350M-ONNX');
    expect(webgpu.getModel()).toBe('onnx-community/LFM2-350M-ONNX');
  });

  it('webgpu artist provides full suite of Liquid AI models', () => {
    const webgpu = defaultArtistRegistry.get('webgpu');
    const models = webgpu.getAvailableModels();
    const modelIds = models.map(m => m.id);

    expect(modelIds).toContain('onnx-community/LFM2-350M-ONNX');
    expect(modelIds).toContain('onnx-community/LFM2.5-350M-ONNX');
    expect(modelIds).toContain('onnx-community/LFM2.5-VL-450M-ONNX');
    expect(modelIds).toContain('onnx-community/LFM2-700M-ONNX');
    expect(modelIds).toContain('onnx-community/LFM2-1.2B-ONNX');
    expect(modelIds).toContain('LiquidAI/LFM2.5-1.2B-Instruct-ONNX');
    expect(modelIds).toContain('LiquidAI/LFM2.5-VL-3B-ONNX');

    const lfm350 = models.find(m => m.id === 'onnx-community/LFM2-350M-ONNX');
    expect(lfm350.group).toContain('Liquid AI');
    expect(lfm350.isLiquid).toBe(true);

    const vl450 = models.find(m => m.id === 'onnx-community/LFM2.5-VL-450M-ONNX');
    expect(vl450.isVL).toBe(true);
  });

  it('webgpu artist provides Gemma 4 and Qwen 3.5 models with optimal dtype detection', () => {
    const webgpu = defaultArtistRegistry.get('webgpu');
    const models = webgpu.getAvailableModels();
    const modelIds = models.map(m => m.id);

    // Gemma 4
    expect(modelIds).toContain('google/gemma-4-E2B-it-qat-mobile-transformers');
    expect(modelIds).toContain('onnx-community/gemma-4-E2B-it-webgpu');
    const gemma4 = models.find(m => m.id === 'google/gemma-4-E2B-it-qat-mobile-transformers');
    expect(gemma4.group).toContain('Gemma 4');
    expect(gemma4.isGemma4).toBe(true);

    // Qwen 3.5
    expect(modelIds).toContain('onnx-community/Qwen3.5-0.8B-ONNX-OPT');
    expect(modelIds).toContain('onnx-community/Qwen3.5-2B-ONNX-OPT');
    expect(modelIds).toContain('onnx-community/Qwen3.5-4B-ONNX-OPT');
    const qwen08 = models.find(m => m.id === 'onnx-community/Qwen3.5-0.8B-ONNX-OPT');
    expect(qwen08.group).toContain('Qwen 3.5');
    expect(qwen08.isQwen35).toBe(true);
  });

  it('builds compact system prompt for edge models', () => {
    const caps = { id: 'flat', coordinateSystem: 'normalized', core: ['circle'] };
    const standardPrompt = buildSystemPrompt(caps, { compact: false });
    const compactPrompt = buildSystemPrompt(caps, { compact: true });

    expect(compactPrompt.length).toBeLessThan(standardPrompt.length);
    expect(compactPrompt).toContain('Output strictly valid JSON');
    expect(compactPrompt).toContain('Normalized 2D space from -1.0 to 1.0');

    const pixelCaps = { id: 'pixel', coordinateSystem: 'pixel', dimensions: { cols: 32, rows: 48 } };
    const compactPixel = buildSystemPrompt(pixelCaps, { compact: true });
    expect(compactPixel).toContain('32x48 grid');
    expect(compactPixel).toContain('palette');
  });
});

