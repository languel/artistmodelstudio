/**
 * Properties: the selected element(s), or the current tool's defaults when nothing is selected.
 * Every field is part of the record: role, stage, brush and its parameters, colour,
 * the reason ("why"), and who made it.
 */
import { h, row, numberField, selectField, section, esc } from '../ui.js';
import { BRUSHES, brushesForRole, resolveParams } from '../../process/brushes.js';
import { ROLES, BLENDS } from '../../process/document.js';
import { NOTE_STYLES, NOTE_FONTS, noteProps } from '../../process/notes.js';

export function mountProperties(el, app) {
  const render = () => {
    el.innerHTML = '';
    const sel = app.selectedElements();
    if (!sel.length) return renderDefaults();
    const e = sel[0];
    const multi = sel.length > 1;
    const patchAll = (patch, label) => {
      const before = JSON.stringify(app.store.doc);
      for (const s of sel) {
        const target = app.store.doc.elements.find(x => x.id === s.id);
        if (!target) continue;
        if (patch.realize) target.realize = { ...target.realize, ...patch.realize, params: { ...target.realize.params, ...(patch.realize.params || {}) } };
        for (const [k, v] of Object.entries(patch)) if (k !== 'realize') target[k] = v;
      }
      app.store.commitFrom(before, label);
    };
    el.append(h('div', { class: 'wb-panel-title' }, multi ? `${sel.length} elements` : `${e.role}`, h('span', { class: 'wb-muted' }, multi ? '' : ` · ${e.points.length} pts${e.points.length > 1 ? ` · ${Math.round(e.points[e.points.length - 1][2])} ms` : ''}`)));

    el.append(section('Element', true,
      row('Role', selectField(Object.keys(ROLES).map(r => [r, r]), e.role, v => {
        const brush = BRUSHES[e.realize.brush]?.roles.includes(v) ? e.realize.brush : brushesForRole(v, app.store.doc)[0]?.id || 'ink';
        patchAll({ role: v, realize: { brush, params: {} }, closed: v === 'plane' ? true : e.closed }, 'role');
      }), ROLES[e.role]),
      row('Stage', selectField(app.store.doc.stages.map(s => [s.id, s.name]), e.stage, v => patchAll({ stage: v }, 'stage'))),
      row('Colour', h('input', { type: 'color', class: 'wb-color', value: e.color || '#1d1b19', onchange: ev => patchAll({ color: ev.target.value }, 'colour') })),
      e.role === 'note' ? row('Text', noteText(e, v => patchAll({ text: v }, 'note'))) : null
    ));
    if (e.role === 'note') el.append(noteSection(noteProps(e), patch => {
      const before = JSON.stringify(app.store.doc);
      for (const s of sel) { const t = app.store.doc.elements.find(x => x.id === s.id); if (t?.role === 'note') t.note = { ...(t.note || {}), ...patch }; }
      app.store.commitFrom(before, 'note style');
    }));
    else el.append(brushSection(e.role, e.realize, realize => patchAll({ realize }, 'brush'), app.store.doc));
    el.append(lookSection(e, patch => patchAll(patch, 'look')));
    el.append(section('Reason', true,
      whyField(e.why, v => patchAll({ why: v }, 'why')),
      h('div', { class: 'wb-muted wb-small' }, multi ? '' : `By ${esc(e.by?.name || 'unknown')} (${esc(e.by?.kind || '')}) · seed ${e.seed}`)
    ));
  };

  const renderDefaults = () => {
    const tool = app.tool;
    if (!ROLES[tool]) {
      el.append(h('div', { class: 'wb-empty' }, 'Select something, or pick a drawing tool to set its defaults.'));
      return;
    }
    const d = app.defaults(tool);
    el.append(h('div', { class: 'wb-panel-title' }, `New ${tool}`, h('span', { class: 'wb-muted' }, ' · defaults')));
    el.append(section('Element', true,
      row('Colour', h('input', { type: 'color', class: 'wb-color', value: d.color || '#1d1b19', onchange: ev => app.setDefaults(tool, { color: ev.target.value }) }))
    ));
    if (tool === 'note') el.append(noteSection(noteProps({ note: d.note, color: d.color, points: [] }), patch => app.setDefaults(tool, { note: patch })));
    else el.append(brushSection(tool, d.realize, realize => app.setDefaults(tool, { realize }), app.store.doc));
    el.append(lookSection(d, patch => app.setDefaults(tool, patch)));
    el.append(section('Reason', true, whyField(d.why || '', v => app.setDefaults(tool, { why: v }), 'Why the next marks are made (kept on each one)')));
  };

  app.store.subscribe(render);
  app.on('selection', render);
  app.on('tool', render);
  render();
}

