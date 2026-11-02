/**
 * The three.js lesson as an explainer (see workbench/script.js), in the pacing of the silhouette film's (docs/explainer-protocol.md):
 * for each idea, open the pseudocode and select the line that says it, select the code that does it, show what it does to the picture
 * (drag the camera, point at the place that changes, change a control), and stay on it long enough to see, before the cut.
 * Four slides: a cube (the whole program), a body as joints, the body in metres, and a model that moves (the fox, loaded from a file).
 *
 * Places on a sketch are fractions of the board: the camera looks at (0, 1 m, 0) from 4.6 m, so 1 m is about 0.25 of the board's
 * height, x to the right and y up from the middle ([0.5, 0.5] is the point 1 m up, in the middle).
 */
const T = {
  cover: 'Three.js for body and sound', coverPic: 'Three.js for body and sound · cover',
  cube: '0.1 · A spinning cube', joints: '1.1 · A body in the scene', metres: '1.3 · The body in metres', fox: '1.4 · A model that moves'
};
const code = t => `${t} · code`, notes = t => `${t} · notes`;
const open = (t, say, extra) => ({ goto: t, click: { summary: notes(t) }, say, hold: 500, ...extra });                     // fold open the pseudocode
const idea = (t, line, say, extra) => ({ say, select: { pseudo: notes(t), line }, hold: 700, ...extra });                    // select the line that says it
const how = (t, from, to, say, extra) => ({ say, select: { code: code(t), from, to: to ?? from }, hold: 700, ...extra });   // select the code that does it
const show = (say, extra) => ({ say, wait: 1800, hold: 900, ...extra });                                                    // the effect, and time to see it
const AT = [0.97, 0.12];                                                                                                     // where a formula sits

