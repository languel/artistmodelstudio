import http.server, os, sys, json
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'exports', 'klee-painterly')
class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        rel = self.path.lstrip('/').split('?')[0]
        if '..' in rel: self.send_response(400); self.end_headers(); return
        n = int(self.headers.get('Content-Length', 0)); body = self.rfile.read(n)
        dest = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(dest), exist_ok=True)
        open(dest, 'wb').write(body)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 3999), H).serve_forever()
