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
    canvasAspect = '1:1',
    onAspectChange,
    onOpenMediumOptions,
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
    this.canvasAspect = canvasAspect;
    this.onAspectChange = onAspectChange;
    this.onOpenMediumOptions = onOpenMediumOptions;
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
                <optgroup label="Agent">
                  ${this.artists.filter(a => a.type === 'harness').map(a => `<option value="${a.id}" ${a.id === this.activeArtist ? 'selected' : ''}>${a.name}</option>`).join('')}
                </optgroup>
                <optgroup label="Local / Browser">
                  ${this.artists.filter(a => a.type !== 'procedural' && a.type !== 'cloud' && a.type !== 'harness').map(a => `<option value="${a.id}" ${a.id === this.activeArtist ? 'selected' : ''}>${a.name}</option>`).join('')}
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
              <button id="medium-options-btn" class="btn-micro btn-icon-only" title="Render options">
                ${icon('adjustments', 'icon-sm')}
              </button>
            </div>

            <div class="selector-group">
              <label for="canvas-size-select">Canvas</label>
              <select id="canvas-size-select" title="Canvas size: pixels on the long side">
                ${[512, 1024, 2048, ...([512, 1024, 2048].includes(Number(this.canvasSize)) ? [] : [Number(this.canvasSize)])]
                  .map(v => `<option value="${v}" ${Number(this.canvasSize) === v ? 'selected' : ''}>${v}</option>`).join('')}
                <option value="custom">Custom…</option>
              </select>
            </div>

            <div class="selector-group">
              <label for="canvas-aspect-select">Aspect</label>
              <select id="canvas-aspect-select" title="Canvas aspect ratio (width : height); Reference follows the current reference image">
                ${['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', ...(['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', 'ref'].includes(this.canvasAspect) ? [] : [this.canvasAspect])]
                  .map(v => `<option value="${v}" ${this.canvasAspect === v ? 'selected' : ''}>${v}</option>`).join('')}
                <option value="ref" ${this.canvasAspect === 'ref' ? 'selected' : ''}>Reference</option>
                <option value="custom">Custom…</option>
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
            <button id="theme-btn" class="btn-icon btn-icon-only" title="Switch light / dark">
              ${document.documentElement.dataset.theme === 'light' ? icon('moon', 'icon-sm') : icon('sun', 'icon-sm')}
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
            value="${String(this.prompt ?? 'three red flowers bending left').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
          />
          
          <button id="generate-btn" class="btn-primary" ${this.isGenerating ? 'disabled' : ''}>
            ${this.isGenerating ? '<span class="spinner-small"></span><span>Generating...</span>' : icon('sparkles', 'icon-sm') + '<span>Generate 4</span>'}
          </button>

          <select id="preset-select" class="preset-select" title="Load a preset prompt or an example drawing">
            <option value="">Presets &amp; examples…</option>
            <optgroup label="Prompts">
              ${this.promptPresets.map(p => `<option value="prompt:${p}">${p}</option>`).join('')}
            </optgroup>
            <optgroup label="Example drawings">
              ${EXAMPLES.map(e => `<option value="example:${e.id}">${e.name}</option>`).join('')}
            </optgroup>
          </select>

          <button id="interrupt-btn" class="btn-danger" style="${this.isGenerating ? 'display: inline-flex;' : 'display: none;'}" title="Stop generation (Esc)">
            ${icon('stop', 'icon-sm')} <span>Stop</span>
          </button>
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
        html += `<optgroup label="Explorer"><option value="__open_explorer__">Search 400+ Models...</option></optgroup>`;
      }

      const savedTrained = getSavedModels();
      if (savedTrained.length > 0 && (this.activeArtist === 'webgpu' || this.activeArtist === 'trained')) {
        html += `<optgroup label="Fine-Tuned & Local Models">`;
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
        html += `<optgroup label="Explorer"><option value="__open_explorer__">Search 400+ Models...</option></optgroup>`;
      }

      const savedTrained = getSavedModels();
      if (savedTrained.length > 0 && (this.activeArtist === 'webgpu' || this.activeArtist === 'trained')) {
        html += `<optgroup label="Fine-Tuned & Local Models">`;
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

    container.querySelector('#medium-options-btn')?.addEventListener('click', (e) => {
      this.onOpenMediumOptions?.(e.currentTarget);
    });

    this.setMedium = (id) => {
      this.activeMedium = id;
      const sel = container.querySelector('#medium-select');
      if (sel) sel.value = id;
    };
    container.querySelector('#medium-select')?.addEventListener('change', (e) => {
      this.activeMedium = e.target.value;
      this.onMediumChange?.(this.activeMedium);
    });

    container.querySelector('#canvas-size-select')?.addEventListener('change', async (e) => {
      let v = e.target.value;
      if (v === 'custom') {
        const typed = Number(await inlinePrompt(e.target, 'Pixels on the long side', String(this.canvasSize)));
        if (!(typed >= 64 && typed <= 8192)) { e.target.value = String(this.canvasSize); return; }
        v = Math.round(typed);
        if (![...e.target.options].some(o => o.value === String(v))) e.target.add(new Option(String(v), String(v)), e.target.options.length - 1);
        e.target.value = String(v);
      }
      this.canvasSize = Number(v);
      this.onCanvasSizeChange?.(this.canvasSize);
    });

    container.querySelector('#canvas-aspect-select')?.addEventListener('change', async (e) => {
      let v = e.target.value;
      if (v === 'custom') {
        const typed = (await inlinePrompt(e.target, 'Width:height', this.canvasAspect === 'ref' ? '1:1' : this.canvasAspect) || '').trim();
        const [w, h] = typed.split(/[:x×/]/).map(Number);
        if (!(w > 0 && h > 0)) { e.target.value = this.canvasAspect; return; }
        v = `${w}:${h}`;
        if (![...e.target.options].some(o => o.value === v)) e.target.add(new Option(v, v), e.target.options.length - 2);
        e.target.value = v;
      }
      this.canvasAspect = v;
      this.onAspectChange?.(v);
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

    // Keep the typed prompt across toolbar re-renders.
    promptInput?.addEventListener('input', () => { this.prompt = promptInput.value; });

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

    container.querySelector('#preset-select')?.addEventListener('change', (e) => {
      const value = e.target.value;
      e.target.value = '';
      if (value.startsWith('prompt:')) {
        if (promptInput) promptInput.value = value.slice(7);
      } else if (value.startsWith('example:')) {
        const ex = EXAMPLES.find(x => x.id === value.slice(8));
        if (ex) this.onLoadExample?.(ex);
      }
    });

    container.querySelector('#settings-btn')?.addEventListener('click', () => {
      this.onOpenSettings?.();
    });

    container.querySelector('#theme-btn')?.addEventListener('click', (e) => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('ams_theme', next); } catch { /* storage unavailable */ }
      e.currentTarget.innerHTML = next === 'light' ? icon('moon', 'icon-sm') : icon('sun', 'icon-sm');
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

/** Small popover with one text field under `anchor` (window.prompt is blocked in some hosts). */
function inlinePrompt(anchor, label, initial) {
  return new Promise((resolve) => {
    const el = document.createElement('form');
    el.className = 'medium-options inline-prompt';
    el.innerHTML = `<label class="live-slider"><span></span><input class="mo-text" /></label>`;
    el.querySelector('span').textContent = label;
    const input = el.querySelector('input');
    input.value = initial;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom + 6}px`;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.left))}px`;
    input.focus();
    input.select();
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener('pointerdown', outside, true);
      el.remove();
      resolve(value);
    };
    const outside = (ev) => { if (!el.contains(ev.target)) finish(null); };
    el.addEventListener('submit', (ev) => { ev.preventDefault(); finish(input.value); });
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') finish(null); });
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
  });
}

/** Show a prompt in the toolbar (e.g. one generated through MCP). */
Controls.prototype.setPrompt = function (text) {
  this.prompt = text;
  const input = document.querySelector('#studio-prompt-input');
  if (input && input.value !== text) input.value = text;
};
