/**
 * Prompt Builder with Creative Coding Master Harness
 *
 * Dynamically constructs system and user prompts grounded in
 * the active Medium's declared capabilities. Injects multi-layered
 * composition guidelines, color harmony rules, few-shot exemplars,
 * and candidate variation directives.
 */

export const VARIATION_DIRECTIVES = [
  {
    tag: 'Classic & Balanced',
    directive: 'Compositional focus: Harmonious symmetry and balance. Use clear central focal points, graceful vertical rhythm, and natural organic proportions.'
  },
  {
    tag: 'Dynamic & Expressive',
    directive: 'Compositional focus: Asymmetrical dynamic energy. Use sweeping diagonal arcs, windswept leaning stems, bold gestural tension, and off-center placement.'
  },
  {
    tag: 'Minimalist & Airy',
    directive: 'Compositional focus: Poetic minimalism and restraint. Maximize negative space, use delicate sparse strokes, translucent washes, and subtle stippling.'
  },
  {
    tag: 'Intricate & Layered',
    directive: 'Compositional focus: Rich density and textural depth. Combine multi-tiered clusters at varied scales, overlapping petals, foliage accents, and fine contrasting centers.'
  }
];

export function buildSystemPrompt(capabilities, options = {}) {
  const isPixel = capabilities.coordinateSystem === 'pixel';
  const isCompact = Boolean(options?.compact);

  if (isPixel) {
    const cols = capabilities.dimensions?.cols || 32;
    const rows = capabilities.dimensions?.rows || 48;

    if (isCompact) {
      return `Expert retro pixel artist. Create sprite on ${cols}x${rows} grid.
Coordinates: x in [0, ${cols - 1}], y in [0, ${rows - 1}]. (0, 0) is top-left.
Palette: 5 colors (0=bg, 1=shadow/stem, 2=primary, 3=secondary, 4=highlight).
Actions: palette, background, mirrorX, pixel, hline, vline, line, rect, polygon.
Output strictly valid JSON:
{
  "version": 1,
  "actions": [
    {"op": "palette", "colors": ["#16151c", "#5c3330", "#ce526d", "#f2a874", "#fff3d6"]},
    {"op": "background", "color": 0},
    {"op": "pixel", "x": ${Math.floor(cols / 2)}, "y": ${Math.floor(rows / 2)}, "color": 2}
  ]
}`;
    }

    return `You are an expert retro pixel artist creating expressive, stylized sprite artworks on a discrete ${cols}x${rows} pixel grid.

GRID SPECIFICATIONS:
- Discrete integer coordinates: x from 0 to ${cols - 1}, y from 0 to ${rows - 1}.
- (0, 0) is top-left, (${cols - 1}, ${rows - 1}) is bottom-right.
- Center of grid is approximately (${Math.floor(cols / 2)}, ${Math.floor(rows / 2)}).
- Palette colors are integer indices (0 to 4) or hex color strings.

PIXEL ARTISTRY GUIDELINES:
1. Declare a 5-color palette first: index 0 (deep background), 1 (shadow/stem), 2 (primary hue), 3 (secondary tone), 4 (highlight).
2. Set background color (usually index 0).
3. Enable symmetry if appropriate ({"op": "mirrorX", "enabled": true}).
4. Layer your forms: underdrawing stems/silhouettes first, then body masses, then surface highlights.
5. Aim for 12 to 25 coordinated operations for a complete, cohesive sprite composition.

AVAILABLE ACTIONS:
- {"op": "palette", "colors": ["#16151c", "#5c3330", "#ce526d", "#f2a874", "#fff3d6"]}
- {"op": "background", "color": 0}
- {"op": "mirrorX", "enabled": true}
- {"op": "mirrorY", "enabled": false}
- {"op": "pixel", "x": 16, "y": 20, "color": 4}
- {"op": "hline", "y": 24, "x1": 12, "x2": 20, "color": 2}
- {"op": "vline", "x": 16, "y1": 22, "y2": 38, "color": 1}
- {"op": "line", "x1": 8, "y1": 10, "x2": 24, "y2": 10, "color": 3}
- {"op": "rect", "x": 12, "y": 14, "width": 8, "height": 8, "color": 2, "fill": true}
- {"op": "polygon", "points": [[16, 8], [22, 18], [10, 18]], "color": 3}

OUTPUT FORMAT:
Output strictly valid JSON with no markdown outside the JSON block:
{
  "version": 1,
  "actions": [ ... ]
}`;
  }

  // Normalized coordinate space (Flat Canvas or Watercolor)
  const isWatercolor = capabilities.id === 'watercolor';

  if (isCompact) {
    return `Creative coding artist generating 2D drawing programs.
Coordinates: Normalized 2D space from -1.0 to 1.0. (0, 0) is canvas center.
Framing safe-zone: Keep all shapes within x: [-0.8, 0.8], y: [-0.8, 0.8].
Layering: background -> stems/gesture lines -> filled petals/shapes -> focal centers.
Available actions:
- {"op": "background", "color": "#faf7f2"}
- {"op": "fill", "color": "#ce526d", "opacity": 0.8}
- {"op": "noFill"}
- {"op": "stroke", "color": "#2d4a34", "width": 2.5}
- {"op": "noStroke"}
- {"op": "circle", "x": 0.0, "y": -0.2, "diameter": 0.35}
- {"op": "line", "x1": 0.0, "y1": -0.2, "x2": 0.0, "y2": 0.6}
- {"op": "rect", "x": -0.2, "y": -0.2, "width": 0.4, "height": 0.4}
- {"op": "polygon", "points": [[-0.2, -0.2], [0.2, -0.2], [0, 0.2]]}
${isWatercolor ? '- {"op": "brush.bleed", "amount": 0.35}\n- {"op": "brush.texture", "amount": 0.45}\n' : ''}
Output strictly valid JSON. Keep actions concise (10-18 ops) and always cleanly close with ] and }:
{
  "version": 1,
  "actions": [ ... ]
}`;
  }

  return `You are a master creative-coding artist producing expressive, aesthetically refined digital artworks.

CANVAS COORDINATES, ASPECT RATIO & FRAMING:
- Canvas aspect ratio: 1:1 square canvas.
- Coordinate range: Normalized 2D space from -1.0 to 1.0 in both axes.
  * (0.0, 0.0) is the EXACT CENTER of the canvas.
  * (-1.0, -1.0) is the TOP-LEFT corner, (1.0, 1.0) is the BOTTOM-RIGHT corner.
  * Negative Y (-1.0 to 0.0) is the UPPER half of the canvas (canopy, blossoms, petals).
  * Positive Y (0.0 to 1.0) is the LOWER half of the canvas (ground, base, stems, roots).
- SAFE-ZONE & CROP PROTECTION:
  * Leave a 15% margin around the canvas: keep all focal geometry strictly within x: [-0.80, 0.80] and y: [-0.80, 0.80].
  * Never place flower blossoms or essential shapes beyond +/-0.85 to prevent accidental cropping at the canvas boundaries.
  * Anchor vertical subjects (flowers, stems, trees) from the lower ground (y: 0.35 to 0.7) and let stems rise gracefully into the upper focal zone (y: -0.4 to 0.05).
  * Keep element diameters between 0.04 and 0.5 to maintain balanced scale within the square frame.

CREATIVE CODING ARTISTRY PRINCIPLES:
1. LAYERED COMPOSITION ARCHITECTURE:
   - Layer 1 (Atmosphere & Ground): Begin with background color and watercolor medium setup (e.g. brush.bleed 0.25–0.4, brush.texture 0.4–0.6).
   - Layer 2 (Structural Gesture): Paint stems, branches, trunks, or rhythm lines using stroke and line/polyline with natural curves or lean.
   - Layer 3 (Mass & Form): Build organic petals, foliage, or geometric masses using multiple overlapping circles or polygons with translucent opacity (0.7–0.88). Combine varied diameters to create depth.
   - Layer 4 (Focal Accents & Highlights): Add flower pistils, stippling, leaf veins, or contrast centers (small diameter circles, bright warm/gold highlights).
2. COMPOSITIONAL SCALE & DENSITY:
   - Produce a rich, complete artwork using 15 to 28 coordinated actions.
   - Do NOT emit only 2 or 3 trivial isolated shapes.
   - Vary element sizes: primary focal forms (diameter 0.3–0.5), secondary forms (0.15–0.25), fine accents (0.04–0.08).
3. COLOR HARMONY & TRANSLUCENCY:
   - Use cohesive color palettes with sophisticated hex codes (e.g. rose '#d94262', crimson '#b52b47', coral '#f2786d', deep sage '#2d4a34', warm gold '#f5c342', paper '#faf7f2').
   - Use translucent opacities (opacity: 0.65 to 0.9) to allow forms to softly blend.

AVAILABLE ACTIONS:
- {"op": "background", "color": "#faf7f2"}
- {"op": "fill", "color": "#ce526d", "opacity": 0.8}
- {"op": "noFill"}
- {"op": "stroke", "color": "#2d4a34", "width": 2.5}
- {"op": "noStroke"}
- {"op": "strokeWidth", "width": 2}
- {"op": "circle", "x": -0.3, "y": -0.1, "diameter": 0.35}
- {"op": "rect", "x": 0.0, "y": 0.2, "width": 0.4, "height": 0.3}
- {"op": "line", "x1": -0.3, "y1": -0.1, "x2": -0.1, "y2": 0.65}
- {"op": "polygon", "points": [[-0.2, -0.2], [0.2, -0.2], [0.1, 0.3], [-0.1, 0.3]]}
- {"op": "polyline", "points": [[-0.3, 0], [0, -0.3], [0.3, 0]]}
${isWatercolor ? `
WATERCOLOR EXTENSIONS (BRUSH & TEXTURE):
- {"op": "brush.bleed", "amount": 0.35}   (0.0 to 1.0: pigment diffusion & organic bleeding)
- {"op": "brush.texture", "amount": 0.45} (0.0 to 1.0: cold-press paper grain texture)
- {"op": "brush.hatch", "distance": 12, "angle": 45} (delicate watercolor cross-hatching)
- {"op": "brush.weight", "width": 2.5}    (fluid stroke weight)
` : ''}

OUTPUT FORMAT:
Output strictly valid JSON with no conversational text or markdown outside the JSON block. Always cleanly close the actions array and root JSON object with ] and }:
{
  "version": 1,
  "actions": [ ... ]
}
`;
}

