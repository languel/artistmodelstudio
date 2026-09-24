import { icon } from './icons.js';
/**
 * Model Explorer Modal
 *
 * Searchable, filterable catalog of 400+ OpenRouter models,
 * with deep focus on :free models and favorites management.
 */

export class ModelExplorerModal {
  constructor({ openrouterArtist, onSelectModel, onFavoritesChange }) {
    this.artist = openrouterArtist;
    this.onSelectModel = onSelectModel;
    this.onFavoritesChange = onFavoritesChange;

    this.isOpen = false;
    this.searchQuery = '';
    this.activeFilter = 'free'; // 'free' | 'favorites' | 'all'
    this.modalEl = null;
    this.isLoading = false;
  }

  async open() {
    this.isOpen = true;
    this.render();

    // Ensure models are fetched
    if (!this.artist.catalog || this.artist.catalog.length === 0) {
      this.isLoading = true;
      this.updateList();
      try {
        await this.artist.fetchModels();
      } catch (e) {
        console.warn('Failed to load OpenRouter catalog:', e);
      } finally {
        this.isLoading = false;
        this.updateList();
      }
    } else {
      this.updateList();
    }

    // Auto-focus search input
    setTimeout(() => {
      this.modalEl?.querySelector('#explorer-search-input')?.focus();
    }, 100);
  }

  close() {
    this.isOpen = false;
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;
  }

  render() {
    if (this.modalEl) return;

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal-backdrop';
    this.modalEl.id = 'model-explorer-modal-backdrop';

    this.modalEl.innerHTML = `
      <div class="modal-content model-explorer-content" style="max-width: 820px; width: 94vw; max-height: 85vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <h2 style="font-size: 1.15rem; color: var(--text-primary); font-weight: 600; margin: 0;">OpenRouter Model Explorer</h2>
            <span class="badge" style="background: color-mix(in srgb, var(--accent-secondary) 15%, transparent); color: var(--accent-secondary);">400+ Models</span>
          </div>
          <button class="btn-icon" id="close-explorer-modal" title="Close (Esc)">${icon('xMark', 'icon-sm')}</button>
        </div>

        <div class="explorer-toolbar" style="padding: 12px 16px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;">
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="position: relative; flex: 1;">
              <input
                type="text"
                id="explorer-search-input"
                class="prompt-input"
                placeholder="Search models (e.g. liquid, gemma, qwen, llama, free, coder)..."
                value="${this.searchQuery}"
                style="padding: 8px 12px; font-size: 0.88rem; width: 100%; border-radius: 6px; background: var(--bg-tertiary);"
              />
              ${this.searchQuery ? '<button id="explorer-clear-search" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer;">' + icon('xMark', 'icon-sm') + '</button>' : ''}
            </div>
            <button id="explorer-refresh-btn" class="btn-secondary" style="padding: 7px 12px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 5px;" title="Refresh catalog from OpenRouter">
              Refresh
            </button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div class="filter-pills" style="display: flex; gap: 6px;">
              <button class="pill-btn ${this.activeFilter === 'free' ? 'active' : ''}" data-filter="free" style="font-weight: 600;">
                🆓 Free Models (:free)
              </button>
              <button class="pill-btn ${this.activeFilter === 'favorites' ? 'active' : ''}" data-filter="favorites">
                Favorites
              </button>
              <button class="pill-btn ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
                All Models
              </button>
            </div>
            <div id="explorer-count-badge" style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace;">
              Loading catalog...
            </div>
          </div>
        </div>

        <div id="explorer-models-list" class="modal-body" style="padding: 12px 16px; flex: 1; overflow-y: auto;">
          <!-- Populated dynamically -->
        </div>

        <div class="modal-footer" style="padding: 10px 16px; background: var(--bg-secondary); border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
          <span style="font-size: 0.76rem; color: var(--text-muted);">
            Tip: Star your favorite models to keep them pinned at the top of the Studio front-page selector.
          </span>
          <button class="btn-secondary" id="close-explorer-btn" style="padding: 6px 14px; font-size: 0.82rem;">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
    this.attachEvents();
  }

  attachEvents() {
    if (!this.modalEl) return;

    // Close handlers
    this.modalEl.querySelector('#close-explorer-modal')?.addEventListener('click', () => this.close());
    this.modalEl.querySelector('#close-explorer-btn')?.addEventListener('click', () => this.close());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    const keyHandler = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
        window.removeEventListener('keydown', keyHandler);
      }
    };
    window.addEventListener('keydown', keyHandler);

    // Search input
    const searchInput = this.modalEl.querySelector('#explorer-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.updateList();
    });

    // Clear search
    this.modalEl.querySelector('#explorer-clear-search')?.addEventListener('click', () => {
      this.searchQuery = '';
      if (searchInput) searchInput.value = '';
      this.updateList();
    });

    // Refresh button
    this.modalEl.querySelector('#explorer-refresh-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
      try {
        await this.artist.fetchModels(true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Refresh';
        this.updateList();
      }
    });

    // Filter pills
    this.modalEl.querySelectorAll('.filter-pills button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.modalEl.querySelectorAll('.filter-pills button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.activeFilter = e.target.dataset.filter;
        this.updateList();
      });
    });

    // Delegate clicks on model cards (Star toggle and Select)
    const listContainer = this.modalEl.querySelector('#explorer-models-list');
    listContainer?.addEventListener('click', (e) => {
      const starBtn = e.target.closest('.explorer-star-btn');
      if (starBtn) {
        const modelId = starBtn.dataset.id;
        const isNowFav = this.artist.toggleFavorite(modelId);
        starBtn.classList.toggle('active', isNowFav);
        starBtn.textContent = isNowFav ? '★' : '☆';
        starBtn.title = isNowFav ? 'Remove from favorites' : 'Add to favorites';
        this.onFavoritesChange?.(this.artist.getFavorites());
        this.updateList();
        return;
      }

      const selectBtn = e.target.closest('.explorer-select-btn');
      if (selectBtn) {
        const modelId = selectBtn.dataset.id;
        this.artist.setModel(modelId);
        this.onSelectModel?.(modelId);
        this.close();
      }
    });
  }

  updateList() {
    if (!this.modalEl) return;
    const listContainer = this.modalEl.querySelector('#explorer-models-list');
    const countBadge = this.modalEl.querySelector('#explorer-count-badge');
    if (!listContainer) return;

    if (this.isLoading) {
      listContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <span class="spinner" style="margin-bottom: 12px;"></span>
          <p>Fetching models catalog from OpenRouter API...</p>
        </div>
      `;
      if (countBadge) countBadge.textContent = 'Fetching catalog...';
      return;
    }

