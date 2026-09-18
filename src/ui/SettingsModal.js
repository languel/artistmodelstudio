/**
 * Settings and Hardware Configuration Modal
 *
 * Supports OpenRouter, OpenAI / ChatGPT compatible endpoints,
 * Ollama local backend, in-browser WebGPU, pixel grid, and WebMCP agent controls.
 */

import { WEBGPU_MODEL_PRESETS } from '../artists/WebGPUTransformersArtist.js';
import { OPENROUTER_MODEL_PRESETS } from '../artists/OpenRouterArtist.js';
import { OPENAI_MODEL_PRESETS } from '../artists/OpenAICompatibleArtist.js';
import { icon } from './icons.js';

export class SettingsModal {
  constructor({ artistRegistry, mediaRegistry, onSaveSettings, onOpenModelExplorer }) {
    this.artistRegistry = artistRegistry;
    this.mediaRegistry = mediaRegistry;
    this.onSaveSettings = onSaveSettings;
    this.onOpenModelExplorer = onOpenModelExplorer;

    this.activeTab = 'openrouter'; // 'openrouter' | 'openai' | 'ollama' | 'webgpu' | 'webmcp'
    this.ollamaModels = [];
    this.hasWebGPU = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  open() {
    const ollama = this.artistRegistry.get('ollama');

    const openrouter = this.artistRegistry.get('openrouter');
    const openai = this.artistRegistry.get('openai');
    const webgpuArtist = this.artistRegistry.get('webgpu');
    const pixelMedium = this.mediaRegistry.get('pixel');

    const savedOpenRouterKey = localStorage.getItem('ams_openrouter_key') || openrouter?.apiKey || '';
    const savedOpenRouterModel = localStorage.getItem('ams_openrouter_model') || openrouter?.model || 'anthropic/claude-3.5-sonnet';

    const savedOpenAIBaseURL = localStorage.getItem('ams_openai_base_url') || openai?.baseURL || 'https://api.openai.com/v1';
    const savedOpenAIKey = localStorage.getItem('ams_openai_key') || openai?.apiKey || '';
    const savedOpenAIModel = localStorage.getItem('ams_openai_model') || openai?.model || 'gpt-4o';
    const savedOpenAIHeaders = localStorage.getItem('ams_openai_headers') || '';

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'settings-modal-backdrop';

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 680px; width: 92vw;">
        <div class="modal-header">
          <h2 style="font-size: 1.15rem; color: var(--text-primary); font-weight: 600;">Studio Settings & Model Ecosystem</h2>
          <button class="btn-icon" id="close-settings-modal">✕</button>
        </div>

        <div style="display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); overflow-x: auto;">
          <button class="settings-nav-btn active" data-tab="openrouter">OpenRouter (Cloud)</button>
          <button class="settings-nav-btn" data-tab="openai">OpenAI / ChatGPT</button>
          <button class="settings-nav-btn" data-tab="ollama">Ollama (Local)</button>
          <button class="settings-nav-btn" data-tab="webgpu">WebGPU</button>
          <button class="settings-nav-btn" data-tab="webmcp">WebMCP / Agents</button>
        </div>

        <div class="modal-body" style="padding: 16px; max-height: 65vh; overflow-y: auto;">
          <!-- TAB 1: OpenRouter -->
          <div id="tab-pane-openrouter" class="settings-pane active">
            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="font-size: 0.95rem; color: var(--text-primary); font-weight: 600;">OpenRouter Cloud Frontier</h3>
                <span class="badge" style="background: ${savedOpenRouterKey ? 'rgba(62, 207, 142, 0.15)' : 'rgba(245, 166, 35, 0.15)'}; color: ${savedOpenRouterKey ? 'var(--accent-success)' : 'var(--accent-warning)'};">
                  ${savedOpenRouterKey ? '● API Key Configured' : '▲ Key Missing'}
                </span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">
                Access world-class creative coding models including <strong>Claude 3.5 Sonnet</strong>, <strong>GPT-4o</strong>, and <strong>Gemini 2.5</strong> with direct SSE token streaming.
              </p>

              <div class="slider-group" style="margin-bottom: 10px;">
                <label>OpenRouter API Key</label>
                <div style="position: relative; display: flex; gap: 6px;">
                  <input type="password" id="setting-openrouter-key" value="${savedOpenRouterKey}" placeholder="sk-or-v1-..." class="prompt-input" style="padding: 7px 10px; font-size: 0.85rem; font-family: monospace; flex: 1;" />
                  <button type="button" class="btn-secondary toggle-pwd-btn" data-target="setting-openrouter-key" style="padding: 4px 10px; font-size: 0.78rem;">Show</button>
                </div>
              </div>

              <div class="slider-group" style="margin-bottom: 10px;">
                <label>Model Preset</label>
                <select id="setting-openrouter-preset" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 7px 10px; border-radius: 4px; font-size: 0.85rem; width: 100%;">
                  ${OPENROUTER_MODEL_PRESETS.map(p => `<option value="${p.id}" ${p.id === savedOpenRouterModel ? 'selected' : ''}>${p.name}</option>`).join('')}
                  <option value="custom" ${!OPENROUTER_MODEL_PRESETS.some(p => p.id === savedOpenRouterModel) ? 'selected' : ''}>Custom Model ID...</option>
                </select>
              </div>

              <div class="slider-group" id="group-openrouter-custom" style="display: ${!OPENROUTER_MODEL_PRESETS.some(p => p.id === savedOpenRouterModel) ? 'block' : 'none'};">
                <label>Custom OpenRouter Model ID</label>
                <input type="text" id="setting-openrouter-custom" value="${savedOpenRouterModel}" placeholder="e.g. meta-llama/llama-3.1-405b-instruct" class="prompt-input" style="padding: 7px 10px; font-size: 0.85rem; font-family: monospace;" />
              </div>

              <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <button type="button" id="settings-open-explorer-btn" class="btn-secondary" style="font-size: 0.82rem; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;">
                  🔍 Search 400+ Models (Free & Favorites)
                </button>
                <span style="font-size: 0.76rem; color: var(--text-muted);">
                  ${typeof openrouter?.getFavorites === 'function' ? `${openrouter.getFavorites().length} favorites saved` : ''}
                </span>
              </div>
            </div>
          </div>

          <!-- TAB 2: OpenAI / ChatGPT Compatible -->
          <div id="tab-pane-openai" class="settings-pane" style="display: none;">
            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="font-size: 0.95rem; color: var(--text-primary); font-weight: 600;">OpenAI & ChatGPT Compatible</h3>
                <span class="badge" style="background: ${savedOpenAIKey ? 'rgba(62, 207, 142, 0.15)' : 'rgba(100, 100, 100, 0.15)'}; color: ${savedOpenAIKey ? 'var(--accent-success)' : 'var(--text-muted)'};">
                  ${savedOpenAIKey ? '● Auth Configured' : '○ Direct / Local'}
                </span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">
                Connect to official OpenAI, ChatGPT subscription proxies / Bearer tokens, or local runners like <strong>LM Studio</strong> (<code>http://localhost:1234/v1</code>), <strong>vLLM</strong>, or <strong>Groq</strong>.
              </p>

              <div class="slider-group" style="margin-bottom: 10px;">
                <label>Base URL</label>
                <input type="text" id="setting-openai-baseurl" value="${savedOpenAIBaseURL}" placeholder="https://api.openai.com/v1" class="prompt-input" style="padding: 7px 10px; font-size: 0.85rem; font-family: monospace;" />
              </div>

              <div class="slider-group" style="margin-bottom: 10px;">
                <label>API Key / Subscription Bearer Token</label>
                <div style="position: relative; display: flex; gap: 6px;">
                  <input type="password" id="setting-openai-key" value="${savedOpenAIKey}" placeholder="sk-... or Bearer Token (optional for local LM Studio)" class="prompt-input" style="padding: 7px 10px; font-size: 0.85rem; font-family: monospace; flex: 1;" />
                  <button type="button" class="btn-secondary toggle-pwd-btn" data-target="setting-openai-key" style="padding: 4px 10px; font-size: 0.78rem;">Show</button>
                </div>
              </div>

              <div class="slider-group" style="margin-bottom: 10px;">
                <label>Model Preset</label>
                <select id="setting-openai-preset" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 7px 10px; border-radius: 4px; font-size: 0.85rem; width: 100%;">
                  ${OPENAI_MODEL_PRESETS.map(p => `<option value="${p.id}" ${p.id === savedOpenAIModel ? 'selected' : ''}>${p.name}</option>`).join('')}
                  <option value="custom" ${!OPENAI_MODEL_PRESETS.some(p => p.id === savedOpenAIModel) ? 'selected' : ''}>Custom Model ID...</option>
                </select>
              </div>

              <div class="slider-group" id="group-openai-custom" style="display: ${!OPENAI_MODEL_PRESETS.some(p => p.id === savedOpenAIModel) ? 'block' : 'none'}; margin-bottom: 10px;">
                <label>Custom Model ID</label>
                <input type="text" id="setting-openai-custom" value="${savedOpenAIModel}" placeholder="e.g. qwen2.5-coder-32b-instruct" class="prompt-input" style="padding: 7px 10px; font-size: 0.85rem; font-family: monospace;" />
              </div>

              <div class="slider-group">
                <label>Custom JSON Headers (Optional for Reverse Proxies)</label>
                <input type="text" id="setting-openai-headers" value="${savedOpenAIHeaders}" placeholder='{"Authorization": "Bearer ...", "User-Agent": "..."}' class="prompt-input" style="padding: 7px 10px; font-size: 0.8rem; font-family: monospace;" />
              </div>
            </div>
          </div>

          <!-- TAB 3: Ollama Local -->
          <div id="tab-pane-ollama" class="settings-pane" style="display: none;">
            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 12px;">
              <h3 style="font-size: 0.95rem; margin-bottom: 8px; color: var(--text-primary); font-weight: 600;">Ollama (Local Engine)</h3>
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
              <div style="margin-top: 10px; font-size: 0.78rem;">
                Ollama Status: ${this.ollamaModels.length > 0 ? `<span style="color: var(--accent-success)">● Connected (${this.ollamaModels.length} models detected)</span>` : '<span style="color: var(--accent-warning)">▲ Not detected on localhost:11434</span>'}
              </div>
            </div>
          </div>

          <!-- TAB 4: WebGPU & Grid -->
          <div id="tab-pane-webgpu" class="settings-pane" style="display: none;">
            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3 style="font-size: 0.95rem; color: var(--text-primary); font-weight: 600;">In-Browser WebGPU (Transformers.js)</h3>
                <span class="badge" style="background: ${this.hasWebGPU ? 'rgba(62, 207, 142, 0.15)' : 'rgba(245, 166, 35, 0.15)'}; color: ${this.hasWebGPU ? 'var(--accent-success)' : 'var(--accent-warning)'};">
                  ${this.hasWebGPU ? '● WebGPU Ready' : '▲ WASM CPU Fallback'}
                </span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">
                Client-side in-browser inference using <strong>Google Gemma 4</strong> (WebGPU Kernels / QAT Mobile), <strong>Qwen 3.5</strong> (0.8B, 2B, 4B), and <strong>Liquid AI hybrid LFM2</strong> models with <code>q4f16</code> WebGPU acceleration.
              </p>
              <div class="slider-group">
                <label>Model Preset (ONNX / WebGPU)</label>
                <select id="setting-webgpu-model" style="background: var(--bg-primary); color: #fff; border: 1px solid var(--border-color); padding: 6px 8px; border-radius: 4px; font-size: 0.85rem;">
                  ${(() => {
                    const groups = {};
                    for (const p of WEBGPU_MODEL_PRESETS) {
                      const g = p.group || 'Other Models';
                      if (!groups[g]) groups[g] = [];
                      groups[g].push(p);
                    }
                    return Object.keys(groups).map(g => `
                      <optgroup label="${g}">
                        ${groups[g].map(p => `<option value="${p.id}" ${p.id === webgpuArtist?.modelId ? 'selected' : ''}>${p.name}</option>`).join('')}
                      </optgroup>
                    `).join('');
                  })()}
                  <optgroup label="Custom">
                    <option value="custom" ${!WEBGPU_MODEL_PRESETS.some(p => p.id === webgpuArtist?.modelId) ? 'selected' : ''}>Custom HuggingFace ONNX ID...</option>
                  </optgroup>
                </select>
              </div>
              <div class="slider-group" id="group-webgpu-custom" style="display: ${!WEBGPU_MODEL_PRESETS.some(p => p.id === webgpuArtist?.modelId) ? 'block' : 'none'}; margin-top: 8px;">
                <label>Custom HuggingFace ONNX Model</label>
                <input type="text" id="setting-webgpu-custom" value="${webgpuArtist?.modelId || ''}" placeholder="e.g. onnx-community/Phi-3.5-mini-instruct" class="prompt-input" style="padding: 6px 10px; font-size: 0.85rem; font-family: monospace;" />
              </div>

              <!-- Preload / Test Model Weights with Progress Bar -->
              <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <button type="button" id="btn-preload-webgpu" class="btn-secondary" style="font-size: 0.8rem; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; border-color: rgba(56, 189, 248, 0.4); color: #38bdf8;">
                    ${icon('arrowDownTray', 'icon-sm')} <span>Preload & Cache Model Weights</span>
                  </button>
                  <span id="preload-status-label" style="font-size: 0.76rem; color: var(--text-muted); font-family: monospace;">
                    ${webgpuArtist?.isReady ? '● In Memory' : '○ Not loaded'}
                  </span>
                </div>
                <div id="preload-progress-wrap" style="display: none;">
                  <div class="model-progress-track" style="height: 6px; margin: 4px 0;">
                    <div id="preload-progress-bar" class="model-progress-fill" style="width: 0%;"></div>
                  </div>
                  <div id="preload-progress-meta" style="font-size: 0.74rem; color: var(--text-secondary); font-family: monospace; display: flex; justify-content: space-between;">
                    <span id="preload-file-name">Connecting to Hugging Face...</span>
                    <span id="preload-pct">0%</span>
                  </div>
                </div>
              </div>
            </div>

            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
              <h3 style="font-size: 0.95rem; margin-bottom: 8px; color: var(--text-primary); font-weight: 600;">Pixel Grid Resolution</h3>
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

          <!-- TAB 5: WebMCP / Agents -->
          <div id="tab-pane-webmcp" class="settings-pane" style="display: none;">
            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3 style="font-size: 0.95rem; color: var(--text-primary); font-weight: 600;">WebMCP & In-Browser Agent Harness</h3>
                <span class="badge" style="background: rgba(62, 207, 142, 0.15); color: var(--accent-success);">
                  ● window.ams Active
                </span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px; line-height: 1.4;">
                The studio exposes a direct programmatic API at <code>window.ams</code> and listens to standard MCP JSON-RPC messages via <code>window.postMessage</code>. External AI agents can test, synthesize, critique, and score artworks autonomously.
              </p>

              <pre style="background: #111; color: #3ecf8e; padding: 10px; border-radius: 4px; font-size: 0.76rem; overflow-x: auto; font-family: monospace; border: 1px solid var(--border-color); margin-bottom: 10px;">
// Example: Direct Agent Console Call
await window.ams.generate({ prompt: "three red flowers", artist: "openrouter" });
const scores = window.ams.evaluateRewards();
console.log("Reward score:", scores.total);
              </pre>

              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-secondary" id="btn-test-webmcp" style="font-size: 0.8rem; padding: 6px 12px;">Run WebMCP Health Check</button>
                <button type="button" class="btn-secondary" id="btn-copy-mcp-spec" style="font-size: 0.8rem; padding: 6px 12px;">Copy MCP Tools Schema</button>
              </div>
              <div id="webmcp-test-status" style="margin-top: 8px; font-size: 0.78rem;"></div>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">Keys are saved locally in browser storage only.</span>
          <button class="btn-primary" id="save-settings-btn" style="padding: 8px 18px;">Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Asynchronously fetch Ollama models in background without blocking modal appearance
    if (ollama) {
      ollama.fetchAvailableModels().then(models => {
        if (models && models.length > 0) {
          const select = modal.querySelector('#setting-ollama-model');
          if (select) {
            select.innerHTML = models.map(m => `<option value="${m}" ${m === ollama?.model ? 'selected' : ''}>${m}</option>`).join('');
          }
        }
      }).catch(() => {});
    }

    const close = () => modal.remove();
    modal.querySelector('#close-settings-modal')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    // Tab switching
    const navButtons = modal.querySelectorAll('.settings-nav-btn');
    const panes = modal.querySelectorAll('.settings-pane');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        navButtons.forEach(b => b.classList.remove('active'));
        panes.forEach(p => p.style.display = 'none');
        btn.classList.add('active');
        const activePane = modal.querySelector(`#tab-pane-${targetTab}`);
        if (activePane) activePane.style.display = 'block';
      });
    });

    // Password visibility toggles
    modal.querySelectorAll('.toggle-pwd-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = modal.querySelector(`#${btn.dataset.target}`);
        if (input) {
          if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = 'Hide';
          } else {
            input.type = 'password';
            btn.textContent = 'Show';
          }
        }
      });
    });

    // Custom model inputs show/hide
    const openrouterPreset = modal.querySelector('#setting-openrouter-preset');
    const openrouterCustomGroup = modal.querySelector('#group-openrouter-custom');
    openrouterPreset?.addEventListener('change', () => {
      openrouterCustomGroup.style.display = openrouterPreset.value === 'custom' ? 'block' : 'none';
    });

    const openaiPreset = modal.querySelector('#setting-openai-preset');
    const openaiCustomGroup = modal.querySelector('#group-openai-custom');
    openaiPreset?.addEventListener('change', () => {
      openaiCustomGroup.style.display = openaiPreset.value === 'custom' ? 'block' : 'none';
    });

    const webgpuPreset = modal.querySelector('#setting-webgpu-model');
    const webgpuCustomGroup = modal.querySelector('#group-webgpu-custom');
    webgpuPreset?.addEventListener('change', () => {
      webgpuCustomGroup.style.display = webgpuPreset.value === 'custom' ? 'block' : 'none';
    });

    modal.querySelector('#settings-open-explorer-btn')?.addEventListener('click', () => {
      close();
      this.onOpenModelExplorer?.();
    });

    // WebMCP test button
    modal.querySelector('#btn-test-webmcp')?.addEventListener('click', () => {
      const statusDiv = modal.querySelector('#webmcp-test-status');
      if (window.ams) {
        const state = window.ams.getStudioState();
        statusDiv.innerHTML = `<span style="color: var(--accent-success);">✔ window.ams responsive. Active: ${state.activeArtistName}, Medium: ${state.activeMediumName}, Canvas: ${state.canvasSize}px.</span>`;
      } else {
        statusDiv.innerHTML = '<span style="color: var(--accent-error);">✖ window.ams not detected.</span>';
      }
    });

    // Copy MCP tools spec
    modal.querySelector('#btn-copy-mcp-spec')?.addEventListener('click', () => {
      if (window.ams) {
        navigator.clipboard.writeText(JSON.stringify(window.ams.listTools(), null, 2));
        const statusDiv = modal.querySelector('#webmcp-test-status');
        statusDiv.innerHTML = '<span style="color: var(--accent-success);">✔ MCP Tools JSON schema copied to clipboard!</span>';
      }
    });

    // Preload WebGPU Model Weights
    modal.querySelector('#btn-preload-webgpu')?.addEventListener('click', async () => {
      if (!webgpuArtist) return;
      const webgpuPresetVal = modal.querySelector('#setting-webgpu-model')?.value;
      const webgpuCustomVal = modal.querySelector('#setting-webgpu-custom')?.value.trim();
      const targetModel = webgpuPresetVal === 'custom' ? webgpuCustomVal : webgpuPresetVal;
      if (!targetModel) return;

      const btn = modal.querySelector('#btn-preload-webgpu');
      const label = modal.querySelector('#preload-status-label');
      const progressWrap = modal.querySelector('#preload-progress-wrap');
      const progressBar = modal.querySelector('#preload-progress-bar');
      const fileNameEl = modal.querySelector('#preload-file-name');
      const pctEl = modal.querySelector('#preload-pct');

      if (btn) btn.disabled = true;
      if (progressWrap) progressWrap.style.display = 'block';
      if (label) {
        label.textContent = '● Downloading...';
        label.style.color = '#38bdf8';
      }

      try {
        await webgpuArtist.preloadModel(targetModel, (p) => {
          if (progressBar) progressBar.style.width = `${Math.min(Math.max(p.progress || 0, 2), 100)}%`;
          if (pctEl) pctEl.textContent = `${p.progress || 0}%`;
          if (fileNameEl) fileNameEl.textContent = p.shardName ? `${p.shardName} (${p.loadedMB}/${p.totalMB} MB)` : p.message;
        });

        if (label) {
          label.textContent = '● In Memory (Ready)';
          label.style.color = 'var(--accent-success)';
        }
        if (fileNameEl) fileNameEl.textContent = 'All weights successfully cached locally.';
        if (progressBar) progressBar.style.width = '100%';
      } catch (err) {
        if (label) {
          label.textContent = '▲ Error loading';
          label.style.color = '#f87171';
        }
        if (fileNameEl) fileNameEl.textContent = err.message;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    modal.querySelector('#save-settings-btn')?.addEventListener('click', () => {
      // 1. OpenRouter
      const openRouterKey = modal.querySelector('#setting-openrouter-key')?.value.trim() || '';
      const orPresetVal = modal.querySelector('#setting-openrouter-preset')?.value;
      const orCustomVal = modal.querySelector('#setting-openrouter-custom')?.value.trim();
      const openRouterModel = orPresetVal === 'custom' ? orCustomVal : orPresetVal;

      localStorage.setItem('ams_openrouter_key', openRouterKey);
      localStorage.setItem('ams_openrouter_model', openRouterModel);
      if (openrouter) {
        openrouter.apiKey = openRouterKey;
        openrouter.model = openRouterModel;
      }

      // 2. OpenAI / ChatGPT
      const openAIBaseURL = modal.querySelector('#setting-openai-baseurl')?.value.trim() || 'https://api.openai.com/v1';
      const openAIKey = modal.querySelector('#setting-openai-key')?.value.trim() || '';
      const oaiPresetVal = modal.querySelector('#setting-openai-preset')?.value;
      const oaiCustomVal = modal.querySelector('#setting-openai-custom')?.value.trim();
      const openAIModel = oaiPresetVal === 'custom' ? oaiCustomVal : oaiPresetVal;
      const openAIHeaders = modal.querySelector('#setting-openai-headers')?.value.trim() || '';

      localStorage.setItem('ams_openai_base_url', openAIBaseURL);
      localStorage.setItem('ams_openai_key', openAIKey);
      localStorage.setItem('ams_openai_model', openAIModel);
      localStorage.setItem('ams_openai_headers', openAIHeaders);

      if (openai) {
        openai.baseURL = openAIBaseURL;
        openai.apiKey = openAIKey;
        openai.model = openAIModel;
        openai.customHeaders = openAIHeaders;
      }

      // 3. Ollama
      const ollamaEndpoint = modal.querySelector('#setting-ollama-endpoint')?.value.trim();
      const ollamaModel = modal.querySelector('#setting-ollama-model')?.value;
      if (ollama) {
        if (ollamaEndpoint) ollama.endpoint = ollamaEndpoint;
        if (ollamaModel) ollama.model = ollamaModel;
      }

      // 4. WebGPU & Pixel Grid
      const webgpuPresetVal = modal.querySelector('#setting-webgpu-model')?.value;
      const webgpuCustomVal = modal.querySelector('#setting-webgpu-custom')?.value.trim();
      const webgpuModel = webgpuPresetVal === 'custom' ? webgpuCustomVal : webgpuPresetVal;
      const pixelGrid = modal.querySelector('#setting-pixel-grid')?.value;

      if (webgpuArtist && webgpuModel) {
        webgpuArtist.setModel(webgpuModel);
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