/** Opacity and blend mode: every element has them, on top of its brush. */
function lookSection(e, onChange) {
  return section('Look', true,
    row('Opacity', numberField({ value: e.opacity ?? 1, min: 0, max: 1, step: 0.05, def: 1, title: 'The whole element’s opacity (on top of the brush’s own)', onChange: v => onChange({ opacity: v }) })),
    row('Blend', selectField(BLENDS.map(b => [b, b]), e.blend || 'normal', v => onChange({ blend: v }), 'How the element mixes with what is under it')));
}

/** Notes: style, lettering, size, wrap width, background. The text colour is the element's colour. */
function noteSection(p, onChange) {
  const bg = h('input', { type: 'color', class: 'wb-color', value: p.bg || '#fbe9a6', title: 'Background', onchange: ev => onChange({ bg: ev.target.value }) });
  return section('Note', true,
    row('Style', selectField(Object.entries(NOTE_STYLES).map(([k, v]) => [k, v.split(':')[0]]), p.style, v => onChange({ style: v, bg: undefined, font: undefined, size: undefined }), 'Notebook writes on the page; sticky, card and plain are other looks')),
    row('Font', selectField(Object.entries(NOTE_FONTS).map(([k, [label]]) => [k, label]), p.font, v => onChange({ font: v }))),
    row('Size', numberField({ value: Math.round(p.size), min: 6, max: 200, step: 1, def: p.size, title: 'Letter size in artboard units', onChange: v => onChange({ size: v }) })),
    row('Width', numberField({ value: Math.round(p.width), min: 40, max: 2000, step: 5, def: 280, title: 'Wrap width; or drag a side of the note', onChange: v => onChange({ width: v }) })),
    row('Paper', h('div', { class: 'wb-row' }, bg,
      h('label', { class: 'wb-row', title: 'No background: writing straight on the page' }, h('input', { type: 'checkbox', checked: !p.bg, onchange: ev => onChange({ bg: ev.target.checked ? null : bg.value }) }), h('span', {}, 'none')))));
}

function brushSection(role, realize, onChange, doc) {
  const brushes = brushesForRole(role, doc);
  const brushId = realize?.brush || brushes[0]?.id;
  const b = BRUSHES[brushId];
  const params = resolveParams(brushId, realize?.params);
  const box = section('Brush', true,
    row('Brush', selectField(brushes.map(x => [x.id, x.label]), brushId, v => onChange({ brush: v, params: {} })), b?.doc)
  );
  for (const s of b?.params || []) {
    box.append(row(s.label, numberField({
      value: params[s.key], min: s.min, max: s.max, step: s.step, def: s.default, title: s.doc,
      onChange: (v, { final }) => { if (final) onChange({ brush: brushId, params: { [s.key]: v } }); }
    }), s.doc));
  }
  return box;
}

function whyField(value, onChange, placeholder = 'Why is this here?') {
  const ta = h('textarea', { class: 'wb-why', rows: 3, placeholder });
  ta.value = value || '';
  ta.addEventListener('change', () => onChange(ta.value.trim()));
  ta.addEventListener('keydown', e => e.stopPropagation());
  return ta;
}

function noteText(e, onChange) {
  const ta = h('textarea', { class: 'wb-why', rows: 3 });
  ta.value = e.text || '';
  ta.addEventListener('change', () => onChange(ta.value));
  ta.addEventListener('keydown', ev => ev.stopPropagation());
  return ta;
}
