/** Log: what happened, including every action an agent takes (in purple). */
import { h } from '../ui.js';

export function mountLog(el, app) {
  const box = h('div', { class: 'wb-log' });
  el.append(box);
  const render = () => {
    box.replaceChildren(...app.logLines.slice(-200).map(l => h('div', { class: l.kind }, `${new Date(l.t).toLocaleTimeString()}  ${l.text}`)));
    el.parentElement && (el.parentElement.scrollTop = el.parentElement.scrollHeight);
  };
  app.on('log', render);
  render();
}
