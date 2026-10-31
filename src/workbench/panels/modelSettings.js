/**
 * Settings → Model: which engine and model the assistant uses, how to reach it, the favorites, and how it asks.
 * What shows depends on the engine (an Ollama endpoint, an API key, WebGPU's device); the model list can be filtered
 * and narrowed to favorites. Built once and kept, so the model list is not fetched again each time Settings redraws.
 */
import { h, row, selectField, numberField, section } from '../ui.js';
import { ENGINES, loadModels } from '../modelPicker.js';
import { ENGINE_FIELDS, ENGINE_NAMES, currentEngine, setEngine, useModel, favorites, isFavorite, toggleFavorite, filterModels, assistantSettings, setAssistantSettings } from '../modelStore.js';

const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

export function modelSection(app) {
  const box = section('Model', true);
  let engine = currentEngine(), query = '', favOnly = false, tag = '';   // tag: '' | 'free' | 'image' (OpenRouter)
  const body = h('div', { class: 'wb-model-body' });
  box.append(body);
  const artistOf = () => app.artists.get(engine);

  const build = async () => {
    const artist = artistOf();
    const fields = (ENGINE_FIELDS[engine] || []).map(([label, key, type, ph]) => {
      const input = h('input', { class: 'wb-inline', type, placeholder: ph, value: ls(key) || '', autocomplete: 'off' });
      input.addEventListener('change', () => { ls(key, input.value.trim()); if (engine === 'ollama' && artist) artist.endpoint = input.value.trim() || ph; });
      input.addEventListener('keydown', e => e.stopPropagation());
      return row(label, input);
    });
    const status = h('div', { class: 'wb-picker-status wb-small' }, 'loading…');
    const modelSel = h('select', { class: 'wb-select', title: 'The model new requests use' });
    const star = h('button', { class: 'wb-icon-btn', title: 'Favorite this model', html: '☆' });
    const filterIn = h('input', { class: 'wb-inline', type: 'search', placeholder: 'Search models', value: query });
    filterIn.addEventListener('keydown', e => e.stopPropagation());
    const favChk = h('input', { type: 'checkbox', checked: favOnly, title: 'Only favorites' });
    let info = { ready: false, status: '', groups: [] };

    const paint = () => {
      const cur = artist?.getModel?.() || '', favs = favorites(engine, artist);
      const all = info.groups.flatMap(([, l]) => l);
      let shown = filterModels(all, { query, favorites: favs, favoritesOnly: favOnly });
      if (engine === 'openrouter' && tag) shown = shown.filter(m => (tag === 'free' ? /:free$/.test(m.id) : /· image/.test(m.name)));
      const ids = new Set(shown.map(m => m.id));
      modelSel.replaceChildren();
      const fav = shown.filter(m => favs.includes(m.id));
      if (fav.length) { const og = h('optgroup', { label: 'Favorites' }); fav.forEach(m => og.append(h('option', { value: m.id, selected: m.id === cur }, m.name))); modelSel.append(og); }
      const rest = shown.filter(m => !favs.includes(m.id)).slice(0, 400);
      if (rest.length) { const og = h('optgroup', { label: fav.length ? 'Others' : 'Models' }); rest.forEach(m => og.append(h('option', { value: m.id, selected: m.id === cur }, m.name))); modelSel.append(og); }
      if (cur && !ids.has(cur)) modelSel.prepend(h('option', { value: cur, selected: true }, `${cur} (current)`));
      if (!modelSel.options.length) modelSel.append(h('option', { value: '' }, engine === 'agent' ? 'answers arrive over MCP' : 'no models'));
      const on = isFavorite(engine, cur, artist);
      star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on); star.title = on ? 'Remove from favorites' : 'Favorite this model';
      status.className = `wb-picker-status wb-small ${info.ready ? 'ok' : 'warn'}`;
      status.textContent = `${info.status}${all.length ? ` · showing ${shown.length} of ${all.length} · ${favs.length} favorite${favs.length === 1 ? '' : 's'}` : ''}`;
    };
    const refresh = async (force = false) => {
      status.className = 'wb-picker-status wb-small'; status.textContent = 'checking…';
      if (force && engine === 'openrouter') { try { await artist?.fetchModels?.(true); } catch { /* the list below says */ } }
      info = await loadModels(engine, artist).catch(err => ({ ready: false, status: err.message, groups: [] }));
      paint();
    };
    modelSel.addEventListener('change', () => { if (modelSel.value) useModel(app, engine, modelSel.value); paint(); });
    star.addEventListener('click', () => { toggleFavorite(engine, artist?.getModel?.(), artist); paint(); });
    filterIn.addEventListener('input', () => { query = filterIn.value; paint(); });
    favChk.addEventListener('change', () => { favOnly = favChk.checked; paint(); });

    const chips = engine === 'openrouter' ? row('Show', selectField([['', 'All'], ['free', 'Free'], ['image', 'Image input']], tag, v => { tag = v; paint(); }, 'Narrow the OpenRouter list')) : null;
    const a = assistantSettings();
    body.replaceChildren(
      row('Engine', selectField(ENGINES.filter(([id]) => id in ENGINE_NAMES), engine, v => { engine = v; setEngine(v); query = ''; build(); }, 'What the assistant talks to')),
      ...fields,
      engine === 'webgpu' ? h('div', { class: 'wb-row wb-small wb-muted' }, 'Runs in this browser on your GPU; the first use downloads the model.') : null,
      engine === 'agent' ? h('div', { class: 'wb-row wb-small wb-muted' }, 'An external agent answers over MCP (ams_pending → ams_answer); there is no model to pick.') : null,
      engine !== 'agent' ? row('Active model', h('span', { class: 'wb-row-inline' }, modelSel, star)) : null,
      engine !== 'agent' ? row('Filter', h('span', { class: 'wb-row-inline' }, filterIn, h('label', { class: 'wb-row-inline', title: 'Only favorites' }, favChk, '★'))) : null,
      chips,
      h('div', { class: 'wb-row wb-row-actions' }, h('button', { class: 'wb-btn', title: 'Reload the model list and check the engine is reachable', onclick: () => refresh(true) }, 'Save & test')),
      h('div', { class: 'wb-row' }, h('span', { class: 'wb-row-label' }), status),
      h('div', { class: 'wb-sub' }, 'Asking'),
      row('Temperature', numberField({ value: a.temperature, min: 0, max: 2, step: 0.05, def: 0.4, title: 'Lower: steadier. Higher: more varied', onChange: v => setAssistantSettings({ temperature: v }) })),
      row('Steps', numberField({ value: a.rounds, min: 1, max: 12, step: 1, def: 6, title: 'How many times it may act, look at the results and act again for one message', onChange: v => setAssistantSettings({ rounds: Math.round(v) }) })),
      row('Remember', numberField({ value: a.history, min: 2, max: 40, step: 1, def: 12, title: 'How many earlier messages go back to the model each time', onChange: v => setAssistantSettings({ history: Math.round(v) }) })),
      row('Studio tools', (() => { const c = h('input', { type: 'checkbox', checked: a.tools, title: 'Let it draw and change the studio through its tools. Off: it only talks' }); c.addEventListener('change', () => setAssistantSettings({ tools: c.checked })); return c; })())
    );
    refresh();
  };
  build();
  window.addEventListener('ams-model', e => { if (currentEngine() !== engine && document.body.contains(box)) { engine = currentEngine(); build(); } });
  return box;
}
