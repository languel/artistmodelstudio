/**
 * The workbench as one self-contained HTML file (dist-single/ams.html): scripts, styles and pictures
 * inlined, openable from disk (file://), e.g. in a transparent browser window used as an overlay
 * (CloudyWindow). Build: npm run build:single.
 *
 * Left out: running models in the browser (WebGPU, ~27 MB of WebAssembly) and the dev server's
 * endpoints (the agent relay, saving to exports/). Everything kept in the browser (Assets, scenes,
 * settings) works as in the served app.
 */
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { '@huggingface/transformers': path.resolve('src/single/noTransformers.js') } },
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { input: { ams: 'index.html' }, output: { inlineDynamicImports: true } }
  }
});
