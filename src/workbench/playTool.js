/**
 * The Play tool: authoring a score by pointing and placing, after Sketchpad. What a gesture makes is read
 * from what you touch and the kind chosen (right-click the tool):
 *
 *   Press a mark and drag to another: a relation by what the two are (a point and a line: it travels it;
 *     two triggers: one sends to the other; a trigger and a traveler: it starts it). The band says which.
 *   Drag a traveler's marker: it slides along its path (its offset), and what it passes sounds.
 *   Shift+drag a mark: it moves, and snaps onto a path that is near. Click a trigger: you hear it.
 *   On empty paper, by kind: path (draw a line), traveler (click: a point; click near a path: on it; drag: a
 *     bar across it), trigger (click: a point; drag: an area), gate (click on a path: a gate across it; drag:
 *     a line), body (click: a point that moves by itself; drag: throw it).
 *
 * Everything it makes is a mark with `play` (Properties → Play, Code → Selection): the tool only writes it.
 */
import * as R from '../score/relations.js';
import { outlineOf, centerOf, nearestOn, nearestPath, pointAt } from '../score/geometry.js';
import { emitFor, DEFAULTS } from '../score/presets.js';
import { boardAt } from '../process/boards.js';

export const PLAY_KINDS = [
  ['link', 'Point at things', 'Press a mark and drag to another: what they are decides the relation. Drag a traveler along its path. Shift+drag moves a mark, snapping to paths.'],
  ['path', 'Path', 'Draw a line that can be travelled. Start on a point and it travels the new line.'],
  ['traveler', 'Traveler', 'Click: a point that travels (click near a path to put it on that path). Drag: a bar across a path.'],
  ['trigger', 'Trigger', 'Click: a point that sounds when touched. Drag: an area.'],
  ['gate', 'Gate', 'Click on a path: a gate across it. Drag: a line that sounds when crossed.'],
  ['body', 'Body', 'Click: a point that moves by itself. Drag: throw it.']
];
const SNAP = 14;   // screen px

export class PlayTool {
  constructor(app, canvas) {
    this.app = app; this.cv = canvas;
    this.drag = null;    // { kind: 'band' | 'bar' | 'throw', x0, y0, x1, y1, from, target, rel }: what the overlay draws
    this.snap = null;    // { x, y }: where a moved mark would snap to
  }

  get kind() { return this.app.playKind || 'link'; }
  get doc() { return this.app.store.doc; }
  radius() { return SNAP / this.cv.cam.z; }
  paths() { return this.doc.elements.filter(e => e.points?.length >= 2 && ['line', 'gesture', 'guide'].includes(e.role) && !e.hidden); }

  /** Whether marks can be made here (the stage and board are not locked). */
  creatable(wx, wy) {
    const stage = this.cv.getStage();
    if (!stage || stage.locked) { this.cv.flash('This stage is locked'); return false; }
    const under = boardAt(this.doc, wx, wy);
    if (under && (under.locked || under.hidden)) { this.cv.flash(under.locked ? 'This board is locked' : 'This board is hidden'); return false; }
    return true;
  }

  hover(e) {
    const [wx, wy] = this.cv.toWorld(...this.cv.local(e));
    const hit = this.drag ? null : this.cv.hitTest(wx, wy);
    if ((hit?.id || null) !== this.cv.pickHover) { this.cv.pickHover = hit?.id || null; this.cv.invalidate(); }
  }

  /** The pointer is down at (wx, wy). Everything is handled here. */
  down(e, wx, wy) {
    this.cv.playNew = null;
    this.cv.pickHover = null;
    let hit = this.cv.hitTest(wx, wy);
    // A click on a plain line, when making a traveler, gate, trigger or body, is a click on the paper beside it: what you make is placed there.
    if (hit && !['link', 'path'].includes(this.kind) && ['line', 'gesture', 'guide'].includes(hit.role) && !hit.play?.trigger) hit = null;
    if (hit) return this.pressMark(e, hit, wx, wy);
    if (this.kind === 'link') { this.cv.select([]); return; }
    if (!this.creatable(wx, wy)) return;
    this.pressEmpty(e, wx, wy);
  }

