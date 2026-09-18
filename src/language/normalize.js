import { extractPartialActions } from './streaming.js';
import { textToProgram } from './textFormat.js';

/**
 * Normalizes drawing programs to canonical JSON format.
 * Handles minor syntax quirks and variations from language models.
 */

export function normalizeProgram(raw) {
  if (!raw) {
    return { version: 1, actions: [] };
  }

  let actions = [];

  if (Array.isArray(raw)) {
    actions = raw;
  } else if (typeof raw === 'object') {
    if (Array.isArray(raw.actions)) {
      actions = raw.actions;
    } else if (Array.isArray(raw.program)) {
      actions = raw.program;
    } else if (Array.isArray(raw.drawing)) {
      actions = raw.drawing;
    }
  }

  const normalizedActions = actions.map(act => normalizeAction(act)).filter(Boolean);

  return {
    version: raw.version || 1,
    actions: normalizedActions
  };
}

export function normalizeAction(action) {
  if (!action || typeof action !== 'object') return null;

  const rawOp = (action.op || action.type || action.command || '').trim();
  let op = rawOp.toLowerCase();

  // Handle common aliases from LLM outputs
  if (op === 'bleed' || op === 'brush_bleed') op = 'brush.bleed';
  if (op === 'texture' || op === 'brush_texture') op = 'brush.texture';
  if (op === 'hatch' || op === 'brush_hatch') op = 'brush.hatch';
  if (op === 'weight' || op === 'strokeweight' || op === 'brush_weight') {
    op = action.brush ? 'brush.weight' : 'strokeWidth';
  }
  if (op === 'strokewidth') op = 'strokeWidth';
  if (op === 'nofill') op = 'noFill';
  if (op === 'nostroke') op = 'noStroke';
  if (op === 'mirror_x' || op === 'mirrorx') op = 'mirrorX';
  if (op === 'mirror_y' || op === 'mirrory') op = 'mirrorY';

  const act = { op };

  // Parse color and numeric properties
  if (action.color !== undefined) act.color = action.color;
  if (action.opacity !== undefined) act.opacity = Number(action.opacity);

  switch (op) {
    case 'background':
    case 'clear':
      if (act.color === undefined && action.fill !== undefined) act.color = action.fill;
      break;

    case 'fill':
      if (action.opacity !== undefined) act.opacity = Number(action.opacity);
      if (action.bleed !== undefined) act.bleed = Number(action.bleed);
      if (action.texture !== undefined) act.texture = Number(action.texture);
      break;

    case 'stroke':
      if (action.width !== undefined) act.width = Number(action.width);
      break;

    case 'strokeWidth':
    case 'brush.weight':
      act.width = Number(action.width ?? action.weight ?? action.value ?? 1);
      break;

    case 'brush.bleed':
      act.amount = Number(action.amount ?? action.value ?? action.bleed ?? 0.2);
      break;

    case 'brush.texture':
      act.amount = Number(action.amount ?? action.value ?? action.texture ?? 0.5);
      break;

    case 'brush.hatch':
      act.distance = Number(action.distance ?? action.spacing ?? 10);
      act.angle = Number(action.angle ?? 45);
      if (action.style) act.style = action.style;
      break;

    case 'circle':
      act.x = Number(action.x ?? 0);
      act.y = Number(action.y ?? 0);
      if (action.diameter !== undefined) {
        act.diameter = Number(action.diameter);
      } else if (action.radius !== undefined || action.r !== undefined) {
        act.diameter = Number(action.radius ?? action.r) * 2;
      } else if (action.d !== undefined) {
        act.diameter = Number(action.d);
      } else {
        act.diameter = 0.2;
      }
      break;

    case 'rect':
      act.x = Number(action.x ?? 0);
      act.y = Number(action.y ?? 0);
      act.width = Number(action.width ?? action.w ?? 0.2);
      act.height = Number(action.height ?? action.h ?? 0.2);
      if (action.color !== undefined) act.color = action.color;
      if (action.fill !== undefined) act.fill = Boolean(action.fill);
      break;

    case 'line':
      act.x1 = Number(action.x1 ?? 0);
      act.y1 = Number(action.y1 ?? 0);
      act.x2 = Number(action.x2 ?? 0);
      act.y2 = Number(action.y2 ?? 0);
      if (action.color !== undefined) act.color = action.color;
      break;

    case 'polygon':
    case 'polyline':
      if (Array.isArray(action.points)) {
        act.points = action.points.map(pt => {
          if (Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])];
          if (typeof pt === 'object' && pt !== null) return [Number(pt.x), Number(pt.y)];
          return [0, 0];
        });
      } else {
        act.points = [];
      }
      if (action.color !== undefined) act.color = action.color;
      break;

    case 'pixel':
      act.x = Math.round(Number(action.x ?? 0));
      act.y = Math.round(Number(action.y ?? 0));
      act.color = action.color ?? 0;
      break;

    case 'hline':
      act.y = Math.round(Number(action.y ?? 0));
      act.x1 = Math.round(Number(action.x1 ?? 0));
      act.x2 = Math.round(Number(action.x2 ?? 0));
      act.color = action.color ?? 0;
      break;

    case 'vline':
      act.x = Math.round(Number(action.x ?? 0));
      act.y1 = Math.round(Number(action.y1 ?? 0));
      act.y2 = Math.round(Number(action.y2 ?? 0));
      act.color = action.color ?? 0;
      break;

    case 'palette':
      act.colors = Array.isArray(action.colors) ? action.colors : [];
      break;

    case 'mirrorX':
      act.enabled = action.enabled !== undefined ? Boolean(action.enabled) : true;
      break;

    case 'mirrorY':
      act.enabled = action.enabled !== undefined ? Boolean(action.enabled) : true;
      break;

    default:
      // Keep any additional properties for custom operations
      Object.assign(act, action);
      act.op = op;
      break;
  }

  return act;
}

