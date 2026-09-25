/**
 * Executors: turn one step's answers into marks. They are honest and small: the
 * decisions (what, where, how, how dark, which way, how dense) come from the policy;
 * the executor only realizes them on the chosen region's geometry. Every mark records
 * the decisions that produced it as its reason.
 */
import { VALUES, DENSITIES } from './questions.js';

const STAGE_FOR = { look: ['Analysis', 'analysis'], block: ['Blocking', 'blocking'], structure: ['Structure', 'structure'], value: ['Value', 'value'], accent: ['Accents', 'accents'] };
const INK = { light: '#8f877c', middle: '#4d4740', dark: '#1d1b19' };
const TONE = { light: '#d9d1c4', middle: '#9b9184', dark: '#3f3a34' };

function stageId(app, step) {
  const [name, kind] = STAGE_FOR[step] || ['Marks', 'marks'];
  let s = app.store.doc.stages.find(x => x.name === name);
  if (!s) s = app.store.addStage({ name, kind }, null, { by: 'policy' });
  return s.id;
}

function angleFor(direction, region) {
  if (direction === 'follow') return region.orientation;
  if (direction === 'across') return region.orientation + 90;
  if (direction === 'vertical') return 90;
  if (direction === 'horizontal') return 0;
  return -40;
}

/** Principal axis of a region: the chord through its centroid along its orientation, clipped to its bbox. */
function axis(region, a, ab) {
  const [cx, cy] = [region.centroid[0] * ab.width, region.centroid[1] * ab.height];
  const [x0, y0, x1, y1] = [region.bbox[0] * ab.width, region.bbox[1] * ab.height, region.bbox[2] * ab.width, region.bbox[3] * ab.height];
  const half = Math.hypot(x1 - x0, y1 - y0) / 2;
  const r = (a * Math.PI) / 180;
  return [[cx - Math.cos(r) * half, cy - Math.sin(r) * half], [cx + Math.cos(r) * half, cy + Math.sin(r) * half]];
}

/**
 * Apply one step. d: { step, region, technique, value (0..2), direction, density (0..4) }.
 * by: { kind, name } of whoever decided. Returns the ids of the elements added.
 */
export function applyStep(app, analysis, d, by) {
  if (d.step === 'stop') return [];
  const region = analysis.regions.find(r => r.id === d.region) || analysis.regions[0];
  const ab = app.store.doc.artboard;
  const valueName = VALUES[Math.round(d.value ?? 1)] || 'middle';
  const dens = Math.round(d.density ?? 2);
  const angle = angleFor(d.direction, region);
  const why = `${d.step} · ${region.id} (${region.place}, ${region.valueClass} ${region.hue}) · ${d.technique} · ${valueName}${['hatch', 'crosshatch', 'stipple', 'walk'].includes(d.technique) ? ` · ${d.direction} · ${DENSITIES[dens]}` : ''}`;
  const stage = stageId(app, d.step);
  const add = el => app.store.addElement({ stage, by, why, ...el }, { by: by.kind }).id;
  const poly = region.polygon;
  const ids = [];

  if (d.step === 'look') {
    ids.push(add({ role: 'guide', points: [...poly, poly[0]], realize: { brush: 'guide', params: { dash: 6 } } }));
    if (region.coherence > 0.25) ids.push(add({ role: 'guide', points: axis(region, region.orientation, ab), realize: { brush: 'guide', params: { dash: 3 } } }));
    return ids;
  }
  switch (d.technique) {
    case 'flat':
      ids.push(add({ role: 'plane', points: poly, color: TONE[valueName], realize: { brush: 'flat', params: { opacity: 0.9 } } }));
      break;
    case 'hatch': case 'crosshatch':
      ids.push(add({ role: 'plane', points: poly, color: INK[valueName], realize: { brush: 'hatch', params: { angle, spacing: [22, 15, 10, 7, 5][dens], width: valueName === 'dark' ? 1.6 : 1.1, cross: d.technique === 'crosshatch' ? 1 : 0, jitter: 0.25 } } }));
      break;
    case 'stipple':
      ids.push(add({ role: 'plane', points: poly, color: INK[valueName], realize: { brush: 'stipple', params: { density: [0.0015, 0.003, 0.006, 0.011, 0.018][dens], size: 2 } } }));
      break;
    case 'contour':
      ids.push(add({ role: 'line', points: poly, closed: true, color: INK[valueName], realize: { brush: 'ink', params: { width: valueName === 'dark' ? 3 : 2, taper: 0, pressure: 0.3 } } }));
      break;
    case 'gesture':
      ids.push(add({ role: 'gesture', points: axis(region, angle, ab), realize: { brush: 'guide', params: { dash: 0 } } }));
      break;
    case 'walk': {
      const [a, b] = axis(region, angle, ab);
      const n = 40, pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, wob = Math.sin(t * Math.PI * (2 + dens)) * 18;
        const nx = -(b[1] - a[1]), ny = b[0] - a[0], L = Math.hypot(nx, ny) || 1;
        pts.push([a[0] + (b[0] - a[0]) * t + (nx / L) * wob, a[1] + (b[1] - a[1]) * t + (ny / L) * wob]);
      }
      ids.push(add({ role: 'line', points: pts, color: INK[valueName], realize: { brush: 'ink', params: { width: 2 + dens * 0.6, taper: 0.4 } } }));
      break;
    }
    case 'point': default: {
      const [cx, cy] = [region.centroid[0] * ab.width, region.centroid[1] * ab.height];
      ids.push(add({ role: 'point', points: [[cx, cy]], color: INK[valueName], realize: { brush: 'dot', params: { size: 10 + dens * 8 } } }));
    }
  }
  return ids;
}
