/**
 * Walkthroughs (after underscores): lessons and tours played by the guide. The cursor goes to
 * the real controls, actions run through the same MCP tools an agent uses (so they are logged,
 * recorded and undoable), and some steps wait for you to do something yourself.
 *
 * Step: { say, target?, click?, run?(ctx), until?(app) → bool (wait for the learner), hold? ms }
 */
import { h } from './ui.js';
import { EXERCISES } from '../process/exercises.js';
import * as SENECIO from './studies/senecio.js';
import { applyDiff } from '../process/take.js';
import { normalizeElement } from '../process/document.js';

const call = (name, args) => window.ams.callTool(name, args);

/** A line walking with a changing pace: slow start, a hurried middle, lingering loops at the end. */
function activeWalk() {
  const pts = [];
  let x = 140, y = 520, heading = -20, t = 0;
  for (let i = 0; i < 150; i++) {
    const u = i / 149;
    const pace = u < 0.25 ? 70 : u < 0.6 ? 12 : 40;                  // ms between points: slow, fast, slow
    heading += Math.sin(i / 7) * 9 + (u > 0.75 ? 11 : 0);            // sway, then loop
    const step = u > 0.75 ? 5 : 6;
    x += Math.cos((heading * Math.PI) / 180) * step;
    y += Math.sin((heading * Math.PI) / 180) * step;
    t += pace;
    pts.push([Math.round(x), Math.round(y), t, u < 0.25 ? 0.7 : 0.4]);
  }
  return pts;
}


/** Type code into an editor as the guide watches (instant at pace 0 or in a hidden tab). */
async function typeInto(editor, text, g, { append = false } = {}) {
  const base = append ? editor.value : '';
  if (!g.active || document.hidden) { editor.value = base + text; return; }
  const perFrame = Math.max(4, Math.round(16 / Math.max(0.25, g.pace)));
  for (let i = 0; i <= text.length; i += perFrame) {
    editor.value = base + text.slice(0, i);
    editor.view.dispatch({ selection: { anchor: editor.view.state.doc.length }, scrollIntoView: true });
    await new Promise(r => requestAnimationFrame(r));
  }
  editor.value = base + text;
  editor.view.dispatch({ selection: { anchor: editor.view.state.doc.length }, scrollIntoView: true });
}

