/**
 * "From a long recording to a short film": an explainer about the studio's own recording, timeline, curves, camera and render,
 * made with those features (src/workbench/film.js). Each scene is a 1920×1080 p5 sketch written for the film whose one control,
 * `p`, runs from 0 to 1 over the shot, so everything on screen is a function of p: the pointer, the keys, the clips, the readouts.
 * Nothing is only said: a pointer drags the key, a slider moves, a clip is split, and the number that changes is on screen.
 * The cameras cut and move over each scene (a wide camera and a closer one), and the film is 16:9.
 */
const HELP = `// shared by the scenes: colours, easing, a pointer, keys and sliders
const BG = '#14120f', PANEL = '#1f1d19', INK = '#f3efe6', MUTED = '#8c887d', WARM = '#c8664f', GOLD = '#f2c14e', BLUE = '#5b9bd5', GREEN = '#7fb069', GREY = '#4a463f';
const ease = t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const seg = (v, a, b) => constrain((v - a) / (b - a), 0, 1);
const mix = (a, b, u) => a + (b - a) * u;
const SANS = 'Inter, system-ui, sans-serif', MONO = 'ui-monospace, Menlo, Consolas, monospace';
function txt(s, x, y, size, col, al, bold) { noStroke(); fill(col || INK); textFont(SANS); textStyle(bold ? BOLD : NORMAL); textAlign(al || LEFT, CENTER); textSize(size || 36); text(s, x, y); }
function mono(s, x, y, size, col) { noStroke(); fill(col || INK); textFont(MONO); textStyle(NORMAL); textAlign(LEFT, CENTER); textSize(size || 30); text(s, x, y); }
function clock(ms) { const s = Math.round(ms); return floor(s / 60) + ':' + nf(s % 60, 2); }
function cap(label, x, y, down) { const w = max(70, label.length * 30 + 40); push(); translate(x, y + (down ? 6 : 0)); fill(down ? GOLD : '#2a2723'); stroke(down ? GOLD : GREY); strokeWeight(3); rect(-w / 2, -40, w, 80, 14); noStroke(); fill(down ? BG : INK); textFont(SANS); textStyle(BOLD); textAlign(CENTER, CENTER); textSize(40); text(label, 0, 2); pop(); }
function pointer(x, y, press) { push(); translate(x, y); if (press) { noFill(); stroke(GOLD); strokeWeight(4); circle(0, 0, 54 + 10 * press); } fill(INK); stroke(BG); strokeWeight(3); beginShape(); vertex(0, 0); vertex(0, 44); vertex(12, 34); vertex(21, 54); vertex(30, 50); vertex(21, 31); vertex(36, 31); endShape(CLOSE); pop(); }
function along(pts, u) { const n = pts.length - 1, f = constrain(u, 0, 1) * n, i = min(n - 1, floor(f)), e = ease(f - i); return [mix(pts[i][0], pts[i + 1][0], e), mix(pts[i][1], pts[i + 1][1], e)]; }
function slider(name, v, lo, hi, x, y, w, col, dot) { txt(name, x, y - 46, 40, INK, LEFT, true); if (dot) { push(); translate(x + textWidth(name) + 36, y - 46); fill(dot === 2 ? GOLD : 'none'); stroke(GOLD); strokeWeight(3); quad(0, -14, 14, 0, 0, 14, -14, 0); pop(); } stroke(GREY); strokeWeight(10); line(x, y, x + w, y); const u = (v - lo) / (hi - lo); stroke(col || WARM); line(x, y, x + w * u, y); noStroke(); fill(INK); circle(x + w * u, y, 38); txt(nf(v, 1, 1), x + w + 30, y, 44, col || WARM, LEFT, true); return [x + w * u, y]; }
function frame(x, y, w, h, col, label, on) { noFill(); stroke(col); strokeWeight(on ? 7 : 4); if (!on) drawingContext.setLineDash([16, 10]); rect(x, y, w, h, 6); drawingContext.setLineDash([]); if (label) txt(label, x + 14, y - 26, 32, col, LEFT, true); }
`;

const sketch = body => `${HELP}
let p = 0 /* 0..1 */;   // progress through the shot
function setup() { createCanvas(1920, 1080); pixelDensity(1.5); noLoop(); }
function draw() {
  background(BG);
${body}
}`;

// ---- the scenes ----------------------------------------------------------------------------------------------------------------
const SEGS = `const SEGS = [[0, 40, 'talk'], [40, 75, 'wait'], [75, 150, 'talk'], [150, 175, 'redo'], [175, 260, 'talk'], [260, 330, 'wait'], [330, 360, 'talk'], [360, 420, 'redo'], [420, 520, 'talk'], [520, 560, 'wait'], [560, 600, 'talk']];
const KINDCOL = { talk: WARM, redo: GREY, wait: '#2a2723' };
function strip(x0, x1, y, h, fn) { for (const [a, b, k] of SEGS) { const r = fn ? fn(a, b, k) : [a, b, 1]; if (!r || r[2] <= 0) continue; const xa = mix(x0, x1, r[0] / 600), xb = mix(x0, x1, r[1] / 600); noStroke(); fill(KINDCOL[k]); rect(xa, y, max(2, xb - xa - 4), h * r[2], 8); if (k === 'redo') { stroke(BG); strokeWeight(3); for (let q = xa + 12; q < xb - 16; q += 22) line(q, y + h * r[2], q + 22, y); } } }`;

