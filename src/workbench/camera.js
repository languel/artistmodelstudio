/**
 * Cameras (docs/camera-plan.md §3): a take can have several; a **shot** is a clip on the Shots track that points a
 * camera at something in the canvas world for a time.
 *
 *   take.cameras = [{ id, name, w, h, fps, color }]
 *   shot clip    = { track: 'shot', camera, start, dur, target: { board: id } | { rect: [x, y, w, h] },
 *                    dx, dy, z (the pose: z 1 shows the whole target, dx/dy shift by fractions of it),
 *                    to?: { dx, dy, z } (the pose at the end of the shot: a move) }
 *
 * `renderCamera` draws what a camera sees: the boards in their stacking order (each as a picture: its marks, the
 * source under it, its masks and effects, or a sketch's snapshot), through the shot's view, with each board's opacity
 * and blend. The Program board shows the camera of the shot that started last (a cut); a camera can also have a
 * board of its own (`source('camera-1')`).
 */
import { flatClips } from '../process/take.js';
import { boardsOf, boardById, MAIN, opacityOf, blendOf } from '../process/boards.js';
import { boardLive } from './boardSource.js';

export const CAMERA_COLORS = ['#e8884a', '#4aa3e8', '#7bc47f', '#c77be8', '#e8c84a'];

/** The cameras of a take (made on first use: Camera 1, 16:9). */
export function camerasOf(take) {
  if (!Array.isArray(take.cameras) || !take.cameras.length) take.cameras = [{ id: 'cam1', name: 'Camera 1', w: 1280, h: 720, fps: 25, color: CAMERA_COLORS[0] }];
  return take.cameras;
}
export const cameraById = (take, id) => camerasOf(take).find(c => c.id === id) || camerasOf(take)[0];

export function addCamera(take, name = null) {
  const list = camerasOf(take), n = list.length + 1;
  let id = `cam${n}`; for (let i = n; list.some(c => c.id === id); i++) id = `cam${i + 1}`;
  const cam = { id, name: name || `Camera ${n}`, w: 1280, h: 720, fps: list[0]?.fps || 25, color: CAMERA_COLORS[(n - 1) % CAMERA_COLORS.length] };
  list.push(cam);
  return cam;
}

