/**
 * Mock / Procedural Artist with Simulated Streaming & Canvas Iteration
 *
 * Provides immediate, deterministic, and highly responsive drawing generation
 * for zero-setup classroom testing, automated testing, and fallback use.
 */

import { Artist } from './Artist.js';
import { normalizeProgram } from '../language/normalize.js';
import { detectSubjectContext } from './promptBuilder.js';

export class MockArtist extends Artist {
  constructor() {
    super('mock', 'Procedural', 'procedural');
    this.progressiveDelayMs = 25; // Simulated progressive stroke delay for classroom feedback
  }

  getModel() {
    return 'procedural-master';
  }

  setModel() {}

  getAvailableModels() {
    return [{ id: 'procedural-master', name: 'Procedural Creative Coder (Default)' }];
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
    const ctx = detectSubjectContext(prompt);
    const p = (prompt || '').toLowerCase();

    if (ctx.domain === 'avian') {
      return this.generateAvianProgram(p, seed, isWatercolor);
    }
    if (ctx.domain === 'landscape') {
      return this.generateLandscapeProgram(p, seed, isWatercolor);
    }
    if (ctx.domain === 'abstract') {
      return this.generateAbstractProgram(p, seed, isWatercolor);
    }
    if (ctx.domain === 'creature') {
      return this.generateCreatureProgram(p, seed, isWatercolor);
    }
    if (ctx.domain === 'botanical' || p.includes('flower') || p.includes('rose') || p.includes('tree') || p.includes('plant')) {
      return this.generateFloralProgram(p, seed, isWatercolor);
    }

    return this.generateGeneralProgram(p, seed, isWatercolor);
  }

