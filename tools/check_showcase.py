#!/usr/bin/env python3
"""Browser regression for the isolated presentation and its interruption paths."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/showcase-2026-11-12')
    parser.add_argument('--screenshots', action='store_true')
    parser.add_argument('--webgl', action='store_true')
    parser.add_argument('--manual-only', action='store_true')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    checks = []
    def passed(label):
        checks.append(label); print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'] +
                                   (['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] if args.webgl else ['--disable-gpu']))
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.set_default_timeout(15000); page.clock.install()
            errors, external, policy = [], [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: external.append(request.url) if not request.url.startswith(args.url.rstrip('/') + '/') else None)
            page.expose_function('reportPolicy', lambda directive: policy.append(directive))
            page.add_init_script('document.addEventListener("securitypolicyviolation", e => window.reportPolicy(e.effectiveDirective))')
            page.goto(args.url + ('/' if args.webgl else '/?compatible3d=1'))
            def click(action): page.locator(f'[data-showcase="{action}"]').click(force=True)
            def advance(ms): page.clock.run_for(ms)
            def state(): return page.locator('.showcase').get_attribute('data-showcase-state')
            def step(): return page.locator('.showcase').get_attribute('data-showcase-step')
            def settle():
                advance(1000)
                assert page.locator('.robot-3d-canvas').get_attribute('data-busy3d') != 'true'
            def mesh(id):
                page.locator(f'[data-spatial-id="{id}"]').click(force=True); settle()
            def put(source, destination): mesh(source); mesh(destination)
            # A valid existing result must survive every presentation path byte for byte.
            page.evaluate('''async () => {
                const {createRobotState, buildRobotResult} = await import('/src/domain/quadruped.js');
                const {ResultRepository} = await import('/src/storage/result-repository.js');
                new ResultRepository(localStorage).add(buildRobotResult(createRobotState(), {status:'abandoned'}));
            }''')
            preserved = page.evaluate('localStorage.getItem("aerolab.results.v1")')
            page.locator('[data-action="showcase"]').click()
            page.locator('.robot-3d-canvas[data-ready="true"]').wait_for()
            backend = page.locator('.robot-3d-canvas').get_attribute('data-render-backend')
            if args.screenshots: page.screenshot(path=str(output/'overview.png'), full_page=True)
            passed('첫 화면의 자동 시연 진입과 3D 모델 준비')
            if not args.manual_only:
                # Test pausing a real in-flight placement, not only a title slide.
                for _ in range(100):
                    advance(150)
                    if page.locator('.robot-3d-canvas').get_attribute('data-busy3d') == 'true': break
                before = step(); modules = page.locator('.showcase').get_attribute('data-modules')
                click('toggle'); advance(3000)
                assert state() == 'paused' and step() == before
                assert page.locator('.showcase').get_attribute('data-modules') == modules
                click('toggle'); advance(2000)
                assert state() == 'playing' and not page.locator('.showcase').get_attribute('data-showcase-error')
                passed('부품 이동 중 일시정지는 취소·상태 보존, 재생 시 중복 작업 없이 이어감')
                page.evaluate('window.dispatchEvent(new Event("blur"))'); before = step(); advance(2000)
                assert state() == 'paused' and step() == before
                page.evaluate('window.dispatchEvent(new Event("focus"))'); advance(500)
                assert state() == 'paused'
                click('toggle')
                passed('창 초점 상실 시 중단하며 복귀만으로 자동 재개하지 않음')
                saw_repair = saw_reveal = False
                for _ in range(90):
                    advance(1000)
                    assert not page.locator('.showcase').get_attribute('data-showcase-error')
                    if page.locator('.showcase').get_attribute('data-showcase-stage') == '3' and int(step()) >= 16 and not saw_repair:
                        saw_repair = True
                        if args.screenshots: page.screenshot(path=str(output/'repair.png'), full_page=True)
                    if state() == 'reveal' and not saw_reveal:
                        saw_reveal = True
                        assert page.locator('.robot-3d-canvas').get_attribute('data-modules') == '4'
                        assert page.locator('.robot-3d-canvas').get_attribute('data-supported') == 'false'
                        if args.screenshots: page.screenshot(path=str(output/'recovery.png'), full_page=True)
                    if state() == 'completed': break
                assert state() == 'completed' and saw_repair and saw_reveal
                assert page.locator('#showcase-completion').evaluate('(d)=>d.open')
                assert page.locator('.robot-3d-canvas').get_attribute('data-driving') == 'false'
                assert page.locator('.robot-3d-canvas').get_attribute('data-reveal-frame')
                assert page.evaluate('localStorage.getItem("aerolab.results.v1")') == preserved
                page.keyboard.press('Escape')
                assert not page.locator('#showcase-completion').evaluate('(d)=>d.open')
                passed('30장면 자동 교체·체결·시험·안전 종료 후 별도 정상 모델 보행과 완료 표시, 기록 보존')
            page.emulate_media(reduced_motion='reduce')
            click('restart'); advance(1500); click('takeover'); assert state() == 'manual'
            before = step(); advance(3000); assert step() == before
            mesh('robot-estop'); mesh('robot-power'); put('robot-stand','robot-stand-slot'); put('robot-battery','robot-discard')
            for leg in ['front-left','front-right','rear-left','rear-right']:
                mesh('leg-'+leg); click('replace' if leg == 'front-left' else 'healthy'); advance(1000)
            mesh('connector-front-left')
            for i in [0,1]: put('robot-driver',f'bolt-front-left-{i}')
            put('module-front-left','robot-discard'); put('robot-spare','module-front-left')
            for i in [0,1]: put('robot-driver',f'bolt-front-left-{i}')
            mesh('connector-front-left'); put('robot-stored-battery','robot-battery'); mesh('robot-power'); mesh('robot-estop')
            click('test'); page.evaluate('window.dispatchEvent(new Event("blur"))'); advance(4000)
            assert page.locator('.robot-3d-canvas').get_attribute('data-testing') == 'false'
            assert page.locator('[data-motion]').inner_text() != '관절 시험 완료'
            click('test'); advance(3500); mesh('robot-estop'); mesh('robot-power'); click('complete')
            click('reveal'); advance(11000)
            assert state() == 'completed' and page.evaluate('localStorage.getItem("aerolab.results.v1")') == preserved, {'state':state(),'title':page.locator('[data-showcase-title]').inner_text(),'detail':page.locator('[data-showcase-detail]').inner_text()}
            page.keyboard.press('Escape')
            passed('자동 시연에서 직접 조작으로 전환해 교체·시험·완료까지 수행, 시험 중 창 이탈은 성공 처리하지 않음')
            sizes=[]
            for width,height in [(1366,768),(1920,1080),(390,844),(320,640)]:
                page.set_viewport_size({'width':width,'height':height}); advance(300)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                assert page.locator('[data-showcase="restart"]').is_visible()
                sizes.append([width,height])
            page.emulate_media(reduced_motion='reduce');click('restart');advance(1200);click('takeover')
            assert page.locator('.showcase-scan').evaluate('(e)=>getComputedStyle(e.querySelector("span")).animationName') == 'none'
            passed('1366·1920·390·320px 가로 넘침 없음, 동작 줄이기 설정에서 스캔 애니메이션 생략')
            click('exit'); assert page.locator('[data-action="showcase"]').count() == 1
            assert page.locator('#showcase-completion').count() == 0
            assert page.evaluate('localStorage.getItem("aerolab.results.v1")') == preserved
            assert not errors and not external and not policy, {'errors':errors,'external':external,'policy':policy}
            passed('종료 시 시연 모달·화면 정리, 원래 교육 결과 보존, JavaScript·외부 요청·CSP 오류 없음')
            (output/('manual-results.json' if args.manual_only else 'browser-results.json')).write_text(json.dumps({'passed':len(checks),'checks':checks,'backend':backend,'sizes':sizes,'errors':errors,'external':external,'policy':policy},ensure_ascii=False,indent=2))
        finally: browser.close()


if __name__ == '__main__': main()
