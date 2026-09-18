/**
 * Session Store
 *
 * Manages studio interaction history, candidate generations,
 * selection states, and local persistence.
 */

const STORAGE_KEY = 'artist_model_studio_session_v1';

export class SessionStore {
  constructor() {
    this.sessionId = 'session_' + Date.now();
    this.generations = []; // Array of { generationIndex, prompt, candidates, parentId }
    this.currentGeneration = 0;
    this.activeCandidateId = null;
    this.listeners = new Set();

    this.loadFromStorage();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.saveToStorage();
    for (const fn of this.listeners) {
      try {
        fn(this);
      } catch (e) {
        console.error('Session listener error:', e);
      }
    }
  }

  createCandidate({
    prompt,
    model,
    modelSettings = {},
    medium,
    mediumSettings = {},
    program,
    parentId = null,
    generation = 0,
    renderMetadata = {},
    rawResponse = ''
  }) {
    return {
      id: 'cand_' + Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
      prompt,
      model,
      modelSettings,
      medium,
      mediumSettings,
      program,
      parentId,
      generation,
      selected: false,
      rating: 0,
      feedback: '',
      rawResponse,
      renderMetadata: {
        executionTimeMs: renderMetadata.executionTimeMs || 0,
        renderTimeMs: renderMetadata.renderTimeMs || 0,
        actionCount: program.actions?.length || 0,
        warnings: renderMetadata.warnings || []
      }
    };
  }

  addGeneration({ prompt, candidates, parentId = null }) {
    const genIndex = this.generations.length;
    const record = {
      generationIndex: genIndex,
      prompt,
      parentId,
      timestamp: Date.now(),
      candidates
    };

    this.generations.push(record);
    this.currentGeneration = genIndex;

    // Automatically select first candidate or leave unselected
    if (candidates.length > 0) {
      this.selectCandidate(candidates[0].id);
    } else {
      this.notify();
    }
  }

  getCurrentCandidates() {
    if (this.generations.length === 0) return [];
    return this.generations[this.generations.length - 1].candidates || [];
  }

  getActiveCandidate() {
    const candidates = this.getCurrentCandidates();
    return candidates.find(c => c.id === this.activeCandidateId) || candidates[0] || null;
  }

  selectCandidate(candidateId) {
    this.activeCandidateId = candidateId;
    const candidates = this.getCurrentCandidates();
    for (const c of candidates) {
      c.selected = (c.id === candidateId);
    }
    this.notify();
  }

  rateCandidate(candidateId, rating) {
    const cand = this.findCandidate(candidateId);
    if (cand) {
      cand.rating = rating;
      this.notify();
    }
  }

  setFeedback(candidateId, feedback) {
    const cand = this.findCandidate(candidateId);
    if (cand) {
      cand.feedback = feedback;
      this.notify();
    }
  }

  updateCandidateProgram(candidateId, newProgram) {
    const cand = this.findCandidate(candidateId);
    if (cand) {
      cand.program = newProgram;
      cand.renderMetadata.actionCount = newProgram.actions?.length || 0;
      cand.isEdited = true;
      this.notify();
    }
  }

  findCandidate(id) {
    for (const gen of this.generations) {
      for (const c of gen.candidates) {
        if (c.id === id) return c;
      }
    }
    return null;
  }

  clearSession() {
    this.sessionId = 'session_' + Date.now();
    this.generations = [];
    this.currentGeneration = 0;
    this.activeCandidateId = null;
    this.notify();
  }

  saveToStorage() {
    if (typeof localStorage === 'undefined') return;

    const sanitizeGenerations = (gens, maxGens = 10) => {
      const slice = gens.slice(-maxGens);
      return slice.map(g => ({
        ...g,
        candidates: (g.candidates || []).map(c => {
          const { renderedImage, ...rest } = c;
          return {
            ...rest,
            rawResponse: rest.rawResponse ? rest.rawResponse.slice(0, 1000) : ''
          };
        })
      }));
    };

    try {
      const data = {
        sessionId: this.sessionId,
        generations: sanitizeGenerations(this.generations, 10),
        currentGeneration: this.currentGeneration,
        activeCandidateId: this.activeCandidateId
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        try {
          const reducedData = {
            sessionId: this.sessionId,
            generations: sanitizeGenerations(this.generations, 3),
            currentGeneration: this.currentGeneration,
            activeCandidateId: this.activeCandidateId
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedData));
        } catch (e2) {
          console.warn('localStorage quota full, skipping persistence:', e2.message);
        }
      } else {
        console.warn('Could not save session to localStorage:', e);
      }
    }
  }

  loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const item = localStorage.getItem(STORAGE_KEY);
      if (item) {
        const data = JSON.parse(item);
        this.sessionId = data.sessionId || this.sessionId;
        this.generations = data.generations || [];
        this.currentGeneration = data.currentGeneration || 0;
        this.activeCandidateId = data.activeCandidateId || null;
      }
    } catch (e) {
      console.warn('Could not load session from localStorage:', e);
    }
  }
}

export const defaultSessionStore = new SessionStore();
