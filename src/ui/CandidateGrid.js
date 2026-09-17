/**
 * Hero Studio Canvas & Variants Ribbon Component
 *
 * Provides a prominent, high-resolution Hero Main Preview alongside
 * a clear Variants Ribbon (A, B, C, D) with real-time progressive iteration,
 * star ratings, and preference evolution tools.
 */

export class CandidateGrid {
  constructor({
    onSelectCandidate,
    onVariations,
    onContinue,
    onCritique,
    onCompareMedia,
    onStartOver,
    onRate,
    onAnimateStrokes
  }) {
    this.candidates = [];
    this.selectedId = null;
    this.streamingIndex = null;
    this.streamingStatusText = null;
    this.isFullSize = false;
    this.isAnimating = false;

    this.onSelectCandidate = onSelectCandidate;
    this.onVariations = onVariations;
    this.onContinue = onContinue;
    this.onCritique = onCritique;
    this.onCompareMedia = onCompareMedia;
    this.onStartOver = onStartOver;
    this.onRate = onRate;
    this.onAnimateStrokes = onAnimateStrokes;
  }

  update(candidates, selectedId = null) {
    this.candidates = candidates || [];
    if (selectedId) {
      this.selectedId = selectedId;
    } else if (!this.selectedId || !this.candidates.find(c => c.id === this.selectedId)) {
      this.selectedId = this.candidates[0]?.id ?? null;
    }
    this.render();
  }

  setStreaming(candidateIndex, statusText = null) {
    this.streamingIndex = candidateIndex;
    this.streamingStatusText = statusText;
    this.render();
  }

  updateStreamingImage(candidateIndex, dataUrl, actionCount) {
    // Update thumbnail in card
    const cardImg = this.container?.querySelector(`#variant-img-${candidateIndex}`);
    if (cardImg) {
      cardImg.src = dataUrl;
      cardImg.style.display = 'block';
    }

    // If currently viewing this candidate as hero, update hero preview too!
    const heroImg = this.container?.querySelector('#hero-main-img');
    const heroBadge = this.container?.querySelector('#hero-ops-badge');
    if (heroImg && (this.streamingIndex === candidateIndex || !this.selectedId)) {
      heroImg.src = dataUrl;
      heroImg.style.display = 'block';
      if (heroBadge) {
        heroBadge.textContent = `Streaming: ${actionCount} ops parsed...`;
      }
    }
  }

