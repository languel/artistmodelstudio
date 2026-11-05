/**
 * The model button at the bottom of the Assistant, Generate (and, one day, Decide): the engine and model in use; its
 * menu has the favorites (on any engine), a star for the current model, the engines, and a way into Settings → Model.
 * The choice is shared: the panels are three ways of asking the same model.
 */
import { h } from './ui.js';
import { showMenu } from './menu.js';
import { ENGINE_NAMES, currentEngine, setEngine, useModel, allFavorites, isFavorite, toggleFavorite, favorites } from './modelStore.js';

export function modelPill(app) {
  const pill = h('button', { class: 'wb-compose-pill', title: 'Model: favorites, engines and settings' });
  const paint = () => {
    const engine = currentEngine(), m = app.artists.get(engine)?.getModel?.() || '';
    pill.replaceChildren(h('span', { class: 'wb-pill-engine' }, ENGINE_NAMES[engine] || engine), m && engine !== 'agent' ? h('span', { class: 'wb-pill-model' }, m) : null, h('span', { class: 'wb-tool-caret' }));
  };
  pill.onclick = () => {
    const r = pill.getBoundingClientRect(), engine = currentEngine(), artist = app.artists.get(engine), cur = artist?.getModel?.() || '';
    const favs = allFavorites(app);
    // (an Ollama favorite the machine no longer has)
    const missing = f => { if (f.engine !== 'ollama') return false; try { const have = app.artists.get('ollama')?.getAvailableModels?.() || []; return have.length > 0 && !have.some(m => (m.id || m) === f.id); } catch { return false; } };
    showMenu([
      favs.length ? { label: 'Favorites' } : null,
      ...favs.map(f => ({ icon: '★', label: f.id + (missing(f) ? '  (not installed)' : ''), hint: ENGINE_NAMES[f.engine] + (missing(f) ? ': not on this machine' : ''), active: f.engine === engine && f.id === cur, run: () => useModel(app, f.engine, f.id) })),
      favs.length ? '-' : null,
      favs.length ? { label: 'Remove a favorite', hint: 'Take any model off the list (a model that is no longer installed shows as missing)', items: favs.map(f => ({ icon: '✕', label: f.id + (missing(f) ? '  (not installed)' : ''), hint: ENGINE_NAMES[f.engine], run: () => toggleFavorite(f.engine, f.id, app.artists.get(f.engine)) })) } : null,
      cur && engine !== 'agent' ? { icon: isFavorite(engine, cur, artist) ? '★' : '☆', label: isFavorite(engine, cur, artist) ? 'Remove this model from favorites' : 'Favorite this model', run: () => toggleFavorite(engine, cur, artist) } : null,
      { label: 'Engine', items: Object.entries(ENGINE_NAMES).map(([id, name]) => ({ label: name, active: id === engine, run: () => setEngine(id) })) },
      { label: 'All models and settings…', hint: 'Settings → Model: the engine, how to reach it, the model list and favorites', run: () => { app.docks.open('settings'); setTimeout(() => app.modelSection?.scrollIntoView?.({ block: 'start' }), 60); } }
    ].filter(Boolean), r.left, r.top - 6, { up: true });
  };
  window.addEventListener('ams-model', paint);   // (also while its panel is behind another tab, so it is right when you come back)
  pill.addEventListener('pointerenter', paint);
  paint();
  return pill;
}
