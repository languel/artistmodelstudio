/**
 * Composite Reward Calculator
 */

import { computeValidityReward } from './validity.js';
import { computeColorScores } from './color.js';
import { computeCompositionScores } from './composition.js';

export const DEFAULT_REWARD_WEIGHTS = {
  valid: 0.20,
  redness: 0.20,
  leftness: 0.20,
  shapeCount: 0.20,
  emptySpace: 0.20
};

export function evaluateReward(program, options = {}) {
  const weights = { ...DEFAULT_REWARD_WEIGHTS, ...(options.weights || {}) };
  const targetShapes = options.targetShapes ?? 3;
  const capabilities = options.capabilities || null;

  const validScore = computeValidityReward(program, capabilities);
  const color = computeColorScores(program);
  const comp = computeCompositionScores(program, targetShapes);

  const breakdown = {
    valid: validScore,
    redness: color.redness,
    leftness: comp.leftness,
    shapeCount: comp.shapeCountScore,
    emptySpace: comp.emptySpace,
    details: {
      blueness: color.blueness,
      greenness: color.greenness,
      actualShapes: comp.shapeCount,
      centeredness: comp.centeredness,
      symmetry: comp.symmetry
    }
  };

  const totalWeight =
    weights.valid +
    weights.redness +
    weights.leftness +
    weights.shapeCount +
    weights.emptySpace;

  const totalScore =
    (breakdown.valid * weights.valid +
      breakdown.redness * weights.redness +
      breakdown.leftness * weights.leftness +
      breakdown.shapeCount * weights.shapeCount +
      breakdown.emptySpace * weights.emptySpace) / (totalWeight || 1.0);

  return {
    total: Number(totalScore.toFixed(3)),
    breakdown,
    weights
  };
}
