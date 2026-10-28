/**
 * Lessons: whole lectures as scenes of frames (examples/lessons). A lesson is data (sections of boards with code, notes
 * and a bibliography); the builder (examples/lessons/sampling/scene.js) makes it a scene. The palette (`/lesson`), the
 * Docs and the walkthroughs all build them from here.
 */
export const LESSONS = [
  { id: 'sampling', title: 'Pointillism and Expressionism, by sampling', summary: 'Seurat, Munch and Muybridge as sources: sample a picture, decide what to draw there. Diagrams of the eye, ten examples, a body as a source.', languages: ['studio', 'p5', 'expl'] },
  { id: 'sampling-expl', title: 'Pointillism and Expressionism, by sampling (p5.js expl)', summary: 'The sampling lesson with barebones, copy-pasteable p5.js code under pseudocode for each art demo.', languages: ['studio', 'p5', 'expl'] },
  { id: 'diffusion', title: 'Diffusion models: from noise to picture', summary: 'Six diagrams (forward and reverse, the schedule, training, sampling, latent space, the score) and five p5.js simulations, with a bibliography.', languages: ['studio'] }
];

/** Build a lesson as a new scene. language: 'studio', 'p5' or 'expl' (barebones p5.js sketch). Returns the number of boards. */
export async function buildLesson(app, id = 'sampling', { language = 'studio', expl = false } = {}) {
  const isExpl = id === 'sampling-expl' || id.endsWith('-expl') || language === 'expl' || expl;
  const baseId = id.replace(/-expl$/, '');
  const [{ buildLessonScene }, lesson] = await Promise.all([
    import('../../examples/lessons/sampling/scene.js'),
    baseId === 'diffusion' ? import('../../examples/lessons/diffusion/lesson.js').then(m => m.LESSON) : null
  ]);
  return buildLessonScene(app, { language, expl: isExpl, ...(lesson ? { lesson } : {}) });
}

/**
 * Web lessons: whole pages that run beside the studio (not scenes of boards). The three.js series for body and sound
 * lives in lessons/threejs and is served at <base>/lessons/threejs/. No model files are stored in the repository:
 * `npm run lessons:models` fetches them, and the series index shows which are present.
 */
export const THREEJS_LESSONS = [
  { n: '00', page: '00-cube', title: 'A spinning cube', summary: 'The whole program: scene, camera, renderer, one cube.' },
  { n: '01', page: '01-anatomy', title: 'Anatomy of a scene', summary: 'Scene, camera, objects, materials, light.' },
  { n: '02', page: '02-body', title: 'A body in the scene', summary: 'MediaPipe landmarks live, from clips or recorded.', models: true },
  { n: '03', page: '03-pinboard', title: 'Pinboard', summary: 'Person mask and monocular depth drive a pin screen.', models: true },
  { n: '04', page: '04-fusion', title: 'The body in metres', summary: 'Depth and pose fused into one metric space with a point cloud.', models: true },
  { n: '05', page: '05-laser-harp', title: 'Laser harp', summary: 'Beams in the air at measured distances; fingertips pluck notes (after Jean-Michel Jarre).', models: true },
  { n: '06', page: '06-body-drum', title: 'Body drum', summary: 'Pads on your own body; hand hits, claps and stomps make drum sounds (after Laurie Anderson).', models: true },
  { n: '07', page: '07-triadic', title: 'Triadic costumes', summary: 'Costumes hung on a moving body, with motion cleaning for performance (after Schlemmer).', models: true },
  { n: '08', page: '08-unicursal', title: 'One line', summary: 'A face or figure drawn without lifting the pen (after Picasso).', models: true },
  { n: '09', page: '09-ghost', title: 'Paint marks', summary: 'Hands, feet and head leave strokes in space you can orbit (after Ghostcatching).', models: true },
  { n: '⇩', page: 'tutorial-export', title: 'Tutorial: one file you can double-click', summary: 'Bundling, embedding, esbuild and blob URLs explained.' }
];

/** The URL of a three.js lesson page (or the index, with no page), honouring the site's base path. */
export const threejsUrl = page => `${(import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/')}lessons/threejs/${page ? page + '.html' : 'index.html'}`;

/** Open a three.js lesson (a number like 5 or '05', a page name, or nothing for the index) in a new tab. */
export function openThreejsLesson(arg = '') {
  const a = String(arg).trim();
  const hit = THREEJS_LESSONS.find(l => a && (l.n === a.padStart(2, '0') || l.page === a || l.page.includes(a)));
  const url = threejsUrl(hit?.page);
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  return url;
}
