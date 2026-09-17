/**
 * Dataset Export Modal Component
 * Enables previewing and downloading Session JSON, SFT JSONL, and Preference JSONL datasets.
 */

import { exportSessionJSON, exportSFTJSONL, exportPreferenceJSONL, downloadBlob } from '../sessions/exportDataset.js';

export class DatasetModal {
  constructor({ sessionStore }) {
    this.sessionStore = sessionStore;
    this.activeType = 'sft'; // 'sft' | 'preference' | 'session'
  }

  open() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'dataset-modal-backdrop';

    const renderBody = () => {
      let previewText = '';
      if (this.activeType === 'sft') {
        previewText = exportSFTJSONL(this.sessionStore, 'all') || '// No selected candidates yet. Generate and select candidates to produce SFT samples.';
      } else if (this.activeType === 'preference') {
        previewText = exportPreferenceJSONL(this.sessionStore) || '// No preference pairs yet. Select winning candidates from generations to produce chosen > rejected pairs.';
      } else {
        previewText = exportSessionJSON(this.sessionStore);
      }

      modal.innerHTML = `
        <div class="modal-content" style="max-width: 760px;">
          <div class="modal-header">
            <div>
              <h2 style="font-size: 1.1rem; color: var(--text-primary);">DATASET COLLECTION & EXPORT</h2>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                Sections 17–19: Export training data for SFT, LoRA, and DPO Preference learning
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
            </div>

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

      modal.querySelector('#download-dataset-btn')?.addEventListener('click', () => {
        if (this.activeType === 'sft') {
          const content = exportSFTJSONL(this.sessionStore, 'all');
          downloadBlob(content, `artist_studio_sft_${Date.now()}.jsonl`, 'application/x-jsonlines');
        } else if (this.activeType === 'preference') {
          const content = exportPreferenceJSONL(this.sessionStore);
          downloadBlob(content, `artist_studio_preference_${Date.now()}.jsonl`, 'application/x-jsonlines');
        } else {
          const content = exportSessionJSON(this.sessionStore);
          downloadBlob(content, `artist_studio_session_${Date.now()}.json`, 'application/json');
        }
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
