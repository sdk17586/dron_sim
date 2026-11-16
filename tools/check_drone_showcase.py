#!/usr/bin/env python3
"""Exercise the isolated drone guide, real mesh interactions and interruption paths."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--output',default='verification/drone-showcase-2026-11-13')
    args=parser.parse_args();output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    checks=[]
    def passed(label):checks.append(label);print('PASS',label,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
        try:
            page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(15000);page.clock.install()
            errors=[];external=[];policy=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('request',lambda request:external.append(request.url) if not request.url.startswith(args.url+'/') else None)
            page.expose_function('reportPolicy',lambda directive:policy.append(directive))
            page.add_init_script('document.addEventListener("securitypolicyviolation",e=>window.reportPolicy(e.effectiveDirective))')
            page.goto(args.url+'/?compatible3d=1')
            assert page.locator('.showcase-launch').count()==3
            page.evaluate('''async()=>{const {createState,buildResult}=await import('/src/domain/state.js');
                const {ResultRepository}=await import('/src/storage/result-repository.js');
                new ResultRepository(localStorage).add(buildResult(createState(),{status:'abandoned'}));}''')
            preserved=page.evaluate('localStorage.getItem("aerolab.results.v1")')
            page.screenshot(path=str(output/'home.png'),full_page=True)
            page.locator('[data-action=drone-showcase]').click();root=page.locator('.showcase')
            canvas=page.locator('.drone-3d-canvas[data-ready=true]');canvas.wait_for()
            assert root.get_attribute('data-showcase-kind')=='drone'
            assert canvas.get_attribute('data-model-source')=='px4-x500'
            passed('첫 화면의 세 가이드 진입 카드와 드론 X500 시연 모델 준비')
            def advance(ms):page.clock.run_for(ms)
            def command(action):page.locator(f'[data-showcase="{action}"]').click(force=True)
            def state():return root.get_attribute('data-showcase-state')
            def wait_operation():
                for _ in range(140):
                    advance(100)
                    if canvas.get_attribute('data-busy3d')=='true':return
                raise AssertionError('No placement animation started')
            wait_operation();step=root.get_attribute('data-showcase-step');battery=root.get_attribute('data-battery')
            command('toggle');advance(2500)
            assert state()=='paused' and root.get_attribute('data-showcase-step')==step
            assert root.get_attribute('data-battery')==battery and canvas.get_attribute('data-busy3d')=='false'
            command('toggle');advance(1600)
            assert state()=='playing' and root.get_attribute('data-battery')=='false'
            page.evaluate('window.dispatchEvent(new Event("blur"))');step=root.get_attribute('data-showcase-step');advance(1800)
            assert state()=='paused' and root.get_attribute('data-showcase-step')==step
            page.evaluate('window.dispatchEvent(new Event("focus"))');advance(200);assert state()=='paused'
            command('toggle')
            passed('배터리 이동 도중 일시정지·재개와 창 이탈 시 상태 보존, 초점 복귀만으로 자동 재생하지 않음')
            charged=removed=replaced=False
            for _ in range(95):
                advance(1000);assert not root.get_attribute('data-showcase-error')
                charged|=canvas.get_attribute('data-battery-level')=='100'
                removed|=root.get_attribute('data-blades')=='6' and root.get_attribute('data-screws')=='6'
                replaced|=root.get_attribute('data-repaired')=='true'
                if root.get_attribute('data-showcase-step')=='20' and root.get_attribute('data-blades')=='6':
                    page.screenshot(path=str(output/'removed-compatible.png'),full_page=True)
                if state()=='completed':break
            assert state()=='completed' and charged and removed and replaced
            assert root.get_attribute('data-checks')=='3' and root.get_attribute('data-battery')=='false' and root.get_attribute('data-power')=='false'
            assert root.get_attribute('data-blades')=='8' and root.get_attribute('data-screws')=='8'
            assert page.locator('#showcase-completion').evaluate('(e)=>e.open')
            assert page.locator('#showcase-completion h2').inner_text()=='프로펠러 정비를 마쳤습니다!'
            assert page.evaluate('localStorage.getItem("aerolab.results.v1")')==preserved
            page.screenshot(path=str(output/'complete-compatible.png'),full_page=True);page.keyboard.press('Escape')
            passed('32장면 자동 진행: 충전 배터리 확인·네 모터 판단·두 날개/나사 교체·체결·세 최종 확인·완료, 기록 보존')
            command('restart');wait_operation();command('restart');advance(1000)
            assert root.get_attribute('data-showcase-step')=='0' and root.get_attribute('data-battery')=='true' and root.get_attribute('data-power')=='true'
            assert root.get_attribute('data-screws')=='8' and canvas.get_attribute('data-busy3d')!='true'
            passed('작업 도중 처음부터 재시작하면 이전 완료 콜백 없이 새 기체·부품 상태로 초기화')
            page.emulate_media(reduced_motion='reduce');command('takeover');assert state()=='manual'
            def settle():
                advance(1000);assert canvas.get_attribute('data-busy3d')!='true'
            def mesh(id):
                page.locator('.showcase-stage').scroll_into_view_if_needed()
                node=page.locator(f'[data-spatial-id="{id}"]');assert node.count()==1 and not node.evaluate('(e)=>e.hidden'),id
                box=canvas.bounding_box();page.mouse.click(box['x']+float(node.get_attribute('data-x')),box['y']+float(node.get_attribute('data-y')));settle()
            def put(source,destination):
                mesh(source);assert canvas.get_attribute('data-holding3d'),source
                mesh(destination);assert not canvas.get_attribute('data-holding3d'),destination
            mesh('drone-power');mesh('drone-power');put('drone-battery','drone-discard')
            for motor in ['front-left','front-right','rear-left','rear-right']:
                mesh('motor-'+motor);command('replace' if motor=='front-left' else 'healthy');settle()
            for i in [0,1]:put('drone-driver',f'screw-front-left-{i}')
            mesh('blade-front-left-0');assert canvas.get_attribute('data-holding3d')=='mounted-blade'
            page.keyboard.press('Escape');advance(100)
            assert root.get_attribute('data-blades')=='8' and not canvas.get_attribute('data-holding3d')
            for i in [0,1]:put(f'blade-front-left-{i}','drone-discard')
            assert root.get_attribute('data-blades')=='6'
            page.locator('[data-showcase-kit]').select_option('B1');settle();put('new-blade-0','blade-front-left-0')
            assert root.get_attribute('data-blades')=='6' and '표식' in page.locator('[data-showcase-detail]').inner_text()
            page.locator('[data-showcase-kit]').select_option('A1');settle()
            for i in [0,1]:put(f'new-blade-{i}',f'blade-front-left-{i}')
            for i in [0,1]:put(f'new-screw-{i}',f'screw-front-left-{i}')
            for i in [0,1]:put('drone-driver',f'screw-front-left-{i}')
            for check in ['marks','count','fastening']:command('check-'+check);settle()
            command('complete');settle()
            assert state()=='completed' and root.get_attribute('data-checks')=='3'
            assert page.evaluate('localStorage.getItem("aerolab.results.v1")')==preserved
            page.keyboard.press('Escape')
            passed('직접 조작 전환 후 실제 3D 좌표 클릭으로 전체 교체 수행, 집기 취소·다른 표식 거부·완료와 기록 보존')
            sizes=[]
            for width,height in [(1920,1080),(1366,768),(390,844),(320,640)]:
                page.set_viewport_size({'width':width,'height':height});advance(250)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                assert page.locator('[data-showcase=restart]').is_visible();sizes.append([width,height])
            command('restart');advance(250);command('takeover');advance(200)
            assert page.locator('.showcase-scan span').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
            command('exit')
            assert page.locator('[data-action=drone-showcase]').count()==1
            assert page.evaluate('document.activeElement.dataset.action')=='drone-showcase'
            assert page.locator('#showcase-completion').count()==0
            assert page.evaluate('localStorage.getItem("aerolab.results.v1")')==preserved
            passed('1920·1366·390·320px 넘침 없음·동작 줄이기·종료 시 모달 제거·원래 드론 가이드 버튼으로 초점 복귀')
            fallback=browser.new_page();fallback.route('**/assets/models/x500/*.glb',lambda route:route.abort())
            fallback.goto(args.url+'/?compatible3d=1');fallback.locator('[data-action=drone-showcase]').click()
            fallback.locator('.drone-3d-canvas[data-model-status=error]').wait_for()
            assert fallback.locator('.drone-asset-note').is_visible()
            assert fallback.locator('.drone-3d-canvas').get_attribute('data-model-source')=='unavailable'
            fallback.unroute('**/assets/models/x500/*.glb')
            fallback.locator('[data-model-retry]').click()
            fallback.locator('[data-model-source=px4-x500][data-ready=true]').wait_for()
            fallback.close()
            missing=browser.new_page();missing.route('**/src/ui/drone3d.js',lambda route:route.abort())
            missing.goto(args.url+'/?compatible3d=1');missing.locator('[data-action=drone-showcase]').click()
            missing.locator('.showcase-load-error').wait_for();missing.locator('[data-action=showcase-exit]').click()
            assert missing.locator('[data-action=drone-showcase]').is_visible();missing.close()
            assert not errors and not external and not policy,{'errors':errors,'external':external,'policy':policy}
            passed('모델 실패 시 구형 형상 없이 안내·재시도·모듈 실패 시 홈 복귀, JavaScript·외부 요청·CSP 오류 없음')
            (output/'browser-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'sizes':sizes,'errors':errors,'external':external,'policy':policy,'backend':'SVG'},ensure_ascii=False,indent=2))
        finally:browser.close()


if __name__=='__main__':main()
