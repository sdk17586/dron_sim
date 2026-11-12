#!/usr/bin/env python3
"""Exercise robot maintenance, actual pointer drops, storage, and course isolation."""
import json
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',default='verification/quadruped-2026-11-12')
    output=Path(parser.parse_args().output); output.mkdir(parents=True,exist_ok=True)
    report=[]
    def passed(message): report.append(message); print('PASS',message,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
        try:
            context=browser.new_context(viewport={'width':1366,'height':1100},accept_downloads=True)
            page=context.new_page(); page.set_default_timeout(15000); errors=[]; external=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            context.route('**/*',lambda r:r.continue_() if r.request.url.startswith('http://127.0.0.1:8000/') else (external.append(r.request.url),r.abort()))
            page.add_init_script("window.qaCsp=[];document.addEventListener('securitypolicyviolation',e=>qaCsp.push(e.effectiveDirective));")
            def click(a): page.locator(f'[data-action="{a}"]').first.click(force=True)
            def task(): return page.locator('[data-current-task]').get_attribute('data-current-task')
            def put(source,target): source.click(force=True); target.click(force=True)
            def drag(source,target):
                a,b=source.bounding_box(),target.bounding_box()
                span=max(a['y']+a['height'],b['y']+b['height'])-min(a['y'],b['y'])
                assert span<1050, {'source':a,'target':b}
                if max(a['y']+a['height'],b['y']+b['height'])>1090:
                    page.evaluate('(y)=>scrollBy(0,y)',max(a['y']+a['height'],b['y']+b['height'])-1080)
                    a,b=source.bounding_box(),target.bounding_box()
                page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);page.mouse.down()
                page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2,steps=1);page.mouse.up()
            page.goto('http://127.0.0.1:8000/')
            assert page.locator('.course-picker .course-card').count()==2
            click('robot'); canvas=page.locator('.robot-3d-canvas[data-ready=true]');canvas.wait_for()
            assert canvas.get_attribute('data-modules')=='4'
            page.locator('#robot-start-form [name=trainee]').fill('ROBOT-QA')
            page.locator('#robot-start-form button[type=submit]').click(force=True)
            assert task()=='robot-estop'
            passed('두 장비 교육 선택·소개와 관절 네 개를 가진 3D 로봇, 교육 시작·현재 작업 표시')
            drag(page.locator('.robot-battery'),page.locator('.robot-tray'))
            assert canvas.get_attribute('data-battery')=='true' and '비상 정지' in page.locator('.feedback').inner_text()
            for a in ['robot-estop','robot-power','robot-support']:click(a)
            drag(page.locator('.robot-battery'),page.locator('.robot-tray'))
            assert canvas.get_attribute('data-battery')=='false' and canvas.get_attribute('data-supported')=='true'
            assert page.locator('#app').get_attribute('data-holding') is None
            passed('전원 켜짐 배터리 제거 차단, 안전 준비 후 실제 배터리 드래그·받침대 표시')
            before=page.evaluate('JSON.stringify(localStorage)');click('open-help')
            assert page.locator('#learning-help [data-task-id^=robot-inspect-][data-done=false]').count()==4
            page.keyboard.press('Escape');assert page.evaluate('JSON.stringify(localStorage)')==before
            target=None
            for leg in ['front-left','front-right','rear-left','rear-right']:
                page.locator(f'.robot-leg-button[data-leg="{leg}"]').click(force=True)
                damaged=page.locator('.robot-observation path[stroke="#edb16b"]').count()>0
                click('robot-replace' if damaged else 'robot-healthy')
                if damaged:target=leg
            assert target
            page.locator(f'.robot-leg-button[data-leg="{target}"]').click(force=True)
            passed('고장 위치를 사전 공개하지 않는 도움말과 네 다리 직접 관찰·상태 판단')
            drag(page.locator('.robot-module-slot'),page.locator('.robot-tray'))
            assert canvas.get_attribute('data-modules')=='4' and '볼트' in page.locator('.feedback').inner_text()
            click('robot-connector')
            for i in [0,1]:put(page.locator('.robot-driver'),page.locator(f'[data-robot-bolt="{i}"]'))
            drag(page.locator('.robot-module-slot'),page.locator('.robot-tray'))
            assert canvas.get_attribute('data-modules')=='3'
            page.locator('#robot-module-type').select_option('QJ-02')
            drag(page.locator('.robot-spare-module'),page.locator('.robot-module-slot'))
            assert canvas.get_attribute('data-modules')=='3' and '규격' in page.locator('.feedback').inner_text()
            page.locator('#robot-module-type').select_option('QJ-01')
            drag(page.locator('.robot-spare-module'),page.locator('.robot-module-slot'))
            assert canvas.get_attribute('data-modules')=='4' and canvas.get_attribute('data-damaged')=='0'
            assert page.locator('#app').get_attribute('data-holding') is None
            passed('볼트 분리 전 모듈 제거 차단, 손상 모듈 실제 드래그·3D 빈 자리, 다른 규격 차단·새 모듈 장착')
            put(page.locator('.robot-driver'),page.locator('[data-robot-bolt="0"]'))
            click('open-help')
            assert page.locator(f'#learning-help [data-task-id="robot-fasten-{target}-1"]').get_attribute('data-done')=='false'
            page.locator('#learning-help [data-action=locate-task]').click(force=True)
            assert page.locator('[data-robot-bolt="1"].guide-destination').count()==1
            put(page.locator('.robot-driver'),page.locator('[data-robot-bolt="1"]'));click('robot-connector')
            put(page.locator('.robot-stored-battery'),page.locator('.robot-battery'))
            click('robot-power');click('robot-estop');click('robot-view-all')
            click('robot-test'); assert canvas.get_attribute('data-testing')=='true'
            click('robot-estop');assert canvas.get_attribute('data-testing')=='false' and '관절 시험 완료' not in page.locator('.robot-test-status').inner_text()
            click('robot-estop');click('robot-test')
            page.locator('.robot-test-status').filter(has_text='네 다리 가상 시험 완료').wait_for(timeout=15000)
            assert int(canvas.get_attribute('data-motion-frame') or '0')>0
            click('robot-estop');click('robot-power');click('robot-complete')
            assert task()=='robot-completed' and page.locator('.robot-save-status.saved').count()==1
            passed('미체결 볼트 위치 안내, 관절 시험 중 정지·재시험·3D 관절 움직임·정비 완료·저장')
            with page.expect_download() as download:click('export-current')
            csv=download.value.path().read_text(encoding='utf-8-sig');assert 'quadruped-joint-v1' in csv
            record=page.evaluate('JSON.parse(localStorage.getItem("aerolab.results.v1")).records.at(-1)')
            old_target=next(e['motor'] for e in record['events'] if e['code']=='REMOVE_MODULE')
            saved_robot=page.evaluate('JSON.stringify(localStorage)')
            click('robot-controller');click('robot-controller-start')
            for a in ['robot-controller-power','robot-controller-remote','robot-controller-link','robot-controller-estop']:click(a)
            click('robot-training');assert task()=='robot-completed' and page.locator('.robot-save-status.saved').count()==1
            assert page.evaluate('JSON.stringify(localStorage)')==saved_robot
            passed('로봇 정비 완료 후 조종기 왕복 시 완료 화면·저장 결과 보존')
            click('operations');assert '사족보행 로봇 정비' in page.locator('tbody').inner_text()
            click('home');click('robot');assert page.locator('#robot-start-form').count()==1
            assert page.locator('[data-current-task]').count()==0
            page.locator('#robot-start-form button[type=submit]').click(force=True)
            page.once('dialog',lambda d:d.dismiss());click('home');assert task()=='robot-estop'
            for a in ['robot-estop','robot-power','robot-support']:click(a)
            put(page.locator('.robot-battery'),page.locator('.robot-tray'))
            new_target=None
            for leg in ['front-left','front-right','rear-left','rear-right']:
                page.locator(f'.robot-leg-button[data-leg="{leg}"]').click(force=True)
                if page.locator('.robot-observation path[stroke="#edb16b"]').count():new_target=leg
            assert new_target and new_target!=old_target
            widths=[]
            for width in [1366,1920,390]:
                page.set_viewport_size({'width':width,'height':1000})
                assert page.evaluate('document.documentElement.scrollWidth')<=width
                assert page.locator('header [data-action=robot-restart]').is_visible()
                click('open-help');bounds=page.locator('#learning-help').bounding_box();assert bounds['x']>=0 and bounds['x']+bounds['width']<=width+1
                page.keyboard.press('Escape');widths.append(width)
            passed('CSV 실제 다운로드·교육 과정 구분 기록·완료 결과 보존·재시작 고장 변경·전환 취소·반응형 도움말')
            page.once('dialog',lambda d:d.accept());click('home')
            click('intro-drone')
            assert page.locator('#start-form').count()==1
            click('controller');click('controller-start');click('controller-aircraft-power');click('controller-remote-power');click('controller-link')
            assert page.locator('.controller-panel').get_attribute('data-connected')=='true'
            assert not errors and not external and not page.evaluate('qaCsp'),{'errors':errors,'external':external,'csp':page.evaluate('qaCsp')}
            passed('중단 기록 보관·기존 드론 교육과 조종기 연결 유지, JavaScript·CSP 오류·외부 요청 없음')
            result={'date':'2026-11-12','passed':len(report),'checks':report,'widths':widths,'pageErrors':errors,'externalRequests':external,'cspViolations':page.evaluate('qaCsp'),'screenshots':False}
            (output/'browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        finally:browser.close()

if __name__=='__main__':main()
