/**
 * Medium options popover: Pixel and ASCII settings, shared by the Pixel and
 * ASCII media, continuous mode (Render: Pixel / ASCII) and exports.
 */
import { ASCII_RAMPS, PIXEL_PALETTES, RAMP_LABELS } from '../fitting/stylize.js';

const PALETTE_LABELS = { full: 'Full colour', pico8: 'PICO-8', gameboy: 'Game Boy', cga: 'CGA', bit1: '1-bit', gray8: 'Grayscale 8' };

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export class MediumOptions {
  constructor({ getStyle, onChange }) {
    this.getStyle = getStyle;
    this.onChange = onChange;
    this.el = null;
  }

  toggle(anchor) {
    if (this.el) return this.close();
    this.open(anchor);
  }

  close() {
    this.el?.remove();
    this.el = null;
    document.removeEventListener('pointerdown', this.outside, true);
  }

  open(anchor) {
    const s = this.getStyle();
    const el = document.createElement('div');
    el.className = 'medium-options';
    el.innerHTML = `
      <div class="mo-section" title="Pixel medium and Render: Pixel">
        <span class="mo-heading">Pixel</span>
        <label class="live-slider" title="Cells on the long side"><span>Cells</span>
          <input type="range" id="mo-cells" min="8" max="256" step="1" value="${s.pixelCells}" />
          <input class="num-field" id="mo-cells-num" inputmode="numeric" value="${s.pixelCells}" /></label>
        <label class="live-slider" title="Snap colours to a palette"><span>Palette</span>
          <select id="mo-palette">${Object.keys(PIXEL_PALETTES).map(k => `<option value="${k}" ${k === s.pixelPalette ? 'selected' : ''}>${PALETTE_LABELS[k]}</option>`).join('')}</select></label>
      </div>
      <div class="mo-section" title="ASCII medium and Render: ASCII">
        <span class="mo-heading">ASCII</span>
        <label class="live-slider" title="Characters from sparse to dense"><span>Chars</span>
          <select id="mo-ramp">${[...Object.keys(ASCII_RAMPS), 'custom'].map(k => `<option value="${k}" ${k === s.asciiRamp ? 'selected' : ''}>${RAMP_LABELS[k] || k}</option>`).join('')}</select></label>
        <label class="live-slider" id="mo-custom-row" title="Your own characters, from sparse to dense (start with a space)" ${s.asciiRamp === 'custom' ? '' : 'hidden'}><span>Custom</span>
          <input class="mo-text" id="mo-custom" value="${esc(s.asciiCustom)}" spellcheck="false" /></label>
        <div class="mo-preview" id="mo-preview" title="Current characters, sparse to dense"></div>
        <label class="live-slider" title="Characters across"><span>Columns</span>
          <input type="range" id="mo-cols" min="16" max="240" step="1" value="${s.asciiCols}" />
          <input class="num-field" id="mo-cols-num" inputmode="numeric" value="${s.asciiCols}" /></label>
        <label class="live-slider" title="Colour: characters tinted by the picture. Mono: one ink colour."><span>Colour</span>
          <select id="mo-color"><option value="color" ${s.asciiColor === 'color' ? 'selected' : ''}>Colour</option><option value="mono" ${s.asciiColor === 'mono' ? 'selected' : ''}>Mono</option></select></label>
        <label class="live-slider" title="On: bright areas get dense characters (dark ground). Off: dark areas do (light ground)."><span>Invert</span>
          <select id="mo-invert"><option value="1" ${s.asciiInvert ? 'selected' : ''}>On (dark ground)</option><option value="0" ${s.asciiInvert ? '' : 'selected'}>Off (light ground)</option></select></label>
      </div>`;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom + 6}px`;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.left))}px`;
    this.el = el;

    const set = (patch) => { this.onChange?.(patch); this.preview(); };
    const pair = (id, key, min, max) => {
      const range = el.querySelector(`#mo-${id}`), num = el.querySelector(`#mo-${id}-num`);
      range.addEventListener('input', () => { num.value = range.value; set({ [key]: Number(range.value) }); });
      num.addEventListener('change', () => {
        const v = Math.round(Number(num.value));
        if (!Number.isFinite(v)) return;
        const value = Math.min(max, Math.max(min, v));
        num.value = value; range.value = value; set({ [key]: value });
      });
    };
    pair('cells', 'pixelCells', 2, 1024);
    pair('cols', 'asciiCols', 4, 600);
    el.querySelector('#mo-palette').addEventListener('change', e => set({ pixelPalette: e.target.value }));
    el.querySelector('#mo-ramp').addEventListener('change', e => {
      el.querySelector('#mo-custom-row').hidden = e.target.value !== 'custom';
      set({ asciiRamp: e.target.value });
    });
    el.querySelector('#mo-custom').addEventListener('input', e => set({ asciiCustom: e.target.value || ' .' }));
    el.querySelector('#mo-color').addEventListener('change', e => set({ asciiColor: e.target.value }));
    el.querySelector('#mo-invert').addEventListener('change', e => set({ asciiInvert: e.target.value === '1' }));
    this.preview();

    this.outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) this.close(); };
    document.addEventListener('pointerdown', this.outside, true);
  }

  preview() {
    const s = this.getStyle();
    const p = this.el?.querySelector('#mo-preview');
    if (p) p.textContent = (s.asciiRamp === 'custom' ? s.asciiCustom : ASCII_RAMPS[s.asciiRamp]) || '';
  }
}
