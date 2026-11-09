#!/usr/bin/env python3
"""Build a small, self-contained source release without QA runtimes or user data."""
from pathlib import Path
import zipfile
import json

ROOT = Path(__file__).resolve().parent.parent
FILES = ['index.html', 'styles.css', 'package.json', 'README.md', 'content-review.md',
         'validation.md', 'THIRD_PARTY_NOTICES.md', 'dron_sim_devel.md', 'start-windows.bat', 'start.sh']
DIRECTORIES = ['src', 'assets', 'tests', 'tools', 'examples', 'verification']

def main():
    version = json.loads((ROOT / 'package.json').read_text())['version']
    release_name = f'aerolab-v{version}'
    destination = ROOT / 'deliverables' / f'{release_name}.zip'
    destination.parent.mkdir(exist_ok=True)
    files = [ROOT / p for p in FILES]
    for name in DIRECTORIES:
        files.extend(p for p in (ROOT / name).rglob('*') if p.is_file()
            and '__pycache__' not in p.parts and p.suffix not in {'.pyc', '.log'})
    for file in files:
        if not file.is_file() or file.is_symlink():
            raise RuntimeError(f'필요한 파일을 확인하세요: {file.name}')
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(set(files)):
            relative = file.relative_to(ROOT)
            data = file.read_bytes()
            if file.suffix == '.bat':
                data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            archive.writestr(str(Path(release_name) / relative), data)
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('압축 검증 실패')
        count = len(archive.namelist())
    print(f'전달 파일: {destination}\n{count}개 파일 · {destination.stat().st_size:,} bytes · 압축 무결성 확인')

if __name__ == '__main__':
    main()