    const onlyFree = this.activeFilter === 'free';
    const onlyFavorites = this.activeFilter === 'favorites';

    const models = this.artist.searchModels({
      query: this.searchQuery,
      onlyFree,
      onlyFavorites
    });

    const activeModelId = this.artist.getModel();
    const favCount = this.artist.getFavorites().length;

    if (countBadge) {
      countBadge.textContent = `Showing ${models.length} model(s) · ${favCount} favorite(s)`;
    }

    if (models.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <p style="font-size: 1rem; margin-bottom: 8px;">No models found matching "<strong>${this.searchQuery}</strong>".</p>
          <p style="font-size: 0.82rem;">Try switching from "<em>${this.activeFilter}</em>" filter to "<em>All Models</em>" or check your spelling.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${models.map(m => {
          const isSelected = m.id === activeModelId;
          const isFav = m.isFavorite;
          const formatCtx = m.contextLength > 0 ? `${Math.round(m.contextLength / 1024)}k ctx` : '';

          return `
            <div class="explorer-model-card ${isSelected ? 'selected' : ''}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-tertiary); border: 1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-color)'}; border-radius: 6px; gap: 12px; transition: border-color 0.15s ease;">
              <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                <button class="explorer-star-btn ${isFav ? 'active' : ''}" data-id="${m.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}" style="background: none; border: none; font-size: 1.15rem; cursor: pointer; padding: 2px 4px; color: ${isFav ? '#f59e0b' : 'var(--text-muted)'}; line-height: 1;">
                  ${isFav ? '★' : '☆'}
                </button>

                <div style="min-width: 0; flex: 1;">
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 2px;">
                    <strong style="font-size: 0.88rem; color: var(--text-primary);">${m.name}</strong>
                    ${m.isFree ? '<span class="badge" style="background: rgba(34, 197, 94, 0.16); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.35); font-weight: 700; font-size: 0.68rem; padding: 1px 6px;">FREE</span>' : ''}
                    ${formatCtx ? `<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: var(--text-muted); font-size: 0.68rem; padding: 1px 6px;">${formatCtx}</span>` : ''}
                    ${isSelected ? '<span class="badge" style="background: color-mix(in srgb, var(--accent-secondary) 15%, transparent); color: var(--accent-secondary); font-size: 0.68rem; padding: 1px 6px;">Active</span>' : ''}
                  </div>
                  <div style="font-family: monospace; font-size: 0.74rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${m.id}
                  </div>
                  ${m.description ? `<div style="font-size: 0.75rem; color: #94a3b8; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;">${m.description}</div>` : ''}
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <button class="btn-primary explorer-select-btn" data-id="${m.id}" style="padding: 5px 12px; font-size: 0.78rem; ${isSelected ? 'opacity: 0.75; cursor: default;' : ''}">
                  ${isSelected ? 'Active' : 'Select'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}