/**
 * Resilient multi-tier model output parser.
 * Recovers drawing programs from:
 * - Clean JSON
 * - JSON wrapped in markdown code blocks
 * - JSON with single-line (//) or multi-line (/* * /) comments
 * - Truncated JSON (where generation stopped mid-stream / mid-token)
 * - Raw streaming partial JSON
 * - Text DSL format
 * - Conversational text containing embedded JSON actions
 *
 * Guarantees that completed drawing actions are NEVER discarded as blank.
 *
 * @param {string} text - Raw string output from LLM
 * @param {Array<string>} warnings - Collector for recovery and diagnostic warnings
 * @returns {object} Canonical { version: 1, actions: [...] } drawing program
 */
export function parseModelOutput(text, warnings = []) {
  if (!text || typeof text !== 'string') {
    return { version: 1, actions: [] };
  }

  let clean = text.trim();

  // 1. Strip markdown code block wrappers if any
  const codeBlockMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidateText = codeBlockMatch ? codeBlockMatch[1].trim() : clean;

  // 2. Strip JS/C-style comments: // ... and /* ... */
  const stripComments = (str) => {
    return str
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  };

  const uncommented = stripComments(candidateText);

  // 3. Try standard JSON.parse on full text
  try {
    const parsed = JSON.parse(uncommented);
    const norm = normalizeProgram(parsed);
    if (norm.actions.length > 0) return norm;
  } catch (e) {}

  // 4. Try finding outer { ... } boundary with trailing comma cleanup
  const firstBrace = uncommented.indexOf('{');
  const lastBrace = uncommented.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const sliced = uncommented.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(sliced);
      const norm = normalizeProgram(parsed);
      if (norm.actions.length > 0) return norm;
    } catch (e) {
      try {
        const fixed = sliced.replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(fixed);
        const norm = normalizeProgram(parsed);
        if (norm.actions.length > 0) return norm;
      } catch (e2) {}
    }
  }

  // 5. Auto-repair truncated JSON:
  // When an LLM hits max_new_tokens mid-stream inside the "actions": [ ... array,
  // find the last completed action '}', strip unclosed trailing tokens, and close with ']\n}'
  const actionsIdx = uncommented.indexOf('"actions"');
  if (actionsIdx !== -1) {
    const bracketIdx = uncommented.indexOf('[', actionsIdx);
    if (bracketIdx !== -1) {
      const lastActionEnd = uncommented.lastIndexOf('}');
      if (lastActionEnd > bracketIdx) {
        const repaired = uncommented.slice(0, lastActionEnd + 1).trim().replace(/,\s*$/, '') + '\n  ]\n}';
        const startBrace = repaired.indexOf('{');
        if (startBrace !== -1) {
          const validRepaired = repaired.slice(startBrace);
          try {
            const parsed = JSON.parse(validRepaired);
            const norm = normalizeProgram(parsed);
            if (norm.actions.length > 0) {
              warnings.push(`Auto-repaired truncated JSON (recovered ${norm.actions.length} action(s)).`);
              return norm;
            }
          } catch (e) {
            try {
              const fixed = validRepaired.replace(/,\s*([}\]])/g, '$1');
              const parsed = JSON.parse(fixed);
              const norm = normalizeProgram(parsed);
              if (norm.actions.length > 0) {
                warnings.push(`Auto-repaired truncated JSON with comma fixes (recovered ${norm.actions.length} action(s)).`);
                return norm;
              }
            } catch (e2) {}
          }
        }
      }
    }
  }

  // 6. Check if model generated pure Text DSL (contains no JSON braces)
  if (!clean.includes('{')) {
    const textProg = textToProgram(clean);
    if (textProg.actions && textProg.actions.length > 0) {
      warnings.push(`Parsed ${textProg.actions.length} action(s) from Text DSL format.`);
      return normalizeProgram(textProg);
    }
  }

  // 7. Resilient token-by-token action extractor (recovers all complete action objects)
  const partialActions = extractPartialActions(clean);
  if (partialActions && partialActions.length > 0) {
    warnings.push(`Recovered ${partialActions.length} action(s) via partial buffer extraction.`);
    return normalizeProgram({ version: 1, actions: partialActions });
  }

  // 8. Text DSL fallback for mixed text
  const textProg = textToProgram(clean);
  if (textProg.actions && textProg.actions.length > 0) {
    warnings.push(`Parsed ${textProg.actions.length} action(s) from Text DSL format.`);
    return normalizeProgram(textProg);
  }

  // 8. Final regex fallback: scan for individual {"op": ...} objects anywhere in text
  const looseActionRegex = /\{\s*"(?:op|type|command)"\s*:\s*"[^"]+"[^}]*\}/g;
  const looseMatches = clean.match(looseActionRegex);
  if (looseMatches && looseMatches.length > 0) {
    const recovered = [];
    for (const m of looseMatches) {
      try {
        const act = JSON.parse(m.replace(/,\s*([}\]])/g, '$1'));
        if (act && act.op) recovered.push(act);
      } catch (e) {}
    }
    if (recovered.length > 0) {
      warnings.push(`Recovered ${recovered.length} action(s) via pattern matching.`);
      return normalizeProgram({ version: 1, actions: recovered });
    }
  }

  warnings.push('Model response did not contain valid drawing actions.');
  return { version: 1, actions: [] };
}

