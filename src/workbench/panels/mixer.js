/**
 * Mixer: the scene's sixteen MIDI channels (what each sounds like and where it goes) and the scale
 * every note is held to. Lives with the Timeline. The data is `doc.transport.mixer` (src/score/mixer.js).
 */
import { h, selectField, numberField } from '../ui.js';
import { rangeInput } from '../rangeInput.js';
import { icon } from '../icons.js';
import { GM_PROGRAMS } from '../../score/outputs/gm.js';
import { scaleNames } from '../../score/scale.js';
import { stripOf, anySolo, OUTS } from '../../score/mixer.js';

const ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const OUT_LABEL = { auto: 'Auto', gm: 'Built-in', midi: 'MIDI', both: 'Both', off: 'Off' };

export function mountMixer(root, app) {
  const sc = () => app.score;
  const wrap = h('div', { class: 'wb-mx' });
  root.append(wrap);
  const meters = [];
  let key = '';

  const build = () => {
    const player = sc();
    if (!player) { setTimeout(build, 30); return; }
    const m = player.mixer(), any = anySolo(m);
    const set = patch => player.setMixer(patch);
    meters.length = 0;
    const top = h('div', { class: 'wb-mx-top' },
      h('span', { class: 'wb-mx-group', title: 'Every note is moved to the nearest note of this scale (Off: notes play as written)' },
        h('span', { class: 'wb-mx-cap' }, 'Scale'),
        selectField([['', 'Off'], ...scaleNames().map(n => [n, n])], m.scale.name, v => set({ scale: { name: v } })),
        selectField(ROOTS.map((n, i) => [String(i), n]), String(m.scale.root), v => set({ scale: { root: Number(v) } }), 'The scale’s root note')),
      h('span', { class: 'wb-mx-group', title: 'Semitones every note is moved by, before the scale' },
        h('span', { class: 'wb-mx-cap' }, 'Transpose'),
        numberField({ value: m.transpose, min: -48, max: 48, step: 1, def: 0, onChange: v => set({ transpose: Math.round(v) }) })),
      h('span', { class: 'wb-mx-group' },
        h('span', { class: 'wb-mx-cap' }, 'Built-in'),
        h('input', { type: 'checkbox', checked: player.prefs.gm, title: 'Play with the built-in General MIDI sound', onchange: e => { player.setSound({ gm: e.target.checked }); } })),
      h('span', { class: 'wb-mx-group' },
        h('span', { class: 'wb-mx-cap' }, 'MIDI'),
        selectField([['none', 'None'], ['all', 'All ports'], ...player.midi.ports().map(p => [p.id, p.name])], player.midi.selected, v => { player.setSound({ midi: v }); build(); }, 'A MIDI output'),
        h('button', { class: 'wb-btn', title: 'Ask the browser for MIDI access', onclick: () => player.connectMidi().then(build).catch(e => app.log(`MIDI: ${e.message}`, 'error')) }, player.midi.connected ? 'Rescan' : 'Connect')),
      h('span', { class: 'wb-mx-group wb-mx-end' },
        h('button', { class: 'wb-btn', title: 'Play a short chord on the outputs', onclick: () => player.test() }, 'Test'),
        h('button', { class: 'wb-btn', title: 'Everything off', onclick: () => player.panic() }, 'Stop all')));

    const strips = h('div', { class: 'wb-mx-strips' });
    for (let ch = 1; ch <= 16; ch++) {
      const s = stripOf(m, ch), drums = ch === 10;
      const meter = h('div', { class: 'wb-mx-meter' }, h('div', { class: 'wb-mx-level' }));
      meters.push(meter.firstChild);
      const vol = rangeInput({ min: 0, max: 127, step: 1, value: s.vol ?? 100, title: `Volume ${s.vol ?? 'untouched'}` });
      vol.addEventListener('change', () => set({ channel: { [ch]: { vol: Number(vol.value) } } }));
      const pan = rangeInput({ min: -1, max: 1, step: 0.05, value: s.pan ?? 0, title: 'Pan (double-click: centre)' });
      pan.addEventListener('change', () => set({ channel: { [ch]: { pan: Number(pan.value) } } }));
      pan.addEventListener('dblclick', () => set({ channel: { [ch]: { pan: null } } }));
      vol.addEventListener('dblclick', () => set({ channel: { [ch]: { vol: null } } }));
      strips.append(h('div', { class: `wb-mx-strip${s.mute || (any && !s.solo) ? ' is-off' : ''}`, 'data-ch': ch },
        h('div', { class: 'wb-mx-num' }, String(ch), drums ? h('span', { class: 'wb-mx-sub' }, 'drums') : null),
        selectField([['', drums ? 'Drum kit' : 'Score'], ...(drums ? [] : GM_PROGRAMS.map((n, i) => [String(i), `${i + 1} ${n}`]))], s.program === null ? '' : String(s.program),
          v => set({ channel: { [ch]: { program: v === '' ? null : Number(v) } } }), drums ? 'Channel 10 is the built-in drum kit' : 'The instrument of this channel (Score: whatever the score or the synth says)'),
        selectField(OUTS.map(o => [o, OUT_LABEL[o]]), s.out, v => set({ channel: { [ch]: { out: v } } }), 'Where this channel is heard: Auto is every output that is on'),
        h('div', { class: 'wb-mx-faders' }, meter, vol),
        pan,
        h('div', { class: 'wb-mx-ms' },
          h('button', { class: `wb-mx-btn${s.mute ? ' on' : ''}`, title: 'Mute', onclick: () => set({ channel: { [ch]: { mute: !s.mute } } }) }, 'M'),
          h('button', { class: `wb-mx-btn solo${s.solo ? ' on' : ''}`, title: 'Solo', onclick: () => set({ channel: { [ch]: { solo: !s.solo } } }) }, 'S')),
        numberField({ value: s.transpose, min: -48, max: 48, step: 1, def: 0, title: 'Transpose this channel (semitones)', onChange: v => set({ channel: { [ch]: { transpose: Math.round(v) } } }) })));
    }
    wrap.replaceChildren(top, strips);
  };

  // Rebuild when the mixer (or the sound setup) changes; not on unrelated edits.
  const check = () => {
    const p = sc(); if (!p) return;
    const k = `${JSON.stringify(p.mixer())}|${p.prefs.gm}|${p.midi.selected}|${p.midi.connected}`;
    if (k !== key) { key = k; build(); }
  };
  app.store.subscribe(check);
  app.player?.on?.(check);
  app.store.on?.('sound', () => { key = ''; check(); });
  build(); check();

  // Level meters: the last note's velocity, falling away.
  const timer = setInterval(() => {
    if (!root.isConnected) { clearInterval(timer); return; }
    const r = sc()?.router; if (!r) return;
    const now = Date.now();
    meters.forEach((el, i) => { el.style.height = `${Math.round(Math.max(0, (r.levels[i] / 127) * Math.max(0, 1 - (now - r.lastOn[i]) / 900)) * 100)}%`; });
  }, 60);
}
