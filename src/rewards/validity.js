/**
 * Program Validity Reward
 */

import { validateProgram } from '../language/validate.js';

export function computeValidityReward(program, capabilities) {
  const res = validateProgram(program, capabilities);
  if (!res.valid) return 0;
  if (!program.actions || program.actions.length === 0) return 0.2;
  return 1.0;
}
