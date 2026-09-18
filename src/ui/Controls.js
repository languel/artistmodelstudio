/**
 * Controls Header & Prompt Component with Resolution, Variation, and Interrupt controls
 */

import { EXAMPLES } from '../../examples/index.js';
import { icon } from './icons.js';
import { getSavedModels } from '../training/modelFormat.js';

export class Controls {
  constructor({
    artists = [],
    media = [],
    activeArtist = 'mock',
    activeMedium = 'watercolor',
    activeMode = 'draw',
    canvasSize = 1024,
    variationLevel = 'medium',
    artistRegistry = null,
    onArtistChange,
    onModelChange,
    onMediumChange,
    onModeChange,
    onCanvasSizeChange,
    onVariationChange,
    onGenerate,
    onInterrupt,
    onLoadExample,
    onOpenSettings,
    onOpenHelp,
    onToggleLog,
    onOpenModelExplorer
  }) {
    this.artists = artists;
    this.media = media;
    this.activeArtist = activeArtist;
    this.activeMedium = activeMedium;
    this.activeMode = activeMode;
    this.canvasSize = canvasSize;
    this.variationLevel = variationLevel;
    this.artistRegistry = artistRegistry;

    this.onArtistChange = onArtistChange;
    this.onModelChange = onModelChange;
    this.onMediumChange = onMediumChange;
    this.onModeChange = onModeChange;
    this.onCanvasSizeChange = onCanvasSizeChange;
    this.onVariationChange = onVariationChange;
    this.onGenerate = onGenerate;
    this.onInterrupt = onInterrupt;
    this.onLoadExample = onLoadExample;
    this.onOpenSettings = onOpenSettings;
    this.onOpenHelp = onOpenHelp;
    this.onToggleLog = onToggleLog;
    this.onOpenModelExplorer = onOpenModelExplorer;

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
        <div class="studio-brand" title="Artist–Model Studio">
          <span class="brand-badge">${icon('sparkles', 'icon-sm')}</span>
        </div>

        <div class="studio-selectors">
          <!-- Engine & Model Cluster -->
          <div class="selector-cluster cluster-engine">
            <div class="selector-group">
              <label for="artist-select">Engine</label>
              <select id="artist-select" title="Inference Provider">
                <optgroup label="Procedural">
                  ${this.artists.filter(a => a.type === 'procedural').map(a => `<option value="${a.id}" ${a.id === this.activeArtist ? 'selected' : ''}>${a.name}</option>`).join('')}
                </optgroup>
                <optgroup label="Cloud">
                  ${this.artists.filter(a => a.type === 'cloud').map(a => `<option value="${a.id}" ${a.id === this.activeArtist ? 'selected' : ''}>${a.name}</option>`).join('')}
                </optgroup>
                <optgroup label="Local / Browser">
                  ${this.artists.filter(a => a.type !== 'procedural' && a.type !== 'cloud').map(a => `<option value="${a.id}" ${a.id === this.activeArtist ? 'selected' : ''}>${a.name}</option>`).join('')}
                </optgroup>
              </select>
            </div>

            <div class="selector-group" id="model-selector-group">
              <label for="model-select">Model</label>
              <div style="display: inline-flex; align-items: center; gap: 3px;">
                <select id="model-select" title="Active model for provider">
                  <!-- Populated dynamically based on provider -->
                </select>
                <button id="browse-models-btn" class="btn-micro btn-icon-only" style="display: ${this.activeArtist === 'openrouter' ? 'inline-flex' : 'none'};" title="Search 400+ OpenRouter models">
                  ${icon('search', 'icon-sm')}
                </button>
              </div>
            </div>
          </div>

          <!-- Canvas & Aesthetic Cluster -->
          <div class="selector-cluster cluster-canvas">
            <div class="selector-group">
              <label for="medium-select">Medium</label>
              <select id="medium-select" title="Art Medium">
                ${this.media
                  .map(m => `<option value="${m.id}" ${m.id === this.activeMedium ? 'selected' : ''}>${m.name}</option>`)
                  .join('')}
              </select>
            </div>

            <div class="selector-group">
              <label for="canvas-size-select">Canvas</label>
              <select id="canvas-size-select" title="Canvas Resolution">
                <option value="1024" ${Number(this.canvasSize) === 1024 ? 'selected' : ''}>1024² (1K)</option>
                <option value="2048" ${Number(this.canvasSize) === 2048 ? 'selected' : ''}>2048² (2K)</option>
                <option value="512" ${Number(this.canvasSize) === 512 ? 'selected' : ''}>512² (Draft)</option>
              </select>
            </div>

            <div class="selector-group">
              <label for="variation-select">Variation</label>
              <select id="variation-select" title="Diversity across 4 candidates">
                <option value="low" ${this.variationLevel === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${this.variationLevel === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${this.variationLevel === 'high' ? 'selected' : ''}>High</option>
                <option value="wild" ${this.variationLevel === 'wild' ? 'selected' : ''}>Wild</option>
              </select>
            </div>
          </div>

          <!-- Navigation & Settings Cluster -->
          <div class="selector-cluster cluster-nav">
            <div class="mode-tabs">
              <button class="tab-btn btn-icon-only ${this.activeMode === 'draw' ? 'active' : ''}" data-mode="draw" title="Creative Coding Studio">
                ${icon('paintBrush', 'icon-sm')}
              </button>
              <button class="tab-btn btn-icon-only ${this.activeMode === 'reward' ? 'active' : ''}" data-mode="reward" title="Reward Lab & Evaluation">
                ${icon('beaker', 'icon-sm')}
              </button>
              <button class="tab-btn btn-icon-only ${this.activeMode === 'datasets' ? 'active' : ''}" data-mode="datasets" title="Export Dataset">
                ${icon('database', 'icon-sm')}
              </button>
            </div>

            <button id="toggle-log-btn" class="btn-icon btn-icon-only" title="Toggle Process & Activity Log">
              ${icon('terminal', 'icon-sm')}
            </button>
            <button id="help-btn" class="btn-icon btn-icon-only" title="Documentation & Hardware Benchmarks (?)">
              ${icon('questionMarkCircle', 'icon-sm')}
            </button>
            <button id="settings-btn" class="btn-icon btn-icon-only" title="Settings & Hardware Configuration">
              ${icon('cog', 'icon-sm')}
            </button>
          </div>
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
            ${this.isGenerating ? '<span class="spinner-small"></span><span>Generating...</span>' : icon('sparkles', 'icon-sm') + '<span>Generate 4</span>'}
          </button>

          <button id="interrupt-btn" class="btn-danger" style="${this.isGenerating ? 'display: inline-flex;' : 'display: none;'}" title="Stop generation (Esc)">
            ${icon('stop', 'icon-sm')} <span>Stop</span>
          </button>
        </div>

        <div class="preset-pills">
          <span class="pills-label">Presets:</span>
          ${this.promptPresets
            .map(p => `<button class="pill-btn preset-pill" data-prompt="${p}">${p}</button>`)
            .join('')}
          <span class="pills-label" style="margin-left: 8px;">Examples:</span>
          ${EXAMPLES
            .map(e => `<button class="pill-btn example-pill" data-example="${e.id}">${e.name.split('—')[0]}</button>`)
            .join('')}
        </div>
      </div>
    `;

    this.attachEvents(this.container);
    this.renderModelOptions();
  }

  renderModelOptions() {
    const modelSelect = this.container?.querySelector('#model-select');
    if (!modelSelect) return;

    const browseBtn = this.container?.querySelector('#browse-models-btn');
    if (browseBtn) {
      browseBtn.style.display = this.activeArtist === 'openrouter' ? 'inline-flex' : 'none';
    }

    const artistObj = this.artistRegistry?.get(this.activeArtist);
    const models = (typeof artistObj?.getAvailableModels === 'function')
      ? artistObj.getAvailableModels()
      : [];
    const currentModel = (typeof artistObj?.getModel === 'function')
      ? artistObj.getModel()
      : '';

    if (models.length === 0) {
      modelSelect.innerHTML = `<option value="">Default Model</option>`;
      modelSelect.disabled = true;
      return;
    }

    modelSelect.disabled = false;

    // Check if models have groups
    const hasGroups = models.some(m => Boolean(m.group));
    if (hasGroups) {
      const groups = {};
      for (const m of models) {
        const gName = m.group || 'Other Models';
        if (!groups[gName]) groups[gName] = [];
        groups[gName].push(m);
      }

      let html = Object.keys(groups).map(gName => `
        <optgroup label="${gName}">
          ${groups[gName].map(m => {
            const isSel = m.id === currentModel;
            return `<option value="${m.id}" ${isSel ? 'selected' : ''}>${m.name || m.id}</option>`;
          }).join('')}
        </optgroup>
      `).join('');

      if (this.activeArtist === 'openrouter') {
        html += `<optgroup label="Explorer"><option value="__open_explorer__">🔍 Search 400+ Models...</option></optgroup>`;
      }

      const savedTrained = getSavedModels();
      if (savedTrained.length > 0 && (this.activeArtist === 'webgpu' || this.activeArtist === 'trained')) {
        html += `<optgroup label="🎓 Fine-Tuned & Local Models">`;
        for (const tm of savedTrained) {
          const isSel = tm.id === currentModel;
          html += `<option value="${tm.id}" ${isSel ? 'selected' : ''}>${tm.name} (${tm.architecture || 'LoRA'})</option>`;
        }
        html += `</optgroup>`;
      }

      modelSelect.innerHTML = html;
    } else {
      let html = models.map(m => {
        const isSel = m.id === currentModel;
        return `<option value="${m.id}" ${isSel ? 'selected' : ''}>${m.name || m.id}</option>`;
      }).join('');
      if (this.activeArtist === 'openrouter') {
        html += `<optgroup label="Explorer"><option value="__open_explorer__">🔍 Search 400+ Models...</option></optgroup>`;
      }

      const savedTrained = getSavedModels();
      if (savedTrained.length > 0 && (this.activeArtist === 'webgpu' || this.activeArtist === 'trained')) {
        html += `<optgroup label="🎓 Fine-Tuned & Local Models">`;
        for (const tm of savedTrained) {
          const isSel = tm.id === currentModel;
          html += `<option value="${tm.id}" ${isSel ? 'selected' : ''}>${tm.name} (${tm.architecture || 'LoRA'})</option>`;
        }
        html += `</optgroup>`;
      }

      modelSelect.innerHTML = html;
    }
  }

  updateModels(artistId = this.activeArtist) {
    if (artistId === this.activeArtist) {
      this.renderModelOptions();
    }
  }

  attachEvents(container) {
    container.querySelector('#browse-models-btn')?.addEventListener('click', () => {
      this.onOpenModelExplorer?.();
    });

    container.querySelector('#artist-select')?.addEventListener('change', (e) => {
      this.activeArtist = e.target.value;
      this.renderModelOptions();
      const artistObj = this.artistRegistry?.get(this.activeArtist);
      const activeModel = (typeof artistObj?.getModel === 'function') ? artistObj.getModel() : '';
      this.onArtistChange?.(this.activeArtist, activeModel);
    });

    container.querySelector('#model-select')?.addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      if (selectedModel === '__open_explorer__') {
        const artistObj = this.artistRegistry?.get(this.activeArtist);
        const curr = (typeof artistObj?.getModel === 'function') ? artistObj.getModel() : '';
        e.target.value = curr;
        this.onOpenModelExplorer?.();
        return;
      }
      const artistObj = this.artistRegistry?.get(this.activeArtist);
      if (typeof artistObj?.setModel === 'function') {
        artistObj.setModel(selectedModel);
      }
      this.onModelChange?.(selectedModel, this.activeArtist);
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

    container.querySelector('#help-btn')?.addEventListener('click', () => {
      this.onOpenHelp?.();
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
        ? '<span class="spinner-small"></span><span>Generating...</span>'
        : `${icon('sparkles', 'icon-sm')} <span>Generate 4</span>`;
    }

    if (intBtn) {
      intBtn.style.display = isGenerating ? 'inline-flex' : 'none';
      intBtn.innerHTML = `${icon('stop', 'icon-sm')} <span>Stop</span>`;
    }
  }
}
