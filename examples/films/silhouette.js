/**
 * The silhouette film, explained as a film (src/workbench/film.js): it opens with the short film itself (the lesson's moon
 * board on its own clock from 0), then goes back through how it was made, a step at a time, in the order a paper film is made:
 * light, paper, a hinge, a puppet, a set, a camera, a walk, filming, the look of film. Each step is a shot of the lesson's own
 * sketch, the code that does it lit beside the picture, and a control moved by keyframes where that shows the idea.
 * Pictures are the lesson's own (original); Lotte Reiniger's films are only named (examples/lessons/reiniger/RIGHTS.md).
 */
const T = { cover: 'The silhouette film · cover', light: '1.1 · The lightbox', paper: '1.2 · A piece of paper', hinge: '1.3 · A hinge', puppet: '1.4 · The puppet', set: '1.5 · A set in layers', cams: '1.6 · Two cameras', walk: '1.7 · A walk', stop: '3.1 · Stop motion', look: '3.2 · The look of film', moon: '4.1 · The moon' };
const RIGHT = { z: 1.35, dx: -0.12, dy: 0 };   // the picture sits to the right of the frame, the code to the left

export const FILM = {
  id: 'silhouette-explainer',
  title: 'The silhouette film, made in code',
  summary: 'How a paper film is made, and how the same method runs in a browser: a lightbox, cut paper, hinges, a puppet, a set, a camera, a walk, and the look of film. About four minutes.',
  credit: 'Pictures and code: the silhouette lesson, Artist Model Studio (originals). Lotte Reiniger and The Adventures of Prince Achmed (1926) are cited, not shown.',
  lesson: 'reiniger',
  camera: { w: 1280, h: 960 },
  fps: 25,
  beats: [
    // ---- the short film first -----------------------------------------------------------------------------------------------
    { board: T.moon, dur: 4800, label: 'Wide', pose: { z: 1, dx: 0, dy: 0 }, to: { z: 1.35, dx: -0.12, dy: 0.12 }, title: 'The silhouette film', sub: 'made in code', titleDur: 2400 },
    { board: T.moon, dur: 4400, label: 'The reach', pose: { z: 1.5, dx: 0.02, dy: -0.12 }, to: { z: 1.2, dx: 0.08, dy: -0.1 } },
    { board: T.moon, dur: 3800, label: 'Sky', pose: { z: 1, dx: 0, dy: -0.04 }, to: { z: 1, dx: 0, dy: 0.04 } },
    // ---- how it is made -----------------------------------------------------------------------------------------------------
    { board: T.cover, chapter: 'A film of paper', pose: { z: 1, dx: 0, dy: 0 }, to: { z: 1.12, dx: 0, dy: 0 },
      say: 'That was a film cut out of black paper, and it was not drawn: it was made the way Lotte Reiniger made hers, a hundred years ago. Paper, hinges, a light behind, and a camera. Here the paper is code, and we will rebuild it in seven steps.', hold: 900 },
    { board: T.light, chapter: 'Light', pose: RIGHT, to: { ...RIGHT, z: 1.5 }, set: [{ board: T.light, name: 'edge', from: 0.9, to: 0.1, over: 3200 }],
      say: 'First, light. In a silhouette film everything is light that gets through, or does not. The lightbox is a glowing plane, bright in the middle and falling off toward the edges. Watch the edge darken as we turn one number.',
      code: { board: T.light, from: 'const glow', to: 'return new THREE.CanvasTexture', note: 'a gradient is the light', before: 1, after: 3 }, hold: 800 },
    { board: T.paper, chapter: 'Paper', pose: RIGHT, set: [{ board: T.paper, name: 'size', from: 0.8, to: 2.4, over: 3500 }],
      say: 'Second, paper. A piece of paper is a closed outline, a handful of points, filled with black. Make the outline bigger and the paper is bigger: that is all a shape is.',
      code: { board: T.paper, from: 'const OUTLINES', to: 'hand: [', note: 'a shape is a list of points', before: 0, after: 2 }, hold: 800 },
    { board: T.hinge, chapter: 'A hinge', pose: RIGHT, to: { ...RIGHT, z: 1.5 }, set: [{ board: T.hinge, name: 'joints', from: true, to: false, at: 3600, over: 200 }, { board: T.hinge, name: 'joints', from: false, to: true, at: 6600, over: 200 }],
      say: 'Third, a hinge. Each piece of the puppet hangs from the one before it, and turns about a pin. Turn the pins off and the pieces look joined; turn them on and you see where it bends.',
      code: { board: T.hinge, from: 'const group = []', to: 'group.push(g)', note: 'each piece hangs from the last', before: 0, after: 2 }, hold: 800 },
    { board: T.puppet, chapter: 'The puppet', pose: RIGHT, to: { ...RIGHT, z: 1.5 },
      say: 'Fourth, the puppet. A head in profile, a body, arms and legs: about fourteen pieces, each hinged to its parent. Move the body and everything hanging from it moves too.',
      code: { board: T.puppet, from: 'This puppet is a stick figure', to: 'its far end', note: 'pieces hinged to pieces', before: 0, after: 4 }, hold: 800 },
    { board: T.set, chapter: 'A set in layers', pose: { z: 1, dx: 0, dy: 0 }, to: { z: 1, dx: 0.05, dy: 0 },
      say: 'Fifth, a set, in layers. Hills behind, reeds in front, the puppet between them. Each layer is another sheet of paper at another depth.',
      code: { board: T.set, from: 'the set: layers of cut paper', to: 'foreground grasses', note: 'sheets at different depths', before: 0, after: 1, side: 'left' }, hold: 800 },
    { board: T.cams, chapter: 'Two cameras', pose: { z: 1, dx: 0, dy: 0 }, to: { z: 1.2, dx: -0.1, dy: 0 },
      say: 'Sixth, two cameras. The set is flat sheets, and the camera decides how they look. One camera is the film: it sees what the audience sees. The other is for inspecting, to look at the sheets from the side.', hold: 900 },
    { board: T.walk, chapter: 'A walk', pose: RIGHT, set: [{ board: T.walk, name: 'walk', from: 0, to: 1, over: 6500, ease: 'linear' }],
      say: 'Seventh, a walk. Animation is a pose that changes. Here one number, from zero to one, is a whole step: the hinges swing, the feet lift, the figure travels.',
      code: { board: T.walk, from: 'let walk', note: 'one number, one step', before: 0, after: 3 }, hold: 900 },
    { board: T.stop, chapter: 'Filming it', pose: RIGHT, to: { ...RIGHT, z: 1.5 },
      say: 'Then filming. A silhouette film is not made by moving a puppet: it is made by photographing it, a frame at a time. Pose, photograph, pose a little differently, photograph again. Played back, it moves.', hold: 900 },
    { board: T.look, chapter: 'The look of film', pose: { z: 1, dx: 0, dy: 0 }, to: { z: 1.1, dx: 0.05, dy: 0 },
      say: 'And last, the look of film. The scene is drawn to a picture, and a shader changes every pixel of it: a little grain, a little flicker, a dark corner. The paper stops looking like code.', hold: 900 },
    { board: T.cover, chapter: 'The method', pose: { z: 1.1, dx: 0, dy: 0 }, to: { z: 1, dx: 0, dy: 0 },
      say: 'A group, a hinge, a sheet of paper, a light behind it, and a camera. That was the method, in a few hundred lines.', hold: 1200 },
    { title: 'The silhouette film', sub: 'Artist Model Studio · pictures and code are originals · Lotte Reiniger is cited, not shown', dur: 3500, board: T.cover, pose: { z: 1, dx: 0, dy: 0 } }
  ]
};
