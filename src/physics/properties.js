/**
 * Properties → Physics, for a mark on a board with physics on: what it is (falling, ground, kinematic, a sensor,
 * not physical), its shape and material; for a hinge, its motor and limits; for a spring, how stiff it is.
 * Everything is kept on the mark, under play.phys / play.hinge / play.weld / play.spring (one undo step each).
 */
import { h, row, numberField, selectField, section } from '../workbench/ui.js';
import { editPlay } from '../workbench/panels/playSection.js';
import { boardById, MAIN } from '../process/boards.js';
import { physicsOf, roleOf, jointKind, MATERIAL, SHAPES } from './model.js';

const TYPE_LABELS = [['', 'As drawn'], ['dynamic', 'Falls (dynamic)'], ['static', 'Ground (static)'], ['kinematic', 'Moves as told (kinematic)'], ['sensor', 'Sensor (felt, not solid)'], ['none', 'Not physical']];
const SHAPE_LABELS = { auto: 'As drawn', circle: 'Circle', box: 'Box', hull: 'Convex', chain: 'Outline (hollow)' };

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

  const ph = e.play?.phys || {}, role = roleOf(e);
  const setPh = (k, v, label = `physics ${k}`) => editPlay(app, e.id, play => {
    const x = { ...(play.phys || {}) };
    if (v === '' || v === undefined) delete x[k]; else x[k] = v;
    if (Object.keys(x).length) play.phys = x; else delete play.phys;
  }, label);
  return section('Physics', true,
    row('Is', selectField(TYPE_LABELS, ph.type || '', v => setPh('type', v), `As drawn: ${role ? (role.type === 'dynamic' ? 'it falls' : role.type === 'static' ? 'it is ground' : role.type) : 'not physical'}`)),
    role ? row('Shape', selectField(SHAPES.map(s => [s, SHAPE_LABELS[s]]), ph.shape || 'auto', v => setPh('shape', v === 'auto' ? '' : v), 'The shape it collides with: as drawn (round marks are circles, closed ones convex, open ones an outline), or one of these')) : null,
    role && role.type !== 'static' ? num('Density', ph.density ?? MATERIAL.density, v => setPh('density', v), { step: 0.1, title: 'How heavy for its size' }) : null,
    role ? num('Friction', ph.friction ?? MATERIAL.friction, v => setPh('friction', v), { max: 5, title: '0: ice; 1: rubber' }) : null,
    role ? num('Bounce', ph.bounce ?? MATERIAL.bounce, v => setPh('bounce', v), { max: 1.5, title: '0: it stops; 1: it bounces back as high' }) : null,
    role && role.type === 'dynamic' ? num('Damping', ph.damping ?? MATERIAL.damping, v => setPh('damping', v), { max: 10, title: 'Air: how quickly it slows' }) : null,
    role && role.type === 'dynamic' ? num('Spin (°/s)', ph.spin ?? 0, v => setPh('spin', v || ''), { min: -3600, max: 3600, step: 15, title: 'It starts turning' }) : null);
}
