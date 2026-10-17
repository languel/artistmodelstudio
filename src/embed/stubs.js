// Stands in for the studio's heavy panels in the lean embed build (vite.embed.config.js). The editor never registers
// them (see `embed.panels` in Workbench.registerPanels), so nothing here runs; the names only have to exist.
export const mountScenes = () => {};
export const mountAssistant = () => {};
export const mountGenerate = () => {};
export const mountDecide = () => {};
export const mountDocs = () => {};
export const docsTopicList = () => [];
export const mountTimeline = () => {};
export const mountSources = () => {};
export const mountGestures = () => {};
export class AssetPanel { constructor() { throw new Error('The Assets panel is not part of the lean editor'); } }