const RAW = sketch(`${SEGS}
  txt('The raw take', 120, 120, 76, INK, LEFT, true);
  txt('you teach for ten minutes: drawing, talking, waiting, trying again', 120, 200, 40, MUTED);
  const x0 = 120, x1 = 1800, y = 470, h = 180, t = 600 * seg(p, 0.04, 0.8);
  strip(x0, x1, y, h);
  // the legend
  [[WARM, 'drawing and talking'], [GREY, 'a retake'], ['#2a2723', 'waiting']].forEach(([c, s], i) => { fill(c); stroke(GREY); strokeWeight(2); rect(140 + i * 520, 760, 44, 44, 8); txt(s, 206 + i * 520, 782, 38, INK); });
  // the playhead
  const px = mix(x0, x1, t / 600); stroke(GOLD); strokeWeight(6); line(px, y - 70, px, y + h + 40); noStroke(); fill(GOLD); triangle(px - 20, y - 70, px + 20, y - 70, px, y - 36);
  txt(clock(t), px, y - 110, 56, GOLD, CENTER, true);
  const u = ease(seg(p, 0.84, 1));
  if (u > 0) { drawingContext.globalAlpha = u; txt('what is worth keeping: about two minutes', 120, 900, 52, GREEN, LEFT, true); fill(GREEN); rect(120, 950, 1680 * 120 / 600 * u, 26, 8); txt('and a one minute short', 1000, 990, 44, BLUE, LEFT, true); fill(BLUE); rect(120, 1000, 1680 * 60 / 600 * u, 26, 8); drawingContext.globalAlpha = 1; }`);

const RECORD = sketch(`
  txt('Record a take', 120, 110, 72, INK, LEFT, true);
  // the record button, and the pointer that presses it
  const press = seg(p, 0.1, 0.16), on = p > 0.15, bx = 1580, by = 120;
  fill(on ? '#d33' : '#3a3631'); stroke(on ? '#f66' : GREY); strokeWeight(4); rect(bx - 130, by - 48, 260, 96, 48); noStroke(); fill(INK); circle(bx - 80, by, 34); txt(on ? 'Recording' : 'Record', bx - 50, by, 38, INK, LEFT, true);
  if (on && floor(p * 40) % 2 === 0) { fill('#f66'); circle(bx - 80, by, 34); }
  // the lanes
  const lanes = [['Drawing', WARM, [[0.02, 0.2], [0.26, 0.42], [0.55, 0.78], [0.82, 0.94]]], ['Narration', BLUE, [[0.0, 0.14], [0.17, 0.38], [0.44, 0.6], [0.66, 0.92]]], ['Actions', GREEN, [[0.05, 0.09], [0.21, 0.23], [0.4, 0.43], [0.58, 0.6], [0.8, 0.84]]], ['Camera', GOLD, [[0.1, 0.5], [0.52, 0.88]]]];
  const x0 = 360, x1 = 1800, now = seg(p, 0.16, 0.95);
  lanes.forEach(([name, col, clips], i) => { const y = 330 + i * 150; txt(name, 120, y + 50, 40, INK, LEFT, true); fill(PANEL); noStroke(); rect(x0, y, x1 - x0, 100, 10); clips.forEach(([a, b]) => { const e = min(b, now); if (e > a) { fill(col); rect(mix(x0, x1, a), y + 10, mix(x0, x1, e) - mix(x0, x1, a), 80, 8); } }); });
  if (on) { const px = mix(x0, x1, now); stroke('#f66'); strokeWeight(6); line(px, 290, px, 950); txt(clock(600 * now), px, 262, 46, '#f66', CENTER, true); }
  const [ px, py ] = along([[900, 640], [1300, 380], [bx, by + 6], [bx, by + 6], [1500, 520]], seg(p, 0, 0.2)); pointer(px, py, press > 0 && press < 1 ? 1 : 0);`);

