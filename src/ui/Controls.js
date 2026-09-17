/**
 * Controls Header & Prompt Component with Resolution, Variation, and Interrupt controls
 */

import { EXAMPLES } from '../../examples/index.js';

export class Controls {
  constructor({
    artists = [],
    media = [],
    activeArtist = 'mock',
    activeMedium = 'watercolor',
    activeMode = 'draw',
    canvasSize = 1024,
    variationLevel = 'medium',
    onArtistChange,
    onMediumChange,
    onModeChange,
    onCanvasSizeChange,
    onVariationChange,
    onGenerate,
    onInterrupt,
    onLoadExample,
    onOpenSettings,
    onToggleLog
  }) {
    this.artists = artists;
    this.media = media;
    this.activeArtist = activeArtist;
    this.activeMedium = activeMedium;
    this.activeMode = activeMode;
    this.canvasSize = canvasSize;
    this.variationLevel = variationLevel;

    this.onArtistChange = onArtistChange;
    this.onMediumChange = onMediumChange;
    this.onModeChange = onModeChange;
    this.onCanvasSizeChange = onCanvasSizeChange;
    this.onVariationChange = onVariationChange;
    this.onGenerate = onGenerate;
    this.onInterrupt = onInterrupt;
    this.onLoadExample = onLoadExample;
    this.onOpenSettings = onOpenSettings;
    this.onToggleLog = onToggleLog;

    this.isGenerating = false;

    this.promptPresets = [
      'three red flowers bending left',
      'solitary blue tree in the wind',
      'sparse geometric Bauhaus sunrise',
      'rose sprite with petals'
    ];
  }

  render(container) {
    this.container = container || this.container;
    if (!this.container) return;

    this.container.innerHTML = `
      <header class="studio-header">
        <div class="studio-brand">
          <h1>Artist–Model Studio</h1>
          <span class="badge">Lab</span>
        </div>

        <div class="studio-selectors">
          <div class="selector-group">
            <label for="artist-select">Artist:</label>
            <select id="artist-select">
              ${this.artists
                .map(a => `<option value="${a.id}" ${a.id === this.activeArtist ? 'selected' : ''}>${a.name}</option>`)
                .join('')}
            </select>
          </div>

          <div class="selector-group">
            <label for="medium-select">Medium:</label>
            <select id="medium-select">
              ${this.media
                .map(m => `<option value="${m.id}" ${m.id === this.activeMedium ? 'selected' : ''}>${m.name}</option>`)
                .join('')}
            </select>
          </div>

          <div class="selector-group">
            <label for="canvas-size-select">Canvas:</label>
            <select id="canvas-size-select" title="Canvas Resolution">
              <option value="1024" ${Number(this.canvasSize) === 1024 ? 'selected' : ''}>1024 × 1024 (1K)</option>
              <option value="2048" ${Number(this.canvasSize) === 2048 ? 'selected' : ''}>2048 × 2048 (2K)</option>
              <option value="512" ${Number(this.canvasSize) === 512 ? 'selected' : ''}>512 × 512 (Draft)</option>
            </select>
          </div>

          <div class="selector-group">
            <label for="variation-select">Variation:</label>
            <select id="variation-select" title="Temperature / Diversity spread across 4 candidates">
              <option value="low" ${this.variationLevel === 'low' ? 'selected' : ''}>Low (Subtle)</option>
              <option value="medium" ${this.variationLevel === 'medium' ? 'selected' : ''}>Medium (Diverse)</option>
              <option value="high" ${this.variationLevel === 'high' ? 'selected' : ''}>High (Bold)</option>
              <option value="wild" ${this.variationLevel === 'wild' ? 'selected' : ''}>Wild (Experimental)</option>
            </select>
          </div>

          <div class="mode-tabs">
            <button class="tab-btn ${this.activeMode === 'draw' ? 'active' : ''}" data-mode="draw">STUDIO</button>
            <button class="tab-btn ${this.activeMode === 'reward' ? 'active' : ''}" data-mode="reward">REWARD LAB</button>
            <button class="tab-btn ${this.activeMode === 'datasets' ? 'active' : ''}" data-mode="datasets">DATASETS</button>
          </div>

          <button id="toggle-log-btn" class="btn-icon" title="Toggle Live Debug Log">📟 Process Log</button>
          <button id="settings-btn" class="btn-icon" title="Settings & Hardware">⚙ Settings</button>
        </div>
      </header>

      <div class="prompt-container">
        <div class="prompt-row">
          <input
            id="studio-prompt-input"
            class="prompt-input"
            type="text"
            placeholder="Describe what to draw... (e.g. three red flowers bending left)"
            value="three red flowers bending left"
          />
          
          <button id="generate-btn" class="btn-primary" ${this.isGenerating ? 'disabled' : ''}>
            <span>${this.isGenerating ? '⏳ Generating...' : '✦ Generate 4'}</span>
          </button>

          <button id="interrupt-btn" class="btn-danger" style="${this.isGenerating ? 'display: inline-flex;' : 'display: none;'}" title="Stop generation (Esc)">
            <span>⏹ Stop (Esc)</span>
          </button>
        </div>

        <div class="preset-pills">
          <span>Presets:</span>
          ${this.promptPresets
            .map(p => `<button class="pill-btn preset-pill" data-prompt="${p}">${p}</button>`)
            .join('')}
          <span style="margin-left: 12px;">Examples:</span>
          ${EXAMPLES
            .map(e => `<button class="pill-btn example-pill" data-example="${e.id}">${e.name.split('—')[0]}</button>`)
            .join('')}
        </div>
      </div>
    `;

    this.attachEvents(this.container);
  }

