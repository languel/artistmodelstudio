/**
 * Walkthroughs (after underscores): lessons and tours played by the guide. The cursor goes to
 * the real controls, actions run through the same MCP tools an agent uses (so they are logged,
 * recorded and undoable), and some steps wait for you to do something yourself.
 *
 * Step: { say, target?, click?, run?(ctx), until?(app) → bool (wait for the learner), hold? ms }
 */
import { h } from './ui.js';
import { EXERCISES } from '../process/exercises.js';

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

export const WALKTHROUGHS = [
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
    summary: 'Analyse a reference, let a policy propose, override it, and keep your choices as training labels.',
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

export class Walkthroughs {
  constructor(app) { this.app = app; this.run = null; }

  list() { return WALKTHROUGHS.map(({ id, title, summary, steps }) => ({ id, title, summary, steps: steps.length })); }

  async start(id) {
    const wt = WALKTHROUGHS.find(w => w.id === id);
    if (!wt) throw new Error(`No walkthrough "${id}"`);
    this.stop();
    const g = this.app.guide;
    const run = this.run = { wt, i: 0, paused: false, stopped: false, state: {}, pace: g.pace, jump: null };
    if (g.pace === 0) g.pace = 1;
    this.app.log(`Walkthrough: ${wt.title}`);
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
        if (step.target) await g.moveTo(step.target, { click: step.click !== false });
        if (step.run) await step.run(ctx);
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
