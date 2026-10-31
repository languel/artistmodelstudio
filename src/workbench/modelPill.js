/**
 * The model button at the bottom of the Assistant, Generate (and, one day, Decide): the engine and model in use; its
 * menu has the favorites (on any engine), a star for the current model, the engines, and a way into Settings → Model.
 * The choice is shared: the panels are three ways of asking the same model.
 */
import { h } from './ui.js';
import { showMenu } from './menu.js';
import { ENGINE_NAMES, currentEngine, setEngine, useModel, allFavorites, isFavorite, toggleFavorite } from './modelStore.js';

export function modelPill(app) {
  const pill = h('button', { class: 'wb-compose-pill', title: 'Model: favorites, engines and settings' });
  const paint = () => {
    const engine = currentEngine(), m = app.artists.get(engine)?.getModel?.() || '';
    pill.replaceChildren(h('span', { class: 'wb-pill-engine' }, ENGINE_NAMES[engine] || engine), m && engine !== 'agent' ? h('span', { class: 'wb-pill-model' }, m) : null, h('span', { class: 'wb-tool-caret' }));
  };
  pill.onclick = () => {
    const r = pill.getBoundingClientRect(), engine = currentEngine(), artist = app.artists.get(engine), cur = artist?.getModel?.() || '';
    const favs = allFavorites(app);
    showMenu([
      favs.length ? { label: 'Favorites' } : null,
      ...favs.map(f => ({ icon: '★', label: f.id, hint: ENGINE_NAMES[f.engine], active: f.engine === engine && f.id === cur, run: () => useModel(app, f.engine, f.id) })),
      favs.length ? '-' : null,
      cur && engine !== 'agent' ? { icon: isFavorite(engine, cur, artist) ? '★' : '☆', label: isFavorite(engine, cur, artist) ? 'Remove this model from favorites' : 'Favorite this model', run: () => toggleFavorite(engine, cur, artist) } : null,
      { label: 'Engine', items: Object.entries(ENGINE_NAMES).map(([id, name]) => ({ label: name, active: id === engine, run: () => setEngine(id) })) },
      { label: 'All models and settings…', hint: 'Settings → Model: the engine, how to reach it, the model list and favorites', run: () => { app.docks.open('settings'); setTimeout(() => app.modelSection?.scrollIntoView?.({ block: 'start' }), 60); } }
    ].filter(Boolean), r.left, r.top - 6, { up: true });
  };
  window.addEventListener('ams-model', () => { if (document.body.contains(pill)) paint(); });
  paint();
  return pill;
}
