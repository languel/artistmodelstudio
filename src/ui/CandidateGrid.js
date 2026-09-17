/**
 * Candidate Grid Component
 * Renders the 4 candidate visual outputs and the preference iteration toolbar.
 */

export class CandidateGrid {
  constructor({
    onSelectCandidate,
    onVariations,
    onContinue,
    onCritique,
    onCompareMedia,
    onStartOver,
    onRate
  }) {
    this.candidates = [];
    this.selectedId = null;

    this.onSelectCandidate = onSelectCandidate;
    this.onVariations = onVariations;
    this.onContinue = onContinue;
    this.onCritique = onCritique;
    this.onCompareMedia = onCompareMedia;
    this.onStartOver = onStartOver;
    this.onRate = onRate;
  }

  update(candidates, selectedId = null) {
    this.candidates = candidates || [];
    this.selectedId = selectedId || (this.candidates[0]?.id ?? null);
    this.render();
  }

  render(container = null) {
    const target = container || document.querySelector('#candidate-grid-container');
    if (!target) return;

    if (this.candidates.length === 0) {
      target.innerHTML = `
        <div class="candidate-grid-section">
          <div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <h3>No candidates generated yet.</h3>
            <p style="margin-top: 8px; font-size: 0.88rem;">Click <strong>Generate 4</strong> or pick an example above to begin.</p>
          </div>
        </div>
      `;
      return;
    }

    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    target.innerHTML = `
      <div class="candidate-grid-section">
        <div class="candidates-grid">
          ${this.candidates
            .map((cand, idx) => {
              const letter = letters[idx] || String(idx + 1);
              const isSelected = cand.id === this.selectedId || cand.selected;
              return `
                <div class="candidate-card ${isSelected ? 'selected' : ''}" data-id="${cand.id}">
                  <div class="candidate-header">
                    <span class="candidate-badge">${letter}</span>
                    <span style="font-size: 0.8rem; color: ${isSelected ? 'var(--accent-color)' : 'var(--text-muted)'};">
                      ${isSelected ? '● Selected' : '○'}
                    </span>
                  </div>
                  <div class="candidate-canvas-wrap" id="canvas-wrap-${cand.id}">
                    ${cand.renderedImage
                      ? `<img src="${cand.renderedImage}" alt="Candidate ${letter}" />`
                      : `<div style="padding: 20px; color: #999; font-size: 0.8rem;">Rendering...</div>`}
                  </div>
                  <div class="candidate-footer">
                    <span>${cand.renderMetadata?.actionCount || cand.program?.actions?.length || 0} ops · ${cand.renderMetadata?.renderTimeMs || 0}ms</span>
                    <div class="rating-stars" data-id="${cand.id}">
                      ${[1, 2, 3, 4, 5]
                        .map(star => `<span class="star ${(cand.rating || 0) >= star ? 'filled' : ''}" data-star="${star}">★</span>`)
                        .join('')}
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <div class="action-toolbar">
          <button id="variations-btn" class="btn-secondary" ${!this.selectedId ? 'disabled' : ''}>
            ✦ Variations (Breed)
          </button>
          <button id="continue-btn" class="btn-secondary" ${!this.selectedId ? 'disabled' : ''}>
            ➔ Continue
          </button>
          <button id="critique-btn" class="btn-secondary" ${!this.selectedId ? 'disabled' : ''}>
            💬 Critique
          </button>
          <button id="compare-media-btn" class="btn-secondary" ${!this.selectedId ? 'disabled' : ''}>
            ⚖ Compare Media (Ablation)
          </button>
          <button id="start-over-btn" class="btn-secondary" style="margin-left: auto; color: var(--text-muted);">
            ↺ Start Over
          </button>
        </div>
      </div>
    `;

    this.attachEvents(target);
  }

  attachEvents(target) {
    const cards = target.querySelectorAll('.candidate-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent clicking star from toggling card selection if clicked on star
        if (e.target.classList.contains('star')) return;
        const id = card.dataset.id;
        this.selectedId = id;
        if (this.onSelectCandidate) this.onSelectCandidate(id);
      });
    });

    const stars = target.querySelectorAll('.star');
    stars.forEach(star => {
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        const candId = star.parentElement.dataset.id;
        const rating = Number(star.dataset.star);
        if (this.onRate) this.onRate(candId, rating);
      });
    });

    target.querySelector('#variations-btn')?.addEventListener('click', () => {
      if (this.selectedId && this.onVariations) this.onVariations(this.selectedId);
    });

    target.querySelector('#continue-btn')?.addEventListener('click', () => {
      if (this.selectedId && this.onContinue) this.onContinue(this.selectedId);
    });

    target.querySelector('#critique-btn')?.addEventListener('click', () => {
      if (this.selectedId && this.onCritique) this.onCritique(this.selectedId);
    });

    target.querySelector('#compare-media-btn')?.addEventListener('click', () => {
      if (this.selectedId && this.onCompareMedia) this.onCompareMedia(this.selectedId);
    });

    target.querySelector('#start-over-btn')?.addEventListener('click', () => {
      if (this.onStartOver) this.onStartOver();
    });
  }
}
