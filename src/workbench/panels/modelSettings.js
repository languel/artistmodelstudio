/**
 * Settings → Model: which engine and model the assistant uses, how to reach it, the favorites, and how it asks.
 * What shows depends on the engine (an Ollama endpoint, an API key, WebGPU's device). The model is one field that is
 * also the search: focus it, type to narrow the list, pick one; ★ marks favorites. Changing the engine, the endpoint
 * or the key tests the connection by itself and the status line says what it found. Built once and kept, so the list
 * is not fetched again each time Settings redraws.
 */
import { h, row, selectField, numberField, section } from '../ui.js';
import { icon } from '../icons.js';
import { ENGINES, loadModels } from '../modelPicker.js';
import { ENGINE_FIELDS, ENGINE_NAMES, currentEngine, setEngine, useModel, favorites, isFavorite, toggleFavorite, filterModels, assistantSettings, setAssistantSettings } from '../modelStore.js';

const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

export function modelSection(app) {
  const box = section('Model', true);
  let engine = currentEngine(), tag = '', favOnly = false;   // tag: '' | 'free' | 'image' (OpenRouter)
  const body = h('div', { class: 'wb-model-body' });
  box.append(body);

  const build = () => {
    const artist = app.artists.get(engine);
    let info = { ready: false, status: '', groups: [] }, query = '', active = -1, shown = [];
    const status = h('div', { class: 'wb-picker-status wb-small' }, 'checking…');
    const input = h('input', { class: 'wb-inline wb-combo-input', type: 'text', placeholder: 'Search models', autocomplete: 'off', spellcheck: false });
    const list = h('div', { class: 'wb-combo-list', hidden: true });
    const star = h('button', { class: 'wb-icon-btn wb-boxed', title: 'Favorite this model', html: '☆' });
    const reload = h('button', { class: 'wb-icon-btn wb-boxed', title: 'Reload the model list and test the connection', html: icon('redo'), onclick: () => refresh(true) });
    const favChk = h('input', { type: 'checkbox', checked: favOnly });
    const current = () => artist?.getModel?.() || '';
    const nameOf = id => info.groups.flatMap(([, l]) => l).find(m => m.id === id)?.name || id;
    const showCurrent = () => { input.value = current() ? nameOf(current()) : ''; };

    const paint = () => {
      const cur = current(), favs = favorites(engine, artist), all = info.groups.flatMap(([, l]) => l);
      shown = filterModels(all, { query, favorites: favs, favoritesOnly: favOnly });
      if (engine === 'openrouter' && tag) shown = shown.filter(m => (tag === 'free' ? /:free$/.test(m.id) : /· image/.test(m.name)));
      shown = [...shown.filter(m => favs.includes(m.id)), ...shown.filter(m => !favs.includes(m.id))].slice(0, 300);
      active = Math.min(active, shown.length - 1);
      list.replaceChildren(
        h('label', { class: 'wb-combo-head', title: 'Only favorites', onmousedown: e => e.preventDefault() }, favChk, h('span', {}, 'Favorites only')),
        ...(shown.length ? shown.map((m, i) => h('div', { class: `wb-combo-item${m.id === cur ? ' current' : ''}${i === active ? ' active' : ''}`, onmousedown: e => { e.preventDefault(); pick(m.id); } },
          h('span', { class: 'wb-combo-name' }, m.name),
          h('button', { class: `wb-combo-star${favs.includes(m.id) ? ' on' : ''}`, title: favs.includes(m.id) ? 'Remove from favorites' : 'Favorite', onmousedown: e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(engine, m.id, artist); paint(); } }, favs.includes(m.id) ? '★' : '☆'))) : [h('div', { class: 'wb-combo-none' }, all.length ? 'No model matches.' : 'No models.')]));
      const on = isFavorite(engine, cur, artist);
      star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on); star.title = on ? 'Remove from favorites' : 'Favorite this model';
      status.className = `wb-picker-status wb-small ${info.ready ? 'ok' : 'warn'}`;
      status.textContent = `${info.status}${all.length ? ` · ${query || favOnly || tag ? `showing ${shown.length} of ${all.length}` : `${all.length} models`} · ${favs.length} favorite${favs.length === 1 ? '' : 's'}` : ''}`;
    };
    const pick = id => { useModel(app, engine, id); query = ''; list.hidden = true; showCurrent(); input.blur(); paint(); };
    const refresh = async (force = false) => {
      status.className = 'wb-picker-status wb-small'; status.textContent = 'checking…';
      if (force && engine === 'openrouter') { try { await artist?.fetchModels?.(true); } catch { /* the list below says */ } }
      info = await loadModels(engine, artist).catch(err => ({ ready: false, status: err.message, groups: [] }));
      showCurrent(); paint();
    };

    input.addEventListener('focus', () => { query = ''; input.select(); list.hidden = false; paint(); });
    input.addEventListener('blur', () => { list.hidden = true; query = ''; showCurrent(); });
    input.addEventListener('input', () => { query = input.value; active = shown.length ? 0 : -1; list.hidden = false; paint(); });
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))); paint(); list.querySelector('.active')?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); const m = shown[Math.max(active, 0)]; if (m) pick(m.id); else if (input.value.trim() && engine !== 'agent') pick(input.value.trim()); }   // (a typed id that is not in the list is used as it is)
      else if (e.key === 'Escape') { e.preventDefault(); input.blur(); }
    });
    star.addEventListener('click', () => { toggleFavorite(engine, current(), artist); paint(); });
    favChk.addEventListener('change', () => { favOnly = favChk.checked; paint(); });

    const fields = (ENGINE_FIELDS[engine] || []).map(([label, key, type, ph]) => {
      const f = h('input', { class: 'wb-inline', type, placeholder: ph, value: ls(key) || '', autocomplete: 'off' });
      f.addEventListener('change', () => { ls(key, f.value.trim()); if (engine === 'ollama' && artist) artist.endpoint = f.value.trim() || ph; refresh(true); });   // testing follows the change
      f.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') f.blur(); });
      return row(label, f);
    });
    const a = assistantSettings();
    body.replaceChildren(
      row('Engine', selectField(ENGINES.filter(([id]) => id in ENGINE_NAMES), engine, v => { engine = v; tag = ''; favOnly = false; setEngine(v); build(); }, 'What the assistant talks to')),
      ...fields,
      engine === 'webgpu' ? h('div', { class: 'wb-row wb-small wb-muted wb-model-note' }, 'Runs in this browser on your GPU; the first use downloads the model.') : null,
      engine === 'agent' ? h('div', { class: 'wb-row wb-small wb-muted wb-model-note' }, 'An external agent answers over MCP (ams_pending → ams_answer); there is no model to pick.') : null,
      engine !== 'agent' ? row('Model', h('span', { class: 'wb-model-ctl' }, h('span', { class: 'wb-combo' }, input, list), star, reload)) : null,
      engine === 'openrouter' ? row('Show', selectField([['', 'All'], ['free', 'Free'], ['image', 'Image input']], tag, v => { tag = v; paint(); }, 'Narrow the OpenRouter list')) : null,
      h('div', { class: 'wb-row wb-model-status' }, h('span', { class: 'wb-row-label' }), status),
      h('div', { class: 'wb-sub' }, 'Asking'),
      row('Temperature', numberField({ value: a.temperature, min: 0, max: 2, step: 0.05, def: 0.4, title: 'Lower: steadier. Higher: more varied', onChange: v => setAssistantSettings({ temperature: v }) })),
      row('Steps', numberField({ value: a.rounds, min: 1, max: 12, step: 1, def: 6, title: 'How many times it may act, look at the results and act again for one message', onChange: v => setAssistantSettings({ rounds: Math.round(v) }) })),
      row('Remember', numberField({ value: a.history, min: 2, max: 40, step: 1, def: 12, title: 'How many earlier messages go back to the model each time', onChange: v => setAssistantSettings({ history: Math.round(v) }) })),
      row('Studio tools', (() => { const c = h('input', { type: 'checkbox', checked: a.tools, title: 'Let it draw and change the studio through its tools. Off: it only talks' }); c.addEventListener('change', () => setAssistantSettings({ tools: c.checked })); return c; })())
    );
    showCurrent();
    refresh();
  };
  build();
  window.addEventListener('ams-model', () => { if (currentEngine() !== engine && document.body.contains(box)) { engine = currentEngine(); build(); } });
  return box;
}
