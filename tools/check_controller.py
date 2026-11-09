#!/usr/bin/env python3
"""Exercise virtual controller interlocks, real gestures, and rotor visibility."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='/tmp/aerolab-controller-checks')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    report = []
    def passed(message):
        report.append(message); print('PASS', message, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        try:
            context = browser.new_context(viewport={'width': 1366, 'height': 1000})
            errors, external = [], []
            def route(request):
                if request.request.url.startswith(args.url + '/'): request.continue_()
                else: external.append(request.request.url); request.abort()
            context.route('**/*', route)
            page = context.new_page(); page.set_default_timeout(12000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script("window.qaCsp=[];document.addEventListener('securitypolicyviolation',e=>window.qaCsp.push(e.effectiveDirective));")
            page.goto(args.url)
            scene = page.locator('.drone-3d-canvas[data-ready=true]'); scene.wait_for()
            page.locator('.controller-intro').click(force=True)
            panel = page.locator('.controller-panel'); panel.wait_for()
            def rotation(): return int(panel.get_attribute('data-rotation'))
            def linked(): return panel.get_attribute('data-connected') == 'true'
            def action(name): page.locator(f'[data-action="controller-{name}"]').click(force=True)
            def open_settings():
                if page.locator('.more-menu').get_attribute('open') is None: page.locator('.more-menu > summary').click(force=True)
            def start_drag(side, dx=0, dy=-.32):
                pad = page.locator(f'[data-stick="{side}"]'); box = pad.bounding_box()
                x, y = box['x'] + box['width']/2, box['y'] + box['height']/2
                page.mouse.move(x, y); page.mouse.down()
                page.mouse.move(x + box['width']*dx, y + box['height']*dy, steps=1)
                return pad
            assert rotation() == 0 and not linked()
            assert page.locator('[data-piece]').count() == 0
            assert page.locator('.three-motor-label:visible').count() == 0
            assert page.locator('[data-action=controller-link]').is_disabled()
            passed('별도 정상 기체·회전 0%로 시작, 정비 부품 조작 없음')

            action('remote-power')
            assert '기체 전원 꺼짐' in page.locator('[data-link-status]').inner_text()
            start_drag('left'); assert rotation() == 0; page.mouse.up()
            assert page.locator('[data-action=controller-link]').is_disabled()
            passed('조종기만 켜거나 미연결 상태에서 조작해도 회전 차단')
            action('aircraft-power')
            left = page.locator('[data-stick=left]'); left.focus(); page.keyboard.down('ArrowUp')
            assert page.locator('[data-action=controller-link]').is_disabled()
            page.keyboard.up('ArrowUp'); action('link')
            assert linked() and rotation() == 0
            assert page.locator('[data-controller-battery]').inner_text() == '100%'
            passed('양쪽 전원·중앙 스틱 조건에서 연결, 상태·배터리 표시')

            start_drag('left'); assert rotation() >= 80
            layer = page.locator('.rotor-preview-layer'); assert layer.get_attribute('hidden') is None
            assert layer.locator('[data-preview-motor]').count() == 4
            motion = layer.locator('.rotor-motion').first
            before = motion.evaluate('(e)=>({time:performance.now(),matrix:getComputedStyle(e).transform})')
            page.wait_for_timeout(130)
            after = motion.evaluate('(e)=>({time:performance.now(),matrix:getComputedStyle(e).transform})')
            assert after['time'] > before['time'] and after['matrix'] != before['matrix'], (before, after)
            assert all('NaN' not in t for t in layer.locator('[data-preview-motor]').evaluate_all('(es)=>es.map(e=>e.getAttribute("transform"))'))
            page.mouse.move(8, 8, steps=1); page.mouse.up()
            assert rotation() == 0 and layer.get_attribute('hidden') is not None
            passed('실제 마우스 드래그로 네 프로펠러 애니메이션, 바깥에서 놓아도 정지')

            right = page.locator('[data-stick=right]'); right.focus(); page.keyboard.down('ArrowRight')
            assert rotation() == 100; page.keyboard.down('ArrowUp'); assert rotation() == 100
            page.keyboard.up('ArrowRight'); assert rotation() == 100
            page.keyboard.up('ArrowUp'); assert rotation() == 0
            passed('오른쪽 스틱·대각선 키 입력 반응, 모든 키를 놓으면 중앙 복귀')
            left.focus(); page.keyboard.down('ArrowUp'); page.evaluate("window.dispatchEvent(new Event('blur'))")
            assert rotation() == 0; page.keyboard.up('ArrowUp')
            pad = start_drag('left')
            pad.dispatch_event('pointercancel', {'pointerId': 1}); page.mouse.up(); assert rotation() == 0
            passed('창 초점 이탈·포인터 취소 시 입력 초기화·회전 정지')

            start_drag('right'); assert rotation() > 0; page.mouse.up()
            action('remote-power'); assert not linked() and rotation() == 0
            action('remote-power'); assert not linked(); action('link'); assert linked()
            action('aircraft-power'); assert not linked() and rotation() == 0
            action('aircraft-power'); assert not linked(); action('link')
            passed('어느 쪽 전원을 꺼도 정지·연결 해제, 다시 켠 후 명시적으로 재연결')

            open_settings(); page.locator('[data-input=view-mode]').select_option('2d')
            page.locator('.more-menu > summary').click(force=True)
            right = page.locator('[data-stick=right]'); right.focus(); page.keyboard.down('ArrowDown')
            flat = page.locator('[data-flat-rotor-preview]')
            assert rotation() == 100 and flat.get_attribute('hidden') is None
            assert page.locator('.static-propeller[visibility=hidden]').count() == 8
            page.wait_for_timeout(80)
            assert int(flat.get_attribute('data-frames')) > 0
            page.keyboard.up('ArrowDown'); assert rotation() == 0
            assert page.locator('.static-propeller[visibility=visible]').count() == 8
            open_settings(); page.locator('[data-input=view-mode]').select_option('3d'); scene.wait_for()
            page.locator('.more-menu > summary').click(force=True)
            assert linked() and rotation() == 0
            passed('2D·3D 모두 동일하게 회전·정지, 전환 시 연결 유지·입력 중앙 복귀')

            left = page.locator('[data-stick=left]'); left.focus(); page.keyboard.down('ArrowUp'); page.keyboard.press('Escape')
            page.keyboard.up('ArrowUp'); assert not linked() and rotation() == 0
            action('link'); right = page.locator('[data-stick=right]'); right.focus(); page.keyboard.down('ArrowLeft')
            page.locator('[data-action=controller-stop]').click(force=True); page.keyboard.up('ArrowLeft')
            assert not linked() and rotation() == 0
            passed('Esc·정지 버튼은 회전 중단과 연결 해제를 함께 수행')

            action('link'); left = page.locator('[data-stick=left]'); left.focus(); page.keyboard.down('ArrowUp')
            page.emulate_media(reduced_motion='reduce')
            page.keyboard.up('ArrowUp'); page.keyboard.down('ArrowUp')
            assert rotation() == 100
            assert layer.locator('.rotor-motion').first.get_attribute('transform') == 'rotate(0)'
            page.wait_for_timeout(100)
            assert layer.locator('.rotor-motion').first.get_attribute('transform') == 'rotate(0)'
            page.emulate_media(reduced_motion='no-preference')
            page.keyboard.up('ArrowUp'); page.keyboard.down('ArrowUp'); page.wait_for_timeout(100)
            assert layer.locator('.rotor-motion').first.get_attribute('transform') != 'rotate(0)'
            page.keyboard.up('ArrowUp'); assert rotation() == 0
            passed('동작 줄이기 환경에서는 정지 도식·수치, 일반 환경에서는 회전 반응')

            widths = []
            for width in [1366, 1920, 390]:
                page.set_viewport_size({'width': width, 'height': 1000})
                dims = page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})')
                assert dims['scrollWidth'] <= width, dims
                assert page.locator('[data-stick]').count() == 2
                widths.append(dims)
            passed('1366·1920·390px에서 조종기·스틱 가로 넘침 없음')
            page.set_viewport_size({'width': 1366, 'height': 1000})
            page.locator('[data-stick=left]').focus(); page.keyboard.down('ArrowUp'); assert rotation() > 0
            page.locator('.controller-return').click(force=True)
            page.keyboard.up('ArrowUp')
            page.locator('#start-form').wait_for(); assert scene.get_attribute('data-rotor-demand') == '0'
            assert scene.get_attribute('data-battery-level') == '20'
            page.locator('.controller-intro').click(force=True)
            assert not linked() and rotation() == 0
            assert page.locator('[data-action=controller-remote-power]').get_attribute('aria-pressed') == 'false'
            page.locator('.controller-return').click(force=True)
            page.locator('#start-form button[type=submit]').click(force=True)
            def cancel_switch(dialog): dialog.dismiss()
            page.once('dialog', cancel_switch)
            page.locator('.course-selector [data-action=controller]').click(force=True)
            assert page.locator('.controller-panel').count() == 0
            assert page.locator('[data-piece]').count() > 0
            passed('정비 복귀 시 회전 제거·원래 배터리, 교육 전환 취소 시 정비 유지')

            assert not errors and not external and not page.evaluate('window.qaCsp'), {'errors': errors, 'external': external, 'csp': page.evaluate('window.qaCsp')}
            passed('JavaScript 오류·외부 요청·보안 정책 위반 없음')
            results = {'date': '2026-11-06', 'passed': len(report), 'checks': report,
                'motionSamples': [before, after], 'widths': widths, 'pageErrors': errors,
                'externalRequests': external, 'cspViolations': page.evaluate('window.qaCsp'),
                'realHardwareConnection': False, 'flightModel': False,
                'focusLossCheck': 'synthetic window blur', 'pointerCancelCheck': 'dispatched pointercancel'}
            (output / 'controller-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
            print(json.dumps(results, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
