import { describe, it, expect } from 'vitest';
import {
  HARDWARE_PRESETS,
  MODEL_SPECS,
  estimateTrainingResources
} from '../src/training/trainingEstimates.js';

describe('Training Estimates & Hardware Profiles', () => {
  it('contains Apple M5 Max with 128GB Unified Memory preset', () => {
    const m5 = HARDWARE_PRESETS.find(h => h.id === 'm5-max');
    expect(m5).toBeDefined();
    expect(m5.memoryGB).toBe(128);
    expect(m5.cores).toBe(18);
    expect(m5.isCurrentMachine).toBe(true);
  });

  it('estimates training resources for SmolLM2-135M on M5 Max', () => {
    const estimate = estimateTrainingResources({
      modelId: 'HuggingFaceTB/SmolLM2-135M-Instruct',
      hardwareId: 'm5-max',
      sampleCount: 50,
      epochs: 6
    });

    expect(estimate).toBeDefined();
    expect(estimate.model.name).toContain('SmolLM2');
    expect(estimate.hardware.id).toBe('m5-max');
    expect(parseFloat(estimate.totalMemoryGB)).toBeLessThan(1.0); // < 1 GB
    expect(estimate.feasibility).toBe('Optimal');
    expect(estimate.feasibilityNote).toContain('128 GB');
    expect(estimate.effectiveTokensPerSec).toBeGreaterThan(10000);
  });

  it('correctly calculates 70B QLoRA memory and validates M5 Max headroom', () => {
    const estimate = estimateTrainingResources({
      modelId: 'meta-llama/Llama-3.3-70B-Instruct',
      hardwareId: 'm5-max',
      sampleCount: 50,
      epochs: 6,
      precision: '4bit'
    });

    // 70B 4-bit uses ~44 GB, which is ~34% of 128 GB
    expect(parseFloat(estimate.totalMemoryGB)).toBeGreaterThan(40);
    expect(parseFloat(estimate.totalMemoryGB)).toBeLessThan(55);
    expect(estimate.feasibility).toBe('Optimal');
    expect(estimate.feasibilityNote).toContain('128 GB M5 Max unified memory');
  });

  it('detects models unsupported in WebGPU browser shader pipeline', () => {
    const estimate = estimateTrainingResources({
      modelId: 'meta-llama/Llama-3.3-70B-Instruct',
      hardwareId: 'browser-webgpu'
    });

    expect(estimate.estimatedSeconds).toBe(-1);
    expect(estimate.feasibility).toBe('Unsupported');
    expect(estimate.feasibilityNote).toContain('too large for in-browser WebGPU');
  });

  it('calculates in-browser pure JS duration using measured empirical speed', () => {
    const estimate = estimateTrainingResources({
      modelId: 'HuggingFaceTB/SmolLM2-135M-Instruct',
      hardwareId: 'browser-pure-js',
      sampleCount: 4,
      epochs: 100
    });

    // 4 samples * 100 epochs * 13.4 ms = ~5.36s
    expect(estimate.estimatedSeconds).toBeGreaterThan(4.0);
    expect(estimate.estimatedSeconds).toBeLessThan(7.0);
    expect(estimate.timeFormatted).toContain('seconds');
  });
});
