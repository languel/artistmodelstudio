/**
 * Poliplan's transport: a small strip at the bottom of the editor to play a graphic score: rewind, play and
 * pause, the position (bars, beats), the tempo, the speed, the loop and the built-in sound. The score itself is
 * the drawing (paths, travelers, events and nodes: see docs/EMBEDDING.md); this only drives the one transport.
 * Shown by default; `?transport=0` or `init { transport: false }` hides it (a host with its own clock).
 */
import { h } from '../workbench/ui.js';
import { formatMusicalPosition } from '../time/transport.js';

export function mountTransport(app, { shown = true } = {}) {
  const P = () => app.player;
  const time = h('span', { class: 'ams-tp-time', title: 'Bar . beat . sixteenth' }, '1.1.1');
  const play = h('button', { class: 'ams-tp-btn', type: 'button', title: 'Play / pause (End)', onclick: () => { app.score?.gm.resume?.().catch?.(() => {}); P().toggle(); } }, '▶');
  const rew = h('button', { class: 'ams-tp-btn', type: 'button', title: 'Back to the start (Home)', onclick: () => P().rewind() }, '⏮');
  const tempo = h('input', { class: 'ams-tp-num', type: 'number', min: 20, max: 400, step: 1, title: 'Tempo (beats a minute)' });
  tempo.addEventListener('change', () => P().setSettings({ tempo: Number(tempo.value) }));
  tempo.addEventListener('keydown', e => e.stopPropagation());
  const rate = h('select', { class: 'ams-tp-sel', title: 'Speed' }, ...[0.25, 0.5, 1, 1.5, 2].map(r => h('option', { value: r }, `${r}×`)));
  rate.value = '1';
  rate.addEventListener('change', () => { P().rate = Number(rate.value); rate.blur(); });
  const loop = h('button', { class: 'ams-tp-btn', type: 'button', title: 'Loop (the loop range, else the whole score)', onclick: () => { P().loop = !P().loop; sync(); } }, '↻');
  const sound = h('button', { class: 'ams-tp-btn', type: 'button', title: 'The built-in General MIDI sound (it starts on the first play)', onclick: () => { app.score?.setSound({ gm: !app.score.prefs.gm }); sync(); } }, '♪');
  const bar = h('div', { class: 'ams-transport wb-island', 'data-ams-transport': '' }, rew, play, time, h('span', { class: 'ams-tp-sep' }), tempo, rate, loop, sound);
  document.body.append(bar);

  function sync() {
    const p = P(), st = p.settings;
    play.textContent = p.playing ? '❚❚' : '▶';
    play.classList.toggle('on', p.playing);
    time.textContent = formatMusicalPosition(p.position() / 1000, st.tempo, st.signature).replace(/(\.1)?$/, '');
    if (document.activeElement !== tempo) tempo.value = st.tempo;
    loop.classList.toggle('on', Boolean(p.loop));
    sound.classList.toggle('on', Boolean(app.score?.prefs?.gm));
  }
  P().on(sync);
  app.store.subscribe(() => { if (!P().playing) sync(); });
  const show = on => { bar.style.display = on ? '' : 'none'; };
  show(shown);
  sync();
  app.embedTransport = { show, sync };
  return app.embedTransport;
}
