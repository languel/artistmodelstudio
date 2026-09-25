/**
 * Process: how the picture was made. View mode (picture / process), a stage scrub,
 * a filmstrip of the picture built up stage by stage, the decisions, and the editing record.
 */
import { h, section, download } from '../ui.js';
import { icon } from '../icons.js';
import { renderToCanvas } from '../../process/render.js';
import { processSheet } from '../../process/exports.js';

export function mountProcess(el, app) {
  let timer = null;
  const render = () => {
    const { doc } = app.store;
    el.innerHTML = '';
    const scrub = h('input', { type: 'range', class: 'wb-range', min: 0, max: doc.stages.length, step: 1, value: Number.isFinite(app.view.upTo) ? app.view.upTo + 1 : doc.stages.length });
    const label = h('span', { class: 'wb-muted' }, Number.isFinite(app.view.upTo) ? `up to ${doc.stages[app.view.upTo]?.name || ''}` : 'all stages');
    scrub.addEventListener('input', () => {
      const v = Number(scrub.value);
      app.setUpTo(v >= doc.stages.length ? Infinity : v - 1);
      label.textContent = v >= doc.stages.length ? 'all stages' : v === 0 ? 'blank' : `up to ${doc.stages[v - 1].name}`;
    });
    el.append(h('div', { class: 'wb-row wb-row-actions' },
      h('div', { class: 'wb-seg' },
        h('button', { class: app.view.mode === 'picture' ? 'on' : '', onclick: () => app.setViewMode('picture'), title: 'The finished picture (construction and notes hidden)' }, 'Picture'),
        h('button', { class: app.view.mode === 'process' ? 'on' : '', onclick: () => app.setViewMode('process'), title: 'Picture plus guides, gestures and notes' }, 'Process')
      ),
      h('button', { class: 'wb-btn', html: `${icon('play')}<span>Replay</span>`, title: 'Build the picture stage by stage', onclick: () => {
        clearInterval(timer);
        let i = -1;
        timer = setInterval(() => { i++; if (i >= doc.stages.length) { clearInterval(timer); app.setUpTo(Infinity); render(); return; } app.setUpTo(i); }, 700);
      } }),
      h('button', { class: 'wb-btn', html: `${icon('picture')}<span>Sheet</span>`, title: 'Download a process sheet (PNG): each stage and the decisions', onclick: () => {
        processSheet(doc).toBlob(b => download(b, `${slug(doc.title)}-process.png`, 'image/png'));
      } })
    ), h('div', { class: 'wb-row' }, scrub, label));

    // Filmstrip: cumulative render per stage.
    const strip = h('div', { class: 'wb-filmstrip' });
    const k = 120 / Math.max(doc.artboard.width, doc.artboard.height);
    doc.stages.forEach((s, i) => {
      const c = renderToCanvas(doc, { scale: k, mode: 'process', upTo: i });
      const n = doc.elements.filter(e => e.stage === s.id).length;
      const cell = h('button', { class: `wb-frame${app.view.upTo === i ? ' on' : ''}`, title: `${s.name} (${s.kind}) · ${n} elements${s.why ? ` · ${s.why}` : ''}`, onclick: () => { app.setUpTo(app.view.upTo === i ? Infinity : i); render(); } },
        c, h('span', {}, `${i + 1}. ${s.name}`));
      strip.append(cell);
    });
    el.append(strip);

    if (doc.decisions.length) {
      el.append(section(`Decisions (${doc.decisions.length})`, true, ...doc.decisions.map(d => h('div', { class: 'wb-decision' },
        h('div', {}, d.question),
        h('div', { class: 'wb-options' }, ...(d.options || []).map(o => h('span', { class: o === d.chosen ? 'chosen' : '' }, o))),
        d.why ? h('div', { class: 'wb-muted' }, d.why) : null,
        h('div', { class: 'wb-muted wb-small' }, `${d.by?.name || ''} · ${doc.stages.find(s => s.id === d.stage)?.name || ''}`)
      ))));
    }
    const reasons = app.store.ordered().filter(e => e.why && e.role !== 'note');
    if (reasons.length) {
      el.append(section(`Reasons (${reasons.length})`, false, ...reasons.map(e => h('button', { class: 'wb-reason', onclick: () => app.selectIds([e.id]) },
        h('span', { class: 'wb-muted' }, `${doc.stages.find(s => s.id === e.stage)?.name || ''} · ${e.role}`), ' ', e.why))));
    }
    const log = app.store.log.slice(-40).reverse();
    if (log.length) el.append(section('Editing record', false, ...log.map(l => h('div', { class: 'wb-small' }, `${new Date(l.t).toLocaleTimeString()} · ${l.label} · ${l.by}`))));
  };
  let pending = 0;
  const later = () => { clearTimeout(pending); pending = setTimeout(render, 120); };
  app.store.subscribe(later);
  app.on('view', render);
  render();
}

const slug = t => String(t || 'process').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'process';