/** The slug a camera's board source goes by: source('camera-1'). */
export const cameraSource = cam => String(cam.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || cam.id;

/** The shot active at t: of one camera, or (none given) whichever started last: that is the cut. */
export function shotAt(take, t, cameraId = null) {
  let best = null;
  for (const c of flatClips(take)) {
    if (c.track !== 'shot' || c.muted || t < c.start || t >= c.start + c.dur) continue;
    if (cameraId && (c.camera || 'cam1') !== cameraId) continue;
    if (!best || c.start >= best.start) best = c;
  }
  return best;
}

/**
 * The shot on air at t (what the Program shows): with cut clips, the camera of the cut that started last, and that camera's
 * own shot; without, the shot that started last.
 */
export function onAirShot(take, t) {
  let cut = null;
  for (const c of flatClips(take)) if (c.track === 'cut' && !c.muted && t >= c.start && t < c.start + c.dur && (!cut || c.start >= cut.start)) cut = c;
  return cut ? shotAt(take, t, cut.camera) : flatClips(take).some(c => c.track === 'cut') ? null : shotAt(take, t);
}

/** Cut to a camera at t: the cut that covers t ends there and a new one runs to `until` (the end of the take, at least a second). */
export function cutTo(take, cameraId, t, until) {
  t = Math.max(0, Math.round(t));
  const cuts = take.clips.filter(c => c.track === 'cut');
  for (const c of cuts) if (t > c.start && t < c.start + c.dur) c.dur = t - c.start;
  const last = cuts.filter(c => c.start <= t).sort((a, b) => b.start - a.start)[0];
  if (last && last.camera === cameraId && last.start + last.dur >= t) { last.dur = Math.max(last.dur, (until ?? t + 1000) - last.start); return last; }   // (already on air)
  const clip = { id: `cut-${Date.now().toString(36)}-${cuts.length}`, track: 'cut', camera: cameraId, start: t, dur: Math.max(1000, (until ?? t + 1000) - t), label: cameraId, fx: {} };
  take.clips.push(clip);
  return clip;
}

const ease = u => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** The world rectangle a shot's target covers: { x, y, w, h }. */
export function targetRect(doc, shot) {
  const tg = shot?.target || {};
  if (tg.rect) return { x: tg.rect[0], y: tg.rect[1], w: tg.rect[2], h: tg.rect[3] };
  const b = boardById(doc, tg.board || MAIN) || boardById(doc, MAIN);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/** The shot's pose at t: { dx, dy, z }. */
export function poseAt(shot, t) {
  const a = { dx: shot.dx || 0, dy: shot.dy || 0, z: shot.z || 1 };
  if (!shot.to) return a;
  const u = ease(Math.max(0, Math.min(1, (t - shot.start) / Math.max(1, shot.dur))));
  const b = { dx: shot.to.dx ?? a.dx, dy: shot.to.dy ?? a.dy, z: shot.to.z ?? a.z };
  return { dx: a.dx + (b.dx - a.dx) * u, dy: a.dy + (b.dy - a.dy) * u, z: a.z + (b.z - a.z) * u };
}

/** The view of a camera of size W×H for a shot at t: world → pixels is (p - (x0, y0)) × k; also the world rectangle seen. */
export function viewFor(doc, shot, t, W, H) {
  const R = targetRect(doc, shot), pose = poseAt(shot, t), k = Math.min(W / R.w, H / R.h) * pose.z;
  const cx = R.x + R.w / 2 + pose.dx * R.w, cy = R.y + R.h / 2 + pose.dy * R.h;
  const x0 = cx - W / (2 * k), y0 = cy - H / (2 * k);
  return { x0, y0, k, rect: { x: x0, y: y0, w: W / k, h: H / k } };
}

const COMPOSITE = { add: 'lighter' };

/**
 * Depth of field: the blur (in pixels of a camera H pixels tall) a board at depth `depth` gets when the shot focuses on
 * depth `focus` with aperture `blur` (0 = everything sharp). Grows with the distance from the focal plane.
 */
export function blurPx(depth, focus, blur, H) {
  if (!(blur > 0)) return 0;
  const px = Math.abs((depth || 0) - (focus || 0)) * blur * 14 * (H / 720);
  return px < 0.4 ? 0 : Math.min(60, px);
}

/** The frame of a stop-motion board for time t of the film (frames at its fps, over its range, looping), as a bitmap; null until it has loaded. */
export function stopmotionPicture(app, b, t) {
  const SM = app.stopmotion; if (!SM) return null;
  const { sm } = SM.spec(b);
  if (!sm?.frames?.length) return null;
  const lo = Math.min(sm.in || 0, sm.frames.length - 1), hi = sm.out == null ? sm.frames.length - 1 : Math.min(sm.out, sm.frames.length - 1), n = Math.max(1, hi - lo + 1);
  const step = Math.floor((t / 1000) * (sm.fps || 8) / Math.max(1, sm.hold || 1));
  const i = lo + (sm.loop === false ? Math.min(step, n - 1) : step % n), asset = sm.frames[i];
  const s = SM.state(b.id);
  if (!s.images.has(asset)) { SM.image(b.id, asset).then(() => { for (const f of dirtyListeners) f(); }); return null; }
  return s.images.get(asset);
}

/** A light falloff over a board's rectangle (a lightbox: bright in the middle, darker toward the edges), by `light` 0..1. */
function lightFalloff(ctx, x, y, w, h, light) {
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.12, x + w / 2, y + h / 2, Math.hypot(w, h) / 2);
  const dark = Math.round(255 * (1 - 0.7 * Math.min(1, light)));
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, `rgb(${dark},${dark},${dark})`);
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
}

