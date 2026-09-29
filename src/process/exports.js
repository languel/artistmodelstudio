/**
 * Process document exports and imports.
 *
 *   SVG        each stage is a <g>, each element a <g> carrying its full record in
 *              data-ams-* attributes (points with time and pressure, brush, params,
 *              why, author). Marks are drawn by the same brush code through a small
 *              Canvas2D-compatible SVG context, so the SVG matches the canvas.
 *   Excalidraw freedraw / line / ellipse / text elements with the element record in
 *              customData.ams, so work moves to and from underscores.
 *   p5         a sketch that re-runs the score (when there is one) and renders with
 *              the same brushes on p5's drawingContext.
 *   Sheet      a PNG "process sheet": the picture built up stage by stage, with decisions.
 */
import { KIT, BRUSHES, mulberry32, resolveParams, installLines } from './brushes.js';
import { noteSVG } from './notes.js';
import { normalizeDocument, normalizeElement, createDocument } from './document.js';
import { renderToCanvas } from './render.js';
import boardsSrc from './boards.js?raw';
import envelopeSrc from './envelope.js?raw';
import documentSrc from './document.js?raw';
import textureSrc from './texture.js?raw';
import brushesSrc from './brushes.js?raw';
import renderSrc from './render.js?raw';
import notesSrc from './notes.js?raw';
import scriptSrc from './script.js?raw';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r2 = v => Math.round(v * 100) / 100;

// ---- SVG ------------------------------------------------------------------------

/** Enough of CanvasRenderingContext2D for the brushes, writing SVG elements. */
class SvgContext {
  constructor() { this.out = []; this.state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, dash: [], lineCap: 'butt', lineJoin: 'miter' }; this.stack = []; this.d = ''; }
  get fillStyle() { return this.state.fillStyle; } set fillStyle(v) { this.state.fillStyle = v; }
  get strokeStyle() { return this.state.strokeStyle; } set strokeStyle(v) { this.state.strokeStyle = v; }
  get lineWidth() { return this.state.lineWidth; } set lineWidth(v) { this.state.lineWidth = v; }
  get globalAlpha() { return this.state.globalAlpha; } set globalAlpha(v) { this.state.globalAlpha = v; }
  get lineCap() { return this.state.lineCap; } set lineCap(v) { this.state.lineCap = v; }
  get lineJoin() { return this.state.lineJoin; } set lineJoin(v) { this.state.lineJoin = v; }
  set font(v) { this.state.font = v; }
  setLineDash(d) { this.state.dash = d; }
  save() { this.stack.push({ ...this.state }); }
  restore() { this.state = this.stack.pop() || this.state; }
  beginPath() { this.d = ''; }
  moveTo(x, y) { this.d += `M${r2(x)} ${r2(y)}`; }
  lineTo(x, y) { this.d += `L${r2(x)} ${r2(y)}`; }
  closePath() { this.d += 'Z'; }
  arc(x, y, r) { this.d += `M${r2(x - r)} ${r2(y)}a${r2(r)} ${r2(r)} 0 1 1 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 1 ${r2(-2 * r)} 0`; }   // clockwise, as canvas arc() draws by default
  fill() { this.out.push(`<path d="${this.d}" fill="${esc(this.state.fillStyle)}"${this.state.globalAlpha < 1 ? ` fill-opacity="${this.state.globalAlpha}"` : ''}/>`); }
  stroke() {
    const s = this.state;
    this.out.push(`<path d="${this.d}" fill="none" stroke="${esc(s.strokeStyle)}" stroke-width="${r2(s.lineWidth)}"${s.globalAlpha < 1 ? ` stroke-opacity="${s.globalAlpha}"` : ''}${s.dash.length ? ` stroke-dasharray="${s.dash.map(r2).join(' ')}"` : ''}${s.lineCap !== 'butt' ? ` stroke-linecap="${s.lineCap}"` : ''}${s.lineJoin && s.lineJoin !== 'miter' ? ` stroke-linejoin="${s.lineJoin}"` : ''}/>`);
  }
  fillRect(x, y, w, h) { this.out.push(`<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${esc(this.state.fillStyle)}"/>`); }
  strokeRect() {}
  fillText() {}
  measureText(t) { return { width: String(t).length * 7 }; }
}

