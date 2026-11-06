/**
 * The code editor (CodeMirror 6, as in underscores): line numbers, wrapping, brackets, folding,
 * search, comments (Cmd+/), completion and hover docs for the score vocabulary, and the failing
 * line marked after a run.
 */
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, hoverTooltip, placeholder as placeholderExt } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { indentUnit, bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, lintGutter, setDiagnostics } from '@codemirror/lint';
import { tags as t } from '@lezer/highlight';
import { SCRIPT_VOCAB } from '../process/script.js';
import { BRUSHES } from '../process/brushes.js';
import { codeParams } from './codeParams.js';
import { codeView, setCodeView, onCodeView, bumpCodeFont } from './codeView.js';
import { formatSource, minifySource } from './codeTools.js';
import { semanticCompletion, semanticHover } from './languageService.js';
import { colorDots } from './colorDots.js';
import { sketchFromPaste } from '../process/pasteSketch.js';

const VOCAB = new Map(SCRIPT_VOCAB.map(v => [v.name, v]));
const KIT_DOCS = [
  ['frames', '(e, samples, smoothing)', 'The walk: [{ x, y, nx, ny, speed, pressure }] resampled along the stroke.'],
  ['smoothPath', '(points, closed, samples)', 'Catmull-Rom resampling of [x, y, t, p] points.'],
  ['tracePath', '(ctx, pts, closed)', 'Begin a path through the points.'],
  ['spans', '(poly, y)', 'x positions where a horizontal line crosses the polygon (pairs: inside).'],
  ['rotatePts', '(pts, angle, cx, cy)', 'Rotate points about (cx, cy).'],
  ['segment', '(ctx, x1, y1, x2, y2)', 'Stroke one segment.'],
  ['beginInk', '(ctx, e, { width, opacity })', 'ctx.save(), then the element color, width, opacity, round caps. End with ctx.restore().'],
  ['draw', "(id, ctx, e, params)", 'Draw with another brush.'],
  ['rng', '()', 'Seeded random 0..1 for this element.'],
  ['noise', '(x, y)', 'Smooth value noise, about -1..1.'],
  ['scale', '', 'Screen scale (for hairlines: 1 / k.scale).'],
  ['INK', '', 'The default ink color.']
];

