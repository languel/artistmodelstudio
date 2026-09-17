/**
 * Fast Classroom RL Policy Search & Reward-Hacking Demonstrator
 *
 * Runs a fast parameter-policy optimization loop directly in the browser
 * to demonstrate state, action, reward, and policy updates, as well as
 * real reward-hacking (e.g. discovering microscopic dots to maximize empty space + redness).
 */

import { evaluateReward } from './combine.js';

export class PolicyOptimizer {
  constructor(options = {}) {
    this.targetShapes = options.targetShapes ?? 3;
    this.weights = options.weights || null;

    // Policy parameters: [x, y, diameter, redIntensity, count]
    this.policy = {
      x: -0.1,
      y: 0.0,
      diameter: 0.3,
      red: 0.8,
      count: 3
    };

    this.history = [];
    this.learningRate = options.learningRate || 0.15;
  }

  sampleAction(policy, noiseScale = 0.1) {
    return {
      x: Math.max(-0.95, Math.min(0.95, policy.x + (Math.random() - 0.5) * noiseScale * 2)),
      y: Math.max(-0.95, Math.min(0.95, policy.y + (Math.random() - 0.5) * noiseScale * 2)),
      diameter: Math.max(0.01, Math.min(0.8, policy.diameter + (Math.random() - 0.5) * noiseScale)),
      red: Math.max(0.2, Math.min(1.0, policy.red + (Math.random() - 0.5) * noiseScale)),
      count: policy.count
    };
  }

  actionToProgram(action) {
    const hexRed = Math.floor(action.red * 255).toString(16).padStart(2, '0');
    const color = `#${hexRed}2040`;

    const actions = [
      { op: 'background', color: '#ffffff' }
    ];

    for (let i = 0; i < action.count; i++) {
      const offsetX = action.x + (i - 1) * (action.diameter * 1.2);
      actions.push({ op: 'fill', color, opacity: 0.9 });
      actions.push({
        op: 'circle',
        x: Number(offsetX.toFixed(3)),
        y: Number(action.y.toFixed(3)),
        diameter: Number(action.diameter.toFixed(3))
      });
    }

    return { version: 1, actions };
  }

  /**
   * Run one step of policy gradient / REINFORCE rollout
   */
  step(rolloutCount = 6) {
    const rollouts = [];

    for (let i = 0; i < rolloutCount; i++) {
      const action = this.sampleAction(this.policy, 0.15);
      const program = this.actionToProgram(action);
      const evalResult = evaluateReward(program, {
        weights: this.weights,
        targetShapes: this.targetShapes
      });

      rollouts.push({
        action,
        program,
        reward: evalResult.total,
        breakdown: evalResult.breakdown
      });
    }

    // Sort by reward descending
    rollouts.sort((a, b) => b.reward - a.reward);

    const best = rollouts[0];
    const meanReward = rollouts.reduce((s, r) => s + r.reward, 0) / rollouts.length;

    // Simple policy update towards top performing actions
    const topRollouts = rollouts.slice(0, Math.ceil(rolloutCount * 0.5));
    const targetX = topRollouts.reduce((s, r) => s + r.action.x, 0) / topRollouts.length;
    const targetY = topRollouts.reduce((s, r) => s + r.action.y, 0) / topRollouts.length;
    const targetD = topRollouts.reduce((s, r) => s + r.action.diameter, 0) / topRollouts.length;
    const targetRed = topRollouts.reduce((s, r) => s + r.action.red, 0) / topRollouts.length;

    this.policy.x += (targetX - this.policy.x) * this.learningRate;
    this.policy.y += (targetY - this.policy.y) * this.learningRate;
    this.policy.diameter += (targetD - this.policy.diameter) * this.learningRate;
    this.policy.red += (targetRed - this.policy.red) * this.learningRate;

    const stepResult = {
      step: this.history.length + 1,
      meanReward: Number(meanReward.toFixed(3)),
      bestReward: best.reward,
      bestBreakdown: best.breakdown,
      bestProgram: best.program,
      policySnapshot: { ...this.policy }
    };

    this.history.push(stepResult);
    return stepResult;
  }

  runEpisodes(numEpisodes = 8) {
    const results = [];
    for (let i = 0; i < numEpisodes; i++) {
      results.push(this.step());
    }
    return results;
  }
}
