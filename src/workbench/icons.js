/** Small line icons for the workbench (24×24, stroke = currentColor). */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICONS = {
  select: svg('<path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor"/>'),
  direct: svg('<path d="M5 3l14 8-6 1.5L10 19z"/><rect x="15.5" y="15.5" width="4" height="4" fill="currentColor" stroke="none"/>'),
  hand: svg('<path d="M8 13V5.5a1.5 1.5 0 013 0V12m0-1V4.5a1.5 1.5 0 013 0V12m0-1.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L3.6 15a1.6 1.6 0 012.6-1.9L8 15"/>'),
  point: svg('<circle cx="12" cy="12" r="4" fill="currentColor"/>'),
  points: svg('<path d="M4 17c4-8 8-10 16-9" opacity=".45"/><circle cx="4" cy="17" r="1.6" fill="currentColor"/><circle cx="9" cy="11" r="1.6" fill="currentColor"/><circle cx="14.5" cy="8.4" r="1.6" fill="currentColor"/><circle cx="20" cy="8" r="1.6" fill="currentColor"/>'),
  sculpt: svg('<path d="M3 17c4-1 6-5 9-5s4 3 9 2"/><circle cx="12" cy="12" r="5.5" stroke-dasharray="2 2.2" opacity=".7"/>'),
  line: svg('<path d="M4 18c3-6 5-9 8-9s3 5 8-4"/>'),
  plane: svg('<path d="M5 7l9-3 5 7-4 8-10-2z" fill="currentColor" fill-opacity=".25"/>'),
  guide: svg('<path d="M3 17L21 7" stroke-dasharray="3 3"/>'),
  gesture: svg('<path d="M4 16c4-9 7 4 10-3s4-6 6-4" stroke-dasharray="1.5 3"/>'),
  note: svg('<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>'),
  stages: svg('<path d="M4 6h6M8 12h8M12 18h8"/><circle cx="4" cy="6" r="0.6" fill="currentColor"/>'),
  properties: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  lineNumbers: svg('<path d="M5 6h2v4M5 10h3M5 14h3l-3 4h3M11 7h8M11 12h8M11 17h8" />'),
  slidersCode: svg('<path d="M3 6h10M3 11h7M3 16h10" opacity=".5"/><path d="M15 12h6"/><circle cx="18" cy="12" r="1.8" fill="currentColor"/>'),
  slidersPreview: svg('<rect x="3" y="4" width="18" height="7" rx="1.5" opacity=".6"/><path d="M4 15h16M4 19h16"/><circle cx="9" cy="15" r="1.6" fill="currentColor"/><circle cx="15" cy="19" r="1.6" fill="currentColor"/>'),
  slidersOff: svg('<path d="M4 12h16" opacity=".5"/><circle cx="12" cy="12" r="1.8"/><path d="M5 5l14 14"/>'),
  script: svg('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>'),
  process: svg('<rect x="3" y="6" width="5" height="12" rx="1"/><rect x="10" y="6" width="5" height="12" rx="1"/><rect x="17" y="6" width="4" height="12" rx="1"/>'),
  assets: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  log: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  exercise: svg('<path d="M4 5h11l5 5v9H4z"/><path d="M8 13l2 2 5-5"/>'),
  history: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>'),
  scenes: svg('<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M3.5 9l1-4.2 15.8-2.3.9 4.2z"/><path d="M8.3 4.1l2 3.8M13.1 3.4l2 3.8"/>'),
  board: svg('<rect x="3.5" y="6" width="11" height="12" rx="1"/><rect x="9.5" y="3" width="11" height="12" rx="1" opacity=".55"/>'),
  page: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14h7M9 17h4"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  undo: svg('<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 010 10h-2"/>'),
  redo: svg('<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 000 10h2"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  // The title (T) and the performance gauge, each with an "off" state (struck through, like the eye)
  label: svg('<path d="M5 5h14M12 5v14"/>'),
  labelOff: svg('<path d="M5 5h14M12 5v14"/><path d="M3 3l18 18"/>'),
  repeat: svg('<path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4"/>'),
  repeatOff: svg('<path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4"/><path d="M3 3l18 18"/>'),
  volume: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11"/>'),
  mute: svg('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  // Media controls (a player under a board): shown / hidden
  controls: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 10.5l3 1.5-3 1.5z" fill="currentColor"/><path d="M14 12h4"/>'),
  controlsOff: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 10.5l3 1.5-3 1.5z" fill="currentColor"/><path d="M3 3l18 18"/>'),
  gauge: svg('<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/><path d="M7 15.5h.01M12 6.5v.01M17 15.5h.01"/>'),
  gaugeOff: svg('<circle cx="12" cy="12" r="9"/><path d="M12 12l4-4"/><path d="M3 3l18 18"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.1 6.2A17 17 0 002 12s4 7 10 7a9.8 9.8 0 005-1.3"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  up: svg('<path d="M6 14l6-6 6 6"/>'),
  down: svg('<path d="M6 10l6 6 6-6"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  picture: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  viewPicture: svg('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 16l5-5 4 4 3-3 4 4"/>'),
  viewProcess: svg('<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12h16M12 4v16" stroke-dasharray="2 2"/><path d="M7 17c3-6 6-6 10-10"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  snap: svg('<path d="M4 9h16M4 15h16M9 4v16M15 4v16" opacity=".55"/><circle cx="15" cy="9" r="2.6" fill="currentColor" stroke="none"/>'),
  film: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M8 5v4M16 5v4M8 15v4M16 15v4"/>'),
  brush: svg('<path d="M14 4l6 6-7.5 7.5-6-6z"/><path d="M6.5 11.5C4 12 3 14 3 16.5 3 18 2.5 19.5 1.5 20.5c3 0 6.5-.5 8-2 1.3-1.3 1.5-3 1-4.5"/>'),
  keyboard: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M6 14h1M9 14h6M18 14h0"/>'),
  book: svg('<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  source: svg('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8"/>'),
  camera: svg('<path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="3.5"/>'),
  follow: svg('<path d="M4 12a8 8 0 0113.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.7L4 15.5M4 20v-4.5h4.5"/>'),
  redraw: svg('<rect x="3" y="4" width="8" height="7" fill="currentColor" fill-opacity=".3"/><path d="M14 4l7 7h-7z" fill="currentColor" fill-opacity=".3"/><circle cx="8" cy="17" r="4" fill="currentColor" fill-opacity=".3"/><path d="M14 15h7M14 19h5"/>'),
  sparkles: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>')
};

export const icon = name => ICONS[name] || '';

const F = 'fill="currentColor" stroke="none"';
/** Each built-in brush and sculpt tool drawn as what it does; custom ones get the generic icon. */
const BRUSH_ICONS = {
  ink: `<path ${F} d="M3.5 19.5c3-6 7-10.5 13-12.5 2-.6 3.6 0 3.8.9.2 1-1 1.4-2.6 1.9-4.8 1.6-9.3 5.4-12.8 10.3z"/>`,
  pen: '<path d="M3.5 18.5c3.5-6.5 8-10.5 16.5-11" stroke-width="2.4"/>',
  speed: '<path d="M3 17c4-7 9-9 18-8" opacity=".5"/><path d="M6 11l1 5M10 9l.5 5M14 8l.2 4.5M18 7.8v4"/>',
  restate: '<path d="M3 17c4-6 9-9 18-9"/><path d="M3 14c4-6 9-8 18-8" opacity=".6"/><path d="M4 19.5c4-6 9-9 17-9.5" opacity=".4"/>',
  zigzag: '<path d="M3 15l3-5 3 7 3-7 3 7 3-7 3 5"/>',
  inner: '<path d="M3 17c4-7 9-9 18-8"/><path d="M6.5 13.6l1.6 1.4M10.5 11.2l1.3 1.6M14.6 9.8l1 1.8M18.6 9.1l.6 1.9" opacity=".7"/>',
  dotted: `<g ${F}><circle cx="4" cy="17" r="1.3"/><circle cx="8" cy="12.8" r="1.3"/><circle cx="12.3" cy="10" r="1.3"/><circle cx="16.6" cy="8.6" r="1.3"/><circle cx="20.6" cy="8.4" r="1.3"/></g>`,
  arcs: '<path d="M3 17a3 3 0 0 1 5-3M8 13a3 3 0 0 1 5-3M13 10a3 3 0 0 1 5-2M18 8a2.5 2.5 0 0 1 3 0"/>',
  flat: `<path ${F} d="M5 7c3-3 10-3 13 0s2 9-2 11-11 2-12-2 -2-6 1-9z"/>`,
  hatch: '<path d="M5 6c3-2 11-2 14 1s1 10-3 11-10 2-11-2S2 8 5 6z" opacity=".45"/><path d="M6 15l7-8M8 18l9-10M12 18.5l6-6.5"/>',
  stipple: `<g ${F}><circle cx="8" cy="8" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="9" r="1"/><circle cx="7" cy="12" r="1"/><circle cx="11" cy="11.5" r="1"/><circle cx="15" cy="13" r="1"/><circle cx="18" cy="12" r="1"/><circle cx="9" cy="16" r="1"/><circle cx="13" cy="16" r="1"/><circle cx="16.5" cy="17" r="1"/></g>`,
  sleet: '<path d="M5 7l2 3M10 5l2 3M15 6l2 3M7 13l2 3M12 12l2 3M17 13l2 3M9 18l1.5 2.2M14 18l1.5 2.2"/>',
  scumble: '<path d="M4 15c2-4 4 2 6-2s3 3 5-1 3 2 5-2M4 11c2-3 4 1 6-2s3 2 5-1 3 1 5-1" stroke-width="2.2" opacity=".75"/>',
  incised: '<path d="M4 16c4-6 9-8 16-8"/><path d="M4.5 17.6c4-6 9-8 16-8" stroke-width=".8" opacity=".6"/>',
  dot: `<circle cx="12" cy="12" r="5" ${F}/>`
};
const SCULPT_ICONS = {
  push: '<path d="M3 16c4-2 6-6 9-6s5 4 9 6" opacity=".55"/><path d="M12 20v-6M9.5 16.5 12 14l2.5 2.5"/>',
  grab: '<path d="M3 17c4-4 6-9 9-9s5 5 9 9" opacity=".55"/><path d="M12 3v6M9.5 5.5 12 3l2.5 2.5"/><circle cx="12" cy="9" r="1.4" fill="currentColor" stroke="none"/>',
  smooth: '<path d="M3 12l2-3 2 5 2-4 2 4" opacity=".45"/><path d="M12 12c2-3 4-3 5 0s3 3 4 0"/>',
  relax: '<path d="M3 15c5-6 13-6 18 0" opacity=".5"/><g fill="currentColor" stroke="none"><circle cx="4" cy="13.8" r="1.3"/><circle cx="8" cy="10.5" r="1.3"/><circle cx="12" cy="9.5" r="1.3"/><circle cx="16" cy="10.5" r="1.3"/><circle cx="20" cy="13.8" r="1.3"/></g>',
  pinch: '<path d="M4 12h5M20 12h-5M6.5 9.5 9 12l-2.5 2.5M17.5 9.5 15 12l2.5 2.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  twist: '<path d="M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6"/>',
  jitter: '<path d="M3 12l2-2 1.5 3.5L9 9l1.5 5L13 9.5l1.5 4L17 10l1.5 3 2.5-2"/>',
  simplify: '<path d="M3 16l3-2 2 1 3-4 2 1 3-3 2 1 3-3" opacity=".4"/><path d="M3 16l8-5 10-4"/><g fill="currentColor" stroke="none"><circle cx="3" cy="16" r="1.3"/><circle cx="11" cy="11" r="1.3"/><circle cx="21" cy="7" r="1.3"/></g>',
  thicken: `<path ${F} d="M3 13.5c4-.5 6-3 9-3s5 2.5 9 3v.8c-4 .8-5 3.7-9 3.7s-5-3-9-3.7z"/>`
};
// Custom tools' icons, captured from their preview (a silhouette used as a mask, so it takes the text color).
const ICON_KEY = 'ams_tool_icons_v1';
const loadIcons = () => { try { return JSON.parse(localStorage.getItem(ICON_KEY) || '{}'); } catch { return {}; } };
export function setToolIcon(kind, id, dataUrl) {
  const all = loadIcons(); all[kind] = { ...(all[kind] || {}), [id]: dataUrl };
  try { localStorage.setItem(ICON_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
const custom = (kind, id) => { const u = loadIcons()[kind]?.[id]; return u ? `<span class="wb-custom-icon" style="-webkit-mask-image:url(${u});mask-image:url(${u})"></span>` : null; };
export const brushIcon = id => (BRUSH_ICONS[id] ? svg(BRUSH_ICONS[id]) : custom('brush', id) || ICONS.brush);
export const sculptIcon = id => (SCULPT_ICONS[id] ? svg(SCULPT_ICONS[id]) : custom('sculpt', id) || ICONS.sculpt);
export const hasBuiltinIcon = (kind, id) => Boolean((kind === 'brush' ? BRUSH_ICONS : SCULPT_ICONS)[id]);

/**
 * An icon from a preview canvas: the square around what was drawn, scaled to 48 px, turned into a
 * silhouette (how far each pixel is from the paper becomes its opacity).
 */
export function iconFromCanvas(src, ground = '#f3efe6') {
  const W = src.width, H = src.height, sctx = src.getContext('2d'), data = sctx.getImageData(0, 0, W, H).data;
  const g = ground.replace('#', ''), gr = parseInt(g.slice(0, 2), 16) || 243, gg = parseInt(g.slice(2, 4), 16) || 239, gb = parseInt(g.slice(4, 6), 16) || 230;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * 4, d = data[i + 3] < 60 ? 0 : Math.abs(data[i] - gr) + Math.abs(data[i + 1] - gg) + Math.abs(data[i + 2] - gb);
    if (d > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = W; y1 = H; }
  const side = Math.max(x1 - x0, y1 - y0) + 8, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const out = document.createElement('canvas'); out.width = out.height = 48;
  const o = out.getContext('2d');
  o.drawImage(src, cx - side / 2, cy - side / 2, side, side, 0, 0, 48, 48);
  const img = o.getImageData(0, 0, 48, 48);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = img.data[i + 3] < 60 ? 0 : Math.abs(img.data[i] - gr) + Math.abs(img.data[i + 1] - gg) + Math.abs(img.data[i + 2] - gb);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
    img.data[i + 3] = Math.max(0, Math.min(255, (d - 30) * 2));
  }
  o.putImageData(img, 0, 0);
  return out.toDataURL('image/png');
}
