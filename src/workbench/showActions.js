/**
 * How each agent action is shown (visible automation) and recorded (replayable sessions).
 *
 * before(args): travel to the control, narrate.  after(args, result): reveal the effect
 * (trace a stroke, build a score stage by stage). Every mutating call is appended to the
 * current session; a session starts with a baseline copy of the document, so
 * "how did you do that?" can replay it with the guide.
 */
import { normalizeElement } from '../process/document.js';

const SESSIONS_KEY = 'ams_agent_sessions_v1';
const READ_ONLY = /^ams_(wb_state|vocabulary|get|snapshot|process_sheet|pending|candidates|sessions|show|decision_pending|decision_labels)$/;

const summarize = (name, a) => {
  switch (name) {
    case 'ams_run_score': return `Running a score${a.title ? ` for “${a.title}”` : ''}.`;
    case 'ams_exercise': return a.load ? `Loading the exercise “${a.id}”.` : `Reading the exercise “${a.id}”.`;
    case 'ams_add': return `Adding a ${a.role}${a.why ? `: ${a.why}` : '.'}`;
    case 'ams_update': return `Changing an element${a.patch?.why ? `: ${a.patch.why}` : '.'}`;
    case 'ams_delete': return `Removing ${a.ids?.length || 0} element(s).`;
    case 'ams_stage': return `Stages: ${a.action} ${a.name || a.id || ''}`.trim() + '.';
    case 'ams_decide': return `Deciding: ${a.question} → ${a.chosen}${a.why ? ` (${a.why})` : ''}`;
    case 'ams_view': return `Changing the view${a.mode ? ` to ${a.mode}` : ''}.`;
    case 'ams_generate': return `Asking ${a.engine || 'the engine'} for ${a.count || 1} score(s): “${a.prompt}”.`;
    case 'ams_answer': return 'Answering the waiting request with a score.';
    case 'ams_save': return 'Saving the drawing to Assets.';
    case 'ams_assets': return a.open ? 'Opening an asset.' : 'Searching Assets.';
    case 'ams_panel': return `Opening the ${a.id} panel.`;
    case 'ams_undo': return a.redo ? 'Redo.' : 'Undo.';
    case 'ams_brush': return a.action === 'save' ? 'Writing a brush.' : a.action === 'get' ? `Reading the brush “${a.id}”.` : a.action === 'use' ? `Using the brush “${a.id}”.` : 'Brushes.';
    case 'ams_palette': return a.action === 'create' ? `Making the palette “${a.name}”.` : a.action === 'from_image' ? 'Drawing a palette from the image.' : a.action === 'apply' ? `Using ${a.color || `${a.name} ${a.index ?? 0}`}.` : 'Palettes.';
    case 'ams_analyze': return 'Analyzing the reference: value masses, regions, edges and directions.';
    case 'ams_decide_step': return `Asking the ${a.backend || 'current'} policy for the next step.`;
    case 'ams_decision_answer': return `Choosing: ${Object.entries(a.answers || {}).map(([k, v]) => `${k} ${v}`).join(', ')}.`;
    default: return name.replace(/^ams_/, '').replace(/_/g, ' ');
  }
};

export const SHOW = {
  async ams_run_score(g) { await g.moveTo('panel:script'); await g.moveTo('button:run-score'); },
  async ams_exercise(g, a) { if (a.load) { await g.moveTo('panel:script'); await g.moveTo('button:run-score'); } },
  async ams_add(g, a, app) {
    await g.moveTo(`tool:${a.role}`);
    const pts = (a.points || []).map((p, i) => [p[0], p[1], p[2] ?? i * 16, p[3] ?? 0.5]);
    const base = { role: a.role, stage: 'draft', realize: a.brush ? { brush: a.brush, params: a.params || {} } : undefined, color: a.color, seed: 1 };
    await g.trace(pts, n => { app.canvas.draft = normalizeElement({ ...base, points: pts.slice(0, n) }, 'draft'); app.canvas.invalidate(); });
    app.canvas.draft = null;
  },
  async ams_update(g, a, app) { app.selectIds([a.id]); await g.moveTo('panel:properties', { click: false }); },
  async ams_delete(g, a, app) { app.selectIds(a.ids || []); await g.wait(400); },
  async ams_stage(g, a) { await g.moveTo('panel:stages'); if (a.id) await g.moveTo(`stage:${a.id}`); },
  async ams_decide(g) { await g.moveTo('panel:process', { click: false }); },
  async ams_view(g, a) { if (a.mode) await g.moveTo(`view:${a.mode}`); },
  async ams_generate(g) { await g.moveTo('panel:generate'); await g.moveTo('button:generate'); },
  async ams_save(g) { await g.moveTo('menu'); },
  async ams_panel(g, a) { await g.moveTo(`tab:${a.id}`); },
  async ams_brush(g, a) { if (a.action === 'save' || a.action === 'get') await g.moveTo('panel:brushes', { click: false }); },
  async ams_undo(g) { await g.moveTo('menu', { click: false }); },
  async ams_analyze(g) { await g.moveTo('panel:decide'); await g.moveTo('button:analyze'); },
  async ams_decide_step(g) { await g.moveTo('panel:decide'); await g.moveTo('button:propose'); },
  async ams_decision_answer(g, a) { await g.moveTo('panel:decide', { click: false }); if (a.apply) await g.moveTo('button:apply-step'); }
};

