/**
 * What a script shows besides the cursor: subtitles, the keys pressed (as keycaps), and the mouse (which button, and a drag).
 * It is a layer of its own, so a recording of the window carries it.
 */
import { h } from './ui.js';

const KEY_LABELS = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', escape: 'Esc', enter: '↵', backspace: '⌫', delete: '⌦', ' ': 'Space', cmd: '⌘', meta: '⌘', ctrl: '⌃', control: '⌃', alt: '⌥', option: '⌥', shift: '⇧', pageup: 'PgUp', pagedown: 'PgDn' };
export const keyLabel = k => KEY_LABELS[String(k).toLowerCase()] || (String(k).length === 1 ? String(k).toUpperCase() : String(k));

const MOUSE = '<svg viewBox="0 0 24 32" width="22" height="30" aria-hidden="true"><rect class="sc-body" x="3" y="2" width="18" height="28" rx="9"/><path class="sc-l" d="M3 12V11a9 9 0 019-9v10z"/><path class="sc-r" d="M12 2a9 9 0 019 9v1h-9z"/><path d="M3 12h18M12 2v10" fill="none"/></svg>';

export class ScriptOverlay {
  constructor() {
    this.sub = h('div', { class: 'wb-sc-sub' });
    this.keys = h('div', { class: 'wb-sc-keys' });
    this.mouse = h('div', { class: 'wb-sc-mouse', html: MOUSE });
    document.body.append(this.sub, this.keys, this.mouse);
    this.keyTimers = new Set();
  }

  subtitle(text) {
    clearTimeout(this.subTimer);
    if (!text) { this.sub.classList.remove('on'); return; }
    this.sub.textContent = text;
    this.sub.classList.add('on');
  }

  /** A chord such as "Alt+K" or "Cmd+Shift+S", as keycaps that fade. */
  key(chord, ms = 1400) {
    const parts = String(chord).split('+').map(s => s.trim()).filter(Boolean);
    const row = h('div', { class: 'wb-sc-key' }, ...parts.map(p => h('kbd', {}, keyLabel(p))));
    this.keys.append(row);
    while (this.keys.children.length > 4) this.keys.firstChild.remove();
    requestAnimationFrame(() => row.classList.add('on'));
    const t = setTimeout(() => { row.classList.remove('on'); setTimeout(() => row.remove(), 300); this.keyTimers.delete(t); }, ms);
    this.keyTimers.add(t);
  }

  /** The mouse beside the cursor: 'left', 'right', or null (hidden). `drag` shows the arrows of a drag. */
  press(button, drag = false) {
    this.mouse.classList.toggle('on', Boolean(button));
    this.mouse.classList.toggle('left', button === 'left');
    this.mouse.classList.toggle('right', button === 'right');
    this.mouse.classList.toggle('drag', Boolean(drag));
  }

  follow(x, y) { this.mouse.style.transform = `translate(${x + 18}px, ${y + 12}px)`; }

  clear() {
    this.subtitle('');
    this.press(null);
    for (const t of this.keyTimers) clearTimeout(t);
    this.keyTimers.clear();
    this.keys.replaceChildren();
  }
}
