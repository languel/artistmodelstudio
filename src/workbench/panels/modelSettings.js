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
import { voiceSettings, setVoice, LANGUAGES, GENDERS } from '../voiceOut.js';
import { ENGINE_FIELDS, ENGINE_NAMES, currentEngine, setEngine, useModel, favorites, isFavorite, toggleFavorite, filterModels, assistantSettings, setAssistantSettings, FALLBACK_TEMPERATURE, codeTarget, setCodeTarget } from '../modelStore.js';

const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

export function modelSection(app) {
  const box = section('Model', true);
  let engine = currentEngine(), tag = '', favOnly = false;   // tag: '' | 'free' | 'image' (OpenRouter)
  const body = h('div', { class: 'wb-model-body' });
  box.append(body);

  let builtModel = '';
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
    // LFM3 runs here, so Settings is where it is fetched and tried: load (with the progress), then a test that asks it something and one that has it speak.
    const lfmControls = () => {
      const bar = h('span', { class: 'wb-lfm-bar' }, h('span', {})), note = h('div', { class: 'wb-small wb-muted wb-lfm-note' });
      const load = h('button', { class: 'wb-btn', type: 'button' }), test = h('button', { class: 'wb-btn', type: 'button', title: 'Ask it one short question and time the answer' }, 'Test'), hear = h('button', { class: 'wb-btn', type: 'button', title: 'Have it say a sentence aloud' }, 'Hear it');
      const fill = f => { bar.firstChild.style.width = `${Math.round((f ?? 0) * 100)}%`; bar.classList.toggle('on', f != null && f < 1); };
      const paint = () => {
        const ready = artist.ready, was = ls('ams_lfm3_loaded') === '1';
        load.textContent = ready ? 'Loaded' : was ? 'Load' : 'Download (1.6 GB)'; load.disabled = ready;
        load.title = ready ? 'The model is loaded in this page' : was ? 'Load the model from this browser\'s copy' : 'Fetch the model once (about 1.6 GB); the browser keeps it';
        test.disabled = hear.disabled = !ready; fill(ready ? 1 : null);
        note.textContent = ready ? `Ready${artist.deviceInfo?.description ? ` on ${artist.deviceInfo.description}` : ''}.` : was ? 'Not loaded in this page yet.' : 'Not downloaded yet.';
      };
      load.onclick = async () => {
        load.disabled = true; note.className = 'wb-small wb-muted wb-lfm-note';
        try { await artist.ensureLoaded((text, f) => { note.textContent = text; fill(f); }); ls('ams_lfm3_loaded', '1'); paint(); refresh(); }
        catch (err) { load.disabled = false; fill(null); note.textContent = err.message; note.classList.add('error'); }
      };
      test.onclick = async () => {
        test.disabled = true; note.className = 'wb-small wb-muted wb-lfm-note'; note.textContent = 'Asking…';
        const t0 = performance.now();
        try { const r = await artist.complete({ system: 'Answer in one short sentence.', user: 'What is a drawing program for?' }); note.textContent = `✓ “${r.slice(0, 120)}” in ${Math.round(performance.now() - t0)} ms`; }
        catch (err) { note.textContent = `✗ ${err.message}`; note.classList.add('error'); }
        test.disabled = false;
      };
      hear.onclick = async () => {
        hear.disabled = true; note.className = 'wb-small wb-muted wb-lfm-note'; note.textContent = 'Speaking…';
        const t0 = performance.now();
        try {
          const v = voiceSettings(), { samples, rate } = await artist.speak('Hello, this is the studio. I can talk now.', { language: v.language, gender: v.gender });
          const ctx = new (window.AudioContext || window.webkitAudioContext)(), buf = ctx.createBuffer(1, samples.length, rate); buf.copyToChannel(samples, 0);
          const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
          note.textContent = `✓ ${(samples.length / rate).toFixed(1)} s of speech made in ${Math.round(performance.now() - t0)} ms`;
          src.onended = () => ctx.close();
        } catch (err) { note.textContent = `✗ ${err.message}`; note.classList.add('error'); }
        hear.disabled = false;
      };
      paint();
      return h('div', { class: 'wb-row wb-lfm' }, h('span', { class: 'wb-row-label' }), h('div', { class: 'wb-lfm-ctl' }, h('div', { class: 'wb-lfm-buttons' }, load, test, hear), bar, note));
    };
    // The Code model: which engine and model write board code (a program, not a conversation). Bigger is better here: a 9B coder
    // reproduced the lessons 14/14, a 2B model 9/14. Unset, the assistant's own model writes it.
    const codeRows = () => {
      const ct = codeTarget(), picks = ENGINES.filter(([id]) => id in ENGINE_NAMES && id !== 'agent');
      const art = ct ? app.artists.get(ct.engine) : null;
      const listId = 'wb-code-models';
      const models = h('datalist', { id: listId }, ...(art?.getAvailableModels?.() || []).map(m => h('option', { value: m.id }, m.name || m.id)));
      if (ct?.engine === 'ollama') art.fetchAvailableModels?.().then(l => { if (l.length && models.isConnected) models.replaceChildren(...l.map(id => h('option', { value: id }))); }).catch(() => {});
      const modelIn = ct ? h('input', { class: 'wb-inline', type: 'text', value: ct.model, list: listId, spellcheck: false, autocomplete: 'off', title: 'The model that writes code (pick from the list, or type its id)' }) : null;
      modelIn?.addEventListener('change', () => { if (modelIn.value.trim()) setCodeTarget(ct.engine, modelIn.value.trim()); });
      modelIn?.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') modelIn.blur(); });
      return [
        h('div', { class: 'wb-sub', title: 'Writing a program is harder than talking or drawing, and model size shows: a 9B coder reproduced the lessons 14 of 14, a 2B model 9 of 14. Pick a bigger model here for code; the assistant keeps its quick one for the rest. Unset, the assistant\'s own model writes code.' }, 'Code model'),
        row('Engine', selectField([['', 'Same as the assistant'], ...picks], ct?.engine || '', v => { setCodeTarget(v, v ? (app.artists.get(v)?.getModel?.() || '') : ''); build(); }, 'Which engine writes board code')),
        ...(ct ? [row('Model', h('span', { class: 'wb-model-ctl' }, modelIn, models))] : [])
      ];
    };
    const a = assistantSettings();
    // Temperature: unset means the model's own (Ollama reads it from the model), shown here as what it is; ↺ goes back to that.
    const modelNow = builtModel = artist?.getModel?.() || '';
    artist._recFor ||= {};   // (per model: what its maker recommends, once asked)
    if (artist?.recommended && !(modelNow in artist._recFor)) { artist._recFor[modelNow] = null; artist.recommended(modelNow).then(r => { artist._recFor[modelNow] = r; if (document.body.contains(box)) build(); }); }
    const rec = artist?._recFor?.[modelNow] || null;
    const others = rec ? Object.entries(rec).filter(([k]) => k !== 'temperature').map(([k, v]) => `${k} ${v}`).join(', ') : '';
    const tempField = (key, kind, title) => {
      const own = rec?.temperature, shown = a[key] ?? own ?? FALLBACK_TEMPERATURE[kind];
      const f = numberField({ value: shown, min: 0, max: 2, step: 0.05, def: own ?? FALLBACK_TEMPERATURE[kind], title: `${title}${own != null ? `. This model recommends ${own}` : ''}${others ? `. Its other settings (applied by Ollama): ${others}` : ''}`, onChange: v => { setAssistantSettings({ [key]: v }); reset.hidden = false; } });
      const reset = h('button', { class: 'wb-icon-btn', type: 'button', title: own != null ? `Use the model's own setting (${own})` : `Use the default (${FALLBACK_TEMPERATURE[kind]})`, hidden: a[key] == null, html: '↺', onclick: () => { setAssistantSettings({ [key]: null }); build(); } });
      return h('span', { class: 'wb-model-ctl' }, f, reset, a[key] == null && own != null ? h('span', { class: 'wb-small wb-muted', title: 'The model recommends this' }, 'model') : null);
    };
    body.replaceChildren(
      row('Engine', selectField(ENGINES.filter(([id]) => id in ENGINE_NAMES), engine, v => { engine = v; tag = ''; favOnly = false; setEngine(v); build(); }, 'What the assistant talks to')),
      ...fields,
      engine === 'webgpu' || engine === 'lfm3' ? h('div', { class: 'wb-row wb-small wb-muted wb-model-note' }, 'Runs in this browser on your GPU; the first use downloads the model.') : null,
      engine === 'agent' ? h('div', { class: 'wb-row wb-small wb-muted wb-model-note' }, 'An external agent answers over MCP (ams_pending → ams_answer); there is no model to pick.') : null,
      engine !== 'agent' ? row('Model', h('span', { class: 'wb-model-ctl' }, h('span', { class: 'wb-combo' }, input, list), star, reload)) : null,
      engine === 'lfm3' ? lfmControls() : null,
      engine === 'openrouter' ? row('Show', selectField([['', 'All'], ['free', 'Free'], ['image', 'Image input']], tag, v => { tag = v; paint(); }, 'Narrow the OpenRouter list')) : null,
      h('div', { class: 'wb-row wb-model-status' }, h('span', { class: 'wb-row-label' }), status),
      ...codeRows(),
      h('div', { class: 'wb-sub', title: engine === 'agent' ? 'Not used with an external agent: it chooses how to ask for itself' : 'How the Assistant panel asks the model (the quick / field has its own temperature, below)' }, 'Asking'),
      row('Temperature', tempField('temperature', 'chat', 'Lower: steadier. Higher: more varied')),
      row('Steps', numberField({ value: a.rounds, min: 1, max: 12, step: 1, def: 6, title: 'How many times it may act, look at the results and act again for one message', onChange: v => setAssistantSettings({ rounds: Math.round(v) }) })),
      row('Remember', numberField({ value: a.history, min: 2, max: 40, step: 1, def: 12, title: 'How many earlier messages go back to the model each time', onChange: v => setAssistantSettings({ history: Math.round(v) }) })),
      row('Quick field', tempField('flowTemperature', 'flow', 'Temperature for the / field, which acts at once, never asks, and answers in a few words. Lower is steadier')),
      h('div', { class: 'wb-sub', title: 'What the studio sounds like when it speaks: its replies, and narration made with LFM3. Spoken by LFM3-Omni in this browser' }, 'Voice'),
      row('Speak replies', (() => { const c = h('input', { type: 'checkbox', checked: voiceSettings().speak, title: 'Say each Assistant reply aloud as well as writing it (the model has to be loaded once: Model › LFM3-Omni › Download)' }); c.addEventListener('change', () => { setVoice({ speak: c.checked }); if (!c.checked) app.speaker.stop(); }); return c; })()),
      row('Language', selectField(LANGUAGES.map(l => [l, l]), voiceSettings().language, v => setVoice({ language: v }), 'The language it speaks in (19, each with a female and a male voice)')),
      row('Voice', selectField(GENDERS, voiceSettings().gender, v => setVoice({ gender: v }), 'Female or male')),
      row('', h('button', { class: 'wb-btn', type: 'button', title: 'Hear the voice as set', onclick: () => app.speaker.say('Hello, this is the studio. This is how I sound.') }, 'Hear it')),
      row('Tool details', (() => { const c = h('input', { type: 'checkbox', checked: a.traces, title: 'For debugging: show each tool call and its result under every reply in the Assistant. Off, replies show only the words (the calls are always in the request log)' }); c.addEventListener('change', () => { setAssistantSettings({ traces: c.checked }); }); return c; })()),
      row('Studio tools', (() => { const c = h('input', { type: 'checkbox', checked: a.tools, title: 'Let it draw and change the studio through its tools. Off: it only talks' }); c.addEventListener('change', () => setAssistantSettings({ tools: c.checked })); return c; })())
    );
    // With an external agent none of these apply (it asks for itself): dimmed, and the controls off.
    if (engine === 'agent') { const at = [...body.children].findIndex(c => c.classList?.contains('wb-sub') && c.textContent === 'Asking'); [...body.children].slice(at).forEach(c => { c.style.opacity = '0.4'; c.title = 'Not used with an external agent: it chooses how to ask for itself'; c.querySelectorAll('input,select,button').forEach(x => { x.disabled = true; }); }); }
    showCurrent();
    refresh();
  };
  build();
  window.addEventListener('ams-model', () => { if (!document.body.contains(box)) return; if (currentEngine() !== engine) { engine = currentEngine(); build(); } else if ((app.artists.get(engine)?.getModel?.() || '') !== builtModel) build(); });
  return box;
}
