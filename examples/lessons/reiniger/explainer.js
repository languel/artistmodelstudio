/**
 * The silhouette film as an explainer: a script that performs the whole lesson, in the order of its sections (see workbench/script.js).
 *
 * The pattern of every step is the one of lesson 1.3: open the pseudocode and select the line that says the idea, select the code that
 * does it, then show what it does to the picture (move a hinge, change a control, point at the place that changes), and stay on the result
 * long enough to see it, before the cut. Cause, then effect, then a pause. The hinge (1.3) is HINGE from script.js, played in full.
 * Written so a local model can run it: every target is a board title, a line of code, a control the board declares, or a place on a sketch.
 */
import { HINGE } from './script.js';

const T = {
  cover: 'The silhouette film', coverPic: 'The silhouette film · cover',
  route: '1.0 · The route', lightbox: '1.1 · The lightbox', paper: '1.2 · A piece of paper',
  puppet: '1.4 · The puppet', set: '1.5 · A set in layers', cameras: '1.6 · Two cameras', walk: '1.7 · A walk',
  grain: '2.1 · Paper fibre and film grain', lamp: '2.2 · A lamp, a mask', stop: '3.1 · Stop motion', look: '3.2 · The look of film',
  moon: '4.1 · The moon'
};
const code = t => `${t} · code`, notes = t => `${t} · notes`;
const AT = [0.97, 0.12];            // where a formula sits: the upper right of a board
const U = { frame: 7 };              // the sketches' camera: 7 units from top to bottom, y up
const rad = d => (d * Math.PI) / 180;
const arc = ([cx, cy], r, from, to, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const a = rad(from + ((to - from) * i) / n); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

// The steps of a step:
const open = (t, say, extra) => ({ goto: t, click: { summary: notes(t) }, say, hold: 500, ...extra });                     // fold open the pseudocode
const idea = (t, line, say, extra) => ({ say, select: { pseudo: notes(t), line }, hold: 700, ...extra });                    // select the line that says it
const how = (t, from, to, say, extra) => ({ say, select: { code: code(t), from, to: to ?? from }, hold: 700, ...extra });   // select the code that does it
const show = (say, extra) => ({ say, wait: 1800, hold: 900, ...extra });                                                    // the effect, and time to see it

// The puppet of 1.4: the shoulder is at (-1.2, 0.82); the upper arm hangs from it, turned 0.5 rad.
const SHOULDER = [-1.2, 0.82];

export const FILM_EXPLAINER = {
  id: 'reiniger-explainer',
  title: 'Explainer: the silhouette film, performed',
  summary: 'The whole silhouette film lesson as an explainer: each step opens its pseudocode, selects the code, and shows what it does to the picture.',
  lesson: 'reiniger',
  fade: 2000,
  cues: [
    // ---- the cover --------------------------------------------------------------------------------------------------------
    { goto: T.cover, say: 'This is the silhouette film: a lesson in three.js, and in how a paper film was made. In 1926, Lotte Reiniger cut a feature film out of black paper.',
      point: { on: T.coverPic, space: U, at: [-1.2, -1.2] }, hold: 1500 },
    { say: 'Here the paper is code. The puppet, the hills, the reeds and the moon are all drawn by a program written for this lesson.',
      point: { on: T.coverPic, space: U, at: [[-1.2, -1.0], [-3.0, -2.4], [2.8, 1.6]], dwell: 900 }, hold: 1200 },
    { say: 'We will build it in seven steps, in the order she made it: light, paper, a hinge, a puppet, a set, a camera, and a walk.', hold: 2000 },

    // ---- 1.0 the route ----------------------------------------------------------------------------------------------------
    { goto: T.route, say: 'Seven small programs. Each keeps everything the one before had, and adds one idea.',
      select: { code: code(T.route), from: 'const steps', to: 'steps.forEach' }, hold: 2500 },

    // ---- 1.1 the lightbox -------------------------------------------------------------------------------------------------
    { goto: T.lightbox, say: 'Step one: light. Everything in a silhouette film is light that gets through, or does not. This glowing plane is the lightbox.',
      point: { on: T.lightbox, space: U, at: [0, 0] }, hold: 1500 },
    open(T.lightbox, 'Here is the idea, in three lines.'),
    idea(T.lightbox, 2, 'Its picture is white in the middle, and darker toward the edges.'),
    how(T.lightbox, 'const glow', 'return new THREE.CanvasTexture', 'In code, that is a gradient drawn on a canvas, and used as the plane\'s picture.', { hold: 1500 }),
    show('Bright here, in the middle, and darker out at the corner.', { point: { on: T.lightbox, space: U, at: [[0, 0], [-4.1, 3.0]], dwell: 1200 } }),
    show('Raise the edge value, and the corners come up.', { set: { on: T.lightbox, name: 'edge', value: 0.9 }, point: { on: T.lightbox, space: U, at: [-4.1, 3.0] }, wait: 2200 }),
    show('Lower it, and they fall into shadow.', { set: { on: T.lightbox, name: 'edge', value: 0.05 }, point: { on: T.lightbox, space: U, at: [-4.1, 3.0] }, wait: 2200 }),
    idea(T.lightbox, 3, 'Then the tint: the film was dyed, a colour for each scene.'),
    how(T.lightbox, 'lightbox.material.color.set(tint)', null, 'The tint multiplies the light.', { hold: 600 }),
    show('A blue dusk.', { set: { on: T.lightbox, name: 'tint', value: '#8fb8d8' }, wait: 2600 }),
    show('A warm lamp.', { set: { on: T.lightbox, name: 'tint', value: '#f0b868' }, wait: 2600 }),

    // ---- 1.2 paper --------------------------------------------------------------------------------------------------------
    { goto: T.paper, say: 'Step two: paper. A piece of paper is a shape, a closed outline, filled black.', point: { on: T.paper, space: U, at: [0, 0] }, hold: 1500 },
    open(T.paper, 'The idea, in three lines.'),
    idea(T.paper, 1, 'It starts as a list of points: the corners of the piece, in order.'),
    how(T.paper, 'const OUTLINES', 'leaf:', 'In code, a handful of points for each piece.', { hold: 1200 }),
    show('Change the points, and it is another piece: a hand.', { set: { on: T.paper, name: 'piece', value: 'hand' }, point: { on: T.paper, space: U, at: [0, 0] }, wait: 2400 }),
    show('A leaf.', { set: { on: T.paper, name: 'piece', value: 'leaf' }, wait: 2200 }),
    show('And a slipper again.', { set: { on: T.paper, name: 'piece', value: 'slipper' }, wait: 1800 }),
    idea(T.paper, 2, 'Join the points with straight lines, as scissors would. Or let a smooth curve pass through them.'),
    how(T.paper, 'const outline = smooth', null, 'One line decides which.', { hold: 600 }),
    show('Straight cuts, and now the same points, smoothed.', { set: { on: T.paper, name: 'smooth', value: true }, point: { on: T.paper, space: U, at: [[1.5, 0.8], [-1.4, 0.4]], dwell: 800 }, wait: 2200 }),
    idea(T.paper, 3, 'Fill the shape with black, put it in front of the light, and it is a silhouette.'),
    how(T.paper, 'const cutout', 'scene.add(cutout);', 'A flat black mesh, in front of the lightbox.', { hold: 2200 }),

    // ---- 1.3 the hinge (performed in full by its own script) --------------------------------------------------------------
    ...HINGE.cues,

    // ---- 1.4 the puppet ---------------------------------------------------------------------------------------------------
    { goto: T.puppet, say: 'Step four: a puppet. Fourteen pieces, each hinged to the one before.',
      point: { on: T.puppet, space: U, at: [[-1.2, 1.6], [-1.2, 0.3], [-1.2, -1.9]], dwell: 900 }, hold: 1200 },
    open(T.puppet, 'Its idea, in four lines.'),
    idea(T.puppet, 1, 'A puppet is a table. For each piece: its parent, where its hinge is, its shape, and how far it may turn.'),
    how(T.puppet, 'const PARTS = [', null, 'Here is the table.', { hold: 1800 }),
    idea(T.puppet, 2, 'A loop makes a hinge for each piece, and puts it inside its parent\'s.'),
    how(T.puppet, 'p.parent ? node', 'p.parent ? node', 'The group of the piece goes inside the group of its parent.', { hold: 1200 }),
    show('Drag the arm, and it turns about the shoulder. The forearm and the hand go along with it.',
      { drag: { on: T.puppet, space: U, ms: 2600, path: [...arc(SHOULDER, 0.9, -62, 35, 16)] }, wait: 2200 }),
    { say: 'Fourteen pieces, and each is only a turn about its hinge.', hold: 2200 },

    // ---- 1.5 a set in layers ----------------------------------------------------------------------------------------------
    { goto: T.set, say: 'Step five: a set, in layers. More paper, at other depths.', hold: 1500 },
    open(T.set, 'The idea, in four lines.'),
    idea(T.set, 1, 'A hill is an outline: a height, a wave, and everything below it filled in.'),
    how(T.set, 'const ridge = (y', null, 'This function makes the outline of a hilltop.', { hold: 1000 }),
    { say: 'It is a sine wave, with a smaller wave on top, so the outline is never regular.',
      formula: { on: T.set, at: AT, align: 'right', tex: 'y(x) = y_0 + A\\sin(fx + \\varphi) + 0.35A\\sin(2.7fx + 2\\varphi)' }, hold: 2800 },
    idea(T.set, 2, 'The far hills are tissue paper, so the light shows through them.'),
    how(T.set, 'const far = cut(', null, 'Far back, and translucent.', { hold: 600 }),
    show('Here, the tissue hills: dim, because the light has to pass through.', { point: { on: T.set, space: U, at: [3.2, -1.2] }, wait: 1800 }),
    idea(T.set, 3, 'Nearer hills are darker, and the ground is nearer still.'),
    how(T.set, 'const mid = cut(', 'const ground = cut(', 'Two more sheets, each at its own depth.', { hold: 600 }),
    show('These nearer hills, and the ground in front of them.', { point: { on: T.set, space: U, at: [[-3.3, -2.5], [0.5, -3.3]], dwell: 1200 }, wait: 1200 }),
    idea(T.set, 4, 'And grasses in front of the puppet.'),
    how(T.set, 'const reeds = new THREE.Group', null, 'Reeds, nearer than the puppet.', { hold: 600 }),
    show('The reeds in the foreground.', { point: { on: T.set, space: U, at: [2.6, -3.0] }, wait: 2400 }),

    // ---- 1.6 two cameras --------------------------------------------------------------------------------------------------
    { goto: T.cameras, say: 'Step six: two cameras. The set is flat sheets, and the camera decides how they look.', hold: 1500 },
    open(T.cameras, 'The idea, in three lines.'),
    idea(T.cameras, 1, 'The film camera looks straight on, with no perspective, so the layers never shift against each other.'),
    how(T.cameras, 'const film = new THREE.OrthographicCamera', null, 'An orthographic camera.', { hold: 1200 }),
    idea(T.cameras, 2, 'The eye camera is a normal one, with perspective, and you can orbit it.'),
    how(T.cameras, 'const eye = new THREE.PerspectiveCamera', null, 'A perspective camera.', { hold: 800 }),
    show('Switch to the eye camera.', { set: { on: T.cameras, name: 'view', value: 'inspect' }, wait: 2000 }),
    show('Drag, and the set turns: it is a pile of flat sheets, one behind the other.',
      { drag: { on: T.cameras, ms: 3600, path: [[0.5, 0.55], [0.58, 0.5], [0.68, 0.46], [0.62, 0.52], [0.42, 0.5], [0.36, 0.46]] }, wait: 2600 }),
    show('And back to the film camera, which is what the audience sees.', { set: { on: T.cameras, name: 'view', value: 'film' }, wait: 2400 }),

    // ---- 1.7 a walk -------------------------------------------------------------------------------------------------------
    { goto: T.walk, say: 'Step seven: a walk. Animation is a pose that changes.', hold: 1500 },
    open(T.walk, 'The idea, in four lines.'),
    idea(T.walk, 1, 'One number, k, is the size of the walk times the sine of the time. It swings between plus and minus.'),
    how(T.walk, 'function stride(t)', 'const k =', 'In code, that is the first line of stride.', { hold: 600 }),
    { say: 'Here is k, over time.', formula: { on: T.walk, at: AT, align: 'right', tex: 'k = w\\,\\sin(4t)' }, hold: 2400 },
    idea(T.walk, 2, 'One thigh swings by k, and the other by minus k, so the legs are in opposite phase.'),
    how(T.walk, 'thighA: 0.55', null, 'The two thighs.', { hold: 600 }),
    show('Turn the walk on, and the puppet strolls across the set.', { set: { on: T.walk, name: 'walk', value: 1 }, point: { on: T.walk, space: U, at: [-1.2, -1.9] }, wait: 5000 }),
    show('A smaller number, a smaller walk.', { set: { on: T.walk, name: 'walk', value: 0.3 }, wait: 4000 }),

    // ---- 2.1 paper fibre and film grain -----------------------------------------------------------------------------------
    { goto: T.grain, say: 'Light, paper and texture. A texture is a picture laid on a surface, and here it is how paper and film show themselves.', hold: 1500 },
    open(T.grain, 'The idea, in four lines.'),
    idea(T.grain, 1, 'Both are made of noise: a square picture of random greys.'),
    how(T.grain, 'const speckle', null, 'A canvas, with one random value for each pixel.', { hold: 1200 }),
    idea(T.grain, 2, 'Fibre is that noise, laid over the far hills.'),
    how(T.grain, 'far.material.map = speckle', null, 'The tissue hills take the noise as their texture.', { hold: 600 }),
    show('Little fibre: the tissue is even.', { set: { on: T.grain, name: 'fibre', value: 0.05 }, point: { on: T.grain, space: U, at: [3.2, -1.2] }, wait: 2200 }),
    show('More fibre: the light comes through unevenly, like paper held to a window.', { set: { on: T.grain, name: 'fibre', value: 1 }, wait: 2800 }),
    idea(T.grain, 3, 'Grain is noise too, as a sheet of black specks in front of the camera.'),
    how(T.grain, 'const grainSheet = new THREE.Mesh', 'grainSheet.position.z = 5;', 'A black sheet, nearer than everything.', { hold: 600 }),
    show('A little grain, then a lot. Every frame the noise is shifted, so it boils like film.', { set: { on: T.grain, name: 'grain', value: 0.85 }, wait: 4200 }),

    // ---- 2.2 a lamp, a mask -----------------------------------------------------------------------------------------------
    { goto: T.lamp, say: 'A mask is a texture used as transparency. It says where something shows, and where it does not.', hold: 1500 },
    open(T.lamp, 'The idea, in three lines.'),
    idea(T.lamp, 1, 'A picture that is black in the middle, white at the edges, and soft between.'),
    how(T.lamp, 'const maskTex', null, 'A radial gradient, drawn on a canvas.', { hold: 1200 }),
    idea(T.lamp, 2, 'A black sheet in front of the camera uses it as its transparency: a soft hole.'),
    how(T.lamp, 'const night = new THREE.Mesh', null, 'The sheet.', { hold: 600 }),
    idea(T.lamp, 3, 'Every frame, put the hole under the pointer.'),
    how(T.lamp, 'night.position.set', null, 'The sheet follows the pointer.', { hold: 600 }),
    show('Move the pointer, and the pool of lamplight follows it.',
      { drag: { on: T.lamp, ms: 5200, path: [[0.2, 0.5], [0.35, 0.3], [0.6, 0.35], [0.8, 0.55], [0.6, 0.75], [0.35, 0.65], [0.2, 0.5]] }, wait: 1800 }),
    show('Make the night darker, and the lamp matters more.', { set: { on: T.lamp, name: 'dark', value: 0.98 }, wait: 3000 }),

    // ---- 3.1 stop motion --------------------------------------------------------------------------------------------------
    { goto: T.stop, say: 'Filming it. A silhouette film is not made by moving a puppet: it is made by photographing it, a frame at a time.', hold: 1500 },
    open(T.stop, 'The idea, in four lines.'),
    idea(T.stop, 1, 'Frames is a list, empty to begin with.'),
    idea(T.stop, 2, 'On Space, draw the scene once, copy the picture, and add it to the list.'),
    how(T.stop, 'const shoot', 'frames.push(url);', 'One function: draw, copy the picture, keep it.', { hold: 1200 }),
    show('Pose the puppet. Space photographs it, and the frame joins the strip below.',
      { drag: { on: T.stop, space: U, ms: 2600, path: [...arc(SHOULDER, 0.9, -62, 20, 12)] }, wait: 2400 }),
    idea(T.stop, 3, 'The last frame stays faintly on top, so you see how far you moved: an onion skin.'),
    { say: 'Pose, photograph, pose a little differently, photograph again. Played back, it moves.', hold: 2600 },

    // ---- 3.2 the look of film ---------------------------------------------------------------------------------------------
    { goto: T.look, say: 'The look of film. The scene is drawn to a picture, and a shader changes every pixel of it.', hold: 1500 },
    open(T.look, 'The idea, in four lines.'),
    idea(T.look, 1, 'A picture in memory, that the scene is drawn into.'),
    how(T.look, 'const target = new THREE.WebGLRenderTarget', null, 'A render target.', { hold: 900 }),
    idea(T.look, 2, 'Then, for each pixel: shift it, add grain, flicker, and dark corners, and a speck of dust now and then.'),
    how(T.look, 'c += grain', null, 'Grain adds a random value to each pixel, a new one each frame.', { hold: 600,
      formula: { on: T.look, at: AT, align: 'right', tex: 'c \\leftarrow c + g\\,(h - \\tfrac12)' } }),
    show('More grain.', { set: { on: T.look, name: 'grain', value: 0.7 }, wait: 3000 }),
    how(T.look, 'c *= 1.0 - vignette', null, 'And the corners, made darker.', { hold: 600 }),
    show('A strong vignette.', { set: { on: T.look, name: 'vignette', value: 1 }, wait: 3000 }),
    how(T.look, 'c *= 1.0 + flicker', null, 'Flicker: the whole picture brighter and darker, a little, by chance.', { hold: 600 }),
    show('And a lot of flicker, like an old projector.', { set: { on: T.look, name: 'flicker', value: 0.25 }, wait: 4000 }),

    // ---- 4.1 the moon -----------------------------------------------------------------------------------------------------
    { goto: T.moon, say: 'A short film, with everything so far. A figure sits on a dune and watches the moon rise, then tries to reach it.', hold: 1500 },
    open(T.moon, 'The idea, in four lines.'),
    idea(T.moon, 1, 'The film is a table of keyframes: a pose and a time, for each.'),
    how(T.moon, 'const KEYS', null, 'Sit, look, lean, stand, reach, lunge.', { hold: 1800 }),
    how(T.moon, 'const ease =', null, 'Between two keyframes, the pose eases in and out.', { hold: 600,
      formula: { on: T.moon, at: AT, align: 'right', tex: '\\operatorname{ease}(u) = u^2\\,(3 - 2u)' } }),
    { say: 'This curve turns a straight line of time into a slow start and a slow stop.', hold: 2600 },
    how(T.moon, 'const track =', null, 'Track finds the two keyframes either side of the time, and mixes the poses between them.', { hold: 1800 }),
    { say: 'Now watch it from the start.', restart: T.moon, hold: 600 },
    { say: 'He sits, and looks up. The moon rises. He stands, reaches, and cannot.', wait: 9000, hold: 900 },
    { say: 'He lunges after it, and the light goes with it, until only his hinges are left, among the stars.', wait: 6000, hold: 900 },
    idea(T.moon, 3, 'The puppet moves only on each exposure: here, eight times a second.'),
    show('Slower, four a second: halting, hesitant.', { set: { on: T.moon, name: 'fps', value: 4 }, wait: 7000 }),
    show('And on threes again.', { set: { on: T.moon, name: 'fps', value: 8 }, wait: 3000 }),
    { say: 'A group, a hinge, a sheet of paper, a light behind it, and a camera. That was the method, in a few hundred lines.', hold: 2500 }
  ]
};
