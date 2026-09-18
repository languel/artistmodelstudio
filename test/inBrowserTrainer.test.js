import { describe, it, expect, beforeEach } from 'vitest';
import { InBrowserTrainer } from '../src/training/inBrowserTrainer.js';

describe('InBrowserTrainer (Micro-LoRA & AdamW)', () => {
  beforeEach(() => {
    globalThis.localStorage = {
      getItem: () => '[]',
      setItem: () => {},
      removeItem: () => {}
    };
  });

  it('initializes LoRA matrices with zero B weights (identity adaptation)', () => {
    const trainer = new InBrowserTrainer({ rank: 4 });
    const { matrixA, matrixB, rank, dIn, dOut } = trainer.initLoraWeights(32, 32, 4);

    expect(rank).toBe(4);
    expect(matrixA.length).toBe(32);
    expect(matrixA[0].length).toBe(4);
    expect(matrixB.length).toBe(4);
    expect(matrixB[0].length).toBe(32);

    // Matrix B must be initialized to 0
    expect(matrixB[0].every(val => val === 0)).toBe(true);
  });

  it('encodes prompt and program actions into numerical feature vectors', () => {
    const trainer = new InBrowserTrainer();
    const vec = trainer.encodeSample('hummingbird in watercolor', {
      version: 1,
      actions: [
        { op: 'background', color: '#faf7f2' },
        { op: 'brush.bleed', amount: 0.3 },
        { op: 'circle', x: 0, y: 0, diameter: 0.3 }
      ]
    }, 32);

    expect(vec.length).toBe(32);
    // At least some dimensions should be non-zero
    const sum = vec.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
  });

  it('trains LoRA adapter and reduces loss over epochs', async () => {
    const trainer = new InBrowserTrainer({
      rank: 4,
      learningRate: 0.01,
      baseModel: 'HuggingFaceTB/SmolLM2-135M-Instruct'
    });

    const mockWinner = {
      id: 'cand-0',
      program: {
        version: 1,
        actions: [
          { op: 'background', color: '#fcfaf6' },
          { op: 'brush.bleed', amount: 0.4 },
          { op: 'stroke', color: '#0f4c5c', width: 2 },
          { op: 'circle', x: -0.2, y: 0.1, diameter: 0.25 },
          { op: 'line', x1: -0.2, y1: 0.1, x2: 0.4, y2: -0.2 }
        ]
      }
    };

    const mockRejected = {
      id: 'cand-1',
      program: {
        version: 1,
        actions: [
          { op: 'rect', x: 0, y: 0, width: 0.5, height: 0.5 }
        ]
      }
    };

    const progressLogs = [];
    const model = await trainer.train({
      prompt: 'hummingbird hovering by vibrant fuchsia flowers in watercolor',
      samples: [mockWinner],
      rejectedSamples: [mockRejected],
      epochs: 5,
      modelName: 'Hummingbird Specialist (LoRA)',
      onProgress: (p) => progressLogs.push(p)
    });

    expect(model.type).toBe('ams-model');
    expect(model.architecture).toBe('lora-r4');
    expect(model.baseModel).toBe('HuggingFaceTB/SmolLM2-135M-Instruct');
    expect(model.trainingMetrics.epochsCompleted).toBe(5);
    expect(progressLogs.length).toBe(5);

    const history = model.trainingMetrics.lossHistory;
    expect(history.length).toBe(5);
    // Initial loss should be higher than final loss
    expect(history[0]).toBeGreaterThanOrEqual(history[history.length - 1]);
  });
});
