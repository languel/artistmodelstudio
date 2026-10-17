/**
 * The drawing editor as a component (docs/EMBEDDING.md): dist-embed/embed.html plus hashed assets, with a relative
 * base so the folder works under any path. Left out: the studio's lessons and samples, the model runtime, the dev relay.
 * Build: npm run build:embed (lean: the editor's panels only) or npm run build:embed:full (the chunky build: every studio panel). Serve the folder from the same origin as the host page.
 */
import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

const FULL = Boolean(process.env.AMS_EMBED_FULL);
const OUT = process.env.AMS_EMBED_OUT || (FULL ? 'dist-embed-full' : 'dist-embed');

export default defineConfig({
  base: './',
  define: { __AMS_EMBED_FULL__: JSON.stringify(FULL) },
  resolve: { alias: { '@huggingface/transformers': path.resolve('src/single/noTransformers.js') } },
  plugins: [{
    name: 'ams-embed-lean',
    enforce: 'pre',
    // The lean editor leaves out the studio's heavy panels (AMS_EMBED_FULL=1 keeps them).
    resolveId(source, importer) {
      if (process.env.AMS_EMBED_FULL || !importer || !/workbench\/app\.js$/.test(importer)) return;
      if (/^\.\/panels\/(scenes|assistant|generate|decide|docs|timeline|sources|gestures)\.js$/.test(source) || source === '../ui/AssetPanel.js') return path.resolve('src/embed/stubs.js');
    }
  }, {
    name: 'ams-embed-no-samples',
    enforce: 'pre',
    resolveId(source, importer) { if (importer && /workbench\/app\.js$/.test(importer) && source === './samples.js') return path.resolve('src/embed/noSamples.js'); }
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
