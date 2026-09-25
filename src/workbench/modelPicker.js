/**
 * Engine + model picker shared by Generate and the Assistant.
 * Loads the live model list per engine (OpenRouter catalog, installed Ollama models,
 * WebGPU presets), offers a custom id, and shows whether the engine is ready.
 */
import { h } from './ui.js';
import { icon } from './icons.js';

export const ENGINES = [
  ['ollama', 'Ollama (local)'], ['webgpu', 'In-browser (WebGPU)'], ['openrouter', 'OpenRouter'],
  ['openai', 'OpenAI-compatible'], ['agent', 'Agent (MCP)']
];
export const MODEL_KEYS = { openrouter: 'ams_openrouter_model', openai: 'ams_openai_model', ollama: 'ams_ollama_model', webgpu: 'ams_webgpu_model' };
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

async function loadModels(engineId, artist) {
  if (engineId === 'ollama') {
    const list = await artist.fetchAvailableModels?.();
    return { ready: list.length > 0, status: list.length ? `${list.length} installed` : `not reachable at ${artist.endpoint}`, groups: [['Installed', list.map(id => ({ id, name: id }))]] };
  }
  if (engineId === 'openrouter') {
    const key = ls('ams_openrouter_key');
    let list = [];
    try { list = await artist.fetchModels?.(); } catch { list = artist.getAvailableModels?.() || []; }
    const free = list.filter(m => /:free$/.test(m.id) || m.isFree);
    const vision = m => (m.architecture?.input_modalities || m.inputModalities || []).includes('image');
    const fav = new Set(artist.getFavorites?.() || []);
    const label = m => `${m.name || m.id}${vision(m) ? '  · image' : ''}`;
    return {
      ready: Boolean(key), status: key ? `${list.length} models` : 'API key missing (Keys below)',
      groups: [
        ['Favorites', list.filter(m => fav.has(m.id)).map(m => ({ id: m.id, name: label(m) }))],
        ['Free', free.map(m => ({ id: m.id, name: label(m) }))],
        ['All', list.filter(m => !free.includes(m)).map(m => ({ id: m.id, name: label(m) }))]
      ]
    };
  }
  if (engineId === 'webgpu') {
    const models = artist.getAvailableModels?.() || [];
    return { ready: Boolean(navigator.gpu), status: navigator.gpu ? 'WebGPU available' : 'WebGPU unavailable in this browser', groups: [['Presets', models.map(m => ({ id: m.id, name: `${m.name || m.id}${m.isVL ? '  · image' : ''}` }))]] };
  }
  if (engineId === 'openai') {
    const key = ls('ams_openai_key');
    return { ready: true, status: key ? 'key set' : 'no key (fine for local servers)', groups: [['Presets', (artist.getAvailableModels?.() || []).map(m => ({ id: m.id, name: m.name || m.id }))]] };
  }
  return { ready: true, status: 'answers arrive over MCP (ams_pending → ams_answer)', groups: [] };
}

/**
 * @returns {HTMLElement} engine row + model row + status line
 * onChange({ engine, model }) fires when either changes.
 */
export function modelPicker({ app, engine, storageKey = 'ams_wb_engine', onChange }) {
  let engineId = engine || ls(storageKey) || 'ollama';
  const box = h('div', { class: 'wb-picker' });
  const engineSel = h('select', { class: 'wb-select', title: 'Engine' }, ...ENGINES.map(([v, l]) => h('option', { value: v, selected: v === engineId }, l)));
  const modelSel = h('select', { class: 'wb-select', title: 'Model' });
  const custom = h('input', { class: 'wb-inline', placeholder: 'custom model id', hidden: true });
  const status = h('div', { class: 'wb-picker-status wb-small' });
  const refresh = h('button', { class: 'wb-icon-btn', title: 'Reload the model list', html: icon('redo') });

  const current = () => app.artists.get(engineId)?.getModel?.() || '';
  const setModel = id => {
    const artist = app.artists.get(engineId);
    artist?.setModel?.(id);
    if (MODEL_KEYS[engineId]) ls(MODEL_KEYS[engineId], id);
    onChange?.({ engine: engineId, model: id });
  };

  const fill = async () => {
    const artist = app.artists.get(engineId);
    status.textContent = 'loading…';
    status.className = 'wb-picker-status wb-small';
    modelSel.innerHTML = '';
    const { ready, status: text, groups } = await loadModels(engineId, artist);
    status.textContent = text;
    status.classList.add(ready ? 'ok' : 'warn');
    const cur = current();
    let found = false;
    for (const [label, items] of groups) {
      if (!items.length) continue;
      const og = h('optgroup', { label });
      for (const m of items.slice(0, 400)) { og.append(h('option', { value: m.id, selected: m.id === cur }, m.name)); if (m.id === cur) found = true; }
      modelSel.append(og);
    }
    if (engineId === 'agent') modelSel.append(h('option', { value: cur || 'external-agent' }, cur || 'external agent'));
    if (cur && !found && engineId !== 'agent') modelSel.prepend(h('option', { value: cur, selected: true }, `${cur} (current)`));
    modelSel.append(h('option', { value: '__custom' }, 'Custom…'));
    custom.hidden = true;
    modelSel.disabled = false;
  };

  engineSel.addEventListener('change', () => { engineId = engineSel.value; ls(storageKey, engineId); onChange?.({ engine: engineId, model: current() }); fill(); });
  modelSel.addEventListener('change', () => {
    if (modelSel.value === '__custom') { custom.hidden = false; custom.value = current(); custom.focus(); return; }
    setModel(modelSel.value);
  });
  custom.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { setModel(custom.value.trim()); fill(); } });
  custom.addEventListener('change', () => { if (custom.value.trim()) setModel(custom.value.trim()); });
  refresh.addEventListener('click', () => { if (engineId === 'openrouter') app.artists.get('openrouter')?.fetchModels?.(true).then(fill); else fill(); });

  box.append(
    h('label', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }, 'Engine'), engineSel),
    h('label', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }, 'Model'), modelSel, refresh),
    custom,
    h('div', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }), status)
  );
  box.engine = () => engineId;
  box.setEngine = (id, model) => { engineId = id; engineSel.value = id; ls(storageKey, id); if (model) setModel(model); fill(); };
  fill();
  return box;
}