// Quiet, near-grayscale highlighting that follows the workbench theme tokens.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--cm-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--cm-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--cm-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-fn)' },
  { tag: [t.propertyName], color: 'var(--cm-prop)' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--cm-punct)' }
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--code-fs, 12px)', background: 'var(--wb-panel-2)', color: 'var(--wb-text)', borderRadius: '6px', border: '1px solid var(--wb-line)' },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--wb-muted)' },
  '.cm-scroller': { fontFamily: 'var(--code-font, var(--font-mono, ui-monospace, Menlo, monospace))', lineHeight: '1.5', fontVariantLigatures: 'var(--code-lig, none)', fontFeatureSettings: 'var(--code-feat, "liga" 0, "calt" 0)' },
  '.cm-content': { caretColor: 'var(--wb-text)', padding: '6px 0' },
  '.cm-gutters': { background: 'transparent', color: 'var(--wb-muted)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { background: 'color-mix(in srgb, var(--wb-text) 5%, transparent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { background: 'color-mix(in srgb, var(--wb-select) 30%, transparent) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--wb-text)' },
  '.cm-matchingBracket': { background: 'color-mix(in srgb, var(--wb-select) 25%, transparent)', outline: 'none' },
  '.cm-tooltip': { background: 'var(--wb-panel)', border: '1px solid var(--wb-line)', color: 'var(--wb-text)', borderRadius: '6px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--wb-on)', color: 'var(--wb-text)' },
  '.cm-completionDetail': { color: 'var(--wb-muted)', fontStyle: 'normal', marginLeft: '8px' },
  '.cm-completionInfo': { maxWidth: '320px', whiteSpace: 'normal' },
  '.cm-foldGutter span': { color: 'var(--wb-muted)' },
  '.cm-panels': { background: 'var(--wb-panel)', color: 'var(--wb-text)' },
  '.cm-textfield': { background: 'var(--wb-panel-2)', color: 'var(--wb-text)', border: '1px solid var(--wb-line)' },
  '.cm-button': { background: 'var(--wb-panel-2)', color: 'var(--wb-text)', border: '1px solid var(--wb-line)', backgroundImage: 'none' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #c0563f' },
  '.cm-diagnostic-error': { borderLeftColor: '#c0563f' },
  '.cm-hover-doc': { padding: '6px 8px', maxWidth: '340px', fontSize: '12px' },
  '.cm-headline': { fontWeight: '600' },
  '.cm-headline span': { color: 'var(--wb-text) !important', fontStyle: 'normal !important' },
  '.cm-hover-doc code': { fontFamily: 'var(--font-mono, monospace)' }
});

/** Completions: the vocabulary, brush names inside brush: '…', and the current brush's parameters as option keys. */
function scoreCompletions(getDocLines) {
  return context => {
    const before = context.state.sliceDoc(Math.max(0, context.pos - 200), context.pos);
    // brush: '| → brush names (built-in and this drawing's own lines)
    const bm = before.match(/brush\s*:\s*['"]([\w-]*)$/);
    if (bm) {
      const names = [...Object.keys(BRUSHES).filter(k => !BRUSHES[k].custom), ...getDocLines()];
      return { from: context.pos - bm[1].length, options: names.map(n => ({ label: n, type: 'enum', detail: BRUSHES[n]?.label || 'your line', info: BRUSHES[n]?.doc })) };
    }
    // k. → the brush kit
    const km = before.match(/\bk\.(\w*)$/);
    if (km) return { from: context.pos - km[1].length, options: KIT_DOCS.map(([label, detail, info]) => ({ label, type: 'method', detail, info })) };
    const word = context.matchBefore(/[\w$]+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    // Inside { … } after a brush: offer that brush's parameters as keys.
    const brush = (before.match(/brush\s*:\s*['"]([\w-]+)['"][^)]*$/) || [])[1];
    const inOpts = /\{[^{}()]*$/.test(before);
    const params = inOpts && brush && BRUSHES[brush] ? BRUSHES[brush].params.map(p => ({ label: p.key, type: 'property', detail: `${p.min}–${p.max}, ${p.default}`, info: p.doc, apply: `${p.key}: ` })) : [];
    const vocab = SCRIPT_VOCAB.map(v => ({ label: v.name, type: /^[A-Z]+$/.test(v.name) ? 'constant' : 'function', detail: v.signature.replace(/^\w+/, '').slice(0, 60), info: v.doc || undefined, boost: /^(line|plane|point|stage|guide|gesture|note|walk|decide)$/.test(v.name) ? 2 : 0 }));
    const keys = inOpts ? ['why', 'color', 'brush', 'stage', 'closed', 'pressures', 'seed'].map(k => ({ label: k, type: 'property', apply: `${k}: `, boost: 1 })) : [];
    return { from: word.from, options: [...params, ...keys, ...vocab], validFor: /^[\w$]*$/ };
  };
}

const hoverDocs = hoverTooltip((view, pos) => {
  const { from, to, text } = view.state.doc.lineAt(pos);
  let s = pos - from, e = pos - from;
  while (s > 0 && /[\w$]/.test(text[s - 1])) s--;
  while (e < text.length && /[\w$]/.test(text[e])) e++;
  const word = text.slice(s, e);
  const v = VOCAB.get(word) || (BRUSHES[word] ? { signature: `brush '${word}'`, doc: BRUSHES[word].doc } : null);
  if (!v) return null;
  return { pos: from + s, end: from + e, above: true, create: () => { const dom = document.createElement('div'); dom.className = 'cm-hover-doc'; dom.innerHTML = `<code>${v.signature.replace(/</g, '&lt;')}</code>${v.doc ? `<div style="margin-top:4px;opacity:.8">${v.doc.replace(/</g, '&lt;')}</div>` : ''}`; return { dom }; } };
});

/**
 * Languages the editor speaks: the studio's score ('ams', with its completions and docs), p5.js,
 * Markdown and HTML.
 */
const languageFor = (lang, getDocLines, help = true) => (lang === 'markdown' ? [markdown()]
  : lang === 'html' ? [html()]
  // p5.js and three.js sketches: completion and hover docs from the libraries' own types (when code help is on)
  : lang === 'p5' || lang === 'three' ? [javascript(), ...(help ? [autocompletion({ override: [semanticCompletion(lang)], icons: false }), semanticHover(lang)] : [])]
  : [javascript(), hoverDocs, autocompletion({ override: [scoreCompletions(getDocLines)], icons: false })]);

let lastEditor = null;
if (typeof window !== 'undefined') Object.defineProperty(window, '__codeEditor', { configurable: true, get: () => lastEditor });   // (for the console and tests)
/** The code editor last used (for the buttons that act on "the" editor). */
export const activeCodeEditor = () => lastEditor;

/**
 * Headline comments: a line that starts `//!` is a note to the reader that matters (what a clip is, in words), so it is not dimmed like other comments:
 * the marker stays quiet and the text is bold and in the text color.
 */
const HEADLINE = Decoration.line({ class: 'cm-headline' });
const headlines = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  build(view) {
    const out = [];
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        if (/^\s*\/\/!/.test(line.text)) out.push(HEADLINE.range(line.from));
        pos = line.to + 1;
      }
    }
    return Decoration.set(out);
  }
}, { decorations: v => v.decorations });

export function createCodeEditor(parent, { value = '', onRun, onChange, onNotice, getDocLines = () => [], placeholder = '', language = 'ams' } = {}) {
  const wrap = new Compartment(), lang = new Compartment(), indent = new Compartment(), dots = new Compartment();
  let live = null;
  const nums = new Compartment(), params = new Compartment();
  const docFns = [], liveFns = [];
  const paramsExt = () => codeParams(() => live, { overlay: codeView().sliders === 'code' });
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: value,
      extensions: [
        dots.of(codeView().colorDots === false ? [] : colorDots()),
        nums.of(codeView().lineNumbers ? lineNumbers() : []), foldGutter(), params.of(paramsExt()), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(), history(),
        indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(), lintGutter(), linter(() => [], { delay: 1e9 }),
        lang.of(languageFor(language, getDocLines, codeView().help)), syntaxHighlighting(highlight), theme, headlines,
        wrap.of(codeView().wrap === false ? [] : EditorView.lineWrapping), indent.of([indentUnit.of(' '.repeat(codeView().tabSize || 2)), EditorState.tabSize.of(codeView().tabSize || 2)]),
        placeholder ? placeholderExt(placeholder) : [],
        keymap.of([
          { key: 'Mod-Enter', run: () => { onRun?.(); return true; } },
          { key: 'Alt-Shift-f', run: () => { api.format(); return true; } },
          { key: 'Alt-Shift-m', run: () => { api.minimize(); return true; } },
          { key: 'Mod-Shift-=', run: () => { bumpCodeFont(1); return true; } },
          { key: 'Mod-Shift-+', run: () => { bumpCodeFont(1); return true; } },
          { key: 'Mod-Shift--', run: () => { bumpCodeFont(-1); return true; } },
          { key: 'Mod-Shift-_', run: () => { bumpCodeFont(-1); return true; } },
          ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...foldKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap
        ]),
        EditorView.updateListener.of(u => { if (u.docChanged) { onChange?.(u.state.doc.toString()); for (const f of docFns) f(); view.dispatch(setDiagnostics(u.state, [])); } }),
        // Code is typed as it is: no autocorrect, and the "smart" punctuation a system may substitute (…, “ ”, —) goes back to plain characters.
        EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'data-gramm': 'false' }),
        EditorView.inputHandler.of((v, from, to, text) => {
          if (language === 'markdown' || !/[…“”‘’—–]/.test(text)) return false;
          const plain = text.replace(/…/g, '...').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/—/g, '--').replace(/–/g, '-');
          v.dispatch({ changes: { from, to, insert: plain }, selection: { anchor: from + plain.length }, userEvent: 'input.type' });
          return true;
        }),
        // Keep workbench shortcuts (V, H, P…) from firing while typing.
        // A page or a snippet from another editor, pasted into a three.js or p5.js sketch: its script, with the CDN imports as the bare names.
        EditorView.domEventHandlers({
          paste: (e, v) => {
            if (language !== 'three' && language !== 'p5') return false;
            const text = e.clipboardData?.getData('text/plain') || '';
            const doc = v.state.doc.toString();
            const from = sketchFromPaste(text, { addImport: !/\bTHREE\b/.test(doc.slice(0, 4000)) });
            if (!from || from.kind !== language) return false;
            e.preventDefault();
            v.dispatch(v.state.replaceSelection(from.code));
            onNotice?.(from.note);
            return true;
          }
        }),
        EditorView.domEventHandlers({ keydown: e => {
          lastEditor = api;
          if (!(e.ctrlKey && e.altKey && e.code === 'KeyP')) e.stopPropagation();   // (Perform works from the editor too)
          // Option+Shift+letter types a character on a Mac (Ï, Ò…), which a keymap skips: go by the physical key.
          if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); setCodeView({ wrap: codeView().wrap === false }); return true; }   // (Option+Z types Ω on a Mac)
          if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && (e.code === 'KeyF' || e.code === 'KeyM')) { e.preventDefault(); if (e.code === 'KeyF') api.format(); else api.minimize(); return true; }
          return false;
        }, mousedown: () => { lastEditor = api; return false; }, focus: () => { lastEditor = api; return false; } })
      ]
    })
  });
  let wrapping = codeView().wrap !== false, helped = codeView().help, dotted = codeView().colorDots !== false;
  onCodeView(v => {
    const effects = [nums.reconfigure(v.lineNumbers ? lineNumbers() : []), params.reconfigure(paramsExt()), indent.reconfigure([indentUnit.of(' '.repeat(v.tabSize || 2)), EditorState.tabSize.of(v.tabSize || 2)])];
    if ((v.colorDots !== false) !== dotted) { dotted = v.colorDots !== false; effects.push(dots.reconfigure(dotted ? colorDots() : [])); }
    if (v.help !== helped) { helped = v.help; effects.push(lang.reconfigure(languageFor(language, getDocLines, helped))); }
    if ((v.wrap !== false) !== wrapping) { wrapping = v.wrap !== false; effects.push(wrap.reconfigure(wrapping ? EditorView.lineWrapping : [])); }
    view.dispatch({ effects });
    view.requestMeasure();   // (a new font or size changes the width of a character)
  });
  // Replace the text by changing only what differs (the cursor, scroll and undo stay sensible).
  const replace = (from, to, text) => {
    const old = view.state.sliceDoc(from, to);
    let a = 0; while (a < old.length && a < text.length && old[a] === text[a]) a++;
    let b = 0; while (b < old.length - a && b < text.length - a && old[old.length - 1 - b] === text[text.length - 1 - b]) b++;
    if (a === old.length && a === text.length) return;
    view.dispatch({ changes: { from: from + a, to: from + old.length - b, insert: text.slice(a, text.length - b) } });
  };
  const api = {
    view,
    get value() { return view.state.doc.toString(); },
    set value(v) { if (v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }); },
    focus: () => view.focus(),
    /** Switch the language ('ams', 'p5', 'markdown', 'html'). */
    setLanguage(l) { if (l !== language) { language = l; view.dispatch({ effects: lang.reconfigure(languageFor(l, getDocLines)) }); } },
    get language() { return language; },
    /** Scroll a line (1-based) to the top of the editor. */
    scrollToLine(n) { const l = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, n))); view.dispatch({ effects: EditorView.scrollIntoView(l.from, { y: 'start', yMargin: 6 }) }); },
    /** Take the editor down (its listeners go with it). */
    destroy() { view.destroy(); },
    /** Insert text at the cursor (it replaces the selection). */
    insert(text) { view.dispatch(view.state.replaceSelection(text)); },
    /** What is selected ('' if nothing). */
    selectionText() { const m = view.state.selection.main; return m.empty ? '' : view.state.sliceDoc(m.from, m.to); },
    /** Format the selection, or all the code (Alt+Shift+F). */
    async format() {
      const sel = view.state.selection.main, ranged = !sel.empty;
      const r = await formatSource(view.state.doc.toString(), language, ranged ? { from: sel.from, to: sel.to } : null);
      if (r.error) { api.markError(r.error.line || 1, r.error.message); return r; }
      api.markError(null); replace(0, view.state.doc.length, r.text.replace(/\n$/, view.state.doc.toString().endsWith('\n') ? '\n' : ''));
      return r;
    },
    /** Minimize the selection, or all the code (Alt+Shift+M): whitespace and comments go; control comments stay. */
    async minimize() {
      const sel = view.state.selection.main, ranged = !sel.empty;
      const from = ranged ? sel.from : 0, to = ranged ? sel.to : view.state.doc.length;
      const r = await minifySource(view.state.sliceDoc(from, to), language);
      if (r.error) { api.markError(r.error.line || 1, r.error.message); return r; }
      api.markError(null); replace(from, to, ranged ? r.text.trimEnd() : r.text);
      return r;
    },
    /** Param sliders drive live values ({ get(key), set(key, v) }) instead of rewriting defaults; null: rewrite. */
    setLive(l) { live = l; view.dispatch({}); for (const f of liveFns) f(); },
    getLive: () => live,
    onDocChange: f => docFns.push(f),
    onLiveChange: f => liveFns.push(f),
    toggleWrap() { wrapping = !wrapping; view.dispatch({ effects: wrap.reconfigure(wrapping ? EditorView.lineWrapping : []) }); return wrapping; },
    /** Mark a line (1-based) with an error message; null clears. */
    markError(line, message) {
      if (!line) { view.dispatch(setDiagnostics(view.state, [])); return; }
      const l = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, line)));
      view.dispatch(setDiagnostics(view.state, [{ from: l.from, to: l.to, severity: 'error', message }]));
      view.dispatch({ effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
    }
  };
  return api;
}