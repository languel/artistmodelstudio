/**
 * The drawing editor as a component (docs/EMBEDDING.md): dist-embed/embed.html plus hashed assets, with a relative
 * base so the folder works under any path. Left out: the studio's lessons and samples, the model runtime, the dev relay.
 * Build: npm run build:embed (lean: the editor's panels only) or npm run build:embed:full (the chunky build: every studio panel). Serve the folder from the same origin as the host page.
 */
import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const FULL = Boolean(process.env.AMS_EMBED_FULL);
// Modules the lean build replaces with src/embed/stubs.js (repo-relative paths).
const LEAN_STUBS = new Set([
  ...['scenes', 'assistant', 'generate', 'decide', 'docs', 'timeline', 'sources', 'gestures', 'script', 'process', 'stages', 'settings', 'shortcuts', 'code', 'history', 'log'].map(n => `src/workbench/panels/${n}.js`),
  ...['scenes', 'recorder', 'takePlayer', 'walkthroughs', 'sources', 'gestures', 'playlists', 'boardFrames', 'diagnostics', 'sourceDemos'].map(n => `src/workbench/${n}.js`),
  'src/workbench/lessons.js', 'src/workbench/docsContent.js', 'src/workbench/streamSamples.js', 'src/workbench/takeExport.js',
  'src/artists/artistRegistry.js', 'src/process/markdown.js', 'src/process/page.js', 'src/ui/AssetPanel.js'
]);
const OUT = process.env.AMS_EMBED_OUT || (FULL ? 'dist-embed-full' : 'dist-embed');

export default defineConfig({
  base: './',
  define: { __AMS_EMBED_FULL__: JSON.stringify(FULL) },
  resolve: { alias: { '@huggingface/transformers': path.resolve('src/single/noTransformers.js') } },
  plugins: [{
    name: 'ams-embed-lean',
    enforce: 'pre',
    // The lean editor leaves out the studio's subsystems and their panels (AMS_EMBED_FULL=1 keeps everything).
    resolveId(source, importer) {
      if (FULL || !importer || !source.startsWith('.')) return;
      const target = path.relative(process.cwd(), path.resolve(path.dirname(importer.split('?')[0]), source)).replace(/\\/g, '/');
      if (LEAN_STUBS.has(target)) return path.resolve('src/embed/stubs.js');
    }
  }, {
    name: 'ams-embed-no-samples',
    enforce: 'pre',
    resolveId(source, importer) { if (importer && /workbench\/app\.js$/.test(importer) && source === './samples.js') return path.resolve('src/embed/noSamples.js'); }
  }, {
    name: 'ams-embed-report',
    // AMS_EMBED_REPORT=1: what is in the entry chunk, biggest source files first.
    generateBundle(_o, bundle) {
      if (!process.env.AMS_EMBED_REPORT) return;
      const entry = Object.values(bundle).find(c => c.isEntry);
      const rows = Object.entries(entry.modules).map(([id, m]) => [m.renderedLength, id.replace(process.cwd() + '/', '')]).sort((a, b) => b[0] - a[0]);
      console.log(`\nentry chunk ${(entry.code.length / 1024).toFixed(0)} kB`);
      const groups = {};
      for (const [n, id] of rows) { const g = id.startsWith('node_modules') ? id.split('/').slice(0, id.startsWith('node_modules/@') ? 3 : 2).join('/') : id.split('/').slice(0, 2).join('/'); groups[g] = (groups[g] || 0) + n; }
      for (const [g, n] of Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(Math.round(n / 1024)).padStart(6), 'kB ', g);
      console.log('\nlargest files:');
      for (const [n, id] of rows.slice(0, 40)) console.log(String(Math.round(n / 1024)).padStart(6), 'kB ', id);
    }
  }, {
    name: 'ams-embed-client',
    // The client library goes next to the editor, as one file with no imports.
    closeBundle() { fs.copyFileSync('src/embed/client.js', `${OUT}/ams-editor.js`); }
  }],
  build: {
    outDir: OUT,
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: { input: { embed: 'embed.html' } }
  }
});
