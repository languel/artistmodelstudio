/**
 * Agent Artist: an external agent (Claude Code, another harness, a script) is
 * the engine. Programs arrive through MCP (`ams_agent_submit`); the studio then
 * treats them like any other engine's candidates: rendering, ratings,
 * variations, critique, datasets.
 *
 * Two ways in:
 *   - the agent submits programs directly (ams_agent_submit runs a round), or
 *   - a user presses Generate with this engine selected; the request waits
 *     (see ams_agent_pending) until the agent submits programs for it.
 */
import { Artist } from './Artist.js';
import { normalizeProgram } from '../language/normalize.js';
import { buildSystemPrompt, buildUserPrompt } from './promptBuilder.js';
import { DESCRIBE_INSTRUCTION } from './imagePrompt.js';

export class AgentArtist extends Artist {
  constructor() {
    super('agent', 'Agent (MCP)', 'harness');
    this.model = 'external-agent';
    this.queued = null;   // programs submitted ahead of a round
    this.waiting = null;  // { request, resolve } while a round waits for the agent
  }

  getModel() { return this.model; }
  setModel(id) { this.model = id || 'external-agent'; }
  getAvailableModels() { return [{ id: this.model, name: this.model === 'external-agent' ? 'External agent' : this.model }]; }

  /** What an in-app engine would be told for this request, so agents write compatible programs. */
  static brief(request, count = 4) {
    const caps = request.mediumCapabilities;
    return {
      prompt: request.prompt,
      medium: caps?.id,
      coordinateSystem: caps?.coordinateSystem,
      systemPrompt: buildSystemPrompt(caps),
      userPrompts: Array.from({ length: count }, (_, i) => buildUserPrompt({
        prompt: request.prompt, previousProgram: request.previousProgram, feedback: request.feedback, candidateIndex: i
      })),
      previousProgram: request.previousProgram || null,
      feedback: request.feedback || null,
      referenceImage: request.image || null // data URL when the prompt mode sends the reference
    };
  }

  /** Programs for the next (or the waiting) round. */
  submit(programs, model) {
    if (model) this.setModel(model);
    const list = programs.map(p => (typeof p === 'string' ? JSON.parse(p) : p));
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w.resolve(list);
      return 'delivered';
    }
    this.queued = list;
    return 'queued';
  }

  pending() {
    if (this.describing) return { type: 'describe', instruction: this.describing.instruction, referenceImage: this.describing.image };
    return this.waiting ? { type: 'generate', ...AgentArtist.brief(this.waiting.request, this.waiting.request.count || 4) } : null;
  }

  /** Describe mode: waits for the agent's description (ams_agent_submit_description). */
  describe(image, { signal } = {}) {
    return new Promise((resolve, reject) => {
      this.describing = { image, instruction: DESCRIBE_INSTRUCTION, resolve };
      signal?.addEventListener('abort', () => { this.describing = null; reject(new Error('Interrupted while waiting for the agent')); });
    });
  }

  submitDescription(text) {
    if (!this.describing) return false;
    const d = this.describing;
    this.describing = null;
    d.resolve(String(text).trim());
    return true;
  }

  async generate(request) {
    const count = request.count || 4;
    request.onProgress?.({ type: 'start', model: this.model, endpoint: 'mcp', totalCandidates: count, message: `Agent engine: ${this.queued ? 'using submitted programs' : 'waiting for an agent to submit programs (ams_agent_submit)'}…` });
    let programs = this.queued;
    this.queued = null;
    if (!programs) {
      programs = await new Promise((resolve, reject) => {
        this.waiting = { request, resolve };
        request.signal?.addEventListener('abort', () => { this.waiting = null; reject(new Error('Interrupted while waiting for the agent')); });
      });
    }
    const out = [];
    for (let i = 0; i < programs.length; i++) {
      request.onProgress?.({ type: 'candidate_start', candidateIndex: i, model: this.model, message: `Agent candidate ${String.fromCharCode(65 + i)} (${i + 1}/${programs.length})` });
      const warnings = [];
      let program;
      try { program = normalizeProgram(programs[i]); } catch (err) { warnings.push(err.message); program = { version: 1, actions: [] }; }
      const cand = { program, generationTimeMs: 0, rawResponse: JSON.stringify(programs[i]), warnings };
      out.push(cand);
      request.onCandidateComplete?.({ candidateIndex: i, candidate: cand });
    }
    return out;
  }
}
