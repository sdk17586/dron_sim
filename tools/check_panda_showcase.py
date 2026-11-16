#!/usr/bin/env python3
"""Run the isolated Panda guide, playback interruptions and course entry."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--output',default='verification/panda-gripper-2026-11-13/guide-svg')
    parser.add_argument('--webgl',action='store_true')
    args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    checks,errors,external=[],[],[]
    def passed(label):checks.append(label);print('PASS',label,flush=True)
    with sync_playwright() as p:
        flags=['--no-sandbox','--disable-dev-shm-usage']+(['--use-angle=swiftshader','--enable-unsafe-swiftshader'] if args.webgl else ['--disable-gpu'])
        browser=p.chromium.launch(headless=True,args=flags)
        context=browser.new_context(viewport={'width':1440,'height':1080})
        context.on('page',lambda page:page.on('pageerror',lambda error:errors.append(str(error))))
        context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(args.url+'/') else (external.append(route.request.url),route.abort()))
        context.add_init_script('window.qaPolicy=[];document.addEventListener("securitypolicyviolation",e=>qaPolicy.push(e.effectiveDirective));try{localStorage.setItem("aerolab.voice.v1","false")}catch{}')
        page=context.new_page();page.clock.install(time='2026-11-13T01:00:00Z')
        try:
            page.goto(args.url+('/' if args.webgl else '/?compatible3d=1'))
            assert page.locator('.showcase-launch').count()==3
            page.evaluate('''async()=>{const {createState,buildResult}=await import('/src/domain/state.js');const {ResultRepository}=await import('/src/storage/result-repository.js');new ResultRepository(localStorage).add(buildResult(createState(),{status:'abandoned'}));}''')
            baseline=page.evaluate('localStorage.getItem("aerolab.results.v1")')
            page.locator('[data-action=panda-showcase]').click()
            root=page.locator('.showcase');canvas=page.locator('.panda-3d-canvas[data-ready=true]');canvas.wait_for()
            assert root.get_attribute('data-showcase-kind')=='panda'
            assert canvas.get_attribute('data-model-source')=='franka-panda'
            assert canvas.get_attribute('data-render-backend')==('webgl' if args.webgl else 'svg')
            page.screenshot(path=str(out/'guide.png'),full_page=True)
            page.clock.pause_at('2026-11-13T02:00:00Z')
            def command(name):page.locator(f'[data-showcase="{name}"]').click(force=True)
            def advance(ms):page.clock.run_for(ms)
            def state():return root.get_attribute('data-showcase-state')
            def progress():return page.locator('.showcase-progress').evaluate('(e)=>e.value')
            def tcp():return canvas.get_attribute('data-tcp')
            def preserved():assert page.evaluate('localStorage.getItem("aerolab.results.v1")')==baseline
            def until(check,limit=900):
                for _ in range(limit):
                    if check():return
                    advance(100)
                    assert not root.get_attribute('data-showcase-error')
                raise AssertionError('guide condition timeout')
            command('restart');assert root.get_attribute('data-showcase-step')=='0'
            passed('첫 화면 세 가이드 중 로봇팔 진입·실제 Panda 상세/호환 모델·독립 시연 화면')
            until(lambda:root.get_attribute('data-showcase-step')=='3')
            advance(350);before=tcp();percent=progress();scene=root.get_attribute('data-showcase-step')
            command('toggle');advance(4000)
            assert state()=='paused' and tcp()==before and progress()==percent and root.get_attribute('data-showcase-step')==scene
            command('toggle');advance(300);assert state()=='playing' and tcp()!=before
            page.evaluate('window.dispatchEvent(new Event("blur"))');before=tcp();percent=progress();advance(2000)
            page.evaluate('window.dispatchEvent(new Event("focus"))');advance(200)
            assert state()=='paused' and tcp()==before and progress()==percent
            command('toggle');advance(200);page.keyboard.press('Escape');before=tcp();advance(2000)
            assert state()=='paused' and tcp()==before
            preserved();passed('동작 중 일시정지·이어 재생·창 이탈/Esc 정지·초점 복귀만으로 자동 재생하지 않음')
            command('restart');assert root.get_attribute('data-mission-phase')=='brief'
            phases=set()
            for _ in range(500):
                phases.add(root.get_attribute('data-mission-phase'));advance(100)
                assert not root.get_attribute('data-showcase-error')
                if state()=='completed':break
            assert state()=='completed' and {'brief','choose','cutting','returning','complete'}<=phases,phases
            assert progress()==100 and root.get_attribute('data-mission-phase')=='complete'
            assert root.get_attribute('data-cut')=='green'
            assert page.locator('#showcase-completion').is_visible()
            assert '직접 훈련하기' in page.locator('#showcase-completion').inner_text()
            assert not page.locator('#course-completion').is_visible()
            page.locator('#showcase-completion [data-dismiss-completion]').click(force=True)
            if not args.webgl:page.screenshot(path=str(out/'completed.png'),full_page=True)
            preserved();passed('35초·7장면 목표/선 선택/가상 절단/복귀 전체 완료·기록 분리')
            command('toggle');assert state()=='playing' and root.get_attribute('data-mission-phase')=='brief' and progress()==0
            command('toggle')
            for width,height in [(1366,768),(390,844),(320,640)]:
                page.set_viewport_size({'width':width,'height':height});advance(1300)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
                for action in ['toggle','restart','takeover','exit']:
                    box=page.locator(f'[data-showcase={action}]').bounding_box();assert box and box['x']>=0 and box['x']+box['width']<=width+1,(width,action,box)
                if not args.webgl:page.screenshot(path=str(out/f'guide-{width}.png'),full_page=True)
            preserved();passed('완료 후 다시 재생·1366/390/320px 가로 넘침 없음·모든 재생/훈련/종료 버튼 접근')
            command('takeover');assert page.locator('.equipment-course-hub[data-education-kind=panda]').is_visible()
            assert page.locator('.showcase').count()==0 and page.locator('#showcase-completion').count()==0
            page.locator('[data-action=panda-bomb-intro]').click(force=True);page.locator('[data-action=panda-start][data-mode=guided]').click(force=True)
            page.locator('.panda-course[data-phase=brief]').wait_for()
            assert page.locator('.panda-course').get_attribute('data-selected')=='';preserved()
            page.locator('[data-action=panda-education]').first.click(force=True)
            page.locator('[data-action=panda-bomb-intro]').click(force=True)
            page.locator('.panda-guide-launch').click(force=True);canvas.wait_for()
            command('exit');assert page.locator('.course-home').is_visible()
            assert page.locator('[data-action=panda-showcase]').evaluate('(e)=>e===document.activeElement');advance(3000);preserved()
            passed('직접 훈련은 새 준비 단계·교육 소개에서도 가이드 재진입·나가기 시 자원/알림 정리·홈 버튼 초점 복원')
            failed=context.new_page();failed.clock.install();blocked={'yes':True}
            failed.route('**/assets/models/panda/*.glb',lambda route:route.abort() if blocked['yes'] else route.continue_())
            failed.goto(args.url+'/?compatible3d=1');failed.locator('[data-action=panda-showcase]').click()
            failed.locator('.panda-3d-canvas[data-model-status=error]').wait_for()
            failed.clock.run_for(6000)
            assert failed.locator('.showcase-progress').evaluate('(e)=>e.value')==0
            assert failed.locator('.showcase').get_attribute('data-showcase-step')=='0'
            blocked['yes']=False;failed.locator('[data-model-retry]').click();failed.locator('.panda-3d-canvas[data-ready=true]').wait_for()
            failed.clock.run_for(1000);assert failed.locator('.showcase-progress').evaluate('(e)=>e.value')>0
            assert failed.evaluate('qaPolicy')==[];failed.close()
            passed('모델 로드 실패 중 장면/시간 진행 없음·실제 모델 다시 불러오면 시연 시작')
            missing=context.new_page();blocked_module={'yes':True}
            missing.route('**/src/ui/panda-showcase.js*',lambda route:route.abort() if blocked_module['yes'] else route.continue_())
            missing.goto(args.url+'/?compatible3d=1');missing.locator('[data-action=panda-showcase]').click()
            missing.locator('.showcase-load-error').wait_for()
            blocked_module['yes']=False;missing.locator('.showcase-load-error [data-action=panda-showcase]').click()
            missing.locator('.panda-3d-canvas[data-ready=true]').wait_for()
            missing.locator('[data-showcase=exit]').click();assert missing.locator('.course-home').is_visible()
            assert missing.evaluate('qaPolicy')==[];missing.close()
            passed('가이드 모듈 오류 표시·재시도 복구·기존 홈과 교육 선택 유지')
            # Leaving during the delayed module load must not mount an orphan guide.
            race=context.new_page();race.route('**/src/ui/panda-showcase.js',lambda route:route.abort())
            race.goto(args.url+'/?compatible3d=1');race.locator('[data-action=panda-showcase]').click();race.locator('header [data-action=home]').click()
            race.wait_for_timeout(300);assert race.locator('.course-home').is_visible() and race.locator('.showcase').count()==0
            race.close()
            assert errors==[] and external==[] and page.evaluate('qaPolicy')==[],(errors,external,page.evaluate('qaPolicy'))
            passed('로딩 중 홈 이동·종료 후 늦은 표시 없음·JavaScript 오류/외부 요청/CSP 위반 없음')
        finally:
            (out/'browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'external':external},ensure_ascii=False,indent=2)+'\n');browser.close()


if __name__=='__main__':main()
