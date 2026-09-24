/**
 * Reward Lab Panel Component
 * Interactive reward calculation, term weights, and fast RL policy search demo.
 */

import { evaluateReward, DEFAULT_REWARD_WEIGHTS } from '../rewards/combine.js';
import { PolicyOptimizer } from '../rewards/policySearch.js';

export class RewardPanel {
  constructor({ onApplyOptimizedProgram }) {
    this.weights = { ...DEFAULT_REWARD_WEIGHTS };
    this.targetShapes = 3;
    this.currentCandidate = null;
    this.optimizer = new PolicyOptimizer({ targetShapes: this.targetShapes, weights: this.weights });
    this.trainingHistory = [];

    this.onApplyOptimizedProgram = onApplyOptimizedProgram;
  }

  update(candidate) {
    this.currentCandidate = candidate;
    this.render();
  }

  render(container = null) {
    const target = container || document.querySelector('#reward-lab-container');
    if (!target) return;

    const evaluation = this.currentCandidate?.program
      ? evaluateReward(this.currentCandidate.program, { weights: this.weights, targetShapes: this.targetShapes })
      : null;

    target.innerHTML = `
      <div class="reward-lab-container">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h2 style="font-size: 1.1rem; color: var(--text-primary);">DETERMINISTIC REWARD LABORATORY</h2>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Sections 22–24: Policy Search & Reward Hacking</span>
        </div>

        <div class="reward-sliders">
          <div class="slider-group">
            <label><span>Validity</span> <strong id="val-valid">${this.weights.valid}</strong></label>
            <input type="range" class="weight-slider" data-term="valid" min="0" max="1" step="0.05" value="${this.weights.valid}" />
          </div>

          <div class="slider-group">
            <label><span>Redness</span> <strong id="val-redness">${this.weights.redness}</strong></label>
            <input type="range" class="weight-slider" data-term="redness" min="0" max="1" step="0.05" value="${this.weights.redness}" />
          </div>

          <div class="slider-group">
            <label><span>Leftness</span> <strong id="val-leftness">${this.weights.leftness}</strong></label>
            <input type="range" class="weight-slider" data-term="leftness" min="0" max="1" step="0.05" value="${this.weights.leftness}" />
          </div>

          <div class="slider-group">
            <label><span>Shape Count (3)</span> <strong id="val-shapeCount">${this.weights.shapeCount}</strong></label>
            <input type="range" class="weight-slider" data-term="shapeCount" min="0" max="1" step="0.05" value="${this.weights.shapeCount}" />
          </div>

          <div class="slider-group">
            <label><span>Empty Space</span> <strong id="val-emptySpace">${this.weights.emptySpace}</strong></label>
            <input type="range" class="weight-slider" data-term="emptySpace" min="0" max="1" step="0.05" value="${this.weights.emptySpace}" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="reward-breakdown-card">
            <h3 style="font-size: 0.95rem; display: flex; justify-content: space-between;">
              <span>Current Candidate Score</span>
              <strong style="color: var(--accent-success); font-size: 1.1rem;">
                ${evaluation ? evaluation.total : '—'}
              </strong>
            </h3>

            ${evaluation
              ? `
                <div class="reward-term-row"><span>valid</span> <strong>${evaluation.breakdown.valid.toFixed(2)}</strong></div>
                <div class="reward-term-row"><span>redness</span> <strong>${evaluation.breakdown.redness.toFixed(2)}</strong></div>
                <div class="reward-term-row"><span>leftness</span> <strong>${evaluation.breakdown.leftness.toFixed(2)}</strong></div>
                <div class="reward-term-row"><span>3 shapes target</span> <strong>${evaluation.breakdown.shapeCount.toFixed(2)}</strong></div>
                <div class="reward-term-row"><span>empty space</span> <strong>${evaluation.breakdown.emptySpace.toFixed(2)}</strong></div>
              `
              : `<p style="color: var(--text-muted); font-size: 0.85rem;">Select or generate a candidate to calculate reward metrics.</p>`
            }
          </div>

          <div class="reward-breakdown-card">
            <h3 style="font-size: 0.95rem;">Fast Classroom RL</h3>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
              Train a tiny policy to optimize drawing parameters (position, scale, color) against the specified reward.
            </p>

            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button id="run-rl-step-btn" class="btn-primary" style="padding: 8px 14px; font-size: 0.85rem;">
                ▶ Run 5 Episodes
              </button>
              <button id="run-rl-hack-btn" class="btn-secondary" style="font-size: 0.85rem;" title="Showcase reward hacking">
                Reward-Hack Demo
              </button>
            </div>

            <div id="rl-history-log" style="margin-top: 12px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); max-height: 150px; overflow-y: auto;">
              ${this.trainingHistory.length > 0
                ? this.trainingHistory
                    .slice(-6)
                    .map(h => `<div>Step ${h.step}: Mean Reward: <span style="color: var(--accent-success)">${h.meanReward}</span> (Best: ${h.bestReward})</div>`)
                    .join('')
                : 'No episodes run yet. Click "Run 5 Episodes" to start training.'}
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEvents(target);
  }

  attachEvents(target) {
    const sliders = target.querySelectorAll('.weight-slider');
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const term = e.target.dataset.term;
        const val = Number(e.target.value);
        this.weights[term] = val;
        const label = target.querySelector(`#val-${term}`);
        if (label) label.textContent = val.toFixed(2);
        this.optimizer.weights = this.weights;
        this.render(target);
      });
    });

    target.querySelector('#run-rl-step-btn')?.addEventListener('click', () => {
      const results = this.optimizer.runEpisodes(5);
      this.trainingHistory.push(...results);
      const latest = results[results.length - 1];
      if (latest && this.onApplyOptimizedProgram) {
        this.onApplyOptimizedProgram(latest.bestProgram);
      }
      this.render(target);
    });

    target.querySelector('#run-rl-hack-btn')?.addEventListener('click', () => {
      // Set weights for classic reward hack: high empty space + redness + shape count
      this.weights = {
        valid: 0.1,
        redness: 0.3,
        leftness: 0.1,
        shapeCount: 0.2,
        emptySpace: 0.3
      };
      this.optimizer = new PolicyOptimizer({ targetShapes: 3, weights: this.weights, learningRate: 0.35 });
      const results = this.optimizer.runEpisodes(8);
      this.trainingHistory.push(...results);
      const latest = results[results.length - 1];
      if (latest && this.onApplyOptimizedProgram) {
        this.onApplyOptimizedProgram(latest.bestProgram);
      }
      this.render(target);
    });
  }
}
