/**
 * The keyframe dot: one small diamond beside any automatable parameter, the same everywhere (docs/camera-plan.md §4.1).
 *   hollow        not animated
 *   filled        animated: the field follows its lane
 *   bright        a keyframe at the playhead
 *   warm          changed since, at a time with no key: press to key it
 * Click: key / un-key at the playhead. Hover a field and press I (Alt+I: remove). Right-click: more.
 * The lane lives in the open take (an `auto` clip, src/process/keyframes.js); with no take, one is made.
 */
import { h } from './ui.js';
import { showMenu } from './menu.js';
import { param } from './params.js';
import { valueAt, laneFor, keyNear, setKey, removeKey, clearLane, EASE_NAMES } from '../process/keyframes.js';

let host = null;
export const setKeyframeHost = app => { host = app; };

const DIAMOND = '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M6 1 11 6 6 11 1 6z"/></svg>';
let hovered = null;   // the dot of the field the pointer is over (for the I key)

/** { take, lane, key, cur, laneValue, t } for an address, now. */
function read(address) {
  const take = host?.player?.take || null, p = param(address), t = host?.player?.t ?? 0;
  const lane = take ? laneFor(take, address) : null;
  return { take, p, lane, t, key: lane ? keyNear(lane, t) : null, cur: p?.get?.(), laneValue: lane ? valueAt(lane.keys, t) : null };
}

function toggle(address, on) {
  const { take, p, key, cur, t } = read(address);
  if (!p) return;
  const tk = take || host._tlEnsureTake?.();
  if (!tk) return;
  if (key && on !== true) removeKey(tk, address, t); else if (!key && on !== false) setKey(tk, address, t, cur);
  host.player.applied?.delete(address);
  host.timelineEdited?.();
}

/** The dot for an address. `show(v)` writes a value the lane drives into the field beside it. */
export function keyframeDot(address, { show = null } = {}) {
  const btn = h('button', { type: 'button', class: 'wb-kf', html: DIAMOND, title: 'Keyframe: click to key this value at the playhead (hover and press I; right-click for more)' });
  const paint = () => {
    if (!btn.isConnected) return;
    const { lane, key, cur, laneValue, p } = read(address);
    btn.disabled = !p;
    const dirty = lane && key == null && cur != null && laneValue != null && Math.abs(cur - laneValue) > ((p?.step || 0.01) / 2);
    btn.className = `wb-kf${lane ? ' anim' : ''}${key ? ' key' : ''}${dirty ? ' dirty' : ''}`;
    if (lane && show && laneValue != null && !btn.matches(':active')) show(laneValue);
  };
  btn.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); toggle(address); paint(); });
  btn.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    const { lane, key } = read(address);
    showMenu([
      { label: 'Keyframe' },
      { label: 'Insert keyframe', keys: 'I', run: () => { toggle(address, true); paint(); } },
      { label: 'Delete keyframe', keys: '⌥I', disabled: !key, run: () => { toggle(address, false); paint(); } },
      { label: 'Interpolation', disabled: !key, items: EASE_NAMES.map(n => ({ label: n, active: key?.ease === n, run: () => { key.ease = n; host.timelineEdited?.(); paint(); } })) },
      { label: 'Clear all keyframes', disabled: !lane, run: () => { clearLane(host.player.take, address); host.player.applied?.delete(address); host.timelineEdited?.(); paint(); } }
    ], ev.clientX, ev.clientY);
  });
  btn._toggle = on => { toggle(address, on); paint(); };
  // Follows the playhead, the take's edits and the parameter's own changes, until it leaves the page.
  const offs = [host.player.on(paint), host.store.subscribe(() => paint(), { live: true })];
  const watch = new MutationObserver(() => { if (!btn.isConnected) { for (const f of offs) f?.(); watch.disconnect(); } });
  queueMicrotask(() => { if (btn.parentNode) watch.observe(document.body, { childList: true, subtree: true }); paint(); });
  return btn;
}

/** A field with its dot beside it (the field is the number input; its value follows the lane while animated). */
export function withDot(field, address) {
  if (!host || !address) return field;
  const show = v => { if (document.activeElement !== field && field.matches?.('input')) field.value = String(+Number(v).toFixed(4)); };
  const dot = keyframeDot(address, { show });
  const wrap = h('span', { class: 'wb-kf-wrap' }, field, dot);
  wrap.addEventListener('pointerenter', () => { hovered = dot; });
  wrap.addEventListener('pointerleave', () => { if (hovered === dot) hovered = null; });
  return wrap;
}

// I over a field keys it (Alt+I removes): in the capture phase, before the Eyedropper's I.
if (typeof window !== 'undefined') window.addEventListener('keydown', ev => {
  if (!hovered || ev.metaKey || ev.ctrlKey || ev.shiftKey || (ev.key !== 'i' && ev.key !== 'I' && ev.code !== 'KeyI')) return;
  if (!hovered.isConnected) { hovered = null; return; }
  ev.preventDefault(); ev.stopImmediatePropagation();
  hovered._toggle(ev.altKey ? false : true);
}, true);
