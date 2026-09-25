/**
 * Decision engine: asks a System One backend the step questions, lets the user (or an
 * agent) confirm or override, applies the step, and records labels for training.
 *
 * Backends
 *   lev     a local lev / kev server (TypeSafe /v1/systemone), via the dev proxy /__decide
 *   rules   a transparent baseline (hand-written rules), for bootstrapping and comparison
 *   agent   an external agent answers over MCP (ams_decision_pending / ams_decision_answer)
 *   you     no model: you choose every answer
 */
import { stateText, stepQuestions, labeledRequest, STEPS } from './questions.js';

const LABELS_KEY = 'ams_decision_labels_v1';
const URL_KEY = 'ams_decision_url';

/** Normalize a TypeSafe answer to { value, probs, confidence }. */
function norm(ans) {
  if (!ans) return null;
  if (ans.type === 'choice') return { value: ans.choice, probs: ans.probabilities || {}, confidence: ans.confidence ?? null };
  if (ans.type === 'score') {
    const probs = ans.probabilities || {};
    const mode = Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0];
    return { value: Number(mode ?? Math.round(ans.score)), probs, confidence: ans.confidence ?? null, expected: ans.score };
  }
  if (ans.type === 'noul') return { value: ans.noul >= 0.5, probs: { true: ans.noul, false: 1 - ans.noul }, confidence: Math.abs(ans.noul - 0.5) * 2 };
  return null;
}

const spread = (keys, top, p = 0.6) => Object.fromEntries(keys.map(k => [k, k === top ? p : (1 - p) / Math.max(1, keys.length - 1)]));

