#!/usr/bin/env python3
"""Check discoverable course entry, contextual help, and full task completion."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='/tmp/aerolab-learning-checks')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    report = []
    def passed(message):
        report.append(message); print('PASS', message, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        try:
            context = browser.new_context(viewport={'width': 1366, 'height': 1100})
            errors, external = [], []
            def route(request):
                if request.request.url.startswith(args.url + '/'): request.continue_()
                else: external.append(request.request.url); request.abort()
            context.route('**/*', route)
            page = context.new_page(); page.set_default_timeout(15000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script("window.qaCsp=[];document.addEventListener('securitypolicyviolation',e=>window.qaCsp.push(e.effectiveDirective));")
            page.goto(args.url)
            page.locator('.drone-3d-canvas[data-ready=true]').wait_for()
            def click(action): page.locator(f'[data-action="{action}"]').first.click(force=True)
            def task(): return page.locator('[data-current-task]').get_attribute('data-current-task')
            def help_open(): page.locator('header [data-action=open-help]').click(force=True)
            def help_close(): page.locator('[data-action=close-help]').click(force=True)
            def record_text(): return page.evaluate("JSON.stringify(localStorage)")
            def piece(kind, index=None):
                for item in page.locator('[data-piece]').all():
                    value = json.loads(item.get_attribute('data-piece'))
                    if value['kind'] == kind and (index is None or value.get('index') == index): return item
                raise AssertionError(f'missing piece {kind} {index}')
            def destination(kind, index=None):
                for item in page.locator('[data-drop]').all():
                    value = json.loads(item.get_attribute('data-drop'))
                    if value['kind'] == kind and (index is None or kind == 'discard' or value.get('index') == index): return item
                raise AssertionError(f'missing destination {kind} {index}')
            def place(kind, target, index=None):
                piece(kind, None if kind == 'driver' else index).click(force=True); destination(target, index).click(force=True)
            def drag(source, target, dx=0, dy=0):
                a, b = source.bounding_box(), target.bounding_box()
                page.mouse.move(a['x']+a['width']/2, a['y']+a['height']/2); page.mouse.down()
                page.mouse.move(b['x']+b['width']/2+dx,b['y']+b['height']/2+dy,steps=1)
            courses = page.locator('.course-picker .course-card')
            assert courses.count() == 2 and all(c.is_visible() for c in courses.all())
            assert '정비 교육' in courses.nth(0).inner_text() and '조종기 교육' in courses.nth(1).inner_text()
            passed('첫 화면에 정비 교육·조종기 교육 두 개의 명확한 진입 카드')

            click('controller'); assert task() == 'aircraft'
            assert page.locator('header [data-action=controller-restart]').is_visible()
            click('locate-task')
            assert page.evaluate("document.activeElement.dataset.action") == 'controller-aircraft-power'
            click('controller-aircraft-power'); assert task() == 'remote'
            click('controller-remote-power'); assert task() == 'link'
            click('controller-link'); assert task() == 'left'
            passed('조종기 교육의 현재 단계·다음 대상 표시와 위치 보기 초점 이동')
            left = page.locator('[data-stick=left]').element_handle()
            page.locator('[data-stick=left]').focus(); page.keyboard.down('ArrowUp')
            assert task() == 'left' and left.evaluate('(e)=>e.isConnected')
            page.keyboard.up('ArrowUp')
            assert task() == 'right'
            help_open(); assert page.locator('#learning-help').evaluate('(d)=>d.open')
            assert page.evaluate("document.activeElement.dataset.action") == 'close-help'
            page.keyboard.press('Tab'); assert page.evaluate("Boolean(document.activeElement.closest('#learning-help'))")
            page.keyboard.press('Escape')
            assert not page.locator('#learning-help').evaluate('(d)=>d.open')
            assert page.locator('.controller-panel').get_attribute('data-connected') == 'true'
            assert page.evaluate("document.activeElement.dataset.action") == 'open-help'
            passed('스틱 DOM 유지·진행 갱신, 도움말 Tab 초점 유지·Esc 닫기·연결 보존')
            right = page.locator('[data-stick=right]')
            drag(right,right,dy=-35); assert task() == 'right'; page.mouse.up(); assert task() == 'stop'
            click('controller-stop'); assert task() == 'controller-complete'
            assert page.locator('.controller-completion').is_visible()
            click('controller-restart'); assert task() == 'aircraft'
            assert page.locator('.controller-completion').is_hidden()
            passed('좌우 스틱·정지까지 해야 조종기 교육 완료, 보이는 다시 시작으로 초기화')

            page.locator('.course-selector [data-action=training]').click(force=True)
            page.locator('#start-form [name=session]').fill('도움말 검증')
            page.locator('#start-form [name=trainee]').fill('QA001')
            page.locator('#start-form button[type=submit]').click(force=True)
            assert task() == 'confirm-power'
            restart = page.locator('header [data-action=restart]')
            assert restart.is_visible() and not restart.evaluate('(b)=>Boolean(b.closest(".more-menu"))')
            before = record_text(); help_open()
            assert page.locator('#learning-help [data-task-id=remove-battery]').get_attribute('data-done') == 'false'
            assert page.locator('#learning-help [data-task-id^=inspect-][data-done=false]').count() == 4
            page.locator('#learning-help .help-phase').filter(has_text='최종 확인·교육 완료').locator('summary').click(force=True)
            assert page.locator('#learning-help [data-task-id=finish]').is_visible()
            help_close(); assert task() == 'confirm-power' and record_text() == before
            passed('메뉴 밖 다시 시작·상태별 남은 작업 도움말, 열람으로 판정·기록 자동 변경 없음')
            click('locate-task'); page.keyboard.press('Enter'); assert task() == 'remove-battery'
            assert page.locator('.battery-point').evaluate('(e)=>e.classList.contains("guide-source")')
            assert page.locator('.discard-tray').evaluate('(e)=>e.classList.contains("guide-destination")')
            drag(piece('battery'),destination('discard')); page.mouse.up()
            assert task() == 'inspect-front-left'
            click('locate-task')
            assert page.locator('.two-buttons.guide-source').count() == 1
            assert page.locator('.two-buttons .guide-source').count() == 0
            click('answer-replace'); assert task() == 'remove-screw-front-left-0'
            passed('배터리 실제 드래그 후 현재 작업 전환, 판단은 두 선택지를 함께 강조')
            for i in [0,1]: place('driver','screw',i)
            for i in [0,1]: place('mounted-blade','discard',i)
            page.locator('#kit').select_option('B1'); assert task().startswith('kit-')
            assert page.locator('#kit.guide-source').count() == 1
            page.locator('#kit').select_option('A1')
            for i in [0,1]: place('blade','blade',i)
            for i in [0,1]: place('screw','screw',i)
            place('driver','screw',0)
            for motor in ['front-right','rear-left','rear-right']:
                click('view-all')
                page.locator(f'.three-motor-label[data-motor="{motor}"]').click(force=True); click('answer-healthy')
            click('view-all')
            assert task() == 'fasten-front-left-1'
            assert page.locator('.final-panel').count() == 0
            help_open()
            assert page.locator('#learning-help [data-task-id=fasten-front-left-1]').get_attribute('data-done') == 'false'
            assert page.locator('#learning-help [data-task-id=fasten-front-left-0]').get_attribute('data-done') == 'true'
            page.locator('#learning-help [data-action=locate-task]').click(force=True)
            assert page.locator('[data-anchor=screw-1].guide-destination').count() == 1
            passed('4/4 판단 이후에도 미체결 나사를 특정, 잘못된 포장 선택과 필요한 작업 위치 안내')
            place('driver','screw',1); assert task() == 'check-marks'
            for check in ['marks','count','fastening']: page.locator(f'[data-input=final-check][data-check={check}]').check(force=True)
            assert task() == 'finish' and '1개' in page.locator('.remaining-help').inner_text()
            assert page.locator('[data-action=final].guide-source').count() == 1
            click('final'); assert page.locator('.save-status.saved').count() == 1
            help_open(); assert page.locator('#learning-help li[data-done=false]').count() == 0; help_close()
            passed('최종 확인 후 완료 버튼까지 명시, 완료·저장 후 도움말의 남은 항목 0개')

            click('next'); page.locator('#start-form [name=trainee]').fill('QA002')
            page.locator('#start-form button[type=submit]').click(force=True)
            before = record_text()
            page.once('dialog',lambda d:d.dismiss()); restart.click(force=True)
            assert record_text() == before and task() == 'confirm-power'
            page.once('dialog',lambda d:d.dismiss())
            page.locator('.course-selector [data-action=controller]').click(force=True)
            assert page.locator('.controller-panel').count() == 0 and record_text() == before
            page.once('dialog',lambda d:d.accept())
            page.locator('.course-selector [data-action=controller]').click(force=True)
            assert page.locator('.controller-panel').count() == 1 and record_text() != before
            page.locator('.controller-return').click(force=True); page.locator('#start-form').wait_for()
            assert page.locator('[data-action=controller]').is_visible()
            passed('교육 전환·재시작 확인 취소 시 진행 보존, 전환 승인 시 중단 결과 보관')

            page.locator('#start-form button[type=submit]').click(force=True)
            page.once('dialog',lambda d:d.accept()); restart.click(force=True)
            assert task() == 'confirm-power'
            widths=[]
            for width in [1366,1920,390]:
                page.set_viewport_size({'width':width,'height':1100})
                dims=page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})')
                assert dims['scrollWidth'] <= width, dims
                assert restart.is_visible() and page.locator('header [data-action=open-help]').is_visible()
                help_open(); bounds=page.locator('#learning-help').bounding_box()
                assert bounds['x'] >= 0 and bounds['x']+bounds['width'] <= width+1, bounds
                help_close();widths.append(dims)
            passed('보이는 재시작 승인 후 새 실습, 1366·1920·390px에서 메뉴·도움말 가로 넘침 없음')
            assert not errors and not external and not page.evaluate('window.qaCsp'), {'errors':errors,'external':external,'csp':page.evaluate('window.qaCsp')}
            passed('JavaScript 오류·외부 요청·보안 정책 위반 없음')
            result={'date':'2026-11-09','passed':len(report),'checks':report,'widths':widths,'pageErrors':errors,'externalRequests':external,'cspViolations':page.evaluate('window.qaCsp'),'screenshots':False}
            (output/'learning-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
            print(json.dumps(result,ensure_ascii=False,indent=2))
        finally:
            browser.close()


if __name__=='__main__':main()
