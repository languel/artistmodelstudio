import './ui/styles.css';

// Theme: saved choice, else the system preference.
(() => {
  let theme = null;
  try { theme = localStorage.getItem('ams_theme'); } catch { /* storage unavailable */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
import { StudioApp } from './app.js';

window.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('#app');
  if (root) {
    const app = new StudioApp();
    window.app = app;
    app.init(root);
  }
});