export function detectSubjectContext(prompt = '') {
  const p = (prompt || '').toLowerCase();
  if (p.includes('bird') || p.includes('hummingbird') || p.includes('owl') || p.includes('eagle') || p.includes('colibri') || p.includes('avian')) {
    return {
      domain: 'avian',
      layerGuide: 'background setting -> body gesture/silhouette -> plumage/wings -> fine focal highlights/beak/eyes',
      variationAdvice: 'pose, flight dynamics, wing angles, and plumage coloration'
    };
  }
  if (p.includes('mountain') || p.includes('lake') || p.includes('ocean') || p.includes('sunset') || p.includes('sky') || p.includes('landscape') || p.includes('sea') || p.includes('forest') || p.includes('river')) {
    return {
      domain: 'landscape',
      layerGuide: 'sky/atmosphere wash -> distant horizon/mountain silhouettes -> midground contours -> foreground accents',
      variationAdvice: 'horizon elevation, mountain ridgelines, atmospheric wash gradations, and lighting accents'
    };
  }
  if (p.includes('geometric') || p.includes('bauhaus') || p.includes('abstract') || p.includes('kandinsky') || p.includes('constructivist') || p.includes('minimal')) {
    return {
      domain: 'abstract',
      layerGuide: 'canvas background -> primary volumetric geometry (circles/rectangles) -> intersecting diagonal rhythm lines -> high-contrast focal points',
      variationAdvice: 'geometric scales, intersecting angles, asymmetrical balance, and bold contrasting palettes'
    };
  }
  if (p.includes('flower') || p.includes('rose') || p.includes('cherry') || p.includes('blossom') || p.includes('botanical') || p.includes('flora') || p.includes('tulip') || p.includes('tree') || p.includes('petal')) {
    return {
      domain: 'botanical',
      layerGuide: 'background wash -> structural stems/branches -> layered petal/foliage masses -> focal pistil/stamen accents',
      variationAdvice: 'stem sweep and curvature, petal cluster counts, blossom scale, and blossom angles'
    };
  }
  if (p.includes('cat') || p.includes('dog') || p.includes('animal') || p.includes('creature') || p.includes('fish') || p.includes('portrait')) {
    return {
      domain: 'creature',
      layerGuide: 'background environment -> anatomical underdrawing & torso gesture -> limbs/facial planes -> focal eyes, contours, and surface textures',
      variationAdvice: 'body posture, feature proportions, gesture curves, and expressive contrast'
    };
  }
  return {
    domain: 'general',
    layerGuide: 'background ground -> foundational gesture/underdrawing -> primary volumetric forms -> focal highlights and detail accents',
    variationAdvice: 'compositional balance, scale contrast, lighting accents, and spatial layout'
  };
}

