import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '../src/artists/promptBuilder.js';
import { MockArtist } from '../src/artists/MockArtist.js';
import { defaultArtistRegistry } from '../src/artists/artistRegistry.js';

describe('Artist Layer', () => {
  it('builds proper system prompts per medium', () => {
    const flatCaps = { id: 'flat', coordinateSystem: 'normalized', core: ['circle'] };
    const flatPrompt = buildSystemPrompt(flatCaps);
    expect(flatPrompt).toContain('-1.0 to 1.0');
    expect(flatPrompt).not.toContain('WATERCOLOR EXTENSIONS');

    const waterCaps = { id: 'watercolor', coordinateSystem: 'normalized', core: ['circle'], extensions: ['brush.bleed'] };
    const waterPrompt = buildSystemPrompt(waterCaps);
    expect(waterPrompt).toContain('WATERCOLOR EXTENSIONS');
    expect(waterPrompt).toContain('brush.bleed');

    const pixelCaps = { id: 'pixel', coordinateSystem: 'pixel', dimensions: { cols: 32, rows: 48 } };
    const pixelPrompt = buildSystemPrompt(pixelCaps);
    expect(pixelPrompt).toContain('32x48 pixel grid');
    expect(pixelPrompt).toContain('mirrorX');
  });

  it('MockArtist generates 4 candidates for vector media', async () => {
    const artist = new MockArtist();
    const candidates = await artist.generate({
      prompt: 'three red flowers',
      count: 4,
      mediumCapabilities: { id: 'flat', coordinateSystem: 'normalized' }
    });

    expect(candidates.length).toBe(4);
    for (const cand of candidates) {
      expect(cand.program.version).toBe(1);
      expect(cand.program.actions.length).toBeGreaterThan(3);
      expect(cand.generationTimeMs).toBeGreaterThan(0);
    }
  });

  it('MockArtist generates pixel candidates for pixel media', async () => {
    const artist = new MockArtist();
    const candidates = await artist.generate({
      prompt: 'red flower sprite',
      count: 4,
      mediumCapabilities: { id: 'pixel', coordinateSystem: 'pixel', dimensions: { cols: 32, rows: 48 } }
    });

    expect(candidates.length).toBe(4);
    const actions = candidates[0].program.actions;
    const ops = actions.map(a => a.op);
    expect(ops).toContain('palette');
    expect(ops).toContain('rect');
  });

  it('MockArtist generates variations maintaining parent lineage', async () => {
    const artist = new MockArtist();
    const parent = {
      version: 1,
      actions: [
        { op: 'background', color: '#ffffff' },
        { op: 'circle', x: 0, y: 0, diameter: 0.5 }
      ]
    };

    const candidates = await artist.generate({
      prompt: 'a circle',
      count: 4,
      previousProgram: parent,
      mediumCapabilities: { id: 'flat', coordinateSystem: 'normalized' }
    });

    expect(candidates.length).toBe(4);
    // Actions should vary slightly around 0, 0
    expect(candidates[0].program.actions[1].op).toBe('circle');
  });

  it('artist registry lists all artists', () => {
    const list = defaultArtistRegistry.list();
    const ids = list.map(a => a.id);
    expect(ids).toContain('mock');
    expect(ids).toContain('ollama');
    expect(ids).toContain('webgpu');
  });
});
