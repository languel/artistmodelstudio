/**
 * Outliner (after underscores): every element by stage and group. Click selects (Shift adds,
 * Cmd toggles), double-click renames, drag reorders or moves into another stage or group.
 * Rows toggle visibility and lock, and delete. Cmd+G groups the selection, Shift+Cmd+G ungroups.
 */
import { h } from '../ui.js';
import { icon } from '../icons.js';

const ROLE_GLYPH = { point: '•', line: '∿', plane: '▰', guide: '┼', gesture: '〰', note: '¶' };

export function labelOf(e, doc) {
  if (e.label) return e.label;
  if (e.role === 'note' && e.text) return e.text.slice(0, 40);
  const same = doc.elements.filter(x => x.role === e.role && x.stage === e.stage);
  return `${e.role} ${same.indexOf(e) + 1}`;
}

export function mountOutliner(root, app) {
  const collapsed = new Set();
  let drag = null;       // ids being dragged
  let anchor = null;     // last clicked id (for shift ranges)
  const list = h('div', { class: 'wb-outliner', role: 'tree', tabIndex: 0 });
  const bar = h('div', { class: 'wb-row wb-row-actions wb-outliner-bar' });
  root.append(bar, list);

  const sel = () => app.canvas.selected;
  const selectIds = (ids, mode) => {
    if (mode === 'toggle') { const s = new Set(sel()); for (const id of ids) s.has(id) ? s.delete(id) : s.add(id); app.canvas.select([...s]); }
    else app.canvas.select(ids, mode === 'add');
  };
  const orderedIds = () => {
    const doc = app.store.doc;
    return doc.stages.flatMap(s => doc.elements.filter(e => e.stage === s.id).map(e => e.id));
  };
  const clickRow = (ev, ids, primary) => {
    if (ev.shiftKey && anchor) {
      const all = orderedIds(), a = all.indexOf(anchor), b = all.indexOf(primary);
      if (a >= 0 && b >= 0) { selectIds(all.slice(Math.min(a, b), Math.max(a, b) + 1), 'add'); return; }
    }
    selectIds(ids, ev.metaKey || ev.ctrlKey ? 'toggle' : ev.shiftKey ? 'add' : 'set');
    anchor = primary;
  };
  const rename = (span, value, commit) => {
    const input = h('input', { class: 'wb-inline wb-outliner-input', value });
    span.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const finish = ok => { if (done) return; done = true; const v = input.value.trim(); if (ok && v && v !== value) commit(v); else render(); };
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', e => e.stopPropagation());
  };
  const toggleBtn = (on, iconOn, iconOff, title, fn, cls = '') => h('button', { class: `wb-icon-btn wb-outliner-toggle${on ? '' : ' off'} ${cls}`, title, html: icon(on ? iconOn : iconOff), onclick: e => { e.stopPropagation(); fn(e); } });
  // The action applies to the row, or to the whole selection if the row is part of it.
  const targetIds = ids => (ids.some(id => sel().has(id)) ? [...new Set([...ids, ...sel()])] : ids);

  const dropZone = (el, onDrop) => {
    el.addEventListener('dragover', e => {
      if (!drag) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const where = e.clientY < r.top + r.height * 0.3 ? 'before' : e.clientY > r.bottom - r.height * 0.3 ? 'after' : 'inside';
      el.dataset.drop = where;
    });
    el.addEventListener('dragleave', () => { delete el.dataset.drop; });
    el.addEventListener('drop', e => { e.preventDefault(); const where = el.dataset.drop; delete el.dataset.drop; if (drag) onDrop(where, drag); drag = null; });
  };
  const draggable = (el, ids) => {
    el.draggable = true;
    el.addEventListener('dragstart', e => { drag = targetIds(ids); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.join(',')); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => { drag = null; el.classList.remove('dragging'); });
  };

  const elementRow = (e, depth) => {
    const doc = app.store.doc;
    const name = h('span', { class: 'wb-outliner-label', title: `${e.why || e.role}${e.by?.name ? ` · ${e.by.name}` : ''}` }, labelOf(e, doc));
    name.addEventListener('dblclick', ev => { ev.stopPropagation(); rename(name, labelOf(e, doc), v => app.store.patchElements([e.id], { label: v }, 'rename')); });
    const row = h('div', { class: `wb-outliner-row${sel().has(e.id) ? ' selected' : ''}${e.hidden ? ' hidden' : ''}`, style: { '--depth': depth }, role: 'treeitem', onclick: ev => clickRow(ev, [e.id], e.id) },
      h('span', { class: 'wb-outliner-glyph', title: e.role }, ROLE_GLYPH[e.role] || '·'),
      name,
      toggleBtn(!e.hidden, 'eye', 'eyeOff', e.hidden ? 'Show' : 'Hide', () => { const ids = targetIds([e.id]); app.store.patchElements(ids, { hidden: !e.hidden }, e.hidden ? 'show' : 'hide'); }),
      toggleBtn(!e.locked, 'unlock', 'lock', e.locked ? 'Unlock' : 'Lock', () => { const ids = targetIds([e.id]); app.store.patchElements(ids, { locked: !e.locked }, e.locked ? 'unlock' : 'lock'); }, e.locked ? 'on' : ''),
      toggleBtn(true, 'trash', 'trash', 'Delete', () => app.store.removeElements(targetIds([e.id])), 'danger'));
    draggable(row, [e.id]);
    dropZone(row, (where, ids) => {
      if (ids.includes(e.id)) return;
      const doc2 = app.store.doc;
      if (where === 'after') {
        const inStage = doc2.elements.filter(x => x.stage === e.stage && !ids.includes(x.id));
        const next = inStage[inStage.indexOf(inStage.find(x => x.id === e.id)) + 1];
        app.store.reorder(ids, next ? { before: next.id, group: e.group || null } : { stage: e.stage, group: e.group || null });
      } else app.store.reorder(ids, { before: e.id, group: e.group || null });
    });
    return row;
  };

  const groupBlock = (gid, items, depth) => {
    const doc = app.store.doc;
    const ids = items.map(e => e.id);
    const open = !collapsed.has(gid);
    const hidden = items.every(e => e.hidden), locked = items.every(e => e.locked);
    const allSel = ids.every(id => sel().has(id));
    const name = h('span', { class: 'wb-outliner-label' }, doc.groups?.[gid]?.name || 'Group');
    name.addEventListener('dblclick', ev => { ev.stopPropagation(); rename(name, doc.groups?.[gid]?.name || 'Group', v => app.store.renameGroup(gid, v)); });
    const row = h('div', { class: `wb-outliner-row wb-outliner-group${allSel ? ' selected' : ''}${hidden ? ' hidden' : ''}`, style: { '--depth': depth }, onclick: ev => clickRow(ev, ids, ids[0]) },
      h('button', { class: 'wb-outliner-caret', title: open ? 'Collapse' : 'Expand', onclick: ev => { ev.stopPropagation(); open ? collapsed.add(gid) : collapsed.delete(gid); render(); } }, open ? '▾' : '▸'),
      name,
      h('span', { class: 'wb-muted wb-outliner-count' }, String(items.length)),
      toggleBtn(!hidden, 'eye', 'eyeOff', hidden ? 'Show group' : 'Hide group', () => app.store.patchElements(ids, { hidden: !hidden }, hidden ? 'show' : 'hide')),
      toggleBtn(!locked, 'unlock', 'lock', locked ? 'Unlock group' : 'Lock group', () => app.store.patchElements(ids, { locked: !locked }, locked ? 'unlock' : 'lock'), locked ? 'on' : ''),
      toggleBtn(true, 'trash', 'trash', 'Delete group', () => app.store.removeElements(ids), 'danger'));
    draggable(row, ids);
    dropZone(row, (where, dragged) => {
      if (dragged.every(id => ids.includes(id))) return;
      if (where === 'inside') app.store.reorder(dragged, { before: ids[0], group: gid });
      else app.store.reorder(dragged, { before: ids[0], group: null });
    });
    return h('div', { class: 'wb-outliner-block' }, row, ...(open ? items.map(e => elementRow(e, depth + 1)) : []));
  };

  const stageBlock = (s, i) => {
    const doc = app.store.doc;
    const items = doc.elements.filter(e => e.stage === s.id);
    const key = `stage:${s.id}`;
    const open = !collapsed.has(key);
    const active = app.activeStageId === s.id;
    const name = h('span', { class: 'wb-outliner-label wb-outliner-stage-name' }, `${i + 1}. ${s.name}`);
    name.addEventListener('dblclick', ev => { ev.stopPropagation(); rename(name, s.name, v => app.store.updateStage(s.id, { name: v })); });
    const row = h('div', { class: `wb-outliner-row wb-outliner-stage${active ? ' active' : ''}${s.visible ? '' : ' hidden'}`, title: `${s.kind}: click to make active (new marks go here)`, onclick: () => app.setActiveStage(s.id) },
      h('button', { class: 'wb-outliner-caret', title: open ? 'Collapse' : 'Expand', onclick: ev => { ev.stopPropagation(); open ? collapsed.add(key) : collapsed.delete(key); render(); } }, items.length ? (open ? '▾' : '▸') : ''),
      name,
      h('span', { class: 'wb-muted wb-outliner-count' }, String(items.length)),
      toggleBtn(s.visible, 'eye', 'eyeOff', s.visible ? 'Hide stage' : 'Show stage', () => app.store.updateStage(s.id, { visible: !s.visible })),
      toggleBtn(!s.locked, 'unlock', 'lock', s.locked ? 'Unlock stage' : 'Lock stage', () => app.store.updateStage(s.id, { locked: !s.locked }), s.locked ? 'on' : ''),
      h('button', { class: 'wb-icon-btn wb-outliner-toggle', title: 'Select everything in this stage', html: icon('select'), onclick: ev => { ev.stopPropagation(); app.canvas.select(items.filter(e => app.canvas.editable(e)).map(e => e.id)); } }));
    dropZone(row, (where, ids) => app.store.reorder(ids, { stage: s.id, group: null }));
    const children = [];
    if (open) {
      const seen = new Set();
      for (const e of items) {
        if (e.group) { if (seen.has(e.group)) continue; seen.add(e.group); children.push(groupBlock(e.group, items.filter(x => x.group === e.group), 1)); }
        else children.push(elementRow(e, 1));
      }
    }
    return h('div', { class: 'wb-outliner-block' }, row, ...children);
  };

  const render = () => {
    const doc = app.store.doc;
    const n = sel().size;
    const grouped = [...sel()].some(id => doc.elements.find(e => e.id === id)?.group);
    bar.replaceChildren(
      h('button', { class: 'wb-btn', disabled: n < 2, title: 'Group the selection (Cmd+G)', onclick: () => app.groupSelection() }, 'Group'),
      h('button', { class: 'wb-btn', disabled: !grouped, title: 'Ungroup (Shift+Cmd+G)', onclick: () => app.ungroupSelection() }, 'Ungroup'),
      h('span', { style: { flex: 1 } }),
      h('span', { class: 'wb-muted wb-small' }, n ? `${n} selected` : `${doc.elements.length}`));
    list.replaceChildren(...doc.stages.map(stageBlock));
  };
  // Selecting on the canvas reveals the row.
  const reveal = () => { render(); list.querySelector('.wb-outliner-row.selected')?.scrollIntoView({ block: 'nearest' }); };
  app.store.subscribe(render);
  app.on('selection', reveal);
  app.on('stage', render);
  render();
}
