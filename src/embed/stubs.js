/**
 * Stands in for the studio's subsystems in the lean embed build (vite.embed.config.js lists which modules map here).
 * The lean editor never uses them: scenes, recording and takes, walkthroughs, sources, gestures, playlists, document
 * and program boards, the assistant's artists, Markdown pages, and the panels for all of these. The classes are inert
 * objects (every method is a no-op), so the places in the core that mention them keep working.
 */

/** An object whose every method does nothing, with the few members the core reads given real values. */
const inert = (own = {}) => new Proxy(own, {
  get: (t, k) => (k in t ? t[k] : k === 'then' || typeof k === 'symbol' ? undefined : () => undefined),
});
const nothing = () => {};

// panels
export const mountScenes = nothing, mountAssistant = nothing, mountGenerate = nothing, mountDecide = nothing,
  mountDocs = nothing, mountTimeline = nothing, mountSources = nothing, mountGestures = nothing, mountScript = nothing,
  mountProcess = nothing, mountStages = nothing, mountSettings = nothing, mountShortcuts = nothing, mountCode = nothing,
  mountHistory = nothing, mountLog = nothing;
export const docsTopicList = () => [];
export class AssetPanel { constructor() { throw new Error('The Assets panel is not part of the lean editor'); } }

// subsystems
export class Scenes { constructor() { return inert({ list: { active: null }, all: () => [], docOf: () => null }); } }
export class Recorder { constructor() { return inert({ recording: false }); } }
export class TakePlayer { constructor() { return inert({ take: null }); } }
export class Walkthroughs { constructor() { return inert({ list: () => [] }); } }
export const WALKTHROUGHS = [];
export const walkthroughFromTake = () => null;
export class Sources { constructor() { return inert({ list: [], entries: () => [], def: () => undefined, view: () => null }); } }
export class Gestures { constructor() { return inert({ map: new Map(), recent: () => [] }); } }
export const DEFAULT_GESTURES = [];
export class Playlists { constructor() { return inert(); } }
export class BoardFrames { constructor() { return inert({ get: () => undefined, perf: () => '' }); } }
export const filesOf = () => [];
export const startDiagnostics = () => () => '';
export const SOURCE_DEMOS = [];
export class ArtistRegistry { constructor() { return inert({ get: () => undefined, filter: () => [], values: () => [], has: () => false }); } }
export const defaultArtistRegistry = () => new ArtistRegistry();

// Markdown pages and exports
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const sanitizeHtml = s => esc(s);
export const frontMatter = s => ({ data: {}, body: String(s || '') });
export const linksOf = () => [];
export const renderMarkdown = s => esc(s);
export const md = renderMarkdown;
export const pageRuntime = '';
export const pageBoards = () => [];
export const sourcesOf = () => [];
export const sceneHtml = () => '';
export const docFromPage = () => null;

// lessons, docs, streams and take export
export const LESSONS = {};
export const buildLesson = async () => { throw new Error('Lessons are not part of the lean editor'); };
export const DOC_SECTIONS = [];
export const docTopics = () => [];
export const STREAM_SAMPLES = [];
export const playerScript = '', takeToHTML = nothing, downloadHTML = nothing, downloadJSON = nothing, downloadProject = nothing, downloadVideo = nothing, videoBlob = nothing;
