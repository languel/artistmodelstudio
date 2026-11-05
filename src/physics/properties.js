/**
 * Properties → Physics, for a mark on a board with physics on: what it is (falling, ground, kinematic, a sensor,
 * not physical), its shape and material; for a hinge, its motor and limits; for a spring, how stiff it is.
 * Everything is kept on the mark, under play.phys / play.hinge / play.weld / play.spring (one undo step each).
 */
import { h, row, numberField, selectField, section } from '../workbench/ui.js';
import { editPlay } from '../workbench/panels/playSection.js';
import { boardById, MAIN } from '../process/boards.js';
import { physicsOf, roleOf, jointKind, canBePhysical, MATERIAL, SHAPES } from './model.js';

const TYPE_LABELS = [['', 'Not physical'], ['auto', 'Physical, automatic (closed falls, open is ground)'], ['dynamic', 'Falls (dynamic)'], ['static', 'Ground (static)'], ['kinematic', 'Moves as told (kinematic)'], ['sensor', 'Sensor (felt, not solid)']];
const SHAPE_LABELS = { auto: 'Follow the outline', circle: 'Circle', box: 'Box', hull: 'Convex', chain: 'Outline (hollow)' };

export function physicsSection(app, e) {
  const board = boardById(app.store.doc, e.board || MAIN);
  if (!physicsOf(board)) return null;
  const kind = jointKind(e);
  const num = (label, value, onSet, opts = {}) => row(label, numberField({ value, step: opts.step ?? 0.05, min: opts.min ?? 0, max: opts.max ?? 1e6, def: opts.def ?? value, title: opts.title || '', onChange: (v, meta) => { if (!meta || meta.final) onSet(v); } }));

  if (kind === 'hinge') {
    const j = e.play.hinge === true ? {} : e.play.hinge || {}, m = j.motor;
    const set = (fn, label) => editPlay(app, e.id, play => { const x = play.hinge === true ? {} : { ...(play.hinge || {}) }; fn(x); play.hinge = Object.keys(x).length ? x : true; }, label);
    return section('Physics: hinge', true,
      h('div', { class: 'wb-muted wb-small' }, 'It pins what is under it to the world, or joins the two things under it.'),
      row('Motor', h('input', { type: 'checkbox', checked: Boolean(m && m.on !== false), title: 'It turns what it holds', onchange: ev => set(x => { x.motor = ev.target.checked ? { speed: m?.speed ?? 120, torque: m?.torque ?? 1000 } : undefined; if (!x.motor) delete x.motor; }, 'hinge motor') })),
      m ? num('Speed (°/s)', m.speed ?? 120, v => set(x => { x.motor = { ...(x.motor || {}), speed: v }; }, 'motor speed'), { min: -3600, max: 3600, step: 10, title: 'Degrees a second; negative turns the other way' }) : null,
      m ? num('Torque', m.torque ?? 1000, v => set(x => { x.motor = { ...(x.motor || {}), torque: v }; }, 'motor torque'), { min: 0, max: 100000, step: 50, title: 'How strongly it holds that speed' }) : null,
      row('Limits', h('input', { type: 'checkbox', checked: Array.isArray(j.limits), title: 'It turns only between two angles', onchange: ev => set(x => { if (ev.target.checked) x.limits = [-45, 45]; else delete x.limits; }, 'hinge limits') })),
      Array.isArray(j.limits) ? num('From (°)', j.limits[0], v => set(x => { x.limits = [v, x.limits?.[1] ?? 45]; }, 'hinge limits'), { min: -360, max: 360, step: 5 }) : null,
      Array.isArray(j.limits) ? num('To (°)', j.limits[1], v => set(x => { x.limits = [x.limits?.[0] ?? -45, v]; }, 'hinge limits'), { min: -360, max: 360, step: 5 }) : null);
  }
  if (kind === 'spring') {
    const j = e.play.spring === true ? {} : e.play.spring || {};
    const set = (k, v) => editPlay(app, e.id, play => { play.spring = { ...(play.spring === true ? {} : play.spring || {}), [k]: v }; }, `spring ${k}`);
    return section('Physics: spring', true,
      h('div', { class: 'wb-muted wb-small' }, 'It pulls together what is under its two ends (or holds one to the world).'),
      num('Stiffness', j.stiffness ?? 40, v => set('stiffness', v), { step: 5, title: 'How hard it pulls back' }),
      num('Damping', j.damping ?? 1.5, v => set('damping', v), { step: 0.1, title: 'How quickly it stops bouncing' }),
      num('Length (px)', j.rest ?? Math.round(Math.hypot(e.points.at(-1)[0] - e.points[0][0], e.points.at(-1)[1] - e.points[0][1])), v => set('rest', v), { step: 5, title: 'Its length at rest (as drawn, unless set)' }));
  }
  if (kind === 'weld') return section('Physics: weld', true, h('div', { class: 'wb-muted wb-small' }, 'It glues the two things under it: they move as one.'));

  if (!canBePhysical(e)) return null;
  const ph = e.play?.phys || {}, role = roleOf(e);
  const setPh = (k, v, label = `physics ${k}`) => editPlay(app, e.id, play => {
    const x = { ...(play.phys || {}) };
    if (v === '' || v === undefined) delete x[k]; else x[k] = v;
    if (Object.keys(x).length) play.phys = x; else delete play.phys;
  }, label);
  return section('Physics', true,
    row('Is', selectField(TYPE_LABELS, ph.type === 'none' ? '' : ph.type || '', v => setPh('type', v), role ? `${role.type === 'dynamic' ? 'It falls' : role.type === 'static' ? 'It is ground' : role.type}` : 'Not in the physics world until you make it physical')),
    role ? row('Shape', selectField(SHAPES.map(s => [s, SHAPE_LABELS[s]]), ph.shape || 'auto', v => setPh('shape', v === 'auto' ? '' : v), 'The shape it collides with: it follows the outline (round marks are circles, closed ones convex, open ones their stroke), or one of these')) : null,
    role && role.type !== 'static' ? num('Density', ph.density ?? MATERIAL.density, v => setPh('density', v), { step: 0.1, title: 'How heavy for its size' }) : null,
    role ? num('Friction', ph.friction ?? MATERIAL.friction, v => setPh('friction', v), { max: 5, title: '0: ice; 1: rubber' }) : null,
    role ? num('Bounce', ph.bounce ?? MATERIAL.bounce, v => setPh('bounce', v), { max: 1.5, title: '0: it stops; 1: it bounces back as high' }) : null,
    role && role.type === 'dynamic' ? num('Damping', ph.damping ?? MATERIAL.damping, v => setPh('damping', v), { max: 10, title: 'Air: how quickly it slows' }) : null,
    role && role.type === 'dynamic' ? num('Spin (°/s)', ph.spin ?? 0, v => setPh('spin', v || ''), { min: -3600, max: 3600, step: 15, title: 'It starts turning' }) : null);
}

