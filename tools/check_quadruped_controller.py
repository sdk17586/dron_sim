#!/usr/bin/env python3
"""Exercise the Q-TRAIN console through actual browser pointer/keyboard input."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/robot-controller-2026-11-12')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    checks = []
    def passed(label):
        checks.append(label); print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        try:
            context = browser.new_context(viewport={'width': 1366, 'height': 1100})
            page = context.new_page(); page.set_default_timeout(15000)
            errors, external = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(args.url + '/') else (external.append(route.request.url), route.abort()))
            page.add_init_script("window.qaCsp=[];document.addEventListener('securitypolicyviolation',e=>qaCsp.push(e.effectiveDirective));")
            def click(action): page.locator(f'[data-action="{action}"]').first.click(force=True)
            def task(): return page.locator('[data-current-task]').get_attribute('data-current-task')
            def pose(): return canvas.evaluate('(e)=>[e.dataset.driveX,e.dataset.driveZ,e.dataset.driveYaw]')
            def pointer(side, x, y):
                pad = page.locator(f'[data-stick="{side}"]'); pad.evaluate('(e)=>e.scrollIntoView({block:"center",behavior:"instant"})')
                box = pad.bounding_box(); cx, cy = box['x'] + box['width']/2, box['y'] + box['height']/2
                page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + x*35, cy - y*35, steps=1)
            def wait_move(axis, original):
                page.wait_for_function('([axis,original])=>document.querySelector(".robot-3d-canvas").dataset[axis]!==original', arg=[axis, original], polling=50)
            def enable():
                click('robot-controller-power'); click('robot-controller-remote'); click('robot-controller-link'); click('robot-controller-estop')
            page.goto(args.url)
            baseline = page.evaluate('JSON.stringify(localStorage)')
            assert page.locator('.course-home .course-card').count() == 2
            click('robot'); assert page.locator('.course-selector [data-action=robot-controller]').is_visible()
            click('robot-controller')
            canvas = page.locator('.robot-3d-canvas[data-ready=true]'); canvas.wait_for()
            assert page.locator('.course-objectives li').count() == 5
            assert page.locator('.robot-controller-panel,[data-current-task],[data-stick],[data-piece]').count() == 0
            assert page.evaluate('JSON.stringify(localStorage)') == baseline
            passed('첫 화면 두 장비 유지, 로봇 조종기 소개·3D 미리보기·명시적 실습 시작')
            click('robot-controller-start'); assert task() == 'robot-control-robot'
            assert canvas.get_attribute('data-supported') == 'false' and canvas.get_attribute('data-damaged') == '0'
            initial = pose()
            pointer('left', 0, 1); page.wait_for_timeout(250); page.mouse.up()
            assert pose() == initial and task() == 'robot-control-robot'
            assert page.locator('.robot-controller-completion').is_hidden()
            assert page.locator('[data-action=robot-controller-estop]').is_disabled()
            enable(); assert task() == 'robot-control-move'
            assert page.locator('.robot-controller-panel').get_attribute('data-connected') == 'true'
            assert page.locator('.robot-controller-panel').get_attribute('data-estop') == 'false'
            passed('미연결 스틱·비상 정지 해제 차단, 전원→연결→중립 상태에서 비상 정지 해제')
            (output/'robot-console-initial.svg').write_text(canvas.evaluate('(e)=>e.outerHTML'))
            original = canvas.get_attribute('data-drive-z'); original_shape = canvas.inner_html()
            pointer('left', 0, 1); wait_move('driveZ', original)
            assert canvas.inner_html() != original_shape and int(canvas.get_attribute('data-motion-frame') or 0) > 0, canvas.evaluate('(e)=>({...e.dataset})')
            page.mouse.move(5, 5, steps=1); page.mouse.up()
            stopped = pose(); page.wait_for_timeout(250)
            assert pose() == stopped and canvas.get_attribute('data-driving') == 'false'
            assert task() == 'robot-control-turn'
            (output/'robot-console-walk.svg').write_text(canvas.evaluate('(e)=>e.outerHTML'))
            passed('실제 마우스로 이동·3D 위치와 다리 변화, 스틱 밖에서 놓아도 정지·이동 수행 기록')
            right = page.locator('[data-stick=right]'); right.focus()
            original = canvas.get_attribute('data-drive-yaw'); original_handle = right.element_handle()
            page.keyboard.down('ArrowRight'); wait_move('driveYaw', original); page.keyboard.up('ArrowRight')
            assert original_handle.evaluate('(e)=>e.isConnected') and task() == 'robot-control-stop'
            stopped = pose(); page.wait_for_timeout(250); assert pose() == stopped
            click('robot-controller-stop'); assert task() == 'robot-control-estop'
            assert page.locator('.robot-controller-panel').get_attribute('data-connected') == 'false'
            assert page.locator('.robot-controller-completion').is_hidden()
            page.keyboard.press('Escape'); assert task() == 'robot-control-complete'
            assert page.locator('#course-completion').evaluate('(e)=>e.open')
            page.locator('#course-completion [data-dismiss-completion]').click(force=True)
            assert page.locator('.robot-controller-completion').is_visible()
            passed('키보드 회전·스틱 DOM 유지·키 해제 정지, 동작 정지 후 비상 정지까지 여덟 단계 완료')
            click('robot-controller-restart'); assert pose() == ['0.0000', '0.0000', '0.0000']
            assert task() == 'robot-control-robot' and page.locator('.robot-controller-completion').is_hidden()
            enable(); click('open-help')
            assert page.locator('#learning-help [data-task-id^=robot-control-]').count() == 8
            assert page.locator('#learning-help [data-done=false]').count() == 4
            assert '나사는 드라이버' not in page.locator('#learning-help').inner_text()
            page.keyboard.press('Escape')
            assert page.locator('.robot-controller-panel').get_attribute('data-connected') == 'true'
            click('locate-task'); assert page.evaluate('document.activeElement.dataset.stick') == 'left'
            passed('보이는 다시 시작으로 위치·전원·진행 초기화, 읽기 전용 남은 작업·조작 위치 안내·도움말 Esc 연결 유지')
            left = page.locator('[data-stick=left]'); left.focus(); page.keyboard.down('ArrowUp')
            original = canvas.get_attribute('data-drive-z'); wait_move('driveZ', original)
            page.keyboard.press('Escape'); stopped = pose()
            assert canvas.get_attribute('data-estop') == 'true' and canvas.get_attribute('data-driving') == 'false'
            page.wait_for_timeout(200); assert pose() == stopped
            page.keyboard.up('ArrowUp'); click('robot-controller-estop')
            pointer('left', 1, 0); original = canvas.get_attribute('data-drive-x'); wait_move('driveX', original)
            page.dispatch_event('[data-stick=left]', 'pointercancel', {'pointerId': 1})
            page.mouse.up(); stopped = pose(); page.wait_for_timeout(200); assert pose() == stopped
            passed('키를 누르는 중 Esc 비상 정지·입력 취소 후 정지, 해제 후에만 재개')
            pointer('left', 0, 1); original = canvas.get_attribute('data-drive-z'); wait_move('driveZ', original)
            page.evaluate('window.dispatchEvent(new Event("blur"))'); page.mouse.up()
            stopped = pose(); page.wait_for_timeout(200); assert pose() == stopped
            assert page.locator('.robot-controller-panel').get_attribute('data-connected') == 'false'
            assert canvas.get_attribute('data-estop') == 'true'
            click('robot-controller-link'); click('robot-controller-estop')
            pointer('left', 0, 1); original = canvas.get_attribute('data-drive-z'); wait_move('driveZ', original)
            click('robot-controller-power'); page.mouse.up()
            stopped = pose(); page.wait_for_timeout(200); assert pose() == stopped
            click('robot-controller-power'); assert page.locator('.robot-controller-panel').get_attribute('data-connected') == 'false'
            passed('창 초점 이탈·로봇 전원 차단 시 즉시 정지·연결 해제·비상 정지, 전원 복구 후 자동 재개 없음')
            click('robot-controller-restart'); enable()
            page.emulate_media(reduced_motion='reduce'); frames = canvas.get_attribute('data-motion-frame')
            pointer('left', 0, 1); original = canvas.get_attribute('data-drive-z'); wait_move('driveZ', original); page.mouse.up()
            assert canvas.get_attribute('data-motion-frame') == frames
            page.emulate_media(reduced_motion='no-preference')
            passed('동작 줄이기 설정에서 이동·수행은 유지하고 걸음 애니메이션 생략')
            widths = []
            for width, height in [(1366, 768), (1920, 1080), (390, 844)]:
                page.set_viewport_size({'width': width, 'height': height})
                assert page.evaluate('document.documentElement.scrollWidth') <= width
                assert page.locator('header [data-action=robot-controller-restart]').is_visible()
                click('open-help'); bounds = page.locator('#learning-help').bounding_box()
                assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= width + 1
                page.keyboard.press('Escape'); widths.append(width)
            assert page.evaluate('JSON.stringify(localStorage)') == baseline
            passed('1366·1920·390px 가로 넘침 없음·도움말 크기·재시작 표시, 조종 연습으로 훈련 기록 변경 없음')
            page.set_viewport_size({'width': 1366, 'height': 1100})
            click('robot-training'); page.locator('#robot-start-form button').click(force=True)
            page.once('dialog', lambda dialog: dialog.dismiss()); click('robot-controller')
            assert task() == 'robot-estop'
            page.once('dialog', lambda dialog: dialog.accept()); click('robot-controller')
            assert page.locator('[data-action=robot-controller-start]').is_visible()
            records = page.evaluate('JSON.parse(localStorage.getItem("aerolab.results.v1")).records')
            assert len(records) == 1 and records[0]['scenarioId'] == 'quadruped-joint-v1' and records[0]['status'] == 'abandoned'
            saved = page.evaluate('JSON.stringify(localStorage)')
            click('robot-controller-start'); enable(); click('home'); click('intro-drone'); click('controller'); click('controller-start')
            click('controller-aircraft-power'); click('controller-remote-power'); click('controller-link')
            assert page.locator('.controller-panel').get_attribute('data-connected') == 'true'
            assert page.evaluate('JSON.stringify(localStorage)') == saved
            passed('로봇 정비에서 전환 취소는 진행 유지·승인은 중단 보관, 로봇 조종 후 기존 드론 조종기 연결 유지')
            assert not errors and not external and not page.evaluate('qaCsp'), {'errors': errors, 'external': external, 'csp': page.evaluate('qaCsp')}
            passed('JavaScript 오류·외부 요청·보안 정책 위반 없음')
            (output/'browser-results.json').write_text(json.dumps({'date':'2026-11-12', 'passed':len(checks), 'checks':checks, 'widths':widths, 'pageErrors':errors, 'externalRequests':external, 'cspViolations':page.evaluate('qaCsp'), 'screenshots':False}, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
