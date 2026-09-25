/**
 * Decide: the process as a sequence of typed decisions.
 *
 * 1. Analyse the reference (value masses, regions, edges, directions; optional MediaPipe).
 * 2. A backend (lev, rules, agent, or you) answers the step questions with probabilities.
 * 3. Low confidence → the card waits for you; otherwise it can run on its own.
 * 4. The step is realised by an executor, and your final choices become training labels.
 */
import { h, row, numberField, section, download } from '../ui.js';
import { icon } from '../icons.js';
import { analyzeImage } from '../../perception/analyze.js';
import { detectPose, detectFigure } from '../../perception/mediapipe.js';
import { DecisionEngine, URL_KEY } from '../../decide/engine.js';
import { applyStep } from '../../decide/executors.js';
import { STEPS, VALUES, DENSITIES } from '../../decide/questions.js';

const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };
const CORE = ['next', 'region', 'technique'];
const SESSION_KEY = 'ams_decide_session';

export function mountDecide(root, app) {
  const eng = app.decider = app.decider || new DecisionEngine(app);
  let backend = ls('ams_decide_backend') || 'rules';
  let threshold = Number(ls('ams_decide_threshold') ?? 0.35);
  let proposal = null, final = {}, auto = null;
  const body = h('div', { class: 'wb-col' });
  root.append(body);

  app.canvas.drawOverlay = ctx => {
    if (!eng.analysis || !app.showRegions) return;
    const z = app.canvas.cam.z;
    ctx.save();
    ctx.lineWidth = 1.2 / z;
    ctx.font = `${11 / z}px Inter, sans-serif`;
    for (const r of eng.analysis.regions) {
      const focus = proposal && final.region === r.id;
      ctx.strokeStyle = focus ? '#d9480f' : 'rgba(120,120,120,0.8)';
      ctx.setLineDash(focus ? [] : [4 / z, 3 / z]);
      ctx.beginPath(); r.polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = focus ? '#d9480f' : 'rgba(90,90,90,0.9)';
      ctx.fillText(r.id, r.centroid[0] * eng.analysis.width, r.centroid[1] * eng.analysis.height);
    }
    ctx.restore();
  };

  const analyse = async ({ k = 5, mediapipe = false } = {}) => {
    if (!app.reference?.img) throw new Error('Open an image as the reference first (Assets, or Menu → Open)');
    const ab = app.store.doc.artboard;
    eng.analysis = analyzeImage(app.reference.img, { width: ab.width, height: ab.height, k });
    // Keep the step history when re-analysing the same reference for the same drawing.
    let saved = null;
    try { saved = JSON.parse(ls(SESSION_KEY) || 'null'); } catch { /* ignore */ }
    eng.history = saved && saved.ref === app.reference.title && saved.title === app.store.doc.title ? saved.history : [];
    if (mediapipe) {
      try {
        const [poses, figure] = await Promise.all([detectPose(app.reference.img, ab), detectFigure(app.reference.img, ab)]);
        eng.analysis.poses = poses;
        if (figure?.outline && figure.share > 0.02) eng.analysis.regions.unshift({ id: 'figure', area: figure.share, centroid: centroidOf(figure.outline, ab), bbox: bboxOf(figure.outline, ab), value: 0.5, valueClass: 'middle', color: '#888888', hue: 'figure', edges: 0.3, orientation: 90, coherence: 0.5, place: 'figure', polygon: figure.outline });
        app.log(`MediaPipe: ${poses.length} pose(s), figure ${figure ? Math.round(figure.share * 100) : 0}% of the picture.`);
      } catch (err) { app.log(`MediaPipe unavailable: ${err.message}`, 'error'); }
    }
    app.showRegions = true;
    app.canvas.invalidate();
    app.log(`Analysed the reference: ${eng.analysis.regions.length} regions, ${eng.analysis.masses.length} value masses.`);
    render();
    return eng.analysis;
  };

  const propose = async () => {
    const subject = app.store.doc.title;
    status(backend === 'agent' ? 'Waiting for the agent…' : backend === 'you' ? '' : `Asking ${backend}…`);
    proposal = await eng.propose(backend, subject);
    final = Object.fromEntries(Object.entries(proposal.answers).map(([k, v]) => [k, v?.value]));
    status('');
    app.canvas.invalidate();
    render();
    return proposal;
  };

  const lowConfidence = () => CORE.some(k => proposal?.answers?.[k]?.confidence !== undefined && proposal.answers[k].confidence !== null && proposal.answers[k].confidence < threshold)
    || CORE.some(k => final[k] === undefined || final[k] === null);

  const apply = (source = null) => {
    if (!proposal) return null;
    const changed = Object.entries(final).some(([k, v]) => String(v) !== String(proposal.answers?.[k]?.value));
    const src = source === 'policy' && changed ? 'agent' : source || (backend === 'agent' ? 'agent' : backend === 'you' || changed ? 'you' : 'accepted');
    const d = { step: final.next, region: final.region, technique: final.technique, value: Number(final.value ?? 1), direction: final.direction || 'follow', density: Number(final.density ?? 2) };
    if (src !== 'policy') eng.record(proposal, final, src);
    const by = { kind: src === 'agent' ? 'agent' : src === 'you' ? 'user' : 'policy', name: ['accepted', 'policy'].includes(src) ? backend : src };
    const ids = applyStep(app, eng.analysis, d, by);
    eng.history.push({ ...d, source: src });
    ls(SESSION_KEY, JSON.stringify({ ref: app.reference?.title, title: app.store.doc.title, history: eng.history }));
    app.log(`Step ${eng.history.length}: ${d.step} ${d.region} ${d.technique} (${src})`);
    proposal = null; final = {};
    render();
    return { step: d, elements: ids.length, source: src };
  };

  const runAuto = async n => {
    auto = { left: n };
    render();
    while (auto && auto.left-- > 0) {
      await propose();
      if (final.next === 'stop') { app.log('The policy chose to stop.'); break; }
      if (lowConfidence()) { status('Low confidence: your choice'); break; }
      apply('policy');
      await new Promise(r => setTimeout(r, 250));
    }
    auto = null;
    render();
  };

  let statusEl = h('div', { class: 'wb-script-out' });
  const status = t => { statusEl.textContent = t; };

  const card = () => {
    if (!proposal) return null;
    const box = h('div', { class: 'wb-dcard' });
    for (const [qid, q] of Object.entries(proposal.questions)) {
      const ans = proposal.answers?.[qid];
      const keys = q.type === 'score' ? q.criteria.map((_, i) => String(i)) : Object.keys(q.criteria);
      const label = k => (q.type === 'score' ? q.criteria[Number(k)] : qid === 'region' ? `${k} · ${q.criteria[k]}` : qid === 'next' ? k : k);
      const opts = keys.map(k => {
        const p = ans?.probs?.[k] ?? null;
        const on = String(final[qid]) === k;
        return h('button', { class: `wb-opt${on ? ' on' : ''}${String(ans?.value) === k ? ' suggested' : ''}`, title: q.type === 'choice' ? String(q.criteria[k] ?? k) : label(k), onclick: () => { final[qid] = q.type === 'score' ? Number(k) : k; app.canvas.invalidate(); render(); } },
          h('span', { class: 'wb-opt-label' }, label(k)),
          p !== null ? h('span', { class: 'wb-opt-bar', style: { width: `${Math.round(p * 100)}%` } }) : null,
          p !== null ? h('span', { class: 'wb-opt-p' }, `${Math.round(p * 100)}`) : null);
      });
      const conf = ans?.confidence;
      box.append(h('div', { class: 'wb-q' },
        h('div', { class: 'wb-q-head' }, q.instructions, conf !== undefined && conf !== null ? h('span', { class: `wb-conf${conf < threshold ? ' low' : ''}` }, `confidence ${Math.round(conf * 100)}%`) : null),
        h('div', { class: 'wb-opts' }, ...opts)));
    }
    box.append(h('div', { class: 'wb-row wb-row-actions' },
      h('button', { class: 'wb-btn primary', 'data-guide': 'button:apply-step', title: 'Realise the step. Your choices are kept as training labels.', onclick: () => apply() }, 'Apply step'),
      h('button', { class: 'wb-btn', onclick: () => { proposal = null; final = {}; render(); } }, 'Skip')));
    return box;
  };

  const render = () => {
    const a = eng.analysis;
    const counts = eng.labels.reduce((m, l) => ((m[l.meta?.source] = (m[l.meta?.source] || 0) + 1), m), {});
    const backendSel = h('select', { class: 'wb-select' }, ...[['rules', 'Rules (baseline)'], ['lev', 'lev / kev (local server)'], ['agent', 'Agent (MCP)'], ['you', 'You decide']].map(([v, l]) => h('option', { value: v, selected: v === backend }, l)));
    backendSel.addEventListener('change', () => { backend = backendSel.value; ls('ams_decide_backend', backend); render(); });
    const urlInput = h('input', { class: 'wb-inline', value: ls(URL_KEY) || '/__decide', title: 'Decision server base URL (the dev proxy /__decide forwards to 127.0.0.1:8009)' });
    urlInput.addEventListener('change', () => ls(URL_KEY, urlInput.value.trim()));
    urlInput.addEventListener('keydown', e => e.stopPropagation());
    const mp = h('input', { type: 'checkbox', title: 'Also run MediaPipe pose and figure segmentation' });
    body.replaceChildren(...[
      h('div', { class: 'wb-row wb-row-actions' },
        h('button', { class: 'wb-btn', 'data-guide': 'button:analyse', html: `${icon('picture')}<span>Analyse reference</span>`, onclick: () => analyse({ mediapipe: mp.checked }).catch(e => status(e.message)) }),
        h('label', { class: 'wb-row' }, mp, h('span', {}, 'MediaPipe')),
        a ? h('label', { class: 'wb-row' }, h('input', { type: 'checkbox', checked: app.showRegions, onchange: e => { app.showRegions = e.target.checked; app.canvas.invalidate(); } }), h('span', {}, 'Regions')) : null),
      a ? h('div', { class: 'wb-muted wb-small' }, `${a.regions.length} regions · masses ${a.masses.map(m => `${Math.round(m.lightness * 100)}:${Math.round(m.share * 100)}%`).join(' ')}${a.poses?.length ? ` · ${a.poses.length} pose(s)` : ''}`) : h('div', { class: 'wb-muted wb-small', title: 'Open an image from Assets as the reference, then Analyse' }, app.reference ? app.reference.title : 'No reference'),
      a?.poses?.length ? h('button', { class: 'wb-btn', onclick: () => addPoseGuides(app, a) }, 'Add pose as gesture guides') : null,
      row('Policy', backendSel),
      backend === 'lev' ? row('Server', urlInput) : null,
      row('Ask me', numberField({ value: threshold, min: 0, max: 1, step: 0.05, def: 0.35, title: 'Wait for your choice when the model is less confident than this', onChange: v => { threshold = v; ls('ams_decide_threshold', String(v)); } })),
      h('div', { class: 'wb-row wb-row-actions' },
        h('button', { class: 'wb-btn primary', 'data-guide': 'button:propose', disabled: !a, onclick: () => propose().catch(e => status(e.message)) }, 'Propose step'),
        h('button', { class: 'wb-btn', disabled: !a || auto, onclick: () => runAuto(8).catch(e => status(e.message)) }, 'Run ×8'),
        auto ? h('button', { class: 'wb-btn', onclick: () => { auto = null; } }, 'Stop') : null),
      statusEl,
      card(),
      eng.history.length ? section(`Steps (${eng.history.length})`, false, ...eng.history.map((s, i) => h('div', { class: 'wb-small' }, `${i + 1}. ${s.step} · ${s.region} · ${s.technique} · ${VALUES[s.value]} · ${DENSITIES[s.density]} (${s.source})`))) : null,
      section(`Labels (${eng.labels.length})`, false,
        h('div', { class: 'wb-small wb-muted' }, Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'none yet'),
        h('div', { class: 'wb-row wb-row-actions' },
          h('button', { class: 'wb-btn', title: 'Download the labels as JSONL (lev format)', onclick: () => download(eng.exportJSONL(), 'ams-decisions.jsonl', 'application/jsonl') }, 'Export JSONL'),
          h('button', { class: 'wb-btn', title: 'Keep the labels as a dataset in Assets (export it from there as JSONL)', onclick: () => eng.saveToAssets(app.assetStore, { title: `Decisions · ${app.store.doc.title}` }).then(a => status(`Saved “${a.title}” to Assets`), e => status(e.message)) }, 'Save to Assets'),
          import.meta.env?.DEV ? h('button', { class: 'wb-btn', title: 'Write the labels to training/decisions/labels/ for make_suite.py', onclick: () => eng.saveToProject().then(p => status(`Saved ${p}`), e => status(e.message)) }, 'Save to project') : null,
          h('button', { class: 'wb-btn', onclick: () => { if (confirm('Delete all decision labels?')) { eng.labels = []; eng.saveLabels(); render(); } } }, 'Clear')))
    ].filter(Boolean));
  };
  app.decidePanel = { analyse, propose, apply, runAuto, setBackend: b => { backend = b; ls('ams_decide_backend', b); render(); }, get proposal() { return proposal; }, setFinal: (v) => { Object.assign(final, v); render(); } };
  app.on('decision-pending', () => render());
  render();
}

