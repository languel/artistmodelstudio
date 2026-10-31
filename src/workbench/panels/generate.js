/**
 * Generate: ask an engine (a model, or an agent over MCP) for scores. Each candidate
 * is a recorded process: open it on the canvas, save it to Assets, read its score.
 * The same shell as the Assistant: the candidates fill the panel, the request sits at the bottom
 * (what to draw, then + options · model · how many · send). The model is the one chosen for the Assistant.
 */
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { showMenu } from '../menu.js';
import { generateScore } from '../../process/prompt.js';
import { EXERCISES } from '../../process/exercises.js';
import { renderToCanvas } from '../../process/render.js';
import { modelPill } from '../modelPill.js';
import { currentEngine, useModel } from '../modelStore.js';

const SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 11l6-6 6 6"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const COUNTS = [1, 2, 4, 8];

export function mountGenerate(root, app) {
  const wrap = h('div', { class: 'wb-assistant' });
  const results = h('div', { class: 'wb-chat' });
  const composer = h('div', { class: 'wb-composer' });
  wrap.append(results, composer);
  root.append(wrap);
  const pill = modelPill(app);
  let saved = [];
  try { saved = JSON.parse(sessionStorage.getItem('ams_wb_candidates') || '[]'); } catch { /* ignore */ }
  const candidates = app.candidates = app.candidates || saved;
  const persist = () => { try { sessionStorage.setItem('ams_wb_candidates', JSON.stringify(candidates.slice(0, 24))); } catch { /* quota */ } };
  let busy = null;
  const status = h('div', { class: 'wb-script-out' });
  const hint = h('div', { class: 'wb-chat-empty' }, h('b', {}, 'Generate'), h('span', {}, 'Describe a drawing. Each candidate is a recorded process: open it on the board, save it to Assets, or read its score.'));
  const prompt = h('textarea', { class: 'wb-compose-input', rows: 1, placeholder: 'What to draw…' });
  const grow = () => { prompt.style.height = 'auto'; prompt.style.height = `${Math.min(prompt.scrollHeight, 180)}px`; };
  prompt.addEventListener('input', () => { app.genPrompt = prompt.value; grow(); });
  prompt.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });

  // Plain (just the marks) or process (stages, decisions, reasons, notes): kept, plain to start with.
  const plainOn = () => { if (app.genPlain === undefined) { try { app.genPlain = localStorage.getItem('ams_gen_plain') !== '0'; } catch { app.genPlain = true; } } return app.genPlain; };
  const setPlain = on => { app.genPlain = on; try { localStorage.setItem('ams_gen_plain', on ? '1' : '0'); } catch { /* ignore */ } render(); };
  const render = () => {
    const engineId = currentEngine();
    if (document.activeElement !== prompt) prompt.value = app.genPrompt || '';
    grow();
    const optionsMenu = e => {
      const r = e.currentTarget.getBoundingClientRect(), withRef = Boolean(app.genWithRef && app.reference), temp = app.genTemp ?? 0.8;
      showMenu([
        { label: 'Style', hint: 'Plain: just the marks, for quick experiments. Process: stages, decisions, reasons and notes, the record of how it was made', items: [{ label: 'Plain: just the marks', active: plainOn(), run: () => setPlain(true) }, { label: 'Process: stages, decisions, notes', active: !plainOn(), run: () => setPlain(false) }] },
        { label: 'Exercise', hint: 'Frame the request with an exercise brief', items: [{ label: 'No exercise frame', active: !app.genExercise, run: () => { app.genExercise = ''; render(); } }, ...EXERCISES.map(x => ({ label: x.title, active: app.genExercise === x.id, run: () => { app.genExercise = x.id; render(); } }))] },
        { label: app.reference ? `${withRef ? '✓ ' : ''}Send the reference (${app.reference.title})` : 'Send the reference (open an image asset first)', disabled: !app.reference, hint: 'For vision models and agents', run: () => { app.genWithRef = !withRef; render(); } },
        { label: 'Temperature', items: [0.2, 0.5, 0.8, 1.2, 1.6].map(t => ({ label: String(t), active: t === temp, run: () => { app.genTemp = t; render(); } })) }
      ], r.left, r.top - 6, { up: true });
    };
    const count = app.genCount || 1;
    const countBtn = h('button', { class: 'wb-compose-pill', title: 'How many candidates (click to change)', onclick: () => { app.genCount = COUNTS[(COUNTS.indexOf(count) + 1) % COUNTS.length] || 1; render(); } }, `×${count}`);
    const optsBtn = h('button', { class: 'wb-compose-icon', title: 'Options: exercise, reference, temperature', html: icon('plus'), onclick: optionsMenu });
    const sendBtn = h('button', { class: 'wb-compose-send', title: busy ? 'Stop' : 'Generate (Enter)', 'data-guide': 'button:generate', html: busy ? STOP : SEND, onclick: () => (busy ? stop() : go()) });
    const chips = [plainOn() ? null : 'process', app.genExercise ? EXERCISES.find(x => x.id === app.genExercise)?.title : null, app.genWithRef && app.reference ? 'reference' : null].filter(Boolean);
    composer.replaceChildren(
      chips.length ? h('div', { class: 'wb-compose-chips' }, ...chips.map(c => h('span', { class: 'wb-chip' }, c))) : '',
      prompt,
      h('div', { class: 'wb-compose-row' }, optsBtn, pill, countBtn, h('span', { style: { flex: 1 } }), sendBtn));
    status.textContent = busy ? busy.status : (engineId === 'agent' ? 'Agent engine: requests wait until an agent answers over MCP (ams_pending → ams_answer).' : status.textContent === 'starting' ? '' : status.textContent);
    status.hidden = !status.textContent;
    renderList();
  };
  const stop = () => { busy?.ctrl.abort(); app.artists.get('agent')?.answer?.(''); };

  const go = async () => {
    if (busy) return;
    const engineId = currentEngine(), artist = app.artists.get(engineId);
    const text = prompt.value.trim();
    if (!text) { prompt.focus(); return; }
    if (!artist?.complete) { status.textContent = 'Pick a model engine from the model button.'; status.hidden = false; return; }
    const n = app.genCount || 1;
    const ctrl = new AbortController();
    busy = { status: 'starting', ctrl };
    render();
    const image = app.genWithRef && app.reference ? app.referenceDataUrl() : null;
    const by = { kind: engineId === 'agent' ? 'agent' : 'model', name: artist.getModel?.() || engineId, engine: engineId };
    app.log(`Generate ×${n} with ${engineId} · ${by.name}: “${text}”${image ? ' + reference' : ''}${app.genExercise ? ` · exercise ${app.genExercise}` : ''}`);
    for (let i = 0; i < n && !ctrl.signal.aborted; i++) {
      const t0 = performance.now();
      const setStatus = s => { busy.status = `${i + 1}/${n}: ${s}`; status.textContent = busy.status; };
      try {
        const res = await generateScore({
          complete: args => artist.complete({ ...args, signal: ctrl.signal }),
          prompt: text, exercise: app.genExercise || null,
          width: app.store.doc.artboard.width, height: app.store.doc.artboard.height,
          image, temperature: app.genTemp ?? 0.8, seed: i + 1, by, onStatus: setStatus, plain: plainOn()
        });
        const c = { id: `cand_${Date.now()}_${i}`, prompt: text, engine: engineId, model: by.name, exercise: app.genExercise || null, withRef: Boolean(image), seconds: +((performance.now() - t0) / 1000).toFixed(1), ...res };
        candidates.unshift(c);
        persist();
        app.log(res.error ? `Candidate failed after ${res.attempts} attempt(s): ${res.error}` : `Candidate: ${res.doc.stages.length} stages, ${res.doc.elements.length} elements, ${res.doc.decisions.length} decisions (${c.seconds}s${res.attempts > 1 ? ', repaired' : ''})`, res.error ? 'error' : 'info');
        if (res.doc && i === 0) app.putScoreDoc(res.doc, 'generated');
      } catch (err) {
        app.log(`Generate failed: ${err.message}`, 'error');
        if (ctrl.signal.aborted) break;
      }
      renderList();
    }
    busy = null;
    render();
  };

  app.startGenerate = go;

  const listBox = h('div', { class: 'wb-cands' });
  results.append(hint, status, listBox);
  const renderList = () => {
    hint.hidden = candidates.length > 0;
    listBox.replaceChildren(...candidates.slice(0, 24).map(c => {
      const thumb = c.doc ? renderToCanvas(c.doc, { scale: 110 / Math.max(c.doc.artboard.width, c.doc.artboard.height), mode: 'picture' }) : h('div', { class: 'wb-cand-fail' }, '✕');
      const src = h('pre', { class: 'wb-ref', hidden: true }, c.source || c.raw || '');
      return h('div', { class: 'wb-cand' },
        h('button', { class: 'wb-cand-thumb', title: c.doc ? 'Onto the active board (replaces its marks)' : c.error, onclick: () => c.doc && app.putScoreDoc(structuredClone(c.doc), 'open candidate') }, thumb),
        h('div', { class: 'wb-cand-meta' },
          h('div', { class: 'wb-small' }, c.model),
          h('div', { class: 'wb-muted wb-small' }, c.doc ? `${c.doc.stages.length} stages · ${c.doc.elements.length} el · ${c.seconds}s${c.attempts > 1 ? ' · repaired' : ''}` : `failed: ${c.error}`),
          h('div', { class: 'wb-row' },
            c.doc ? h('button', { class: 'btn-micro', title: 'Save to Assets', html: icon('assets'), onclick: async e => {
              const btn = e.currentTarget;
              await app.saveDocToAssets(c.doc, { tags: [c.engine, String(c.model).split('/').pop(), ...(c.exercise ? [c.exercise] : []), ...(c.withRef ? ['with-reference'] : [])] });
              btn.classList.add('saved');
            } }) : null,
            h('button', { class: 'btn-micro', title: 'Show the score', html: icon('script'), onclick: () => { src.hidden = !src.hidden; } })
          )
        ),
        src
      );
    }));
  };
  app.setGenerateEngine = (v, model) => { useModel(app, v, model); render(); };
  app.on('generate-refresh', render);
  window.addEventListener('ams-model', () => { if (document.body.contains(wrap)) render(); });
  render();
}