const SUMMARY = sketch(`${SEGS}
  txt('Summary: a first cut, made for you', 120, 110, 72, INK, LEFT, true);
  const e1 = ease(seg(p, 0.12, 0.4)), e2 = ease(seg(p, 0.42, 0.62)), e3 = ease(seg(p, 0.64, 0.86));
  // positions after each step: waiting is capped, retakes are dropped, the rest is brisk
  const len = (a, b, k) => (k === 'wait' ? (b - a) * (1 - 0.92 * e1) : k === 'redo' ? (b - a) * (1 - e2) : (b - a) * (1 - 0.45 * e3));
  let x = 120; const scale = 1680 / 600, y = 430, h = 180;
  for (const [a, b, k] of SEGS) { const w = len(a, b, k) * scale; if (w > 2) { noStroke(); fill(KINDCOL[k]); rect(x, y, max(2, w - 4), h, 8); } x += w; }
  const total = SEGS.reduce((s, [a, b, k]) => s + len(a, b, k), 0);
  txt('now ' + clock(total), 120, 340, 64, GOLD, LEFT, true);
  txt('from 10:00', 640, 340, 44, MUTED);
  [['waiting is capped', e1], ['retakes are dropped', e2], ['narration at reading pace, drawing brisk', e3]].forEach(([s, u], i) => { drawingContext.globalAlpha = 0.35 + 0.65 * (u > 0 && u < 1 ? 1 : u >= 1 ? 0.9 : 0); txt((u >= 1 ? '✓  ' : '›  ') + s, 160, 720 + i * 90, 50, u >= 1 ? GREEN : INK, LEFT, true); drawingContext.globalAlpha = 1; });
  const hold = ease(seg(p, 0.88, 1)); if (hold > 0) { drawingContext.globalAlpha = hold; fill(GOLD); rect(x + 10, y, 120 * hold, h, 8); txt('a hold on the result', x + 10, y + h + 50, 36, GOLD, LEFT, true); drawingContext.globalAlpha = 1; }
  // the button, pressed once
  const bp = seg(p, 0, 0.1); fill(bp > 0.7 ? GOLD : '#2a2723'); stroke(GOLD); strokeWeight(4); rect(1380, 90, 400, 90, 20); txt('Summary', 1580, 135, 46, bp > 0.7 ? BG : INK, CENTER, true);
  const [qx, qy] = along([[1100, 600], [1560, 160]], bp); pointer(qx, qy, bp > 0.7 && bp < 1 ? 1 : 0);`);

const CUT = sketch(`${SEGS}
  txt('Then cut like an editor', 120, 110, 72, INK, LEFT, true);
  // clips: waiting and retakes go, in this order, and everything after closes up
  const gone = [[1, 0.46], [3, 0.74], [5, 0.78], [7, 0.82], [9, 0.86]];   // [clip index, p when it is deleted]
  const cut = (i) => { const g = gone.find(q => q[0] === i); return g ? ease(seg(p, g[1], g[1] + 0.1)) : 0; };
  const y = 520, h = 170, sc = 1680 / 600; let x = 120, removed = 0;
  SEGS.forEach(([a, b, k], i) => { const c = cut(i), w = (b - a) * sc * (1 - c); if (w > 2) { const sel = (i === 1 && p > 0.36 && p < 0.5); noStroke(); fill(KINDCOL[k]); rect(x, y, max(2, w - 4), h * (1 - c * 0.4), 8); if (sel) { noFill(); stroke(GOLD); strokeWeight(6); rect(x, y, w - 4, h, 8); } } x += w; removed += (b - a) * c; });
  txt(clock(600 - removed), 1580, 400, 70, GOLD, RIGHT, true); txt('total', 1800, 400, 34, MUTED, RIGHT);
  // the playhead goes to the first gap, splits it at both ends, selects it, deletes it
  const t = p < 0.1 ? 600 * mix(0, 40 / 600, ease(seg(p, 0, 0.1))) : p < 0.24 ? 40 : p < 0.32 ? mix(40, 75, ease(seg(p, 0.24, 0.32))) : 75;
  const phx = 120 + t * sc; stroke(GOLD); strokeWeight(6); line(phx, y - 80, phx, y + h + 40); noStroke(); fill(GOLD); triangle(phx - 20, y - 80, phx + 20, y - 80, phx, y - 46);
  // split marks
  if (p > 0.16) { stroke(INK); strokeWeight(4); line(120 + 40 * sc, y - 20, 120 + 40 * sc, y + h + 20); }
  if (p > 0.34) { stroke(INK); strokeWeight(4); line(120 + 75 * sc, y - 20, 120 + 75 * sc, y + h + 20); }
  const k1 = p > 0.12 && p < 0.2, k2 = p > 0.3 && p < 0.38, k3 = p > 0.44 && p < 0.52;
  cap('X', 560, 860, k1 || k2); txt('split at the playhead', 660, 860, 38, k1 || k2 ? GOLD : MUTED);
  cap('Delete', 1180, 860, k3); txt('ripple: the rest closes up', 1330, 860, 38, k3 ? GOLD : MUTED);
  const [qx, qy] = p < 0.44 ? along([[900, 700], [120 + 57 * sc, y + 60]], seg(p, 0.36, 0.44)) : [120 + 57 * sc, y + 60]; if (p > 0.34) pointer(qx, qy, p > 0.4 && p < 0.44 ? 1 : 0);`);

