/**
 * Engine + model picker shared by Generate and the Assistant.
 * Loads the live model list per engine (OpenRouter catalog, installed Ollama models,
 * WebGPU presets), offers a custom id, and shows whether the engine is ready.
 */
import { h } from './ui.js';
import { icon } from './icons.js';
import { favorites, toggleFavorite, isFavorite } from './modelStore.js';

export const ENGINES = [
  ['ollama', 'Ollama (local)'], ['lfm3', 'LFM3-Omni (this browser)'], ['webgpu', 'In-browser (WebGPU)'], ['openrouter', 'OpenRouter'],
  ['openai', 'OpenAI-compatible'], ['pratt', 'Pratt Institute'], ['nim', 'NVIDIA NIM'], ['github', 'GitHub Models'], ['agent', 'Agent (MCP)']
];
export const MODEL_KEYS = { openrouter: 'ams_openrouter_model', openai: 'ams_openai_model', pratt: 'ams_pratt_model', nim: 'ams_nim_model', github: 'ams_github_model', ollama: 'ams_ollama_model', webgpu: 'ams_webgpu_model', lfm3: 'ams_lfm3_model' };
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

/** An engine's models in groups (Favorites first, whatever the engine), with whether it is ready and why not. */
export async function loadModels(engineId, artist) {
  const r = await loadEngineModels(engineId, artist);
  if (engineId !== 'openrouter') {   // (OpenRouter builds its own Favorites group)
    const fav = new Set(favorites(engineId, artist)), favItems = r.groups.flatMap(([, l]) => l).filter(m => fav.has(m.id));
    if (favItems.length) r.groups = [['Favorites', favItems], ...r.groups.map(([n, l]) => [n, l.filter(m => !fav.has(m.id))])];
  }
  return r;
}

async function loadEngineModels(engineId, artist) {
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
    const fav = new Set(favorites('openrouter', artist));
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
  if (engineId === 'lfm3') {
    const gpu = Boolean(navigator.gpu), models = artist.getAvailableModels?.() || [];
    return { ready: gpu, status: !gpu ? 'WebGPU unavailable in this browser' : artist.ready ? 'loaded' : 'not loaded yet: the first use downloads the model (kept by the browser)', groups: [['Models', models.map(m => ({ id: m.id, name: m.name || m.id }))]] };
  }
  if (engineId === 'webgpu') {
    const models = artist.getAvailableModels?.() || [];
    return { ready: Boolean(navigator.gpu), status: navigator.gpu ? 'WebGPU available' : 'WebGPU unavailable in this browser', groups: [['Presets', models.map(m => ({ id: m.id, name: `${m.name || m.id}${m.isVL ? '  · image' : ''}` }))]] };
  }
  if (['pratt', 'nim', 'github'].includes(engineId)) {   // (hosted providers: their own list, the presets if it cannot be had)
    let list, why = '';
    try { list = await artist.fetchModels(); } catch (err) { why = err.message; }
    const env = globalThis.__amsLlmEnv?.[engineId], key = ls(`ams_${engineId}_key`);
    const have = list?.length ? list : (artist.getAvailableModels?.() || []);
    return { ready: !why, status: why ? `${why}${key || env ? '' : ' (no key: paste one in Keys below, or set it in the dev server environment)'}` : `${have.length} models · ${key ? 'your key' : env ? 'key from the dev server environment' : 'no key'}`, groups: [['Models', have.map(m => ({ id: m.id, name: m.name || m.id }))]] };
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
  const star = h('button', { class: 'wb-icon-btn', title: 'Favorite this model', html: '☆' });
  const paintStar = () => { const on = isFavorite(engineId, current(), app.artists.get(engineId)); star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on); star.title = on ? 'Remove from favorites' : 'Favorite this model'; };

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
    paintStar();
  };

  engineSel.addEventListener('change', () => { engineId = engineSel.value; ls(storageKey, engineId); onChange?.({ engine: engineId, model: current() }); fill(); });
  modelSel.addEventListener('change', () => {
    if (modelSel.value === '__custom') { custom.hidden = false; custom.value = current(); custom.focus(); return; }
    setModel(modelSel.value);
  });
  custom.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { setModel(custom.value.trim()); fill(); } });
  custom.addEventListener('change', () => { if (custom.value.trim()) setModel(custom.value.trim()); });
  star.addEventListener('click', () => { toggleFavorite(engineId, current(), app.artists.get(engineId)); fill(); });
  refresh.addEventListener('click', () => { if (engineId === 'openrouter') app.artists.get('openrouter')?.fetchModels?.(true).then(fill); else fill(); });

  box.append(
    h('label', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }, 'Engine'), engineSel),
    h('label', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }, 'Model'), modelSel, star, refresh),
    custom,
    h('div', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }), status)
  );
  box.engine = () => engineId;
  box.setEngine = (id, model) => { engineId = id; engineSel.value = id; ls(storageKey, id); if (model) setModel(model); fill(); };
  fill();
  return box;
}
