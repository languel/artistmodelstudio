/**
 * Generate: ask an engine (a model, or an agent over MCP) for scores. Each candidate
 * is a recorded process: open it on the canvas, save it to Assets, read its score.
 */
import { h, row, selectField, numberField, section } from '../ui.js';
import { icon } from '../icons.js';
import { generateScore } from '../../process/prompt.js';
import { EXERCISES } from '../../process/exercises.js';
import { renderToCanvas } from '../../process/render.js';

const ENGINES = [
  ['agent', 'Agent (MCP)'], ['openrouter', 'OpenRouter'], ['openai', 'OpenAI-compatible'], ['ollama', 'Ollama (local)'], ['webgpu', 'In-browser (WebGPU)']
];
const MODEL_KEYS = { openrouter: 'ams_openrouter_model', openai: 'ams_openai_model', ollama: 'ams_ollama_model', webgpu: 'ams_webgpu_model' };
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

export function mountGenerate(el, app) {
  let engineId = store('ams_wb_engine') || 'agent';
  let saved = [];
  try { saved = JSON.parse(sessionStorage.getItem('ams_wb_candidates') || '[]'); } catch { /* ignore */ }
  const candidates = app.candidates = app.candidates || saved;
  const persist = () => { try { sessionStorage.setItem('ams_wb_candidates', JSON.stringify(candidates.slice(0, 24))); } catch { /* quota */ } };
  let busy = null;

  const render = () => {
    el.innerHTML = '';
    const artist = app.artists.get(engineId);
    const models = (() => { try { return artist?.getAvailableModels?.() || []; } catch { return []; } })();
    const currentModel = artist?.getModel?.() || '';
    const modelInput = h('input', { class: 'wb-inline', list: 'wb-models', value: currentModel, placeholder: 'model id', title: 'Pick or type a model id' });
    const datalist = h('datalist', { id: 'wb-models' }, ...models.slice(0, 300).map(m => h('option', { value: m.id }, m.name || m.id)));
    modelInput.addEventListener('change', () => {
      artist?.setModel?.(modelInput.value.trim());
      if (MODEL_KEYS[engineId]) store(MODEL_KEYS[engineId], modelInput.value.trim());
      app.log(`Model: ${modelInput.value.trim()} (${engineId})`);
    });
    modelInput.addEventListener('keydown', e => e.stopPropagation());

    const prompt = h('textarea', { class: 'wb-why', rows: 3, placeholder: 'What to draw…' });
    prompt.value = app.genPrompt || '';
    prompt.addEventListener('input', () => { app.genPrompt = prompt.value; });
    prompt.addEventListener('keydown', e => { e.stopPropagation(); if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') go(); });
    const exercise = selectField([['', 'No exercise frame'], ...EXERCISES.map(x => [x.id, x.title])], app.genExercise || '', v => { app.genExercise = v; }, 'Frame the request with an exercise brief');
    const withRef = h('input', { type: 'checkbox', checked: Boolean(app.genWithRef && app.reference), disabled: !app.reference, title: app.reference ? `Send the reference (${app.reference.title})` : 'No reference: open an image asset first' });
    withRef.addEventListener('change', () => { app.genWithRef = withRef.checked; });
    const count = numberField({ value: app.genCount || 1, min: 1, max: 8, step: 1, def: 1, title: 'Candidates', onChange: v => { app.genCount = v; } });
    const temp = numberField({ value: app.genTemp ?? 0.8, min: 0, max: 2, step: 0.05, def: 0.8, title: 'Temperature', onChange: v => { app.genTemp = v; } });
    const status = h('div', { class: 'wb-script-out' }, busy ? busy.status : (engineId === 'agent' ? 'Agent engine: requests wait until an agent answers over MCP (ams_pending → ams_answer).' : ''));

    const go = async () => {
      if (busy) return;
      const text = prompt.value.trim();
      if (!text) { prompt.focus(); return; }
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
            image, temperature: app.genTemp ?? 0.8, seed: i + 1, by, onStatus: setStatus
          });
          const c = { id: `cand_${Date.now()}_${i}`, prompt: text, engine: engineId, model: by.name, exercise: app.genExercise || null, withRef: Boolean(image), seconds: +((performance.now() - t0) / 1000).toFixed(1), ...res };
          candidates.unshift(c);
          persist();
          app.log(res.error ? `Candidate failed after ${res.attempts} attempt(s): ${res.error}` : `Candidate: ${res.doc.stages.length} stages, ${res.doc.elements.length} elements, ${res.doc.decisions.length} decisions (${c.seconds}s${res.attempts > 1 ? ', repaired' : ''})`, res.error ? 'error' : 'info');
          if (res.doc && i === 0) app.loadDocument(res.doc, 'generated');
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
    el.append(
      row('Engine', selectField(ENGINES, engineId, v => { engineId = v; store('ams_wb_engine', v); render(); })),
      row('Model', h('div', { style: { display: 'flex', flex: 1, gap: '4px' } }, modelInput, datalist)),
      keys(engineId, app) || '',
      prompt,
      row('Exercise', exercise),
      h('div', { class: 'wb-row wb-row-actions' },
        h('label', { class: 'wb-row', title: 'Send the reference image (vision models, agents)' }, withRef, h('span', {}, 'Reference')),
        h('span', { class: 'wb-muted' }, '×'), count,
        h('span', { class: 'wb-muted' }, 'temp'), temp,
        busy
          ? h('button', { class: 'wb-btn', onclick: () => { busy.ctrl.abort(); app.artists.get('agent')?.answer?.(''); } }, 'Stop')
          : h('button', { class: 'wb-btn primary', html: `${icon('sparkles')}<span>Generate</span>`, title: 'Cmd+Enter', onclick: go })
      ),
      status,
      listBox
    );
    for (const n of [...el.childNodes]) if (n.nodeType === 3 && n.textContent === 'null') n.remove();
    renderList();
  };

  const listBox = h('div', { class: 'wb-cands' });
  const renderList = () => {
    listBox.replaceChildren(...candidates.slice(0, 24).map(c => {
      const thumb = c.doc ? renderToCanvas(c.doc, { scale: 110 / Math.max(c.doc.artboard.width, c.doc.artboard.height), mode: 'picture' }) : h('div', { class: 'wb-cand-fail' }, '✕');
      const src = h('pre', { class: 'wb-ref', hidden: true }, c.source || c.raw || '');
      return h('div', { class: 'wb-cand' },
        h('button', { class: 'wb-cand-thumb', title: c.doc ? 'Open on the canvas' : c.error, onclick: () => c.doc && app.loadDocument(structuredClone(c.doc), 'open candidate') }, thumb),
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
  app.setGenerateEngine = (v, model) => {
    engineId = v; store('ams_wb_engine', v);
    if (model) { app.artists.get(v)?.setModel?.(model); if (MODEL_KEYS[v]) store(MODEL_KEYS[v], model); }
    render();
  };
  app.on('generate-refresh', render);
  render();
}

function keys(engineId, app) {
  const field = (label, key, type = 'password', placeholder = '') => {
    const input = h('input', { class: 'wb-inline', type, placeholder, value: store(key) || '', autocomplete: 'off' });
    input.addEventListener('change', () => { store(key, input.value.trim()); app.log(`${label} updated.`); });
    input.addEventListener('keydown', e => e.stopPropagation());
    return row(label, input);
  };
  if (engineId === 'openrouter') return section('Keys', false, field('API key', 'ams_openrouter_key'));
  if (engineId === 'openai') return section('Keys', false, field('API key', 'ams_openai_key'), field('Base URL', 'ams_openai_base_url', 'text', 'https://api.openai.com/v1'));
  if (engineId === 'ollama') return section('Server', false, field('Endpoint', 'ams_ollama_endpoint', 'text', 'http://localhost:11434'));
  return null;
}