  // ---- on a mark ------------------------------------------------------------------------------
  pressMark(e, hit, wx, wy) {
    const cv = this.cv, app = this.app;
    const x0 = e.clientX, y0 = e.clientY;
    let mode = null;
    const tr = hit.play?.travel;
    const line = tr && this.doc.elements.find(x => (x.id === tr.on || x.label === tr.on) && x.points?.length >= 2);
    const before = JSON.stringify(this.doc);
    const startSel = cv.selected.has(hit.id) ? [...cv.selected] : [hit.id];
    const orig = new Map(this.doc.elements.filter(x => startSel.includes(x.id)).map(x => [x.id, x.points.map(q => [...q])]));
    let last = line ? nearestOn(outlineOf(line), hit.points[0][0], hit.points[0][1]).u : 0;

    const mv = ev => {
      const [mx, my] = cv.toWorld(...cv.local(ev));
      if (!mode) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        if (this.kind === 'path' && hit.role === 'point' && !hit.play?.trigger && !ev.shiftKey) { finish(); this.startLineFrom(e, hit); return; }
        mode = ev.shiftKey ? 'move' : line && !ev.altKey ? 'slide' : 'link';
        if (!cv.selected.has(hit.id)) cv.select([hit.id]);
      }
      if (mode === 'slide') {
        const u = nearestOn(outlineOf(line), mx, my).u;
        R.offset(this.doc, hit.id, u);
        app.score?.scrub(hit.id, last, u);
        last = u;
        cv.invalidate();
      } else if (mode === 'move') {
        let dx = mx - wx, dy = my - wy;
        this.snap = null;
        if (!ev.altKey && startSel.length === 1) {
          const c0 = centerOf({ ...hit, points: orig.get(hit.id) });
          const near = nearestPath(this.paths().filter(p => p.id !== hit.id), c0[0] + dx, c0[1] + dy, this.radius());
          if (near) { dx = near.hit.x - c0[0]; dy = near.hit.y - c0[1]; this.snap = { x: near.hit.x, y: near.hit.y }; }
        }
        for (const el of this.doc.elements) { const o = orig.get(el.id); if (o) el.points = o.map(q => [q[0] + dx, q[1] + dy, ...q.slice(2)]); }
        cv.invalidate();
      } else {
        const target = cv.hitTest(mx, my, x => x.id !== hit.id);
        const c = centerOf(hit);
        this.drag = { kind: 'band', x0: c[0], y0: c[1], x1: mx, y1: my, from: hit.id, target: target?.id || null, rel: target ? R.infer(hit, target) : null };
        cv.pickHover = target?.id || null;
        cv.invalidate();
      }
    };
    const finish = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.drag = null; this.snap = null; app.score?.endScrub(); cv.invalidate(); };
    const up = ev => {
      const d = this.drag;
      finish();
      if (!mode) {   // a click: select; a trigger sounds
        if (ev.shiftKey) cv.select(cv.selected.has(hit.id) ? [...cv.selected].filter(i => i !== hit.id) : [...cv.selected, hit.id]); else cv.select([hit.id]);
        if (hit.play?.trigger) app.score?.audition(hit.id);
        return;
      }
      if (mode === 'link') {
        if (d?.rel) {
          this.app.store.change('link', draft => R.apply(draft, d.rel));
          cv.select([hit.id]);
          cv.flash(d.rel.label);
        }
      } else this.app.store.commitFrom(before, mode === 'slide' ? 'traveler offset' : 'move');
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /** A new line that starts on a point: the point travels it. */
  startLineFrom(e, point) {
    if (!this.creatable(point.points[0][0], point.points[0][1])) return;
    this.cv.playNew = { play: { path: true }, after: { travel: point.id } };
    this.cv.startStroke(e, 'line', point.points[0][0], point.points[0][1]);
  }

  // ---- on empty paper ---------------------------------------------------------------------------
  pressEmpty(e, wx, wy) {
    const cv = this.cv, kind = this.kind;
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const clean = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    const mv = ev => {
      if (moved || Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true; clean();
      this.dragNew(e, kind, wx, wy);
    };
    const up = ev => { clean(); if (!moved) this.click(kind, wx, wy, ev); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /** A drag on paper: draw (path, trigger area, gate line) or stretch (a bar, a throw). */
  dragNew(e, kind, wx, wy) {
    const cv = this.cv;
    if (kind === 'path') { cv.playNew = { play: { path: true } }; return cv.startStroke(e, 'line', wx, wy); }
    if (kind === 'trigger') { cv.playNew = { play: { trigger: { emit: emitFor(DEFAULTS.height) } } }; return cv.startStroke(e, 'plane', wx, wy); }
    if (kind === 'gate') { cv.playNew = { play: { trigger: { emit: emitFor({ ...DEFAULTS.height, dur: 0.25 }) } } }; return cv.startStroke(e, 'line', wx, wy); }
    const bar = kind === 'traveler';
    const mv = ev => {
      const [x, y] = cv.toWorld(...cv.local(ev));
      this.drag = { kind: bar ? 'bar' : 'throw', x0: wx, y0: wy, x1: x, y1: y };
      cv.invalidate();
    };
    const up = ev => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      const [x, y] = cv.toWorld(...cv.local(ev));
      this.drag = null; cv.invalidate();
      if (bar) this.makeBar(wx, wy, x, y); else this.makeBody(wx, wy, (x - wx) * 2, (y - wy) * 2);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  click(kind, wx, wy, ev) {
    const cv = this.cv, app = this.app;
    if (kind === 'path') { cv.flash('Drag to draw a path'); return; }
    if (kind === 'traveler') return this.makeTraveler(wx, wy, 0);
    if (kind === 'body') return this.makeBody(wx, wy);
    if (kind === 'trigger') {
      const el = cv.commitNew('point', [[wx, wy, 0, 0.5]], this.playExtra('point', { trigger: { emit: emitFor(DEFAULTS.height) } }));
      app.score?.audition(el.id);
      return;
    }
    if (kind === 'gate') {
      const near = nearestPath(this.paths(), wx, wy, this.radius() * 2);
      const at = near ? near.hit : { x: wx, y: wy, tx: 1, ty: 0 };
      const half = 34 / cv.cam.z;
      const n = [-at.ty, at.tx];
      const el = cv.commitNew('line', [[at.x - n[0] * half, at.y - n[1] * half, 0, 0.5], [at.x + n[0] * half, at.y + n[1] * half, 0, 0.5]], { ...this.playExtra('line', { trigger: { emit: emitFor({ ...DEFAULTS.height, dur: 0.25 }) } }), path: 'straight' });
      app.score?.audition(el.id);
    }
  }

  /** The `play` and the brush a new mark gets. */
  playExtra(role, play) { return this.cv.playExtraFor(role, play); }

  /** A point that travels: on the path near the click (it goes to the path's start), else alone, waiting for a path. */
  makeTraveler(wx, wy, width, reach = 1) {
    const near = nearestPath(this.paths(), wx, wy, this.radius() * reach);
    const el = this.cv.commitNew('point', [[wx, wy, 0, 0.5]], this.playExtra('point', { travel: { on: near?.mark.id || '', loop: 'once', ...(width ? { width } : {}) } }));
    if (near) { this.app.store.change('travel', d => R.travel(d, el.id, near.mark.id)); this.cv.select([el.id]); }
    else this.cv.flash('Point it at a path: drag from it to a line');
    return el;
  }

  /** A line segment across the path it touches: a bar that travels. */
  makeBar(x0, y0, x1, y1) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 6 / this.cv.cam.z) return this.makeTraveler(x0, y0, 0);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    // It lies across a path: the path nearest its middle (a little further is fine for a long bar).
    return this.makeTraveler(mx, my, Math.round(len), 1 + Math.min(2, len / 60));
  }

  makeBody(x, y, vx, vy) {
    const body = vx !== undefined && (Math.abs(vx) > 4 || Math.abs(vy) > 4) ? { v: [Math.round(vx), Math.round(vy)] } : { speed: [60, 200] };
    const el = this.cv.commitNew('point', [[x, y, 0, 0.5]], this.playExtra('point', { body }));
    return el;
  }

  /** Pressed and dragged: where the band, bar or throw is, for the overlay. */
  preview() { return this.drag; }
}