function centroidOf(poly, ab) { const n = poly.length; return [poly.reduce((a, p) => a + p[0], 0) / n / ab.width, poly.reduce((a, p) => a + p[1], 0) / n / ab.height]; }
function bboxOf(poly, ab) { const xs = poly.map(p => p[0] / ab.width), ys = poly.map(p => p[1] / ab.height); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }

function addPoseGuides(app, a) {
  let s = app.store.doc.stages.find(x => x.name === 'Gesture');
  if (!s) s = app.store.addStage({ name: 'Gesture', kind: 'construction' });
  for (const [i, pose] of a.poses.entries()) {
    for (const limb of pose.limbs) app.store.addElement({ role: 'gesture', stage: s.id, points: limb.points, why: `pose ${i + 1}: ${limb.name} (MediaPipe)`, by: { kind: 'perception', name: 'mediapipe' } });
    if (pose.head) app.store.addElement({ role: 'guide', stage: s.id, points: circleAt(pose.head, 28), why: `pose ${i + 1}: head (MediaPipe)`, by: { kind: 'perception', name: 'mediapipe' } });
  }
}
const circleAt = ([x, y], r) => Array.from({ length: 24 }, (_, i) => [x + Math.cos(i / 24 * Math.PI * 2) * r, y + Math.sin(i / 24 * Math.PI * 2) * r]);

export { STEPS };
