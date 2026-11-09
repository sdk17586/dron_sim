#!/usr/bin/env python3
"""Serve only the web application's files, without third-party dependencies."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
ALLOWED = {'index.html', 'styles.css', 'src', 'assets', 'tests'}

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.svg': 'image/svg+xml'}

    def allowed(self):
        from urllib.parse import unquote, urlsplit
        parts = Path(unquote(urlsplit(self.path).path).lstrip('/')).parts
        path = (ROOT / '/'.join(parts)).resolve()
        if (parts and parts[0] not in ALLOWED) or not path.is_relative_to(ROOT) or any(p.startswith('.') or p == '..' for p in parts):
            self.send_error(404)
            return False
        return True

    def do_GET(self):
        if self.allowed():
            super().do_GET()

    def do_HEAD(self):
        if self.allowed():
            super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'")
        super().end_headers()

def main():
    parser = argparse.ArgumentParser(description='AEROLAB 로컬 실행 도구')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
    except OSError as error:
        print(f'실행하지 못했습니다: {error}\n다른 실행 창이 열려 있는지 확인하세요. 기존 기록을 읽으려면 같은 주소와 포트를 사용하세요.', file=sys.stderr)
        return 1
    print(f'AEROLAB 실행 중: http://127.0.0.1:{args.port}', flush=True)
    print('인터넷 연결이 필요하지 않습니다. 종료: Ctrl+C', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0

if __name__ == '__main__':
    sys.exit(main())
