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

/**
 * Letterbox an image into a size×size canvas padded with its mean colour, so
 * the fit fills AMS's square canvas without distorting the reference.
 */
export function squareTarget(image, size = FIT_SIZE) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(image, 0, 0, 1, 1);
  const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);
  const k = size / Math.max(iw, ih);
  const dw = iw * k, dh = ih * k;
  ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return c;
}

export class ReferenceFitterArtist extends Artist {
  constructor() {
    super('fitter', 'Reference Fitter', 'procedural');
    this.model = 'fit-40';
    this.reference = null; // { image, name, source }
    this.runCounter = 0;
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
    if (request.mediumCapabilities?.coordinateSystem === 'pixel') {
      throw new Error('Reference Fitter writes normalized Core DSL shapes; switch to the Flat or Watercolor medium.');
    }

    const budget = FITTER_BUDGETS.find(b => b.id === this.model) || FITTER_BUDGETS[1];
    const count = Math.min(request.count || 4, FITTER_VOCABULARIES.length);
    const target = canvasToRGB(squareTarget(this.reference.image));
    const baseSeed = Number(request.settings?.seed ?? 0) || (Date.now() % 100000) + ++this.runCounter;

    // Continue from a parent program when refining.
    let parentActions = null;
    let start = null;
    let background = null;
    if (request.previousProgram?.actions?.length) {
      const parent = normalizeProgram(request.previousProgram);
      parentActions = parent.actions;
      const flat = new FlatCanvasMedium({ width: FIT_SIZE, height: FIT_SIZE });
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

      const fitter = new ReferenceFitter(target, FIT_SIZE, FIT_SIZE, { seed: baseSeed * 7 + c, shapes: vocab.shapes, start, background });
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
