/**
 * Drawing Program Validator
 */

import { CORE_OPS, WATERCOLOR_OPS, PIXEL_OPS } from './schema.js';

export function validateProgram(program, capabilities = null) {
  const errors = [];
  const warnings = [];

  if (!program || typeof program !== 'object') {
    return {
      valid: false,
      errors: ['Program must be an object with an "actions" array.'],
      warnings
    };
  }

  if (!Array.isArray(program.actions)) {
    return {
      valid: false,
      errors: ['Program must contain an "actions" array.'],
      warnings
    };
  }

  if (program.actions.length === 0) {
    warnings.push('Program contains no actions.');
  }

  const supportedOps = new Set(
    capabilities
      ? [...(capabilities.core || []), ...(capabilities.extensions || [])]
      : [...CORE_OPS, ...WATERCOLOR_OPS, ...PIXEL_OPS]
  );

  program.actions.forEach((act, idx) => {
    if (!act || typeof act !== 'object') {
      errors.push(`Action [${idx}] is not an object.`);
      return;
    }

    const op = act.op;
    if (!op) {
      errors.push(`Action [${idx}] is missing "op" command.`);
      return;
    }

    if (!supportedOps.has(op)) {
      warnings.push(`Action [${idx}] (${op}) is not officially supported by this medium.`);
    }

    // Specific operation checks
    switch (op) {
      case 'circle':
        if (typeof act.x !== 'number' || typeof act.y !== 'number') {
          errors.push(`Action [${idx}] (circle) requires numeric "x" and "y".`);
        }
        if (typeof act.diameter !== 'number' || act.diameter <= 0) {
          warnings.push(`Action [${idx}] (circle) should have a positive numeric "diameter".`);
        }
        break;

      case 'rect':
        if (typeof act.x !== 'number' || typeof act.y !== 'number') {
          errors.push(`Action [${idx}] (rect) requires numeric "x" and "y".`);
        }
        if (typeof act.width !== 'number' || typeof act.height !== 'number') {
          errors.push(`Action [${idx}] (rect) requires numeric "width" and "height".`);
        }
        break;

      case 'line':
        if (
          typeof act.x1 !== 'number' ||
          typeof act.y1 !== 'number' ||
          typeof act.x2 !== 'number' ||
          typeof act.y2 !== 'number'
        ) {
          errors.push(`Action [${idx}] (line) requires numeric "x1", "y1", "x2", "y2".`);
        }
        break;

      case 'polygon':
      case 'polyline':
        if (!Array.isArray(act.points) || act.points.length < 2) {
          errors.push(`Action [${idx}] (${op}) requires an array of at least 2 points.`);
        }
        break;

      case 'pixel':
        if (typeof act.x !== 'number' || typeof act.y !== 'number') {
          errors.push(`Action [${idx}] (pixel) requires numeric "x" and "y".`);
        }
        break;
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
