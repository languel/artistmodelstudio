/**
 * The Assistant panel with three modes, one place to ask: Chat (talk, and have it draw through the tools), Generate (ask a model for
 * scores: candidates fill the panel) and Decide (the process as a sequence of typed decisions). They share a shell already (results above,
 * a composer below) and the model button, so they live here as modes of one panel rather than three tabs. Each keeps its own history and
 * state: switching never loses candidates or a decision session. Chat is built at once (the quick field and /agent use it); the other two
 * the first time they are shown.
 *
 * `app.setAssistMode('chat' | 'generate' | 'decide')`; `app.docks.open('generate')` and `open('decide')` still work (they are aliases
 * of this panel, set in app.js, and switch the mode).
 */
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { mountAssistant } from './assistant.js';
import { mountGenerate } from './generate.js';
import { mountDecide } from './decide.js';

const KEY = 'ams_assist_mode';
export const ASSIST_MODES = [
  ['chat', 'Chat', 'chat', 'Talk, and have it draw and change things through the studio’s tools'],
  ['generate', 'Generate', 'sparkles', 'Ask a model for drawings: each candidate is a recorded process you can open, keep or read'],
  ['decide', 'Decide', 'exercise', 'The process as a sequence of typed decisions: analyze a reference, let a model or rules propose, choose']
];
const MOUNT = { chat: mountAssistant, generate: mountGenerate, decide: mountDecide };

export function mountAssist(root, app) {
  const host = h('div', { class: 'wb-assist' });
  const bodies = Object.fromEntries(ASSIST_MODES.map(([id]) => [id, h('div', { class: 'wb-assist-body', hidden: id !== 'chat' })]));
  const buttons = {};
  const bar = h('div', { class: 'wb-assist-modes', role: 'tablist' }, ...ASSIST_MODES.map(([id, label, glyph, tip]) => {
    const b = h('button', { class: 'wb-assist-mode', type: 'button', role: 'tab', title: tip, onclick: () => set(id) }, h('span', { class: 'wb-assist-glyph', html: icon(glyph) }), h('span', {}, label));
    return (buttons[id] = b);
  }));
  host.append(bar, ...Object.values(bodies));
  root.append(host);

  const mounted = new Set();
  const ensure = id => { if (!mounted.has(id)) { mounted.add(id); MOUNT[id](bodies[id], app); } };
  const saved = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
  let mode = ASSIST_MODES.some(m => m[0] === saved) ? saved : 'chat';

  function set(id, { remember = true } = {}) {
    if (!MOUNT[id]) return;
    ensure(id);
    mode = id; app.assistMode = id;
    for (const [m] of ASSIST_MODES) { bodies[m].hidden = m !== id; buttons[m].classList.toggle('on', m === id); buttons[m].setAttribute('aria-selected', String(m === id)); }
    if (remember) { try { localStorage.setItem(KEY, id); } catch { /* private mode */ } }
    app.emit?.('assist-mode', id);
  }
  app.setAssistMode = set;
  ensure('chat');   // (the quick field, /agent and the speaker need the chat even while another mode shows)
  set(mode, { remember: false });
}
