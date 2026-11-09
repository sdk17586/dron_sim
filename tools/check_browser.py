#!/usr/bin/env python3
"""Optional development checks. Running the app does not require Playwright."""
import argparse
import json
from pathlib import Path
import time
import tempfile

def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit('검사용 Playwright가 없습니다. 앱은 이 도구 없이 실행됩니다. README의 개발 검증 안내를 확인하세요.')
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='/tmp/aerolab-checks')
    parser.add_argument('--screenshots', action='store_true', help='화면 캡처를 지원하는 환경에서만 사용')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1100}, locale='ko-KR', timezone_id='Asia/Seoul')
        external = []
        def route(request):
            if request.request.url.startswith(args.url + '/'):
                request.continue_()
            else:
                external.append(request.request.url)
                request.abort()
        context.route('**/*', route)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(args.url + '/tests/browser.html')
            page.wait_for_selector('body[data-finished="true"]', timeout=30000)
            report = page.locator('#report').inner_text()
            print(report, flush=True)
            failed = page.locator('body').get_attribute('data-failed')
            (output / 'test-results.txt').write_text(report, encoding='utf-8')
            page.goto(args.url)
            page.locator('#start-form').wait_for()
            if args.screenshots:
                page.screenshot(path=str(output / 'initial.png'), full_page=True, timeout=10000)
            widths = []
            for width, height in [(1366, 768), (1920, 1080), (390, 844)]:
                page.set_viewport_size({'width': width, 'height': height})
                if args.screenshots:
                    page.screenshot(path=str(output / f'screen-{width}.png'), full_page=True, timeout=10000)
                dimensions = page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})')
                widths.append(dimensions)
                if dimensions['scrollWidth'] > width:
                    errors.append(f'가로 넘침: {dimensions}')
            page.set_viewport_size({'width': 1440, 'height': 1100})
            page.locator('#start-form button[type="submit"]').click(force=True)
            page.locator('[data-action="confirm-power"]').click(force=True)
            page.get_by_role('button', name='장착된 배터리 집기').click(force=True)
            page.locator('.discard-tray').click(force=True)
            page.locator('[data-action="select-motor"][data-motor="front-left"]').click(force=True)
            if args.screenshots:
                page.screenshot(path=str(output / 'inspection.png'), full_page=True, timeout=10000)
            page.locator('[data-action="answer-replace"]').focus()
            page.keyboard.press('Enter')
            assert page.locator('.current-instruction').count() == 1
            page.get_by_role('button', name='드라이버 집기').focus()
            page.keyboard.press('Enter')
            assert page.locator('#app').get_attribute('data-holding') == 'driver'
            page.keyboard.press('Escape')
            assert page.locator('#app').get_attribute('data-holding') is None
            load_times = []
            page.on('dialog', lambda dialog: dialog.accept())
            for _ in range(3):
                start = time.perf_counter()
                page.reload()
                page.locator('#start-form').wait_for()
                load_times.append(round(time.perf_counter() - start, 3))
            sample = page.evaluate("""async () => {
                const {createState,buildResult}=await import('./src/domain/state.js');
                const {exportCSV}=await import('./src/storage/csv.js');
                const state=createState({session:'파일 검증 회차',trainee:'001'});
                return exportCSV([buildResult(state,{status:'abandoned',durationSeconds:10})]);
            }""")
            page.locator('[data-action="operations"]').click(force=True)
            page.locator('#csv-file').set_input_files({'name': 'sample.csv', 'mimeType': 'text/csv', 'buffer': sample.encode('utf-8')})
            page.locator('[data-action="import-confirm"]').wait_for()
            page.locator('[data-action="import-confirm"]').click(force=True)
            assert page.locator('tbody tr').count() == 1
            assert page.locator('tbody').inner_text().find('001') >= 0
            with page.expect_download() as download:
                page.locator('[data-action="export-all"]').click(force=True)
            download.value.save_as(str(output / 'downloaded-results.csv'))
            page.locator('#csv-file').set_input_files({'name': 'same.csv', 'mimeType': 'text/csv', 'buffer': sample.encode('utf-8')})
            assert '중복 1건' in page.locator('.import-preview').inner_text()
            page.locator('[data-action="import-cancel"]').click(force=True)
            page.locator('#csv-file').set_input_files({'name': 'broken.csv', 'mimeType': 'text/csv', 'buffer': b'not,a,valid,csv'})
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if '열 이름' in page.locator('.feedback').inner_text():
                    break
                time.sleep(.05)
            assert '열 이름' in page.locator('.feedback').inner_text()
            assert page.locator('tbody tr').count() == 1
            # Separate browser processes must retain results in the same profile.
            with tempfile.TemporaryDirectory(prefix='aerolab-persistence-') as profile:
                for iteration in range(2):
                    persistent = p.chromium.launch_persistent_context(profile, headless=True,
                        args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
                    try:
                        check_page = persistent.new_page()
                        check_page.goto(args.url)
                        check_page.locator('#start-form').wait_for()
                        if iteration == 0:
                            check_page.evaluate("""async () => {
                                const {createState,buildResult}=await import('./src/domain/state.js');
                                const {ResultRepository}=await import('./src/storage/result-repository.js');
                                new ResultRepository(localStorage).add(buildResult(createState({trainee:'저장검사'})));
                            }""")
                        else:
                            check_page.locator('[data-action="operations"]').click(force=True)
                            assert '저장검사' in check_page.locator('tbody').inner_text()
                    finally:
                        persistent.close()
            metrics = {'browser': browser.version, 'widths': widths, 'localLoadSeconds': load_times,
                'externalRequests': external, 'pageErrors': errors, 'screenshots': args.screenshots,
                'fileUploadDownload': True, 'duplicateImport': True, 'malformedImport': True,
                'browserRestartPersistence': True}
            (output / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2))
            print(json.dumps(metrics, ensure_ascii=False, indent=2))
            print('검증 자료:', output)
            return 0 if failed == '0' and not errors and not external else 1
        finally:
            browser.close()

if __name__ == '__main__':
    raise SystemExit(main())
