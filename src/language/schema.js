/**
 * Drawing Program Schema and Action Definitions
 *
 * All coordinates in the Core DSL use normalized coordinates:
 * x: -1.0 to 1.0 (left to right, center is 0.0)
 * y: -1.0 to 1.0 (top to bottom, center is 0.0)
 *
 * Pixel medium uses integer grid coordinates (e.g. 0 to 31, 0 to 47).
 */

export const CORE_OPS = [
  'background',
  'clear',
  'fill',
  'noFill',
  'stroke',
  'noStroke',
  'strokeWidth',
  'line',
  'circle',
  'rect',
  'polygon',
  'polyline'
];

export const WATERCOLOR_OPS = [
  'brush.bleed',
  'brush.texture',
  'brush.hatch',
  'brush.weight'
];

export const PIXEL_OPS = [
  'pixel',
  'hline',
  'vline',
  'rect',
  'line',
  'polygon',
  'palette',
  'mirrorX',
  'mirrorY'
];

export const DEFAULT_PIXEL_PALETTE = [
  '#16151c',
  '#693a32',
  '#c96a55',
  '#e3b86c',
  '#eee4c8'
];

export function createEmptyProgram() {
  return {
    version: 1,
    actions: []
  };
}
