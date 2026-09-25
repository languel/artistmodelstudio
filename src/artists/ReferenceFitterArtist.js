/**
 * Reference Fitter Artist
 *
 * A non-learned generator: approximates the loaded reference image with Core
 * DSL shapes by greedy search (same idea as Michael Fogleman's "primitive").
 * The "model" choice is the shape budget, which works as an abstraction dial.
 * Candidates A–D use different shape vocabularies so one round shows how the
 * vocabulary changes the look.
 *
 * With a parent program (refine / vary), it continues from the parent's
 * render and appends new shapes, so a coarse fit can be refined further.
 */
import { Artist } from './Artist.js';
import { ReferenceFitter, canvasToRGB } from '../fitting/fitReference.js';
import { FlatCanvasMedium } from '../media/FlatCanvasMedium.js';
import { normalizeProgram } from '../language/normalize.js';
import { letterbox } from '../fitting/referenceSource.js';

const FIT_SIZE = 192;

export const FITTER_BUDGETS = [
  { id: 'fit-12', shapes: 12, name: '12 shapes · sketch' },
  { id: 'fit-40', shapes: 40, name: '40 shapes · abstraction' },
  { id: 'fit-120', shapes: 120, name: '120 shapes · study' },
  { id: 'fit-300', shapes: 300, name: '300 shapes · mosaic' },
  { id: 'fit-800', shapes: 800, name: '800 shapes · dense mosaic' }
];

export const FITTER_VOCABULARIES = [
  { label: 'mixed', shapes: ['rect', 'triangle', 'circle'] },
  { label: 'rectangles', shapes: ['rect'] },
  { label: 'circles', shapes: ['circle'] },
  { label: 'triangles', shapes: ['triangle'] }
];

/** Fitting dimensions for a canvas aspect (width / height), with `long` pixels on the long side. */
export function fitDims(aspect = 1, long = FIT_SIZE) {
  return aspect >= 1 ? [long, Math.max(8, Math.round(long / aspect))] : [Math.max(8, Math.round(long * aspect)), long];
}

/** Letterbox an image into a size×size canvas (kept for the probe/distill pages). */
export function squareTarget(image, size = FIT_SIZE) {
  return fitTarget(image, size, size);
}

/**
 * Place an image into a w×h canvas (cover / contain / stretch, see
 * referenceSource.letterbox). Contain pads with the image's mean color.
 */
export function fitTarget(image, w, h, fit = 'contain') {
  return letterbox(image, w, h, fit);
}

export class ReferenceFitterArtist extends Artist {
  constructor() {
    super('fitter', 'Reference Fitter', 'procedural');
    this.model = 'fit-40';
    this.reference = null; // { image, name, source }
    this.runCounter = 0;
    this.aspect = 1; // canvas width / height, set by the studio
    this.fit = 'cover'; // how the reference is placed when aspects differ
  }

  setFit(fit) {
    if (['cover', 'contain', 'stretch'].includes(fit)) this.fit = fit;
  }

  setCanvasAspect(aspect) {
    this.aspect = aspect > 0 ? aspect : 1;
  }

  getModel() {
    return this.model;
  }

  setModel(id) {
    if (FITTER_BUDGETS.some(b => b.id === id)) this.model = id;
  }

  getAvailableModels() {
    return FITTER_BUDGETS.map(b => ({ id: b.id, name: b.name }));
  }

  setReference(reference) {
    this.reference = reference;
  }

  async generate(request) {
    if (!this.reference?.image) {
      throw new Error('Reference Fitter needs a reference image. Open the Reference tab and choose or upload one.');
    }

    const budget = FITTER_BUDGETS.find(b => b.id === this.model) || FITTER_BUDGETS[1];
    const count = Math.min(request.count || 4, FITTER_VOCABULARIES.length);
    const [fw, fh] = fitDims(this.aspect);
    const target = canvasToRGB(fitTarget(this.reference.image, fw, fh, this.fit));
    const baseSeed = Number(request.settings?.seed ?? 0) || (Date.now() % 100000) + ++this.runCounter;

    // Continue from a parent program when refining.
    let parentActions = null;
    let start = null;
    let background = null;
    if (request.previousProgram?.actions?.length) {
      const parent = normalizeProgram(request.previousProgram);
      parentActions = parent.actions;
      const flat = new FlatCanvasMedium({ width: fw, height: fh });
      const out = await flat.render(parent);
      start = canvasToRGB(out.canvas);
      background = parent.actions.find(a => a.op === 'background')?.color || null;
    }

    request.onProgress?.({
      type: 'start',
      model: budget.name,
      endpoint: 'local-fitter',
      totalCandidates: count,
      message: `Fitting "${this.reference.name}" with ${budget.shapes} shapes per candidate${parentActions ? ' on top of the parent' : ''}...`
    });

    const candidates = [];
    for (let c = 0; c < count; c++) {
      if (request.signal?.aborted) {
        request.onProgress?.({ type: 'aborted', candidateIndex: c, message: `Fitting interrupted after ${candidates.length} candidate(s).` });
        break;
      }
      const vocab = FITTER_VOCABULARIES[c];
      const t0 = performance.now();
      request.onProgress?.({
        type: 'candidate_start',
        candidateIndex: c,
        model: budget.name,
        message: `Candidate ${String.fromCharCode(65 + c)}: ${vocab.label}, ${budget.shapes} shapes...`
      });

      const fitter = new ReferenceFitter(target, fw, fh, { seed: baseSeed * 7 + c, shapes: vocab.shapes, start, background });
      const buildProgram = () => parentActions
        ? { version: 1, actions: [...parentActions, { op: 'noStroke' }, ...fitter.shapeActions()] }
        : fitter.toProgram();

      const streamEvery = Math.max(4, Math.round(budget.shapes / 10));
      for (let misses = 0; fitter.shapes.length < budget.shapes && misses < 25;) {
        if (request.signal?.aborted) break;
        if (!fitter.step()) { misses++; continue; }
        misses = 0;
        if (fitter.shapes.length % streamEvery === 0) {
          await request.onPartialCandidate?.({ candidateIndex: c, partialProgram: buildProgram(), actionCount: fitter.shapes.length });
          await new Promise(r => setTimeout(r, 0)); // keep the UI responsive
        }
      }

      const program = buildProgram();
      const candidate = {
        candidateIndex: c,
        directive: vocab.label,
        program,
        generationTimeMs: Math.round(performance.now() - t0),
        rawResponse: `Reference Fitter · ${this.reference.name} · ${vocab.label} · ${fitter.shapes.length} shapes · seed ${baseSeed * 7 + c} · pixel RMSE ${fitter.currentRMSE().toFixed(1)}`,
        warnings: []
      };
      candidates.push(candidate);
      await request.onCandidateComplete?.({ candidateIndex: c, candidate });
    }
    return candidates;
  }
}
