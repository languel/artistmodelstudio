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
import { valueAt, laneFor, keyNear, setKey, removeKey, clearLane, sameValue, thinKeys, keyHere, EASE_NAMES } from '../process/keyframes.js';
import { setFieldDecorator } from './ui.js';

let host = null;
export const setKeyframeHost = app => { host = app; };

const DIAMOND = '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M6 1 11 6 6 11 1 6z"/></svg>';
/** Auto-key (the Timeline's button): a change to an animated parameter at the playhead keys it. */
export const autoKey = { on: (() => { try { return localStorage.getItem('ams_autokey') === '1'; } catch { return false; } })() };
/** Record automation: while the transport plays, what you move is written as keys (thinned when you stop). */
export const recording = { on: false, touched: new Set() };
export function setRecordAuto(on) {
  recording.on = Boolean(on);
  if (!on && host?.player?.take) {
    for (const address of recording.touched) {
      const lane = laneFor(host.player.take, address); if (!lane) continue;
      const nums = lane.keys.map(k => k.v).filter(v => typeof v === 'number'), span = (Math.max(...nums) - Math.min(...nums)) || 1;
      thinKeys(lane.keys, span * 0.015); lane.dur = Math.max(1000, lane.keys[lane.keys.length - 1].t);
    }
    recording.touched.clear(); host._tlKeysEdited?.();
  }
}
export const setAutoKey = on => { autoKey.on = Boolean(on); try { localStorage.setItem('ams_autokey', on ? '1' : '0'); } catch { /* not kept */ } };

/**
 * A person changed a parameter that has a lane (a slider of a sketch moved, say): the running value follows what they
 * did (so it is seen, and marked as changed) and, with Auto-key on, it is keyed at the playhead.
 */
export function userChanged(address, value) {
  const { p, lane } = read(address);
  if (!p || !lane) return false;
  p.set(value);
  if (recording.on && host.player.playing) writeKey(address, value);
  else if (autoKey.on && !host.player.playing) toggle(address, true);
  host.player.emit();   // (every dot looks again: this one is now changed, or keyed)
  return true;
}

let hovered = null;   // the dot of the field the pointer is over (for the I key)

/** { take, lane, key, cur, laneValue, t } for an address, now. */
function read(address, fallback) {
  const take = host?.player?.take || null, p = param(address), t = host?.player?.t ?? 0;
  const lane = take ? laneFor(take, address) : null;
  return { take, p, lane, t, key: lane ? keyNear(lane, t - lane.start) : null, cur: p?.get?.() ?? fallback, laneValue: lane ? valueAt(lane.keys, t - lane.start, lane.meta) : null };
}

/** Write the value at the playhead as a key (a recording): makes the lane if needed. */
function writeKey(address, value, opts = {}) {
  const { take, p, t } = read(address, opts.fallback);
  const tk = take || host._tlEnsureTake?.();
  if (!p || !tk) return;
  keyHere(tk, address, t, value, 'linear', p.label, (p.options || opts.options) ? { options: p.options || opts.options } : null);
  recording.touched.add(address);
  host.player.applied?.delete(address);
}

function toggle(address, on, opts = {}) {
  const { take, p, key, cur, t } = read(address, opts.fallback);
  if (!p) return;
  const tk = take || host._tlEnsureTake?.();
  if (!tk) return;
  let made = false;
  if (key && on !== true) removeKey(tk, address, t); else if (!key && on !== false) { made = !laneFor(tk, address); setKey(tk, address, t, cur, 'ease', p.label, (p.options || opts.options) ? { options: p.options || opts.options } : null); }
  host.player.applied?.delete(address);
  (host._tlKeysEdited || host.timelineEdited)?.();
  if (made) host._tlFit?.();   // (a first keyframe: show the whole take, so the new row can be seen)
}

