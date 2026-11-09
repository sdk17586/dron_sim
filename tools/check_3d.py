#!/usr/bin/env python3
"""Check the interactive 3D scene and its connection to the maintenance state."""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='/tmp/aerolab-3d-checks')
    args = parser.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    class Report(list):
        def append(self, value):
            super().append(value)
            print('PASS', value, flush=True)
    report = Report()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'])
        try:
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            external = []
            def route(request):
                if request.request.url.startswith(args.url + '/'):
                    request.continue_()
                else:
                    external.append(request.request.url); request.abort()
            context.route('**/*', route)
            page = context.new_page(); errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script("""window.qaCspViolations=[];
                document.addEventListener('securitypolicyviolation',event=>{
                    window.qaCspViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI});
                });""")
            page.goto(args.url)
            canvas = page.locator('.drone-3d-canvas[data-ready="true"]'); canvas.wait_for()
            assert canvas.get_attribute('data-blades') == '8' and canvas.get_attribute('data-screws') == '8'
            assert int(canvas.get_attribute('data-triangles')) > 1000
            page.evaluate('window.qaCanvas=document.querySelector(".drone-3d-canvas")')
            (output / 'drone-initial.svg').write_text(canvas.evaluate('(c)=>new XMLSerializer().serializeToString(c)'))
            report.append('3D 기체: 4개 모터, 날개 8개, 나사 8개 표시')
            def check_colors():
                colors = canvas.evaluate(r"""c=>{
                    const paths=[...c.querySelectorAll('path')];
                    const faces=paths.filter(n=>n.hasAttribute('fill-opacity'));
                    const lines=paths.filter(n=>n.hasAttribute('stroke'));
                    const faceColors=[...new Set(faces.map(n=>getComputedStyle(n).fill))];
                    const expectedFill=n=>'rgb('+n.getAttribute('fill').match(/-?\d+/g)
                        .map(value=>Math.max(0,Math.min(255,Number(value)))).join(', ')+')';
                    return {
                        distinctFaceColors:faceColors.length,
                        sampleFaceColors:faceColors.slice(0,8),
                        facesMatch:faces.length>1000&&faces.every(n=>
                            getComputedStyle(n).fill===expectedFill(n)
                            &&getComputedStyle(n).stroke==='none'),
                        linesVisible:lines.length>0&&lines.every(n=>
                            getComputedStyle(n).fill==='none'&&getComputedStyle(n).stroke!=='none'),
                        inlineStyles:paths.filter(n=>n.hasAttribute('style')).length
                    };
                }""")
                assert colors['distinctFaceColors'] > 20 and colors['facesMatch'] and colors['linesVisible'] and not colors['inlineStyles'], colors
                assert not page.evaluate('window.qaCspViolations'), page.evaluate('window.qaCspViolations.slice(0,5)')
                return colors
            initial_colors = check_colors()
            report.append('브라우저 실제 색상: 면·격자 표시 정상, CSP 위반 없음')
            def fingerprint():
                return hashlib.sha256(canvas.inner_html().encode()).hexdigest()
            initial = fingerprint(); canvas.focus(); page.keyboard.press('ArrowLeft')
            assert fingerprint() != initial
            report.append('키보드 회전: 실제 3D 투영 결과 변경')
            bounds = canvas.bounding_box(); x = bounds['x'] + bounds['width'] * .5; y = bounds['y'] + bounds['height'] * .5
            before = fingerprint(); page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 60, y + 20, steps=1); page.mouse.up()
            assert fingerprint() != before
            report.append('마우스 드래그: 회전 확인')
            before = fingerprint()
            canvas.evaluate("c=>c.dispatchEvent(new WheelEvent('wheel',{deltaY:-180,bubbles:true,cancelable:true}))")
            assert fingerprint() != before
            report.append('휠 이벤트: 확대 확인')
            def click(action, extra=''):
                page.locator(f'[data-action="{action}"]{extra}').first.click(force=True)
            click('view-all'); canvas.focus()
            for _ in range(12): page.keyboard.press('ArrowUp')
            label = page.locator('.three-motor-label[data-motor="rear-right"]'); bounds = label.bounding_box()
            page.evaluate('document.querySelector(".three-labels").style.visibility="hidden"')
            page.mouse.click(bounds['x'] + bounds['width']/2, bounds['y'] + bounds['height']/2)
            assert canvas.get_attribute('data-selected-motor') == 'rear-right'
            report.append('3D 기체 직접 클릭: 모터 선택 확인')
            click('view-all')
            page.locator('#start-form button[type="submit"]').click(force=True)
            click('confirm-power')
            def piece_node(kind, index=None):
                locator = page.locator('[data-piece]')
                for i in range(locator.count()):
                    value = json.loads(locator.nth(i).get_attribute('data-piece'))
                    if value['kind'] == kind and (index is None or value.get('index') == index): return locator.nth(i)
                raise AssertionError(f'missing piece {kind} {index}')
            def target_node(kind, index=None):
                locator = page.locator('[data-drop]')
                for i in range(locator.count()):
                    value = json.loads(locator.nth(i).get_attribute('data-drop'))
                    if value['kind'] == kind and (index is None or value.get('index') == index): return locator.nth(i)
                raise AssertionError(f'missing target {kind} {index}')
            def drag(source, target=None, point=None):
                a = source.bounding_box(); b = target.bounding_box() if target else None
                x, y = a['x']+a['width']/2, a['y']+a['height']/2
                tx, ty = (b['x']+b['width']/2,b['y']+b['height']/2) if b else point
                page.mouse.move(x,y); page.mouse.down(); page.mouse.move(tx,ty,steps=1); page.mouse.up()
            drag(piece_node('battery'), target_node('discard'))
            assert page.locator('.tool-piece').count() == 1 and page.locator('.new-parts .inventory-piece').count() == 4
            report.append('실제 드래그: 배터리를 수거함에 놓아 분리')
            click('select-motor', '[data-motor="front-left"]'); click('answer-replace')
            before = fingerprint()
            drag(piece_node('mounted-blade', 0), point=(20,95))
            assert canvas.get_attribute('data-blades') == '8' and fingerprint() == before
            report.append('잘못된 위치에 놓기: 부품·3D 상태 보존')
            piece_node('driver').focus(); page.keyboard.press('Enter')
            assert page.locator('#app').get_attribute('data-holding') == 'driver'
            page.keyboard.press('Escape')
            assert page.locator('#app').get_attribute('data-holding') is None
            assert canvas.get_attribute('data-selected-motor') == 'front-left'
            report.append('키보드 집기·Esc 취소: 선택·카메라 유지')
            drag(piece_node('mounted-blade',0),target_node('discard'))
            assert canvas.get_attribute('data-blades') == '8'
            assert '나사를 먼저' in page.locator('.feedback').inner_text()
            report.append('고정된 날개 드래그: 분리 차단·안내')
            drag(piece_node('driver'), target_node('screw',0))
            assert canvas.get_attribute('data-screws') == '7'
            drag(piece_node('mounted-blade',0), target_node('discard'))
            assert canvas.get_attribute('data-blades') == '7'
            (output / 'drone-part-removed.svg').write_text(canvas.evaluate('(c)=>new XMLSerializer().serializeToString(c)'))
            page.locator('#kit').select_option('B1')
            drag(piece_node('blade',0), target_node('blade',0))
            assert canvas.get_attribute('data-blades') == '7' and '표식' in page.locator('.feedback').inner_text()
            page.locator('#kit').select_option('A1')
            report.append('표식이 다른 부품 드래그: 장착 차단·원본 보존')
            drag(piece_node('blade',0), target_node('blade',0))
            drag(piece_node('screw',0), target_node('screw',0))
            assert page.locator('.screw-point.unfastened').count() == 1
            drag(piece_node('driver'), target_node('screw',0))
            assert not page.locator('.screw-point.unfastened').count()
            assert canvas.get_attribute('data-blades') == '8' and canvas.get_attribute('data-screws') == '8'
            report.append('실제 드래그: 나사·날개 분리 → 새 부품 장착 → 드라이버 체결')
            def open_settings():
                if page.locator('.more-menu').get_attribute('open') is None: page.locator('.more-menu > summary').click(force=True)
            before = fingerprint(); open_settings(); page.locator('[data-input="exploded"]').check(force=True)
            assert canvas.get_attribute('data-exploded') == 'true' and fingerprint() != before
            assert canvas.get_attribute('data-blades') == '8'
            open_settings(); page.locator('[data-input="exploded"]').uncheck(force=True)
            assert canvas.get_attribute('data-exploded') == 'false'
            report.append('접힌 설정의 구조 보기: 부품 개수 유지')
            open_settings(); page.locator('[data-input="view-mode"]').select_option('2d')
            assert page.locator('.workbench .drone-svg').count() == 1
            assert page.locator('.flat-points .blade-point,.flat-points .screw-point').count() == 4
            open_settings(); page.locator('[data-input="view-mode"]').select_option('3d'); canvas.wait_for()
            assert page.evaluate('window.qaCanvas===document.querySelector(".drone-3d-canvas")')
            assert canvas.get_attribute('data-blades') == '8'
            report.append('2D↔3D 전환: 조작 지점·렌더러·실습 상태 유지')
            for width in [1366, 1920, 390]:
                page.set_viewport_size({'width': width, 'height': 900})
                assert page.evaluate('document.documentElement.scrollWidth') <= width
            report.append('반응형: 1366·1920·390px 가로 넘침 없음')
            final_colors = check_colors()
            report.append('회전·부품 교체·화면 전환 후에도 색상·선 표시 정상')
            assert not errors and not external, {'errors': errors, 'external': external}
            report.append('JavaScript 오류·외부 요청 없음')
            fallback = context.new_page()
            fallback.add_init_script("""const original=HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext=function(type,...args){
                    return type==='webgl2'?null:original.call(this,type,...args);
                };""")
            fallback.goto(args.url + '/?compatible3d=0')
            fallback.locator('.renderer-notice').wait_for()
            assert fallback.locator('.workbench .drone-svg').count() == 1
            fallback.locator('#start-form button[type="submit"]').click(force=True)
            fallback.locator('[data-action="confirm-power"]').wait_for()
            report.append('WebGL 사용 불가: 2D 전환·실습 시작 정상')
            result = {'date': '2026-11-06', 'renderer': 'Three.js 0.181.2 SVGRenderer (compatible 3D)',
                'passed': len(report), 'checks': report, 'browserColors': {'initial': initial_colors, 'afterInteraction': final_colors},
                'cspViolations': page.evaluate('window.qaCspViolations'), 'webglHardwareVerified': False}
            (output / '3d-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
            print(json.dumps(result, ensure_ascii=False, indent=2))
        finally:
            browser.close()

if __name__ == '__main__':
    main()
