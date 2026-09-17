/**
 * Media Registry
 *
 * Provides swappable access to all available rendering media.
 */

import { FlatCanvasMedium } from './FlatCanvasMedium.js';
import { WatercolorMedium } from './WatercolorMedium.js';
import { PixelMedium } from './PixelMedium.js';

export class MediaRegistry {
  constructor() {
    this.media = new Map();
    this.register(new FlatCanvasMedium());
    this.register(new WatercolorMedium());
    this.register(new PixelMedium());
  }

  register(medium) {
    if (!medium || !medium.id) {
      throw new Error('Medium must have an "id" property.');
    }
    this.media.set(medium.id, medium);
  }

  get(id) {
    return this.media.get(id);
  }

  has(id) {
    return this.media.has(id);
  }

  list() {
    return Array.from(this.media.values()).map(m => ({
      id: m.id,
      name: m.name,
      capabilities: m.capabilities()
    }));
  }

  getAll() {
    return Array.from(this.media.values());
  }
}

export const defaultMediaRegistry = new MediaRegistry();