/** The dot for an address. `show(v)` writes a value the lane drives into the field beside it. */
export function keyframeDot(address, { show = null, fallback, options } = {}) {
  const btn = h('button', { type: 'button', class: 'wb-kf', html: DIAMOND, title: 'Keyframe: click to key this value at the playhead (hover and press I; right-click for more)' });
  const paint = () => {
    if (!btn.isConnected || host.player.applying) return;
    const { lane, key, cur, laneValue, p } = read(address, fallback);
    btn.disabled = !p;
    const dirty = lane && key == null && cur != null && laneValue != null && !sameValue(cur, laneValue, (p?.step || 0.01) / 2);
    btn.className = `wb-kf${lane ? ' anim' : ''}${key ? ' key' : ''}${dirty ? ' dirty' : ''}`;
    // The field (or the control's row) says it too: green while a lane drives it, yellow on a key, orange when changed since.
    const box = btn.parentElement;
    if (box) { box.classList.toggle('kf-anim', Boolean(lane)); box.classList.toggle('kf-key', Boolean(key)); box.classList.toggle('kf-dirty', Boolean(dirty)); }
    // Recording: a change that is not the lane's own (a hand on the control) is written as a key.
    if (recording.on && host.player.playing && p && cur != null) {
      const prev = btn._last; btn._last = cur;
      const laneDriven = lane && laneValue != null && sameValue(cur, laneValue, (p.step || 0.01) / 2);
      if (!laneDriven && prev !== undefined && !sameValue(prev, cur, (p.step || 0.01) / 2)) { writeKey(address, cur, { fallback, options }); host._tlKeysEdited?.(); }
    } else btn._last = cur;
    if (dirty && autoKey.on && !host.player.playing && !btn._auto) { btn._auto = true; try { toggle(address, true, { fallback, options }); } finally { btn._auto = false; } return paint(); }
    if (lane && show && cur != null && !btn.matches(':active')) show(cur);   // (what it has now: the lane's, or what you changed it to)
  };
  btn.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); toggle(address, undefined, { fallback, options }); paint(); });
  btn.addEventListener('contextmenu', ev => {
    ev.preventDefault();
    const { lane, key } = read(address, fallback);
    showMenu([
      { label: 'Keyframe' },
      { label: 'Insert keyframe', keys: 'I', run: () => { toggle(address, true, { fallback, options }); paint(); } },
      { label: 'Delete keyframe', keys: '⌥I', disabled: !key, run: () => { toggle(address, false, { fallback, options }); paint(); } },
      { label: 'Interpolation', disabled: !key, items: EASE_NAMES.map(n => ({ label: n, active: key?.ease === n, run: () => { key.ease = n; (host._tlKeysEdited || host.timelineEdited)?.(); paint(); } })) },
      { label: 'Clear all keyframes', disabled: !lane, run: () => { clearLane(host.player.take, address); host.player.applied?.delete(address); (host._tlKeysEdited || host.timelineEdited)?.(); paint(); } }
    ], ev.clientX, ev.clientY);
  });
  btn._toggle = on => { toggle(address, on, { fallback, options }); paint(); };
  // Follows the playhead, the take's edits and the parameter's own changes, until it leaves the page.
  const offs = [host.player.on(paint), host.store.subscribe(() => paint(), { live: true })];
  const watch = new MutationObserver(() => { if (!btn.isConnected) { for (const f of offs) f?.(); watch.disconnect(); } });
  queueMicrotask(() => { if (btn.parentNode) watch.observe(document.body, { childList: true, subtree: true }); paint(); });
  return btn;
}

/** A field with its dot beside it (the field is the number input; its value follows the lane while animated). */
export function withDot(field, address, opts = {}) {
  if (!host || !address) return field;
  const show = v => { if (document.activeElement !== field) field._setValue?.(v); };
  const dot = keyframeDot(address, { show, ...opts });
  const wrap = h('span', { class: 'wb-kf-wrap' }, field, dot);
  wrap.addEventListener('pointerenter', () => { hovered = dot; });
  wrap.addEventListener('pointerleave', () => { if (hovered === dot) hovered = null; });
  return wrap;
}

setFieldDecorator(withDot);

// I over a field keys it (Alt+I removes): in the capture phase, before the Eyedropper's I.
if (typeof window !== 'undefined') window.addEventListener('keydown', ev => {
  if (!hovered || ev.metaKey || ev.ctrlKey || ev.shiftKey || (ev.key !== 'i' && ev.key !== 'I' && ev.code !== 'KeyI')) return;
  if (!hovered.isConnected) { hovered = null; return; }
  ev.preventDefault(); ev.stopImmediatePropagation();
  hovered._toggle(ev.altKey ? false : true);
}, true);
