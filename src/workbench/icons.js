/** Small line icons for the workbench (24×24, stroke = currentColor). */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICONS = {
  select: svg('<path d="M5 3l14 8-6 1.5L10 19z"/>'),
  hand: svg('<path d="M8 13V5.5a1.5 1.5 0 013 0V12m0-1V4.5a1.5 1.5 0 013 0V12m0-1.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L3.6 15a1.6 1.6 0 012.6-1.9L8 15"/>'),
  point: svg('<circle cx="12" cy="12" r="4" fill="currentColor"/>'),
  line: svg('<path d="M4 18c3-6 5-9 8-9s3 5 8-4"/>'),
  plane: svg('<path d="M5 7l9-3 5 7-4 8-10-2z" fill="currentColor" fill-opacity=".25"/>'),
  guide: svg('<path d="M3 17L21 7" stroke-dasharray="3 3"/>'),
  gesture: svg('<path d="M4 16c4-9 7 4 10-3s4-6 6-4" stroke-dasharray="1.5 3"/>'),
  note: svg('<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>'),
  stages: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  properties: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  script: svg('<path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>'),
  process: svg('<rect x="3" y="6" width="5" height="12" rx="1"/><rect x="10" y="6" width="5" height="12" rx="1"/><rect x="17" y="6" width="4" height="12" rx="1"/>'),
  assets: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
  log: svg('<path d="M4 6h16M4 12h10M4 18h13"/>'),
  exercise: svg('<path d="M4 5h11l5 5v9H4z"/><path d="M8 13l2 2 5-5"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  undo: svg('<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 010 10h-2"/>'),
  redo: svg('<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 000 10h2"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10 10 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.1 6.2A17 17 0 002 12s4 7 10 7a9.8 9.8 0 005-1.3"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  unlock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  up: svg('<path d="M6 14l6-6 6 6"/>'),
  down: svg('<path d="M6 10l6 6 6-6"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  picture: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  sparkles: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>')
};

export const icon = name => ICONS[name] || '';
