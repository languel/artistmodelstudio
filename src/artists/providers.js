/**
 * Hosted providers that speak the OpenAI chat API, each an engine of its own (own key, own model, own list).
 * The dev server can hold a provider's key in its environment (see `env`, and vite.config.js `/__llm`): then the page never sees it.
 * Without that (the deployed site), paste a key in Settings; the provider may refuse calls made straight from a browser.
 */
export const PROVIDERS = [
  { id: 'pratt', name: 'Pratt Institute', baseURL: 'https://llm.pratt.edu/v1', env: ['PRATT_LLM_API_KEY'], keyHint: 'sk-pratt-…', catalog: 'pratt', models: [] },
  { id: 'nim', name: 'NVIDIA NIM', baseURL: 'https://integrate.api.nvidia.com/v1', env: ['NVIDIA_NIM_API_KEY', 'NVIDIA_API_KEY'], keyHint: 'nvapi-…', models: [
    ['nvidia/nemotron-3-super-120b-a12b', 'Nemotron 3 Super 120B'], ['nvidia/llama-3.1-nemotron-ultra-253b-v1', 'Nemotron Ultra 253B'], ['moonshotai/kimi-k2.6', 'Kimi K2.6'],
    ['deepseek-ai/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash'], ['openai/gpt-oss-20b', 'gpt-oss 20B']] },
  { id: 'github', name: 'GitHub Models', baseURL: 'https://models.github.ai/inference', modelsPath: '/catalog/models', env: ['GITHUB_TOKEN', 'GH_TOKEN'], ghCli: true, keyHint: 'a GitHub token (models:read)', models: [
    ['openai/gpt-4.1', 'GPT-4.1'], ['openai/gpt-4.1-mini', 'GPT-4.1 mini'], ['meta/Llama-3.3-70B-Instruct', 'Llama 3.3 70B'], ['deepseek/DeepSeek-V3-0324', 'DeepSeek V3'], ['microsoft/Phi-4', 'Phi-4']] }
  ,{ id: 'gemini', name: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], keyHint: 'AIza…', models: [
    ['gemini-2.5-flash', 'Gemini 2.5 Flash'], ['gemini-2.5-pro', 'Gemini 2.5 Pro'], ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite']] }
];
export const providerModels = p => p.models.map(([id, name]) => ({ id, name }));

/**
 * What the Pratt docs (v1.9.1, 17 Oct 2026) say each public id is. The live `GET /v1/models` decides which exist for a key (its access group);
 * this only names them and says what kind they are. `name` is the model behind the id (a hint: the docs say it may change without the id changing),
 * `group` where it runs / who may use it, `or` its OpenRouter slug where it is routed there (used to look up the maker's recommended settings).
 * Decision models (`/v1/systemone`) and embedding/rerank models are not chat models and never listed as one.
 */
export const PRATT_CATALOG = {
  'pratt-high': { name: 'Pratt High', group: 'Internal (admin staff)', use: 'coding, strongest' },
  'pratt-medium-fast': { name: 'Pratt Medium Fast', group: 'Internal (admin staff)', use: 'general, agents' },
  'pratt-medium': { name: 'Pratt Medium', group: 'Internal (admin staff)', use: 'classification, bulk' },
  'pratt-agent': { name: 'Pratt Agent', group: 'Internal (admin staff)', use: 'agent and tool use' },
  'pratt-grok': { name: 'Grok 4.7', group: 'External (faculty)', or: 'x-ai/grok-4.7' },
  'pratt-deepseek-pro': { name: 'DeepSeek V4 Pro', group: 'External (faculty)', or: 'deepseek/deepseek-v4-pro' },
  'pratt-deepseek-flash': { name: 'DeepSeek V4.1 Flash 1017', group: 'External (faculty)', or: 'deepseek/deepseek-v4.1-flash-1017' },
  'pratt-kimi': { name: 'Kimi K3', group: 'External (faculty)', or: 'moonshotai/kimi-k3' },
  'pratt-nemo': { name: 'Nemotron 3.5 Super VL', group: 'External (faculty)', or: 'nvidia/nemotron-3.5-super-vl', vision: true },
  'pratt-tencent': { name: 'Tencent Hy4 Preview', group: 'External (faculty)', or: 'tencent/hy4-preview' },
  'pratt-qwen': { name: 'Qwen 3.8 Max', group: 'External (faculty)', or: 'qwen/qwen3.8-max' },
  'pratt-muse-spark': { name: 'Muse Spark 1.3', group: 'External (faculty)', or: 'meta/muse-spark-1.3' },
  'pratt-glm': { name: 'GLM-5.3 Flash', group: 'External (faculty)', or: 'z-ai/glm-5.3-flash' },
  'pratt-mimo': { name: 'Mimo V2.6 Pro', group: 'External (faculty)', or: 'xiaomi/mimo-v2.6-pro' },
  'pratt-mistral': { name: 'Mistral Large 4', group: 'External (faculty)', or: 'mistralai/mistral-large-4-0' },
  'pratt-step': { name: 'Step 5 Preview', group: 'External (faculty)', or: 'stepfun/step-5-preview' },
  'pratt-gemini': { name: 'Gemini 3.8 Flash', group: 'External (faculty)', or: 'google/gemini-3.8-flash' },
  'pratt-student': { name: 'Student endpoint', group: 'Student' },
  'pratt-d3': { name: 'Typesafe D3', kind: 'decision', note: 'decision model: POST /v1/systemone, images and video' },
  'pratt-jev': { name: 'Typesafe Jev 1.13', kind: 'decision', note: 'decision model: POST /v1/systemone' },
  'pratt-embedding-qwen3-8b': { name: 'Qwen3-Embedding-8B', kind: 'embedding' },
  'pratt-embedding-bge-base': { name: 'bge-base-en-v1.5', kind: 'embedding' },
  'pratt-reranker-gte': { name: 'gte-multilingual-reranker-base', kind: 'embedding' }
};

const catalogs = { pratt: PRATT_CATALOG };
const NOT_CHAT = /embed|rerank|safety-guard|guard|content-safety/i;

/**
 * A provider's live model list → what to offer. Chat models only (named and grouped from the catalog when it knows them: "Qwen 3.8 Max · pratt-qwen");
 * decision models are set apart and returned in `decision`; embedding and rerank models are dropped.
 */
export function shapeProviderModels(list, catalogName = null) {
  const cat = catalogs[catalogName] || {};
  const chat = [], decision = [];
  for (const m of list) {
    const c = cat[m.id];
    if (c?.kind === 'decision') { decision.push({ id: m.id, name: c.name, note: c.note }); continue; }
    if (c?.kind === 'embedding' || (!c && NOT_CHAT.test(m.id))) continue;
    chat.push(c ? { ...m, name: `${c.name} · ${m.id}`, group: c.group, hint: c.use || '', model: c.name } : { ...m, group: catalogName ? 'Other (not in the docs)' : undefined });
  }
  return { chat, decision };
}

/** The OpenRouter slug behind a provider's model id, if the catalog says it is routed there. */
export const routedTo = (catalogName, id) => catalogs[catalogName]?.[id]?.or || null;
