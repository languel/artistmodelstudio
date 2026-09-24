import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only endpoint so probe/distill pages can write results to disk:
// root "seeds" -> fixtures/seeds/<set>/, "distill" -> training/<set>/data/, "report" -> training/<set>/reports/.
function probeSavePlugin() {
  const roots = {
    seeds: set => path.resolve('fixtures/seeds', set),
    distill: set => path.resolve('training', set, 'data'),
    report: set => path.resolve('training', set, 'reports')
  };
  return {
    name: 'ams-probe-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__probe/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { set, files, root = 'seeds' } = JSON.parse(body);
            if (!/^[a-z0-9-]+$/.test(set) || !roots[root]) throw new Error('bad set or root');
            const dir = roots[root](set);
            fs.mkdirSync(dir, { recursive: true });
            for (const [name, content] of Object.entries(files)) {
              if (!/^[a-z0-9.-]+$/.test(name)) throw new Error(`bad file name ${name}`);
              const data = content.startsWith('data:image/png;base64,')
                ? Buffer.from(content.slice(22), 'base64')
                : content;
              fs.writeFileSync(path.join(dir, name), data);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, dir: path.relative(process.cwd(), dir), count: Object.keys(files).length }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [probeSavePlugin()],
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