  generateAvianProgram(prompt, seed, isWatercolor) {
    const emerald = '#1b4332';
    const brightEmerald = '#2d6a4f';
    const rubyRed = '#d90429';
    const fuchsia = '#e01e5a';
    const fuchsiaLight = '#ff758f';
    const billColor = '#1a1a1a';
    const nectarGold = '#ffb703';
    const bgColor = isWatercolor ? '#faf7f2' : '#f8f8f8';

    const actions = [{ op: 'background', color: bgColor }];
    if (isWatercolor) {
      actions.push({ op: 'brush.bleed', amount: 0.2 + (seed * 0.05) });
      actions.push({ op: 'brush.texture', amount: 0.4 + (seed * 0.03) });
      if (seed === 2) actions.push({ op: 'brush.hatch', distance: 12, angle: 45 });
    }

    if (seed === 0) {
      actions.push({ op: 'stroke', color: '#2d6a4f', width: 2.5 });
      actions.push({ op: 'line', x1: 0.5, y1: -0.7, x2: 0.25, y2: -0.1 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: fuchsia, opacity: 0.9 });
      actions.push({ op: 'circle', x: 0.26, y: -0.06, diameter: 0.28 });
      actions.push({ op: 'fill', color: fuchsiaLight, opacity: 0.85 });
      actions.push({ op: 'circle', x: 0.22, y: -0.04, diameter: 0.18 });
      actions.push({ op: 'fill', color: nectarGold, opacity: 0.95 });
      actions.push({ op: 'circle', x: 0.18, y: -0.02, diameter: 0.06 });
      actions.push({ op: 'stroke', color: billColor, width: 2 });
      actions.push({ op: 'line', x1: -0.05, y1: -0.02, x2: 0.17, y2: -0.02 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: emerald, opacity: 0.95 });
      actions.push({ op: 'circle', x: -0.12, y: -0.03, diameter: 0.16 });
      actions.push({ op: 'fill', color: '#0d1b2a', opacity: 1.0 });
      actions.push({ op: 'circle', x: -0.1, y: -0.05, diameter: 0.04 });
      actions.push({ op: 'fill', color: rubyRed, opacity: 0.95 });
      actions.push({ op: 'circle', x: -0.08, y: 0.03, diameter: 0.12 });
      actions.push({ op: 'fill', color: brightEmerald, opacity: 0.9 });
      actions.push({ op: 'circle', x: -0.22, y: 0.08, diameter: 0.26 });
      actions.push({ op: 'fill', color: '#e9ecef', opacity: 0.7 });
      actions.push({ op: 'circle', x: -0.18, y: 0.12, diameter: 0.15 });
      actions.push({ op: 'fill', color: '#132a13', opacity: 0.8 });
      actions.push({ op: 'circle', x: -0.32, y: -0.16, diameter: 0.22 });
      actions.push({ op: 'circle', x: -0.26, y: -0.24, diameter: 0.16 });
      actions.push({ op: 'circle', x: -0.2, y: -0.32, diameter: 0.12 });
      actions.push({ op: 'stroke', color: '#132a13', width: 3 });
      actions.push({ op: 'line', x1: -0.32, y1: 0.18, x2: -0.52, y2: 0.38 });
      actions.push({ op: 'line', x1: -0.3, y1: 0.2, x2: -0.48, y2: 0.44 });
    } else if (seed === 1) {
      actions.push({ op: 'stroke', color: '#386641', width: 2 });
      actions.push({ op: 'line', x1: 0.45, y1: -0.6, x2: 0.3, y2: 0.05 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: fuchsia, opacity: 0.9 });
      actions.push({ op: 'circle', x: 0.3, y: 0.08, diameter: 0.32 });
      actions.push({ op: 'fill', color: '#ff4d6d', opacity: 0.85 });
      actions.push({ op: 'circle', x: 0.24, y: 0.08, diameter: 0.2 });
      actions.push({ op: 'stroke', color: billColor, width: 2.2 });
      actions.push({ op: 'line', x1: -0.02, y1: 0.06, x2: 0.22, y2: 0.07 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: emerald, opacity: 0.95 });
      actions.push({ op: 'circle', x: -0.1, y: 0.04, diameter: 0.18 });
      actions.push({ op: 'fill', color: rubyRed, opacity: 0.95 });
      actions.push({ op: 'circle', x: -0.05, y: 0.09, diameter: 0.13 });
      actions.push({ op: 'fill', color: '#111111', opacity: 1.0 });
      actions.push({ op: 'circle', x: -0.09, y: 0.02, diameter: 0.04 });
      actions.push({ op: 'fill', color: brightEmerald, opacity: 0.88 });
      actions.push({ op: 'circle', x: -0.22, y: 0.16, diameter: 0.28 });
      actions.push({ op: 'fill', color: '#1f4e38', opacity: 0.85 });
      actions.push({ op: 'circle', x: -0.18, y: -0.08, diameter: 0.24 });
      actions.push({ op: 'circle', x: -0.26, y: -0.18, diameter: 0.18 });
      actions.push({ op: 'stroke', color: '#112d1f', width: 2.5 });
      actions.push({ op: 'line', x1: -0.3, y1: 0.24, x2: -0.56, y2: 0.42 });
    } else if (seed === 2) {
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: fuchsia, opacity: 0.75 });
      actions.push({ op: 'circle', x: 0.35, y: -0.15, diameter: 0.22 });
      actions.push({ op: 'stroke', color: billColor, width: 1.8 });
      actions.push({ op: 'line', x1: 0.05, y1: -0.14, x2: 0.32, y2: -0.15 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: rubyRed, opacity: 0.95 });
      actions.push({ op: 'circle', x: 0.02, y: -0.11, diameter: 0.12 });
      actions.push({ op: 'fill', color: emerald, opacity: 0.85 });
      actions.push({ op: 'circle', x: -0.08, y: -0.12, diameter: 0.18 });
      actions.push({ op: 'circle', x: -0.22, y: -0.05, diameter: 0.24 });
      actions.push({ op: 'fill', color: brightEmerald, opacity: 0.7 });
      actions.push({ op: 'circle', x: -0.24, y: -0.28, diameter: 0.26 });
      actions.push({ op: 'stroke', color: emerald, width: 2 });
      actions.push({ op: 'line', x1: -0.3, y1: 0.02, x2: -0.52, y2: 0.18 });
    } else {
      actions.push({ op: 'stroke', color: '#40916c', width: 2.2 });
      actions.push({ op: 'line', x1: 0.5, y1: -0.7, x2: 0.35, y2: -0.25 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: fuchsia, opacity: 0.9 });
      actions.push({ op: 'circle', x: 0.35, y: -0.22, diameter: 0.25 });
      actions.push({ op: 'stroke', color: '#40916c', width: 2 });
      actions.push({ op: 'line', x1: 0.35, y1: -0.25, x2: 0.25, y2: 0.15 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: '#ff4d6d', opacity: 0.85 });
      actions.push({ op: 'circle', x: 0.25, y: 0.18, diameter: 0.22 });
      actions.push({ op: 'stroke', color: billColor, width: 2 });
      actions.push({ op: 'line', x1: 0.02, y1: -0.2, x2: 0.28, y2: -0.22 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: emerald, opacity: 0.95 });
      actions.push({ op: 'circle', x: -0.06, y: -0.18, diameter: 0.16 });
      actions.push({ op: 'fill', color: rubyRed, opacity: 0.95 });
      actions.push({ op: 'circle', x: -0.02, y: -0.14, diameter: 0.11 });
      actions.push({ op: 'fill', color: '#000000', opacity: 1.0 });
      actions.push({ op: 'circle', x: -0.05, y: -0.2, diameter: 0.035 });
      actions.push({ op: 'fill', color: brightEmerald, opacity: 0.9 });
      actions.push({ op: 'circle', x: -0.16, y: -0.1, diameter: 0.25 });
      actions.push({ op: 'fill', color: '#1b4332', opacity: 0.8 });
      actions.push({ op: 'circle', x: -0.24, y: -0.32, diameter: 0.22 });
      actions.push({ op: 'circle', x: -0.18, y: -0.42, diameter: 0.15 });
      actions.push({ op: 'stroke', color: '#1b4332', width: 2.5 });
      actions.push({ op: 'line', x1: -0.24, y1: -0.02, x2: -0.45, y2: 0.12 });
    }

    return { version: 1, actions };
  }

  generateLandscapeProgram(prompt, seed, isWatercolor) {
    const isSunset = prompt.includes('sunset') || prompt.includes('dawn') || prompt.includes('twilight');
    const skyBg = isSunset ? '#fdf2e9' : '#f0f9ff';
    const sunColor = isSunset ? '#ea580c' : '#f59e0b';
    const mountainDistant = isSunset ? '#7c3aed' : '#475569';
    const mountainMid = isSunset ? '#4338ca' : '#334155';
    const mountainFore = isSunset ? '#1e1b4b' : '#0f172a';
    const lakeColor = isSunset ? '#c084fc' : '#38bdf8';

    const actions = [
      { op: 'background', color: skyBg }
    ];
    if (isWatercolor) {
      actions.push({ op: 'brush.bleed', amount: 0.35 });
      actions.push({ op: 'brush.texture', amount: 0.45 });
    }

    // Glowing Sun or Moon
    actions.push({ op: 'noStroke' });
    actions.push({ op: 'fill', color: sunColor, opacity: 0.85 });
    actions.push({ op: 'circle', x: -0.2 + (seed * 0.15), y: -0.4, diameter: 0.32 });

    // Distant mountain ridge
    actions.push({ op: 'fill', color: mountainDistant, opacity: 0.65 });
    actions.push({
      op: 'polygon',
      points: [
        [-0.9, 0.2],
        [-0.4 + (seed * 0.05), -0.35],
        [0.1, 0.05],
        [0.6 + (seed * 0.05), -0.25],
        [0.95, 0.25],
        [0.95, 0.7],
        [-0.9, 0.7]
      ]
    });

    // Snow caps
    actions.push({ op: 'fill', color: '#ffffff', opacity: 0.8 });
    actions.push({
      op: 'polygon',
      points: [
        [-0.4 + (seed * 0.05), -0.35],
        [-0.32, -0.2],
        [-0.48, -0.2]
      ]
    });

    // Midground mountain ridge
    actions.push({ op: 'fill', color: mountainMid, opacity: 0.8 });
    actions.push({
      op: 'polygon',
      points: [
        [-0.85, 0.35],
        [-0.1, -0.1 + (seed * 0.05)],
        [0.4, 0.2],
        [0.85, 0.0],
        [0.9, 0.7],
        [-0.85, 0.7]
      ]
    });

    // Lake / Water plane
    actions.push({ op: 'fill', color: lakeColor, opacity: 0.6 });
    actions.push({ op: 'rect', x: -0.85, y: 0.38, width: 1.7, height: 0.32 });

    // Pine tree silhouettes
    actions.push({ op: 'stroke', color: mountainFore, width: 2.5 });
    actions.push({ op: 'line', x1: -0.65, y1: 0.3, x2: -0.65, y2: 0.65 });
    actions.push({ op: 'line', x1: -0.55, y1: 0.35, x2: -0.55, y2: 0.65 });
    actions.push({ op: 'line', x1: 0.6, y1: 0.32, x2: 0.6, y2: 0.65 });

    if (isWatercolor) {
      actions.push({ op: 'brush.hatch', distance: 10, angle: 0 });
      actions.push({ op: 'stroke', color: sunColor, width: 1.5 });
      actions.push({ op: 'line', x1: -0.3, y1: 0.45, x2: -0.1, y2: 0.45 });
      actions.push({ op: 'line', x1: -0.35, y1: 0.52, x2: -0.05, y2: 0.52 });
    }

    return { version: 1, actions };
  }

  generateAbstractProgram(prompt, seed, isWatercolor) {
    const bgColor = isWatercolor ? '#faf8f5' : '#18181b';
    const c1 = '#e11d48';
    const c2 = '#2563eb';
    const c3 = '#f59e0b';
    const cDark = isWatercolor ? '#0f172a' : '#f8fafc';

    const actions = [{ op: 'background', color: bgColor }];
    if (isWatercolor) {
      actions.push({ op: 'brush.bleed', amount: 0.25 });
      actions.push({ op: 'brush.texture', amount: 0.5 });
    }

    // Bauhaus primary circle
    actions.push({ op: 'noStroke' });
    actions.push({ op: 'fill', color: c1, opacity: 0.85 });
    actions.push({ op: 'circle', x: -0.2 + (seed * 0.1), y: -0.15, diameter: 0.45 });

    // Secondary balanced circle
    actions.push({ op: 'fill', color: c2, opacity: 0.75 });
    actions.push({ op: 'circle', x: 0.3 - (seed * 0.08), y: 0.2, diameter: 0.32 });

    // Floating gold accent
    actions.push({ op: 'fill', color: c3, opacity: 0.9 });
    actions.push({ op: 'circle', x: 0.15, y: -0.4, diameter: 0.12 });

    // Intersecting dynamic diagonal lines
    actions.push({ op: 'stroke', color: cDark, width: 3 });
    actions.push({ op: 'line', x1: -0.65, y1: 0.55, x2: 0.65, y2: -0.55 });
    actions.push({ op: 'stroke', color: cDark, width: 1.5 });
    actions.push({ op: 'line', x1: -0.5, y1: -0.45, x2: 0.5, y2: 0.45 });

    // Geometric rectangle
    actions.push({ op: 'noStroke' });
    actions.push({ op: 'fill', color: c3, opacity: 0.6 });
    actions.push({ op: 'rect', x: -0.45, y: 0.1, width: 0.25, height: 0.4 });

    // High contrast focal point
    actions.push({ op: 'fill', color: cDark, opacity: 1.0 });
    actions.push({ op: 'circle', x: 0.0, y: 0.0, diameter: 0.06 });

    return { version: 1, actions };
  }

  generateCreatureProgram(prompt, seed, isWatercolor) {
    const bgColor = isWatercolor ? '#faf7f2' : '#1e1e24';
    const bodyColor = '#1f2937';
    const eyeColor = '#eab308';
    const earInner = '#f472b6';

    const actions = [{ op: 'background', color: bgColor }];
    if (isWatercolor) {
      actions.push({ op: 'brush.bleed', amount: 0.3 });
      actions.push({ op: 'brush.texture', amount: 0.45 });
    }

    // Creature body mass
    actions.push({ op: 'noStroke' });
    actions.push({ op: 'fill', color: bodyColor, opacity: 0.9 });
    actions.push({ op: 'circle', x: 0.0 + (seed * 0.05), y: 0.15, diameter: 0.48 });

    // Head
    actions.push({ op: 'circle', x: 0.0 + (seed * 0.05), y: -0.2, diameter: 0.34 });

    // Ears
    actions.push({
      op: 'polygon',
      points: [
        [-0.14 + (seed * 0.05), -0.3],
        [-0.18 + (seed * 0.05), -0.48],
        [-0.04 + (seed * 0.05), -0.34]
      ]
    });
    actions.push({
      op: 'polygon',
      points: [
        [0.04 + (seed * 0.05), -0.34],
        [0.18 + (seed * 0.05), -0.48],
        [0.14 + (seed * 0.05), -0.3]
      ]
    });

    // Ear highlights
    actions.push({ op: 'fill', color: earInner, opacity: 0.8 });
    actions.push({
      op: 'polygon',
      points: [
        [-0.12 + (seed * 0.05), -0.32],
        [-0.15 + (seed * 0.05), -0.42],
        [-0.06 + (seed * 0.05), -0.34]
      ]
    });

    // Glowing Eyes
    actions.push({ op: 'fill', color: eyeColor, opacity: 0.95 });
    actions.push({ op: 'circle', x: -0.07 + (seed * 0.05), y: -0.22, diameter: 0.07 });
    actions.push({ op: 'circle', x: 0.07 + (seed * 0.05), y: -0.22, diameter: 0.07 });
    actions.push({ op: 'fill', color: '#000000', opacity: 1.0 });
    actions.push({ op: 'circle', x: -0.07 + (seed * 0.05), y: -0.22, diameter: 0.03 });
    actions.push({ op: 'circle', x: 0.07 + (seed * 0.05), y: -0.22, diameter: 0.03 });

    // Whiskers
    actions.push({ op: 'stroke', color: isWatercolor ? '#4b5563' : '#e5e7eb', width: 1.5 });
    actions.push({ op: 'line', x1: -0.08 + (seed * 0.05), y1: -0.16, x2: -0.35 + (seed * 0.05), y2: -0.18 });
    actions.push({ op: 'line', x1: -0.08 + (seed * 0.05), y1: -0.14, x2: -0.35 + (seed * 0.05), y2: -0.12 });
    actions.push({ op: 'line', x1: 0.08 + (seed * 0.05), y1: -0.16, x2: 0.35 + (seed * 0.05), y2: -0.18 });
    actions.push({ op: 'line', x1: 0.08 + (seed * 0.05), y1: -0.14, x2: 0.35 + (seed * 0.05), y2: -0.12 });

    // Tail arc
    actions.push({ op: 'stroke', color: bodyColor, width: 6 });
    actions.push({ op: 'line', x1: 0.15 + (seed * 0.05), y1: 0.32, x2: 0.45, y2: 0.15 });

    return { version: 1, actions };
  }

  generateFloralProgram(prompt, seed, isWatercolor) {
    const isRed = prompt.includes('red') || prompt.includes('rose') || prompt.includes('cherry');
    const isBlue = prompt.includes('blue') || prompt.includes('violet');
    const primaryColor = isRed ? '#ce526d' : (isBlue ? '#3a72a0' : '#4a8505');
    const secondaryColor = isRed ? '#e8899e' : (isBlue ? '#78a6cf' : '#88b54b');
    const stemColor = '#3e6341';
    const bgColor = isWatercolor ? '#faf7f2' : '#f5f5f5';

    const actions = [{ op: 'background', color: bgColor }];
    if (isWatercolor) {
      actions.push({ op: 'brush.bleed', amount: 0.2 + (seed * 0.05) });
      actions.push({ op: 'brush.texture', amount: 0.4 + (seed * 0.03) });
      if (seed === 2) actions.push({ op: 'brush.hatch', distance: 12, angle: 45 });
    }

    if (seed === 0) {
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
      actions.push({ op: 'stroke', color: '#2b442e', width: 1.5 });
      actions.push({ op: 'line', x1: -0.15, y1: -0.25, x2: -0.05, y2: 0.7 });
      actions.push({ op: 'noStroke' });
      actions.push({ op: 'fill', color: primaryColor, opacity: 0.75 });
      actions.push({ op: 'circle', x: -0.15, y: -0.25, diameter: 0.22 });
      actions.push({ op: 'fill', color: '#fff1a8', opacity: 0.9 });
      actions.push({ op: 'circle', x: -0.15, y: -0.25, diameter: 0.05 });
    } else {
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

    return { version: 1, actions };
  }

  generateGeneralProgram(prompt, seed, isWatercolor) {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      hash = ((hash << 5) - hash) + prompt.charCodeAt(i);
      hash |= 0;
    }
    const absHash = Math.abs(hash);

    const palettes = [
      { bg: '#faf7f2', p1: '#0284c7', p2: '#38bdf8', acc: '#f59e0b', stroke: '#0f172a' },
      { bg: '#faf5ff', p1: '#9333ea', p2: '#c084fc', acc: '#10b981', stroke: '#1e1b4b' },
      { bg: '#fffbeb', p1: '#d97706', p2: '#fbbf24', acc: '#e11d48', stroke: '#451a03' },
      { bg: '#f0fdf4', p1: '#059669', p2: '#34d399', acc: '#f97316', stroke: '#064e3b' }
    ];
    const pal = palettes[absHash % palettes.length];

    const actions = [{ op: 'background', color: pal.bg }];
    if (isWatercolor) {
      actions.push({ op: 'brush.bleed', amount: 0.3 });
      actions.push({ op: 'brush.texture', amount: 0.45 });
    }

    const xOffset = ((absHash % 10) / 20 - 0.25) + (seed * 0.08);
    const yOffset = ((absHash % 7) / 20 - 0.15);

    actions.push({ op: 'stroke', color: pal.stroke, width: 2.5 });
    actions.push({ op: 'line', x1: -0.4 + xOffset, y1: 0.5, x2: 0.1 + xOffset, y2: -0.2 + yOffset });
    actions.push({ op: 'line', x1: 0.2 + xOffset, y1: 0.5, x2: -0.2 + xOffset, y2: -0.1 + yOffset });

    actions.push({ op: 'noStroke' });
    actions.push({ op: 'fill', color: pal.p1, opacity: 0.85 });
    actions.push({ op: 'circle', x: 0.1 + xOffset, y: -0.2 + yOffset, diameter: 0.36 });

    actions.push({ op: 'fill', color: pal.p2, opacity: 0.75 });
    actions.push({ op: 'circle', x: -0.2 + xOffset, y: -0.1 + yOffset, diameter: 0.28 });

    actions.push({ op: 'fill', color: pal.acc, opacity: 0.95 });
    actions.push({ op: 'circle', x: 0.1 + xOffset, y: -0.2 + yOffset, diameter: 0.1 });
    actions.push({ op: 'circle', x: -0.2 + xOffset, y: -0.1 + yOffset, diameter: 0.07 });

    return { version: 1, actions };
  }

  generatePixelProgram(prompt, seed, capabilities) {
    const cols = capabilities?.dimensions?.cols || 32;
    const rows = capabilities?.dimensions?.rows || 48;
    const p = (prompt || '').toLowerCase();
    const isWeapon = p.includes('sword') || p.includes('dagger') || p.includes('blade');
    const isPotion = p.includes('potion') || p.includes('bottle') || p.includes('crystal');
    const isLandscape = p.includes('mountain') || p.includes('sun') || p.includes('landscape');

    let palette = ['#16151c', '#5c3330', '#ce526d', '#f2a874', '#fff3d6'];
    if (isWeapon) {
      palette = ['#0f172a', '#334155', '#94a3b8', '#38bdf8', '#ffffff'];
    } else if (isPotion) {
      palette = ['#1e1b4b', '#4338ca', '#818cf8', '#a855f7', '#f43f5e'];
    } else if (isLandscape) {
      palette = ['#0c4a6e', '#0369a1', '#0284c7', '#f59e0b', '#fef08a'];
    }

    const actions = [
      { op: 'palette', colors: palette },
      { op: 'background', color: 0 },
      { op: 'mirrorX', enabled: !isLandscape && seed % 2 === 0 }
    ];

    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2) + (seed * 2 - 3);

    if (isWeapon) {
      actions.push({ op: 'vline', x: centerX, y1: 8, y2: 34, color: 3 });
      actions.push({ op: 'vline', x: centerX + 1, y1: 10, y2: 32, color: 4 });
      actions.push({ op: 'hline', y: 34, x1: centerX - 6, x2: centerX + 6, color: 1 });
      actions.push({ op: 'vline', x: centerX, y1: 35, y2: 42, color: 2 });
      actions.push({ op: 'pixel', x: centerX, y: 43, color: 4 });
    } else if (isPotion) {
      actions.push({ op: 'rect', x: centerX - 2, y: 12, width: 4, height: 4, color: 1 });
      actions.push({ op: 'rect', x: centerX - 6, y: 16, width: 12, height: 16, color: 2 });
      actions.push({ op: 'rect', x: centerX - 5, y: 20, width: 10, height: 11, color: 3 });
      actions.push({ op: 'pixel', x: centerX - 3, y: 22, color: 4 });
    } else if (isLandscape) {
      actions.push({ op: 'pixel', x: 24, y: 10, color: 3 });
      actions.push({ op: 'pixel', x: 25, y: 10, color: 4 });
      actions.push({ op: 'line', color: 1, x1: 0, y1: 36, x2: 16, y2: 20 });
      actions.push({ op: 'line', color: 1, x1: 16, y1: 20, x2: 32, y2: 36 });
      actions.push({ op: 'hline', y: 37, x1: 0, x2: cols - 1, color: 2 });
    } else {
      actions.push({ op: 'rect', x: centerX - 4, y: centerY - 4, width: 8, height: 8, color: 2 });
      actions.push({ op: 'rect', x: centerX - 2, y: centerY - 2, width: 4, height: 4, color: 3 });
      actions.push({ op: 'pixel', x: centerX, y: centerY, color: 4 });
      actions.push({ op: 'vline', x: centerX, y1: centerY + 4, y2: centerY + 16, color: 1 });
      actions.push({ op: 'hline', y: centerY + 10, x1: centerX - 4, x2: centerX, color: 1 });
    }

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
