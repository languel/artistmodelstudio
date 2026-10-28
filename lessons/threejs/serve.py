#!/usr/bin/env python3
"""Static server for the lessons, plus POST /save/<name>.json -> data/<name>.json (recordings)."""
import http.server, os, re, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_POST(s):
        m = re.fullmatch(r'/save/([a-z0-9._-]+\.json)', s.path)
        if not m: s.send_error(400); return
        body = s.rfile.read(int(s.headers.get('Content-Length', 0)))
        os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
        open(os.path.join(ROOT, 'data', m.group(1)), 'wb').write(body)
        s.send_response(200); s.end_headers(); s.wfile.write(b'ok')
if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 5199), H).serve_forever()
