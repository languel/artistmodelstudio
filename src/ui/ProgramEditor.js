/**
 * Program Editor Component
 * Supports interactive inspection, live text/JSON editing, and instant re-rendering.
 */

import { programToText, textToProgram } from '../language/textFormat.js';
import { validateProgram } from '../language/validate.js';
import { normalizeProgram } from '../language/normalize.js';
import { icon } from './icons.js';
import { buildP5Sketch, buildP5ProjectZip, downloadBytes } from '../export/p5Export.js';

export class ProgramEditor {
  constructor({ onProgramChange, onRenderWithOtherMedium, getExportContext }) {
    this.candidate = null;
    this.activeTab = 'text'; // 'text' | 'json' | 'p5' (p5 is generated, read-only)
    this.getExportContext = getExportContext;
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
            <button class="editor-tab-btn ${this.activeTab === 'p5' ? 'active' : ''}" data-tab="p5">p5.js</button>
          </div>
          <div class="editor-actions">
            <button id="editor-copy-btn" class="btn-micro" title="Copy this tab's code">Copy</button>
            <button id="editor-export-btn" class="btn-micro" title="Text DSL: .txt · JSON: .json · p5.js: project .zip">
              ${icon('arrowDownTray', 'icon-sm')} <span>Export</span>
            </button>
            <button id="editor-rerender-btn" class="btn-primary" style="padding: 4px 10px; font-size: 0.78rem; display: ${this.activeTab === 'p5' ? 'none' : 'inline-flex'}; align-items: center; gap: 4px;">
              ${icon('play', 'icon-sm')} <span>Re-render</span>
            </button>
          </div>
        </div>

        <textarea
          id="editor-textarea"
          class="editor-textarea"
          spellcheck="false"
          placeholder="Program code..."
          ${this.activeTab === 'p5' ? 'readonly' : ''}
        >${this.activeTab === 'text' ? this.currentText : this.activeTab === 'json' ? this.currentJson : ''}</textarea>

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
        if (this.activeTab !== 'p5') this.syncFromTextarea(textarea.value);
        this.activeTab = nextTab;
        this.render();
      });
    });

    if (this.activeTab === 'p5') this.fillP5(textarea);

    target.querySelector('#editor-copy-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try {
        await navigator.clipboard.writeText(textarea.value);
        btn.textContent = 'Copied';
      } catch {
        textarea.select();
        btn.textContent = 'Press ⌘C';
      }
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });

    target.querySelector('#editor-export-btn')?.addEventListener('click', () => this.handleExport(textarea));

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

  exportTitle() {
    const c = this.candidate;
    return (c?.prompt || 'AMS sketch').slice(0, 60);
  }

  exportSlug() {
    return this.exportTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ams-sketch';
  }

  currentProgram() {
    try {
      return normalizeProgram(JSON.parse(this.currentJson));
    } catch {
      return this.candidate?.program;
    }
  }

  async fillP5(textarea) {
    textarea.value = '// Generating p5.js sketch…';
    const ctx = this.getExportContext?.() || {};
    const sketch = await buildP5Sketch(this.currentProgram(), { ...ctx, title: this.exportTitle(), source: this.candidate?.provider || '' });
    if (this.activeTab === 'p5') textarea.value = sketch;
  }

  async handleExport(textarea) {
    const slug = this.exportSlug();
    if (this.activeTab === 'text') {
      this.syncFromTextarea(textarea.value);
      downloadBytes(this.currentText, `${slug}.ams.txt`, 'text/plain');
    } else if (this.activeTab === 'json') {
      this.syncFromTextarea(textarea.value);
      downloadBytes(this.currentJson, `${slug}.json`, 'application/json');
    } else {
      const btn = document.querySelector('#editor-export-btn span');
      if (btn) btn.textContent = 'Zipping…';
      const ctx = this.getExportContext?.() || {};
      const zip = await buildP5ProjectZip(this.currentProgram(), { ...ctx, title: this.exportTitle(), source: this.candidate?.provider || '' });
      downloadBytes(zip, `${slug}-p5.zip`, 'application/zip');
      if (btn) btn.textContent = 'Export';
    }
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
