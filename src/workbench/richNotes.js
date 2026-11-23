/**
 * Notes written in Markdown or with math, shown rendered: an HTML layer over the canvas that follows the
 * camera (as the document boards do, boardFrames.js), one element a note, in the note's own lettering,
 * size, width, paper and ink. The canvas leaves these notes out (renderDocument's richNotes) and draws
 * the rest; a picture or SVG made elsewhere draws them as plain text (notes.js plainNoteText).
 *
 * Each element is laid out at the note's size in artboard units and scaled by the zoom, so its height
 * (what the Markdown and math take) is known in artboard units: noteHeights, so selection and
 * hit-testing fit what is shown.
 */
import { noteProps, isRichNote, noteHeights, NOTE_FONTS } from '../process/notes.js';
import { boardsOf, MAIN } from '../process/boards.js';
import { inkOn } from '../process/document.js';

// Marked, KaTeX and its stylesheet, loaded when a note first needs them (Poliplan's lean build keeps them out of its main
// script: vite.embed.config.js stubs markdown.js everywhere but here).
let loading = null;
const loadMarkdown = () => (loading ||= Promise.all([import('../process/markdown.js'), import('katex/dist/katex.min.css')]).then(([m]) => m.renderMarkdown));

export class RichNotes {
  constructor(app) {
    this.app = app;
    this.canvas = app.canvas;
    this.layer = document.createElement('div');
    this.layer.className = 'wb-rnotes';
    this.canvas.host.append(this.layer);   // (after the document boards: a note is written over them)
    this.els = new Map();   // note id → { el, key }
  }

  /** After each canvas redraw (the camera may have moved) and when the drawing changes. */
  update() {
    const cv = this.canvas, doc = cv.previewDoc || this.app.store.doc, z = cv.cam.z;
    // Until the renderer is here, the canvas draws these notes as plain text (cv.richNotes off).
    if (!this.render) {
      if (!this.failed && !this.pending && doc.elements.some(e => e.role === 'note' && isRichNote(e)))
        this.pending = loadMarkdown().then(r => { this.render = r; cv.richNotes = true; this.update(); cv.invalidate(); }, err => { this.failed = true; console.warn('Notes in Markdown: the renderer did not load', err); });
      return;
    }
    const seen = new Set();
    // Notes show in the process view, on visible stages up to the one shown (as renderDocument draws them).
    if (cv.viewMode?.() === 'process') {
      const rank = new Map(doc.stages.map((s, i) => [s.id, i])), stages = new Map(doc.stages.map(s => [s.id, s]));
      const hiddenBoards = new Set(boardsOf(doc).filter(b => b.hidden).map(b => b.id));
      const inks = new Map(boardsOf(doc).map(b => [b.id, inkOn(b.ground)]));
      for (const e of doc.elements) {
        if (e.role !== 'note' || e.hidden || !isRichNote(e)) continue;
        const s = stages.get(e.stage);
        if (!s || !s.visible || (rank.get(e.stage) ?? 0) > (cv.upTo ?? Infinity) || hiddenBoards.has(e.board || MAIN)) continue;
        seen.add(e.id);
        const p = noteProps(e);
        const ink = e.color || (p.bg ? p.ink : inks.get(e.board || MAIN) || p.ink);
        const pad = p.bg ? p.size * 0.55 : p.size * 0.15;
        let r = this.els.get(e.id);
        if (!r) { const el = document.createElement('div'); el.className = 'wb-rnote'; this.layer.append(el); r = { el, key: '' }; this.els.set(e.id, r); }
        const key = [e.text, p.style, p.font, p.size, p.width, p.bg, ink].join('\u0001');
        if (r.key !== key) {
          r.key = key;
          Object.assign(r.el.style, {
            width: `${p.width}px`, padding: `${pad}px`, color: ink, background: p.bg || 'transparent',
            fontFamily: NOTE_FONTS[p.font][1], fontSize: `${p.size}px`, lineHeight: p.font === 'hand' ? '1.15' : '1.32'
          });
          r.el.classList.toggle('sticky', p.style === 'sticky');
          let html;
          try { html = this.render(e.text); } catch { html = ''; }
          r.el.innerHTML = html;
          const h = r.el.offsetHeight;   // (unscaled: artboard units)
          if (h && Math.abs((noteHeights.get(e.id) || 0) - h) > 0.5) { noteHeights.set(e.id, h); cv.invalidate(); }
        }
        const [sx, sy] = cv.toScreen(e.points[0][0], e.points[0][1]);
        r.el.style.transform = `translate(${sx}px, ${sy}px) scale(${z})${p.angle ? ` rotate(${p.angle}rad)` : ''}`;
        r.el.style.opacity = String(e.opacity ?? 1);
      }
    }
    for (const [id, r] of this.els) if (!seen.has(id)) { r.el.remove(); this.els.delete(id); }
  }
}
