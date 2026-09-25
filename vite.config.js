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

/**
 * Dev-only relay so external MCP clients can drive a studio tab.
 *   GET  /__ams/tabs            connected tabs (newest last)
 *   GET  /__ams/tools           tool list from the newest tab
 *   POST /__ams/call            { name, args, timeoutSec? } → { result } | { error }
 * The tab side lives in src/mcp/webmcp.js (ams:hello / ams:call / ams:result).
 */
function amsRelayPlugin() {
  return {
    name: 'ams-relay',
    configureServer(server) {
      const tabs = new Map(); // client → { title, url, tools, seen }
      const pending = new Map();
      let seq = 0;
      server.ws.on('ams:hello', (data, client) => tabs.set(client, { ...data, seen: Date.now() }));
      server.ws.on('ams:result', ({ id, result, error }) => {
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        clearTimeout(p.timer);
        p.res.end(JSON.stringify(error ? { error } : { result }));
      });
      const live = () => [...tabs].filter(([c]) => server.ws.clients.has(c));
      server.middlewares.use('/__ams', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const list = live();
        if (req.method === 'GET' && req.url.startsWith('/tabs')) {
          return res.end(JSON.stringify(list.map(([, t], i) => ({ index: i, title: t.title, url: t.url, tools: t.tools?.length || 0 }))));
        }
        if (!list.length) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'No studio tab connected. Open the app (npm run dev) in a browser.' })); }
        const [client, tab] = list[list.length - 1];
        if (req.method === 'GET' && req.url.startsWith('/tools')) return res.end(JSON.stringify(tab.tools || []));
        if (req.method !== 'POST' || !req.url.startsWith('/call')) { res.statusCode = 404; return res.end('{}'); }
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          let msg;
          try { msg = JSON.parse(body || '{}'); } catch { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Bad JSON' })); }
          const id = ++seq;
          const timer = setTimeout(() => {
            pending.delete(id);
            res.statusCode = 504;
            res.end(JSON.stringify({ error: 'Timed out waiting for the studio tab' }));
          }, (msg.timeoutSec || 900) * 1000);
          pending.set(id, { res, timer });
          client.send('ams:call', { id, name: msg.name, args: msg.args || {} });
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [probeSavePlugin(), amsRelayPlugin()],
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
