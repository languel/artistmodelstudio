/**
 * Midinous projects as AMS scores. Midinous (and midinojs, its web port) is a grid music system:
 * nodes (notes, controllers, counters…) joined by paths, and travelers that run the paths one grid
 * cell a beat and play the node they reach, which sends them on. Here a node is a trigger, a path is a
 * line a traveler runs, and the node's rules are `emit` code; the graph runs on the same transport and
 * kernel as everything else. This writes the AMS score as code (read it, change it, run it).
 *
 *   const { code, title, size, settings, warnings, stats } = nousToScore(textOrObject, { title })
 *
 * Reads midinojs JSON ({ points: [...], settings }) and the original Midinous JSON (_note_points,
 * _cc_points, … and _paths). Node types: note and cc (with repeat, chance, mute, relative notes and
 * scales), counter, switch, terminator, anchor; play modes robin, split, random, portal; a start node
 * sends its signal when play starts. Not imported (listed in `warnings`): gates and logic paths (the
 * signal passes through), LED nodes, groups. A switch passes every other signal.
 */
import { MIDINOUS_ORDER } from '../scale.js';

const GRID = 144;   // the Midinous grid, in its own units
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const r = (v, d = 2) => { const k = 10 ** d; return Math.round(v * k) / k; };
const q = v => JSON.stringify(v);
const MODES = ['robin', 'split', 'portal', 'random'];

const LEGACY = [['_note_points', 'note'], ['_cc_points', 'cc'], ['_gate_points', 'gate'], ['_LED_points', 'led'], ['_counter_points', 'counter'], ['_switch_points', 'switch'], ['_terminator_points', 'terminator']];

function readColor(c) {
  if (c && typeof c === 'object') return `#${[c.R, c.G, c.B].map(v => Math.max(0, Math.min(255, num(v))).toString(16).padStart(2, '0')).join('')}`;
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null;
}

function readNode(d, type) {
  let x = d.x, y = d.y;
  if ((x === undefined || y === undefined) && typeof d.Origin === 'string') { const [a, b] = d.Origin.split(','); x = parseFloat(a); y = parseFloat(b); }
  const mode = d._Mode ?? d.playMode;
  const path = d.PathMode ?? d.pathMode;
  const midi = d.midi_data || {}, rel = d.relative_midi_data || {};
  const legacy = d.Origin !== undefined;
  return {
    id: d.id, type: d.type || type || 'note', label: d.label || '', color: readColor(d.color),
    x: num(x), y: num(y),
    note: num(midi.Primary ?? d.note, 60), velocity: num(midi.Secondary ?? d.velocity, 100), channel: Math.max(1, Math.min(16, num(midi.Channel ?? d.channel, 1))),
    duration: Math.max(0.0625, num(midi.Duration ?? d.duration, 1)), repeat: Math.max(0, Math.round(num(midi.Repeat ?? d.repeat, 0))),
    scale: midi.Scale, root: midi.Root,
    relative: d.useRelative ?? (legacy && num(rel.Primary) !== 0),
    offset: num(rel.Primary), pass: Boolean(rel.Pass?.Primary), relScale: rel.Scale, relRoot: rel.Root,
    chance: d.probability ?? d.chance ?? 100, forceScale: d.force_scale ?? d.forceScale ?? true, mute: Boolean(d.mute),
    start: Boolean(d.Start ?? d.isStart),
    mode: typeof mode === 'string' ? Math.max(0, MODES.indexOf(mode)) : num(mode, 0),
    pathMode: typeof path === 'string' ? ({ horz: 0, vert: 1, line: 2 }[path] ?? 0) : num(path, 0),
    to: [...(d.SerializablePathTo || d.to || [])], weights: {},
    countMax: d.CountLimit ?? d.countMax, ccNum: d.ccNum, ccValue: d.ccValue, gateType: d.gateType
  };
}

export function parseNous(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const nodes = [];
  let settings = {};
  if (Array.isArray(data?.points)) {
    settings = { tempo: data.settings?.tempo, beats: data.settings?.beats, scale: data.settings?.scale, root: data.settings?.rootNote };
    for (const p of data.points) nodes.push(readNode(p));
  } else if (data && (data._note_points || data._version)) {
    const perf = data._performance_data || {};
    settings = { tempo: perf.tempo, scale: MIDINOUS_ORDER[perf.doc_scale], root: perf.doc_root };
    for (const [key, type] of LEGACY) for (const p of Object.values(data[key] || {})) nodes.push(readNode(p, type));
    const byId = new Map(nodes.map(n => [n.id, n]));
    for (const p of Object.values(data._paths || {})) {
      const src = byId.get(p.key?.source_id);
      if (!src || p.logic) continue;
      if (!src.to.includes(p.key.target_id)) src.to.push(p.key.target_id);
      src.weights[p.key.target_id] = p.weight;
    }
  } else throw new Error('Not a Midinous or midinojs project');
  return { nodes, settings };
}

/** The polyline of a path from a to b: horizontal first, vertical first, or direct. */
function edgePoints(a, b, mode) {
  if (mode === 2 || a.x === b.x || a.y === b.y) return [[a.x, a.y], [b.x, b.y]];
  return mode === 1 ? [[a.x, a.y], [a.x, b.y], [b.x, b.y]] : [[a.x, a.y], [b.x, a.y], [b.x, b.y]];
}

