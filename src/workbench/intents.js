/**
 * Instant phrases: what the quick command field and the palette can do with no model at all.
 * “change the fill to red”, “red fill”, “make it red”, “opacity 50”, “multiply blend”, “ink brush”, “hide it”, “call it horizon”.
 * parseIntent is pure (what was said → what to do); intentCommand turns it into a command that acts on the selection.
 * Anything it does not know falls through to the commands, and then to the assistant.
 */
import { BLENDS, ensureFill } from '../process/document.js';
import { BRUSHES } from '../process/brushes.js';
import { toHex } from './palettes.js';

const SUBJECT = '(?:it|this|that|them|these|those|the selection|selection)';
const PAINT = { fill: 'fill', stroke: 'stroke', outline: 'stroke' };
// How a plane's fill is painted, in the words people use.
const CROSS = { cross: 1 };
const STYLES = {
  hatch: ['hatch'], hatched: ['hatch'], hatching: ['hatch'], lines: ['hatch'],
  crosshatch: ['hatch', CROSS], crosshatched: ['hatch', CROSS], crosshatching: ['hatch', CROSS], 'cross hatch': ['hatch', CROSS], 'cross hatched': ['hatch', CROSS], 'cross hatching': ['hatch', CROSS], 'cross-hatch': ['hatch', CROSS], 'cross-hatched': ['hatch', CROSS], 'cross-hatching': ['hatch', CROSS],
  stipple: ['stipple'], stippled: ['stipple'], stippling: ['stipple'], dots: ['stipple'], dotted: ['stipple'],
  flat: ['flat'], solid: ['flat']
};