export function toSVG(doc, { mode = 'process' } = {}) {
  doc = normalizeDocument(doc);
  const { width, height, ground } = doc.artboard;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-ams-type="ams-process" data-ams-version="${doc.version}" data-ams-title="${esc(doc.title)}">`];
  out.push(`  <rect data-ams-ground="1" width="${width}" height="${height}" fill="${esc(ground)}"/>`);
  if (doc.decisions.length) out.push(`  <desc data-ams-decisions='${esc(JSON.stringify(doc.decisions))}'>${esc(doc.decisions.map(d => `${d.question} → ${d.chosen}${d.why ? ` (${d.why})` : ''}`).join('\n'))}</desc>`);
  if (doc.meta?.script) out.push(`  <metadata data-ams-script='${esc(JSON.stringify(doc.meta.script))}'/>`);
  installLines(doc);
  for (const s of doc.stages) {
    out.push(`  <g data-ams-stage="${esc(s.id)}" data-ams-name="${esc(s.name)}" data-ams-kind="${esc(s.kind)}"${s.visible ? '' : ' display="none"'}>`);
    for (const e of doc.elements.filter(x => x.stage === s.id && !x.hidden)) {
      const brush = BRUSHES[e.realize.brush] || BRUSHES.ink;
      const construction = brush.construction || e.role === 'guide' || e.role === 'gesture' || e.role === 'note';
      const ctx = new SvgContext();
      if (!construction || mode === 'process') {
        if (e.role === 'image') {
          const [a, b, , d] = e.points;
          if (a && b && d && e.src) ctx.out.push(`<image href="${esc(e.src)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${[b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1], a[0], a[1]].map(r2).join(' ')})"${(e.realize.params?.opacity ?? 1) < 1 ? ` opacity="${e.realize.params.opacity}"` : ''}/>`);
        } else if (e.role === 'note') {
          ctx.out.push(noteSVG(e, esc, r2));
        } else {
          const id = construction && !brush.construction ? 'guide' : e.realize.brush;
          const p = resolveParams(id, e.realize.params), env = { rng: mulberry32(e.seed || 1), scale: 1 };
          const closedFill = !construction && e.fill && e.points.length > 2 && e.closed && e.role !== 'plane';
          const fillPath = () => { ctx.fillStyle = e.fill; KIT.tracePath(ctx, KIT.smoothPath(e.points, true), true); ctx.fill(); };
          if (!construction && e.color === 'none') {
            // No stroke: only the fill (a plane's brush paints it).
            if (e.fill && e.role === 'plane') BRUSHES[id].draw(ctx, { ...e, color: e.fill }, p, env);
            else if (closedFill) fillPath();
          } else if (!construction && e.fill && e.role === 'plane') {
            BRUSHES[id].draw(ctx, { ...e, color: e.fill }, p, env);
            if (e.color) { ctx.strokeStyle = e.color; ctx.lineWidth = 2; KIT.tracePath(ctx, KIT.smoothPath(e.points, true), true); ctx.stroke(); }
          } else {
            if (closedFill) fillPath();
            BRUSHES[id].draw(ctx, e, p, env);
          }
        }
      }
      const rec = { ...e };
      out.push(`    <g data-ams-id="${esc(e.id)}" data-ams-role="${e.role}" data-ams-brush="${esc(e.realize.brush)}" data-ams-record='${esc(JSON.stringify(rec))}'${e.why ? ` data-ams-why="${esc(e.why)}"` : ''}${(e.opacity ?? 1) < 1 ? ` opacity="${e.opacity}"` : ''}${e.blend && e.blend !== 'normal' ? ` style="mix-blend-mode:${esc(e.blend)}"` : ''}>`);
      if (e.why) out.push(`      <title>${esc(e.why)}</title>`);
      for (const line of ctx.out) out.push(`      ${line}`);
      out.push('    </g>');
    }
    out.push('  </g>');
  }
  out.push('</svg>');
  return out.join('\n');
}

const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Recover a process document from an AMS SVG (records are authoritative). */
export function fromSVG(svg) {
  const attr = (tag, name) => { const m = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)); return m ? unesc(m[1] ?? m[2]) : null; };
  const root = svg.match(/<svg[^>]*>/)?.[0] || '';
  const vb = (attr(root, 'viewBox') || '').split(/[\s,]+/).map(Number);
  const doc = createDocument({ width: vb[2] || Number(attr(root, 'width')) || 1000, height: vb[3] || Number(attr(root, 'height')) || 1000 });
  doc.title = attr(root, 'data-ams-title') || doc.title;
  const ground = svg.match(/<rect[^>]*data-ams-ground[^>]*>/)?.[0];
  if (ground) doc.artboard.ground = attr(ground, 'fill') || doc.artboard.ground;
  const dec = svg.match(/<desc[^>]*data-ams-decisions[^>]*>/)?.[0];
  if (dec) { try { doc.decisions = JSON.parse(attr(dec, 'data-ams-decisions')); } catch { /* ignore */ } }
  const script = svg.match(/<metadata[^>]*data-ams-script[^>]*>/)?.[0];
  if (script) { try { doc.meta.script = JSON.parse(attr(script, 'data-ams-script')); } catch { /* ignore */ } }
  const stages = [...svg.matchAll(/<g[^>]*data-ams-stage=[^>]*>/g)].map(m => ({ id: attr(m[0], 'data-ams-stage'), name: attr(m[0], 'data-ams-name'), kind: attr(m[0], 'data-ams-kind') || 'marks', visible: !/display="none"/.test(m[0]), locked: false }));
  if (stages.length) doc.stages = stages;
  doc.elements = [...svg.matchAll(/<g[^>]*data-ams-record=[^>]*>/g)].map(m => { try { return JSON.parse(attr(m[0], 'data-ams-record')); } catch { return null; } }).filter(Boolean);
  return normalizeDocument(doc);
}

// ---- Excalidraw -------------------------------------------------------------------

export function toExcalidraw(doc) {
  doc = normalizeDocument(doc);
  const stageName = new Map(doc.stages.map(s => [s.id, s.name]));
  const now = Date.now();
  const base = (e, type, x, y, w, h) => ({
    id: e.id, type, x, y, width: w, height: h, angle: 0,
    strokeColor: e.color || '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2,
    strokeStyle: 'solid', roughness: 0, opacity: 100, groupIds: [`stage:${e.stage}`], frameId: null,
    roundness: null, seed: e.seed % 2147483647, version: 1, versionNonce: e.seed % 1000003, isDeleted: false,
    boundElements: null, updated: now, link: null, locked: false,
    customData: { ams: e, amsStage: stageName.get(e.stage) }
  });
  const elements = doc.elements.map(e => {
    const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    const rel = e.points.map(([x, y]) => [x - x0, y - y0]);
    if (e.role === 'note') return { ...base(e, 'text', x0, y0, 220, 20), text: e.text || e.why, originalText: e.text || e.why, fontSize: 16, fontFamily: 1, textAlign: 'left', verticalAlign: 'top', containerId: null, lineHeight: 1.25 };
    if (e.role === 'point') { const s = Number(e.realize.params.size) || 12; return { ...base(e, 'ellipse', x0 - s / 2, y0 - s / 2, s, s), backgroundColor: e.color || '#1e1e1e' }; }
    if (e.role === 'plane') return { ...base(e, 'line', x0, y0, w, h), points: [...rel, rel[0]], backgroundColor: e.color || '#8a8175', lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null };
    if (e.role === 'guide' || e.role === 'gesture') return { ...base(e, 'line', x0, y0, w, h), strokeStyle: 'dashed', strokeWidth: 1, points: rel, lastCommittedPoint: null, startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null };
    return { ...base(e, 'freedraw', x0, y0, w, h), points: rel, pressures: e.points.map(p => p[3]), simulatePressure: false, lastCommittedPoint: null };
  });
  return { type: 'excalidraw', version: 2, source: 'artist-model-studio', elements, appState: { viewBackgroundColor: doc.artboard.ground }, files: {} };
}

export function fromExcalidraw(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const doc = createDocument();
  const els = (data.elements || []).filter(e => !e.isDeleted);
  if (!els.length) return doc;
  const stages = new Map();
  const stageFor = e => {
    const name = e.customData?.amsStage || 'Imported';
    if (!stages.has(name)) stages.set(name, { id: e.customData?.ams?.stage || `stage_${stages.size}`, name, kind: 'marks', visible: true, locked: false });
    return stages.get(name).id;
  };
  doc.elements = els.map(e => {
    if (e.customData?.ams) { stageFor(e); return e.customData.ams; }
    const stage = stageFor(e);
    const pts = (e.points || [[0, 0]]).map(([x, y], i) => [e.x + x, e.y + y, i * 16, e.pressures?.[i] ?? 0.5]);
    if (e.type === 'text') return normalizeElement({ role: 'note', stage, points: [[e.x, e.y]], text: e.text }, stage);
    if (e.type === 'ellipse' || e.type === 'rectangle' || e.type === 'diamond') {
      const r = [[e.x, e.y], [e.x + e.width, e.y], [e.x + e.width, e.y + e.height], [e.x, e.y + e.height]];
      return normalizeElement({ role: 'plane', stage, points: r, color: e.backgroundColor !== 'transparent' ? e.backgroundColor : null }, stage);
    }
    if (e.type === 'line' && e.backgroundColor && e.backgroundColor !== 'transparent') return normalizeElement({ role: 'plane', stage, points: pts, color: e.backgroundColor }, stage);
    if (e.type === 'line' || e.type === 'arrow') return normalizeElement({ role: e.strokeStyle === 'dashed' ? 'guide' : 'line', stage, points: pts, color: e.strokeColor }, stage);
    return normalizeElement({ role: 'line', stage, points: pts, color: e.strokeColor, realize: { brush: 'ink', params: { width: e.strokeWidth * 1.5 } } }, stage);
  });
  doc.stages = [...stages.values()];
  // Fit the artboard around imported work.
  const xs = doc.elements.flatMap(e => e.points.map(p => p[0])), ys = doc.elements.flatMap(e => e.points.map(p => p[1]));
  const x0 = Math.min(...xs) - 40, y0 = Math.min(...ys) - 40;
  for (const e of doc.elements) e.points = e.points.map(([x, y, t, p]) => [x - x0, y - y0, t, p]);
  doc.artboard.width = Math.max(200, Math.round(Math.max(...xs) - x0 + 40));
  doc.artboard.height = Math.max(200, Math.round(Math.max(...ys) - y0 + 40));
  doc.artboard.ground = data.appState?.viewBackgroundColor || doc.artboard.ground;
  return normalizeDocument(doc);
}

// ---- p5 ---------------------------------------------------------------------------

const strip = src => src
  .replace(/^import[^;]*;\s*$/gm, '')
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(default\s+)?/gm, '');

export function toP5(doc, { title = doc.title || 'Artist Model Studio sketch' } = {}) {
  doc = normalizeDocument(doc);
  const script = doc.meta?.script;
  const stagesComment = doc.stages.map((s, i) => `//   ${i + 1}. ${s.name} (${s.kind})${s.why ? ` — ${s.why}` : ''}`).join('\n');
  const decisions = doc.decisions.map(d => `//   ${d.question} → ${d.chosen}${d.why ? `  (${d.why})` : ''}`).join('\n');
  const header = `// ${title}
// Exported from Artist Model Studio on ${new Date().toISOString().slice(0, 10)}.
// The process is kept: stages, decisions, and each element's reason.
//
// Stages:
${stagesComment || '//   (none)'}
${decisions ? `//\n// Decisions:\n${decisions}\n` : ''}//
// Keys: P toggles the process view (construction and notes), 1–9 show the picture
// up to that stage, 0 shows everything, R re-runs the score with a new seed, S saves a PNG.
`;
  const scoreBlock = script
    ? `// ---- The score: edit it and reload. Running it records the process. ----\nconst SCORE = ${JSON.stringify(script)};\n`
    : 'const SCORE = null; // hand-drawn: the process below is the record\n';
  return `${header}
${scoreBlock}const PROCESS = ${JSON.stringify(doc)};

let doc = PROCESS, mode = 'picture', upTo = Infinity, seedN = PROCESS.meta?.seed || 1;

function setup() {
  // The recorded drawing, with its own brushes and lines registered (normalizing installs them).
  doc = normalizeDocument(PROCESS);
  createCanvas(doc.artboard.width, doc.artboard.height);
  noLoop();
}

// R: the score runs again with a new seed, on this artboard (the recorded drawing is shown until then).
function rerun(s) {
  const out = runScript(SCORE, { seed: s, base: { ...PROCESS, elements: [], decisions: [], stages: [] } });
  if (out.doc) doc = out.doc; else console.warn(out.error);
}

function draw() {
  clear();
  renderDocument(drawingContext, doc, { mode, upTo, transform: { x: 0, y: 0, scale: 1 } });
}

function keyPressed() {
  if (key === 'p' || key === 'P') mode = mode === 'picture' ? 'process' : 'picture';
  else if (key >= '1' && key <= '9') upTo = Number(key) - 1;
  else if (key === '0') upTo = Infinity;
  else if ((key === 'r' || key === 'R') && SCORE) { seedN = Math.floor(Math.random() * 1e6); rerun(seedN); }
  else if (key === 's' || key === 'S') saveCanvas('ams-sketch', 'png');
  redraw();
}

// ---- Artist Model Studio process runtime (unchanged library code) ----
${strip(boardsSrc)}
${strip(envelopeSrc)}
${strip(documentSrc)}
${strip(textureSrc)}
${strip(brushesSrc)}
${strip(notesSrc)}
${strip(renderSrc)}
${strip(scriptSrc)}
`;
}

