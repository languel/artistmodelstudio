/**
 * Dataset Export & Trained Model Management Modal
 * Enables previewing and downloading Session JSON, SFT JSONL, Preference JSONL datasets,
 * and importing / exporting trained models (.ams-model.json).
 */

import { exportSessionJSON, exportSFTJSONL, exportPreferenceJSONL, downloadBlob } from '../sessions/exportDataset.js';
import {
  getSavedModels,
  exportModelToJSON,
  importModelFromJSON,
  deleteTrainedModel
} from '../training/modelFormat.js';

export class DatasetModal {
  constructor({ sessionStore }) {
    this.sessionStore = sessionStore;
    this.activeType = 'sft'; // 'sft' | 'preference' | 'session' | 'models'
  }

  open() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'dataset-modal-backdrop';

    const renderBody = () => {
      const savedModels = getSavedModels();
      let previewText = '';

      if (this.activeType === 'sft') {
        previewText = exportSFTJSONL(this.sessionStore, 'all') || '// No selected candidates yet. Generate and select candidates to produce SFT samples.';
      } else if (this.activeType === 'preference') {
        previewText = exportPreferenceJSONL(this.sessionStore) || '// No preference pairs yet. Select winning candidates from generations to produce chosen > rejected pairs.';
      } else if (this.activeType === 'session') {
        previewText = exportSessionJSON(this.sessionStore);
      }

      modal.innerHTML = `
        <div class="modal-content" style="max-width: 780px;">
          <div class="modal-header">
            <div>
              <h2 style="font-size: 1.1rem; color: var(--text-primary);">DATASET COLLECTION & MODEL ADAPTERS</h2>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                Export training data for SFT / DPO, or import & export fine-tuned in-browser models (.ams-model.json)
              </p>
            </div>
            <button class="btn-icon" id="close-dataset-modal">✕</button>
          </div>

          <div class="modal-body">
            <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
              <button class="btn-secondary ${this.activeType === 'sft' ? 'active' : ''}" id="tab-sft">
                SFT Dataset (.jsonl)
              </button>
              <button class="btn-secondary ${this.activeType === 'preference' ? 'active' : ''}" id="tab-pref">
                Preference Dataset (.jsonl)
              </button>
              <button class="btn-secondary ${this.activeType === 'session' ? 'active' : ''}" id="tab-session">
                Full Session (.json)
              </button>
              <button class="btn-secondary ${this.activeType === 'models' ? 'active' : ''}" id="tab-models">
                🎓 Trained Models (${savedModels.length})
              </button>
            </div>

            ${this.activeType === 'models' ? `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 0.82rem; color: var(--text-secondary);">
                  Portable in-browser fine-tuned models & LoRA weights (.ams-model.json)
                </span>
                <div>
                  <input type="file" id="import-model-file-input" accept=".json,.ams-model" style="display: none;" />
                  <button class="btn-secondary" id="import-model-btn" style="padding: 6px 12px; font-size: 0.82rem;">
                    ⬆ Import Model (.json)
                  </button>
                </div>
              </div>

              ${savedModels.length === 0 ? `
                <div style="padding: 24px; text-align: center; border: 1px dashed var(--border-color); border-radius: 6px; color: var(--text-secondary);">
                  <p>No trained models found in browser storage.</p>
                  <p style="font-size: 0.8rem; margin-top: 6px;">Use WebMCP or the in-browser trainer to fine-tune an adapter on your selected artworks.</p>
                </div>
              ` : `
                <div style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                  ${savedModels.map(m => `
                    <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                      <div>
                        <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary);">${escapeHtml(m.name)}</div>
                        <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 2px;">
                          Base: <code>${escapeHtml(m.baseModel)}</code> · Arch: <code>${escapeHtml(m.architecture || 'LoRA')}</code> · Final Loss: <strong>${m.trainingMetrics?.finalLoss ? m.trainingMetrics.finalLoss.toFixed(4) : 'N/A'}</strong>
                        </div>
                      </div>
                      <div style="display: flex; gap: 6px;">
                        <button class="btn-micro export-model-item-btn" data-id="${m.id}" title="Export .ams-model.json">
                          ⬇ Export
                        </button>
                        <button class="btn-micro delete-model-item-btn" data-id="${m.id}" style="color: var(--accent-red);" title="Delete Model">
                          ✕
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            ` : `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.82rem; color: var(--text-secondary);">
                  ${this.activeType === 'sft'
                    ? 'Standard chat messages format: {"messages": [{"role": "user", ...}, {"role": "assistant", ...}]}'
                    : this.activeType === 'preference'
                    ? 'Pairwise chosen vs rejected format: {"prompt": "...", "chosen": "...", "rejected": "..."}'
                    : 'Full provenance records: prompt, model, medium, seed, ratings, lineage'}
                </span>
                <button class="btn-primary" id="download-dataset-btn" style="padding: 6px 14px; font-size: 0.82rem;">
                  ⬇ Download File
                </button>
              </div>

              <pre style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 12px; font-family: var(--font-mono); font-size: 0.78rem; max-height: 320px; overflow: auto; white-space: pre-wrap; color: #d4d4d4;">${escapeHtml(previewText)}</pre>
            `}
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" id="done-dataset-modal">Done</button>
          </div>
        </div>
      `;

      // Attach events
      const close = () => modal.remove();
      modal.querySelector('#close-dataset-modal')?.addEventListener('click', close);
      modal.querySelector('#done-dataset-modal')?.addEventListener('click', close);

      modal.querySelector('#tab-sft')?.addEventListener('click', () => {
        this.activeType = 'sft';
        renderBody();
      });
      modal.querySelector('#tab-pref')?.addEventListener('click', () => {
        this.activeType = 'preference';
        renderBody();
      });
      modal.querySelector('#tab-session')?.addEventListener('click', () => {
        this.activeType = 'session';
        renderBody();
      });
      modal.querySelector('#tab-models')?.addEventListener('click', () => {
        this.activeType = 'models';
        renderBody();
      });

      // Dataset download
      modal.querySelector('#download-dataset-btn')?.addEventListener('click', () => {
        if (this.activeType === 'sft') {
          const content = exportSFTJSONL(this.sessionStore, 'all');
          downloadBlob(content, `artist_studio_sft_${Date.now()}.jsonl`, 'application/x-jsonlines');
        } else if (this.activeType === 'preference') {
          const content = exportPreferenceJSONL(this.sessionStore);
          downloadBlob(content, `artist_studio_preference_${Date.now()}.jsonl`, 'application/x-jsonlines');
        } else if (this.activeType === 'session') {
          const content = exportSessionJSON(this.sessionStore);
          downloadBlob(content, `artist_studio_session_${Date.now()}.json`, 'application/json');
        }
      });

      // Model import
      const fileInput = modal.querySelector('#import-model-file-input');
      modal.querySelector('#import-model-btn')?.addEventListener('click', () => {
        fileInput?.click();
      });

      fileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            importModelFromJSON(evt.target.result);
            renderBody();
          } catch (err) {
            alert(`Failed to import model: ${err.message}`);
          }
        };
        reader.readAsText(file);
      });

      // Model export items
      modal.querySelectorAll('.export-model-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.dataset.id;
          const target = getSavedModels().find(m => m.id === id);
          if (target) {
            const json = exportModelToJSON(target);
            downloadBlob(json, `${target.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${Date.now()}.ams-model.json`, 'application/json');
          }
        });
      });

      // Model delete items
      modal.querySelectorAll('.delete-model-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.dataset.id;
          if (confirm('Delete this trained model from browser storage?')) {
            deleteTrainedModel(id);
            renderBody();
          }
        });
      });
    };

    renderBody();
    document.body.appendChild(modal);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
