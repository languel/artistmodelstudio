/** Script: write or load a score, run it, and the process document is recorded on the canvas. */
import { h, selectField, numberField, section } from '../ui.js';
import { icon } from '../icons.js';
import { runScript, SCRIPT_REFERENCE } from '../../process/script.js';
import { EXERCISES } from '../../process/exercises.js';

export function mountScript(el, app) {
  const ta = h('textarea', { class: 'wb-code', spellcheck: 'false', placeholder: '// A score in the point / line / plane vocabulary. Cmd+Enter runs it.' });
  ta.value = app.store.doc.meta?.script || EXERCISES[0].source;
  let seed = app.store.doc.meta?.seed || 1;
  const out = h('div', { class: 'wb-script-out' });
  const brief = h('div', { class: 'wb-brief' });
  const run = () => {
    const res = runScript(ta.value, { seed, by: { kind: 'user', name: 'you (score)' } });
    out.textContent = res.error ? `Error: ${res.error}` : (res.logs.join('\n') || `${res.doc.elements.length} elements in ${res.doc.stages.length} stages · seed ${seed}`);
    out.classList.toggle('error', Boolean(res.error));
    if (res.doc) { res.doc.title = app.store.doc.title; app.loadDocument(res.doc, 'run score'); }
  };
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); }
  });
  const pick = selectField([['', 'Exercises…'], ...EXERCISES.map(x => [x.id, x.title])], '', id => {
    const x = EXERCISES.find(e => e.id === id);
    if (!x) return;
    ta.value = x.source;
    brief.textContent = x.brief;
    app.store.doc.title = x.title;
    run();
    pick.value = '';
  }, 'Load an exercise score');
  const seedField = numberField({ value: seed, min: 0, max: 1e9, step: 1, def: 1, title: 'Seed for random() and noise()', onChange: (v, { final }) => { seed = v; if (final) run(); } });
  el.append(
    h('div', { class: 'wb-row wb-row-actions' },
      pick,
      h('span', { class: 'wb-muted' }, 'seed'), seedField,
      h('button', { class: 'wb-btn primary', 'data-guide': 'button:run-score', title: 'Run (Cmd+Enter)', html: `${icon('play')}<span>Run</span>`, onclick: run })
    ),
    brief,
    ta,
    out,
    section('Vocabulary', false, h('pre', { class: 'wb-ref' }, SCRIPT_REFERENCE))
  );
  app.on('document', (reason) => {
    if (reason === 'run score') return;
    if (app.store.doc.meta?.script && app.store.doc.meta.script !== ta.value) ta.value = app.store.doc.meta.script;
  });
  app.scriptPanel = { run, setSource: v => { ta.value = v; }, get source() { return ta.value; } };
}
