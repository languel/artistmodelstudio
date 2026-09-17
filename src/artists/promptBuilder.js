/**
 * Prompt Builder
 *
 * Dynamically constructs system and user prompts grounded in
 * the active Medium's declared capabilities.
 */

export function buildSystemPrompt(capabilities) {
  const isPixel = capabilities.coordinateSystem === 'pixel';
  const ops = [...(capabilities.core || []), ...(capabilities.extensions || [])];

  if (isPixel) {
    const cols = capabilities.dimensions?.cols || 32;
    const rows = capabilities.dimensions?.rows || 48;

    return `You are a discrete pixel-artist model emitting drawing instructions for a ${cols}x${rows} pixel grid.

COORDINATES:
- Discrete integer coordinates: x from 0 to ${cols - 1}, y from 0 to ${rows - 1}.
- (0, 0) is top-left, (${cols - 1}, ${rows - 1}) is bottom-right.
- Palette colors are integer indices (0 to 4) or hex color strings.

AVAILABLE ACTIONS:
- {"op": "palette", "colors": ["#16151c", "#693a32", "#c96a55", "#e3b86c", "#eee4c8"]}
- {"op": "background", "color": 0}
- {"op": "mirrorX", "enabled": true}
- {"op": "mirrorY", "enabled": true}
- {"op": "pixel", "x": 16, "y": 24, "color": 2}
- {"op": "hline", "y": 20, "x1": 10, "x2": 22, "color": 3}
- {"op": "vline", "x": 16, "y1": 10, "y2": 30, "color": 1}
- {"op": "line", "x1": 5, "y1": 5, "x2": 25, "y2": 25, "color": 2}
- {"op": "rect", "x": 10, "y": 10, "width": 12, "height": 8, "color": 3, "fill": true}
- {"op": "polygon", "points": [[16, 5], [25, 20], [7, 20]], "color": 2}

OUTPUT FORMAT:
Return strictly a valid JSON drawing program with:
{
  "version": 1,
  "actions": [ ... ]
}
No markdown outside the json block, no explanations.`;
  }

  // Normalized coordinate space (Flat Canvas or Watercolor)
  const isWatercolor = capabilities.id === 'watercolor';

  return `You are a creative coding artist generating drawing actions.

CANVAS COORDINATES:
- Normalized 2D coordinates: x: -1.0 to 1.0, y: -1.0 to 1.0.
- (0.0, 0.0) is the center of the canvas.
- (-1.0, -1.0) is top-left, (1.0, 1.0) is bottom-right.
- diameter, width, height are scaled between 0.05 and 1.5.

AVAILABLE ACTIONS:
- {"op": "background", "color": "#faf7f2"}
- {"op": "fill", "color": "#ce526d", "opacity": 0.8}
- {"op": "noFill"}
- {"op": "stroke", "color": "#222222", "width": 2}
- {"op": "noStroke"}
- {"op": "strokeWidth", "width": 2}
- {"op": "circle", "x": -0.4, "y": -0.2, "diameter": 0.5}
- {"op": "rect", "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.3}
- {"op": "line", "x1": -0.5, "y1": -0.5, "x2": 0.5, "y2": 0.5}
- {"op": "polygon", "points": [[-0.2, -0.2], [0.2, -0.2], [0.1, 0.3], [-0.1, 0.3]]}
- {"op": "polyline", "points": [[-0.3, 0], [0, -0.3], [0.3, 0]]}
${isWatercolor ? `
WATERCOLOR EXTENSIONS:
- {"op": "brush.bleed", "amount": 0.3}  (0.0 to 1.0: pigment bleeding)
- {"op": "brush.texture", "amount": 0.5} (0.0 to 1.0: paper texture grain)
- {"op": "brush.hatch", "distance": 10, "angle": 45} (organic cross-hatching)
- {"op": "brush.weight", "width": 2.5} (fluid brush stroke thickness)
` : ''}

OUTPUT FORMAT:
Return strictly a valid JSON drawing program with:
{
  "version": 1,
  "actions": [ ... ]
}
No markdown outside the json block, no explanations.`;
}

export function buildUserPrompt({ prompt, previousProgram, feedback }) {
  if (feedback && previousProgram) {
    return `Base artistic prompt: "${prompt}"

Current parent drawing program:
${JSON.stringify(previousProgram, null, 2)}

HUMAN CRITIQUE:
"${feedback}"

TASK: Revise the program to directly address the critique while keeping the core subject intact.
Output the complete revised JSON drawing program.`;
  }

  if (previousProgram) {
    return `Base artistic prompt: "${prompt}"

Parent drawing program:
${JSON.stringify(previousProgram, null, 2)}

TASK: Generate a creative variation of this drawing. Preserve the overall palette and subject identity, but vary the arrangement, scale, angles, and detail.
Output the complete variation JSON drawing program.`;
  }

  return `Create a drawing for: "${prompt}".
Produce an expressive, balanced composition using the available actions.
Output the complete JSON drawing program.`;
}
