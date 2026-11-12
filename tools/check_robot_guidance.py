#!/usr/bin/env python3
"""Complete maintenance using the visible current-task guidance only."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='verification/robot-guidance-2026-11-12')
    output = Path(parser.parse_args().output); output.mkdir(parents=True, exist_ok=True)
    checks = []
    def passed(label):
        checks.append(label); print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        try:
            context = browser.new_context(viewport={'width':1366, 'height':1100})
            page = context.new_page(); page.set_default_timeout(15000)
            errors, external = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            context.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://127.0.0.1:8000/') else (external.append(route.request.url), route.abort()))
            page.add_init_script("window.qaCsp=[];document.addEventListener('securitypolicyviolation',e=>qaCsp.push(e.effectiveDirective));")
            def click(action): page.locator(f'[data-action="{action}"]').first.click(force=True)
            def task(): return page.locator('[data-current-task]').get_attribute('data-current-task')
            def phase(): return page.locator('.robot-workflow [aria-current=step]').inner_text().splitlines()[-1]
            def perform_highlight():
                source = page.locator('.guide-source').first
                assert source.count() == 1 and source.is_enabled(), {'task':task(), 'source':source.count()}
                destination = page.locator('.guide-destination').first
                has_destination = destination.count() > 0
                source.click(force=True)
                if has_destination: destination.click(force=True)
            page.goto('http://127.0.0.1:8000/'); click('robot')
            page.locator('#robot-start-form button[type=submit]').click(force=True)
            page.locator('.robot-3d-canvas[data-ready=true]').wait_for()
            assert task() == 'robot-estop' and phase() == '안전 준비'
            assert page.locator('.robot-prep-steps [aria-current=step]').inner_text().startswith('1')
            assert '비상 정지 걸기' in page.locator('.guide-source').inner_text()
            assert page.locator('.robot-driver,.robot-spare-module').count() == 0
            assert page.locator('.guide-up-next').is_visible()
            passed('첫 작업·현재 준비 단계·바로 다음 작업 표시, 현재 버튼 강조와 불필요한 공구 숨김')
            widths = []
            for width, height in [(1366,768),(1920,1080),(390,844)]:
                page.set_viewport_size({'width':width,'height':height})
                assert page.evaluate('document.documentElement.scrollWidth') <= width
                assert page.locator('.robot-workflow li').count() == 4
                click('open-help'); assert page.locator('#learning-help').evaluate('(d)=>d.open')
                page.keyboard.press('Escape'); assert task() == 'robot-estop'
                widths.append(width)
            page.set_viewport_size({'width':1366,'height':1100})
            passed('1366·1920·390px 네 단계 표시·가로 넘침 없음, 도움말 열람 후 현재 작업 유지')
            ids = ['robot-estop','robot-power-off','robot-support','robot-battery-out']
            for index, expected in enumerate(ids):
                assert task() == expected
                assert page.locator('.robot-prep-steps [data-prep-state=done]').count() == index
                perform_highlight()
            assert phase() == '네 다리 점검' and task().startswith('robot-inspect-')
            assert page.locator('.robot-prep-steps').count() == 0
            assert page.locator('.robot-driver,.robot-spare-module').count() == 0
            passed('강조된 대상만 따라 비상 정지→전원 차단→받침대→배터리 분리 후 관절 점검 진입')
            click('locate-task')
            for count in range(4):
                current = task(); assert current.startswith('robot-inspect-')
                leg = current.removeprefix('robot-inspect-')
                assert page.locator(f'.robot-leg-button[data-leg="{leg}"]').get_attribute('aria-pressed') == 'true'
                assert page.locator('.robot-observation').is_visible()
                damaged = page.locator('.robot-observation path[stroke="#edb16b"]').count() > 0
                click('robot-replace' if damaged else 'robot-healthy')
                if count < 3:
                    assert phase() == '네 다리 점검' and task() != current
                    assert page.locator('.robot-driver,.robot-module-slot').count() == 0
            assert phase() == '모듈 교체' and task().startswith('robot-disconnect-')
            assert '커넥터 분리하기' in page.locator('.guide-source').inner_text()
            assert page.locator('.robot-driver,.robot-spare-module').count() == 2
            passed('네 다리 판단마다 다음 관절 자동 확대, 모두 판단한 뒤 손상 관절·커넥터·공구로 안내')
            repair_steps = []
            for _ in range(12):
                if phase() != '모듈 교체': break
                repair_steps.append(task()); perform_highlight()
            assert len(repair_steps) == 8 and phase() == '작동 확인'
            assert task() == 'robot-battery-in'
            assert page.locator('.robot-driver,.robot-spare-module').count() == 0
            passed('커넥터·두 볼트·모듈 수거·새 모듈·두 볼트 체결·연결을 순서대로 안내하고 배터리 복구로 전환')
            final_steps = []
            for _ in range(10):
                current = task()
                if current == 'robot-completed': break
                final_steps.append(current); perform_highlight()
                if current == 'robot-test':
                    page.locator('.robot-test-status').filter(has_text='네 다리 가상 시험 완료').wait_for()
            assert task() == 'robot-completed'
            assert page.locator('.robot-workflow [data-workflow-state=done]').count() == 4
            assert page.locator('.robot-save-status.saved').is_visible()
            record = page.evaluate('JSON.parse(localStorage.getItem("aerolab.results.v1")).records.at(-1)')
            assert record['status'] == 'completed' and not record['errors']
            assert final_steps == ['robot-battery-in','robot-test-power','robot-release-stop','robot-test','robot-final-stop','robot-final-power','robot-finish']
            passed('최종 안내만 따라 배터리·전원·시험·정지·완료까지 실수 없이 종료·결과 저장')
            assert not errors and not external and not page.evaluate('qaCsp'), {'errors':errors, 'external':external, 'csp':page.evaluate('qaCsp')}
            passed('JavaScript 오류·외부 요청·보안 정책 위반 없음')
            (output/'guidance-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'widths':widths,'repairSteps':repair_steps,'finalSteps':final_steps,'pageErrors':errors,'externalRequests':external,'cspViolations':page.evaluate('qaCsp'),'screenshots':False}, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
