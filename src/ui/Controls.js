/**
 * Controls Header & Prompt Component
 */

import { EXAMPLES } from '../../examples/index.js';

export class Controls {
  constructor({
    artists = [],
    media = [],
    activeArtist = 'mock',
    activeMedium = 'watercolor',
    activeMode = 'draw',
    onArtistChange,
    onMediumChange,
    onModeChange,
    onGenerate,
    onLoadExample,
    onOpenSettings
  }) {
    this.artists = artists;
    this.media = media;
    this.activeArtist = activeArtist;
    this.activeMedium = activeMedium;
    this.activeMode = activeMode;

    this.onArtistChange = onArtistChange;
    this.onMediumChange = onMediumChange;
    this.onModeChange = onModeChange;
    this.onGenerate = onGenerate;
    this.onLoadExample = onLoadExample;
    this.onOpenSettings = onOpenSettings;

    this.promptPresets = [
      'three red flowers bending left',
      'solitary blue tree in the wind',
      'sparse geometric Bauhaus sunrise',
      'rose sprite with petals'
    ];
  }

  render(container) {
    container.innerHTML = `
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

          <div class="mode-tabs">
            <button class="tab-btn ${this.activeMode === 'draw' ? 'active' : ''}" data-mode="draw">STUDIO</button>
            <button class="tab-btn ${this.activeMode === 'reward' ? 'active' : ''}" data-mode="reward">REWARD LAB</button>
            <button class="tab-btn ${this.activeMode === 'datasets' ? 'active' : ''}" data-mode="datasets">DATASETS</button>
          </div>

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
          <button id="generate-btn" class="btn-primary">
            <span>✦ Generate 4</span>
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

    this.attachEvents(container);
  }

  attachEvents(container) {
    const artistSelect = container.querySelector('#artist-select');
    artistSelect?.addEventListener('change', (e) => {
      this.activeArtist = e.target.value;
      if (this.onArtistChange) this.onArtistChange(this.activeArtist);
    });

    const mediumSelect = container.querySelector('#medium-select');
    mediumSelect?.addEventListener('change', (e) => {
      this.activeMedium = e.target.value;
      if (this.onMediumChange) this.onMediumChange(this.activeMedium);
    });

    const modeBtns = container.querySelectorAll('.tab-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeMode = btn.dataset.mode;
        if (this.onModeChange) this.onModeChange(this.activeMode);
      });
    });

    const promptInput = container.querySelector('#studio-prompt-input');
    const generateBtn = container.querySelector('#generate-btn');

    generateBtn?.addEventListener('click', () => {
      const prompt = promptInput?.value?.trim() || 'three red flowers';
      if (this.onGenerate) this.onGenerate(prompt);
    });

    promptInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const prompt = promptInput?.value?.trim() || 'three red flowers';
        if (this.onGenerate) this.onGenerate(prompt);
      }
    });

    const presetPills = container.querySelectorAll('.preset-pill');
    presetPills.forEach(pill => {
      pill.addEventListener('click', () => {
        if (promptInput) promptInput.value = pill.dataset.prompt;
      });
    });

    const examplePills = container.querySelectorAll('.example-pill');
    examplePills.forEach(pill => {
      pill.addEventListener('click', () => {
        const ex = EXAMPLES.find(e => e.id === pill.dataset.example);
        if (ex && this.onLoadExample) this.onLoadExample(ex);
      });
    });

    container.querySelector('#settings-btn')?.addEventListener('click', () => {
      if (this.onOpenSettings) this.onOpenSettings();
    });
  }

  setGenerating(isGenerating) {
    const btn = document.querySelector('#generate-btn');
    if (btn) {
      btn.disabled = isGenerating;
      btn.innerHTML = isGenerating
        ? '<span>⏳ Generating...</span>'
        : '<span>✦ Generate 4</span>';
    }
  }
}