export const BACKENDS = {
  async lev({ state, questions }) {
    let base = '/__decide';
    try { base = localStorage.getItem(URL_KEY) || base; } catch { /* ignore */ }
    const res = await fetch(`${base.replace(/\/$/, '')}/v1/systemone`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' }, body: JSON.stringify({ state, model: 'lev-latest', questions }) });
    if (!res.ok) throw new Error(`Decision server ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const answers = data.answers || data;
    return Object.fromEntries(Object.keys(questions).map(k => [k, norm(answers[k])]));
  },

  /** Transparent rules: the baseline a trained policy has to beat. */
  async rules({ questions, analysis, history }) {
    const steps = history.map(h => h.step);
    const count = s => steps.filter(x => x === s).length;
    const next = !steps.includes('look') ? 'look' : count('block') < 2 ? 'block' : count('structure') < 2 ? 'structure' : count('value') < 3 ? 'value' : count('accent') < 1 ? 'accent' : 'stop';
    const worked = new Set(history.filter(h => h.step === next).map(h => h.region));
    const pool = analysis.regions.filter(r => Object.hasOwn(questions.region.criteria, r.id));
    const pick = (next === 'structure' ? [...pool].sort((a, b) => b.edges - a.edges) : next === 'value' ? [...pool].sort((a, b) => a.value - b.value) : pool).find(r => !worked.has(r.id)) || pool[0];
    const technique = { look: 'gesture', block: 'flat', structure: pick.edges > 0.3 ? 'contour' : 'gesture', value: pick.valueClass === 'dark' ? 'crosshatch' : pick.coherence > 0.3 ? 'hatch' : 'stipple', accent: 'point', stop: 'point' }[next];
    const value = { dark: 2, middle: 1, light: 0 }[pick.valueClass];
    return {
      next: { value: next, probs: spread(Object.keys(STEPS), next), confidence: 0.5 },
      region: { value: pick.id, probs: spread(Object.keys(questions.region.criteria), pick.id, 0.5), confidence: 0.4 },
      technique: { value: technique, probs: spread(Object.keys(questions.technique.criteria), technique), confidence: 0.5 },
      value: { value, probs: spread(['0', '1', '2'], String(value), 0.7), confidence: 0.6 },
      direction: { value: pick.coherence > 0.3 ? 'follow' : 'diagonal', probs: spread(Object.keys(questions.direction.criteria), pick.coherence > 0.3 ? 'follow' : 'diagonal', 0.5), confidence: 0.4 },
      density: { value: value + 1, probs: spread(['0', '1', '2', '3', '4'], String(value + 1), 0.5), confidence: 0.4 }
    };
  },

  async you() { return {}; }
};

export class DecisionEngine {
  constructor(app) {
    this.app = app;
    this.analysis = null;
    this.history = [];
    this.pending = null; // { state, questions, answers, resolve } while waiting for an agent
    try { this.labels = JSON.parse(localStorage.getItem(LABELS_KEY) || '[]'); } catch { this.labels = []; }
  }

  saveLabels() { try { localStorage.setItem(LABELS_KEY, JSON.stringify(this.labels)); } catch { /* quota */ } }

  /** Ask a backend for one step's answers. */
  async propose(backend, subject) {
    if (!this.analysis) throw new Error('Analyze a reference first');
    const state = stateText({ subject, analysis: this.analysis, history: this.history });
    const questions = stepQuestions({ analysis: this.analysis, history: this.history });
    let answers = {};
    if (backend === 'agent') {
      answers = await new Promise(resolve => { this.pending = { state, questions, resolve, t: Date.now() }; this.app.emit('decision-pending'); });
    } else {
      answers = await BACKENDS[backend]({ state, questions, analysis: this.analysis, history: this.history });
    }
    return { state, questions, answers, backend };
  }

  /** Agent answers a pending proposal: { next: 'block', region: 'r2', value: 1, … } */
  answerPending(values, by) {
    if (!this.pending) return false;
    const p = this.pending;
    this.pending = null;
    p.resolve(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, probs: {}, confidence: null, by }])));
    return true;
  }

  /**
   * Record the final choices of a step as a label. source: 'you' (chosen or overridden),
   * 'accepted' (you kept the model's suggestion), 'agent'.
   */
  record(proposal, final, source) {
    const req = labeledRequest(proposal.state, proposal.questions, final, source);
    this.labels.push({ ...req, meta: { source, backend: proposal.backend, t: Date.now(), subject: this.app.store.doc.title, suggested: Object.fromEntries(Object.entries(proposal.answers || {}).map(([k, v]) => [k, v?.value ?? null])) } });
    this.saveLabels();
  }

  /** Merge labels from JSONL (a dataset asset or a file), skipping ones already present. Returns how many were added. */
  importJSONL(text) {
    const key = l => JSON.stringify([l.state, Object.fromEntries(Object.entries(l.questions).map(([k, q]) => [k, q.label]))]);
    const have = new Set(this.labels.map(key));
    let added = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const l = JSON.parse(line);
      if (have.has(key(l))) continue;
      have.add(key(l));
      this.labels.push({ state: l.state, questions: l.questions, meta: l.meta || { source: 'import' } });
      added++;
    }
    this.saveLabels();
    return added;
  }

  /** Keep the labels as a dataset asset (IndexedDB; export from Assets as JSONL). */
  async saveToAssets(assetStore, { title, sources = null, folder = 'Datasets' } = {}) {
    const jsonl = this.exportJSONL({ sources });
    const n = jsonl.split('\n').filter(Boolean).length;
    const bySource = this.labels.filter(l => !sources || sources.includes(l.meta?.source)).reduce((m, l) => ((m[l.meta?.source] = (m[l.meta?.source] || 0) + 1), m), {});
    const blob = await datasetCard(title, n, bySource);
    return assetStore.add(blob, { title: title || `Decisions ${new Date().toISOString().slice(0, 10)}`, kind: 'dataset', folder, tags: ['decisions', 'lev', ...Object.keys(bySource)], program: { type: 'ams-decisions', jsonl }, meta: { records: n, bySource } });
  }

  /** Dev server only: write the labels into training/decisions/labels/ for make_suite.py. */
  async saveToProject({ sources = null } = {}) {
    const name = `ams-decisions-${new Date().toISOString().slice(0, 10)}.jsonl`;
    const res = await fetch('/__probe/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ root: 'decisions', set: 'labels', files: { [name]: this.exportJSONL({ sources }) } }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || `save failed (${res.status}); the dev server is needed`);
    return `${out.dir}/${name}`;
  }

  /** JSONL in lev's labeled-request format (meta kept for bookkeeping; lev ignores extra keys). */
  exportJSONL({ sources = null } = {}) {
    return this.labels.filter(l => !sources || sources.includes(l.meta?.source)).map(l => JSON.stringify({ state: l.state, questions: l.questions, meta: l.meta })).join('\n') + '\n';
  }
}

export { URL_KEY };

/** A small card image for a dataset asset: title, record count, and counts by labeller. */
async function datasetCard(title, n, bySource) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2ede3'; ctx.fillRect(0, 0, 320, 200);
  ctx.fillStyle = '#1d1b19'; ctx.font = '600 15px Inter, sans-serif'; ctx.fillText((title || 'Decisions').slice(0, 34), 16, 30);
  ctx.font = '48px Inter, sans-serif'; ctx.fillText(String(n), 16, 92);
  ctx.font = '13px Inter, sans-serif'; ctx.fillText('decision labels (lev format)', 16, 114);
  const total = Math.max(1, n); let x = 16;
  for (const [k, v] of Object.entries(bySource)) {
    const w = (288 * v) / total;
    ctx.fillStyle = { you: '#1d1b19', accepted: '#6d665c', agent: '#9b9184', rules: '#c9c1b4' }[k] || '#b0a89b';
    ctx.fillRect(x, 140, Math.max(2, w), 14); x += w;
  }
  ctx.fillStyle = '#4d4740'; ctx.font = '11px Inter, sans-serif';
  ctx.fillText(Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(' · '), 16, 178);
  return canvasBlobLocal(c);
}

/** Synchronous PNG (toBlob can stall in background tabs). */
function canvasBlobLocal(c) { const u = c.toDataURL('image/png'), b = atob(u.slice(u.indexOf(',') + 1)), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Blob([a], { type: 'image/png' }); }
