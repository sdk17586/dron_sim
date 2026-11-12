#!/usr/bin/env python3
"""Native mesh picking/dragging and complete maintenance in both 3D scenes."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main(argv=None):
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='verification/spatial-workshop-2026-11-12');parser.add_argument('--url',default='http://127.0.0.1:8000');parser.add_argument('--screenshots',action='store_true')
    parser.add_argument('--compatible',action='store_true')
    args=parser.parse_args(argv);base=args.url.rstrip('/');output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    checks=[]
    def passed(label):checks.append(label);print('PASS',label,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
        try:
            context=browser.new_context(viewport={'width':1366,'height':1100},accept_downloads=True)
            page=context.new_page();page.set_default_timeout(12000);errors=[];external=[]
            page.on('pageerror',lambda err:errors.append(str(err)))
            context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') else (external.append(r.request.url),r.abort()))
            page.add_init_script("window.qaCsp=[];document.addEventListener('securitypolicyviolation',e=>qaCsp.push(e.effectiveDirective));")
            def click(action):page.locator(f'[data-action="{action}"]').first.click(force=True)
            def task():return page.locator('[data-current-task]').get_attribute('data-current-task')
            def acknowledge_completion(course):
                dialog=page.locator('#course-completion')
                assert dialog.evaluate('(e)=>e.open') and dialog.locator('h2').inner_text()=='교육을 마쳤습니다!'
                assert course in dialog.inner_text()
                dialog.locator('[data-dismiss-completion]').click(force=True)
            def canvas():return page.locator('.immersive-stage [data-workshop=true]')
            def capture(name):
                if canvas().evaluate('(e)=>e.tagName.toLowerCase()')=='svg':
                    (output/(name+'.svg')).write_text(canvas().evaluate('(e)=>e.outerHTML'))
                if args.screenshots:page.screenshot(path=str(output/(name+'.png')),full_page=True,timeout=10000)
            def settle():page.wait_for_function('()=>!document.querySelector(".immersive-stage [data-workshop=true]") || document.querySelector(".immersive-stage [data-workshop=true]").dataset.busy3d!=="true"',polling=40)
            def xy(id):
                page.locator('.immersive-stage').evaluate('(e)=>e.scrollIntoView({block:"center",behavior:"instant"})')
                node=page.locator(f'[data-spatial-id="{id}"]');assert node.count()==1 and not node.evaluate('(e)=>e.hidden'), {'id':id,'task':task()}
                box=canvas().bounding_box()
                return box['x']+float(node.get_attribute('data-x')),box['y']+float(node.get_attribute('data-y'))
            def mesh(id):
                x,y=xy(id);page.mouse.click(x,y);settle()
            def pick(id):
                mesh(id);assert canvas().get_attribute('data-holding3d'),{'id':id,'task':task()}
            def put(source,dest):pick(source);mesh(dest);assert not canvas().get_attribute('data-holding3d')
            def drag(source,dest):
                x,y=xy(source);tx,ty=xy(dest)
                page.mouse.move(x,y);page.mouse.down();page.mouse.move(tx,ty,steps=1);page.mouse.up();settle()
            page.goto(base+('/?compatible3d=1' if args.compatible else '/'));click('robot');page.locator('#robot-start-form button').click(force=True)
            canvas().wait_for();capture('robot-workbench')
            assert page.locator('.robot-controls,.robot-dock,.robot-joint-detail,.robot-battery').count()==0
            assert page.locator('.immersive-stage [data-current-task]').count()==1
            mesh('robot-estop');assert task()=='robot-power-off'
            mesh('robot-power');assert task()=='robot-support'
            drag('robot-stand','robot-stand-slot');assert task()=='robot-battery-out'
            passed('로봇의 실제 3D 비상 정지·전원 클릭, 3D 받침대를 몸체 아래로 드래그·설치')
            pick('robot-battery');page.keyboard.press('Escape');assert canvas().get_attribute('data-battery')=='true' and not canvas().get_attribute('data-holding3d')
            drag('robot-battery','robot-discard');assert canvas().get_attribute('data-battery')=='false'
            passed('3D 배터리 집기·Esc 취소 시 상태 보존, 수거함에 실제 드래그해 분리')
            fault=None
            for _ in range(4):
                current=task();assert current.startswith('robot-inspect-'),current
                leg=current.removeprefix('robot-inspect-');mesh('leg-'+leg)
                condition=page.locator('.scene-context').get_attribute('data-observation')
                click('robot-replace' if condition=='damaged' else 'robot-healthy')
                if condition=='damaged':fault=leg
            assert fault and task().startswith('robot-disconnect-')
            passed('3D 관절 직접 선택·확대와 화면 내부 판단, 네 곳 완료 후 교체할 관절로 이동')
            capture('robot-joint')
            mesh('connector-'+fault)
            for index in [0,1]:put('robot-driver',f'bolt-{fault}-{index}')
            assert task().startswith('robot-remove-'),task()
            drag('module-'+fault,'robot-discard');assert canvas().get_attribute('data-modules')=='3'
            page.locator('[data-input=robot-module-type]').select_option('QJ-02')
            put('robot-spare','module-'+fault);assert canvas().get_attribute('data-modules')=='3'
            page.locator('[data-input=robot-module-type]').select_option('QJ-01')
            drag('robot-spare','module-'+fault);assert canvas().get_attribute('data-modules')=='4'
            passed('3D 커넥터·공구·볼트·모듈 직접 조작, 빈 장착부·수거 부품·다른 규격 거부·새 모듈 장착')
            for index in [0,1]:put('robot-driver',f'bolt-{fault}-{index}')
            mesh('connector-'+fault);assert task()=='robot-battery-in'
            drag('robot-stored-battery','robot-battery');mesh('robot-power');mesh('robot-estop')
            click('robot-test');page.locator('.robot-test-status').filter(has_text='네 다리 가상 시험 완료').wait_for()
            frames=int(canvas().get_attribute('data-animation-frame3d') or '0');assert frames>0
            mesh('robot-estop');mesh('robot-power');click('robot-complete')
            acknowledge_completion('사족보행 로봇 정비 교육')
            assert task()=='robot-completed' and page.locator('.robot-save-status.saved').count()==1
            robot_record=page.evaluate('JSON.parse(localStorage.getItem("aerolab.results.v1")).records.at(-1)')
            assert robot_record['status']=='completed' and len(robot_record['errors'])==1
            passed('3D 체결·연결·배터리 복구·본체 전원, 화면 내부 시험·완료·결과 저장')
            click('home');click('intro-drone');page.locator('#start-form button[type=submit]').click(force=True);canvas().wait_for()
            assert page.locator('.parts-dock,.inspector,.repair-point,.model-power').count()==0
            mesh('drone-power');assert task()=='remove-battery'
            pick('drone-battery');page.evaluate('window.dispatchEvent(new Event("blur"))')
            assert not canvas().get_attribute('data-holding3d') and canvas().get_attribute('data-battery-installed')=='true'
            drag('drone-battery','drone-discard');assert canvas().get_attribute('data-battery-installed')=='false'
            drag('pack-battery-02','drone-battery');assert canvas().get_attribute('data-led-fill')=='1'
            mesh('drone-power');drag('drone-battery','drone-discard')
            assert canvas().get_attribute('data-battery-installed')=='false'
            passed('드론도 외부 패널 없이 3D 전원·배터리 직접 조작, 초점 이탈 시 집기 취소')
            target=None
            for _ in range(4):
                motor=task().removeprefix('inspect-')
                assert motor in ['front-left','rear-left','front-right','rear-right'],task()
                click('view-all');mesh('motor-'+motor)
                condition=page.locator('.scene-context').get_attribute('data-observation')
                click('answer-replace' if condition=='damaged' else 'answer-healthy')
                if condition=='damaged':target=motor
            assert target;mesh('motor-'+target);capture('drone-propeller')
            for index in [0,1]:put('drone-driver',f'screw-{target}-{index}')
            for index in [0,1]:drag(f'blade-{target}-{index}','drone-discard')
            assert canvas().get_attribute('data-blades')=='6'
            page.locator('[data-input=kit]').select_option('B1')
            put('new-blade-0',f'blade-{target}-0');assert canvas().get_attribute('data-blades')=='6'
            page.locator('[data-input=kit]').select_option('A1')
            for index in [0,1]:drag(f'new-blade-{index}',f'blade-{target}-{index}')
            for index in [0,1]:put(f'new-screw-{index}',f'screw-{target}-{index}')
            for index in [0,1]:put('drone-driver',f'screw-{target}-{index}')
            assert canvas().get_attribute('data-blades')=='8' and canvas().get_attribute('data-screws')=='8'
            assert int(canvas().get_attribute('data-animation-frame3d') or '0')>0
            passed('3D 나사에 드라이버 적용·회전, 장착 날개 분리·새 날개·새 나사·체결, 잘못된 표식 거부')
            for key in ['marks','count','fastening']:page.locator('.scene-context [data-check='+key+']').check(force=True)
            click('final');assert page.locator('.result-card').count()==1
            acknowledge_completion('드론 정비 교육')
            records=page.evaluate('JSON.parse(localStorage.getItem("aerolab.results.v1")).records')
            assert len(records)==2 and all(r['status']=='completed' for r in records)
            with page.expect_download() as download:click('export-current')
            assert download.value.path().read_text(encoding='utf-8-sig')
            passed('3D 화면 내부 최종 확인·드론 교육 완료·두 교육 결과 유지·CSV 다운로드')
            click('controller');click('controller-start')
            click('controller-aircraft-power');click('controller-remote-power');click('controller-link')
            for side in ['left','right']:
                page.locator(f'[data-stick="{side}"]').focus();page.keyboard.press('ArrowUp')
            click('controller-stop');click('controller-imu-next')
            page.wait_for_function('()=>document.querySelector("[data-imu-body]")',polling=40)
            page.locator('[data-imu-body]').focus();page.keyboard.press('ArrowLeft')
            assert page.locator('[data-imu-panel]').get_attribute('data-pose')=='left'
            click('training');assert page.locator('.result-card').count()==1
            assert not page.locator('#course-completion').evaluate('(e)=>e.open')
            assert page.evaluate('JSON.parse(localStorage.getItem("aerolab.results.v1")).records')==records
            assert not page.locator('[data-imu-body]').count()
            passed('IMU 과정 진입·기체 자세 변경 후 정비 완료 결과 복귀와 저장 기록 보존')
            widths=[]
            click('home');click('robot');page.locator('#robot-start-form button').click(force=True)
            for width,height in [(1366,768),(1920,1080),(390,844)]:
                page.set_viewport_size({'width':width,'height':height})
                assert page.evaluate('document.documentElement.scrollWidth')<=width
                assert page.locator('.immersive-stage [data-current-task]').count()==1
                click('open-help');page.keyboard.press('Escape');assert task()=='robot-estop'
                widths.append(width)
            page.set_viewport_size({'width':1366,'height':1100})
            page.locator('[data-spatial-id=robot-estop]').focus();page.keyboard.press('Enter');settle();assert task()=='robot-power-off'
            assert not errors and not external and not page.evaluate('qaCsp'),{'errors':errors,'external':external,'csp':page.evaluate('qaCsp')}
            passed('세 화면 크기·도움말·재시작 유지, JavaScript 오류·외부 요청·CSP 위반 없음')
            unavailable=context.new_page();unavailable.set_default_timeout(12000)
            unavailable.route('**/src/ui/drone3d.js',lambda route:route.abort())
            unavailable.goto(base+('/?compatible3d=1' if args.compatible else '/'));unavailable.locator('[data-action=intro-drone]').click(force=True)
            unavailable.wait_for_function('()=>document.querySelector(".aircraft-flat") || !document.querySelector(".three-loading")',polling=40)
            unavailable.locator('#start-form button[type=submit]').click(force=True)
            unavailable.locator('.scene-load-error').wait_for()
            before=unavailable.locator('[data-current-task]').get_attribute('data-current-task')
            unavailable.locator('[data-action=retry-3d]').click(force=True)
            unavailable.locator('.scene-load-error').wait_for()
            assert unavailable.locator('[data-current-task]').get_attribute('data-current-task')==before
            assert unavailable.locator('.parts-dock,.detail-stage').count()==0
            unavailable.close()
            passed('3D 모듈을 불러오지 못해도 반복 오류 없이 다시 불러오기 안내·현재 과제 보존')
            (output/'browser-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'widths':widths,'pageErrors':errors,'externalRequests':external,'cspViolations':page.evaluate('qaCsp'),'screenshots':False},ensure_ascii=False,indent=2))
        finally:browser.close()


if __name__=='__main__':main()
