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

const app = new Workbench(document.querySelector('#app'), { embed: { persist: q.get('persist') === '1' } });
app.mount();
// A drawing surface: the tools and the zoom, nothing else, until the host asks for more.
if (q.get('guide') !== '1') app.guide.enabled = false;   // no agent cursor or captions over the host's drawing, unless asked
app.setUI({ view: false, panels: false, tools: q.get('tools') !== '0', zoom: q.get('zoom') !== '0' });
startBridge(app, { origin: q.get('origin') || location.origin });
if (import.meta.env?.DEV) window.__ams = app;
