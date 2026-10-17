import './isolate.js';   // first: it must be in place before any module reads localStorage
import '../workbench/styles.css';
import './embed.css';
import { Workbench } from '../workbench/app.js';
import { startBridge } from './bridge.js';

const q = new URLSearchParams(location.search);
{
  let theme = q.get('theme');
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
}
document.documentElement.classList.add('ams-embed');

// The panels an editor needs; `features=a,b` (ids) adds more, if the build has them (AMS_EMBED_FULL=1 keeps them all).
const LEAN = ['boards', 'outliner', 'properties', 'settings', 'shortcuts', 'history', 'log'];
// The chunky build (AMS_EMBED_FULL=1 npm run build:embed:full) carries every panel and registers them all.
const FULL = typeof __AMS_EMBED_FULL__ !== 'undefined' && __AMS_EMBED_FULL__;
const panels = FULL ? null : [...LEAN, ...(q.get('features') || '').split(',').filter(Boolean)];
const app = new Workbench(document.querySelector('#app'), { embed: { persist: q.get('persist') === '1', panels } });
app.mount();
// Panels are tucked away until wanted: opening one (a shortcut, the palette, the menu) brings the docks back.
for (const m of ['open', 'toggleDock']) {
  const orig = app.docks[m].bind(app.docks);
  app.docks[m] = (...a) => { if (app.ui?.panels === false) { document.documentElement.classList.add('ams-panels'); app.setUI({ panels: true }); } return orig(...a); };
}
// A drawing surface: the tools and the zoom, nothing else, until the host asks for more.
if (q.get('guide') !== '1') app.guide.enabled = false;   // no agent cursor or captions over the host's drawing, unless asked
app.setUI({ view: false, panels: false, tools: q.get('tools') !== '0', zoom: q.get('zoom') !== '0' });
startBridge(app, { origin: q.get('origin') || location.origin });
if (import.meta.env?.DEV) window.__ams = app;
