/**
 * Watercolor drawing with p5.brush (standalone build).
 *
 * Shared by WatercolorMedium and the p5.js export, which embeds this file's
 * source verbatim, so the studio and exported sketches paint identically.
 * Keep it free of imports and `this`.
 *
 * @param brush   the p5.brush standalone module (global `brush` in sketches)
 * @param canvas  target canvas; p5.brush draws into it with WebGL
 * @param actions normalized Core DSL actions
 * @param options.clear  false paints on top of what is already there (continuous mode)
 * @param options.load   false skips re-binding p5.brush to the canvas
 * @returns {string[]} warnings for ignored actions
 */
// p5.brush keeps one drawing surface; painting on another canvas discards the
// previous one's contents. Track which canvas it last drew on.
let lastBrushCanvas = null;
export function lastWatercolorCanvas() {
  return lastBrushCanvas;
}

export function paintWatercolor(brush, canvas, actions, { seed = 42, defaultBleed = 0.25, defaultTexture = 0.4, clear = true, load = true } = {}) {
  const warnings = [];
  const width = canvas.width;
  const height = canvas.height;
  // p5.brush uses WebGL coordinates: (0, 0) is the centre of the canvas.
  const toX = x => x * (width * 0.5);
  const toY = y => y * (height * 0.5);
  const toSize = v => v * 0.5 * Math.min(width, height);

  if (load && typeof brush.load === 'function') brush.load(canvas);
  lastBrushCanvas = canvas;

  if (clear) {
    // Apply seeds for deterministic reproduction
    if (typeof brush.seed === 'function') brush.seed(seed);
    if (typeof brush.noiseSeed === 'function') brush.noiseSeed(seed);

    // Clear canvas
    if (typeof brush.clear === 'function') {
      brush.clear('#faf7f2'); // warm watercolor paper background
    }
  }

  let currentBleed = defaultBleed;
  let currentTexture = defaultTexture;
  let currentStrokeWeight = 1.5;
  let currentFillColor = '#3a5a78';
  let currentFillOpacity = 0.8;
  let currentStrokeColor = '#222222';
  let hasFill = true;
  let hasStroke = false;
  let hasHatch = false;
  let hatchDist = 10;
  let hatchAngle = 45;

  // Reset all previous brush state to avoid leakage across frames
  if (typeof brush.noHatch === 'function') brush.noHatch();
  if (typeof brush.noWash === 'function') brush.noWash();
  if (typeof brush.noFill === 'function') brush.noFill();
  if (typeof brush.noStroke === 'function') brush.noStroke();

  // Initialize brush engine with a valid default brush
  if (typeof brush.set === 'function') {
    brush.set('HB', currentStrokeColor, currentStrokeWeight);
    brush.noStroke(); // start without stroke until requested
  }

  // Apply initial brush state
  if (typeof brush.fillBleed === 'function') brush.fillBleed(currentBleed);
  if (typeof brush.fillTexture === 'function') brush.fillTexture(currentTexture);

  for (const act of actions) {
    switch (act.op) {
      case 'background':
      case 'clear':
        if (typeof brush.clear === 'function') {
          brush.clear(act.color || '#faf7f2');
        }
        break;

      case 'brush.bleed':
        currentBleed = act.amount ?? 0.25;
        if (typeof brush.fillBleed === 'function') brush.fillBleed(currentBleed);
        break;

      case 'brush.texture':
        currentTexture = act.amount ?? 0.4;
        if (typeof brush.fillTexture === 'function') brush.fillTexture(currentTexture);
        break;

      case 'brush.hatch':
        hasHatch = true;
        hatchDist = act.distance ?? 10;
        hatchAngle = act.angle ?? 45;
        if (typeof brush.set === 'function') {
          brush.set('HB', currentStrokeColor, currentStrokeWeight);
          if (!hasStroke && typeof brush.noStroke === 'function') brush.noStroke();
        }
        if (typeof brush.hatch === 'function') brush.hatch(hatchDist, hatchAngle);
        break;

      case 'brush.noHatch':
        hasHatch = false;
        if (typeof brush.noHatch === 'function') brush.noHatch();
        break;

      case 'brush.weight':
      case 'strokeWidth':
        currentStrokeWeight = act.width ?? 1.5;
        if (typeof brush.strokeWeight === 'function') brush.strokeWeight(currentStrokeWeight);
        break;

      case 'fill': {
        hasFill = true;
        currentFillColor = act.color || '#3a5a78';
        if (act.opacity !== undefined) currentFillOpacity = act.opacity;
        const opacity255 = Math.round(currentFillOpacity <= 1.0 ? currentFillOpacity * 255 : currentFillOpacity);
        if (typeof brush.noWash === 'function') brush.noWash();
        if (typeof brush.fill === 'function') {
          brush.fill(currentFillColor, opacity255);
        }
        break;
      }

      case 'noFill':
        hasFill = false;
        if (typeof brush.noWash === 'function') brush.noWash();
        if (typeof brush.noFill === 'function') brush.noFill();
        break;

      case 'stroke':
        hasStroke = true;
        currentStrokeColor = act.color || '#222222';
        if (act.width !== undefined) currentStrokeWeight = act.width;
        if (typeof brush.set === 'function') {
          brush.set('HB', currentStrokeColor, currentStrokeWeight);
        } else {
          if (typeof brush.stroke === 'function') brush.stroke(currentStrokeColor);
          if (typeof brush.strokeWeight === 'function') brush.strokeWeight(currentStrokeWeight);
        }
        break;

      case 'noStroke':
        hasStroke = false;
        if (typeof brush.noStroke === 'function') brush.noStroke();
        break;

      case 'circle': {
        const cx = toX(act.x);
        const cy = toY(act.y);
        const r = Math.max(0.5, toSize(act.diameter) * 0.5);

        // Generate smooth circular perimeter with subtle organic watercolor wobble
        const numPoints = Math.max(20, Math.min(64, Math.round(r * 0.8)));
        const pts = [];
        const wobbleAmount = 0.035; // gentle organic hand-painted wobble
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const wobble = 1 + (Math.sin(angle * 3 + cx) * 0.5 + Math.cos(angle * 5 + cy) * 0.5) * wobbleAmount;
          const pr = r * wobble;
          pts.push([cx + Math.cos(angle) * pr, cy + Math.sin(angle) * pr]);
        }

        if (typeof brush.polygon === 'function') {
          brush.polygon(pts);
        } else if (typeof brush.circle === 'function') {
          brush.circle(cx, cy, r, 0.4);
        }
        break;
      }

      case 'rect': {
        const cx = toX(act.x);
        const cy = toY(act.y);
        const w = toSize(act.width);
        const h = toSize(act.height);
        if (typeof brush.rect === 'function') {
          brush.rect(cx - w * 0.5, cy - h * 0.5, w, h);
        }
        break;
      }

      case 'line': {
        const x1 = toX(act.x1);
        const y1 = toY(act.y1);
        const x2 = toX(act.x2);
        const y2 = toY(act.y2);
        if (typeof brush.line === 'function') {
          brush.line(x1, y1, x2, y2);
        }
        break;
      }

      case 'polygon': {
        if (Array.isArray(act.points) && act.points.length >= 3) {
          const pts = act.points.map(p => [toX(p[0]), toY(p[1])]);
          if (typeof brush.polygon === 'function') {
            brush.polygon(pts);
          }
        }
        break;
      }

      default:
        warnings.push(`Ignored action in Watercolor: ${act.op}`);
        break;
    }
  }

  // Flush WebGL brush rendering
  if (typeof brush.render === 'function') {
    brush.render();
  }

  // Clear transient states so they don't persist into the next frame
  if (typeof brush.noHatch === 'function') brush.noHatch();
  if (typeof brush.noWash === 'function') brush.noWash();
  if (typeof brush.noFill === 'function') brush.noFill();
  if (typeof brush.noStroke === 'function') brush.noStroke();
  return warnings;
}
