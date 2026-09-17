import { describe, it, expect } from 'vitest';
import { SessionStore } from '../src/sessions/sessionStore.js';
import { exportSessionJSON, exportSFTJSONL, exportPreferenceJSONL } from '../src/sessions/exportDataset.js';

describe('Sessions and Dataset Export', () => {
  it('records generations, candidates, and ancestry', () => {
    const store = new SessionStore();
    store.clearSession();

    const cands = [
      store.createCandidate({
        prompt: 'three red flowers',
        model: 'mock',
        medium: 'flat',
        program: { version: 1, actions: [{ op: 'circle', x: -0.2, y: 0, diameter: 0.2 }] }
      }),
      store.createCandidate({
        prompt: 'three red flowers',
        model: 'mock',
        medium: 'flat',
        program: { version: 1, actions: [{ op: 'circle', x: 0.2, y: 0, diameter: 0.2 }] }
      })
    ];

    store.addGeneration({ prompt: 'three red flowers', candidates: cands });
    expect(store.generations.length).toBe(1);
    expect(store.getCurrentCandidates().length).toBe(2);

    // Candidate 0 selected by default
    expect(store.getCurrentCandidates()[0].selected).toBe(true);

    // Select candidate 1
    store.selectCandidate(cands[1].id);
    expect(store.getCurrentCandidates()[1].selected).toBe(true);
    expect(store.getCurrentCandidates()[0].selected).toBe(false);
  });

  it('exports SFT and Preference datasets correctly', () => {
    const store = new SessionStore();
    store.clearSession();

    const c1 = store.createCandidate({
      prompt: 'a circle',
      model: 'mock',
      medium: 'flat',
      program: { version: 1, actions: [{ op: 'circle', x: 0, y: 0, diameter: 0.5 }] }
    });
    const c2 = store.createCandidate({
      prompt: 'a circle',
      model: 'mock',
      medium: 'flat',
      program: { version: 1, actions: [{ op: 'rect', x: 0, y: 0, width: 0.5, height: 0.5 }] }
    });

    store.addGeneration({ prompt: 'a circle', candidates: [c1, c2] });
    store.selectCandidate(c1.id);

    const sft = exportSFTJSONL(store, 'selected');
    expect(sft.length).toBeGreaterThan(0);
    const parsedSFT = JSON.parse(sft);
    expect(parsedSFT.messages[0].content).toBe('a circle');
    expect(parsedSFT.messages[1].content).toContain('circle');

    const pref = exportPreferenceJSONL(store);
    expect(pref.length).toBeGreaterThan(0);
    const parsedPref = JSON.parse(pref);
    expect(parsedPref.prompt).toBe('a circle');
    expect(parsedPref.chosen).toContain('circle');
    expect(parsedPref.rejected).toContain('rect');
  });
});
