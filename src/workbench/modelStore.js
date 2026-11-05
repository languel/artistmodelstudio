/**
 * Which model the assistant talks to, and the favorites. No interface here: the Settings → Model section, the
 * assistant's model menu and the pickers all read and write through this, and hear of changes as 'ams-model' events.
 *
 * Favorites are kept per engine ({ engine: [model ids] }). OpenRouter's keep their own list (its artist seeds
 * a few), so the star on an OpenRouter model and the Generate panel's agree.
 */
export const ASSISTANT_ENGINE_KEY = 'ams_assistant_engine';
const FAV_KEY = 'ams_model_favorites';
const SETTINGS_KEY = 'ams_assistant_settings';
export const ENGINE_NAMES = { ollama: 'Ollama', webgpu: 'In-browser', openrouter: 'OpenRouter', openai: 'OpenAI-compatible', agent: 'Agent (MCP)' };

/** What each engine needs to connect: [label, localStorage key, input type, placeholder]. */
export const ENGINE_FIELDS = {
  ollama: [['Endpoint', 'ams_ollama_endpoint', 'text', 'http://localhost:11434']],
  openai: [['Base URL', 'ams_openai_base_url', 'text', 'https://api.openai.com/v1'], ['API key', 'ams_openai_key', 'password', '']],
  openrouter: [['API key', 'ams_openrouter_key', 'password', '']],
  webgpu: [],
  agent: []
};

const get = (k, fallback = null) => { try { const v = localStorage.getItem(k); return v == null ? fallback : v; } catch { return fallback; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
const changed = () => { try { window.dispatchEvent(new CustomEvent('ams-model')); } catch { /* no window */ } };

export const currentEngine = () => get(ASSISTANT_ENGINE_KEY, 'ollama');
export function setEngine(engine) { set(ASSISTANT_ENGINE_KEY, engine); changed(); }

/** Switch the assistant to an engine and a model on it. */
export function useModel(app, engine, model) {
  set(ASSISTANT_ENGINE_KEY, engine);
  const artist = app.artists.get(engine);
  if (model) { artist?.setModel?.(model); const key = { openrouter: 'ams_openrouter_model', openai: 'ams_openai_model', ollama: 'ams_ollama_model', webgpu: 'ams_webgpu_model' }[engine]; if (key) set(key, model); }
  changed();
}

// ---- favorites ---------------------------------------------------------------------------------------------------
const readFavs = () => { try { const v = JSON.parse(get(FAV_KEY, '{}')); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

export function favorites(engine, artist) {
  if (engine === 'openrouter' && artist?.getFavorites) return [...artist.getFavorites()];
  return [...(readFavs()[engine] || [])];
}
export const isFavorite = (engine, id, artist) => Boolean(id) && favorites(engine, artist).includes(id);

export function toggleFavorite(engine, id, artist) {
  if (!id) return false;
  const now = !isFavorite(engine, id, artist);
  if (engine === 'openrouter' && artist?.saveFavorites) {
    const list = favorites(engine, artist).filter(x => x !== id);
    artist.saveFavorites(now ? [...list, id] : list);
  } else {
    const all = readFavs(), list = (all[engine] || []).filter(x => x !== id);
    all[engine] = now ? [...list, id] : list;
    set(FAV_KEY, JSON.stringify(all));
  }
  changed();
  return now;
}

/** Every favorite on every engine: [{ engine, id }]. */
export function allFavorites(app) {
  return Object.keys(ENGINE_NAMES).flatMap(engine => favorites(engine, app.artists.get(engine)).map(id => ({ engine, id })));
}

// ---- how the assistant asks ---------------------------------------------------------------------------------------
export const ASSISTANT_DEFAULTS = { temperature: 0.4, rounds: 6, tools: true, history: 12, flowTemperature: 0.3 };
export function assistantSettings() {
  let saved = {};
  try { saved = JSON.parse(get(SETTINGS_KEY, '{}')) || {}; } catch { /* ignore */ }
  return { ...ASSISTANT_DEFAULTS, ...saved };
}
export function setAssistantSettings(patch) { set(SETTINGS_KEY, JSON.stringify({ ...assistantSettings(), ...patch })); changed(); }

/** A model list narrowed by a search, and to favorites if asked. models: [{ id, name }]. */
export function filterModels(models, { query = '', favorites: favs = [], favoritesOnly = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const fav = new Set(favs);
  return models.filter(m => (!favoritesOnly || fav.has(m.id)) && (!q || `${m.id} ${m.name || ''}`.toLowerCase().includes(q)));
}
