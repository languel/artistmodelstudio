/** Stages: the process as ordered layers. Click to make a stage active (new marks go there). */
import { h, selectField } from '../ui.js';
import { icon } from '../icons.js';
import { STAGE_KINDS } from '../../process/document.js';

export function mountStages(el, app) {
  const render = () => {
    const { doc } = app.store;
    el.innerHTML = '';
    const list = h('div', { class: 'wb-list' });
    doc.stages.forEach((s, i) => {
      const count = doc.elements.filter(e => e.stage === s.id).length;
      const active = app.activeStageId === s.id;
      const name = h('span', { class: 'wb-stage-name', title: 'Double-click to rename' }, `${i + 1}. ${s.name}`);
      name.addEventListener('dblclick', () => {
        const input = h('input', { class: 'wb-inline', value: s.name });
        name.replaceWith(input);
        input.focus(); input.select();
        const done = () => { const v = input.value.trim(); if (v && v !== s.name) app.store.updateStage(s.id, { name: v }); else render(); };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') render(); e.stopPropagation(); });
        input.addEventListener('blur', done);
      });
      const rowEl = h('div', { class: `wb-stage${active ? ' active' : ''}`, 'data-guide': `stage:${s.name}`, onclick: e => { if (e.target.closest('button, select, input')) return; app.setActiveStage(s.id); } },
        h('button', { class: 'wb-icon-btn', title: s.visible ? 'Hide' : 'Show', html: icon(s.visible ? 'eye' : 'eyeOff'), onclick: () => app.store.updateStage(s.id, { visible: !s.visible }) }),
        h('button', { class: 'wb-icon-btn', title: s.locked ? 'Unlock' : 'Lock', html: icon(s.locked ? 'lock' : 'unlock'), onclick: () => app.store.updateStage(s.id, { locked: !s.locked }) }),
        name,
        h('span', { class: 'wb-muted', title: 'Elements in this stage' }, String(count)),
        active ? selectField(STAGE_KINDS.map(k => [k, k]), s.kind, v => app.store.updateStage(s.id, { kind: v }), 'Kind of stage') : h('span', { class: 'wb-kind' }, s.kind),
        h('button', { class: 'wb-icon-btn', title: 'Earlier', html: icon('up'), onclick: () => app.store.moveStage(s.id, -1) }),
        h('button', { class: 'wb-icon-btn', title: 'Later', html: icon('down'), onclick: () => app.store.moveStage(s.id, 1) }),
        h('button', { class: 'wb-icon-btn', title: 'Delete stage (its elements move to the first stage)', html: icon('trash'), onclick: () => { if (doc.stages.length > 1) app.store.removeStage(s.id); } })
      );
      list.append(rowEl);
    });
    const kind = selectField(STAGE_KINDS.map(k => [k, k]), 'marks', () => {}, 'Kind of the new stage');
    el.append(list, h('div', { class: 'wb-row wb-row-actions' },
      kind,
      h('button', { class: 'wb-btn', html: `${icon('plus')}<span>Stage</span>`, onclick: () => {
        const k = kind.value;
        const s = app.store.addStage({ name: k[0].toUpperCase() + k.slice(1), kind: k });
        app.setActiveStage(s.id);
      } })
    ));
  };
  app.store.subscribe(render);
  app.on('stage', render);
  render();
}
