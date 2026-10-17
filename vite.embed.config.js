/**
 * The drawing editor as a component (docs/EMBEDDING.md): dist-embed/embed.html plus hashed assets, with a relative
 * base so the folder works under any path. Left out: the studio's lessons and samples, the model runtime, the dev relay.
 * Build: npm run build:embed. Serve the folder from the same origin as the host page.
 */
import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig({
  base: './',
  resolve: { alias: { '@huggingface/transformers': path.resolve('src/single/noTransformers.js') } },
  plugins: [{
    name: 'ams-embed-no-samples',
    enforce: 'pre',
    resolveId(source, importer) { if (importer && /workbench\/app\.js$/.test(importer) && source === './samples.js') return path.resolve('src/embed/noSamples.js'); }
  }, {
    name: 'ams-embed-client',
    // The client library goes next to the editor, as one file with no imports.
    closeBundle() { fs.copyFileSync('src/embed/client.js', 'dist-embed/ams-editor.js'); }
  }],
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: { input: { embed: 'embed.html' } }
  }
});
