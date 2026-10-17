/**
 * The radial menu at the pointer (Shift+Space): the tools of the current toolset in a circle. Hold the keys, move
 * toward a tool, release to pick it (a click picks too; Esc or releasing in the middle cancels).
 */
import { h } from './ui.js';

const SIZE = 40;   // a tool's button, px

/** The ring's radius for n tools (px): wide enough for the buttons not to touch. */
export const radialRadius = n => Math.max(72, Math.ceil((n * (SIZE + 6)) / (2 * Math.PI)));

/** Where tool i of n sits relative to the center: the first at the top, then clockwise. */
export const radialSpot = (i, n, R) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [Math.cos(a) * R, Math.sin(a) * R];
};

/** Which tool the pointer is toward, from the center (dx, dy): -1 in the middle (nothing). */
export function radialIndex(dx, dy, n, dead = 24) {
  if (!n || Math.hypot(dx, dy) < dead) return -1;
  const step = (2 * Math.PI) / n;
  const a = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);   // 0 at the top, clockwise
  return Math.round(a / step) % n;
}

/**
 * Show the ring at (x, y) (kept on screen). items: [{ id, label, icon (svg html), active, run }].
 * Returns { close }; onClose runs when it goes away, picked or not.
 */
export function openRadial({ items, x, y, onClose }) {
  const n = items.length;
  if (!n) return null;
  const R = radialRadius(n), pad = R + SIZE;
  const cx = Math.min(Math.max(x, pad), Math.max(pad, window.innerWidth - pad));
  const cy = Math.min(Math.max(y, pad), Math.max(pad, window.innerHeight - pad));
  const root = h('div', { class: 'wb-radial' });
  Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '3000', userSelect: 'none' });
  // A faint disc behind the ring, so the buttons read on any drawing.
  const disc = h('div', {});
  Object.assign(disc.style, { position: 'absolute', left: `${cx - R - SIZE / 2 - 8}px`, top: `${cy - R - SIZE / 2 - 8}px`, width: `${2 * R + SIZE + 16}px`, height: `${2 * R + SIZE + 16}px`, borderRadius: '50%', background: 'rgba(20,20,20,0.28)', pointerEvents: 'none' });
  const label = h('div', {});
  Object.assign(label.style, { position: 'absolute', left: `${cx}px`, top: `${cy}px`, transform: 'translate(-50%, -50%)', font: '12px system-ui, sans-serif', color: 'var(--wb-text, #ddd)', background: 'var(--wb-panel, #222)', border: '1px solid var(--wb-border, #444)', borderRadius: '10px', padding: '2px 8px', pointerEvents: 'none', whiteSpace: 'nowrap', opacity: '0' });
  const buttons = items.map((it, i) => {
    const [sx, sy] = radialSpot(i, n, R);
    const b = h('div', { title: it.label, html: it.icon || '' });
    Object.assign(b.style, { position: 'absolute', left: `${cx + sx - SIZE / 2}px`, top: `${cy + sy - SIZE / 2}px`, width: `${SIZE}px`, height: `${SIZE}px`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--wb-text, #ddd)', background: 'var(--wb-panel, #222)', border: `1.5px solid ${it.active ? 'var(--wb-accent-2, #c8664f)' : 'var(--wb-border, #444)'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.35)', pointerEvents: 'none', transition: 'transform 60ms' });
    return b;
  });
  root.append(disc, ...buttons, label);
  document.body.append(root);

  let hover = -1;
  const mark = i => {
    hover = i;
    buttons.forEach((b, j) => { b.style.transform = j === i ? 'scale(1.22)' : 'scale(1)'; b.style.background = j === i ? 'var(--wb-accent-2, #c8664f)' : 'var(--wb-panel, #222)'; });
    label.textContent = i >= 0 ? items[i].label : '';
    label.style.opacity = i >= 0 ? '1' : '0';
  };
  const move = e => { const i = radialIndex(e.clientX - cx, e.clientY - cy, n); if (i !== hover) mark(i); };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', down, true);
    window.removeEventListener('keyup', up, true);
    window.removeEventListener('keydown', esc, true);
    window.removeEventListener('blur', close);
    root.remove();
    onClose?.();
  };
  const pick = () => { const it = hover >= 0 ? items[hover] : null; close(); it?.run?.(); };
  const down = e => { e.preventDefault(); e.stopPropagation(); pick(); };
  const up = e => { if (e.code === 'Space' || e.key === 'Shift' || e.key === ' ') { e.preventDefault(); pick(); } };
  const esc = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', down, true);
  window.addEventListener('keyup', up, true);
  window.addEventListener('keydown', esc, true);
  window.addEventListener('blur', close);
  return { close };
}