/** After a score runs: build it up stage by stage, narrating stage reasons and decisions. */
export async function revealScore(g, app) {
  if (!g.active) return;
  const doc = app.store.doc;
  for (let i = 0; i < doc.stages.length; i++) {
    const s = doc.stages[i];
    app.setUpTo(i);
    const decisions = doc.decisions.filter(d => d.stage === s.id).map(d => `${d.question} → ${d.chosen}${d.why ? ` (${d.why})` : ''}`);
    const reasons = doc.elements.filter(e => e.stage === s.id && e.why).slice(0, 2).map(e => e.why);
    g.say([`Stage ${i + 1}: ${s.name}`, ...decisions, ...reasons].join('\n'), `Score · ${doc.title || ''}`);
    await g.moveTo(`stage:${s.name}`, { click: false });
    await g.wait(1100);
  }
  app.setUpTo(Infinity);
}

export class SessionRecorder {
  constructor(app) {
    this.app = app;
    try { this.sessions = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch { this.sessions = []; }
    this.current = null;
  }

  save() { try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(this.sessions.slice(-12))); } catch { /* quota */ } }

  record(name, args) {
    if (READ_ONLY.test(name) || this.replaying) return;
    const now = Date.now();
    if (!this.current || now - this.current.last > 120000) {
      this.current = { id: `s_${now.toString(36)}`, started: now, last: now, title: '', baseline: JSON.stringify(this.app.store.doc), steps: [] };
      this.sessions.push(this.current);
    }
    const clean = JSON.parse(JSON.stringify(args || {}));
    this.current.steps.push({ tool: name, args: clean, narrate: args?.narrate || summarize(name, args || {}), t: now });
    this.current.last = now;
    this.current.title ||= summarize(name, args || {});
    this.save();
  }

  list() { return this.sessions.map(s => ({ id: s.id, started: new Date(s.started).toISOString(), steps: s.steps.length, title: s.title, tools: [...new Set(s.steps.map(x => x.tool))] })).reverse(); }

  /** Replay a session visibly: restore its baseline, then re-run each step with the guide. */
  async replay(id, callTool) {
    const s = id ? this.sessions.find(x => x.id === id) : this.sessions[this.sessions.length - 1];
    if (!s) throw new Error('No recorded agent session');
    const g = this.app.guide;
    const before = JSON.stringify(this.app.store.doc);
    this.replaying = true;
    try {
      this.app.loadDocument(JSON.parse(s.baseline), 'replay: baseline');
      g.say(`Replaying ${s.steps.length} step(s): ${s.title}`, 'Replay');
      await g.wait(900);
      for (const [i, step] of s.steps.entries()) {
        g.say(step.narrate, `Replay · step ${i + 1} of ${s.steps.length}`);
        await callTool(step.tool, { ...step.args, narrate: step.narrate }, { replay: true });
        await g.wait(500);
      }
      g.say('Replay finished. Undo (Cmd+Z) returns to what you had before.', 'Replay');
    } finally {
      this.replaying = false;
    }
    // One undo step back to the pre-replay document.
    this.app.store.commitFrom(before, 'replay');
    return { replayed: s.steps.length };
  }
}

export { summarize, READ_ONLY };
