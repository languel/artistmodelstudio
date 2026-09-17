/**
 * Mock / Procedural Artist with Simulated Streaming & Canvas Iteration
 *
 * Provides immediate, deterministic, and highly responsive drawing generation
 * for zero-setup classroom testing, automated testing, and fallback use.
 */

import { Artist } from './Artist.js';
import { normalizeProgram } from '../language/normalize.js';

export class MockArtist extends Artist {
  constructor() {
    super('mock', 'Procedural Artist (Instant/Offline)', 'procedural');
    this.progressiveDelayMs = 25; // Simulated progressive stroke delay for classroom feedback
  }

  async generate(request) {
    const count = request.count || 4;
    const prompt = (request.prompt || 'three red flowers').toLowerCase();
    const isPixel = request.mediumCapabilities?.coordinateSystem === 'pixel';
    const isWatercolor = request.mediumCapabilities?.id === 'watercolor';

    request.onProgress?.({
      type: 'start',
      model: this.name,
      endpoint: 'local-mock',
      totalCandidates: count,
      message: `Running Procedural Artist engine for "${prompt}"...`
    });

    const candidates = [];

    for (let i = 0; i < count; i++) {
      if (request.signal?.aborted) {
        request.onProgress?.({
          type: 'aborted',
          candidateIndex: i,
          message: `Procedural generation interrupted by user after ${candidates.length} candidate(s).`
        });
        break;
      }

      const startTime = performance.now();
      const variantSeed = i;

      request.onProgress?.({
        type: 'candidate_start',
        candidateIndex: i,
        model: this.name,
        message: `Synthesizing Candidate ${String.fromCharCode(65 + i)} (${i + 1}/${count})...`
      });

      let program;
      if (request.feedback && request.previousProgram) {
        program = this.applyCritique(request.previousProgram, request.feedback, variantSeed, isPixel);
      } else if (request.previousProgram) {
        program = this.generateVariation(request.previousProgram, variantSeed, isPixel);
      } else if (isPixel) {
        program = this.generatePixelProgram(prompt, variantSeed, request.mediumCapabilities);
      } else {
        program = this.generateVectorProgram(prompt, variantSeed, isWatercolor);
      }

      const normalized = normalizeProgram(program);
      const actions = normalized.actions || [];

      // Simulate progressive real-time stroke iteration if callbacks are provided
      if (request.onPartialCandidate && this.progressiveDelayMs > 0) {
        for (let a = 1; a <= actions.length; a += Math.max(1, Math.floor(actions.length / 5))) {
          if (request.signal?.aborted) break;
          const subActions = actions.slice(0, a);
          request.onPartialCandidate({
            candidateIndex: i,
            partialProgram: { version: 1, actions: subActions },
            actionCount: subActions.length,
            rawText: JSON.stringify({ version: 1, actions: subActions })
          });
          // Non-blocking tiny sleep for visual persistence
          await new Promise(r => setTimeout(r, this.progressiveDelayMs));
        }
      }

      const generationTimeMs = Math.max(1, Math.round(performance.now() - startTime));
      const candObj = {
        program: normalized,
        generationTimeMs,
        rawResponse: JSON.stringify(normalized, null, 2),
        warnings: []
      };

      candidates.push(candObj);

      request.onCandidateComplete?.({
        candidateIndex: i,
        candidate: candObj
      });
    }

    return candidates;
  }

