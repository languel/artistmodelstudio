/**
 * Distilled Artist
 *
 * Runs a small model fine-tuned on Reference Fitter programs (see
 * training/klee/README.md), served locally by `mlx_lm.server` with the LoRA
 * adapter. Uses the exact training prompt format from distillFormat.js, so
 * it works only with models trained on that format.
 *
 * The "model" menu is the shape budget the model was trained to follow.
 */
import { Artist } from './Artist.js';
import { DISTILL_SYSTEM, distillUserPrompt, parseDistillText } from '../training/distillFormat.js';

const ENDPOINT_KEY = 'ams_distilled_endpoint';
const DEFAULT_ENDPOINT = 'http://localhost:8090/v1';

export const DISTILLED_BUDGETS = [
  { id: 'shapes-12', shapes: 12, name: '12 shapes' },
  { id: 'shapes-24', shapes: 24, name: '24 shapes' },
  { id: 'shapes-48', shapes: 48, name: '48 shapes' }
];

const readStorage = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};

export class DistilledArtist extends Artist {
  constructor() {
    super('distilled', 'Distilled Klee (local MLX)', 'local');
    this.model = 'shapes-24';
  }

  get endpoint() {
    return readStorage(ENDPOINT_KEY, DEFAULT_ENDPOINT).replace(/\/$/, '');
  }

  getModel() {
    return this.model;
  }

  setModel(id) {
    if (DISTILLED_BUDGETS.some(b => b.id === id)) this.model = id;
  }

  getAvailableModels() {
    return DISTILLED_BUDGETS.map(b => ({ id: b.id, name: b.name }));
  }

  async generate(request) {
    const budget = DISTILLED_BUDGETS.find(b => b.id === this.model) || DISTILLED_BUDGETS[1];
    const count = request.count || 4;
    const temperature = request.settings?.temperature ?? 0.8;
    const user = distillUserPrompt({ description: request.prompt || 'an abstract composition', shapes: budget.shapes });

    request.onProgress?.({
      type: 'start',
      model: `distilled · ${budget.name}`,
      endpoint: this.endpoint,
      totalCandidates: count,
      message: `Asking the distilled model at ${this.endpoint} for ${count} × ${budget.shapes}-shape programs...`
    });

    const candidates = [];
    for (let c = 0; c < count; c++) {
      if (request.signal?.aborted) break;
      request.onProgress?.({ type: 'candidate_start', candidateIndex: c, message: `Candidate ${String.fromCharCode(65 + c)}...` });
      const t0 = performance.now();
      let res;
      try {
        res = await fetch(`${this.endpoint}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: request.signal,
          body: JSON.stringify({
            messages: [{ role: 'system', content: DISTILL_SYSTEM }, { role: 'user', content: user }],
            temperature,
            top_p: 0.95,
            max_tokens: 60 + budget.shapes * 51,
            chat_template_kwargs: { enable_thinking: false }
          })
        });
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        throw new Error(`Could not reach the distilled model at ${this.endpoint}. Start it with training/klee/serve.sh (see training/klee/README.md).`);
      }
      if (!res.ok) throw new Error(`Distilled model server returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const { program, stats } = parseDistillText(text);
      const warnings = stats.invalid ? [`${stats.invalid} of ${stats.lines} lines did not parse and were skipped`] : [];
      const candidate = {
        candidateIndex: c,
        program,
        generationTimeMs: Math.round(performance.now() - t0),
        rawResponse: text,
        warnings
      };
      candidates.push(candidate);
      await request.onCandidateComplete?.({ candidateIndex: c, candidate });
    }
    return candidates;
  }
}
