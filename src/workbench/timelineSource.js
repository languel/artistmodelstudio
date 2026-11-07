/**
 * The Timeline as a source: the picture of the take at the playhead (its media, board and title clips and
 * captions) on a canvas, live. A board that shows it is the **Program** board: the monitor of the sequence,
 * and what outputs (pin, window, full screen) and other boards (source('timeline')) take it from.
 */
export const TIMELINE_W = 1280, TIMELINE_H = 720;

export function timelineLive(app) {
  const canvas = document.createElement('canvas');
  canvas.width = TIMELINE_W; canvas.height = TIMELINE_H;
  const live = { kind: 'timeline', canvas, ready: true, version: 0, rate: 1, dirty: true, tick() {
    const p = app.player;
    if (!p?.take) { if (live.had) { live.had = false; const c = canvas.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, TIMELINE_W, TIMELINE_H); live.version++; } return; }
    // Redraw while it plays or the playhead moved, and when something it shows changed (a frame decoded, an edit).
    if (!live.dirty && !p.playing && p.t === live.t) return;
    live.dirty = false; live.t = p.t; live.had = true;
    p.drawProgram(canvas.getContext('2d'), TIMELINE_W, TIMELINE_H);
    live.version++;
  } , stop() { live.ready = false; live.off?.(); } };
  Object.assign(live, { setLoop() {}, setRange() {}, setVolume() {}, setRate() {}, position: () => null, hasAudio: () => false });
  const o1 = app.player?.on?.(() => { live.dirty = true; }), o2 = app.player?.onProgramDirty?.(() => { live.dirty = true; });
  live.off = () => { o1?.(); o2?.(); };
  return live;
}