  generateVectorProgram(prompt, seed, isWatercolor) {
    const isRed = prompt.includes('red') || prompt.includes('rose') || prompt.includes('cherry');
    const isBlue = prompt.includes('blue') || prompt.includes('sky') || prompt.includes('ocean');
    const isFlower = prompt.includes('flower') || prompt.includes('blossom') || prompt.includes('plant') || !prompt.includes('mountain');

    const primaryColor = isRed ? '#ce526d' : isBlue ? '#3a72a0' : '#4a8505';
    const secondaryColor = isRed ? '#e8899e' : isBlue ? '#78a6cf' : '#88b54b';
    const stemColor = '#3e6341';
    const bgColor = isWatercolor ? '#faf7f2' : '#f5f5f5';

    const actions = [
      { op: 'background', color: bgColor }
    ];

    if (isWatercolor) {
      actions.push({ op: 'brush.bleed', amount: 0.2 + (seed * 0.05) });
      actions.push({ op: 'brush.texture', amount: 0.4 + (seed * 0.03) });
      if (seed === 2) {
        actions.push({ op: 'brush.hatch', distance: 12, angle: 45 });
      }
    }

    if (isFlower) {
      if (seed === 0) {
        // Candidate A: Classic & Balanced (3 upright harmonious flowers)
        const numFlowers = 3;
        for (let f = 0; f < numFlowers; f++) {
          const xOffset = -0.45 + f * 0.45;
          const yOffset = -0.1 + (f === 1 ? -0.1 : 0.05);

          actions.push({ op: 'stroke', color: stemColor, width: 2.5 });
          actions.push({ op: 'line', x1: xOffset, y1: yOffset, x2: xOffset, y2: 0.65 });

          actions.push({ op: 'noStroke' });
          actions.push({ op: 'fill', color: f === 1 ? primaryColor : secondaryColor, opacity: 0.85 });
          actions.push({ op: 'circle', x: xOffset, y: yOffset, diameter: f === 1 ? 0.35 : 0.25 });

          actions.push({ op: 'fill', color: '#ffde59', opacity: 0.95 });
          actions.push({ op: 'circle', x: xOffset, y: yOffset, diameter: 0.08 });
        }
      } else if (seed === 1) {
        // Candidate B: Dynamic & Expressive (Dramatic leftward bending arc, dynamic windswept stems)
        actions.push({ op: 'stroke', color: stemColor, width: 3.5 });
        actions.push({ op: 'line', x1: -0.6, y1: -0.2, x2: 0.1, y2: 0.65 });
        actions.push({ op: 'line', x1: -0.3, y1: -0.05, x2: 0.25, y2: 0.65 });

        actions.push({ op: 'noStroke' });
        actions.push({ op: 'fill', color: primaryColor, opacity: 0.9 });
        actions.push({ op: 'circle', x: -0.6, y: -0.2, diameter: 0.4 });
        actions.push({ op: 'fill', color: secondaryColor, opacity: 0.8 });
        actions.push({ op: 'circle', x: -0.3, y: -0.05, diameter: 0.28 });

        actions.push({ op: 'fill', color: '#ffea79', opacity: 0.9 });
        actions.push({ op: 'circle', x: -0.6, y: -0.2, diameter: 0.1 });
        actions.push({ op: 'circle', x: -0.3, y: -0.05, diameter: 0.07 });
      } else if (seed === 2) {
        // Candidate C: Minimalist & Airy (Single solitary bloom with generous negative space)
        actions.push({ op: 'stroke', color: '#2b442e', width: 1.5 });
        actions.push({ op: 'line', x1: -0.15, y1: -0.25, x2: -0.05, y2: 0.7 });

        actions.push({ op: 'noStroke' });
        actions.push({ op: 'fill', color: primaryColor, opacity: 0.75 });
        actions.push({ op: 'circle', x: -0.15, y: -0.25, diameter: 0.22 });

        actions.push({ op: 'fill', color: '#fff1a8', opacity: 0.9 });
        actions.push({ op: 'circle', x: -0.15, y: -0.25, diameter: 0.05 });
      } else {
        // Candidate D: Intricate & Layered (Cluster of 5 blossoms with rich varied scales)
        const flowers = [
          { x: -0.5, y: 0.1, d: 0.22, c: secondaryColor },
          { x: -0.25, y: -0.2, d: 0.32, c: primaryColor },
          { x: 0.05, y: 0.05, d: 0.26, c: secondaryColor },
          { x: 0.3, y: -0.15, d: 0.28, c: primaryColor },
          { x: 0.5, y: 0.15, d: 0.2, c: secondaryColor }
        ];

        for (const fl of flowers) {
          actions.push({ op: 'stroke', color: stemColor, width: 2 });
          actions.push({ op: 'line', x1: fl.x, y1: fl.y, x2: fl.x * 0.5, y2: 0.7 });
          actions.push({ op: 'noStroke' });
          actions.push({ op: 'fill', color: fl.c, opacity: 0.85 });
          actions.push({ op: 'circle', x: fl.x, y: fl.y, diameter: fl.d });
          actions.push({ op: 'fill', color: '#ffde59', opacity: 0.9 });
          actions.push({ op: 'circle', x: fl.x, y: fl.y, diameter: fl.d * 0.3 });
        }
      }
    } else {
      actions.push({ op: 'fill', color: primaryColor, opacity: 0.8 });
      actions.push({
        op: 'polygon',
        points: [
          [-0.8 + seed * 0.05, 0.4],
          [-0.3 + seed * 0.05, -0.3],
          [0.2 + seed * 0.05, 0.4]
        ]
      });
      actions.push({ op: 'fill', color: secondaryColor, opacity: 0.7 });
      actions.push({
        op: 'polygon',
        points: [
          [-0.2, 0.4],
          [0.4, -0.2],
          [0.8, 0.4]
        ]
      });
    }

    return { version: 1, actions };
  }