export const EXPLAINER = {
  id: 'threejs-explainer',
  title: 'Explainer: three.js for body and sound',
  summary: 'The three.js lesson as an explainer: a cube, a body as joints, the body in metres, and a model that moves, a fox loaded from a file.',
  lesson: 'threejs',
  fade: 2000,
  cues: [
    // ---- the cover --------------------------------------------------------------------------------------------------------
    { goto: T.cover, say: 'Three.js for body and sound. A body, on the screen, as numbers: joints, in metres, thirty times a second.',
      point: { on: T.coverPic, at: [0.5, 0.6] }, hold: 1500 },
    { say: 'This fox is where we are going: a model loaded from a file, with a skeleton, and clips of movement that we can play by name.',
      point: { on: T.coverPic, at: [[0.5, 0.78], [0.5, 0.45], [0.42, 0.55]], dwell: 1000 }, hold: 1500 },
    { say: 'We start at the smallest program there is, a cube, and go there in four steps: a cube, a body made of joints, a body in metres, and the fox.', hold: 2200 },

    // ---- 0.1 a spinning cube: the whole set-up, line by line ---------------------------------------------------------------
    { goto: T.cube, say: 'Step one: a scene from nothing. This is the whole program, and we will read all of it: a renderer, a scene, a camera, some light, a shape, and a loop.',
      point: { on: T.cube, at: [0.5, 0.5] }, hold: 1800 },
    open(T.cube, 'First the idea, in four lines. Then every line of code behind it.'),
    how(T.cube, 'import * as THREE', null, 'The first line brings in three.js. Everything it can do is under the name THREE.', { hold: 1200 }),
    how(T.cube, 'import { OrbitControls }', null, 'And a small helper from its add-ons: orbit controls, which let a hand move the camera. We will use it in a minute.', { hold: 1500 }),
    how(T.cube, 'const renderer = new THREE.WebGLRenderer', null, 'The renderer is the part that draws. It uses the graphics card, through WebGL, and anti-aliasing to smooth the edges.', { hold: 1500 }),
    how(T.cube, 'renderer.setSize', null, 'We tell it how big the picture is: the size of this board. And what colour the empty space is: near black.', { hold: 1200 }),
    show('Everything the program draws will be on this picture.', { point: { on: T.cube, at: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], dwell: 500 }, wait: 1200 }),
    how(T.cube, 'document.body.append(renderer.domElement)', null, 'The renderer made a canvas, and this line puts it on the page. Nothing shows until it is on the page.', { hold: 1800 }),
    idea(T.cube, 1, 'A scene is empty space. Everything we add will go in it.'),
    how(T.cube, 'const scene = new THREE.Scene', null, 'One line makes it. It is only a list, for now an empty one.', { hold: 1800 }),
    idea(T.cube, 2, 'A camera is a point of view, looking at the scene.'),
    how(T.cube, 'const camera = new THREE.PerspectiveCamera', null, 'A perspective camera, like an eye: forty five degrees wide, the shape of the board, and it sees from ten centimetres to a hundred metres.', { hold: 1500 }),
    how(T.cube, 'camera.position.set', null, 'Here it is placed: a little above the floor, four and a half metres back.', { hold: 1500 }),
    how(T.cube, 'const controls = new OrbitControls', 'controls.target.set', 'The controls let a hand move the camera, and they orbit around a target: a point one metre up, where the cube is.', { hold: 1200 }),
    show('Drag, and the point of view moves around the target. The cube stays where it is: only the camera has moved.',
      { drag: { on: T.cube, ms: 3600, path: [[0.45, 0.55], [0.55, 0.5], [0.68, 0.46], [0.6, 0.5], [0.4, 0.52], [0.3, 0.5]] }, wait: 2600 }),
    how(T.cube, 'const sun = new THREE.DirectionalLight', 'scene.add(new THREE.AmbientLight', 'Light. Without it, a surface that takes light would be black. A sun, from up and to the right, and a soft light from everywhere, so no side is lost.', { hold: 1500 }),
    show('Here is the sun\'s side, bright, and the shaded side, dim but not black: that is the soft light.',
      { point: { on: T.cube, at: [[0.53, 0.44], [0.47, 0.57]], dwell: 1400 }, wait: 1500 }),
    idea(T.cube, 3, 'A mesh is a shape, the geometry, with a surface, the material.'),
    how(T.cube, 'const cube = new THREE.Mesh', null, 'A box, one metre each way, with an amber standard material, the kind that takes the light.', { hold: 1000 }),
    how(T.cube, 'scene.add(cube', null, 'And now it is in the scene, with a grid on the floor to see where the floor is. Nothing is drawn until it is added.', { hold: 1500 }),
    show('The shape, and its surface.', { point: { on: T.cube, at: [[0.5, 0.5], [0.45, 0.44], [0.56, 0.56]], dwell: 900 }, wait: 1500 }),
    idea(T.cube, 4, 'Every frame, turn the mesh, and then draw the scene as the camera sees it.'),
    how(T.cube, 'let tick', null, 'tick is a function that does nothing yet. Each sketch fills it in with what should happen every frame.', { hold: 1500 }),
    how(T.cube, 'renderer.setAnimationLoop', null, 'The loop. The browser calls it for every frame, sixty times a second: run tick with the time, update the controls, and draw the scene as the camera sees it.', { hold: 2200 }),
    how(T.cube, 'cube.rotation.set', null, 'And this is our tick: turn the cube by an angle that grows with the time.', { hold: 1200 }),
    show('That is all animation is: the same program, run again, with a number that has changed.',
      { point: { on: T.cube, at: [0.5, 0.5] }, wait: 6000 }),

    // ---- 1.1 a body in the scene ------------------------------------------------------------------------------------------
    { goto: T.joints, say: 'Step two: a body. A body is numbers: a few dozen joints, in metres. A tracker gives them thirty times a second.',
      point: { on: T.joints, at: [[0.5, 0.33], [0.5, 0.45], [0.5, 0.6]], dwell: 900 }, hold: 1500 },
    { say: 'Here a dancer made of code stands in for the tracker. The picture does not care which: it is only joints.', hold: 2200 },
    open(T.joints, 'The idea, in three lines.'),
    idea(T.joints, 1, 'Every frame, ask for the joints: where is each one now?'),
    how(T.joints, 'const j = dancer(t)', null, 'A tracker would answer from a picture. This answers from a formula.', { hold: 1500 }),
    idea(T.joints, 2, 'Each joint is a sphere, and it moves to where its joint is.'),
    how(T.joints, 'dots[n].position.copy', null, 'Copy the joint\'s place onto its sphere.', { hold: 700 }),
    show('The wrists are yellow. Watch one go round, and the sphere follows the joint exactly.',
      { point: { on: T.joints, at: [[0.62, 0.5], [0.7, 0.42], [0.66, 0.55]], dwell: 1100 }, wait: 2400 }),
    idea(T.joints, 3, 'Each bone is a cylinder, stretched from one joint to the next.'),
    how(T.joints, 'between(rods[i]', null, 'A cylinder placed halfway between two joints, as long as the distance between them, and turned to line up.', { hold: 800 }),
    show('The bones stretch and turn with the joints.', { point: { on: T.joints, at: [[0.57, 0.4], [0.64, 0.46]], dwell: 1000 }, wait: 2000 }),
    show('And it is in three dimensions: drag around the figure, and you go round it.',
      { drag: { on: T.joints, ms: 3800, path: [[0.35, 0.6], [0.45, 0.58], [0.58, 0.55], [0.7, 0.52]] }, wait: 2600 }),

    // ---- 1.3 the body in metres -------------------------------------------------------------------------------------------
    { goto: T.metres, say: 'Step three: the body in metres. A picture has no scale. A list of joints, in metres, does.',
      point: { on: T.metres, at: [0.5, 0.5] }, hold: 1500 },
    open(T.metres, 'The idea, in three lines.'),
    idea(T.metres, 1, 'Along each bone, put forty points, with a little scatter, so the bone becomes a cloud.'),
    how(T.metres, 'const per = 40', null, 'Forty points for each bone.', { hold: 1500 }),
    show('The body as a cloud of points, coloured by height.', { point: { on: T.metres, at: [[0.5, 0.35], [0.5, 0.5], [0.5, 0.68]], dwell: 900 }, wait: 1800 }),
    idea(T.metres, 3, 'Beside it, a ruler two metres long, with a tick every half metre.'),
    how(T.metres, 'const ruler = new THREE.Group', null, 'A line, two metres tall, and a tick for each half metre.', { hold: 800 }),
    show('The ruler: two metres. The dancer is about a metre and three quarters tall, and we can say so, because the numbers are in metres.',
      { point: { on: T.metres, at: [[0.23, 0.75], [0.25, 0.5], [0.23, 0.26]], dwell: 1100 }, wait: 1800 }),
    { say: 'The distance between any two joints is one number. This is what makes an air instrument possible: a hand is a known distance from the body.',
      formula: { on: T.metres, at: AT, align: 'right', tex: 'd = \\lVert a - b \\rVert \\quad \\text{metres}' }, hold: 3200 },

    // ---- 1.4 a model that moves -------------------------------------------------------------------------------------------
    { goto: T.fox, say: 'Step four: a model that moves. Until now we built the body ourselves, from spheres and cylinders. A model is a body somebody else made.',
      point: { on: T.fox, at: [0.5, 0.6] }, hold: 1800 },
    open(T.fox, 'The idea, in four lines.'),
    idea(T.fox, 1, 'A model is a file. It holds three things: the mesh, the skeleton, and the clips that move its joints.'),
    how(T.fox, 'new GLTFLoader().load', null, 'The loader fetches the file, a glb, and hands the three things back.', { hold: 1800 }),
    { say: 'Watch it load. The file is fetched, and the fox appears, walking: the walk has all the weight to begin with.', restart: T.fox, wait: 3200, hold: 1000 },
    idea(T.fox, 2, 'Scale it to one point two metres tall, and stand it on the floor.'),
    how(T.fox, 'const box = new THREE.Box3', 'fox.position.y', 'Measure the box around it, scale it by one point two over its height, and lift it until its lowest point is the floor.', { hold: 1200 }),
    show('The head, and the feet on the floor. A metre and a fifth, whatever size the file had.',
      { point: { on: T.fox, at: [[0.5, 0.42], [0.5, 0.76]], dwell: 1300 }, wait: 1500 }),
    idea(T.fox, 3, 'The mixer plays all the clips at once, each with a weight. The picture is their mix.'),
    how(T.fox, 'mixer = new THREE.AnimationMixer', 'for (const a of gltf.animations)', 'The mixer, and one action for each clip in the file, all of them playing.', { hold: 1500 }),
    how(T.fox, 'actions.Survey?.setEffectiveWeight', 'actions.Run?.setEffectiveWeight', 'Every frame, a weight for each: how much of that clip is in the picture. The weights come from three sliders, survey, walk and run.', { hold: 1500 }),
    show('Now only the walk has any weight. The fox walks.', { point: { on: T.fox, at: [0.5, 0.55] }, wait: 3500 }),
    show('Turn survey up, with the walk still on. The fox does both at once: a mix of the two.', { set: { on: T.fox, name: 'survey', value: 1 }, wait: 4500 }),
    show('Take the walk away. Only survey is left: the fox stands, and looks around.', { set: { on: T.fox, name: 'walk', value: 0 }, wait: 4500 }),
    show('Bring the run up, and survey down: from looking around, into a run.', { set: { on: T.fox, name: 'run', value: 1 }, wait: 3000 }),
    show('And survey down.', { set: { on: T.fox, name: 'survey', value: 0 }, wait: 4500 }),
    show('Half a walk, with the run: a jog, in between. Any mix is a new movement, from the same three clips.', { set: { on: T.fox, name: 'walk', value: 0.5 }, wait: 5000 }),
    { say: 'A cross-fade, which blends one clip into another, is only this: one weight going down, while another goes up.', hold: 2600 },
    idea(T.fox, 4, 'And the mixer moves forward by the time that has passed.'),
    how(T.fox, 'mixer.update(dt)', null, 'One line, in the loop, and the skeleton follows the clip.', { hold: 1800 }),
    { say: 'This fox is from the glTF sample models. The model is public domain, and its skeleton and clips are credited in the bibliography. A dancer, or a person, would be loaded in the same way.', hold: 2500 }
  ]
};
