/**
 * Program Editor Component
 * Supports interactive inspection, live text/JSON editing, and instant re-rendering.
 */

import { programToText, textToProgram } from '../language/textFormat.js';
import { validateProgram } from '../language/validate.js';
import { normalizeProgram } from '../language/normalize.js';
import { icon } from './icons.js';

export class ProgramEditor {
  constructor({ onProgramChange, onRenderWithOtherMedium }) {
    this.candidate = null;
    this.activeTab = 'text'; // 'text' | 'json'
    this.currentText = '';
    this.currentJson = '';
    this.validation = { valid: true, errors: [], warnings: [] };

    this.onProgramChange = onProgramChange;
    this.onRenderWithOtherMedium = onRenderWithOtherMedium;
  }

  update(candidate, mediumCapabilities = null) {
    this.candidate = candidate;
    this.mediumCapabilities = mediumCapabilities;

    if (candidate?.program) {
      this.currentText = programToText(candidate.program);
      this.currentJson = JSON.stringify(candidate.program, null, 2);
      this.validation = validateProgram(candidate.program, mediumCapabilities);
    } else {
      this.currentText = '';
      this.currentJson = '';
      this.validation = { valid: true, errors: [], warnings: [] };
    }

    this.render();
  }

  render(container = null) {
    const target = container || document.querySelector('#program-editor-container');
    if (!target) return;

    if (!this.candidate) {
      target.innerHTML = `
        <div class="program-editor-panel" style="display: flex; align-items: center; justify-content: center; color: var(--text-muted);">
          <p style="font-size: 0.85rem;">Select a candidate to view & edit its drawing program.</p>
        </div>
      `;
      return;
    }

    target.innerHTML = `
      <div class="program-editor-panel">
        <div class="editor-header">
          <div class="editor-tabs">
            <button class="editor-tab-btn ${this.activeTab === 'text' ? 'active' : ''}" data-tab="text">Text DSL</button>
            <button class="editor-tab-btn ${this.activeTab === 'json' ? 'active' : ''}" data-tab="json">JSON</button>
          </div>
          <button id="editor-rerender-btn" class="btn-primary" style="padding: 4px 10px; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px;">
            ${icon('play', 'icon-sm')} <span>Re-render</span>
          </button>
        </div>

        <textarea
          id="editor-textarea"
          class="editor-textarea"
          spellcheck="false"
          placeholder="Program code..."
        >${this.activeTab === 'text' ? this.currentText : this.currentJson}</textarea>

        <div class="editor-footer">
          <div class="validation-tag ${this.validation.valid ? 'valid' : 'error'}">
            <span>${this.validation.valid ? '● Valid program' : '▲ Syntax error'}</span>
            ${this.validation.errors.length > 0 ? `<span style="font-size: 0.72rem;">(${this.validation.errors[0]})</span>` : ''}
          </div>
          <button id="editor-swap-medium-btn" class="pill-btn" style="color: var(--text-secondary); display: inline-flex; align-items: center; gap: 4px;">
            ${icon('swatch', 'icon-sm')} <span>Swap Medium</span>
          </button>
        </div>
      </div>
    `;

    this.attachEvents(target);
  }

  attachEvents(target) {
    const tabs = target.querySelectorAll('.editor-tab-btn');
    const textarea = target.querySelector('#editor-textarea');

    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const nextTab = btn.dataset.tab;
        if (nextTab === this.activeTab) return;

        // Sync contents before switching
        this.syncFromTextarea(textarea.value);
        this.activeTab = nextTab;
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        textarea.value = this.activeTab === 'text' ? this.currentText : this.currentJson;
      });
    });

    target.querySelector('#editor-rerender-btn')?.addEventListener('click', () => {
      this.handleRerender(textarea.value);
    });

    target.querySelector('#editor-swap-medium-btn')?.addEventListener('click', () => {
      this.syncFromTextarea(textarea.value);
      if (this.candidate && this.onRenderWithOtherMedium) {
        this.onRenderWithOtherMedium(this.candidate);
      }
    });

    // Support Cmd+Enter / Ctrl+Enter to re-render immediately
    textarea?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        this.handleRerender(textarea.value);
      }
    });
  }

  syncFromTextarea(value) {
    if (this.activeTab === 'text') {
      this.currentText = value;
      const prog = textToProgram(value);
      this.currentJson = JSON.stringify(prog, null, 2);
    } else {
      this.currentJson = value;
      try {
        const prog = normalizeProgram(JSON.parse(value));
        this.currentText = programToText(prog);
      } catch (e) {
        // malformed JSON while typing
      }
    }
  }

  handleRerender(value) {
    this.syncFromTextarea(value);
    let updatedProgram;

    if (this.activeTab === 'text') {
      updatedProgram = textToProgram(value);
    } else {
      try {
        updatedProgram = normalizeProgram(JSON.parse(value));
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
        return;
      }
    }

    this.validation = validateProgram(updatedProgram, this.mediumCapabilities);

    if (this.candidate && this.onProgramChange) {
      this.onProgramChange(this.candidate.id, updatedProgram);
    }
  }
}
