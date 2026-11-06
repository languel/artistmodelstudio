/**
 * Hosted providers that speak the OpenAI chat API, each an engine of its own (own key, own model, own list).
 * The dev server can hold a provider's key in its environment (see `env`, and vite.config.js `/__llm`): then the page never sees it.
 * Without that (the deployed site), paste a key in Settings; the provider may refuse calls made straight from a browser.
 */
export const PROVIDERS = [
  { id: 'pratt', name: 'Pratt Institute', baseURL: 'https://llm.pratt.edu/v1', env: ['PRATT_LLM_API_KEY'], keyHint: 'sk-pratt-…', models: [
    ['pratt-deepseek-flash', 'DeepSeek V4 Flash (fast)'], ['pratt-deepseek-pro', 'DeepSeek V4 Pro (research, reasoning)'], ['pratt-kimi', 'Kimi K3 Code'], ['pratt-qwen', 'Qwen 3.8 Max'],
    ['pratt-grok', 'Grok 4.5'], ['pratt-nemo', 'Nemotron Ultra'], ['pratt-glm', 'GLM'], ['pratt-mistral', 'Mistral'], ['pratt-gemini', 'Gemini'], ['pratt-muse-spark', 'Muse Spark 1.2'], ['pratt-tencent', 'Tencent Hy3']] },
  { id: 'nim', name: 'NVIDIA NIM', baseURL: 'https://integrate.api.nvidia.com/v1', env: ['NVIDIA_NIM_API_KEY', 'NVIDIA_API_KEY'], keyHint: 'nvapi-…', models: [
    ['nvidia/nemotron-3-super-120b-a12b', 'Nemotron 3 Super 120B'], ['nvidia/llama-3.1-nemotron-ultra-253b-v1', 'Nemotron Ultra 253B'], ['moonshotai/kimi-k2.6', 'Kimi K2.6'],
    ['deepseek-ai/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash'], ['openai/gpt-oss-20b', 'gpt-oss 20B']] },
  { id: 'github', name: 'GitHub Models', baseURL: 'https://models.github.ai/inference', modelsPath: '/catalog/models', env: ['GITHUB_TOKEN', 'GH_TOKEN'], ghCli: true, keyHint: 'a GitHub token (models:read)', models: [
    ['openai/gpt-4.1', 'GPT-4.1'], ['openai/gpt-4.1-mini', 'GPT-4.1 mini'], ['meta/Llama-3.3-70B-Instruct', 'Llama 3.3 70B'], ['deepseek/DeepSeek-V3-0324', 'DeepSeek V3'], ['microsoft/Phi-4', 'Phi-4']] }
  ,{ id: 'gemini', name: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], keyHint: 'AIza…', models: [
    ['gemini-2.5-flash', 'Gemini 2.5 Flash'], ['gemini-2.5-pro', 'Gemini 2.5 Pro'], ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite']] }
];
export const providerModels = p => p.models.map(([id, name]) => ({ id, name }));