const CURVES = sketch(`
  txt('Anything with a diamond is a curve', 120, 110, 72, INK, LEFT, true);
  // the parameter: a shot's zoom, with the keyframe diamond beside it
  const keys = [[0, 1.0], [0.32, 1.0], [0.62, 1.0], [1, 1.6]];
  const drag = ease(seg(p, 0.12, 0.5)); keys[2][1] = mix(1.0, 2.6, drag);
  const cx0 = 1000, cx1 = 1820, cy0 = 800, cy1 = 300, X = u => mix(cx0, cx1, u), Y = v => mix(cy0, cy1, (v - 0.8) / 2.2);
  fill(PANEL); noStroke(); rect(960, 240, 900, 600, 16);
  stroke(GREY); strokeWeight(2); for (let v = 1; v <= 3; v++) { line(cx0, Y(v), cx1, Y(v)); noStroke(); fill(MUTED); textFont(SANS); textSize(30); textAlign(RIGHT, CENTER); text(v + '×', cx0 - 14, Y(v)); stroke(GREY); }
  const val = u => { let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= u) i++; const [a, va] = keys[i], [b, vb] = keys[i + 1]; return mix(va, vb, ease(seg(u, a, b))); };
  noFill(); stroke(WARM); strokeWeight(8); beginShape(); for (let u = 0; u <= 1.0001; u += 0.01) vertex(X(u), Y(val(u))); endShape();
  keys.forEach(([u, v], i) => { push(); translate(X(u), Y(v)); fill(i === 2 ? GOLD : INK); stroke(BG); strokeWeight(3); quad(0, -20, 20, 0, 0, 20, -20, 0); pop(); });
  // the playhead sweeps once the key is placed, and the camera frame on the left follows the curve
  const ph = seg(p, 0.58, 0.98); const zoom = val(ph);
  if (p > 0.58) { stroke(GOLD); strokeWeight(4); line(X(ph), 250, X(ph), 820); }
  // a mini scene, and the frame the camera sees
  fill(PANEL); noStroke(); rect(120, 240, 760, 430, 16); const sx = 140, sy = 260, sw = 720, sh = 390; fill('#2d3a2b'); rect(sx, sy + sh * 0.62, sw, sh * 0.38); fill('#3b5b8c'); rect(sx, sy, sw, sh * 0.62);
  fill('#e8c84a'); circle(sx + sw * 0.76, sy + sh * 0.22, 64); fill('#6b4f3a'); rect(sx + sw * 0.28, sy + sh * 0.4, 150, 130); fill('#a8452f'); triangle(sx + sw * 0.28 - 14, sy + sh * 0.4, sx + sw * 0.28 + 164, sy + sh * 0.4, sx + sw * 0.28 + 75, sy + sh * 0.2);
  const fw = sw / zoom, fh = sh / zoom, fx = mix(sx, sx + sw * 0.28 - 20, (zoom - 1) / 1.6), fy = mix(sy, sy + sh * 0.3, (zoom - 1) / 1.6); noFill(); stroke(GOLD); strokeWeight(6); rect(fx, fy, fw, fh);
  slider('Zoom', zoom, 1, 3, 130, 800, 640, WARM, p > 0.3 ? 2 : 1);
  // the pointer takes the third key from 1× up to 2.6×, then rests
  const kx = X(0.62), pointerPos = p < 0.12 ? along([[1300, 880], [kx, Y(1.0)]], seg(p, 0, 0.12)) : p < 0.5 ? [kx, Y(keys[2][1])] : along([[kx, Y(2.6)], [1500, 880]], seg(p, 0.5, 0.58));
  pointer(pointerPos[0], pointerPos[1], p > 0.12 && p < 0.5 ? 1 : 0);`);

const CAMERA = sketch(`
  txt('Cameras: shots, cuts and depth', 120, 100, 72, INK, LEFT, true);
  // a world of layers at different depths, drawn through any camera: depth moves things at different speeds when the camera moves
  const layers = [{ d: 2.0, draw: () => { fill('#3b4f6e'); for (let i = 0; i < 6; i++) triangle(i * 330 - 80, 760, i * 330 + 90, 480, i * 330 + 260, 760); } }, { d: 0.8, draw: () => { fill('#3f6a3a'); for (let i = 0; i < 9; i++) { rect(i * 220 + 40, 650, 26, 120); circle(i * 220 + 53, 640, 110); } } }, { d: 0, draw: () => { fill('#c8664f'); circle(1050, 700, 150); fill(INK); circle(1010, 680, 24); circle(1090, 680, 24); } }];
  const world = (cx, cy) => { fill('#e6c888'); noStroke(); rect(-200, 0, 2400, 900); fill('#f2c14e'); circle(1500, 250, 140); for (const L of layers) { push(); const f = 1 / (1 + L.d); translate((cx) * (1 - f), (cy) * (1 - f)); scale(1); L.draw(); pop(); } fill('#2f2a24'); rect(-200, 760, 2400, 400); };
  // the two cameras: C1 pans and pushes in, C2 holds a vertical detail
  const e = ease(seg(p, 0.1, 0.55)), c1 = { cx: mix(700, 1050, e), cy: mix(440, 600, e), w: mix(1100, 560, e) }, c2 = { cx: 1050, cy: 640, w: 360 };
  // the big picture of the world, with the viewfinders on it
  push(); translate(80, 190); scale(0.46); drawingContext.save(); drawingContext.beginPath(); drawingContext.rect(-200, 0, 2400, 1000); drawingContext.clip(); world(1050, 500); drawingContext.restore(); pop();
  const wx = v => 80 + v * 0.46, wy = v => 190 + v * 0.46;
  frame(wx(c1.cx - c1.w / 2), wy(c1.cy - c1.w * 9 / 32), c1.w * 0.46, c1.w * 9 / 16 * 0.46, '#e8884a', 'Camera 1  16:9', p < 0.62);
  frame(wx(c2.cx - c2.w / 2), wy(c2.cy - c2.w * 16 / 18), c2.w * 0.46, c2.w * 16 / 9 * 0.46, BLUE, 'Camera 2  9:16', p >= 0.62);
  // what each camera sees: the world through a clip and a transform
  const view = (X, Y, W, H, c, ratio) => { drawingContext.save(); drawingContext.beginPath(); drawingContext.rect(X, Y, W, H); drawingContext.clip(); const k = W / c.w; translate(X, Y); scale(k); translate(-(c.cx - c.w / 2), -(c.cy - c.w * ratio / 2)); push(); world(c.cx, c.cy); pop(); drawingContext.restore(); };
  push(); view(1180, 220, 640, 360, c1, 9 / 16); pop(); push(); view(1180, 640, 260, 240, { ...c2, w: c2.w }, 9 / 16); pop();
  // fix: the vertical view is cropped square here to fit; the label says what it is
  txt('Program', 1180, 190, 36, p < 0.62 ? '#e8884a' : MUTED, LEFT, true); txt(p < 0.62 ? 'ON AIR' : '', 1560, 190, 36, '#e8884a', LEFT, true);
  txt('Camera 2', 1180, 610, 36, p >= 0.62 ? BLUE : MUTED, LEFT, true); txt(p >= 0.62 ? 'ON AIR' : '', 1400, 610, 36, BLUE, LEFT, true);
  noFill(); stroke(p < 0.62 ? '#e8884a' : BLUE); strokeWeight(8); if (p < 0.62) rect(1180, 220, 640, 360); else rect(1180, 640, 260, 240);
  // the cut
  if (p > 0.6 && p < 0.7) { txt('CUT', 960, 1020, 70, GOLD, CENTER, true); }`);

