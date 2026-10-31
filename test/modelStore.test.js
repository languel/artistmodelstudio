import { describe, it, expect, beforeEach } from 'vitest';
import { favorites, toggleFavorite, isFavorite, allFavorites, filterModels, assistantSettings, setAssistantSettings, currentEngine, setEngine, ASSISTANT_DEFAULTS } from '../src/workbench/modelStore.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; };
beforeEach(() => { globalThis.localStorage = mem(); });

describe('model favorites and assistant settings', () => {
  it('keeps favorites per engine and toggles them', () => {
    expect(isFavorite('ollama', 'gemma')).toBe(false);
    expect(toggleFavorite('ollama', 'gemma')).toBe(true);
    expect(isFavorite('ollama', 'gemma')).toBe(true);
    expect(favorites('openai')).toEqual([]);
    expect(toggleFavorite('ollama', 'gemma')).toBe(false);
    expect(favorites('ollama')).toEqual([]);
  });
  it('OpenRouter favorites live with its artist', () => {
    let list = ['a'];
    const artist = { getFavorites: () => list, saveFavorites: l => { list = l; } };
    expect(isFavorite('openrouter', 'a', artist)).toBe(true);
    toggleFavorite('openrouter', 'b', artist);
    expect(list).toEqual(['a', 'b']);
    toggleFavorite('openrouter', 'a', artist);
    expect(list).toEqual(['b']);
  });
  it('lists every favorite with its engine', () => {
    toggleFavorite('ollama', 'x'); toggleFavorite('openai', 'y');
    const app = { artists: { get: () => null } };
    expect(allFavorites(app)).toEqual(expect.arrayContaining([{ engine: 'ollama', id: 'x' }, { engine: 'openai', id: 'y' }]));
  });
  it('filters a model list by search and favorites', () => {
    const models = [{ id: 'gemma:12b', name: 'gemma 12b' }, { id: 'llama:8b', name: 'Llama 8B' }, { id: 'qwen:7b', name: 'qwen 7b' }];
    expect(filterModels(models, { query: 'LLAMA' }).map(m => m.id)).toEqual(['llama:8b']);
    expect(filterModels(models, { favorites: ['qwen:7b'], favoritesOnly: true }).map(m => m.id)).toEqual(['qwen:7b']);
    expect(filterModels(models, {}).length).toBe(3);
  });
  it('remembers the engine and how the assistant asks', () => {
    expect(currentEngine()).toBe('ollama');
    setEngine('openrouter');
    expect(currentEngine()).toBe('openrouter');
    expect(assistantSettings()).toEqual(ASSISTANT_DEFAULTS);
    setAssistantSettings({ temperature: 1, tools: false });
    expect(assistantSettings()).toEqual({ ...ASSISTANT_DEFAULTS, temperature: 1, tools: false });
  });
});
