import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: false,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  },
  optimizeDeps: {
    include: ['p5.brush/standalone', 'p5'],
    exclude: ['@huggingface/transformers']
  },
  build: {
    target: 'esnext'
  }
});
