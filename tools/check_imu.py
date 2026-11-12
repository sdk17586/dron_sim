#!/usr/bin/env python3
"""Exercise the IMU course through visible controls, native mesh dragging and keyboard input."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/controller-imu-2026-11-12')
    parser.add_argument('--compatible', action='store_true')
    args = parser.parse_args()
    base = args.url.rstrip('/'); output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    checks = []
    def passed(label):
        checks.append(label); print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        try:
            context = browser.new_context(viewport={'width': 1366, 'height': 1050})
            page = context.new_page(); page.set_default_timeout(15000)
            page.clock.install(time='2026-11-12T01:00:00Z')
            errors = []; external = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(base + '/') else (external.append(r.request.url), r.abort()))
            page.add_init_script("window.qaCsp=[];document.addEventListener('securitypolicyviolation',e=>qaCsp.push(e.effectiveDirective));localStorage.setItem('aerolab.voice.v1','false');")
            def click(action): page.locator(f'[data-action="{action}"]').first.click(force=True)
            def panel(): return page.locator('[data-imu-panel]')
            def status(): return panel().get_attribute('data-status')
            def pose(): return panel().get_attribute('data-pose')
            def samples(): return int(panel().get_attribute('data-samples'))
            def task(): return page.locator('[data-current-task]').get_attribute('data-current-task')
            def wait_samples(n):
                page.clock.run_for(3100)
                assert samples() == n, (samples(), n, status(), pose())
            def key(key): page.locator('[data-imu-body]').focus(); page.locator('[data-imu-body]').press(key)
            def capture(name):
                model = page.locator('#drone-viewport > svg').first
                if model.count(): (output / (name + '.svg')).write_text(model.evaluate('(e)=>e.outerHTML'))
            def prepare():
                click('imu-surface'); click('imu-link'); click('imu-begin')
            def enter_imu():
                assert page.locator('[data-action="controller-imu-next"]').is_hidden()
                click('controller-aircraft-power'); click('controller-remote-power'); click('controller-link')
                for side in ['left', 'right']:
                    stick = page.locator(f'[data-stick="{side}"]'); stick.focus(); stick.press('ArrowUp')
                click('controller-stop')
                assert task() == 'controller-imu-next' and not page.locator('.guide-complete').count()
                assert not page.locator('#course-completion').evaluate('(e)=>e.open')
                click('open-help')
                assert page.locator('#learning-help [data-task-id="imu-verify"]').count() == 1
                click('close-help'); click('controller-imu-next')
                assert page.locator('[data-imu-body]').count() == 1
                assert page.locator('[data-action="controller"]').get_attribute('aria-pressed') == 'true'
            page.goto(base + ('/?compatible3d=1' if args.compatible else '/'))
            assert page.locator('.course-home .course-card').count() == 2
            assert not page.locator('#drone-viewport').count()
            click('intro-drone'); click('controller')
            assert page.locator('h1').inner_text() == '조종기 교육'
            assert 'IMU 보정' in page.locator('.course-objectives').inner_text()
            assert not page.locator('[data-action="imu"]').count()
            assert not panel().count() and not page.locator('[data-imu-body]').count()
            click('controller-start')
            page.wait_for_function('()=>document.querySelector(".drone-3d-canvas[data-ready=true]")', polling=40)
            page.clock.pause_at('2026-11-12T02:00:00Z')
            enter_imu()
            assert task() == 'imu-surface' and page.locator('header [data-action="controller-restart"]').is_visible()
            assert page.locator('[data-action="imu-link"]').is_disabled()
            passed('별도 IMU 메뉴 제거·통합 소개·조종기 작동 확인 후 이어하기·조기 완료 방지·통합 도움말')
            prepare(); assert status() == 'calibrating'
            page.clock.run_for(500)
            body = page.locator('[data-imu-body]'); box = body.bounding_box()
            page.mouse.move(box['x'] + 17, box['y'] + 17); page.mouse.down()
            page.mouse.move(box['x'] + 35, box['y'] + 17, steps=4)
            page.clock.run_for(450)
            assert samples() == 0 and page.locator('[data-imu-progress]').evaluate('(e)=>e.value') == 0
            page.mouse.up(); wait_samples(1)
            assert task() == 'imu-pose-left'
            passed('직접 기체 집기·회전 중 측정 초기화·바른 자세 3초 정지 후 첫 측정')
            key('ArrowRight'); assert pose() == 'right'
            page.clock.run_for(3300); assert samples() == 1
            key('ArrowLeft'); key('ArrowLeft'); assert pose() == 'left'; wait_samples(2)
            passed('다른 자세를 유지해도 다음 단계 미완료·방향키로 실제 자세 변경')
            # Native drag on the body handle turns the aircraft 180 degrees from left to right.
            box = page.locator('[data-imu-body]').bounding_box()
            page.mouse.move(box['x'] + 17, box['y'] + 17); page.mouse.down()
            page.mouse.move(box['x'] + 237, box['y'] + 17, steps=12); page.mouse.up()
            assert pose() == 'right'; wait_samples(3); capture('right')
            passed('마우스 드래그 자세 변경·목표 모형·세 자세 측정 누적')
            key('ArrowLeft'); key('ArrowUp'); assert pose() == 'nose-up'
            page.clock.run_for(500); click('open-help')
            assert status() == 'paused' and page.locator('#learning-help').evaluate('(e)=>e.open')
            assert page.locator('#learning-help li[aria-current="step"]').get_attribute('data-task-id') == 'imu-resume'
            click('close-help'); page.clock.run_for(3300); assert samples() == 3 and status() == 'paused'
            click('imu-begin'); page.clock.run_for(400)
            page.evaluate('()=>window.dispatchEvent(new Event("blur"))')
            assert status() == 'paused'; page.evaluate('()=>window.dispatchEvent(new Event("focus"))')
            page.clock.run_for(400); assert status() == 'paused' and samples() == 3
            click('imu-begin'); wait_samples(4)
            passed('도움말 현재 항목·창 초점 이탈로 중단·복귀 후 자동 측정 방지·직접 재개')
            key('ArrowDown'); key('ArrowDown'); assert pose() == 'nose-down'; wait_samples(5)
            key('ArrowDown'); assert pose() == 'inverted'; wait_samples(6)
            assert status() == 'measured' and task() == 'imu-return' and page.locator('[data-action="imu-verify"]').is_disabled()
            key('ArrowUp'); key('ArrowUp'); assert pose() == 'level' and task() == 'imu-verify'
            click('imu-verify'); assert status() == 'completed'
            completion = page.locator('#course-completion')
            assert completion.evaluate('(e)=>e.open') and completion.locator('h2').inner_text() == '교육을 마쳤습니다!'
            assert 'IMU 보정' in completion.inner_text()
            completion.locator('[data-dismiss-completion]').click(force=True)
            assert page.locator('.guide-complete').count() == 1 and page.locator('.imu-comparison').is_visible()
            assert '남은 작업' not in page.locator('.remaining-help').inner_text()
            assert page.evaluate('()=>localStorage.getItem("aerolab.results.v1")') is None
            capture('complete')
            passed('여섯 자세 후 결과 확인·큰 중앙 완료 창·확인 후 결과 유지·기존 CSV 기록 분리')
            click('controller-restart')
            assert page.locator('.controller-panel').count() == 1 and not panel().count()
            assert task() == 'aircraft' and page.locator('[data-action="controller-remote-power"]').get_attribute('aria-pressed') == 'false'
            enter_imu(); assert status() == 'idle' and samples() == 0 and pose() == 'level'
            prepare(); wait_samples(1)
            click('imu-power'); assert status() == 'idle' and samples() == 0
            click('imu-power'); assert page.locator('[data-imu-connection]').inner_text() == '연결 안 됨'
            click('imu-link'); click('imu-begin'); page.keyboard.press('Escape'); assert status() == 'paused'
            passed('다시 시작·전원 차단·재연결 필요·Esc 정지')
            # Hit the actual aircraft mesh, next to its projected grab handle.
            for dx, dy in [(-24, 0), (24, 0), (0, -27), (0, 27)]:
                body = page.locator('[data-imu-body]').bounding_box()
                page.mouse.move(body['x'] + 17 + dx, body['y'] + 17 + dy); page.mouse.down()
                dragging = page.locator('.drone-3d-canvas').get_attribute('data-imu-dragging')
                if dragging == 'true':
                    page.mouse.move(body['x'] + 127 + dx, body['y'] + 17 + dy, steps=8); page.mouse.up(); break
                page.mouse.up()
            else: raise AssertionError('actual body mesh did not pick')
            assert pose() == 'right'
            passed('기체 본체 메시 직접 선택·끌기로 90도 회전')
            for width in [1920, 1366, 390]:
                page.set_viewport_size({'width': width, 'height': 1050})
                click('imu-view-all')
                page.clock.run_for(250)
                assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth+1')
                for selector in ['[data-imu-body]', '[data-imu-panel]', '[data-action="imu-begin"]']:
                    node = page.locator(selector); assert node.is_visible(), (width, selector)
                    rect = node.bounding_box(); assert rect['x'] >= 0 and rect['x'] + rect['width'] <= width + 1
                if width <= 800:
                    assert page.locator('#task-guide-host').bounding_box()['y'] + page.locator('#task-guide-host').bounding_box()['height'] <= panel().bounding_box()['y']
                    assert panel().bounding_box()['y'] + panel().bounding_box()['height'] <= page.locator('#drone-viewport').bounding_box()['y']
            passed('1920·1366·390px 화면에서 기체 조작·센서 패널·재개 버튼 접근과 가로 넘침 없음')
            click('home'); assert page.locator('.course-home .course-card').count() == 2
            click('intro-drone'); assert not page.locator('[data-imu-body]').count()
            assert page.locator('.drone-3d-canvas').get_attribute('data-rotor-demand') == '0'
            assert not errors and not external and not page.evaluate('()=>qaCsp'), (errors, external, page.evaluate('()=>qaCsp'))
            passed('교육 이탈 후 IMU 조작·자세 해제·기존 드론 미리보기·JavaScript·외부 요청·CSP 오류 없음')
            (output / 'browser-results.json').write_text(json.dumps({'checks': checks, 'passed': len(checks), 'errors': errors, 'compatible': args.compatible, 'controlled_clock': True}, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