const nodeEmit = (n, byId, ctx) => {
  const L = [];
  const scaleName = i => (i === undefined || i < 0 ? null : MIDINOUS_ORDER[i] ?? null);
  const outs = n.to.filter(id => byId.has(id)).map(id => {
    const t = byId.get(id);
    const cells = (Math.abs(t.x - n.x) + Math.abs(t.y - n.y)) / GRID;
    return [`e${n.id}_${id}`, r(Math.max(0.25, cells), 3), `n${id}`, n.weights[id] ?? t.chance ?? 100];
  });
  const route = outs.length && n.type !== 'terminator' ? `route(${q(MODES[n.mode] ?? 'robin')}, ${q(outs)}, { note: n })` : null;
  if (n.type === 'terminator') return '';
  const scale = q(scaleName(n.relScale) || scaleName(n.scale) || ctx.scale || 'Chromatic'), root = n.relRoot >= 0 && n.relRoot != null ? n.relRoot : n.root >= 0 && n.root != null ? n.root : ctx.root ?? 60;
  if (n.type === 'counter') {
    L.push(`state.n = (state.n || 0) + 1`, `if (state.n < ${Math.max(1, num(n.countMax, 1))}) return`, `state.n = 0`, 'const n = data && data.note');
  } else if (n.type === 'switch') {
    L.push('state.on = !state.on', 'if (!state.on) return', 'const n = data && data.note');
  } else if (n.type === 'note' || n.type === 'cc') {
    L.push(`const base = data && data.note != null ? data.note : ${n.note}`);
    if (n.type === 'note') {
      L.push(n.relative && !n.pass ? `let n = step(base, ${n.offset}, ${scale}, ${root})` : n.relative ? 'let n = base' : `let n = ${n.note}`);
      if (n.forceScale) L.push(`n = snap(n, ${scale}, ${root})`);
      const dur = `beats(${r(n.duration, 3)})`;
      const play = [`note(${n.channel}, n, ${n.velocity}, ${dur})`];
      if (n.repeat) play.push(`for (let k = 1; k <= ${n.repeat}; k++) note(${n.channel}, n, ${n.velocity}, ${dur}, ${dur} * k)`);
      if (!n.mute) L.push(`if (rng() * 100 < ${num(n.chance, 100)}) { ${play.join('; ')} }`);
    } else {
      L.push('const n = base');
      if (!n.mute) L.push(`cc(${n.channel}, ${num(n.ccNum ?? n.note)}, ${num(n.ccValue ?? n.velocity)})`);
    }
  } else L.push('const n = data && data.note');   // anchors, gates, LEDs: the signal passes
  if (route) L.push(route);
  return L.join(';\n');
};

export function nousToScore(input, options = {}) {
  const { nodes, settings } = parseNous(input);
  const warnings = [];
  const title = options.title || 'Midinous project';
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (!nodes.length) return { code: '', title, size: { width: 1000, height: 600 }, settings, warnings: ['Midinous: no nodes'], stats: { nodes: 0, paths: 0 } };

  const kinds = new Set(nodes.map(n => n.type));
  for (const k of ['gate', 'led']) if (kinds.has(k)) warnings.push(`Midinous: ${k} nodes are not imported (the signal passes through them)`);
  if (kinds.has('switch')) warnings.push('Midinous: a switch passes every other signal');

  const xs = nodes.map(n => n.x / GRID), ys = nodes.map(n => n.y / GRID);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const margin = 70, bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const cell = Math.min(90, (1000 - 2 * margin) / bw, (900 - 2 * margin) / bh);
  const width = Math.round(bw * cell + 2 * margin), height = Math.round(bh * cell + 2 * margin);
  const px = n => r(margin + (n.x / GRID - x0) * cell), py = n => r(margin + (n.y / GRID - y0) * cell);
  const ctx = { scale: settings.scale, root: settings.root };

  const L = [];
  L.push(`// ${title}: imported from Midinous (${nodes.length} nodes). One grid cell is one beat; the tempo is the scene's.`);
  L.push(`units('artboard')`);
  if (!options.inBoard) L.push(`board(${q(title)}, { width: ${width}, height: ${height} })`);
  let paths = 0;
  for (const n of nodes) {
    for (const id of n.to) {
      const t = byId.get(id);
      if (!t) continue;
      paths++;
      const pts = edgePoints({ x: px(n), y: py(n) }, { x: px(t), y: py(t) }, n.pathMode);
      L.push(`line(${q(pts)}, { path: 'straight', width: 2, color: ${q(n.color || '#6a8caf')}, opacity: 0.6, play: { path: ${q(`e${n.id}_${id}`)} } })`);
    }
  }
  for (const n of nodes) {
    const emit = nodeEmit(n, byId, ctx);
    const colour = n.color || (n.type === 'cc' ? '#c8664f' : n.type === 'terminator' ? '#777777' : '#222222');
    const size = n.type === 'terminator' ? 7 : n.type === 'anchor' ? 4 : 9;
    L.push(`point(${px(n)}, ${py(n)}, { size: ${size}, color: ${q(colour)}${n.label ? `, label: ${q(n.label)}` : ''}, play: { trigger: { name: ${q(`n${n.id}`)}, on: [], r: 6${n.start ? ', start: true' : ''}${emit ? `, emit: ${q(emit)}` : ''} } } })`);
  }
  if (!nodes.some(n => n.start)) warnings.push('Midinous: no start node, so nothing plays (mark one as a start)');
  // A grid cell is a beat: the scene's beat is as long as a cell is on this board.
  return { code: `${L.join('\n')}\n`, title, size: { width, height }, settings: { ...settings, beatUnits: r(cell, 2) }, warnings, stats: { nodes: nodes.length, paths } };
}
