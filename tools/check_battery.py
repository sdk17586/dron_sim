#!/usr/bin/env python3
"""Check battery exchange and the proportional LED in a real browser."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='/tmp/aerolab-battery-checks')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    report = []
    def passed(message):
        report.append(message); print('PASS', message, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        try:
            context = browser.new_context(viewport={'width': 1366, 'height': 1000})
            external, errors = [], []
            def route(request):
                if request.request.url.startswith(args.url + '/'): request.continue_()
                else: external.append(request.request.url); request.abort()
            context.route('**/*', route)
            page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script("window.qaCsp=[];document.addEventListener('securitypolicyviolation',e=>window.qaCsp.push(e.effectiveDirective));")
            page.goto(args.url)
            page.locator("[data-action=intro-drone]").click(force=True)
            scene = page.locator('.drone-3d-canvas[data-ready="true"]'); scene.wait_for()
            page.locator('#start-form button[type=submit]').click(force=True)
            gauge = page.locator('[data-battery-gauge]')
            def assert_level(level, battery_id=None):
                assert gauge.get_attribute('aria-valuenow') == str(level)
                assert float(gauge.locator('.battery-gauge-fill').get_attribute('width')) == level
                if scene.count():
                    assert scene.get_attribute('data-battery-level') == str(level)
                    assert float(scene.get_attribute('data-led-fill')) == level / 100
                    if battery_id: assert scene.get_attribute('data-battery-id') == battery_id
            def item(kind, battery_id=None):
                items = page.locator('[data-piece]')
                for index in range(items.count()):
                    value = json.loads(items.nth(index).get_attribute('data-piece'))
                    if value['kind'] == kind and (battery_id is None or value.get('batteryId') == battery_id): return items.nth(index)
                raise AssertionError(f'missing piece {kind} {battery_id}')
            def drag(source, target):
                a, b = source.bounding_box(), target.bounding_box()
                page.mouse.move(a['x']+a['width']/2, a['y']+a['height']/2); page.mouse.down()
                page.mouse.move(b['x']+b['width']/2, b['y']+b['height']/2, steps=1); page.mouse.up()
            def open_settings():
                if page.locator('.more-menu').get_attribute('open') is None: page.locator('.more-menu > summary').click(force=True)
            assert_level(20, 'battery-01')
            assert item('battery-pack', 'battery-02').get_attribute('aria-label') == '교체 배터리 100% 집기'
            passed('초기 잔량: 기체 20%·교체용 100%, 일자 LED·숫자 일치')
            drag(item('battery-pack', 'battery-02'), page.locator('[data-anchor=battery]'))
            assert_level(20, 'battery-01'); assert '먼저 분리' in page.locator('.feedback').inner_text()
            passed('실제 드래그: 장착된 배터리 위 중복 삽입 차단')
            page.locator('[data-action=confirm-power]').click(force=True)
            drag(item('battery'), page.locator('.discard-tray'))
            assert scene.get_attribute('data-battery-installed') == 'false'
            assert scene.get_attribute('data-led-fill') == '0' and gauge.get_attribute('aria-valuetext') == '배터리 없음'
            assert page.locator('.stored-batteries .battery-pack-piece').count() == 1
            passed('실제 드래그: 기존 배터리 분리·보관, LED 꺼짐·빈 자리 표시')
            drag(item('battery-pack', 'battery-02'), page.locator('[data-anchor=battery]'))
            assert_level(100, 'battery-02')
            assert scene.get_attribute('data-battery-installed') == 'true'
            assert page.locator('.stored-batteries .battery-pack-piece').count() == 1
            passed('실제 드래그: 충전 배터리 장착·100% 표시, 기존 배터리 보존')
            levels = []
            for level in [75, 50, 20, 0]:
                open_settings(); slider = page.locator('#battery-charge')
                slider.evaluate("(n,value)=>{n.value=String(value);n.dispatchEvent(new Event('input',{bubbles:true}));}", level)
                assert_level(level, 'battery-02')
                assert page.locator('#battery-charge-value').inner_text() == f'{level}%'
                slider.dispatch_event('change'); assert_level(level, 'battery-02')
                levels.append({'charge': level, 'barWidth': gauge.locator('.battery-gauge-fill').get_attribute('width'), 'color': gauge.locator('.battery-gauge-fill').get_attribute('fill')})
            assert '0%' in gauge.inner_text() and gauge.get_attribute('aria-valuetext') != '배터리 없음'
            passed('잔량 연습: 75→50→20→0%, 실시간 미리보기·확정·3D LED 비례 축소')
            page.locator('.more-menu > summary').click(force=True)
            item('battery').click(force=True); page.locator('.discard-tray').click(force=True)
            old = item('battery-pack', 'battery-01'); old.focus(); page.keyboard.press('Enter')
            assert page.locator('#app').get_attribute('data-holding') == 'battery-pack'
            page.locator('[data-anchor=battery]').focus(); page.keyboard.press('Enter')
            assert_level(20, 'battery-01')
            assert page.evaluate('document.activeElement.dataset.anchor') == 'battery'
            assert '0%' in item('battery-pack', 'battery-02').get_attribute('aria-label')
            passed('키보드: 보관 배터리 집기·재장착, 배터리별 잔량·초점 유지')
            open_settings(); page.locator('[data-input=view-mode]').select_option('2d')
            assert_level(20)
            assert abs(float(page.locator('[data-battery-led-fill]').get_attribute('width')) - 12.4) < .001
            slider = page.locator('#battery-charge')
            slider.evaluate("n=>{n.value='75';n.dispatchEvent(new Event('input',{bubbles:true}));}")
            assert abs(float(page.locator('[data-battery-led-fill]').get_attribute('width')) - 46.5) < .001
            slider.dispatch_event('change'); assert_level(75)
            page.locator('.more-menu > summary').click(force=True)
            item('battery').click(force=True); page.locator('.discard-tray').click(force=True)
            item('battery-pack', 'battery-02').click(force=True); page.locator('[data-anchor=battery]').click(force=True)
            assert_level(0)
            open_settings(); page.locator('[data-input=view-mode]').select_option('3d'); scene.wait_for()
            assert_level(0, 'battery-02')
            passed('2D↔3D: LED·잔량 변경·배터리 교체 상태 일치')
            page.locator('.more-menu > summary').click(force=True)
            item('battery').click(force=True); page.locator('.discard-tray').click(force=True)
            widths = []
            for width in [1366, 1920, 390]:
                page.set_viewport_size({'width': width, 'height': 1000})
                dimensions = page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})')
                assert dimensions['scrollWidth'] <= width, dimensions
                assert page.locator('.stored-batteries .battery-pack-piece').count() == 2
                widths.append(dimensions)
            passed('1366·1920·390px: 배터리 두 개 보관 시 가로 넘침·분실 없음')
            assert not errors and not external and not page.evaluate('window.qaCsp'), {'errors': errors, 'external': external, 'csp': page.evaluate('window.qaCsp')}
            passed('JavaScript 오류·외부 요청·보안 정책 위반 없음')
            result = {'date': '2026-11-06', 'passed': len(report), 'checks': report, 'levels': levels, 'widths': widths,
                'pageErrors': errors, 'externalRequests': external, 'cspViolations': page.evaluate('window.qaCsp'), 'webglHardwareVerified': False}
            (output / 'battery-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
            print(json.dumps(result, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