/** { do: 'create', shape: 'circle' | 'rect', fill: hex | null, said } | { do: 'style', brush, params, fill, said } | { do: 'paint', which: 'fill' | 'stroke' | 'auto', value: hex | null, said } | { do: 'opacity', value } | { do: 'blend', value } | { do: 'brush', value } | { do: 'flag', key, value } | { do: 'rename', value } | null */
export function parseIntent(text, { colorOf = toHex, hasSelection = false } = {}) {
  const raw = String(text || '').trim().replace(/^\/+\s*/, '').replace(/^(?:please|can you|could you|just)\s+/i, '').replace(/[\s.!]+$/, '').replace(/\s+please$/i, '');
  const s = raw.toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  const color = v => { const c = v.replace(new RegExp(`^(?:${SUBJECT}\\s+)?(?:with\\s+|in\\s+|to\\s+)?`), '').trim(); return c ? { said: c, hex: colorOf(c) } : null; };
  const paint = (word, v) => { const c = color(v); return c?.hex ? { do: 'paint', which: PAINT[word], value: c.hex, said: c.said } : null; };
  // hatch, cross hatch, stipple, flat; red hatch, dark blue stipple.
  const style = v => {
    const t = v.replace(new RegExp(`^(?:${SUBJECT}\\s+)?(?:with\\s+|in\\s+|to\\s+|a\\s+)*`), '').trim();
    for (const name of Object.keys(STYLES).sort((a, b) => b.length - a.length)) {
      if (t === name) return { do: 'style', brush: STYLES[name][0], params: STYLES[name][1] || {}, fill: null, said: name };
      if (t.endsWith(` ${name}`)) { const hex = colorOf(t.slice(0, -name.length - 1)); if (hex) return { do: 'style', brush: STYLES[name][0], params: STYLES[name][1] || {}, fill: hex, said: t }; }
    }
    return null;
  };
  let m;
  // Making something: create a red circle, draw a square, add a blue rectangle, a green dot.
  if ((m = s.match(/^(?:(?:create|draw|add|make|new|insert|put)(?: me)?(?: (?:an?|the|one))? ?)?(?:(.+?) )?(circle|ellipse|dot|disc|disk|square|rect|rectangle|box)(?: (?:in|with|filled with|colou?red) (.+?))?$/)) && (s !== m[2] || m[1] === undefined)) {
    const lead = (m[1] || '').replace(/^(?:(?:an?|the|one|new|big|small|large|little)(?: |$))+/, '').trim();
    const word = (lead || m[3] || '').replace(/^(?:(?:an?|the|one|new|big|small|large|little)(?: |$))+/, '').trim();
    const hex = word ? colorOf(word) : null;
    if (!word || hex) { if (s !== m[2] || /^(?:create|draw|add|new|insert|put|make)/.test(s)) return { do: 'create', shape: /^(?:circle|ellipse|dot|disc|disk)$/.test(m[2]) ? 'circle' : 'rect', fill: hex, said: `${word ? `${word} ` : ''}${m[2]}` }; }
  }
  // Taking paint away: no fill, remove the stroke, clear the outline.
  if ((m = s.match(/^(?:no|remove(?: the)?|clear(?: the)?) (fill|stroke|outline)$/))) return { do: 'paint', which: PAINT[m[1]], value: null, said: 'none' };
  // Naming the paint: change the fill to red, set stroke blue, fill it with red, stroke #333.
  if ((m = s.match(/^(?:(?:change|set|make|turn|switch|paint|colou?r) )?(?:the )?(fill|stroke|outline)(?: colou?r)?(?: (?:to|as|be|=))? (.+)$/))) {
    if (/^(?:none|nothing|off|transparent)$/.test(m[2])) return { do: 'paint', which: PAINT[m[1]], value: null, said: 'none' };
    const hit = paint(m[1], m[2]); if (hit) return hit;
    if (PAINT[m[1]] === 'fill') { const st = style(m[2]); if (st) return st; }
  }
  // red fill, blue stroke.
  if ((m = s.match(/^(.+) (fill|stroke|outline)$/))) { const hit = paint(m[2], m[1]); if (hit) return hit; if (PAINT[m[2]] === 'fill') { const st = style(m[1]); if (st) return st; } }
  if ((m = s.match(/(\d+(?:\.\d+)?) ?% (?:transparent|see.?through)$/))) return { do: 'opacity', value: clamp01(1 - Number(m[1]) / 100) };
  if ((m = s.match(/(\d+(?:\.\d+)?) ?(%)? (?:opacity|opaque)$/) || s.match(/opacity(?: (?:to|at|of|=))? ?(\d*\.?\d+) ?(%)?$/))) { const n = Number(m[1]); return { do: 'opacity', value: clamp01(m[2] || n > 1 ? n / 100 : n) }; }
  if ((m = s.match(/^(?:(?:set|change|make)(?: the)? )?blend(?: mode)?(?: (?:to|as))? ([a-z-]+)$/) || s.match(/^(?:(?:use|set) )?([a-z-]+) blend(?: mode)?$/))) { if (BLENDS.includes(m[1])) return { do: 'blend', value: m[1] }; }
  if ((m = s.match(/^(?:(?:use|switch to|change to|set)(?: the| a)? )?([a-z0-9_-]+) brush$/) || s.match(/^brush(?: to)? ([a-z0-9_-]+)$/))) { if (BRUSHES[m[1]]) return { do: 'brush', value: m[1] }; }
  // The rest are about the selection, so they need one.
  if (!hasSelection) return null;
  if ((m = s.match(new RegExp(`^(hide|show|lock|unlock)(?: ${SUBJECT})?$`)))) return { do: 'flag', key: /hide|show/.test(m[1]) ? 'hidden' : 'locked', value: m[1] === 'hide' || m[1] === 'lock', said: m[1] };
  if ((m = raw.match(/^(?:rename|call|name)(?: (?:it|this|that))?(?: (?:to|as))? (.+)$/i))) return { do: 'rename', value: m[1].replace(/^["“']|["”']$/g, '') };
  // hatch it, make it hatched, or just: cross hatch.
  if ((m = s.match(new RegExp(`^(?:make|turn|change|set)(?: ${SUBJECT})?(?: to)? (.+)$`)))) { const st = style(m[1]); if (st) return st; }
  if ((m = s.match(new RegExp(`^(.+?)(?: ${SUBJECT})?$`)))) { const st = style(m[1]); if (st) return st; }
  // make it red, turn this blue, paint them #333, or just: red.
  if ((m = s.match(new RegExp(`^(?:make|turn|paint|colou?r|change|set)(?: ${SUBJECT})?(?: (?:to|the colou?r(?: to)?))? (.+)$`)))) { const c = color(m[1]); if (c?.hex) return { do: 'paint', which: 'auto', value: c.hex, said: c.said }; }
  const bare = colorOf(s);
  if (bare) return { do: 'paint', which: 'auto', value: bare, said: s };
  return null;
}
const clamp01 = v => Math.max(0, Math.min(1, +v.toFixed(3)));

/** A phrase as a command on what is selected (paint without a selection is the paint of the next marks), or null. */
export function intentCommand(app, text) {
  const ids = [...(app.canvas?.selected || [])], store = app.store;
  const intent = parseIntent(text, { hasSelection: ids.length > 0 });
  if (!intent) return null;
  const category = ids.length ? 'Selection' : 'New marks';
  const cmd = (name, run, extra = {}) => ({ id: `intent:${intent.do}`, category, name, hint: '', keys: '', run, ...extra });
  if (intent.do === 'create') {
    // At the pointer when it is over the canvas, else the middle of the page.
    const at = () => {
      const cv = app.canvas, r = cv?.canvas?.getBoundingClientRect?.(), [px, py] = app.pointerAt || [];
      if (r && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) return cv.toWorld(px - r.left, py - r.top).map(Math.round);
      return [500, 500];
    };
    return cmd(`Draw: ${intent.said}`, () => {
      const [x, y] = at(), k = intent.shape === 'circle' ? 90 : 100;
      return window.ams.callTool('ams_add', { role: 'plane', shape: intent.shape, box: [x - k, y - k, x + k, y + k], ...(intent.fill ? { fill: intent.fill } : {}) }, { quiet: true });
    }, { swatch: intent.fill });
  }
  if (intent.do === 'paint') {
    const word = { fill: 'Fill', stroke: 'Stroke', auto: 'Color' }[intent.which];
    if (intent.which !== 'auto') return cmd(`${word}: ${intent.said}`, () => app.setPaint(intent.which, intent.value ?? (intent.which === 'stroke' ? 'none' : null)), { swatch: intent.value });
    // Said without saying which: a plane's color is its fill, anything else's its stroke.
    return cmd(`${word}: ${intent.said}`, () => store.change('color', d => { for (const e of d.elements) if (ids.includes(e.id) && e.role !== 'image') e[e.role === 'plane' ? 'fill' : 'color'] = intent.value; }), { swatch: intent.value });
  }
  if (!ids.length) return null;   // (the rest change marks)
  if (intent.do === 'style') {
    const planes = store.doc.elements.filter(e => ids.includes(e.id) && e.role === 'plane').map(e => e.id);
    if (!planes.length) return null;
    return cmd(`Fill: ${intent.said}`, () => store.change('fill style', d => { for (const e of d.elements) if (planes.includes(e.id)) { e.realize = { brush: intent.brush, params: { ...intent.params } }; if (intent.fill) e.fill = intent.fill; ensureFill(e); } }), { swatch: intent.fill });
  }
  if (intent.do === 'opacity') return cmd(`Opacity: ${Math.round(intent.value * 100)}%`, () => store.patchElements(ids, { opacity: intent.value < 1 ? intent.value : null }, 'opacity'));
  if (intent.do === 'blend') return cmd(`Blend: ${intent.value}`, () => store.patchElements(ids, { blend: intent.value === 'normal' ? null : intent.value }, 'blend'));
  if (intent.do === 'brush') {
    const roles = BRUSHES[intent.value].roles, fits = store.doc.elements.filter(e => ids.includes(e.id) && roles.includes(e.role));
    if (!fits.length) return null;
    return cmd(`Brush: ${BRUSHES[intent.value].label}`, () => store.change('brush', d => { for (const e of d.elements) if (ids.includes(e.id) && roles.includes(e.role)) e.realize = { brush: intent.value, params: {} }; }));
  }
  if (intent.do === 'flag') return cmd(`${intent.said[0].toUpperCase()}${intent.said.slice(1)} the selection`, () => store.patchElements(ids, { [intent.key]: intent.value }, intent.said));
  if (intent.do === 'rename' && ids.length === 1) return cmd(`Name: ${intent.value}`, () => store.patchElements(ids, { label: intent.value }, 'rename'));
  return null;
}
