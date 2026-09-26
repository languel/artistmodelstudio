/**
 * Properties: the selected element(s), or the current tool's defaults when nothing is selected.
 * Every field is part of the record: role, stage, brush and its parameters, color,
 * the reason ("why"), and who made it.
 */
import { h, row, numberField, selectField, section, esc } from '../ui.js';
import { colorField } from '../colorPicker.js';
import { BRUSHES, brushesForRole, resolveParams } from '../../process/brushes.js';
import { ROLES, BLENDS } from '../../process/document.js';
import { SCULPTS, sculptParams } from '../../process/sculpt.js';
import { NOTE_STYLES, NOTE_FONTS, noteProps } from '../../process/notes.js';

export function mountProperties(el, app) {
  const render = () => {
    el.innerHTML = '';
    if (app.selectedClip && app.player?.take?.clips.includes(app.selectedClip)) return renderClip(app.selectedClip);
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
      row('Color', colorField(e.color, v => { patchAll({ color: v }, 'color'); if (e.role === 'note') app.setDefaults('note', { color: v }); }, { app })),
      e.role === 'note' ? row('Text', noteText(e, v => patchAll({ text: v }, 'note'))) : null
    ));
    if (e.role === 'note') el.append(noteSection(noteProps(e), patch => {
      const before = JSON.stringify(app.store.doc);
      for (const s of sel) { const t = app.store.doc.elements.find(x => x.id === s.id); if (t?.role === 'note') t.note = { ...(t.note || {}), ...patch }; }
      app.store.commitFrom(before, 'note style');
      // The next note starts from the last one you styled.
      const t = app.store.doc.elements.find(x => x.id === e.id);
      if (t) app.setDefaults('note', { note: { ...(t.note || {}) }, color: t.color });
    }, app));
    else el.append(brushSection(e.role, e.realize, realize => patchAll({ realize }, 'brush'), app.store.doc));
    el.append(lookSection(e, patch => patchAll(patch, 'look')));
    el.append(section('Reason', true,
      whyField(e.why, v => patchAll({ why: v }, 'why')),
      h('div', { class: 'wb-muted wb-small' }, multi ? '' : `By ${esc(e.by?.name || 'unknown')} (${esc(e.by?.kind || '')}) · seed ${e.seed}`)
    ));
  };

  /** The sculpt tool: which one, brush radius and strength, and the tool's own params. */
  const renderSculpt = () => {
    const s = app.sculpt, t = SCULPTS[s.tool];
    const vals = sculptParams(s.tool, s.params[s.tool]);
    el.append(h('div', { class: 'wb-panel-title' }, 'Sculpt', h('span', { class: 'wb-muted' }, ` · ${t.label}`)));
    el.append(section('Brush', true,
      row('Tool', selectField(Object.entries(SCULPTS).map(([id, x]) => [id, x.label]), s.tool, v => app.setSculpt({ tool: v })), t.doc),
      row('Radius', numberField({ value: Math.round(s.radius), min: 4, max: 400, step: 1, def: 40, title: 'Brush radius in screen pixels ([ and ])', onChange: v => app.setSculpt({ radius: v }) })),
      row('Strength', numberField({ value: s.strength, min: 0.02, max: 1, step: 0.01, def: 0.5, title: 'Shift+[ and Shift+]', onChange: v => app.setSculpt({ strength: v }) })),
      ...t.params.map(p => row(p.label, numberField({ value: vals[p.key], min: p.min, max: p.max, step: p.step, def: p.default, title: p.doc, onChange: v => app.setSculpt({ params: { [p.key]: v } }) }), p.doc)),
      h('div', { class: 'wb-row wb-row-actions' }, h('button', { class: 'wb-btn', title: 'Sculpt tools are code: fork one or write your own', onclick: () => app.openCode?.('sculpt', s.tool) }, 'Show code'))
    ));
  };

  const renderDefaults = () => {
    const tool = app.tool;
    if (tool === 'sculpt') return renderSculpt();
    if (!ROLES[tool]) {
      el.append(h('div', { class: 'wb-empty' }, 'Select something, or pick a drawing tool to set its defaults.'));
      return;
    }
    const d = app.defaults(tool);
    el.append(h('div', { class: 'wb-panel-title' }, `New ${tool}`, h('span', { class: 'wb-muted' }, ' · defaults')));
    el.append(section('Element', true,
      row('Color', colorField(d.color, v => app.setDefaults(tool, { color: v }), { app }))
    ));
    if (tool === 'note') el.append(noteSection(noteProps({ note: d.note, color: d.color, points: [] }), patch => app.setDefaults(tool, { note: patch }), app));
    else el.append(brushSection(tool, d.realize, realize => app.setDefaults(tool, { realize }), app.store.doc));
    el.append(lookSection(d, patch => app.setDefaults(tool, patch)));
    el.append(section('Reason', true, whyField(d.why || '', v => app.setDefaults(tool, { why: v }), 'Why the next marks are made (kept on each one)')));
  };

  /** A timeline clip: when it plays, how long, and what it says or does. */
  const renderClip = c => {
    const edited = () => app.timelineEdited?.();
    const set = patch => { Object.assign(c, patch); edited(); };
    const fx = patch => { c.fx = { ...(c.fx || {}), ...patch }; edited(); };
    const d = c.diff || {};
    el.append(h('div', { class: 'wb-panel-title' }, `${c.track} clip`, h('span', { class: 'wb-muted' }, ` · ${(c.start / 1000).toFixed(1)} s`)));
    el.append(section('Timing', true,
      row('Start (s)', numberField({ value: +(c.start / 1000).toFixed(2), min: 0, max: 36000, step: 0.1, def: 0, onChange: v => set({ start: Math.round(v * 1000) }) })),
      row('Length (s)', numberField({ value: +(c.dur / 1000).toFixed(2), min: 0, max: 3600, step: 0.1, def: 1, onChange: v => set({ dur: Math.round(v * 1000) }) })),
      (c.track === 'say' || c.track === 'title') ? row('Fade (ms)', numberField({ value: c.fx?.fade ?? 250, min: 0, max: 3000, step: 50, def: 250, onChange: v => fx({ fade: v }) })) : null,
      c.track === 'draw' ? row('Reveal', selectField([['on', 'Stroke by stroke'], ['off', 'All at once']], c.fx?.drawOn === false ? 'off' : 'on', v => fx({ drawOn: v === 'on' }))) : null));
    if (c.track === 'say' || c.track === 'title') {
      const ta = h('textarea', { class: 'wb-why', rows: 3 }); ta.value = c.text || '';
      ta.addEventListener('change', () => set({ text: ta.value }));
      ta.addEventListener('keydown', e => e.stopPropagation());
      el.append(section(c.track === 'say' ? 'Narration' : 'Title', true, ta,
        c.track === 'title' ? row('Subtitle', (() => { const i = h('input', { class: 'wb-inline', value: c.sub || '' }); i.addEventListener('change', () => set({ sub: i.value })); i.addEventListener('keydown', e => e.stopPropagation()); return i; })()) : null));
    }
    if (c.track === 'draw') el.append(section('Change', true, h('div', { class: 'wb-small' }, `${c.label || 'change'} · by ${c.by || 'user'}`), h('div', { class: 'wb-muted wb-small' }, [d.add?.length && `${d.add.length} added`, d.update?.length && `${d.update.length} changed`, d.remove?.length && `${d.remove.length} removed`].filter(Boolean).join(' · ') || 'document settings')));
    if (c.track === 'camera') el.append(section('View', true,
      row('Zoom', numberField({ value: +(c.z || 1).toFixed(2), min: 0.2, max: 20, step: 0.05, def: 1, onChange: v => set({ z: v }) })),
      row('Center x', numberField({ value: +(c.cx ?? 0.5).toFixed(3), min: -1, max: 2, step: 0.01, def: 0.5, onChange: v => set({ cx: v }) })),
      row('Center y', numberField({ value: +(c.cy ?? 0.5).toFixed(3), min: -1, max: 2, step: 0.01, def: 0.5, onChange: v => set({ cy: v }) }))));
    if (c.track === 'action') el.append(section('Action', true, h('div', { class: 'wb-small' }, c.label || c.name), h('pre', { class: 'wb-ref' }, JSON.stringify(c.args || {}, null, 1).slice(0, 800))));
    if (c.track === 'audio') el.append(section('Audio', true, h('div', { class: 'wb-small' }, c.label || 'audio')));
  };

  app.store.subscribe(render);
  app.on('clip-select', render);
  app.on('selection', () => { if (app.canvas?.selected.size) app.selectedClip = null; render(); });
  app.on('tool', render);
  app.on('sculpt', () => { if (app.tool === 'sculpt' && !app.selectedElements().length) render(); });
  render();
}