export const WALKTHROUGHS = [
  {
    id: 'senecio-study',
    title: 'Study: Senecio',
    summary: 'Study a painting, name its methods, write them as brushes and a score, reproduce it, then draw a new subject in its manner.',
    steps: [
      { say: 'A full cycle on one painting: look at Klee\'s Senecio (1922), name its methods, write them as code, reproduce it, then use the same methods on a subject it never shows.',
        run: async ({ save }) => { await save(); } },
      { say: 'The painting is in Assets, with the other Klee references. Found by searching for it.',
        layout: { open: ['assets'], find: 'senecio' }, target: 'panel:assets', click: false, hold: 1200 },
      { say: 'The reference: Senecio, oil on gauze. It goes under the sheet so every step can be checked against it.',
        layout: { find: '' },
        run: async ({ app }) => { await call('ams_assets', { open: 'klee:klee-1922-senecio', narrate: 'Opening Senecio as the reference.' }); if (app.reference) { app.reference.opacity = 0.55; app.reference.visible = true; app.canvas.invalidate(); } } },
      { say: 'First, looking with the studio\'s eyes: value masses and regions. Mostly middle and light values, all warm; few hard edges.',
        layout: { open: ['decide'], reference: { visible: true, opacity: 0.55 } },
        run: () => call('ams_analyze', { narrate: 'Analyzing the reference: values, regions, edges, directions.' }), hold: 800 },
      { say: 'Its palette, sampled from the painting and named after the nearest pigments.',
        run: () => call('ams_palette', { action: 'from_image', asset: 'klee:klee-1922-senecio', count: 8, name: 'Klee · Senecio (sampled)', narrate: 'Sampling the palette.' }) },
      ...SENECIO.OBSERVATIONS.map((say, i) => ({ say: `Method ${i + 1}. ${say}`, target: i === 0 ? 'panel:decide' : undefined, click: false })),
      { say: 'Methods become code. First a brush for rubbed paint over gauze: an even body, worn patches of light ground or warm underpaint, and the weave of the cloth.',
        run: async ({ app, g }) => { app.showRegions = false; app.docks.open('brushes'); await typeInto(app.brushesPanel.editor, SENECIO.SCUMBLE, g); app.brushesPanel.save(); }, target: 'panel:brushes', click: false },
      { say: 'Then a brush for the incised line: a dark cut with a light lip beside it, slightly unsteady.',
        run: async ({ app, g }) => { await typeInto(app.brushesPanel.editor, SENECIO.INCISED, g); app.brushesPanel.save(); } },
      ...SENECIO.REPRO.map((st, i) => ({
        say: st.say,
        target: 'panel:script', click: false,
        run: async ({ app, g }) => {
          app.docks.open('script');
          const ed = app.scriptPanel.editor;
          await typeInto(ed, st.code, g, { append: i > 0 });
          app.store.doc.title = 'Senecio: a study';
          app.scriptPanel.run();
          if (i === 0 && app.reference) { app.reference.visible = true; app.canvas.invalidate(); }
        }
      })),
      { say: 'Checked against the painting (the reference under the sheet): the construction, the values and the accents hold. What is missing is Klee\'s hand: his planes breathe and overlap, ours stay in their cells.',
        run: ({ app }) => { if (app.reference) { app.reference.visible = true; app.reference.opacity = 0.5; app.canvas.invalidate(); app.renderChrome(); } }, hold: 1500 },
      { say: 'The reproduction goes to Assets, with its brushes and its score.',
        run: async ({ app }) => { if (app.reference) { app.reference.visible = false; app.canvas.invalidate(); app.renderChrome(); } await call('ams_save', { title: 'Senecio: a study', narrate: 'Saving the study.' }); } },
      { say: SENECIO.NOVEL.say,
        target: 'panel:script', click: false,
        run: async ({ app, g }) => {
          await typeInto(app.scriptPanel.editor, SENECIO.NOVEL.code, g);
          app.store.doc.title = SENECIO.NOVEL.prompt;
          app.scriptPanel.run();
        } },
      { say: 'What transferred: the circle and grid, the rubbed warm planes, the incised lines, three small accents. The lamp room even kept a face. Saved to Assets beside the study.',
        run: async () => { await call('ams_save', { title: SENECIO.NOVEL.prompt, narrate: 'Saving the new drawing.' }); } },
      { say: 'Your turn: give the same task to a model in Generate or the Assistant, with Senecio as the reference, and compare its process with this one.', target: 'panel:generate', click: false }
    ]
  },
  {
    id: 'line-walk',
    title: 'Taking a line for a walk',
    summary: 'After Klee and William Ngan: the active line, whose line it is, and making your own line before you draw it.',
    steps: [
      { say: 'Klee: “An active line on a walk, moving freely, without goal.” This lesson takes that walk, then asks William Ngan\'s question: when a line is drawn by software, whose line is it?',
        run: async ({ app, save }) => {
          await save();
          await call('ams_run_score', { source: "artboard(1000, 700, '#f3efe6')\nstage('Walk', 'marks')", title: 'Taking a line for a walk', narrate: 'A new sheet. Your drawing is saved in Assets, and Undo brings it back.' });
        } },
      { say: 'The walk. Watch the pace: slow at first, then hurried, then lingering in loops. Every point records when it was made, so the line keeps its time.',
        run: async ({ app, state }) => {
          const r = await call('ams_add', { role: 'line', points: activeWalk(), brush: 'ink', params: { width: 3, pressure: 0.6, taper: 0.3 }, why: 'an active line: walking for its own sake', narrate: 'The line walks.' });
          state.walk = r.id;
        } },
      { say: 'This is the Ink brush: pressure and a taper. It is a fair imitation of a pen, and it is also a decision someone made for you about what a line is.',
        run: ({ app, state }) => app.selectIds([state.walk]), target: 'panel:properties', click: false },
      ...[
        ['speed', 'Speed lines: short marks across the walk, as long as the hand was fast. The hurried middle opens up; the slow start stays tight.'],
        ['restate', 'Restated: drawn several times, the passes drifting apart where the hand was quick, the way a draughtsman restates rather than erases.'],
        ['inner', 'Inner lines: parallels that open and close with the speed. The line starts turning into a plane.'],
        ['dotted', 'A dotted walk: where the hand lingered the dots swell like pooling ink; fast passages leave specks.']
      ].map(([brush, say]) => ({ say, run: ({ state }) => call('ams_update', { id: state.walk, patch: { realize: { brush, params: {} } }, narrate: say }), hold: 1800 })),
      { say: 'The walk never changed, only the function that turns it into marks. Ngan: artists should create their own lines before they draw them. In code a line is a function of its walk.' },
      { say: 'Here is one: “teeth”, defined in the score with defineLine. It says one thing: it bites where the hand hurried. The same walk is drawn slowly above and in a hurry below.',
        run: async ({ app }) => {
          const ex = EXERCISES.find(e => e.id === 'whose-line');
          app.docks.open('script');
          app.scriptPanel?.setSource(ex.source);
          await call('ams_exercise', { id: 'whose-line', load: true, narrate: 'Running the score: first the line is defined, then it walks.' });
        } },
      { say: 'Your turn. Trace a master\'s line to feel it: Twittering Machine is under the sheet. Pick the Line tool and follow one of Klee\'s wires, slowly, then quickly.',
        run: async ({ app, state }) => {
          await call('ams_assets', { open: 'klee:klee-1922-twittering-machine', narrate: 'Klee\'s Twittering Machine as the reference.' });
          app.setTool('line');
          state.count = app.store.doc.elements.length;
        },
        target: 'tool:line', until: (app, state) => app.store.doc.elements.length > state.count, waitLabel: 'Draw a line, then it continues' },
      { say: 'That line is yours. In Properties, give it “teeth”, or one of Ngan\'s forms, and see what each says about your hand.',
        run: ({ app }) => { const last = app.store.doc.elements.at(-1); if (last) app.selectIds([last.id]); }, target: 'panel:properties', click: false },
      { say: 'Last: rewrite defineLine in the Score so the line says something else: it hesitates, it breathes. Keep it short. In code complexity is free; simplicity is elusive.', target: 'panel:script', click: false }
    ]
  },
  {
    id: 'tour',
    title: 'Tour of the workbench',
    summary: 'The canvas, the tools, stages, properties, the score, the process view, and the helpers.',
    steps: [
      { say: 'The artboard sits on an infinite canvas: doodle around it freely. Only the artboard is the picture.', target: 'title', click: false },
      { say: 'Tools follow Kandinsky and Klee: point, line, plane. Guides and gestures are construction; notes are writing. Every mark belongs to a stage.', target: 'tool:point', click: false },
      { say: 'Line, the point that moved. Its time and pressure are recorded as you draw.', target: 'tool:line', click: false },
      { say: 'Stages are the process in order: analysis, concept, construction, structure, value, marks, notes. New marks go to the active stage.', target: 'panel:stages', click: false },
      { say: 'Properties: the selection or the tool\'s defaults. The brush and its parameters, and the reason for the mark (why).', target: 'panel:properties', click: false },
      { say: 'The Score: the same process as code, in a small point / line / plane vocabulary. Exercises live here. Cmd+Enter runs.', target: 'panel:script', click: false },
      { say: 'Picture shows the result; Process shows construction and notes, and can replay the stages.', target: 'view:process', click: false },
      { say: 'Decide: a drawing as a sequence of typed decisions that a small local model can learn from you.', target: 'panel:decide', click: false },
      { say: 'Cmd+K opens the command palette; the Docs panel explains everything. Ask the Assistant “how did you do that?” to replay what it did.' }
    ]
  },
  {
    id: 'decide',
    title: 'Teaching a decision policy',
    summary: 'Analyze a reference, let a policy propose, override it, and keep your choices as training labels.',
    steps: [
      { say: 'Decide treats drawing as small typed decisions: what next, where, which technique, how dark, which direction, how dense.', target: 'panel:decide', click: false },
      { say: 'First the studio looks: the reference becomes value masses and regions, each with a place, a value, a hue, edges and a direction.',
        run: async () => { await call('ams_assets', { open: 'klee:klee-1922-senecio', narrate: 'Senecio as the reference.' }); await call('ams_analyze', {}); } },
      { say: 'The policy proposes one step with probabilities. Rules are the baseline; lev is a 350M model you can train on your own choices.',
        run: () => call('ams_decide_step', { backend: 'rules' }) },
      { say: 'Your turn: click any option to change it, then Apply step. What you change is what the model learns.', target: 'button:apply-step', click: false,
        until: app => !app.decidePanel?.proposal, waitLabel: 'Apply or skip the step' },
      { say: 'Labels collect below. Save them to Assets as a dataset, or export JSONL and train lev (training/decisions).' }
    ]
  }
];