/** version: '2' (the latest p5.js 2.x, default) or '1' (the latest 1.x). */
export function p5IndexHtml(title = 'Artist Model Studio sketch', version = '2') {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/p5@${version === '1' ? '1' : '2'}/lib/p5.min.js"></script>
<style>html,body{margin:0;background:#222;display:grid;place-items:center;min-height:100vh}</style>
</head><body><script src="sketch.js"></script></body></html>`;
}

// ---- Process sheet ------------------------------------------------------------------

/** A PNG-ready canvas: the picture built up stage by stage, plus the decisions. */
export function processSheet(doc, { cell = 260 } = {}) {
  doc = normalizeDocument(doc);
  const stages = doc.stages.filter(s => s.visible);
  const cols = Math.min(4, stages.length + 1);
  const rows = Math.ceil((stages.length + 1) / cols);
  const k = cell / Math.max(doc.artboard.width, doc.artboard.height);
  const cw = Math.round(doc.artboard.width * k), ch = Math.round(doc.artboard.height * k);
  const pad = 16, label = 22;
  const decH = doc.decisions.length ? 22 + doc.decisions.length * 18 : 0;
  const c = document.createElement('canvas');
  c.width = pad + cols * (cw + pad);
  c.height = pad + rows * (ch + label + pad) + decH + 34;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#faf8f4'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#1d1b19'; ctx.font = '600 15px Inter, sans-serif';
  ctx.fillText(doc.title || 'Process sheet', pad, 24);
  const frames = [...stages.map((s, i) => ({ s, i: doc.stages.indexOf(s), mode: 'process' })), { s: { name: 'Picture' }, i: Infinity, mode: 'picture' }];
  frames.forEach((f, n) => {
    const x = pad + (n % cols) * (cw + pad), y = 34 + Math.floor(n / cols) * (ch + label + pad);
    ctx.drawImage(renderToCanvas(doc, { scale: k, mode: f.mode, upTo: f.i }), x, y + label);
    ctx.fillStyle = '#1d1b19'; ctx.font = '12px Inter, sans-serif';
    ctx.fillText(`${Number.isFinite(f.i) ? `${n + 1}. ` : ''}${f.s.name}`, x, y + 15);
  });
  if (decH) {
    let y = c.height - decH - 8;
    ctx.font = '600 12px Inter, sans-serif'; ctx.fillText('Decisions', pad, y); y += 18;
    ctx.font = '12px Inter, sans-serif';
    for (const d of doc.decisions) { ctx.fillText(`${d.question} → ${d.chosen}${d.why ? `  (${d.why})` : ''}`, pad, y); y += 18; }
  }
  return c;
}
