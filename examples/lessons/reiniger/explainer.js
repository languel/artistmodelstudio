/**
 * The silhouette film as an explainer: a script that performs the whole lesson, in the order of its sections (see workbench/script.js).
 * One cue or two for each board, each with its narration, the code that does the work highlighted, a diagram or formula where the
 * maths is, and the sketch doing what the words say. The hinge (1.3) is performed in full by HINGE in script.js; here it is only named.
 * Written so a local model can run it: every target is a board title, a line of code, or a control the board declares.
 */
const T = {
  route: '1.0 · The route', lightbox: '1.1 · The lightbox', paper: '1.2 · A piece of paper', hinge: '1.3 · A hinge',
  puppet: '1.4 · The puppet', set: '1.5 · A set in layers', cameras: '1.6 · Two cameras', walk: '1.7 · A walk',
  grain: '2.1 · Paper fibre and film grain', lamp: '2.2 · A lamp, a mask', stop: '3.1 · Stop motion', look: '3.2 · The look of film',
  moon: '4.1 · The moon'
};
const code = title => `${title} · code`;
const notes = title => `${title} · notes`;
// The formulas sit in the upper right of each board, where the sketch has room.
const AT = [0.97, 0.12];

export const FILM_EXPLAINER = {
  id: 'reiniger-explainer',
  title: 'Explainer: the silhouette film, performed',
  summary: 'The whole silhouette film lesson as an explainer: the scene built piece by piece, texture and light, the photographing of a film, and a short film of keyframes.',
  lesson: 'reiniger',
  cues: [
    // 1 · Build the scene
    { goto: T.route, say: 'A silhouette film is built in the order Reiniger made it: light, paper, a hinge, a puppet, a set, two cameras, and a walk.',
      select: { code: code(T.route), from: 'const steps', to: 'steps.forEach' }, hold: 800 },
    { goto: T.lightbox, say: 'Everything in the film is light that gets through or does not. This glowing plane is the lightbox: bright in the middle, darker at the edges.',
      select: { code: code(T.lightbox), from: 'const lightbox = new THREE.Mesh', to: 'scene.add(lightbox);' }, hold: 800 },
    { say: 'Change the tint, and the film is dyed another colour. Reiniger dyed her scenes this way.', set: { on: T.lightbox, name: 'tint', value: '#8fb8d8' }, wait: 1500 },
    { goto: T.paper, say: 'A piece of paper is a shape: a closed outline, filled black. The points are its corners, and the mesh is the outline made flat.',
      select: { pseudo: notes(T.paper), line: 1 }, hold: 800 },
    { say: 'Smooth turns the same points from a polygon, a cut with scissors, into a rounded outline drawn through them.',
      set: { on: T.paper, name: 'smooth', value: true }, select: { code: code(T.paper), from: 'const outline = smooth', to: 'const outline = smooth' }, wait: 1500 },
    { goto: T.hinge, say: 'A hinge is a group inside a group. This is the hinge of lesson 1.3, performed in full by its own script.',
      select: { code: code(T.hinge), from: 'const bones', to: 'group[0].rotation.z = 0.6' }, hold: 800 },
    { goto: T.puppet, say: 'A puppet is a table of parts. Each has a parent, the place its hinge sits, its shape, and how far it may turn.',
      select: { code: code(T.puppet), from: 'const PARTS = [', to: 'const PARTS = [' }, hold: 800 },
    { say: 'Then a loop makes a hinge for each part, and every frame sets one angle per part. Posing the puppet is changing those angles.',
      select: { pseudo: notes(T.puppet), line: 2 }, hold: 800 },
    { goto: T.set, say: 'The set is more paper at other depths: tissue hills far back, darker hills nearer, the ground, and grasses in front of the puppet.',
      select: { code: code(T.set), from: 'const ridge = (y', to: 'const ridge = (y' }, hold: 800 },
    { say: 'Each hill is a sine wave, with a smaller wave on top, so the outline is not regular.',
      formula: { on: T.set, at: AT, align: 'right', tex: 'y(x) = y_0 + A\\sin(fx + \\varphi) + 0.35A\\sin(2.7fx + 2\\varphi)' }, hold: 1200 },
    { goto: T.cameras, say: 'Two cameras. The film camera is orthographic: no perspective, so the layers do not shift. The eye camera orbits, and shows how the layers stack in depth.',
      set: { on: T.cameras, name: 'view', value: 'inspect' }, wait: 2200 },
    { say: 'Back to the film camera: this is the one the audience sees.', set: { on: T.cameras, name: 'view', value: 'film' }, wait: 1200 },
    { goto: T.walk, say: 'A walk is a few hinge angles driven by one sine wave. The thighs swing in opposite directions, and the shins bend as the leg lifts.',
      select: { code: code(T.walk), from: 'function stride(t)', to: 'function stride(t)' }, hold: 800 },
    { say: 'Here k is the size of the walk times the sine of the time. Thigh A takes 0.55 k, and thigh B takes the negative of it.',
      formula: { on: T.walk, at: AT, align: 'right', tex: 'k = w\\,\\sin(4t),\\qquad \\theta_{\\text{thigh A}} = 0.55\\,k,\\quad \\theta_{\\text{thigh B}} = -0.55\\,k' }, hold: 1200 },
    { say: 'Turn the walk on, and the puppet strolls across the set.', set: { on: T.walk, name: 'walk', value: 1 }, wait: 3000 },

    // 2 · Light, paper and texture
    { goto: T.grain, say: 'A texture is a picture laid on a surface. Fibre is noise on the tissue hills, so the light comes through them unevenly, like paper held to a window.',
      set: { on: T.grain, name: 'fibre', value: 0.9 }, wait: 1800 },
    { say: 'Grain is a sheet of black specks in front of the camera, shifted a little every frame so it boils like film.',
      select: { code: code(T.grain), from: 'const grainSheet = new THREE.Mesh', to: 'grainSheet.position.z = 5;' }, set: { on: T.grain, name: 'grain', value: 0.7 }, wait: 1800 },
    { goto: T.lamp, say: 'A mask is a texture used as transparency. This black sheet has a soft hole in it: a pool of lamplight, which follows the pointer.',
      select: { code: code(T.lamp), from: 'const maskTex = (() => {', to: 'const maskTex = (() => {' }, hold: 800 },
    { say: 'The darker the night, the more the paper hides. Here it is nearly black, and the lamp is a small hole in it.',
      set: { on: T.lamp, name: 'dark', value: 0.95 }, wait: 1800 },

    // 3 · Filming it
    { goto: T.stop, say: 'A silhouette film is made by photographing a pose, a frame at a time. Press Space to take a photograph, and the frame joins the strip below.',
      key: 'Space', wait: 900 },
    { say: 'Each photograph is a copy of the picture, kept in the strip. The previous frame stays faint on top, so you can see how far the puppet has moved.',
      select: { code: code(T.stop), from: 'const shoot = () =>', to: 'frames.push(url);' }, hold: 1200 },
    { goto: T.look, say: 'The look of film: the scene is drawn to a picture, and a shader adds grain, flicker, weave, dark corners and dust, one pixel at a time.',
      select: { code: code(T.look), from: 'const target = new THREE.WebGLRenderTarget', to: 'const target = new THREE.WebGLRenderTarget' }, hold: 800 },
    { say: 'Grain adds a random value to each pixel, and the value is new in every frame.',
      formula: { on: T.look, at: AT, align: 'right', tex: 'c \\leftarrow c + g\\,(h - \\tfrac12),\\qquad h \\in [0,1] \\text{ random}' }, set: { on: T.look, name: 'grain', value: 0.6 }, wait: 1800 },

    // 4 · A short film
    { goto: T.moon, say: 'A short film: a figure sits on a dune and watches the moon rise, then tries to reach it. The film is a table of keyframes, each a pose and a time.',
      select: { code: code(T.moon), from: 'const DURATION = 13', to: 'const DURATION = 13' }, hold: 1000 },
    { say: 'Between two keyframes the pose eases in and out. This curve turns a straight line of time into a slow start and a slow stop.',
      select: { code: code(T.moon), from: 'const ease = u =>', to: 'const ease = u =>' },
      formula: { on: T.moon, at: AT, align: 'right', tex: '\\operatorname{ease}(u) = u^2\\,(3 - 2u)' }, hold: 1200 },
    { say: 'Track finds the two keyframes either side of the time, and mixes the poses between them.',
      select: { code: code(T.moon), from: 'const track = t =>', to: 'const track = t =>' }, hold: 1000 },
    { say: 'On threes, the puppet is moved, photographed, and held for a few frames. Four a second is halting, which is how he thinks.',
      set: { on: T.moon, name: 'fps', value: 4 }, wait: 2500 },
    { say: 'Every part of this film is one of the first boards: a group, a hinge, a sheet of paper, and a light behind it. The method, in a few hundred lines.',
      set: { on: T.moon, name: 'fps', value: 8 }, hold: 1500 }
  ]
};
