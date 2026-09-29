/**
 * Gestures: which source to watch, the person as it is seen (the points gestures name), each
 * gesture's progress, the poses to learn (record examples), and the gesture script.
 */
import { h, selectField } from '../ui.js';
import { icon } from '../icons.js';
import { createCodeEditor } from '../codeEditor.js';
import { allPalettes } from '../palettes.js';
import { POINT_NAMES } from '../../process/gestures.js';

const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
const ARMS = ['left.shoulder', 'left.elbow', 'left.wrist', 'right.wrist', 'right.elbow', 'right.shoulder', 'left.shoulder'];

export function mountGestures(el, app) {
  const G = app.gestures, S = app.sources;
  const view = h('canvas', { class: 'wb-gesture-view', width: 240, height: 150, title: 'What the gestures see: the person’s points (left in warm, right in cool)' });
  const bars = h('div', { class: 'wb-list wb-gesture-list' });
  const labels = h('div', { class: 'wb-list' });
  const head = h('div', { class: 'wb-row' });
  const editorHost = h('div', { class: 'wb-gesture-code' });

  const renderHead = () => {
    const names = S.list.map(d => [d.name, d.name]);
    head.replaceChildren(
      h('button', { class: `wb-icon-btn${G.enabled ? ' on' : ''}`, title: G.enabled ? 'Watching: click to stop' : 'Watch the source for gestures', html: icon(G.enabled ? 'pause' : 'play'), onclick: () => G.enable(!G.enabled) }),
      names.length ? selectField(names, G.source || names[0][0], v => G.enable(G.enabled, v), 'The source to watch (a camera, or a video to test with)') : h('span', { class: 'wb-muted wb-small', title: 'Add a camera in Sources' }, '—'),
      h('span', { style: { flex: 1 } }),
      selectField(Object.keys(allPalettes()).map(n => [n, n]), G.palette, v => { G.palette = v; G.save(); }, 'The palette “color next” steps through'));
  };

  const renderList = () => {
    bars.replaceChildren(...(G.list || []).map(g => {
      const act = typeof g.action === 'function' ? 'ƒ' : g.action || '';
      return h('div', { class: 'wb-gesture', 'data-gesture': g.name, title: `${g.steps.length} step${g.steps.length === 1 ? '' : 's'}${act ? ` → ${act}` : ''}` },
        h('span', { class: 'wb-gesture-name' }, g.name),
        h('span', { class: 'wb-gesture-bar' }, h('i')),
        h('span', { class: 'wb-muted wb-small' }, act));
    }));
    const counts = G.labels();
    labels.replaceChildren(...Object.entries(counts).map(([label, n]) => h('div', { class: 'wb-gesture' },
      h('span', { class: 'wb-gesture-name', title: `learned: '${label}'` }, label),
      h('span', { class: 'wb-muted wb-small', title: 'Examples recorded' }, String(n)),
      h('button', { class: `wb-icon-btn wb-rec${G.recording?.label === label ? ' on' : ''}`, title: 'Record: hold the pose for 2 seconds (moving a little)', html: '<svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>', onclick: () => G.record(label, 2).catch(err => app.log(err.message, 'error')) }),
      n ? h('button', { class: 'wb-icon-btn', title: 'Forget its examples', html: icon('trash'), onclick: () => G.forget(label) }) : h('span'))));
  };

  const paint = () => {
    const ctx = view.getContext('2d'), W = view.width, H = view.height;
    ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, W, H);
    const src = G.source && S.view(G.source), b = G.body;
    let k = 1, ox = 0, oy = 0;
    if (src?.width) { k = Math.min(W / src.width, H / src.height); ox = (W - src.width * k) / 2; oy = (H - src.height * k) / 2; ctx.globalAlpha = 0.45; ctx.drawImage(src, ox, oy, src.width * k, src.height * k); ctx.globalAlpha = 1; }
    if (!b) return;
    const at = p => [ox + p.x * k, oy + p.y * k];
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#8c8c8c'; ctx.beginPath();
    ARMS.map(n => b.point(n)).forEach((p, i, a) => { if (p && a[i - 1]) { ctx.moveTo(...at(a[i - 1])); ctx.lineTo(...at(p)); } });
    ctx.stroke();
    for (const [side, color] of [['left', '#e0a060'], ['right', '#6fa8dc']]) {
      const hand = b.hands[side];
      if (!hand) continue;
      ctx.strokeStyle = color; ctx.beginPath();
      for (const chain of BONES) chain.forEach((i, j) => { const [x, y] = at(hand[i]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    for (const n of POINT_NAMES) {
      const p = b.point(n);
      if (!p) continue;
      ctx.fillStyle = n.startsWith('left') ? '#e0a060' : n.startsWith('right') ? '#6fa8dc' : '#dadada';
      const [x, y] = at(p); ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  };

  const progress = () => {
    const p = G.recognizer?.progress() || {};
    for (const row of bars.children) {
      const name = row.dataset.gesture, v = p[name] || 0;
      row.querySelector('.wb-gesture-bar i').style.width = `${Math.round(v * 100)}%`;
      row.classList.toggle('fired', G.recent(name, 600));
    }
  };

  const editor = createCodeEditor(editorHost, { value: G.code, language: 'p5', onRun: () => apply() });
  let timer = 0;
  const apply = () => { const err = G.compile(editor.value); if (err) app.log(`Gestures: ${err}`, 'error'); editor.markError(null); };
  editor.onDocChange(() => { clearTimeout(timer); timer = setTimeout(apply, 600); });

  labels.title = 'Poses the script names with learned: \'…\' (record a few seconds of each)';
  el.replaceChildren(head, view, bars, labels, editorHost);
  renderHead(); renderList(); paint();
  G.on(what => {
    if (what === 'body') { paint(); progress(); return; }
    if (what === 'fired') { progress(); return; }
    if (what === 'state') { renderHead(); renderList(); return; }
    if (what === 'code') { renderList(); if (editor.value !== G.code) editor.value = G.code; }
  });
  S.on(name => { if (!name) renderHead(); else if (name === G.source && !G.enabled) paint(); });
}
