/**
 * Streaming Parser Utilities
 * 
 * Extracts partially completed actions from streaming LLM output buffers
 * without waiting for the full JSON response or Text DSL to close.
 */

import { textToProgram } from './textFormat.js';

/**
 * Extracts complete action objects from an incomplete JSON stream buffer.
 * e.g. '{"version": 1, "actions": [{"op": "brush.bleed", "val": 0.4}, {"op": "circle", "x": 0, "y": 0, "r": 0.3, "fill": "#ff0000"}, {"op": "line", ...'
 * -> returns [{ op: "brush.bleed", val: 0.4 }, { op: "circle", x: 0, y: 0, r: 0.3, fill: "#ff0000" }]
 *
 * @param {string} text - The raw text accumulated from the stream so far
 * @returns {Array<object>} Array of fully parsed action objects
 */
export function extractPartialActions(text) {
  if (!text || typeof text !== 'string') return [];

  let clean = text.trim();
  // Strip opening markdown code block if present
  const codeBlockIdx = clean.indexOf('```');
  if (codeBlockIdx !== -1) {
    const newlineAfterCode = clean.indexOf('\n', codeBlockIdx);
    if (newlineAfterCode !== -1) {
      clean = clean.slice(newlineAfterCode + 1);
    }
  }

  // Look for "actions" key
  const actionsIdx = clean.indexOf('"actions"');
  if (actionsIdx === -1) {
    const altIdx = clean.search(/['"]?actions['"]?\s*:/);
    if (altIdx === -1) {
      // If the model streams Text DSL instead of JSON, fall back to line extractor
      if (clean.includes('\n') && !clean.startsWith('{')) {
        return extractPartialTextOps(text);
      }
      return [];
    }
  }

  const searchFrom = actionsIdx !== -1 ? actionsIdx : 0;
  const bracketIdx = clean.indexOf('[', searchFrom);
  if (bracketIdx === -1) return [];

  const actions = [];
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;

  for (let i = bracketIdx + 1; i < clean.length; i++) {
    const ch = clean[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const objStr = clean.slice(start, i + 1);
        try {
          const parsed = JSON.parse(objStr);
          if (parsed && typeof parsed === 'object' && parsed.op) {
            actions.push(parsed);
          }
        } catch (e) {
          try {
            const fixed = objStr.replace(/,\s*([}\]])/g, '$1');
            const parsedFixed = JSON.parse(fixed);
            if (parsedFixed && typeof parsedFixed === 'object' && parsedFixed.op) {
              actions.push(parsedFixed);
            }
          } catch (e2) {}
        }
        start = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }

  return actions;
}

/**
 * Extracts complete lines from a streaming Text DSL buffer
 * up to the last newline character.
 *
 * @param {string} text - Raw streaming text
 * @returns {Array<object>} Array of parsed actions
 */
export function extractPartialTextOps(text) {
  if (!text || typeof text !== 'string') return [];

  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline === -1) return [];

  const completeText = text.slice(0, lastNewline);
  const prog = textToProgram(completeText);
  return prog.actions || [];
}
