/**
 * Compare Media Modal (Renderer Ablation Mode)
 *
 * Renders the exact same program simultaneously through Flat Canvas
 * and Watercolor side-by-side to demonstrate the medium's aesthetic contribution.
 */

export class CompareModal {
  constructor({ flatMedium, watercolorMedium }) {
    this.flatMedium = flatMedium;
    this.watercolorMedium = watercolorMedium;
    this.candidate = null;
  }

  async open(candidate) {
    this.candidate = candidate;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'compare-modal-backdrop';

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 820px;">
        <div class="modal-header">
          <div>
            <h2 style="font-size: 1.1rem; color: var(--text-primary);">COMPARE MEDIA (Renderer Ablation)</h2>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
              Same prompt · Same model · Same program geometry
            </p>
          </div>
          <button class="btn-icon" id="close-compare-modal">✕</button>
        </div>

        <div class="modal-body">
          <div style="background: rgba(224, 93, 118, 0.08); border-left: 3px solid var(--accent-color); padding: 10px 14px; font-size: 0.84rem; color: var(--text-primary); border-radius: 4px;">
            <strong>Classroom Core Question:</strong> How much of the perceived artistic character comes from the model, and how much comes from the medium?
          </div>

          <div class="compare-container">
            <div class="compare-card">
              <h3>Flat Canvas (Baseline 2D)</h3>
              <div class="compare-canvas-box" id="flat-canvas-box">
                <div style="padding: 40px; text-align: center; color: #888;">Rendering...</div>
              </div>
              <span style="font-size: 0.72rem; color: var(--text-muted);">Deterministic, geometric, zero shader embellishment.</span>
            </div>

            <div class="compare-card">
              <h3>Watercolor (p5.brush / Washes)</h3>
              <div class="compare-canvas-box" id="watercolor-canvas-box">
                <div style="padding: 40px; text-align: center; color: #888;">Rendering...</div>
              </div>
              <span style="font-size: 0.72rem; color: var(--text-muted);">Pigment bleed, paper grain texture, organic washes.</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" id="done-compare-modal">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close listeners
    const close = () => {
      modal.remove();
    };
    modal.querySelector('#close-compare-modal')?.addEventListener('click', close);
    modal.querySelector('#done-compare-modal')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    // Render both media simultaneously
    try {
      const flatRes = await this.flatMedium.render(candidate.program);
      const flatBox = modal.querySelector('#flat-canvas-box');
      if (flatBox && flatRes.image) {
        flatBox.innerHTML = `<img src="${flatRes.image}" alt="Flat Canvas" />`;
      }

      const waterRes = await this.watercolorMedium.render(candidate.program);
      const waterBox = modal.querySelector('#watercolor-canvas-box');
      if (waterBox && waterRes.image) {
        waterBox.innerHTML = `<img src="${waterRes.image}" alt="Watercolor" />`;
      }
    } catch (err) {
      console.error('Error rendering compare modal:', err);
    }
  }
}
