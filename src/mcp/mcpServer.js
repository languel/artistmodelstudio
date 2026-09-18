#!/usr/bin/env node

/**
 * Artist-Model Studio - Standalone MCP Server
 *
 * Implements the standard Model Context Protocol (MCP) JSON-RPC 2.0 interface
 * over stdio for external AI coding assistants, agents, and desktop clients.
 */

import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateReward } from '../rewards/combine.js';
import { normalizeProgram } from '../language/normalize.js';
import { InBrowserTrainer } from '../training/inBrowserTrainer.js';
import {
  createAmsModel,
  exportModelToJSON,
  importModelFromJSON,
  getSavedModels,
  saveTrainedModel
} from '../training/modelFormat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

function loadExamples() {
  try {
    const examplesDir = path.join(projectRoot, 'examples');
    const list = [
      {
        id: 'watercolor-flowers',
        name: 'Watercolor — Three Leaning Flowers',
        medium: 'watercolor',
        path: path.join(examplesDir, 'watercolor/flowers.json')
      },
      {
        id: 'pixel-rose',
        name: 'Pixel — Rose Sprite (32x48)',
        medium: 'pixel',
        path: path.join(examplesDir, 'pixel/flower_sprite.json')
      },
      {
        id: 'flat-bauhaus',
        name: 'Flat Canvas — Bauhaus Geometry',
        medium: 'flat',
        path: path.join(examplesDir, 'flat/geometric.json')
      }
    ];

    return list.map(item => {
      let program = { version: 1, actions: [] };
      if (fs.existsSync(item.path)) {
        program = JSON.parse(fs.readFileSync(item.path, 'utf8'));
      }
      return { id: item.id, name: item.name, medium: item.medium, program };
    });
  } catch (e) {
    return [];
  }
}

const MCP_SERVER_INFO = {
  name: 'artist-model-studio-mcp',
  version: '1.0.0'
};

