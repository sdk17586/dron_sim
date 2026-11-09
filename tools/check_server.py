#!/usr/bin/env python3
"""Check loopback serving, conflicts, access rules and a relocated Unicode path."""
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent

def check(root):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen([sys.executable, str(root / 'tools/serve.py'), '--port', str(port)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    url = f'http://127.0.0.1:{port}'
    try:
        deadline = time.monotonic() + 5
        while True:
            try:
                with urlopen(url, timeout=1) as response:
                    assert response.status == 200
                break
            except (OSError, URLError):
                if time.monotonic() > deadline:
                    raise RuntimeError('서버가 준비되지 않았습니다.')
                time.sleep(.05)
        for path in ['/styles.css', '/src/app.js', '/assets/favicon.svg']:
            with urlopen(url + path) as response:
                assert response.status == 200
        with urlopen(Request(url + '/src/app.js', method='HEAD')) as response:
            assert response.status == 200 and response.read() == b''
            assert 'text/javascript' in response.headers['Content-Type']
        for path in ['/dron_sim_devel.md', '/.aws/credentials', '/src/../../etc/passwd', '/src/']:
            try:
                urlopen(url + path)
                raise AssertionError(f'Unexpected access: {path}')
            except HTTPError as error:
                assert error.code == 404
        conflict = subprocess.run([sys.executable, str(root / 'tools/serve.py'), '--port', str(port)],
            capture_output=True, text=True, timeout=5)
        assert conflict.returncode == 1 and '같은 주소' in conflict.stderr
        return {'staticFiles': True, 'head': True, 'accessRules': True, 'portConflict': True}
    finally:
        process.terminate()
        process.communicate(timeout=5)

def main():
    result = {'original': check(ROOT)}
    with tempfile.TemporaryDirectory(prefix='aerolab-한글 경로-') as temp:
        root = Path(temp) / '드론 실습 폴더'
        root.mkdir()
        for name in ['index.html', 'styles.css']:
            shutil.copy2(ROOT / name, root / name)
        for name in ['src', 'assets']:
            shutil.copytree(ROOT / name, root / name)
        (root / 'tools').mkdir()
        shutil.copy2(ROOT / 'tools/serve.py', root / 'tools/serve.py')
        result['relocatedUnicodePath'] = check(root)
    output = Path('/tmp/aerolab-checks')
    output.mkdir(exist_ok=True)
    (output / 'server-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
