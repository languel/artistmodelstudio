/**
 * Hero Studio Canvas & Variants Ribbon Component
 *
 * Provides a prominent, high-resolution Hero Main Preview alongside
 * a clear Variants Ribbon (A, B, C, D) with real-time progressive iteration,
 * star ratings, and preference evolution tools.
 */

import { icon } from './icons.js';

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
    this.downloadProgress = null;
    this.isFullSize = false;
    this.isAnimating = false;

    // Pan & Zoom state
    this.zoomScale = 1;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

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
    if (candidateIndex === 0) {
      this.userPickedDuringStream = false;
      this.streamingImages = {};
    }
    if (candidateIndex !== null && !this.userPickedDuringStream && this.candidates[candidateIndex]) {
      this.selectedId = this.candidates[candidateIndex].id;
    }
    this.streamingIndex = candidateIndex;
    this.streamingStatusText = statusText;
    this.render();
  }

  setDownloadProgress(progressData) {
    this.downloadProgress = progressData;
    this.render();
  }

  clearDownloadProgress() {
    this.downloadProgress = null;
    this.render();
  }

  updateStreamingImage(candidateIndex, dataUrl, actionCount) {
    (this.streamingImages ||= {})[candidateIndex] = dataUrl;
    // Update thumbnail in card
    const cardImg = this.container?.querySelector(`#variant-img-${candidateIndex}`);
    if (cardImg) {
      cardImg.src = dataUrl;
      cardImg.style.display = 'block';
    }

    const candAtIdx = this.candidates[candidateIndex];
    const activeCand = this.candidates.find(c => c.id === this.selectedId) || this.candidates[0];

    // Only update hero main image if the hero is currently viewing this candidate
    const isHeroShowingThis = candAtIdx && activeCand && (candAtIdx.id === activeCand.id);

    const heroImg = this.container?.querySelector('#hero-main-img');
    const heroBadge = this.container?.querySelector('#hero-ops-badge');
    if (heroImg && isHeroShowingThis) {
      heroImg.src = dataUrl;
      heroImg.style.display = 'block';
      const overlay = this.container?.querySelector('.hero-loading-overlay.centered');
      if (overlay && !this.downloadProgress) overlay.classList.replace('centered', 'floating');
      if (heroBadge) {
        heroBadge.textContent = `Streaming: ${actionCount} ops parsed...`;
      }
    }
  }

  renderDownloadCard() {
    return `
      <div class="model-download-card">
        <div class="model-download-header">
          <div class="model-download-icon-wrap">
            ${icon('cpu', 'icon-md')}
          </div>
          <div class="model-download-titles">
            <div class="model-download-title">Downloading WebGPU Neural Weights</div>
            <div class="model-download-sub">${this.downloadProgress?.model || 'In-Browser WebGPU Model'}</div>
          </div>
          <span class="model-download-pct-badge">${Math.min(Math.max(this.downloadProgress?.progress || 0, 0), 100)}%</span>
        </div>

        <div class="model-progress-track">
          <div class="model-progress-fill" style="width: ${Math.min(Math.max(this.downloadProgress?.progress || 0, 2), 100)}%;"></div>
        </div>

        <div class="model-progress-meta">
          <span class="model-progress-file">
            ${this.downloadProgress?.shardName || (this.downloadProgress?.file ? this.downloadProgress.file.split('/').pop() : 'Connecting to Hugging Face CDN...')}
          </span>
          <span class="model-progress-bytes">
            ${this.downloadProgress?.loadedMB && this.downloadProgress?.totalMB ? `${this.downloadProgress.loadedMB} MB / ${this.downloadProgress.totalMB} MB` : (this.downloadProgress?.message || '')}
          </span>
        </div>

        <div class="model-download-footnote">
          Weights are securely downloaded from Hugging Face and cached locally in browser cache for future instant runs.
        </div>
      </div>
    `;
  }

  render(container = null) {
    this.container = container || this.container || document.querySelector('#candidate-grid-container');
    if (!this.container) return;

    if (this.candidates.length === 0) {
      if (this.downloadProgress) {
        this.container.innerHTML = `
          <div class="candidate-grid-section hero-layout">
            <div class="hero-preview-card">
              <div class="hero-canvas-container">
                <div class="hero-loading-overlay">
                  ${this.renderDownloadCard()}
                </div>
              </div>
            </div>
          </div>
        `;
        return;
      }
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
    // While streaming, the hero image may already show a partial render.
    const imageFor = (cand, idx) => cand?.renderedImage || this.streamingImages?.[idx] || '';
    const heroSrc = imageFor(activeCand, activeIdx);
    const heroHasImage = Boolean(heroSrc);

    this.container.innerHTML = `
      <div class="candidate-grid-section hero-layout">
        <!-- Prominent Hero Main Preview -->
        <div class="hero-preview-card">
          <div class="hero-header">
            <div class="hero-title-group">
              <span class="hero-letter-badge">${activeLetter}</span>
              <strong>Candidate ${activeLetter} (Main Preview)</strong>
              ${activeCand?.model ? `<span class="badge" style="font-family: monospace; font-size: 0.72rem; background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${activeCand.model}</span>` : ''}
              <span class="hero-meta-badge" id="hero-ops-badge">
                ${activeCand?.renderMetadata?.actionCount || activeCand?.program?.actions?.length || 0} ops · ${activeCand?.renderMetadata?.renderTimeMs || 0}ms
              </span>
            </div>

            <div class="hero-actions-toolbar">
              <button id="animate-strokes-btn" class="btn-micro" title="${this.isAnimating ? 'Stop Animation' : 'Watch strokes paint step-by-step'}">
                ${this.isAnimating ? icon('stop', 'icon-sm') + ' <span>Stop</span>' : icon('play', 'icon-sm') + ' <span>Animate</span>'}
              </button>
              <div class="canvas-zoom-toolbar">
                <button id="zoom-out-btn" class="btn-micro btn-icon-only" title="Zoom Out (Scroll Down)">
                  ${icon('minus', 'icon-sm')}
                </button>
                <span class="zoom-level-badge" id="zoom-level-indicator">${Math.round(this.zoomScale * 100)}%</span>
                <button id="zoom-in-btn" class="btn-micro btn-icon-only" title="Zoom In (Scroll Up)">
                  ${icon('plus', 'icon-sm')}
                </button>
                <button id="zoom-reset-btn" class="btn-micro btn-icon-only" title="Reset Zoom">
                  ${icon('arrowPath', 'icon-sm')}
                </button>
              </div>
              <button id="toggle-zoom-btn" class="btn-micro btn-icon-only" title="${this.isFullSize ? 'Show side panel' : 'Expand preview'}">
                ${this.isFullSize ? icon('collapse', 'icon-sm') : icon('expand', 'icon-sm')}
              </button>
            </div>
          </div>

          <div class="hero-canvas-container ${this.isFullSize ? 'full-zoom' : ''}" id="hero-canvas-wrap" style="user-select: none; touch-action: none;" title="Shift + Drag to Pan · Two-Finger Scroll to Pan · Wheel to Zoom · Double-Click to Reset">
            <img
              id="hero-main-img"
              class="hero-image"
              draggable="false"
              src="${heroSrc}"
              alt="Candidate ${activeLetter} Large Preview"
              style="${heroHasImage ? 'display: block;' : 'display: none;'}"
            />
            ${(!activeCand?.renderedImage || this.downloadProgress) ? `
              <div class="hero-loading-overlay ${this.downloadProgress || !heroHasImage ? 'centered' : 'floating'}">
                ${this.downloadProgress ? this.renderDownloadCard() : `
                  <span class="spinner"></span>
                  <span>${this.streamingStatusText || 'Rendering high-resolution canvas...'}</span>
                `}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Prominent Variants Strip -->
        <div class="variants-strip-section" title="Click a candidate to show it in the preview">
          <div class="variants-strip-header">
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
                        src="${imageFor(cand, idx)}"
                        alt="Candidate ${letter}"
                        style="${imageFor(cand, idx) ? 'display: block;' : 'display: none;'}"
                      />
                      ${!imageFor(cand, idx) ? `
                        <div class="thumb-placeholder">
                          ${isStreamingThis ? '<span class="spinner-small"></span>' : 'Queued'}
                        </div>
                      ` : ''}
                    </div>

                    <div class="variant-card-footer">
                      ${cand.model ? `<span style="font-family: monospace; font-size: 0.68rem; color: var(--text-muted); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cand.model}">${cand.model.split('/').pop()}</span>` : '<span></span>'}
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
          <button id="variations-btn" class="btn-action btn-secondary" ${!this.selectedId ? 'disabled' : ''} title="Synthesize 4 stylistic variations from this candidate">
            ${icon('squaresPlus', 'icon-sm')} <span>Variations</span>
          </button>
          <button id="continue-btn" class="btn-action btn-secondary" ${!this.selectedId ? 'disabled' : ''} title="Continue drawing with an incremental prompt">
            ${icon('arrowRight', 'icon-sm')} <span>Continue</span>
          </button>
          <button id="critique-btn" class="btn-action btn-secondary" ${!this.selectedId ? 'disabled' : ''} title="Provide natural language artistic critique">
            ${icon('chatBubble', 'icon-sm')} <span>Critique</span>
          </button>
          <button id="compare-media-btn" class="btn-action btn-secondary" ${!this.selectedId ? 'disabled' : ''} title="Compare this program across Watercolor, Flat Canvas, and Pixel mediums">
            ${icon('scale', 'icon-sm')} <span>Compare Media</span>
          </button>
          <button id="start-over-btn" class="btn-action btn-secondary btn-ghost" style="margin-left: auto;" title="Reset session and start over">
            ${icon('arrowPath', 'icon-sm')} <span>Start Over</span>
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
        if (this.streamingIndex !== null) this.userPickedDuringStream = true;
        this.selectedId = id;
        this.render();
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

    // Expand: give the preview the full width by hiding the right column.
    const toggleBtn = target.querySelector('#toggle-zoom-btn');
    if (toggleBtn) toggleBtn.onclick = () => {
      this.isFullSize = !this.isFullSize;
      this.applyExpanded();
      const btn = target.querySelector('#toggle-zoom-btn');
      if (btn) {
        btn.innerHTML = this.isFullSize ? icon('collapse', 'icon-sm') : icon('expand', 'icon-sm');
        btn.title = this.isFullSize ? 'Show side panel' : 'Expand preview';
      }
    };
    this.applyExpanded();

    // Pan & Zoom on hero canvas container
    const wrap = target.querySelector('#hero-canvas-wrap');
    if (wrap) {
      // Prevent native browser image drag-and-drop ghosting
      wrap.addEventListener('dragstart', (e) => e.preventDefault());

      const panHintPill = wrap.querySelector('#pan-hint-pill');

      const handleKeyShift = (e) => {
        if (this.isDragging) return;
        if (e.shiftKey) {
          wrap.style.cursor = 'grab';
          panHintPill?.classList.add('active');
        } else {
          wrap.style.cursor = this.zoomScale > 1 ? 'grab' : 'default';
          panHintPill?.classList.remove('active');
        }
      };
      this.windowHandlers?.forEach(([type, fn]) => window.removeEventListener(type, fn));

      // Trackpad two-finger gestures and wheel
      wrap.addEventListener('wheel', (e) => {
        e.preventDefault();

        // 1. Pinch-to-zoom (trackpad pinch sets e.ctrlKey, or Ctrl/Cmd + wheel)
        if (e.ctrlKey || e.metaKey || e.altKey) {
          const rect = wrap.getBoundingClientRect();
          const mouseX = e.clientX - (rect.left + rect.width / 2);
          const mouseY = e.clientY - (rect.top + rect.height / 2);

          const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
          const newScale = Math.max(0.5, Math.min(10.0, Number((this.zoomScale * zoomFactor).toFixed(2))));

          const scaleRatio = newScale / this.zoomScale;
          this.panX = mouseX - (mouseX - this.panX) * scaleRatio;
          this.panY = mouseY - (mouseY - this.panY) * scaleRatio;
          this.zoomScale = newScale;
          this.applyTransform();
          return;
        }

        // 2. Shift + wheel: horizontal pan
        if (e.shiftKey) {
          this.panX -= e.deltaY;
          this.applyTransform();
          return;
        }

        // 3. Trackpad two-finger swipe or scroll when zoomed
        if (this.zoomScale > 1 || Math.abs(e.deltaX) > 0) {
          this.panX -= e.deltaX;
          this.panY -= e.deltaY;
          this.applyTransform();
          return;
        }

        // 4. Mouse wheel at 1x: zoom centered on mouse cursor
        const rect = wrap.getBoundingClientRect();
        const mouseX = e.clientX - (rect.left + rect.width / 2);
        const mouseY = e.clientY - (rect.top + rect.height / 2);

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const newScale = Math.max(0.5, Math.min(10.0, Number((this.zoomScale * zoomFactor).toFixed(2))));

        const scaleRatio = newScale / this.zoomScale;
        this.panX = mouseX - (mouseX - this.panX) * scaleRatio;
        this.panY = mouseY - (mouseY - this.panY) * scaleRatio;
        this.zoomScale = newScale;
        this.applyTransform();
      }, { passive: false });

      // Click-and-drag pan (Shift + Click, Middle-Click, or drag when zoomed)
      wrap.addEventListener('mousedown', (e) => {
        const canPan = e.shiftKey || e.button === 1 || this.zoomScale > 1;
        if (!canPan && e.button !== 0) return;

        // Prevent native browser image drag
        e.preventDefault();
        this.isDragging = true;
        this.dragStartX = e.clientX - this.panX;
        this.dragStartY = e.clientY - this.panY;
        wrap.style.cursor = 'grabbing';
      });

      const onMouseMove = (e) => {
        if (!this.isDragging) return;
        e.preventDefault();
        this.panX = e.clientX - this.dragStartX;
        this.panY = e.clientY - this.dragStartY;
        this.applyTransform();
      };

      const onMouseUp = () => {
        if (this.isDragging) {
          this.isDragging = false;
          wrap.style.cursor = (this.zoomScale > 1 || window.event?.shiftKey) ? 'grab' : 'default';
        }
      };

      this.windowHandlers = [['keydown', handleKeyShift], ['keyup', handleKeyShift], ['mousemove', onMouseMove], ['mouseup', onMouseUp]];
      this.windowHandlers.forEach(([type, fn]) => window.addEventListener(type, fn));

      // Touch / Trackpad gesture support
      let touchStartX = 0, touchStartY = 0, initialDistance = 0, initialScale = 1;
      wrap.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1 && (this.zoomScale > 1 || e.shiftKey)) {
          this.isDragging = true;
          this.dragStartX = e.touches[0].clientX - this.panX;
          this.dragStartY = e.touches[0].clientY - this.panY;
        } else if (e.touches.length === 2) {
          this.isDragging = true;
          touchStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - this.panX;
          touchStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - this.panY;
          initialDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          initialScale = this.zoomScale;
        }
      }, { passive: true });

      wrap.addEventListener('touchmove', (e) => {
        if (!this.isDragging) return;
        if (e.touches.length === 1) {
          this.panX = e.touches[0].clientX - this.dragStartX;
          this.panY = e.touches[0].clientY - this.dragStartY;
          this.applyTransform();
        } else if (e.touches.length === 2) {
          const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          this.panX = currentMidX - touchStartX;
          this.panY = currentMidY - touchStartY;
          const currentDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          if (initialDistance > 0) {
            this.zoomScale = Math.max(0.5, Math.min(10.0, Number((initialScale * (currentDistance / initialDistance)).toFixed(2))));
          }
          this.applyTransform();
        }
      }, { passive: true });

      wrap.addEventListener('touchend', () => {
        this.isDragging = false;
      });

      wrap.addEventListener('dblclick', (e) => {
        if (this.zoomScale === 1) {
          this.zoomScale = 2;
          const rect = wrap.getBoundingClientRect();
          const mouseX = e.clientX - (rect.left + rect.width / 2);
          const mouseY = e.clientY - (rect.top + rect.height / 2);
          this.panX = -mouseX;
          this.panY = -mouseY;
        } else {
          this.zoomScale = 1;
          this.panX = 0;
          this.panY = 0;
        }
        this.applyTransform();
      });
    }

    // Zoom Toolbar buttons
    target.querySelector('#zoom-in-btn')?.addEventListener('click', () => {
      this.zoomScale = Math.min(10.0, Number((this.zoomScale * 1.25).toFixed(2)));
      this.applyTransform();
    });

    target.querySelector('#zoom-out-btn')?.addEventListener('click', () => {
      this.zoomScale = Math.max(0.5, Number((this.zoomScale / 1.25).toFixed(2)));
      this.applyTransform();
    });

    target.querySelector('#zoom-reset-btn')?.addEventListener('click', () => {
      this.zoomScale = 1;
      this.panX = 0;
      this.panY = 0;
      this.applyTransform();
    });

    target.querySelector('#zoom-fit-btn')?.addEventListener('click', () => {
      this.zoomScale = 1;
      this.panX = 0;
      this.panY = 0;
      this.applyTransform();
    });

    target.querySelector('#reset-pan-btn')?.addEventListener('click', () => {
      this.zoomScale = 1;
      this.panX = 0;
      this.panY = 0;
      this.applyTransform();
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

  applyExpanded() {
    this.container?.closest('.studio-hero-layout')?.classList.toggle('preview-expanded', Boolean(this.isFullSize));
  }

  applyTransform() {
    const img = this.container?.querySelector('#hero-main-img');
    const wrap = this.container?.querySelector('#hero-canvas-wrap');
    if (!img) return;

    if (this.zoomScale === 1 && this.panX === 0 && this.panY === 0) {
      img.style.transform = '';
      if (wrap) wrap.style.cursor = 'default';
    } else {
      img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomScale})`;
      img.style.transformOrigin = 'center center';
      if (wrap) wrap.style.cursor = this.isDragging ? 'grabbing' : 'grab';
    }

    const zoomLabel = this.container?.querySelector('#zoom-level-indicator');
    if (zoomLabel) zoomLabel.textContent = `${Math.round(this.zoomScale * 100)}%`;
  }
}