const EFFECTS = sketch(`
  txt('Effects are curves too: pull the focus', 120, 100, 72, INK, LEFT, true);
  push(); translate(0, -55);
  const focus = mix(0, 2, ease(seg(p, 0.15, 0.7))), aperture = 1.2;
  const blurOf = d => Math.min(26, Math.abs(d - focus) * aperture * 14);
  const layer = (d, fn) => { drawingContext.filter = blurOf(d) > 0.4 ? 'blur(' + blurOf(d).toFixed(1) + 'px)' : 'none'; fn(); drawingContext.filter = 'none'; };
  fill('#e6c888'); noStroke(); rect(120, 190, 1680, 540, 16);
  layer(2, () => { fill('#3b4f6e'); for (let i = 0; i < 5; i++) triangle(160 + i * 340, 700, 330 + i * 340, 380, 500 + i * 340, 700); fill('#f2c14e'); circle(1560, 300, 110); });
  layer(1, () => { fill('#6b4f3a'); rect(720, 500, 360, 220); fill('#a8452f'); triangle(690, 500, 1110, 500, 900, 340); fill('#e8c84a'); rect(850, 590, 70, 130); });
  layer(0, () => { stroke('#2f6f3a'); strokeWeight(14); line(300, 760, 300, 520); line(300, 640, 360, 590); noStroke(); fill('#e0405a'); for (let a = 0; a < 6; a++) circle(300 + cos(a * 1.047) * 56, 500 + sin(a * 1.047) * 56, 70); fill('#f2c14e'); circle(300, 500, 50); });
  // depth labels, then the slider and the pointer that drags it
  [['near', 0, 300], ['middle', 1, 900], ['far', 2, 1560]].forEach(([n, d, x]) => txt(n + '  depth ' + d, x, 780, 34, Math.abs(d - focus) < 0.25 ? GREEN : MUTED, CENTER, true));
  const [sx, sy] = slider('Focus', focus, 0, 3, 200, 830, 900, GOLD, p > 0.1 ? 2 : 1);
  slider('Blur', aperture, 0, 3, 1300, 830, 380, MUTED, 1);
  const [qx, qy] = p < 0.15 ? along([[1100, 900], [sx, sy]], seg(p, 0, 0.15)) : p < 0.7 ? [sx, sy] : along([[sx, sy], [1200, 900]], seg(p, 0.7, 0.8)); pointer(qx, qy, p > 0.15 && p < 0.7 ? 1 : 0); pop();`);

const RENDER = sketch(`
  txt('Render: every frame, on purpose', 120, 100, 72, INK, LEFT, true);
  // frames arrive one by one, numbered, and are passed to the encoder
  const n = floor(seg(p, 0.05, 0.8) * 4500);
  for (let i = 0; i < 8; i++) { const k = max(0, n - 7 + i), x = 140 + i * 215, y = 250; fill(PANEL); stroke(GREY); strokeWeight(3); rect(x, y, 190, 107, 8); const hue = (k * 7) % 360; colorMode(HSB, 360, 100, 100); fill(hue, 35, 85); noStroke(); rect(x + 8, y + 8, 174, 91, 4); colorMode(RGB, 255); txt(nf(k, 4), x + 95, y + 135, 30, i === 7 ? GOLD : MUTED, CENTER, i === 7); }
  txt('frame ' + n + ' of 4500', 960, 470, 56, GOLD, CENTER, true);
  // the parts of each frame
  [['cameras and shots', WARM], ['keyframed curves', GOLD], ['sketches, one step at a time', GREEN], ['voice and sound, mixed apart', BLUE]].forEach(([s, c], i) => { const on = p > 0.1 + i * 0.12; drawingContext.globalAlpha = on ? 1 : 0.25; fill(c); noStroke(); circle(200, 590 + i * 76, 28); txt(s, 250, 590 + i * 76, 44, INK); drawingContext.globalAlpha = 1; });
  // the sound lane under, and the film that comes out
  fill(PANEL); rect(1060, 540, 740, 110, 12); stroke(BLUE); strokeWeight(3); for (let x = 1080; x < 1790; x += 7) { const a = 40 * noise(x * 0.05) * (1 + sin(x * 0.012)); line(x, 595 - a * 0.6, x, 595 + a * 0.6); }
  const b = ease(seg(p, 0.82, 1)); fill(b > 0 ? GOLD : '#2a2723'); stroke(GOLD); strokeWeight(4); rect(1060, 690, 740, 130, 20); txt(b > 0 ? 'film.mp4' : 'encoding…', 1430, 755, 64, b > 0 ? BG : MUTED, CENTER, true);`);

