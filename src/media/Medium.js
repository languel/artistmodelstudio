/**
 * Base Medium Abstract Class
 *
 * Defines the contract that all artistic media must satisfy.
 */

import { validateProgram } from '../language/validate.js';

export class Medium {
  constructor(id, name) {
    if (new.target === Medium) {
      throw new TypeError('Cannot construct Medium instances directly.');
    }
    this.id = id;
    this.name = name;
  }

  /**
   * Return the capabilities specification of this medium.
   * Tells the artist what operations, coordinate spaces, and extensions are supported.
   */
  capabilities() {
    return {
      id: this.id,
      name: this.name,
      coordinateSystem: 'normalized', // 'normalized' (-1..1) or 'pixel' (integers)
      core: [],
      extensions: []
    };
  }

  /**
   * Reset canvas state and options.
   */
  reset(config = {}) {
    // Override in subclass
  }

  /**
   * Render a drawing program to an image or canvas.
   * Returns: Promise<{ image: string | HTMLCanvasElement, width, height, warnings, executionTimeMs }>
   */
  async render(program) {
    throw new Error('render() must be implemented by subclass.');
  }

  /**
   * Get image snapshot as Blob.
   */
  async snapshot() {
    throw new Error('snapshot() must be implemented by subclass.');
  }

  /**
   * Validate program against this medium's capabilities.
   */
  validate(program) {
    return validateProgram(program, this.capabilities());
  }
}