/** Opacity and blend mode: every element has them, on top of its brush. */
function lookSection(e, onChange) {
  return section('Look', true,
    row('Opacity', numberField({ value: e.opacity ?? 1, min: 0, max: 1, step: 0.05, def: 1, title: 'The whole element’s opacity (on top of the brush’s own)', onChange: v => onChange({ opacity: v }) })),
    row('Blend', selectField(BLENDS.map(b => [b, b]), e.blend || 'normal', v => onChange({ blend: v }), 'How the element mixes with what is under it')));
}

/** Notes: style, lettering, size, wrap width, background. The text color is the element's color. */
function noteSection(p, onChange, noteApp = null) {
  const bg = colorField(p.bg || '#fbe9a6', v => { bgValue = v; onChange({ bg: v }); }, { title: 'Paper', fallback: '#fbe9a6', app: noteApp });
  let bgValue = p.bg || '#fbe9a6';
  return section('Note', true,
    row('Style', selectField(Object.entries(NOTE_STYLES).map(([k, v]) => [k, v.split(':')[0]]), p.style, v => onChange({ style: v, bg: undefined, font: undefined, size: undefined }), 'Notebook writes on the page; sticky, card and plain are other looks')),
    row('Font', selectField(Object.entries(NOTE_FONTS).map(([k, [label]]) => [k, label]), p.font, v => onChange({ font: v }))),
    row('Size', numberField({ value: Math.round(p.size), min: 6, max: 200, step: 1, def: p.size, title: 'Letter size in artboard units', onChange: v => onChange({ size: v }) })),
    row('Width', numberField({ value: Math.round(p.width), min: 40, max: 2000, step: 5, def: 280, title: 'Wrap width; or drag a side of the note', onChange: v => onChange({ width: v }) })),
    row('Paper', h('div', { class: 'wb-row' }, bg,
      h('label', { class: 'wb-row', title: 'No background: writing straight on the page' }, h('input', { type: 'checkbox', checked: !p.bg, onchange: ev => onChange({ bg: ev.target.checked ? null : bgValue }) }), h('span', {}, 'none')))));
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
