import { describe, it, expect } from 'vitest';
import { shapeProviderModels, routedTo, PRATT_CATALOG } from './providers.js';

describe('shapeProviderModels (Pratt)', () => {
  const live = ['pratt-qwen', 'pratt-jev', 'pratt-d3', 'pratt-embedding-bge-base', 'pratt-reranker-gte', 'pratt-deepseek-flash', 'pratt-future'].map(id => ({ id, name: id }));
  const { chat, decision } = shapeProviderModels(live, 'pratt');
  it('lists chat models only, named for the model behind the id', () => {
    expect(chat.map(m => m.id)).toEqual(['pratt-qwen', 'pratt-deepseek-flash', 'pratt-future']);
    expect(chat[0].name).toBe('Qwen 3.8 Max · pratt-qwen');
    expect(chat[0].group).toBe('External (faculty)');
  });
  it('sets decision models apart and drops embedding and rerank models', () => {
    expect(decision.map(d => d.id).sort()).toEqual(['pratt-d3', 'pratt-jev']);
    expect(chat.some(m => /embedding|reranker/.test(m.id))).toBe(false);
  });
  it('keeps an id the docs do not know, marked', () => {
    expect(chat.at(-1)).toMatchObject({ id: 'pratt-future', group: 'Other (not in the docs)' });
  });
  it('knows where a routed model comes from', () => {
    expect(routedTo('pratt', 'pratt-qwen')).toBe('qwen/qwen3.8-max');
    expect(routedTo('pratt', 'pratt-high')).toBe(null);
    expect(Object.keys(PRATT_CATALOG).length).toBeGreaterThan(20);
  });
});
describe('shapeProviderModels (other providers)', () => {
  it('drops embedding and guard models, no groups', () => {
    const r = shapeProviderModels([{ id: 'a/chat-1' }, { id: 'nvidia/nemotron-embed-x' }, { id: 'meta/llama-guard-3' }], null);
    expect(r.chat.map(m => m.id)).toEqual(['a/chat-1']);
  });
});
