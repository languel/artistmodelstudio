/**
 * Three.js for body and sound, explained as a film (src/workbench/film.js): the lesson's four steps, each one a shot of the
 * lesson's own live three.js sketch with the lines that make it lit beside the picture: a cube (the whole program, read a
 * line at a time), a body made of joints, the body in metres, and a model that moves (a fox loaded from a file).
 * Pictures and code are the lesson's own; the fox model is CC0 (rig and clips CC-BY, credited in the lesson's bibliography).
 */
const T = { cover: 'Three.js for body and sound · cover', cube: '0.1 · A spinning cube', controls: '0.3 · Controls in code', joints: '1.1 · A body in the scene', metres: '1.3 · The body in metres', fox: '1.4 · A model that moves' };
const RIGHT = { z: 1.2, dx: -0.1, dy: 0 };

export const FILM = {
  id: 'threejs-explainer',
  title: 'Three.js for body and sound',
  summary: 'A body on the screen, as numbers: a spinning cube read line by line, a body made of joints, the body in metres, and a fox that moves. About four minutes.',
  credit: 'Pictures and code: the three.js lesson, Artist Model Studio. Fox model: CC0 (PixelMannen); rig and animation CC-BY (see the lesson bibliography).',
  lesson: 'threejs',
  camera: { w: 1280, h: 960 },
  fps: 25,
  beats: [
    { board: T.cover, chapter: 'Where we are going', pose: { z: 1.7, dx: 0, dy: 0.1 }, to: { z: 2.1, dx: 0, dy: 0.1 }, title: 'Three.js for body and sound', sub: 'a body, as numbers', titleDur: 2600,
      say: 'Three dot j s, for body and sound. A body, on the screen, as numbers: joints, in metres, thirty times a second. This fox is where we are going: a model loaded from a file, with a skeleton, and clips of movement we can play by name.', hold: 900 },
    { board: T.cube, chapter: 'A scene from nothing', pose: RIGHT, to: { ...RIGHT, z: 1.35 },
      say: 'We start at the smallest program there is, a cube. First, a renderer: the part that draws. It uses the graphics card, and we tell it how big the picture is.',
      code: { from: 'const renderer', to: 'renderer.setSize', note: 'the part that draws', before: 1, after: 2 }, hold: 800 },
    { board: T.cube, pose: RIGHT,
      say: 'Then a scene, which is empty space, and a camera, which is a point of view. Forty five degrees wide, the shape of the board, and placed a little above the floor, four and a half metres back.',
      code: { from: 'const scene', to: 'camera.position.set', note: 'a scene and a point of view', before: 0, after: 1 }, hold: 800 },
    { board: T.cube, pose: RIGHT, to: { ...RIGHT, dx: -0.08, z: 1.5 },
      say: 'Light. Without it, a surface that takes light would be black. A sun, from up and to the right, and a soft light from everywhere, so no side is lost.',
      code: { from: 'const sun', to: 'AmbientLight', note: 'light', before: 0, after: 1 }, hold: 800 },
    { board: T.cube, pose: RIGHT, to: { ...RIGHT, z: 1.4 },
      say: 'And a mesh: a shape, a box one metre each way, and a surface, an amber material that takes the light. Nothing is drawn until it is added to the scene.',
      code: { from: 'const cube', to: 'scene.add(cube', note: 'a shape and a surface', before: 0, after: 1 }, hold: 800 },
    { board: T.cube, pose: RIGHT, to: { ...RIGHT, z: 1.3 },
      say: 'Every frame, the browser calls this loop, sixty times a second. It turns the cube by an angle that grows with the time, and draws the scene. That is all animation is: the same program, run again, with a number that has changed.',
      code: { from: 'cube.rotation.set', note: 'a number that has changed', before: 4, after: 2 }, hold: 1000 },
    { board: T.controls, chapter: 'Controls in code', pose: RIGHT, set: [{ board: T.controls, name: 'speed', from: 0.3, to: 3.2, over: 6000 }],
      say: 'A comment beside a value turns it into a control. Here is the speed of the spin: slow, and then fast. The same program, with one number changed, and a slider is a number that a hand can change.',
      code: { from: 'const speed', to: 'const colors', note: 'a comment makes a slider', before: 0, after: 1 }, hold: 800 },
    { board: T.joints, chapter: 'A body made of joints', pose: RIGHT, to: { ...RIGHT, z: 1.35 },
      say: 'Next, a body. Every frame we ask for the joints: where is each one now? Each joint is a sphere, and it moves to where its joint is. Watch a wrist go round, and the sphere follows the joint exactly.',
      code: { from: 'dots[n].position.copy', note: 'a sphere for every joint', before: 4, after: 2 }, hold: 900 },
    { board: T.joints, pose: { z: 1.1, dx: 0, dy: 0 }, to: { z: 1.3, dx: 0.04, dy: -0.04 },
      say: 'Each bone is a cylinder, stretched from one joint to the next, so the bones stretch and turn with the joints. And it is in three dimensions: a camera can go all the way round it.',
      code: { from: 'between(rods[i]', note: 'a bone between two joints', before: 2, after: 2, side: 'right' }, hold: 900 },
    { board: T.metres, chapter: 'In metres', pose: RIGHT, to: { ...RIGHT, z: 1.3 },
      say: 'Now the same body in metres. Along each bone, forty points, with a little scatter, so the body becomes a cloud, coloured by height. And beside it, a ruler two metres tall, with a tick every half metre.',
      code: { from: 'const per = 40', to: 'const ruler', note: 'a cloud and a ruler', before: 0, after: 3 }, hold: 800 },
    { board: T.metres, pose: { z: 1.1, dx: 0, dy: 0 }, to: { z: 1.3, dx: 0, dy: 0 },
      say: 'The dancer is about a metre and three quarters tall, and we can say so, because the numbers are in metres, and a metre means the same thing in every program that reads them.', hold: 1200 },
    { board: T.fox, chapter: 'A model that moves', pose: { z: 1.8, dx: 0, dy: 0.1 }, to: { z: 2.2, dx: 0.04, dy: 0.1 },
      say: 'And last, a model that moves. This fox is loaded from a file, with a skeleton inside it, and clips of movement: a walk, and a run. We play a clip by name, and the same joints, the same metres, drive a creature that was made by someone else.', hold: 1200 },
    { board: T.cover, chapter: 'A body, as numbers', pose: { z: 2.1, dx: 0, dy: 0.1 }, to: { z: 1.7, dx: 0, dy: 0.1 }, title: 'A body, as numbers', sub: 'a renderer, a scene, a camera, light, a shape, a loop', titleDur: 4000,
      say: 'A renderer, a scene, a camera, some light, a shape, and a loop. With those, a cube, a body, a ruler and a fox. The rest of the course is what to feed them.', hold: 1500 }
  ]
};
