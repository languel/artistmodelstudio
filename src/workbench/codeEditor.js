/**
 * The code editor (CodeMirror 6, as in underscores): line numbers, wrapping, brackets, folding,
 * search, comments (Cmd+/), completion and hover docs for the score vocabulary, and the failing
 * line marked after a run.
 */
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, hoverTooltip, placeholder as placeholderExt } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, lintGutter, setDiagnostics } from '@codemirror/lint';
import { tags as t } from '@lezer/highlight';
import { SCRIPT_VOCAB } from '../process/script.js';
import { BRUSHES } from '../process/brushes.js';
import { codeParams } from './codeParams.js';
import { codeView, onCodeView } from './codeView.js';

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
  '&': { height: '100%', fontSize: '12px', background: 'var(--wb-panel-2)', color: 'var(--wb-text)', borderRadius: '6px', border: '1px solid var(--wb-line)' },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--wb-muted)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)', lineHeight: '1.5' },
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

export function createCodeEditor(parent, { value = '', onRun, onChange, getDocLines = () => [], placeholder = '' } = {}) {
  const wrap = new Compartment();
  let live = null;
  const nums = new Compartment(), params = new Compartment();
  const docFns = [], liveFns = [];
  const paramsExt = () => codeParams(() => live, { overlay: codeView().sliders === 'code' });
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: value,
      extensions: [
        nums.of(codeView().lineNumbers ? lineNumbers() : []), foldGutter(), params.of(paramsExt()), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(), history(),
        indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(), lintGutter(), linter(() => [], { delay: 1e9 }),
        javascript(), syntaxHighlighting(highlight), theme, hoverDocs,  
        autocompletion({ override: [scoreCompletions(getDocLines)], icons: false }),
        wrap.of(EditorView.lineWrapping),
        placeholder ? placeholderExt(placeholder) : [],
        keymap.of([
          { key: 'Mod-Enter', run: () => { onRun?.(); return true; } },
          ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...foldKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap
        ]),
        EditorView.updateListener.of(u => { if (u.docChanged) { onChange?.(u.state.doc.toString()); for (const f of docFns) f(); view.dispatch(setDiagnostics(u.state, [])); } }),
        // Keep workbench shortcuts (V, H, P…) from firing while typing.
        EditorView.domEventHandlers({ keydown: e => { e.stopPropagation(); return false; } })
      ]
    })
  });
  let wrapping = true;
  onCodeView(v => view.dispatch({ effects: [nums.reconfigure(v.lineNumbers ? lineNumbers() : []), params.reconfigure(paramsExt())] }));
  return {
    view,
    get value() { return view.state.doc.toString(); },
    set value(v) { if (v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } }); },
    focus: () => view.focus(),
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
}