  attachEvents(container) {
    container.querySelector('#artist-select')?.addEventListener('change', (e) => {
      this.activeArtist = e.target.value;
      this.onArtistChange?.(this.activeArtist);
    });

    container.querySelector('#medium-select')?.addEventListener('change', (e) => {
      this.activeMedium = e.target.value;
      this.onMediumChange?.(this.activeMedium);
    });

    container.querySelector('#canvas-size-select')?.addEventListener('change', (e) => {
      this.canvasSize = Number(e.target.value);
      this.onCanvasSizeChange?.(this.canvasSize);
    });

    container.querySelector('#variation-select')?.addEventListener('change', (e) => {
      this.variationLevel = e.target.value;
      this.onVariationChange?.(this.variationLevel);
    });

    const modeBtns = container.querySelectorAll('.tab-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeMode = btn.dataset.mode;
        this.onModeChange?.(this.activeMode);
      });
    });

    const promptInput = container.querySelector('#studio-prompt-input');
    const generateBtn = container.querySelector('#generate-btn');
    const interruptBtn = container.querySelector('#interrupt-btn');

    generateBtn?.addEventListener('click', () => {
      const prompt = promptInput?.value?.trim() || 'three red flowers';
      this.onGenerate?.(prompt);
    });

    interruptBtn?.addEventListener('click', () => {
      this.onInterrupt?.();
    });

    promptInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const prompt = promptInput?.value?.trim() || 'three red flowers';
        this.onGenerate?.(prompt);
      }
    });

    // Global Esc key listener for interrupt
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isGenerating) {
        e.preventDefault();
        this.onInterrupt?.();
      }
    });

    container.querySelectorAll('.preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        if (promptInput) promptInput.value = pill.dataset.prompt;
      });
    });

    container.querySelectorAll('.example-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const ex = EXAMPLES.find(e => e.id === pill.dataset.example);
        if (ex) this.onLoadExample?.(ex);
      });
    });

    container.querySelector('#settings-btn')?.addEventListener('click', () => {
      this.onOpenSettings?.();
    });

    container.querySelector('#toggle-log-btn')?.addEventListener('click', () => {
      this.onToggleLog?.();
    });
  }

  setGenerating(isGenerating) {
    this.isGenerating = isGenerating;
    const genBtn = document.querySelector('#generate-btn');
    const intBtn = document.querySelector('#interrupt-btn');

    if (genBtn) {
      genBtn.disabled = isGenerating;
      genBtn.innerHTML = isGenerating
        ? '<span>⏳ Generating...</span>'
        : '<span>✦ Generate 4</span>';
    }

    if (intBtn) {
      intBtn.style.display = isGenerating ? 'inline-flex' : 'none';
    }
  }
}
