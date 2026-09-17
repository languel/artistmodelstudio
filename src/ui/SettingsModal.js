/**
 * Settings and Hardware Configuration Modal
 */

import { WEBGPU_MODEL_PRESETS } from '../artists/WebGPUTransformersArtist.js';

export class SettingsModal {
  constructor({ artistRegistry, mediaRegistry, onSaveSettings }) {
    this.artistRegistry = artistRegistry;
    this.mediaRegistry = mediaRegistry;
    this.onSaveSettings = onSaveSettings;

    this.ollamaModels = [];
    this.hasWebGPU = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  async open() {
    const ollama = this.artistRegistry.get('ollama');
    if (ollama) {
      this.ollamaModels = await ollama.fetchAvailableModels();
    }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'settings-modal-backdrop';

    const webgpuArtist = this.artistRegistry.get('webgpu');
    const pixelMedium = this.mediaRegistry.get('pixel');

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 640px;">
        <div class="modal-header">
          <h2 style="font-size: 1.1rem; color: var(--text-primary);">Studio Settings & Hardware</h2>
          <button class="btn-icon" id="close-settings-modal">✕</button>
        </div>

        <div class="modal-body">
          <!-- Ollama Section -->
          <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
            <h3 style="font-size: 0.92rem; margin-bottom: 8px; color: var(--text-primary);">Ollama (Local Backend)</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="slider-group">
                <label>Endpoint URL</label>
                <input type="text" id="setting-ollama-endpoint" value="${ollama?.endpoint || 'http://localhost:11434'}" class="prompt-input" style="padding: 6px 10px; font-size: 0.85rem;" />
              </div>
              <div class="slider-group">
                <label>Model</label>
                <select id="setting-ollama-model" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 0.85rem;">
                  ${this.ollamaModels.length > 0
                    ? this.ollamaModels.map(m => `<option value="${m}" ${m === ollama?.model ? 'selected' : ''}>${m}</option>`).join('')
                    : `<option value="${ollama?.model || 'liquidai/lfm2.5-1.2b-instruct:latest'}">${ollama?.model || 'liquidai/lfm2.5-1.2b-instruct:latest'}</option>`}
                </select>
              </div>
            </div>
            <div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">
              Ollama Status: ${this.ollamaModels.length > 0 ? `<span style="color: var(--accent-success)">● Connected (${this.ollamaModels.length} models found)</span>` : '<span style="color: var(--accent-warning)">▲ Not detected on localhost:11434</span>'}
            </div>
          </div>

          <!-- WebGPU Section -->
          <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h3 style="font-size: 0.92rem; color: var(--text-primary);">In-Browser WebGPU (Transformers.js)</h3>
              <span class="badge" style="background: ${this.hasWebGPU ? 'rgba(62, 207, 142, 0.15)' : 'rgba(245, 166, 35, 0.15)'}; color: ${this.hasWebGPU ? 'var(--accent-success)' : 'var(--accent-warning)'};">
                ${this.hasWebGPU ? '● WebGPU Ready' : '▲ WASM CPU Fallback'}
              </span>
            </div>
            <div class="slider-group">
              <label>Model Preset</label>
              <select id="setting-webgpu-model" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 0.85rem;">
                ${WEBGPU_MODEL_PRESETS.map(p => `<option value="${p.id}" ${p.id === webgpuArtist?.modelId ? 'selected' : ''}>${p.name}</option>`).join('')}
              </select>
            </div>
            <p style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">
              Runs completely locally inside the browser memory without needing any external server.
            </p>
          </div>

          <!-- Pixel Medium Resolution -->
          <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
            <h3 style="font-size: 0.92rem; margin-bottom: 8px; color: var(--text-primary);">Pixel Grid Resolution</h3>
            <div class="slider-group">
              <select id="setting-pixel-grid" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 0.85rem;">
                <option value="16x16" ${pixelMedium?.cols === 16 && pixelMedium?.rows === 16 ? 'selected' : ''}>16 × 16 (Icon/Sprite)</option>
                <option value="32x32" ${pixelMedium?.cols === 32 && pixelMedium?.rows === 32 ? 'selected' : ''}>32 × 32 (Square)</option>
                <option value="32x48" ${pixelMedium?.cols === 32 && pixelMedium?.rows === 48 ? 'selected' : ''}>32 × 48 (Default Portrait)</option>
                <option value="64x64" ${pixelMedium?.cols === 64 && pixelMedium?.rows === 64 ? 'selected' : ''}>64 × 64 (Detailed Grid)</option>
              </select>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-primary" id="save-settings-btn">Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#close-settings-modal')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    modal.querySelector('#save-settings-btn')?.addEventListener('click', () => {
      const ollamaEndpoint = modal.querySelector('#setting-ollama-endpoint')?.value;
      const ollamaModel = modal.querySelector('#setting-ollama-model')?.value;
      const webgpuModel = modal.querySelector('#setting-webgpu-model')?.value;
      const pixelGrid = modal.querySelector('#setting-pixel-grid')?.value;

      if (ollama) {
        if (ollamaEndpoint) ollama.endpoint = ollamaEndpoint;
        if (ollamaModel) ollama.model = ollamaModel;
      }
      if (webgpuArtist && webgpuModel) {
        webgpuArtist.modelId = webgpuModel;
      }
      if (pixelMedium && pixelGrid) {
        const [c, r] = pixelGrid.split('x').map(Number);
        pixelMedium.reset({ cols: c, rows: r });
      }

      if (this.onSaveSettings) this.onSaveSettings();
      close();
    });
  }
}
