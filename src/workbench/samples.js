/**
 * The studio's own samples: reference pictures, test clips and stock footage (examples/media). Loaded on the
 * studio's first run only; an embedded editor (src/embed/) never imports this, so none of it is in its build.
 */
import { bundledReferences } from '../ui/ReferencePanel.js';

// Stock samples kept out of the repository (examples/media/local/, with samples.json: sources and licences).
const LOCAL_FILES = import.meta.glob('../../examples/media/local/*.{gif,mp4,webm}', { query: '?url', import: 'default', eager: true });
const LOCAL_LIST = import.meta.glob('../../examples/media/local/samples.json', { import: 'default', eager: true });
const localSamples = () => (Object.values(LOCAL_LIST)[0] || []).map(s => ({ ...s, folder: 'Samples', tags: ['sample', /^Public/.test(s.license) ? 'public-domain' : 'licensed'], url: LOCAL_FILES[`../../examples/media/local/${s.file}`] })).filter(s => s.url);

export function seedSamples(assetStore) {
  assetStore.seed(bundledReferences()).catch(() => {});
  // Test clips: a countdown (frame number, time, a sweep each second) as a 30 fps video and a 10 fps GIF.
  import('./streamSamples.js').then(m => assetStore.seedStreams(m.STREAM_SAMPLES)).catch(() => {});
  assetStore.seedClips([
    { id: 'countdown-30fps', title: 'countdown 30fps', url: new URL('../../examples/media/countdown-30fps.mp4', import.meta.url).href, doc: '10 s at 30 fps: each frame shows its number and time' },
    { id: 'countdown-10fps', title: 'countdown 10fps', url: new URL('../../examples/media/countdown-10fps.gif', import.meta.url).href, doc: '10 s at 10 fps (a GIF, 100 ms a frame)' },
    { id: 'muybridge-horse', title: 'muybridge horse', folder: 'Samples', tags: ['sample', 'public-domain'], url: new URL('../../examples/media/muybridge-horse.gif', import.meta.url).href, doc: 'A race horse, 1.5 s GIF (300×200)', artist: 'Eadweard Muybridge', date: '1887', source: 'https://commons.wikimedia.org/wiki/File:Muybridge_race_horse_animated.gif', license: 'Public domain' },
    ...localSamples()
  ]).catch(() => {});
}