/**
 * Several marks selected: what they share, for all of them at once. A field the marks agree on shows its value; one
 * they differ on shows "Mixed" until set, then every one takes it (one undo step). Material applies to the physical ones.
 */
export function physicsMultiSection(app, sel) {
  const els = sel.map(s => app.store.doc.elements.find(x => x.id === s.id)).filter(e => e && canBePhysical(e) && physicsOf(boardById(app.store.doc, e.board || MAIN)));
  if (!els.length) return null;
  const phys = els.filter(e => roleOf(e));
  const val = (list, get) => { const v = new Set(list.map(get)); return v.size === 1 ? { value: [...v][0], mixed: false } : { value: undefined, mixed: true }; };
  const setAll = (list, k, v, label) => app.store.change(label, d => {
    const ids = new Set(list.map(e => e.id));
    for (const e of d.elements) {
      if (!ids.has(e.id)) continue;
      const play = { ...(e.play || {}) }, ph = { ...(play.phys || {}) };
      if (v === '' || v === undefined || v === null) delete ph[k]; else ph[k] = v;
      if (Object.keys(ph).length) play.phys = ph; else delete play.phys;
      if (Object.keys(play).length) e.play = play; else delete e.play;
    }
  });
  const type = val(els, e => (e.play?.phys?.type === 'none' ? '' : e.play?.phys?.type) || '');
  const select = (label, options, v, k, list, title) => row(label, selectField(v.mixed ? [['__mixed', 'Mixed'], ...options] : options, v.mixed ? '__mixed' : v.value, x => { if (x !== '__mixed') setAll(list, k, x === 'auto-shape' ? '' : x, `physics ${k}`); }, title));
  const number = (label, k, def, opts = {}) => {
    const v = val(phys, e => e.play?.phys?.[k] ?? def);
    const f = numberField({ value: v.mixed ? def : v.value, step: opts.step ?? 0.05, min: opts.min ?? 0, max: opts.max ?? 1e6, def, title: opts.title || '', onChange: (x, meta) => { if (!meta || meta.final) setAll(phys, k, x === def && k !== 'spin' ? x : x || '', `physics ${k}`); } });
    if (v.mixed) { f.value = ''; f.placeholder = 'Mixed'; }
    return row(label, f);
  };
  const showMaterial = phys.length > 0, anyMoves = phys.some(e => roleOf(e).type !== 'static'), anyDynamic = phys.some(e => roleOf(e).type === 'dynamic');
  const shape = val(phys, e => e.play?.phys?.shape || 'auto');
  return section(`Physics${els.length > 1 ? ` · ${els.length} marks` : ''}`, true,
    select('Is', TYPE_LABELS, type, 'type', els, 'Nothing is physical until you make it so'),
    showMaterial ? select('Shape', SHAPES.map(x => [x === 'auto' ? 'auto-shape' : x, SHAPE_LABELS[x]]), { mixed: shape.mixed, value: shape.value === 'auto' ? 'auto-shape' : shape.value }, 'shape', phys, 'The shape they collide with') : null,
    showMaterial && anyMoves ? number('Density', 'density', MATERIAL.density, { step: 0.1, title: 'How heavy for its size' }) : null,
    showMaterial ? number('Friction', 'friction', MATERIAL.friction, { max: 5, title: '0: ice; 1: rubber' }) : null,
    showMaterial ? number('Bounce', 'bounce', MATERIAL.bounce, { max: 1.5, title: '0: it stops; 1: it bounces back as high' }) : null,
    showMaterial && anyDynamic ? number('Damping', 'damping', MATERIAL.damping, { max: 10, title: 'Air: how quickly it slows' }) : null,
    showMaterial && anyDynamic ? number('Spin (°/s)', 'spin', 0, { min: -3600, max: 3600, step: 15, title: 'They start turning' }) : null);
}
