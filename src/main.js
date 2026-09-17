import './ui/styles.css';
import { StudioApp } from './app.js';

window.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('#app');
  if (root) {
    const app = new StudioApp();
    window.app = app;
    app.init(root);
  }
});
