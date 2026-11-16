#!/usr/bin/env python3
"""Check real home models, preview interaction, navigation, layout and load failures."""
import argparse
import json
from pathlib import Path
from browser_courses import choose_course
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/home-equipment-2026-11-13')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    checks, errors, external = [], [], []
    def passed(label):
        checks.append(label)
        print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1080})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: external.append(request.url) if not request.url.startswith(args.url + '/') else None)
            page.add_init_script('window.qaCsp=[];document.addEventListener("securitypolicyviolation",e=>qaCsp.push(e.effectiveDirective));')
            def ready():
                for kind in ['drone', 'robot', 'panda']:
                    page.locator(f'[data-home-preview={kind}][data-ready=true]').wait_for()
            def home():
                page.locator('[data-action=home]').first.click()
                ready()
            page.goto(args.url + '/?compatible3d=1')
            ready()
            for kind, source in [('drone', 'px4-x500'), ('robot', 'unitree-go2'), ('panda', 'franka-panda')]:
                preview = page.locator(f'[data-equipment-preview={kind}]')
                canvas = preview.locator('[data-home-preview]')
                assert canvas.get_attribute('data-model-source') == source
                assert canvas.locator('path').count() > 100
                assert preview.locator('[data-workshop=true]').count() == 0
                assert preview.locator('button:visible').count() == 0
                card = preview.locator('xpath=../..').locator('.course-card')
                assert preview.bounding_box()['y'] + preview.bounding_box()['height'] <= card.bounding_box()['y']
            page.screenshot(path=str(output / 'home-compatible.png'), full_page=True)
            passed('세 교육 박스 위에 실제 X500·Go2·Panda 3D 형상 표시, 정비 조작·고장 없이 소개')
            preview = page.locator('[data-home-preview=drone]')
            before = preview.inner_html()
            preview.focus()
            preview.press('ArrowRight')
            assert preview.inner_html() != before
            robot = page.locator('[data-home-preview=robot]')
            before = robot.inner_html()
            box = robot.bounding_box()
            page.mouse.move(box['x'] + box['width'] * .55, box['y'] + box['height'] * .5)
            page.mouse.down()
            page.mouse.move(box['x'] + box['width'] * .7, box['y'] + box['height'] * .53, steps=8)
            page.mouse.up()
            assert robot.inner_html() != before
            passed('미리보기 방향키·실제 마우스 드래그 회전')
            page.evaluate('''async()=>{
                window.qaHomeDisposed=[];
                const {DroneViewport}=await import('/src/ui/drone3d.js');
                const {QuadrupedViewport}=await import('/src/ui/quadruped3d.js');
                const {PandaViewport}=await import('/src/ui/panda3d.js');
                for(const Class of [DroneViewport,QuadrupedViewport,PandaViewport]){
                    const dispose=Class.prototype.dispose;
                    Class.prototype.dispose=function(){if(this.canvas.dataset.homePreview)qaHomeDisposed.push(this.canvas.dataset.homePreview);dispose.call(this);};
                }
            }''')
            saved = page.evaluate('localStorage.getItem("aerolab.results.v1")')
            choose_course(page, 'intro-drone')
            page.locator('#drone-viewport [data-model-source=px4-x500][data-ready=true]').wait_for()
            assert page.locator('[data-home-preview]').count() == 0
            assert {'drone', 'robot', 'panda'} <= set(page.evaluate('qaHomeDisposed'))
            home()
            choose_course(page, 'robot')
            page.locator('#robot-viewport [data-model-source=unitree-go2][data-ready=true]').wait_for()
            home()
            for action in ['drone-showcase', 'showcase']:
                page.locator(f'[data-action={action}]').click()
                page.locator('.showcase [data-ready=true]').wait_for()
                page.locator('[data-action=showcase-exit]').click()
                ready()
            assert page.evaluate('localStorage.getItem("aerolab.results.v1")') == saved
            passed('두 교육 소개·두 가이드 진입/홈 복귀, 미리보기 자원 해제·교육 기록 보존')
            sizes = []
            for width, height in [(1920, 1080), (1366, 768), (390, 844), (320, 640)]:
                page.set_viewport_size({'width': width, 'height': height})
                page.wait_for_function('()=>[...document.querySelectorAll("[data-home-preview]")].every(e=>Number(e.getAttribute("width"))===e.parentElement.clientWidth)')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                boxes = page.locator('.course-option').evaluate_all('(es)=>es.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.clientWidth}))')
                if width > 760:
                    assert abs(boxes[0]['y'] - boxes[1]['y']) < 1
                    assert all(card.bounding_box()['y'] + card.bounding_box()['height'] <= height for card in page.locator('.course-home .course-card').all())
                else:
                    assert boxes[1]['y'] > boxes[0]['y'] and abs(boxes[0]['x'] - boxes[1]['x']) < 1
                sizes.append([width, height])
                page.screenshot(path=str(output / f'home-{width}.png'), full_page=True)
            passed('1920·1366px에서 세 장비와 교육 박스 표시, 390·320px 세로 배치·가로 넘침 없음')
            failed = browser.new_page()
            failed.route('**/assets/models/x500/*.glb', lambda route: route.abort())
            failed.goto(args.url + '/?compatible3d=1')
            drone = failed.locator('[data-equipment-preview=drone]')
            drone.locator('[data-model-status=error]').wait_for()
            failed.locator('[data-home-preview=robot][data-ready=true]').wait_for()
            assert failed.locator('[data-action=drone-education]').is_enabled()
            failed.unroute('**/assets/models/x500/*.glb')
            drone.locator('[data-model-retry]').click()
            drone.locator('[data-home-preview=drone][data-ready=true]').wait_for()
            failed.close()
            passed('한 장비 로드 실패 시 다른 장비/교육 버튼 유지, 재시도 후 크기·조작 복원')
            missing = browser.new_page()
            missing.route('**/src/ui/home-equipment.js', lambda route: route.abort())
            missing.goto(args.url + '/?compatible3d=1')
            missing.locator('[data-equipment-preview=drone]').get_by_text('미리보기를 준비하지 못했습니다.', exact=False).wait_for()
            choose_course(missing, 'intro-drone')
            missing.locator('#drone-viewport [data-ready=true]').wait_for()
            missing.close()
            passed('미리보기 모듈이 없어도 첫 화면·기존 교육 진입 유지')
            race = browser.new_page()
            race.add_init_script('''window.Worker=class {postMessage(){setTimeout(()=>this.onmessage?.({data:{available:false}}),600)}terminate(){}};''')
            race.goto(args.url + '/')
            choose_course(race, 'intro-drone')
            race.locator('#drone-viewport [data-ready=true]').wait_for()
            assert race.locator('[data-home-preview]').count() == 0
            race.close()
            assert not errors and not external and not page.evaluate('qaCsp'), {'errors': errors, 'external': external, 'policy': page.evaluate('qaCsp')}
            passed('표시 방식 확인 도중 교육을 선택해도 정상 진입, JavaScript·외부 요청·CSP 오류 없음')
        finally:
            browser.close()
        webgl = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            detail = webgl.new_page(viewport={'width': 1440, 'height': 1080})
            detail.goto(args.url + '/')
            for kind in ['drone', 'robot', 'panda']:
                canvas = detail.locator(f'[data-home-preview={kind}][data-ready=true]')
                canvas.wait_for()
                assert canvas.get_attribute('data-render-backend') == 'webgl' and canvas.get_attribute('data-model-quality') == 'detail'
            detail.screenshot(path=str(output / 'home-webgl.png'), full_page=True)
            passed('WebGL에서 세 상세 모델·카본 텍스처 동시 표시와 화면 캡처')
        finally:
            webgl.close()
    (output / 'browser-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks, 'sizes': sizes, 'errors': errors, 'external': external}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
