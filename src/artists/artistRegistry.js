/**
 * Artist Registry
 *
 * Manages swappable AI and procedural drawing generators.
 */

import { MockArtist } from './MockArtist.js';
import { OllamaArtist } from './OllamaArtist.js';
import { WebGPUTransformersArtist } from './WebGPUTransformersArtist.js';
import { OpenRouterArtist } from './OpenRouterArtist.js';
import { OpenAICompatibleArtist } from './OpenAICompatibleArtist.js';
import { TrainedModelArtist } from './TrainedModelArtist.js';

export class ArtistRegistry {
  constructor() {
    this.artists = new Map();

    const mock = new MockArtist();
    const ollama = new OllamaArtist();
    const webgpu = new WebGPUTransformersArtist();
    const openrouter = new OpenRouterArtist();
    const openai = new OpenAICompatibleArtist();
    const trained = new TrainedModelArtist();

    this.register(mock);
    this.register(openrouter);
    this.register(openai);
    this.register(ollama);
    this.register(webgpu);
    this.register(trained);

    // Default to mock for instant reliability, user or settings can switch
    this.activeId = 'mock';
  }

  register(artist) {
    if (!artist || !artist.id) throw new Error('Artist requires an id property.');
    this.artists.set(artist.id, artist);
  }

  get(id) {
    return this.artists.get(id);
  }

  getActive() {
    return this.artists.get(this.activeId) || this.artists.get('mock');
  }

  setActive(id) {
    if (this.artists.has(id)) {
      this.activeId = id;
    }
  }

  list() {
    return Array.from(this.artists.values()).map(a => ({
      id: a.id,
      name: a.name,
      type: a.type
    }));
  }
}

export const defaultArtistRegistry = new ArtistRegistry();
