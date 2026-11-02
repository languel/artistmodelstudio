/**
 * The three.js lesson as an explainer: a script that performs it (see workbench/script.js). The first test of the explainer format:
 * one slide per example, each with its narration, the code that does the work highlighted, a diagram or formula where the maths is,
 * and the sketch doing what the words say. Written so a local model can run it: every target is a board title or a line of code.
 */
const SL = { cube: '0.1 · A spinning cube', joints: '1.1 · A body in the scene', metres: '1.3 · The body in metres', fox: '1.4 · A model that moves' };
const FOX_CODE = '1.4 · A model that moves · code';

export const EXPLAINER = {
  id: 'threejs-explainer',
  title: 'Explainer: three.js for body and sound',
  summary: 'The three.js lesson as an explainer, with narration: a cube, a body as joints, the body in metres, and a model that moves (a fox from the glTF samples).',
  lesson: 'threejs',
  cues: [
    { goto: SL.cube, say: 'A three.js scene is a few objects and a loop. This is the whole program: a scene, a camera, a renderer, and one mesh that turns.',
      select: { code: '0.1 · A spinning cube · code', from: 'const cube', to: 'const cube' }, hold: 800 },
    { goto: SL.cube, say: 'The loop is the last part of the code: every frame, turn the cube, then draw the scene as the camera sees it.',
      select: { code: '0.1 · A spinning cube · code', from: 'renderer.setAnimationLoop', to: 'renderer.setAnimationLoop' }, hold: 800 },
    { goto: SL.joints, say: 'A body is numbers: a few dozen joints, in metres. A tracker gives them thirty times a second; here a dancer made of code does.',
      restart: SL.joints, wait: 400 },
    { goto: SL.joints, say: 'Each joint is a sphere, and each bone is a cylinder stretched from one joint to the next.',
      select: { code: '1.1 · A body in the scene · code', from: 'names.forEach', to: 'names.forEach' }, hold: 800 },
    { goto: SL.metres, say: 'A picture has no scale. A list of joints in metres does. Put two points a known distance apart and every other length is a number.',
      formula: { on: SL.metres, at: [0.97, 0.12], align: 'right', tex: 'd = \\lVert a - b \\rVert \\quad \\text{metres}' }, hold: 600 },
    { goto: SL.metres, say: 'The ruler is two metres of line with a tick every half metre, so the body is drawn in the same units as the room.',
      select: { code: '1.3 · The body in metres · code', from: 'const ruler', to: 'const ruler' }, hold: 600 },
    { goto: SL.fox, say: 'A model is a file: its mesh, its skeleton and its clips of movement, in one glb. The loader gives them back, and the mixer plays one clip by its name.',
      restart: SL.fox, select: { code: FOX_CODE, from: 'new GLTFLoader().load', to: 'new GLTFLoader().load' }, hold: 600 },
    { goto: SL.fox, say: 'Walk.', set: { on: SL.fox, name: 'clip', value: 'Walk' }, wait: 2500 },
    { goto: SL.fox, say: 'Run. The change cross-fades: the mixer blends the old clip into the new one over four tenths of a second.',
      set: { on: SL.fox, name: 'clip', value: 'Run' }, select: { code: FOX_CODE, from: 'crossFadeTo', to: 'crossFadeTo' }, wait: 2500 },
    { goto: SL.fox, say: 'This fox is from the glTF sample models: the model is public domain, and its rig and clips are credited in the bibliography. A dancer would be loaded the same way.', hold: 1200 }
  ]
};
