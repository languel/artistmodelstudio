/**
 * Base Artist Abstract Class
 */

export class Artist {
  constructor(id, name, type = 'generic') {
    if (new.target === Artist) {
      throw new TypeError('Cannot construct Artist instances directly.');
    }
    this.id = id;
    this.name = name;
    this.type = type;
  }

  /**
   * Generate drawing candidates based on the request.
   * @param {Object} request
   * @param {string} request.prompt
   * @param {number} request.count - number of candidates (default 4)
   * @param {Object} request.mediumCapabilities - capabilities of active medium
   * @param {Object} [request.previousProgram] - parent program for contextual iteration
   * @param {string} [request.feedback] - critique feedback
   * @param {Object} [request.settings] - temperature, seed, model, etc.
   * @returns {Promise<Array<{ program: Object, generationTimeMs: number, rawResponse?: string, warnings?: string[] }>>}
   */
  async generate(request) {
    throw new Error('generate() must be implemented by subclass.');
  }
}
