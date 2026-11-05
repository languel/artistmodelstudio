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

/** { do: 'create', shape: 'circle' | 'rect', fill: hex | null, count?, dir?, said } | { do: 'line', from, to, said } | { do: 'code', request, said } | { do: 'transform', scale?, move?, said } | { do: 'recolor', pairs: [{ target, hex }], said } | { do: 'style', brush, params, fill, said } | { do: 'paint', which: 'fill' | 'stroke' | 'auto', value: hex | null, said } | { do: 'opacity', value } | { do: 'blend', value } | { do: 'brush', value } | { do: 'flag', key, value } | { do: 'rename', value } | null */
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
  // Asking for a program: "write code for a grid of dots", "code a spiral of points", "write a program that scatters 500 dots".
  if ((m = raw.match(/^(?:(?:please )?(?:write|generate|make|create)(?: me)?(?: (?:some|an?|the))? (?:studio |board )?(?:code|program|script)(?: (?:for|that|to|which|of))?|code(?: up)?|program) (.+)$/i)) && m[1].split(/\s+/).length >= 2) return { do: 'code', request: m[1].trim(), said: m[1].trim().slice(0, 60) };
  // A line between two places: "a line from the top left to the bottom right", "a diagonal stroke across the page, upper left to lower right", "a horizontal line".
  if ((m = s.match(/^(?:(?:create|draw|add|make|put)\s+)?(?:me\s+)?(?:(?:an?|the)\s+)?(?:(diagonal|horizontal|vertical|straight|long|thin|thick)\s+)?(line|stroke|diagonal)\b(.*)$/))) {
    const XY = { left: 100, right: 900, centre: 500, center: 500, middle: 500 }, TB = { top: 100, upper: 100, bottom: 900, lower: 900 };
    const found = [...(m[3] || '').matchAll(/\b(?:(top|upper|bottom|lower)[ -])?(left|right)\b|\b(top|upper|bottom|lower|centre|center|middle)\b/g)].map(x => (x[2] ? [XY[x[2]], x[1] ? TB[x[1]] : 500] : TB[x[3]] != null ? [500, TB[x[3]]] : [500, 500]));
    let from = null, to = null;
    if (found.length >= 2) [from, to] = found;
    else if (m[1] === 'diagonal' || m[2] === 'diagonal') { from = [100, 100]; to = [900, 900]; }
    else if (m[1] === 'horizontal') { from = [100, 500]; to = [900, 500]; }
    else if (m[1] === 'vertical') { from = [500, 100]; to = [500, 900]; }
    if (from && to && (from[0] !== to[0] || from[1] !== to[1])) return { do: 'line', from, to, said: 'a line' };
  }
  // Several of a thing: three circles in a row, draw 4 red squares, five dots down the page.
  const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  if ((m = s.match(/^(?:(?:create|draw|add|make|put)(?: me)?(?: (?:a )?(?:row|column|line) of)? )?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)(?: (.+?))? (circles?|round(?: shapes?| things?)?|dots?|squares?|rect(?:angle)?s?|boxes|shapes?)(?: (in a row|side by side|in a line|across the page|next to each other|in a column|in a stack|down the page|in a grid))?$/)) && !(m[4] === undefined && NUM[m[1]] === 1 && !/^(?:create|draw|add|make|put)/.test(s))) {
    const count = Math.min(24, Number(m[1]) || NUM[m[1]] || 1), word = (m[2] || '').replace(/^(?:(?:red|small|big|large|little)\b ?)*/, w => w).trim();
    const round = /^(?:round|circular)$/.test(word), hex = word && !round ? colorOf(word) : null;
    if (count > 1 && (!word || round || hex)) return { do: 'create', shape: /^dot/.test(m[3]) ? 'point' : round || /^(?:circle|round)/.test(m[3]) ? 'circle' : 'rect', fill: hex, count, dir: /column|stack|down/.test(m[4] || '') ? 'column' : 'row', said: `${count} ${word ? `${word} ` : ''}${m[3]}` };
  }
  // Two or more marks recolored at once: make the circle blue and the square red.
  if (hasSelection === false || hasSelection === true) {
    const parts = s.replace(/^(?:make|paint|colou?r|set|turn)\s+/, '').split(/\s*(?:,| and )\s*/).filter(Boolean);
    if (parts.length >= 2) {
      const pairs = [];
      for (const part of parts) {
        const toks = part.replace(/\b(?:the|a|an|should|be|is|to|make|paint|turn|set|=)\b/g, ' ').split(/\s+/).filter(Boolean);
        let hit = null;
        for (let k = 1; k < toks.length && !hit; k++) { const hexv = colorOf(toks.slice(k).join(' ')); if (hexv) hit = { target: toks.slice(0, k).join(' '), hex: hexv }; }
        if (!hit) { pairs.length = 0; break; }
        pairs.push(hit);
      }
      if (pairs.length >= 2 && pairs.every(q => /^(?:circle|square|rect(?:angle)?|box|line|dot|point|plane|shape|round|oval|ellipse|selected|it|all|.+ one)s?$/.test(q.target))) return { do: 'recolor', pairs, said: pairs.map(q => `${q.target} ${q.hex}`).join(', ') };
    }
  }
  // Making something: create a red circle, draw a square, add a blue rectangle, a green dot.
  if ((m = s.match(/^(?:(?:create|draw|add|make|new|insert|put)(?: me)?(?: (?:an?|the|one))? ?)?(?:(.+?) )?(circle|ellipse|dot|disc|disk|square|rect|rectangle|box|shape)(?: (?:in|with|filled with|colou?red) (.+?))?$/)) && (s !== m[2] || m[1] === undefined)) {
    const lead = (m[1] || '').replace(/^(?:(?:an?|the|one|new|big|small|large|little)(?: |$))+/, '').trim();
    const word = (lead || m[3] || '').replace(/^(?:(?:an?|the|one|new|big|small|large|little)(?: |$))+/, '').trim();
    const hex = word ? colorOf(word) : null;
    if (!word || hex) { if (s !== m[2] || /^(?:create|draw|add|new|insert|put|make)/.test(s)) return { do: 'create', shape: /^(?:dot|point)$/.test(m[2]) ? 'point' : /^(?:circle|ellipse|disc|disk)$/.test(m[2]) ? 'circle' : 'rect', fill: hex, said: `${word ? `${word} ` : ''}${m[2]}` }; }
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
  // Size and place: bigger, scale it up by half, twice as big, 50% smaller; move it right, 200 to the left, up a bit.
  {
    const scaleBy = (() => {
      if ((m = s.match(new RegExp(`^(?:make ${SUBJECT} |scale ${SUBJECT} |resize ${SUBJECT} )?(?:(\\d+(?:\\.\\d+)?) ?% )?(bigger|larger|smaller)(?: by (\\d+(?:\\.\\d+)?) ?%?)?$`)))) { const pct = Number(m[1] || m[3] || 25) / 100; return m[2] === 'smaller' ? 1 - Math.min(0.9, pct) : 1 + pct; }
      if (/^(?:double(?: ?it| the size)?|(?:make ${SUBJECT} )?twice as (?:big|large)|make ${SUBJECT} double)$/.test(s)) return 2;
      if (/^(?:halve(?: ?it| the size)?|(?:make ${SUBJECT} )?half(?: the)? size|make ${SUBJECT} half(?: the size)?|half as (?:big|large))$/.test(s)) return 0.5;
      if ((m = s.match(new RegExp(`^(?:scale|resize|grow|shrink)(?: ${SUBJECT})?(?: (up|down))?(?: by| to)? (half|\\d+(?:\\.\\d+)?) ?(%|x)?$`)))) { const n = m[2] === 'half' ? 0.5 : Number(m[2]); if (m[2] === 'half') return m[1] === 'down' ? 0.5 : 1.5; return m[3] === '%' ? (m[1] === 'down' ? 1 - n / 100 : n > 100 || !m[1] ? n / 100 : 1 + n / 100) : n; }
      return null;
    })();
    if (scaleBy && scaleBy > 0) return { do: 'transform', scale: +scaleBy.toFixed(3), said: `×${+scaleBy.toFixed(2)}` };
    if ((m = s.match(new RegExp(`^(?:move|shift|nudge|push|slide)(?: ${SUBJECT})?\\b(.*)$`)))) {
      const rest = m[1], d = (rest.match(/\b(left|right|up|down|top|bottom)\b/) || [])[1], num = (rest.match(/\b(\d+)\b/) || [])[1];
      if (d) { const n = Number(num || (/a bit|a little|slightly/.test(rest) ? 40 : 100)); return { do: 'transform', move: d === 'left' ? [-n, 0] : d === 'right' ? [n, 0] : d === 'up' || d === 'top' ? [0, -n] : [0, n], said: `${d} ${n}` }; }
    }
  }
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
  if (intent.do === 'line') return cmd(`Draw: ${intent.said}`, () => window.ams.callTool('ams_add', { role: 'line', points: [intent.from, intent.to] }, { quiet: true }));
  if (intent.do === 'code') return cmd(`Write code: ${intent.said}`, () => window.ams.callTool('ams_write_code', { request: intent.request }, { quiet: true }));
  if (intent.do === 'recolor') return cmd(`Colors: ${intent.said}`, async () => { for (const q of intent.pairs) await window.ams.callTool('ams_update', { id: q.target, patch: { fill: q.hex } }, { quiet: true }); });
  if (intent.do === 'create') {
    // At the pointer when it is over the canvas, else the middle of the page.
    const at = () => {
      const cv = app.canvas, r = cv?.canvas?.getBoundingClientRect?.(), [px, py] = app.pointerAt || [];
      if (r && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) return cv.toWorld(px - r.left, py - r.top).map(Math.round);
      return [500, 500];
    };
    return cmd(`Draw: ${intent.said}`, () => {
      const [x, y] = at(), k = intent.shape === 'circle' ? 90 : 100, n = intent.count || 1, gap = k * 2.6, col = intent.dir === 'column';
      const off = -((n - 1) * gap) / 2;   // (a row is centred on the place)
      if (intent.shape === 'point') return window.ams.callTool('ams_add', { role: 'point', points: [[x, y]], ...(intent.fill ? { color: intent.fill } : {}), ...(intent.count > 1 ? { repeat: { count: intent.count, dx: intent.dir === 'column' ? 0 : 60, dy: intent.dir === 'column' ? 60 : 0 } } : {}) }, { quiet: true });
      return window.ams.callTool('ams_add', { role: 'plane', shape: intent.shape, box: [x - k + (col ? 0 : off), y - k + (col ? off : 0), x + k + (col ? 0 : off), y + k + (col ? off : 0)], ...(intent.fill ? { fill: intent.fill } : {}), ...(n > 1 ? { repeat: { count: n, dx: col ? 0 : gap, dy: col ? gap : 0 } } : {}) }, { quiet: true });
    }, { swatch: intent.fill });
  }
  if (intent.do === 'transform') return ids.length ? cmd(`Transform: ${intent.said}`, () => window.ams.callTool('ams_transform', { ids, ...(intent.scale ? { scale: intent.scale } : {}), ...(intent.move ? { move: intent.move } : {}) }, { quiet: true })) : null;
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
