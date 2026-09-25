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
      // Tabs long-poll GET /__ams/poll?tab=ID for calls and POST results to /__ams/result.
      // (Plain HTTP: the HMR websocket can drop silently and strand calls.)
      const tabs = new Map();   // id → { title, url, tools, seen, waiters: [res], queue: [msg] }
      const pending = new Map(); // call id → { res, timer }
      let seq = 0;
      const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
      const live = () => [...tabs.entries()].filter(([, t]) => Date.now() - t.seen < 40000).sort((a, b) => a[1].since - b[1].since);
      const readBody = req => new Promise(r => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
      const deliver = (tab, msg) => {
        const w = tab.waiters.shift();
        if (w) json(w, 200, msg); else tab.queue.push(msg);
      };
      server.middlewares.use('/__ams', async (req, res) => {
        const url = new URL(req.url, 'http://x');
        const route = url.pathname;
        if (route === '/hello' && req.method === 'POST') {
          const b = await readBody(req);
          const t = tabs.get(b.tab) || { waiters: [], queue: [], since: Date.now() };
          Object.assign(t, { title: b.title, url: b.url, tools: b.tools, seen: Date.now() });
          tabs.set(b.tab, t);
          return json(res, 200, { ok: true });
        }
        if (route === '/poll') {
          const t = tabs.get(url.searchParams.get('tab'));
          if (!t) return json(res, 404, { hello: true });
          t.seen = Date.now();
          if (t.queue.length) return json(res, 200, t.queue.shift());
          t.waiters.push(res);
          const timer = setTimeout(() => { const i = t.waiters.indexOf(res); if (i >= 0) { t.waiters.splice(i, 1); res.statusCode = 204; res.end(); } }, 25000);
          res.on('close', () => { clearTimeout(timer); const i = t.waiters.indexOf(res); if (i >= 0) t.waiters.splice(i, 1); });
          return;
        }
        if (route === '/result' && req.method === 'POST') {
          const { id, result, error } = await readBody(req);
          const p = pending.get(id);
          if (p) { pending.delete(id); clearTimeout(p.timer); json(p.res, 200, error ? { error } : { result }); }
          return json(res, 200, { ok: true });
        }
        const list = live();
        if (route === '/tabs') return json(res, 200, list.map(([id, t], i) => ({ index: i, id, title: t.title, url: t.url, tools: t.tools?.length || 0, lastSeenMs: Date.now() - t.seen })));
        if (!list.length) return json(res, 503, { error: 'No studio tab connected. Open the app (npm run dev) in a browser.' });
        const [, tab] = list[list.length - 1];
        if (route === '/tools') return json(res, 200, tab.tools || []);
        if (route === '/call' && req.method === 'POST') {
          const msg = await readBody(req);
          const id = ++seq;
          const timer = setTimeout(() => { pending.delete(id); json(res, 504, { error: 'Timed out waiting for the studio tab' }); }, (msg.timeoutSec || 900) * 1000);
          pending.set(id, { res, timer });
          return deliver(tab, { id, name: msg.name, args: msg.args || {} });
        }
        json(res, 404, {});
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