/**
 * A lightbox lights the boards above it: over the part of `ctx` inside the lightbox rectangle (x, y, w, h), what is already
 * drawn (a board painted on a transparent layer) darkens toward the edges, by the same falloff the lightbox has itself.
 */
export function lightOthers(ctx, x, y, w, h, light) {
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.12, x + w / 2, y + h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${(0.7 * Math.min(1, light)).toFixed(3)})`);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
}

/** Where a board is seen from a view centred on (cx, cy): a board `depth` behind the focal plane moves and scales by 1/(1+depth) about that centre. */
export function parallaxRect(b, cx, cy) {
  const f = 1 / (1 + Math.max(-0.9, b.depth || 0));
  return { x: cx + (b.x - cx) * f, y: cy + (b.y - cy) * f, w: b.width * f, h: b.height * f };
}

// ---- pictures of boards ---------------------------------------------------------------------------
const lives = new Map();   // `${boardId}@${side}` → board live canvas (drawing and media boards)
const sketches = new Map();   // board id → { img, asked }

function drawingPicture(app, b, k) {
  const side = Math.max(128, Math.min(2048, Math.ceil(Math.max(b.width, b.height) * k / 128) * 128));
  const key = `${b.id}@${side}`;
  let live = lives.get(key);
  if (!live) {
    for (const [other, l] of lives) if (other.startsWith(`${b.id}@`)) { l.stop?.(); lives.delete(other); }   // (one size per board: the last asked)
    live = boardLive(app, b.id, side); lives.set(key, live);
  }
  live.tick();
  return live.canvas;
}

/** A running sketch's picture: the last snapshot it sent (asked for again about every 120 ms). */
function sketchPicture(app, b) {
  if (app.frames?.renderMode) return app.frames.renderPics?.get(b.id) || null;   // (a render: the picture the stepped sketch sent for this frame)
  let s = sketches.get(b.id);
  if (!s) { s = { img: null, asked: 0 }; sketches.set(b.id, s); }
  const now = performance.now();
  if (now - s.asked > 120 && app.frames) {
    s.asked = now;
    app.frames.snapshotNow(b.id).then(url => {
      if (!url) return;
      const img = new Image(); img.onload = () => { s.img = img; for (const f of dirtyListeners) f(); }; img.src = url;
    });
  }
  return s.img;
}
const dirtyListeners = new Set();
/** Something a camera shows changed (a sketch sent a new picture): the Program picture is stale. */
export const onCameraDirty = fn => { dirtyListeners.add(fn); return () => dirtyListeners.delete(fn); };

/** Forget the cached pictures (a take closed). */
export function releaseCameras() { for (const l of lives.values()) l.stop?.(); lives.clear(); sketches.clear(); }

/** Draw what a shot sees at time t into ctx (W×H pixels, the camera's size). With no shot: black. */
export function renderCamera(app, shot, t, ctx, W, H) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!shot) { ctx.restore(); return null; }
  const doc = app.store.doc, v = viewFor(doc, shot, t, W, H);
  const lights = [];   // lightboxes drawn so far (screen rectangles): they light the boards painted after them
  let layer = null;
  for (const b of boardsOf(doc)) {
    if (b.kind === 'frame' || b.kind === 'code' || b.kind === 'playlist' || b.hidden || (b.kind === 'player' && b.hidden)) continue;
    if (b.source && app.sources.def(b.source)?.kind === 'timeline') continue;   // (a board that shows the sequence is not in it: no feedback)
    // Depth (parallax): a board d behind the focal plane moves and scales by 1/(1+d) about the middle of the view, so a pan moves the near planes more.
    const { x: bx, y: by, w: bw, h: bh } = parallaxRect(b, v.x0 + W / (2 * v.k), v.y0 + H / (2 * v.k));
    // Off the camera's view: skipped.
    if (bx > v.rect.x + v.rect.w || bx + bw < v.rect.x || by > v.rect.y + v.rect.h || by + bh < v.rect.y) continue;
    if (b.source) app.sources.seeCamera?.(b.source);
    if (b.maskWith?.source) app.sources.seeCamera?.(b.maskWith.source);
    const pic = b.kind === 'p5' || b.kind === 'three' ? sketchPicture(app, b) : b.kind === 'stopmotion' ? stopmotionPicture(app, b, t) : drawingPicture(app, b, v.k);
    if (!pic || !(pic.width || pic.naturalWidth)) continue;
    const sx = (bx - v.x0) * v.k, sy = (by - v.y0) * v.k, sw = bw * v.k, sh = bh * v.k;
    // A board that is over a lightbox is painted on a layer first, so the light can darken it toward the lightbox's edges.
    const lit = b.light > 0 ? [] : lights.filter(l => sx < l.x + l.w && sx + sw > l.x && sy < l.y + l.h && sy + sh > l.y);
    let layerCtx = null;
    if (lit.length) { layer ||= document.createElement('canvas'); if (layer.width !== W || layer.height !== H) { layer.width = W; layer.height = H; } layerCtx = layer.getContext('2d'); layerCtx.setTransform(1, 0, 0, 1, 0, 0); layerCtx.clearRect(0, 0, W, H); }
    const paint = c => {
      // (a stop-motion frame is fitted whole into its board)
      if (b.kind === 'stopmotion') { const w = pic.width, h = pic.height, k = Math.min(sw / w, sh / h); c.fillStyle = '#101010'; c.fillRect(sx, sy, sw, sh); c.drawImage(pic, sx + (sw - w * k) / 2, sy + (sh - h * k) / 2, w * k, h * k); }
      else c.drawImage(pic, sx, sy, sw, sh);
    };
    ctx.save();
    ctx.globalAlpha = opacityOf(b);
    const dof = blurPx(b.depth, shot.focus, shot.blur, H); if (dof) ctx.filter = `blur(${dof.toFixed(1)}px)`;
    const bl = blendOf(b); if (bl !== 'normal') ctx.globalCompositeOperation = COMPOSITE[bl] || bl;
    if (layerCtx) { paint(layerCtx); for (const l of lit) lightOthers(layerCtx, l.x, l.y, l.w, l.h, l.light); ctx.drawImage(layer, 0, 0); }
    else paint(ctx);
    if (b.light > 0) { lightFalloff(ctx, sx, sy, sw, sh, b.light); lights.push({ x: sx, y: sy, w: sw, h: sh, light: b.light }); }
    ctx.restore();
  }
  ctx.restore();
  return v;
}

/**
 * Onion skin through the camera: the times of the ghost frames around t, nearest first. `before`/`after` count frames,
 * `step` is the time between them (ms); times outside [0, end] are dropped. Opacity falls off with distance.
 */
export function onionTimes(t, { before = 2, after = 0, step = 120, opacity = 0.32 } = {}, end = Infinity) {
  const out = [];
  for (let n = 1; n <= Math.max(before, after); n++) {
    const a = opacity / n;
    if (n <= before && t - n * step >= 0) out.push({ t: t - n * step, side: 'before', a });
    if (n <= after && t + n * step <= end) out.push({ t: t + n * step, side: 'after', a });
  }
  return out;
}
export const ONION_TINT = { before: '#ff9a7a', after: '#7ab8ff' };

/** A shot on a board (the whole board in frame), for `camera`, from `start` for `dur` ms. */
export function boardShot(board, camera, { start = 0, dur = 5000 } = {}) {
  return { track: 'shot', ...(camera ? { camera: camera.id } : {}), start, dur, target: { board: board.id }, dx: 0, dy: 0, z: 1, label: board.title || 'Board', fx: {} };
}
