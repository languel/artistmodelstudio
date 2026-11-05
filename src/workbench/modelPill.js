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
    // (an Ollama favorite the machine no longer has)
    const missing = f => { if (f.engine !== 'ollama') return false; try { const have = app.artists.get('ollama')?.getAvailableModels?.() || []; return have.length > 0 && !have.some(m => (m.id || m) === f.id); } catch { return false; } };
    const starOf = (e, id, on) => ({ on, title: on ? 'Unfavorite' : 'Favorite', run: () => toggleFavorite(e, id, app.artists.get(e)) });
    const isCur = f => f.engine === engine && f.id === cur;
    const here = cur && engine !== 'agent';
    const others = favs.filter(f => !isCur(f));
    showMenu([
      // The model in use is always the first row; its star (filled: a favorite) toggles that. The star at the left of any row does the same for it; anywhere else on a row picks it.
      here ? { star: starOf(engine, cur, isFavorite(engine, cur, artist)), label: cur, hint: `${ENGINE_NAMES[engine]}, in use`, active: true, run: () => {} } : null,
      others.length ? '-' : null,
      others.length ? { label: 'Favorites' } : null,
      ...others.map(f => ({ star: starOf(f.engine, f.id, true), label: f.id + (missing(f) ? '  (not installed)' : ''), hint: ENGINE_NAMES[f.engine] + (missing(f) ? ': not on this machine' : ''), run: () => useModel(app, f.engine, f.id) })),
      '-',
      { label: 'Engine', items: Object.entries(ENGINE_NAMES).map(([id, name]) => ({ label: name, active: id === engine, run: () => setEngine(id) })) },
      { label: 'All models and settings…', hint: 'Settings → Model: the engine, how to reach it, the model list and favorites', run: () => { app.docks.open('settings'); setTimeout(() => app.modelSection?.scrollIntoView?.({ block: 'start' }), 60); } }
    ].filter(Boolean), r.left, r.top - 6, { up: true });
  };
  window.addEventListener('ams-model', paint);   // (also while its panel is behind another tab, so it is right when you come back)
  pill.addEventListener('pointerenter', paint);
  paint();
  return pill;
}