const TOOLS = [
  {
    name: 'ams_generate_art',
    description: 'Generates an expressive creative coding drawing program for a given prompt using multi-layered composition guidelines.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Artistic prompt (e.g. "three red flowers", "sunset horizon")' },
        medium: { type: 'string', enum: ['watercolor', 'flat', 'pixel'], default: 'watercolor', description: 'Target visual medium' },
        candidateCount: { type: 'integer', default: 4, description: 'Number of variations to synthesize (1-4)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ams_evaluate_rewards',
    description: 'Computes objective aesthetic reward metrics (validity, redness, leftness, 3-shape rule, empty space, total score) on a drawing program.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'object', description: 'Drawing program object { version: 1, actions: [...] }' },
        targetShapes: { type: 'integer', default: 3, description: 'Expected shape count for 3-shape rule' }
      },
      required: ['program']
    }
  },
  {
    name: 'ams_render_svg',
    description: 'Converts a vector drawing program into a standalone, scalable SVG XML string.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'object', description: 'Drawing program to render' },
        size: { type: 'integer', default: 1024, description: 'Canvas resolution in pixels' }
      },
      required: ['program']
    }
  },
  {
    name: 'ams_list_examples',
    description: 'Returns the gallery of handcrafted exemplar artworks and drawing programs.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'ams_grade_candidates',
    description: 'Grades and ranks candidate artworks with multi-criteria scores, critiques, star ratings, and marks the winning candidate.',
    inputSchema: {
      type: 'object',
      properties: {
        grades: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              candidate: { type: ['integer', 'string'] },
              rating: { type: 'integer', minimum: 1, maximum: 5 },
              score: { type: 'number' },
              feedback: { type: 'string' }
            },
            required: ['candidate']
          }
        },
        chosenCandidate: { type: ['integer', 'string'] }
      },
      required: ['grades']
    }
  },
  {
    name: 'ams_train_model',
    description: 'Trains a client-side Low-Rank Adapter (LoRA) or policy network on chosen candidate artworks.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Subject or theme of the artwork being trained' },
        modelName: { type: 'string', description: 'Display name of the trained model' },
        baseModel: { type: 'string', default: 'HuggingFaceTB/SmolLM2-135M-Instruct' },
        epochs: { type: 'integer', default: 6 },
        learningRate: { type: 'number', default: 0.002 }
      },
      required: ['prompt']
    }
  },
  {
    name: 'ams_export_model',
    description: 'Exports a trained model as a portable .ams-model.json bundle.',
    inputSchema: {
      type: 'object',
      properties: {
        modelId: { type: 'string' }
      }
    }
  },
  {
    name: 'ams_import_model',
    description: 'Imports an AMS model JSON package into storage.',
    inputSchema: {
      type: 'object',
      properties: {
        modelData: { type: ['string', 'object'] }
      },
      required: ['modelData']
    }
  },
  {
    name: 'ams_list_trained_models',
    description: 'Lists all fine-tuned models and adapters.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

let serverActiveCandidates = [];
let serverTrainedModels = [];

function generateProceduralProgram(prompt, seed = 0, isWatercolor = true) {
  const isRed = prompt.includes('red') || prompt.includes('rose') || prompt.includes('cherry');
  const primary = isRed ? '#d94262' : '#3a72a0';
  const secondary = isRed ? '#f28da2' : '#7cb0db';
  const stem = '#2f5233';

  const actions = [
    { op: 'background', color: isWatercolor ? '#faf7f2' : '#f5f5f5' }
  ];

  if (isWatercolor) {
    actions.push({ op: 'brush.bleed', amount: 0.35 });
    actions.push({ op: 'brush.texture', amount: 0.45 });
  }

  const positions = [-0.45, 0.0, 0.45];
  for (let i = 0; i < positions.length; i++) {
    const x = positions[i] + (seed * 0.05);
    const y = -0.15 + (i === 1 ? -0.1 : 0.05);

    actions.push({ op: 'stroke', color: stem, width: 2.5 });
    actions.push({ op: 'line', x1: x, y1: y, x2: x * 0.7, y2: 0.65 });

    actions.push({ op: 'noStroke' });
    actions.push({ op: 'fill', color: i === 1 ? primary : secondary, opacity: 0.85 });
    actions.push({ op: 'circle', x, y, diameter: i === 1 ? 0.35 : 0.25 });

    actions.push({ op: 'fill', color: '#f5c342', opacity: 0.95 });
    actions.push({ op: 'circle', x, y, diameter: 0.08 });
  }

  return { version: 1, actions };
}

function programToSvg(program, size = 1024) {
  const actions = program?.actions || [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">\n`;
  
  let currentFill = 'none';
  let currentStroke = 'none';
  let currentStrokeWidth = 1;

  const toPx = (normVal) => ((normVal + 1) / 2) * size;
  const toPxSize = (normVal) => (normVal / 2) * size;

  for (const act of actions) {
    if (act.op === 'background') {
      svg += `  <rect width="${size}" height="${size}" fill="${act.color}" />\n`;
    } else if (act.op === 'fill') {
      currentFill = act.color;
    } else if (act.op === 'noFill') {
      currentFill = 'none';
    } else if (act.op === 'stroke') {
      currentStroke = act.color;
      if (act.width) currentStrokeWidth = act.width;
    } else if (act.op === 'noStroke') {
      currentStroke = 'none';
    } else if (act.op === 'strokeWidth') {
      currentStrokeWidth = act.width;
    } else if (act.op === 'circle') {
      const cx = toPx(act.x);
      const cy = toPx(act.y);
      const r = toPxSize(act.diameter) / 2;
      svg += `  <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${currentFill}" stroke="${currentStroke}" stroke-width="${currentStrokeWidth}" />\n`;
    } else if (act.op === 'rect') {
      const x = toPx(act.x - act.width / 2);
      const y = toPx(act.y - act.height / 2);
      const w = toPxSize(act.width);
      const h = toPxSize(act.height);
      svg += `  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${currentFill}" stroke="${currentStroke}" stroke-width="${currentStrokeWidth}" />\n`;
    } else if (act.op === 'line') {
      const x1 = toPx(act.x1);
      const y1 = toPx(act.y1);
      const x2 = toPx(act.x2);
      const y2 = toPx(act.y2);
      svg += `  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${currentStroke}" stroke-width="${currentStrokeWidth}" />\n`;
    }
  }

  svg += '</svg>';
  return svg;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id, result, error = null) {
  const resp = { jsonrpc: '2.0', id };
  if (error) {
    resp.error = error;
  } else {
    resp.result = result;
  }
  process.stdout.write(JSON.stringify(resp) + '\n');
}

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let currentId = null;
  try {
    const msg = JSON.parse(trimmed);
    currentId = msg?.id ?? null;
    const { id, method, params } = msg;

    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: MCP_SERVER_INFO
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'tools/list') {
      sendResponse(id, { tools: TOOLS });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      switch (toolName) {
        case 'ams_generate':
        case 'ams_generate_art': {
          const count = args.count || args.candidateCount || 4;
          const candidates = [];
          for (let i = 0; i < count; i++) {
            const prog = generateProceduralProgram((args.prompt || 'flowers').toLowerCase(), i, args.medium === 'watercolor');
            candidates.push({
              candidateIndex: i,
              directive: String.fromCharCode(65 + i),
              prompt: args.prompt,
              program: prog
            });
          }
          serverActiveCandidates = candidates;
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ prompt: args.prompt, candidates }, null, 2)
              }
            ]
          });
          break;
        }

        case 'ams_grade_candidates': {
          const grades = args.grades || [];
          for (const g of grades) {
            const target = g.candidate !== undefined ? g.candidate : (g.candidateIndex !== undefined ? g.candidateIndex : g.candidateId);
            const cand = typeof target === 'number' ? serverActiveCandidates[target] : serverActiveCandidates.find(c => c.id === target);
            if (cand) {
              cand.rating = g.rating;
              cand.score = g.score;
              cand.feedback = g.feedback || g.critique;
            }
          }
          const chosen = args.chosenCandidate;
          if (chosen !== undefined) {
            serverActiveCandidates.forEach((c, idx) => {
              c.selected = (typeof chosen === 'number' ? idx === chosen : c.id === chosen);
            });
          }
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  gradedCount: grades.length,
                  chosenCandidate: args.chosenCandidate
                }, null, 2)
              }
            ]
          });
          break;
        }

        case 'ams_train_model': {
          const prompt = args.prompt || 'art';
          let positives = serverActiveCandidates.filter(c => c.selected || (c.rating && c.rating >= 4));
          if (positives.length === 0 && serverActiveCandidates.length > 0) {
            positives = [serverActiveCandidates[0]];
          }
          if (positives.length === 0) {
            positives = [
              {
                candidateIndex: 0,
                program: generateProceduralProgram(prompt.toLowerCase(), 0, true)
              }
            ];
          }
          const negatives = serverActiveCandidates.filter(c => !positives.includes(c));

          const trainer = new InBrowserTrainer({
            baseModel: args.baseModel || 'HuggingFaceTB/SmolLM2-135M-Instruct',
            learningRate: args.learningRate || 0.002,
            rank: 4
          });

          const trainedModel = await trainer.train({
            prompt,
            samples: positives,
            rejectedSamples: negatives,
            epochs: args.epochs || 6,
            modelName: args.modelName || `${prompt} (LoRA)`
          });

          serverTrainedModels.push(trainedModel);
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  modelId: trainedModel.id,
                  name: trainedModel.name,
                  baseModel: trainedModel.baseModel,
                  architecture: trainedModel.architecture,
                  finalLoss: trainedModel.trainingMetrics.finalLoss,
                  epochsCompleted: trainedModel.trainingMetrics.epochsCompleted
                }, null, 2)
              }
            ]
          });
          break;
        }

        case 'ams_export_model': {
          const target = args.modelId ? serverTrainedModels.find(m => m.id === args.modelId) : serverTrainedModels[serverTrainedModels.length - 1];
          if (!target) {
            sendResponse(id, null, { code: -32602, message: 'No trained model available to export' });
            return;
          }
          const json = exportModelToJSON(target);
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: json
              }
            ]
          });
          break;
        }

        case 'ams_import_model': {
          try {
            const imported = importModelFromJSON(args.modelData);
            serverTrainedModels.push(imported);
            sendResponse(id, {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    modelId: imported.id,
                    name: imported.name
                  }, null, 2)
                }
              ]
            });
          } catch (err) {
            sendResponse(id, null, { code: -32602, message: err.message });
          }
          break;
        }

        case 'ams_list_trained_models': {
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(serverTrainedModels.map(m => ({
                  id: m.id,
                  name: m.name,
                  baseModel: m.baseModel,
                  architecture: m.architecture
                })), null, 2)
              }
            ]
          });
          break;
        }

        case 'ams_evaluate_rewards': {
          const norm = normalizeProgram(args.program);
          const scores = evaluateReward(norm, { targetShapes: args.targetShapes || 3 });
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(scores, null, 2)
              }
            ]
          });
          break;
        }

        case 'ams_render_svg': {
          const svg = programToSvg(args.program, args.size || 1024);
          sendResponse(id, {
            content: [{ type: 'text', text: svg }]
          });
          break;
        }

        case 'ams_list_examples': {
          const examples = loadExamples();
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(examples.map(e => ({ name: e.name, medium: e.medium, actionsCount: e.program?.actions?.length || 0 })), null, 2)
              }
            ]
          });
          break;
        }

        default:
          sendResponse(id, null, { code: -32601, message: `Tool not found: ${toolName}` });
      }
      return;
    }

    if (method === 'ping') {
      sendResponse(id, 'pong');
      return;
    }

    sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
  } catch (err) {
    sendResponse(currentId, null, { code: -32603, message: `Server error: ${err.message}` });
  }
});