  generatePixelProgram(prompt, seed, capabilities) {
    const cols = capabilities?.dimensions?.cols || 32;
    const rows = capabilities?.dimensions?.rows || 48;

    const palette = [
      '#16151c',
      '#693a32',
      '#c95267',
      '#e3b86c',
      '#eee4c8'
    ];

    const actions = [
      { op: 'palette', colors: palette },
      { op: 'background', color: 0 },
      { op: 'mirrorX', enabled: seed % 2 === 0 }
    ];

    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2) + (seed * 2 - 3);

    actions.push({ op: 'rect', x: centerX - 4, y: centerY - 4, width: 8, height: 8, color: 2 });
    actions.push({ op: 'rect', x: centerX - 2, y: centerY - 2, width: 4, height: 4, color: 3 });
    actions.push({ op: 'pixel', x: centerX, y: centerY, color: 4 });

    actions.push({ op: 'vline', x: centerX, y1: centerY + 4, y2: centerY + 16, color: 1 });
    actions.push({ op: 'hline', y: centerY + 10, x1: centerX - 4, x2: centerX, color: 1 });

    return { version: 1, actions };
  }

  generateVariation(parentProgram, seed, isPixel) {
    const actions = JSON.parse(JSON.stringify(parentProgram.actions || []));

    return {
      version: 1,
      actions: actions.map(act => {
        const copy = { ...act };
        const jitter = (seed - 1.5) * 0.06;

        if (isPixel) {
          if (copy.x !== undefined) copy.x = Math.round(copy.x + (seed % 2 === 0 ? 1 : -1));
          if (copy.y !== undefined) copy.y = Math.round(copy.y + (seed > 1 ? 1 : -1));
        } else {
          if (copy.x !== undefined) copy.x = Number((copy.x + jitter).toFixed(3));
          if (copy.y !== undefined) copy.y = Number((copy.y + jitter * 0.5).toFixed(3));
          if (copy.diameter !== undefined) copy.diameter = Math.max(0.05, Number((copy.diameter * (1 + jitter * 0.5)).toFixed(3)));
          if (copy.width !== undefined) copy.width = Math.max(0.05, Number((copy.width * (1 + jitter * 0.5)).toFixed(3)));
        }

        return copy;
      })
    };
  }

  applyCritique(parentProgram, feedback, seed, isPixel) {
    const actions = JSON.parse(JSON.stringify(parentProgram.actions || []));
    const crit = feedback.toLowerCase();

    const shiftLeft = crit.includes('left');
    const moreSpace = crit.includes('empty') || crit.includes('space') || crit.includes('sparse');
    const redder = crit.includes('red');

    return {
      version: 1,
      actions: actions.map(act => {
        const copy = { ...act };
        if (shiftLeft) {
          if (copy.x !== undefined) copy.x = isPixel ? copy.x - 3 : copy.x - 0.2;
          if (copy.x1 !== undefined) copy.x1 = isPixel ? copy.x1 - 3 : copy.x1 - 0.2;
          if (copy.x2 !== undefined) copy.x2 = isPixel ? copy.x2 - 3 : copy.x2 - 0.2;
        }
        if (moreSpace) {
          if (copy.diameter !== undefined) copy.diameter = copy.diameter * 0.75;
          if (copy.width !== undefined && copy.op !== 'palette') copy.width = copy.width * 0.75;
          if (copy.height !== undefined) copy.height = copy.height * 0.75;
        }
        if (redder) {
          if (copy.color && typeof copy.color === 'string' && copy.color.startsWith('#') && copy.op !== 'background') {
            copy.color = '#e0284f';
          }
        }
        return copy;
      })
    };
  }
}
