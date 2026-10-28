#!/usr/bin/env python3
"""Static server for the lessons, plus POST /save/<name>.json -> data/<name>.json (recordings)."""
import http.server, os, re, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(s):  # cross-origin isolation: lets onnxruntime use several wasm threads
        s.send_header('Cache-Control', 'no-cache'); s.send_header('Cross-Origin-Opener-Policy', 'same-origin'); s.send_header('Cross-Origin-Embedder-Policy', 'require-corp'); super().end_headers()
    def do_POST(s):
        m = re.fullmatch(r'/save/([a-z0-9._-]+\.(json|html))', s.path)
        if not m: s.send_error(400); return
        body = s.rfile.read(int(s.headers.get('Content-Length', 0)))
        d = 'data' if m.group(2) == 'json' else 'exports'   # recordings -> data/, test exports -> exports/
        os.makedirs(os.path.join(ROOT, d), exist_ok=True)
        open(os.path.join(ROOT, d, m.group(1)), 'wb').write(body)
        s.send_response(200); s.end_headers(); s.wfile.write(b'ok')
if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 5199), H).serve_forever()