/**
 * A walkthrough made from a take: each narration starts a step; the drawing's changes until the
 * next narration are replayed in that step (a single stroke traced by the guide); the first step
 * restores the take's starting drawing. Kept in Assets (kind walkthrough).
 */
export function walkthroughFromTake(take) {
  const clips = take.clips.filter(c => ['say', 'title', 'draw'].includes(c.track)).slice().sort((a, b) => a.start - b.start);
  const steps = [{ say: take.title, load: take.baseline, apply: [] }];
  for (const c of clips) {
    if (c.track === 'say' || c.track === 'title') steps.push({ say: c.text, apply: [] });
    else steps[steps.length - 1].apply.push({ diff: c.diff, label: c.label || 'change' });
  }
  if (steps.length === 1) for (const d of steps[0].apply.splice(0)) steps.push({ say: d.label, apply: [d] });
  return { id: `take-${Date.now().toString(36)}`, title: take.title, summary: `From a recording (${steps.length} steps)`, user: true, steps };
}

/** Run one data step: restore a drawing, replay changes (tracing single strokes). */
async function runDataStep(step, { app, g }) {
  if (step.load) app.loadDocument(structuredClone(step.load), 'walkthrough start');
  for (const a of step.apply || []) {
    const adds = a.diff?.add || [];
    if (adds.length === 1 && adds[0].points?.length > 1 && g.active) {
      const e = adds[0];
      await g.trace(e.points, n => { app.canvas.draft = normalizeElement({ ...e, id: 'draft', stage: 'draft', points: e.points.slice(0, n) }, 'draft'); app.canvas.invalidate(); });
      app.canvas.draft = null;
    }
    app.store.change(a.label || 'walkthrough', d => { const next = applyDiff(d, a.diff); for (const k of Object.keys(next)) d[k] = next[k]; });
    await g.wait(adds.length > 1 ? 500 : 150);
  }
}