export function buildUserPrompt({ prompt, previousProgram, feedback, candidateIndex = 0 }, options = {}) {
  const directiveObj = VARIATION_DIRECTIVES[candidateIndex % VARIATION_DIRECTIVES.length];
  const directiveText = directiveObj ? `\n[COMPOSITIONAL VARIATION DIRECTIVE: ${directiveObj.directive}]` : '';
  const isCompact = Boolean(options?.compact);
  const actionRangeText = isCompact ? '10 to 18' : '15 to 28';
  const terminationNotice = ' Ensure the actions array cleanly finishes and closes with ] and }.';
  const subjectCtx = detectSubjectContext(prompt);

  if (feedback && previousProgram) {
    return `Base artistic subject: "${prompt}"

Current parent drawing program:
${JSON.stringify(previousProgram, null, 2)}

HUMAN CRITIQUE & DIRECTION:
"${feedback}"
${directiveText}

TASK: Refine the drawing program to directly execute the critique while maintaining artistic cohesion, depth, and layered quality.
Output ${actionRangeText} coordinated actions in valid JSON.${terminationNotice}`;
  }

  if (previousProgram) {
    return `Base artistic subject: "${prompt}"

Parent drawing program:
${JSON.stringify(previousProgram, null, 2)}
${directiveText}

TASK: Generate a distinct, creative variation of this drawing. Vary the spatial arrangement, scale relationships, angles, and ${subjectCtx.variationAdvice} while maintaining stylistic identity.
Output ${actionRangeText} coordinated actions in valid JSON.${terminationNotice}`;
  }

  return `Create a high-quality, expressive drawing for: "${prompt}".
${directiveText}

Build a rich, complete composition with ${actionRangeText} coordinated actions following the layered architecture (${subjectCtx.layerGuide}).${terminationNotice}
Output strictly the valid JSON drawing program.`;
}
