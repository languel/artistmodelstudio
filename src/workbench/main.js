import './styles.css';
import { Workbench } from './app.js';

// Theme: saved choice, else the system preference.
(() => {
  let theme = null;
  try { theme = localStorage.getItem('ams_theme'); } catch { /* storage unavailable */ }
  if (theme !== 'light' && theme !== 'dark') theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
})();

const app = new Workbench(document.querySelector('#app'));
app.mount();
if (import.meta.env?.DEV) window.__ams = app;