  render(container = null) {
    this.container = container || this.container || document.querySelector('#candidate-grid-container');
    if (!this.container) return;

    if (this.candidates.length === 0) {
      this.container.innerHTML = `
        <div class="candidate-grid-section empty-state">
          <div class="empty-placeholder">
            <h3>No candidates generated yet.</h3>
            <p>Select an artist and click <strong>✦ Generate 4</strong> or pick an example preset above.</p>
          </div>
        </div>
      `;
      return;
    }

    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const activeCand = this.candidates.find(c => c.id === this.selectedId) || this.candidates[0];
    const activeIdx = this.candidates.indexOf(activeCand);
    const activeLetter = letters[activeIdx] || 'A';

    this.container.innerHTML = `
      <div class="candidate-grid-section hero-layout">
        <!-- Prominent Hero Main Preview -->
        <div class="hero-preview-card">
          <div class="hero-header">
            <div class="hero-title-group">
              <span class="hero-letter-badge">${activeLetter}</span>
              <strong>Candidate ${activeLetter} (Main Preview)</strong>
              <span class="hero-meta-badge" id="hero-ops-badge">
                ${activeCand?.renderMetadata?.actionCount || activeCand?.program?.actions?.length || 0} ops · ${activeCand?.renderMetadata?.renderTimeMs || 0}ms
              </span>
            </div>

            <div class="hero-actions-toolbar">
              <button id="animate-strokes-btn" class="btn-micro" title="Watch strokes paint step-by-step">
                ${this.isAnimating ? '⏹ Stop Animation' : '⏯ Animate Strokes'}
              </button>
              <button id="toggle-zoom-btn" class="btn-micro" title="Toggle 1:1 view">
                ${this.isFullSize ? '⤡ Fit Canvas' : '⤢ 1:1 Zoom'}
              </button>
            </div>
          </div>

          <div class="hero-canvas-container ${this.isFullSize ? 'full-zoom' : ''}" id="hero-canvas-wrap">
            <img
              id="hero-main-img"
              class="hero-image"
              src="${activeCand?.renderedImage || ''}"
              alt="Candidate ${activeLetter} Main Preview"
              style="${activeCand?.renderedImage ? 'display: block;' : 'display: none;'}"
            />
            ${!activeCand?.renderedImage ? `
              <div class="hero-loading-overlay">
                <span class="spinner"></span>
                <span>${this.streamingStatusText || 'Rendering high-resolution canvas...'}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Prominent Variants Strip -->
        <div class="variants-strip-section">
          <div class="variants-strip-header">
            <span class="variants-label">4 Variations (Click to view in Main Canvas):</span>
            ${this.streamingIndex !== null ? `
              <span class="streaming-live-badge">⏳ Streaming Candidate ${letters[this.streamingIndex]}...</span>
            ` : ''}
          </div>

          <div class="variants-grid">
            ${this.candidates
              .map((cand, idx) => {
                const letter = letters[idx] || String(idx + 1);
                const isSelected = cand.id === this.selectedId;
                const isStreamingThis = this.streamingIndex === idx;

                return `
                  <div class="variant-card ${isSelected ? 'selected' : ''} ${isStreamingThis ? 'streaming' : ''}" data-id="${cand.id}" data-idx="${idx}">
                    <div class="variant-card-header">
                      <span class="variant-letter ${isSelected ? 'active' : ''}">${letter}</span>
                      <span class="variant-ops">${cand.renderMetadata?.actionCount || cand.program?.actions?.length || 0} ops</span>
                    </div>

                    <div class="variant-thumb-wrap">
                      <img
                        id="variant-img-${idx}"
                        class="variant-thumb"
                        src="${cand.renderedImage || ''}"
                        alt="Candidate ${letter}"
                        style="${cand.renderedImage ? 'display: block;' : 'display: none;'}"
                      />
                      ${!cand.renderedImage ? `
                        <div class="thumb-placeholder">
                          ${isStreamingThis ? '<span class="spinner-small"></span>' : 'Queued'}
                        </div>
                      ` : ''}
                    </div>

                    <div class="variant-card-footer">
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
        </div>

        <!-- Preference Evolution Action Toolbar -->
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
          <button id="start-over-btn" class="btn-secondary btn-ghost" style="margin-left: auto;">
            ↺ Start Over
          </button>
        </div>
      </div>
    `;

    this.attachEvents(this.container);
  }

  attachEvents(target) {
    target.querySelectorAll('.variant-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('star')) return;
        const id = card.dataset.id;
        this.selectedId = id;
        this.onSelectCandidate?.(id);
      });
    });

    target.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        const candId = star.parentElement.dataset.id;
        const rating = Number(star.dataset.star);
        this.onRate?.(candId, rating);
      });
    });

    target.querySelector('#toggle-zoom-btn')?.addEventListener('click', () => {
      this.isFullSize = !this.isFullSize;
      const wrap = target.querySelector('#hero-canvas-wrap');
      const btn = target.querySelector('#toggle-zoom-btn');
      if (wrap) wrap.classList.toggle('full-zoom', this.isFullSize);
      if (btn) btn.textContent = this.isFullSize ? '⤡ Fit Canvas' : '⤢ 1:1 Zoom';
    });

    target.querySelector('#animate-strokes-btn')?.addEventListener('click', () => {
      const activeCand = this.candidates.find(c => c.id === this.selectedId) || this.candidates[0];
      if (activeCand) {
        this.onAnimateStrokes?.(activeCand);
      }
    });

    target.querySelector('#variations-btn')?.addEventListener('click', () => {
      if (this.selectedId) this.onVariations?.(this.selectedId);
    });

    target.querySelector('#continue-btn')?.addEventListener('click', () => {
      if (this.selectedId) this.onContinue?.(this.selectedId);
    });

    target.querySelector('#critique-btn')?.addEventListener('click', () => {
      if (this.selectedId) this.onCritique?.(this.selectedId);
    });

    target.querySelector('#compare-media-btn')?.addEventListener('click', () => {
      if (this.selectedId) this.onCompareMedia?.(this.selectedId);
    });

    target.querySelector('#start-over-btn')?.addEventListener('click', () => {
      this.onStartOver?.();
    });
  }
}