const SHORT = sketch(`
  txt('The short: a second camera, vertical', 120, 100, 72, INK, LEFT, true);
  // one scene, two outputs: 16:9 for the cut, 9:16 for the short, both from the same take
  const scene = (x, y, w, h, fx, fy, fz) => { drawingContext.save(); drawingContext.beginPath(); drawingContext.rect(x, y, w, h); drawingContext.clip(); translate(x, y); scale(fz); translate(-fx, -fy); fill('#e6c888'); noStroke(); rect(0, 0, 1000, 600); fill('#3b4f6e'); for (let i = 0; i < 4; i++) triangle(i * 260 - 20, 420, i * 260 + 110, 200, i * 260 + 240, 420); fill('#6b4f3a'); rect(380, 280, 230, 150); fill('#a8452f'); triangle(360, 280, 630, 280, 495, 150); fill('#f2c14e'); circle(850, 120, 70); fill('#2f2a24'); rect(0, 420, 1000, 200); drawingContext.restore(); };
  const u = ease(seg(p, 0.1, 0.55));
  // the wide camera on the whole scene, and the vertical one moving to the part that matters
  push(); scene(120, 220, 960, 560, 0, 0, 0.96); pop(); frame(120, 220, 960, 560, '#e8884a', 'Camera 1  16:9  the cut', p < 0.7);
  const vx = mix(0, 380, u), vw = mix(560, 260, u) ; frame(120 + vx * 0.96, 220, vw * 0.96 * 0.5625 * 1.0, 560, BLUE, '', p >= 0.7); txt('Camera 2  9:16  the short', 1280, 130, 34, BLUE, LEFT, true);
  // the vertical output
  push(); const k = 1.7 * (1 + 1.2 * u); scene(1280, 160, 360, 640, mix(0, 380, u) + 0, 0, 1.0 + 0.9 * u); pop(); noFill(); stroke(BLUE); strokeWeight(6); rect(1280, 160, 360, 640);
  txt('1080 × 1920', 1460, 830, 36, BLUE, CENTER, true);
  const sz = ease(seg(p, 0.45, 0.8)); txt('Camera size: 1080 × 1920', 120, 830, 52, INK, LEFT, true);
  const [qx, qy] = along([[1200, 1000], [120 + (vx + vw / 2) * 0.96, 520]], seg(p, 0.05, 0.3)); pointer(qx, qy, p > 0.1 && p < 0.55 ? 1 : 0);`);

const SPEC_LINES = [
  "{ board: 'Pointillism',",
  "  say: 'A picture is a function: give it",
  "        a place, and it gives a colour.',",
  "  set: [{ name: 'cols', from: 6, to: 70 }],",
  "  code: { from: 'function colourAt' },",
  "  cuts: [{ at: 0.5, camera: 2, pose: { z: 1.27 } }] }"
];
const SPEC = sketch(`
  txt('A student asks for an explainer', 120, 100, 72, INK, LEFT, true);
  const lines = ${JSON.stringify(SPEC_LINES)};
  const total = lines.join('\\n').length, typed = floor(seg(p, 0.04, 0.62) * total);
  fill(PANEL); noStroke(); rect(100, 190, 1000, 560, 16);
  let used = 0; lines.forEach((l, i) => { const n = constrain(typed - used, 0, l.length + 1); used += l.length + 1; mono(l.slice(0, n) + (n > 0 && n <= l.length && floor(p * 60) % 2 ? '▍' : ''), 140, 250 + i * 80, 38, i === 1 || i === 2 ? GREEN : i === 3 ? GOLD : i === 4 ? BLUE : INK); });
  // the take that the text builds: a clip appears on its own track as each line is done
  const tracks = [['Shots', WARM, 0.2, 0.9], ['Narration', GREEN, 0.34, 0.9], ['Keys', GOLD, 0.44, 0.9], ['Code card', BLUE, 0.52, 0.9], ['Cuts', INK, 0.62, 0.9]];
  tracks.forEach(([n, c, a, b], i) => { const y = 330 + i * 104; txt(n, 1180, y + 40, 34, INK, LEFT, true); fill(PANEL); noStroke(); rect(1180, y + 68 - 20, 600, 24, 8); const w = 600 * ease(seg(p, a, a + 0.12)); fill(c); rect(1180, y + 68 - 20, w, 24, 8); });
  const bp = ease(seg(p, 0.7, 0.9)); fill(bp > 0 ? GOLD : '#2a2723'); stroke(GOLD); strokeWeight(4); rect(1180, 810, 600, 100, 20); txt('voice, render, share', 1480, 860, 50, bp > 0 ? BG : MUTED, CENTER, true);`);

