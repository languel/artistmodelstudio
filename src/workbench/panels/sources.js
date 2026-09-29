/**
 * Sources: the project's streams (a camera, an image or a video from Assets), by name, like Assets.
 * What uses them is elsewhere: board code reads them (source('name'), fit('name')), a board can show
 * one underneath (its menu), Gestures watch one. Drag a source onto the canvas for a board previewing
 * it; the board's menu has demos that draw from a source.
 */
import { h, selectField, editable } from '../ui.js';
import { icon } from '../icons.js';
import { QUALITIES } from '../mediaUrl.js';
import { STREAM_SAMPLES } from '../streamSamples.js';

const SPEEDS = [['0', 'paused'], ['0.25', '¼×'], ['0.5', '½×'], ['1', '1×'], ['2', '2×'], ['4', '4×']];
const SAMPLING = [['continuous', 'continuous'], ['interval', 'every…'], ['hold', 'hold']];


export function mountSources(el, app) {
  const S = app.sources;
  const thumbs = new Map();   // name → canvas

  const render = async () => {
    const assets = (await app.assetStore.all().catch(() => [])).filter(a => /^(image|video)\//.test(a.blob?.type || '') && !a.program);
    el.replaceChildren();
    thumbs.clear();
    const list = h('div', { class: 'wb-list' });
    for (const d of S.list) {
      const thumb = h('canvas', { class: `wb-source-thumb${S.paused(d.name) ? ' paused' : ''}`, width: 88, height: 64, title: `${d.kind === 'camera' ? 'Camera' : 'From Assets'}: source('${d.name}')${S.paused(d.name) ? ' · paused: no live board on screen uses it' : ''}` });
      thumbs.set(d.name, thumb);
      const name = editable(h('span', { class: 'wb-source-name', title: `source('${d.name}') · Shift+double-click to rename` }, d.name), `source:${d.name}`, () => d.name, v => S.rename(d.name, v.trim().replace(/\s+/g, '-')));
      const row = h('div', { class: 'wb-source', draggable: 'true', title: `source('${d.name}') · drag onto the canvas for a board showing it` },
        thumb,
        h('div', { class: 'wb-source-main' },
          name,
          h('div', { class: 'wb-source-ctl' },
            d.kind === 'camera' ? '' : selectField(SPEEDS, String(d.speed ?? 1), v => S.update(d.name, { speed: Number(v) }), 'Playback speed of the clip (the board that draws from it redraws at its own rate)'),
            selectField(SAMPLING, d.sampling, v => { S.update(d.name, { sampling: v }); render(); }, 'Sampling: every frame, every few seconds, or one frame held'),
            d.sampling === 'interval' ? h('input', { class: 'wb-num', type: 'number', min: 0.1, step: 0.5, value: d.interval, title: 'Seconds between samples', onchange: e => S.update(d.name, { interval: Math.max(0.1, Number(e.target.value) || 2) }) }) : '')),
        h('button', { class: 'wb-icon-btn', title: 'Remove the source (its asset stays)', html: icon('trash'), onclick: () => { S.remove(d.name); } }));
      row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/ams-source', d.name); e.dataTransfer.setData('text/plain', `source('${d.name}')`); e.dataTransfer.effectAllowed = 'copy'; });
      list.append(row);
    }
    if (!S.list.length) list.append(h('div', { class: 'wb-muted wb-small', title: 'Sources are streams code reads by name: source(\'cam\'), fit(\'cam\')' }, '—'));
    const pick = h('select', { class: 'wb-select', title: 'Add an image or video from Assets', onchange: async e => { const id = e.target.value; e.target.value = ''; if (id) await add({ kind: 'asset', assetId: id }); } },
      h('option', { value: '' }, '+ asset…'), ...assets.map(a => h('option', { value: a.id }, a.title)));
    const url = h('input', { class: 'wb-input', type: 'text', placeholder: 'https://…', title: 'Stream a video or picture from an address, or a Wikipedia / Commons File: page (nothing is downloaded or kept)', style: { flex: 1, minWidth: 0 } });
    const quality = selectField(QUALITIES, '480', () => {}, 'For a Wikipedia / Commons video: the size to stream (smaller is lighter and quicker to seek)');
    const go = async () => {
      const text = url.value.trim();
      if (!text) return;
      url.disabled = true;
      try { await app.addSourceUrl(text, { quality: quality.value }); url.value = ''; } catch (err) { app.log(`Source: ${err.message}`, 'error'); }
      url.disabled = false;
    };
    // Clips to stream (early cinema, dance): chosen from a list, cut to their moment.
    const groups = [...new Set(STREAM_SAMPLES.map(s => s.group))];
    const samples = h('select', { class: 'wb-select', title: 'Stream a clip: early cinema, faces, dance (public domain; nothing is downloaded)', onchange: async e => {
      const s = STREAM_SAMPLES[Number(e.target.value)]; e.target.value = '';
      if (!s) return;
      try { await app.addSourceUrl(s.page, { quality: s.quality || quality.value, start: s.start, end: s.end }); } catch (err) { app.log(`Source: ${err.message}`, 'error'); }
    } }, h('option', { value: '' }, '+ stream…'),
      ...groups.map(g => h('optgroup', { label: g }, ...STREAM_SAMPLES.map((s, i) => [s, i]).filter(([s]) => s.group === g).map(([s, i]) => h('option', { value: String(i), title: s.note }, s.title)))));
    url.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    el.append(list, h('div', { class: 'wb-row wb-row-actions' }, samples), h('div', { class: 'wb-row wb-row-actions' }, url, quality, h('button', { class: 'wb-icon-btn', title: 'Add the address as a source', html: icon('plus'), onclick: go })), h('div', { class: 'wb-row wb-row-actions' },
      h('button', { class: 'wb-icon-btn', title: 'Add the camera', html: icon('camera'), onclick: () => add({ kind: 'camera' }) }),
      pick));
    paint();
  };

  const add = async spec => {
    try { const name = await S.add(spec); app.log(`Source “${name}”: source('${name}') in code.`); }
    catch (err) { app.log(`Source: ${err.message}`, 'error'); }
    render();
  };


  // Previews at a few frames a second (sources sample faster; this is only a glance).
  const paint = () => {
    for (const [name, c] of thumbs) {
      const img = S.view(name);
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      if (!img?.width) continue;
      const k = Math.max(c.width / img.width, c.height / img.height);
      ctx.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k);
    }
  };
  // Only while the panel shows (a docked panel behind another tab keeps its element, unseen).
  const timer = setInterval(() => { if (el.isConnected && el.offsetParent !== null && !document.hidden) paint(); }, 250);
  S.on(name => { if (!name) render(); });
  app.assetStore.onChange(() => render());
  render();
  return () => clearInterval(timer);
}
