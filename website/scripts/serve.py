"""Serve the exported website locally, including its custom 404 page."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / 'out'


class PreviewHandler(SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        page = OUTPUT / '404.html'
        if code != 404 or not page.is_file():
            return super().send_error(code, message, explain)
        content = page.read_bytes()
        self.send_response(404)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(content)


print('Local: http://127.0.0.1:4336', flush=True)
ThreadingHTTPServer(('127.0.0.1', 4336), partial(PreviewHandler, directory=str(OUTPUT))).serve_forever()