const WRAP = sketch(`
  const words = [['Record', WARM, 'every stroke, word and move'], ['Summary', GOLD, 'a first cut'], ['Cut', GREEN, 'split, delete, ripple'], ['Curves', BLUE, 'any diamond is a key'], ['Cameras', '#e8884a', 'shots, cuts, depth, a vertical short'], ['Render', INK, 'frame by frame, with sound']];
  words.forEach(([w, c, s], i) => { const u = ease(seg(p, 0.06 + i * 0.1, 0.16 + i * 0.1)); drawingContext.globalAlpha = u; txt(w, 160 + (1 - u) * 60, 170 + i * 120, 84, c, LEFT, true); txt(s, 700 + (1 - u) * 60, 170 + i * 120, 48, MUTED); drawingContext.globalAlpha = 1; });
  const e = ease(seg(p, 0.7, 1)); drawingContext.globalAlpha = e; txt('10:00', 330, 940, 110, MUTED, CENTER, true); txt('→', 640, 940, 100, INK, CENTER); txt('2:00', 950, 940, 110, GREEN, CENTER, true); txt('→', 1250, 940, 100, INK, CENTER); txt('1:00', 1560, 940, 110, BLUE, CENTER, true); drawingContext.globalAlpha = 1;`);

const BOARDS = [['Raw take', RAW], ['Record', RECORD], ['Summary', SUMMARY], ['Cut', CUT], ['Curves', CURVES], ['Cameras', CAMERA], ['Effects', EFFECTS], ['Short', SHORT], ['Render', RENDER], ['Spec', SPEC], ['Wrap', WRAP]]
  .map(([n, code]) => ({ title: `Condense · ${n}`, kind: 'p5', code, width: 1920, height: 1080, ground: '#14120f' }));
const B = n => `Condense · ${n}`;
const run = (board, over) => ({ board, set: [{ board, name: 'p', from: 0, to: 1, ease: 'linear', ...(over || {}) }] });

