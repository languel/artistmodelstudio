/**
 * Mock / Procedural Artist
 *
 * Provides immediate, deterministic, and highly responsive drawing generation
 * for zero-setup classroom testing, automated testing, and fallback use.
 */

import { Artist } from './Artist.js';
import { normalizeProgram } from '../language/normalize.js';

export class MockArtist extends Artist {
  constructor() {
    super('mock', 'Procedural Artist (Instant/Offline)', 'procedural');
  }

  async generate(request) {
    const count = request.count || 4;
    const prompt = (request.prompt || 'three red flowers').toLowerCase();
    const isPixel = request.mediumCapabilities?.coordinateSystem === 'pixel';
    const isWatercolor = request.mediumCapabilities?.id === 'watercolor';

    const candidates = [];

    for (let i = 0; i < count; i++) {
      const startTime = performance.now();
      const variantSeed = i;

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

      const generationTimeMs = Math.round(performance.now() - startTime) + Math.round(Math.random() * 20 + 10);

      candidates.push({
        program: normalizeProgram(program),
        generationTimeMs,
        rawResponse: JSON.stringify(program, null, 2),
        warnings: []
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
      // Draw 3 flowers bending left or centered
      const numFlowers = 3;
      for (let f = 0; f < numFlowers; f++) {
        const xOffset = -0.5 + f * 0.45 + (seed * 0.04 - 0.06);
        const yOffset = -0.1 + (seed % 2 === 0 ? 0.05 : -0.05) * f;
        const stemLean = -0.15 - (seed * 0.03);

        // Stem
        actions.push({ op: 'stroke', color: stemColor, width: 2.5 });
        actions.push({
          op: 'line',
          x1: xOffset,
          y1: yOffset,
          x2: xOffset - stemLean,
          y2: 0.65
        });

        // Flower Blossom
        actions.push({ op: 'noStroke' });
        actions.push({ op: 'fill', color: f % 2 === 0 ? primaryColor : secondaryColor, opacity: 0.85 });
        actions.push({
          op: 'circle',
          x: xOffset,
          y: yOffset,
          diameter: 0.25 + (f === 1 ? 0.08 : 0) + (seed * 0.02)
        });

        // Petals or center
        actions.push({ op: 'fill', color: '#ffde59', opacity: 0.9 });
        actions.push({
          op: 'circle',
          x: xOffset,
          y: yOffset,
          diameter: 0.08
        });
      }
    } else {
      // Landscape or geometric composition
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
      '#16151c', // 0: dark bg
      '#693a32', // 1: stem/dark red
      '#c95267', // 2: bright red/petal
      '#e3b86c', // 3: warm gold
      '#eee4c8'  // 4: highlights
    ];

    const actions = [
      { op: 'palette', colors: palette },
      { op: 'background', color: 0 },
      { op: 'mirrorX', enabled: seed % 2 === 0 }
    ];

    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2) + (seed * 2 - 3);

    // Blossom / sprite body
    actions.push({ op: 'rect', x: centerX - 4, y: centerY - 4, width: 8, height: 8, color: 2 });
    actions.push({ op: 'rect', x: centerX - 2, y: centerY - 2, width: 4, height: 4, color: 3 });
    actions.push({ op: 'pixel', x: centerX, y: centerY, color: 4 });

    // Stem
    actions.push({ op: 'vline', x: centerX, y1: centerY + 4, y2: centerY + 16, color: 1 });
    // Leaf
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
