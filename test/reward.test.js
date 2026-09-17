import { describe, it, expect } from 'vitest';
import { evaluateReward } from '../src/rewards/combine.js';
import { PolicyOptimizer } from '../src/rewards/policySearch.js';

describe('Deterministic Reward Lab', () => {
  it('evaluates reward terms accurately', () => {
    const program = {
      version: 1,
      actions: [
        { op: 'background', color: '#ffffff' },
        { op: 'fill', color: '#ff0000', opacity: 1 },
        { op: 'circle', x: -0.8, y: 0, diameter: 0.1 },
        { op: 'circle', x: -0.7, y: 0.1, diameter: 0.1 },
        { op: 'circle', x: -0.6, y: -0.1, diameter: 0.1 }
      ]
    };

    const res = evaluateReward(program);
    expect(res.breakdown.valid).toBe(1.0);
    expect(res.breakdown.redness).toBeGreaterThan(0.8);
    expect(res.breakdown.leftness).toBeGreaterThan(0.8);
    expect(res.breakdown.shapeCount).toBe(1.0); // 3 shapes match target 3
    expect(res.breakdown.emptySpace).toBeGreaterThan(0.9);
    expect(res.total).toBeGreaterThan(0.8);
  });

  it('runs policy optimization and discovers higher reward', () => {
    const optimizer = new PolicyOptimizer({ targetShapes: 3 });
    const initial = optimizer.step();
    const later = optimizer.runEpisodes(5);
    const last = later[later.length - 1];

    expect(last.step).toBe(6);
    expect(last.bestReward).toBeGreaterThanOrEqual(0.4);
    expect(last.bestProgram.actions.length).toBeGreaterThan(0);
  });
});
