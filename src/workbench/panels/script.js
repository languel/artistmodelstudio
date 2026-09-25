/** Score: write or load a score, run it, and the process document is recorded on the canvas. */
import { h, selectField, numberField, section } from '../ui.js';
import { icon } from '../icons.js';
import { runScript, SCRIPT_REFERENCE } from '../../process/script.js';
import { EXERCISES } from '../../process/exercises.js';
import { createCodeEditor } from '../codeEditor.js';

export function mountScript(el, app) {
  let seed = app.store.doc.meta?.seed || 1;
  const out = h('div', { class: 'wb-script-out' });
  const brief = h('div', { class: 'wb-brief' });
  const host = h('div', { class: 'wb-code-host' });
  const run = () => {
    const res = runScript(editor.value, { seed, by: { kind: 'user', name: 'you (score)' } });
    out.textContent = res.error ? `${res.errorLine ? `Line ${res.errorLine}: ` : ''}${res.error}` : (res.logs.join('\n') || `${res.doc.elements.length} elements in ${res.doc.stages.length} stages · seed ${seed}`);
    out.classList.toggle('error', Boolean(res.error));
    editor.markError(res.error ? res.errorLine || 1 : null, res.error);
    if (res.doc) { res.doc.title = app.store.doc.title; app.loadDocument(res.doc, 'run score'); }
  };
  const editor = createCodeEditor(host, {
    value: app.store.doc.meta?.script || EXERCISES[0].source,
    onRun: run,
    getDocLines: () => Object.keys(app.store.doc.lines || {}),
    placeholder: '// point, line, plane… Cmd+Enter runs'
  });
  const pick = selectField([['', 'Exercises…'], ...EXERCISES.map(x => [x.id, x.title])], '', id => {
    const x = EXERCISES.find(e => e.id === id);
    if (!x) return;
    editor.value = x.source;
    brief.textContent = x.brief;
    app.store.doc.title = x.title;
    run();
    pick.value = '';
  }, 'Load an exercise score');
  const seedField = numberField({ value: seed, min: 0, max: 1e9, step: 1, def: 1, title: 'Seed for random() and noise()', onChange: (v, { final }) => { seed = v; if (final) run(); } });
  const wrapBtn = h('button', { class: 'wb-icon-btn on', title: 'Wrap lines', html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h13a3 3 0 010 6h-4M15 16l-2 2 2 2M4 18h5"/></svg>', onclick: () => wrapBtn.classList.toggle('on', editor.toggleWrap()) });
  el.append(
    h('div', { class: 'wb-row wb-row-actions' },
      pick,
      h('span', { class: 'wb-muted', title: 'Seed for random() and noise()' }, 'seed'), seedField,
      wrapBtn,
      h('button', { class: 'wb-btn primary', 'data-guide': 'button:run-score', title: 'Run (Cmd+Enter)', html: `${icon('play')}<span>Run</span>`, onclick: run })
    ),
    brief,
    host,
    out,
    section('Vocabulary', false, h('pre', { class: 'wb-ref' }, SCRIPT_REFERENCE))
  );
  app.on('document', (reason) => {
    if (reason === 'run score') return;
    if (app.store.doc.meta?.script && app.store.doc.meta.script !== editor.value) editor.value = app.store.doc.meta.script;
  });
  app.scriptPanel = { run, setSource: v => { editor.value = v; }, get source() { return editor.value; }, editor };
}