export class Walkthroughs {
  constructor(app) {
    this.app = app; this.run = null; this.user = [];
    // Your walkthroughs (made from takes) live in Assets.
    setTimeout(() => this.loadUser(), 50);
  }

  async loadUser() {
    try { this.user = (await this.app.assetStore.all()).filter(a => a.kind === 'walkthrough' && a.program?.steps).map(a => ({ ...a.program, assetId: a.id })); } catch { this.user = []; }
  }

  all() { return [...WALKTHROUGHS, ...this.user]; }

  list() { return this.all().map(({ id, title, summary, steps, user }) => ({ id, title, summary, steps: steps.length, user: Boolean(user) })); }

  /** Make a walkthrough from a take and keep it in Assets. */
  async fromTake(take) {
    const wt = walkthroughFromTake(take);
    const blob = await new Promise(r => { const c = document.createElement('canvas'); c.width = 320; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#f3efe6'; x.fillRect(0, 0, 320, 200); x.fillStyle = '#1d1b19'; x.font = '600 16px Inter, sans-serif'; x.fillText(wt.title.slice(0, 32), 16, 40); x.font = '13px Inter, sans-serif'; x.fillText(`Walkthrough · ${wt.steps.length} steps`, 16, 66); r(c); }).then(c => canvasBlobLocal(c));
    const a = await this.app.assetStore.add(blob, { title: wt.title, kind: 'walkthrough', folder: 'Walkthroughs', tags: ['walkthrough', 'from-take'], program: JSON.parse(JSON.stringify(wt)) });
    wt.assetId = a.id;
    this.user.push(wt);
    return wt;
  }

  async start(id) {
    const wt = this.all().find(w => w.id === id);
    if (!wt) throw new Error(`No walkthrough "${id}"`);
    this.stop();
    const g = this.app.guide;
    const run = this.run = { wt, i: 0, paused: false, stopped: false, state: {}, pace: g.pace, jump: null, layout: this.app.layoutSnapshot() };
    if (g.pace === 0) g.pace = 1;
    this.app.log(`Walkthrough: ${wt.title}`);
    const rec = this.app.recorder;
    if (rec?.settings.autoWalkthroughs && !rec.recording) { rec.start({ title: wt.title, source: 'walkthrough' }); run.recording = true; }
    const btn = (label, title, fn) => h('button', { class: 'wb-btn', title, onclick: fn }, label);
    const pauseBtn = btn('Pause', 'Pause or continue', () => { run.paused = !run.paused; pauseBtn.textContent = run.paused ? 'Continue' : 'Pause'; run.wake?.(); });
    g.setControls([
      btn('Back', 'Previous step', () => { run.jump = Math.max(0, run.i - 1); run.wake?.(); }),
      pauseBtn,
      btn('Next', 'Next step', () => { run.jump = run.i + 1; run.wake?.(); }),
      btn('Stop', 'End the walkthrough', () => this.stop())
    ]);
    const ctx = { app: this.app, state: run.state, g, save: () => this.saveCurrent() };
    while (!run.stopped && run.i < wt.steps.length) {
      const step = wt.steps[run.i];
      g.label = `${wt.title} · ${run.i + 1}/${wt.steps.length}`;
      g.say(step.say);
      run.jump = null;
      try {
        // Make sure what the step shows is visible, whatever the layout or pace.
        if (step.layout) await call('ams_layout', { ...step.layout, narrate: step.say });
        const panel = String(step.target || '').match(/^panel:(.+)$/)?.[1];
        if (panel) this.app.setLayout({ open: [panel] });
        if (step.target) await g.moveTo(step.target, { click: step.click !== false });
        if (step.run) await step.run(ctx);
        if (step.load || step.apply) await runDataStep(step, ctx);
        g.label = `${wt.title} · ${run.i + 1}/${wt.steps.length}`;
        g.say(step.say);
      } catch (err) { this.app.log(`Walkthrough step failed: ${err.message}`, 'error'); }
      // Hold: time to read, or until the learner has done the thing (Next skips).
      const readMs = Math.max(2600, step.say.split(/\s+/).length * 330) * Math.max(0.5, g.pace) + (step.hold || 0);
      const t0 = Date.now();
      while (!run.stopped && run.jump === null) {
        if (step.until) { if (step.until(this.app, run.state)) break; g.meta.textContent = `${g.label} · ${step.waitLabel || 'Your turn'}`; }
        else if (!run.paused && Date.now() - t0 > readMs) break;
        await new Promise(r => { run.wake = r; setTimeout(r, 250); });
      }
      run.i = run.jump ?? run.i + 1;
    }
    if (this.run === run) this.stop(!run.stopped);
  }

  stop(finished = false) {
    const run = this.run;
    if (!run) return;
    run.stopped = true;
    run.wake?.();
    this.run = null;
    const g = this.app.guide;
    g.label = null;
    g.pace = run.pace;
    if (run.wt.restoreLayout !== false) this.app.restoreLayout(run.layout);
    if (run.recording) this.app.recorder.stop();
    if (finished) g.say(`${run.wt.title}: done.`, 'Walkthrough');
    g.setControls(null);
  }

  /** Before a lesson replaces the sheet: keep the current drawing in Assets (if it has anything in it). */
  async saveCurrent() {
    const doc = this.app.store.doc;
    if (!doc.elements.length) return null;
    return this.app.saveDocToAssets(structuredClone(doc), { tags: ['before-walkthrough'] });
  }
}

/** Synchronous PNG (toBlob can stall in background tabs). */
function canvasBlobLocal(c) { const u = c.toDataURL('image/png'), b = atob(u.slice(u.indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Blob([a], { type: 'image/png' }); }