export const FILM = {
  id: 'condense-explainer',
  title: 'From a long recording to a short film',
  summary: 'Record yourself teaching for ten minutes, then use the studio to cut it to the essence and to a one minute short: takes, Summary, editing, curves, cameras, effects and the frame by frame render. About four minutes.',
  credit: 'Made with Artist Model Studio, with the studio’s own timeline, curves, cameras and renderer. Diagrams and voice are generated.',
  camera: { w: 1920, h: 1080 },
  fps: 25,
  lead: 300,
  boardGap: 3600,
  boards: BOARDS,
  beats: [
    { ...run(B('Raw take')), dur: 9000, chapter: 'The case', title: 'From a long recording to a short film', sub: 'the studio, made with the studio', titleDur: 2400, pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      cuts: [{ at: 0.5, camera: 2, pose: { z: 1.14, dx: 0.04, dy: -0.02 }, to: { z: 1.19, dx: 0.06, dy: -0.02 } }, { at: 0.82, camera: 1, pose: { z: 1.01, dx: 0.00, dy: 0.05 } }] },
    { ...run(B('Raw take')), pose: { z: 1.00, dx: 0.00, dy: 0.00 }, to: { z: 1.03, dx: -0.01, dy: 0.01 },
      say: 'You record yourself for ten minutes, drawing and talking. Most of it is waiting, retakes and tangents. What you want is the essence, about two minutes, and a one minute short for a feed. Here is how the studio gets there.', hold: 800,
      cuts: [{ at: 0.45, camera: 2, pose: { z: 1.16, dx: -0.07, dy: 0.00 }, to: { z: 1.11, dx: 0.00, dy: 0.01 } }, { at: 0.75, camera: 1, pose: { z: 1.02, dx: 0.00, dy: 0.08 } }] },
    { ...run(B('Record')), chapter: 'Record a take', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'It starts with a take. Press record and the studio writes down what you do: your strokes, your voice, your actions and the camera, each on its own track of the Timeline. Nothing is a video yet. It is a score that the studio can play, and edit.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.25, dx: 0.14, dy: -0.17 }, to: { z: 1.25, dx: 0.14, dy: -0.17 } }, { at: 0.42, camera: 1, pose: { z: 1.04, dx: 0.05, dy: 0.05 }, to: { z: 1.01, dx: 0.05, dy: 0.05 } }, { at: 0.8, camera: 2, pose: { z: 1.16, dx: 0.04, dy: 0.05 } }] },
    { ...run(B('Summary')), chapter: 'Summary', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'The Summary button makes a first cut for you. Waiting is capped. Retakes are dropped. The narration is kept at reading pace and the drawing is brisk. And it ends on a hold, so the result can be seen. It is never longer than half the original.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.22, dx: 0.13, dy: -0.15 } }, { at: 0.32, camera: 1, pose: { z: 1.02, dx: -0.02, dy: 0.05 }, to: { z: 1.08, dx: -0.05, dy: 0.07 } }, { at: 0.72, camera: 2, pose: { z: 1.11, dx: -0.05, dy: 0.13 } }] },
    { ...run(B('Cut')), chapter: 'Cut it', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'Then edit as you would in any editor. Put the playhead where a pause begins and press X to split. Split again where it ends. Select the piece and delete it, and the ripple closes the gap, so the clips after it move up. Ten minutes becomes six, and then you keep going.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.19, dx: -0.13, dy: 0.00 } }, { at: 0.42, camera: 1, pose: { z: 1.00, dx: 0.00, dy: 0.02 } }, { at: 0.55, camera: 2, pose: { z: 1.16, dx: -0.05, dy: 0.09 } }, { at: 0.78, camera: 1, pose: { z: 1.02, dx: 0.02, dy: 0.00 } }] },
    { ...run(B('Curves')), chapter: 'Curves', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'Anything with a diamond beside it can be animated. Press the diamond and the value gets a key at the playhead. Then drag the key: the curve bends, and the number changes with it. Here a camera zoom goes from one times to two point six times, and the frame follows the curve.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.16, dx: 0.14, dy: 0.02 }, to: { z: 1.22, dx: 0.14, dy: 0.00 } }, { at: 0.5, camera: 1, pose: { z: 1.05, dx: -0.09, dy: 0.05 } }, { at: 0.78, camera: 2, pose: { z: 1.14, dx: 0.13, dy: 0.00 } }] },
    { ...run(B('Cameras')), chapter: 'Cameras', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'Rather than show the whole canvas, place cameras. A camera looks at a board or a region of the canvas. A shot is that camera over a stretch of time, with its own zoom and shifts. Cut between cameras and the Program shows whichever is on air. Boards at different depths move at different speeds when the camera moves, which is parallax.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.14, dx: -0.11, dy: -0.02 }, to: { z: 1.19, dx: -0.09, dy: 0.00 } }, { at: 0.45, camera: 1, pose: { z: 1.11, dx: 0.13, dy: -0.02 } }, { at: 0.7, camera: 2, pose: { z: 1.14, dx: 0.11, dy: 0.11 } }] },
    { ...run(B('Effects')), chapter: 'Effects', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'Effects live on the same curves. This is depth of field: a shot has a focus and a blur, and each board is blurred by how far it is from the focus. Drag Focus from the near flower to the far hills, or key it, and you have a pull focus. There are fades, a lightbox that lights what is over it, and onion skin to see the frames around the playhead while you edit.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.19, dx: -0.07, dy: 0.17 } }, { at: 0.5, camera: 1, pose: { z: 1.08, dx: 0.00, dy: -0.05 } }, { at: 0.75, camera: 2, pose: { z: 1.16, dx: 0.09, dy: -0.05 } }] },
    { ...run(B('Short')), chapter: 'The short', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'The one minute short is the same take with a second camera. Make it vertical, nine by sixteen, and point it at the part that matters, pushing in as the idea lands. You render the cut from one camera and the short from the other. One recording, two films.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.16, dx: -0.09, dy: 0.00 } }, { at: 0.5, camera: 1, pose: { z: 1.02, dx: 0.07, dy: 0.02 } }, { at: 0.75, camera: 2, pose: { z: 1.16, dx: 0.09, dy: 0.02 } }] },
    { ...run(B('Render')), chapter: 'Render', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'Render plays the take frame by frame, so every frame is made on purpose: the cameras and their keyframes, the sketches stepped to that moment, the media, and the voice and sound mixed apart and joined. The result is the same each time, and it comes out as an MP4.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.16, dx: 0.00, dy: -0.13 } }, { at: 0.55, camera: 1, pose: { z: 1.00, dx: 0.00, dy: 0.02 } }, { at: 0.78, camera: 2, pose: { z: 1.16, dx: 0.09, dy: 0.09 } }] },
    { ...run(B('Spec')), chapter: 'A student asks', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'And what if a student wants an explainer on a new topic? A film is also just data. Each beat names a board, a camera, some words, a control to move and a block of code to show. The studio lays it out as a take, voices it, and renders it. Edit the take, or edit the text, and render again.', hold: 800,
      cuts: [{ at: 0.28, camera: 2, pose: { z: 1.14, dx: -0.10, dy: -0.01 } }, { at: 0.5, camera: 1, pose: { z: 1.00, dx: 0.02, dy: 0.02 } }, { at: 0.72, camera: 2, pose: { z: 1.16, dx: 0.10, dy: 0.02 } }] },
    { ...run(B('Wrap')), chapter: 'The method', pose: { z: 1.00, dx: 0.00, dy: 0.00 },
      say: 'Record. Summarise. Cut. Curve. Place the cameras. Render. Ten minutes of footage in, a two minute cut and a one minute short out.', hold: 1500,
      cuts: [{ at: 0.5, camera: 2, pose: { z: 1.11, dx: 0.00, dy: 0.14 } }, { at: 0.8, camera: 1, pose: { z: 1.00, dx: 0.00, dy: 0.00 } }] }
  ]
};
