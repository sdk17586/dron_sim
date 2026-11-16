#!/usr/bin/env python3
"""Exercise maintenance and a fictional colour puzzle through the browser UI."""
import argparse,csv,json
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8000');parser.add_argument('--output',default='verification/panda-gripper-2026-11-13/defusal-svg');parser.add_argument('--webgl',action='store_true');args=parser.parse_args()
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
    def passed(name):checks.append(name);print('PASS',name,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage']+(['--use-angle=swiftshader','--enable-unsafe-swiftshader'] if args.webgl else ['--disable-gpu']))
        context=browser.new_context(viewport={'width':1440,'height':1080},accept_downloads=True)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script('window.qaCsp=[];document.addEventListener("securitypolicyviolation",e=>qaCsp.push(e.effectiveDirective));localStorage.setItem("aerolab.voice.v1","false")')
        page.goto(args.url+('/' if args.webgl else '/?compatible3d=1'))
        def click(action):page.locator(f'[data-action="{action}"]').first.click(force=True)
        def command(name):page.locator(f'[data-panda-command="{name}"]').click(force=True)
        def phase():return page.locator('.panda-course').get_attribute('data-phase')
        def data(name):return page.locator('.panda-course').get_attribute('data-'+name)
        def records():return page.evaluate('JSON.parse(localStorage.getItem("aerolab.results.v1")||\'{"records":[]}\').records')
        def ready():page.locator('[data-panda-command=execute]:not([disabled])').wait_for()
        def capture(name):
            if not args.webgl:page.screenshot(path=str(out/(name+'.png')),full_page=True)
        page.locator('[data-home-preview=panda][data-ready=true]').wait_for()
        assert '폭탄 해체' in page.locator('[data-action=panda-education]').inner_text()
        click('panda-education');assert page.locator('.education-choice strong').all_text_contents()==['정비 교육','폭탄 해체 교육'];click('panda-bomb-intro');assert page.locator('.education-choice strong').all_text_contents()==['연습 모드','도전 모드']
        page.locator('[name=session]').fill('간단정비-01');page.locator('[name=trainee]').fill('P-001')
        page.screenshot(path=str(out/'briefing.png'),full_page=True)
        page.locator('[data-action=panda-start][data-mode=guided]').click();ready()
        assert phase()=='brief'
        assert page.locator('.panda-3d-canvas').get_attribute('data-model-source')=='franka-panda'
        page.screenshot(path=str(out/'workstation.png'),full_page=True)
        passed('새 입구·연습/도전 선택·실제 Panda 모델 연결')
        page.clock.install();page.clock.pause_at(page.evaluate('Date.now()/1000+.1'))
        def maintain():assert phase()=='brief'
        maintain();capture('service-complete');command('execute');assert phase()=='choose'
        target=data('goal');wrong=next(c for c in ['red','green','black'] if c!=target)
        page.clock.run_for(93000);assert phase()=='choose' and page.locator('[data-panda-time]').inner_text()=='제한 없음'
        passed('정비 없이 독립 해체 시작·연습 시간 제한 없음')
        pad=page.locator('[data-stick=gripper]')
        tcp=lambda:page.locator('.panda-3d-canvas').get_attribute('data-tcp')
        def drive(key,ms):
            pad.focus();page.keyboard.down(key);page.clock.run_for(ms);page.keyboard.up(key)
        def drag_stick(dx,dy,ms):
            box=pad.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx*box['width']*.38,y+dy*box['height']*.38)
            page.clock.run_for(ms);page.mouse.up()
        before=tcp()
        drag_stick(1 if wrong=='red' else -1,0,1400)
        if wrong=='green':
            # Return from the left limit to the middle station.
            drive('ArrowRight',900)
        assert tcp()!=before and page.locator('[data-arm-action] button').is_disabled()
        drive('ArrowDown',1500);assert data('selected')==wrong and '정렬됨' in page.locator('[data-arm-readout]').inner_text()
        still=tcp();page.clock.run_for(600);assert tcp()==still
        capture('manual-control');passed('스틱 드래그·방향키로 실제 집게 이동·선 접촉 확인·입력 해제 시 정지')
        command('execute');assert phase()=='choose' and not data('cut') and '목표 색과 달라요' in page.locator('[data-panda-feedback]').inner_text()
        passed('다른 색 확인은 점수 차감과 재선택 안내·가상 선 절단 안 됨')
        third=next(c for c in ['red','green','black'] if c not in (wrong,target))
        page.locator(f'[data-panda-command=wire][data-value={third}]').click()
        page.clock.run_for(3200);assert data('selected')==third and pad.is_enabled()
        # Select by ray-casting a visible 3D wire, using the same event path as a mouse.
        page.evaluate('''async()=>{const {Vector3}=await import('/src/vendor/three/three.module.min.js');const {PandaViewport}=await import('/src/ui/panda3d.js');window.qaOriginalSync=PandaViewport.prototype.sync;PandaViewport.prototype.sync=function(...args){window.qaPandaView=this;return qaOriginalSync.apply(this,args);};}''')
        # Next tick exposes the existing viewport to inspect the physical game geometry.
        command('stop');command('resume');page.clock.run_for(100)
        assert page.evaluate('() => !!window.qaPandaView.gameStage.visible')
        # Aim at a free end of the target wire, away from the arm.
        point=page.evaluate('''()=>{const v=qaPandaView;const id=v.state.game.goal,index=['red','green','black'].indexOf(id);const p=v.wires[id].whole.geometry.attributes.position;const a=v.wires[id].whole.localToWorld(new v.camera.position.constructor(.55,.032,.14+index*.08));a.project(v.camera);const r=v.canvas.getBoundingClientRect();return {x:r.left+(a.x+1)*r.width/2,y:r.top+(1-a.y)*r.height/2};}''')
        page.mouse.click(point['x'],point['y']);page.clock.run_for(3200);assert data('selected')==target
        assert page.locator('.panda-3d-canvas').get_attribute('data-selected-wire')==target
        capture('colour-game');passed('3D 선 클릭으로 실제 집게 이동·목표 선 선택')
        drive('ArrowUp',500);assert not data('selected') and page.locator('[data-arm-action] button').is_disabled()
        drag_stick(0,1,1100);assert data('selected')==target
        pad.press('Enter');page.clock.run_for(1150);assert data('cut')==target
        assert page.evaluate('()=>{const v=qaPandaView,p=v.wires[v.state.game.goal];return !p.whole.visible&&p.left.visible&&p.right.visible}')
        page.clock.run_for(3400);assert phase()=='complete' and len(records())==1,(phase(),records(),errors)
        assert page.locator('[data-panda-score]').inner_text()=='90'
        page.locator('[data-dismiss-completion]').click(force=True)
        page.clock.run_for(1000);assert len(records())==1
        capture('success');passed('집게 작동·가상 선 분리·복귀·전원 차단 후 1회 자동 저장')
        for kind,suffix in [('export-csv','csv'),('export-report','txt')]:
            with page.expect_download() as dl:command(kind)
            path=out/('result.'+suffix);dl.value.save_as(path)
            content=path.read_text(encoding='utf-8-sig');assert '간단정비-01' in content
            if suffix=='csv':assert 'panda-wire-game-v2' in content
        passed('완료 결과 CSV·요약 파일 내보내기')
        command('reset');assert phase()=='brief' and not data('selected') and len(records())==1
        click('panda-education');click('panda-bomb-intro');page.locator('[data-action=panda-start][data-mode=independent]').click();ready();maintain();command('execute')
        page.clock.run_for(1000);before=page.locator('[data-panda-time]').inner_text();command('stop');page.clock.run_for(4000);assert page.locator('[data-panda-time]').inner_text()==before
        command('resume');page.clock.run_for(1000);assert page.locator('[data-panda-time]').inner_text()!=before
        click('open-help');page.clock.run_for(3000);click('close-help');page.locator('.panda-3d-canvas[data-ready=true]').wait_for();assert data('estop')=='true'
        frozen=page.locator('[data-panda-time]').inner_text();page.clock.run_for(2000);assert frozen==page.locator('[data-panda-time]').inner_text()
        command('resume');page.clock.run_for(92000);assert phase()=='failed' and len(records())==1
        capture('timeout');passed('도전 90초·정지/도움말에서 시간 유지·재개·시간 초과는 완료 저장 안 함')
        for w,h in [(1366,768),(390,844),(320,640)]:
            page.set_viewport_size({'width':w,'height':h});page.clock.run_for(100)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),w
            capture('layout-'+str(w))
        passed('1366·390·320px 화면에서 가로 넘침 없음')
        command('execute');assert phase()=='brief'
        click('operations');assert '로봇팔 · 폭탄 해체 교육' in page.locator('.records-table').inner_text()
        assert '90 / 100점' in page.locator('.records-table').inner_text()
        assert not errors,errors;assert not page.evaluate('qaCsp'),page.evaluate('qaCsp')
        passed('훈련 기록 과정명·점수 유지·브라우저 오류/CSP 위반 없음')
        (out/'report.json').write_text(json.dumps({'checks':checks,'errors':errors,'backend':'webgl' if args.webgl else 'svg'},ensure_ascii=False,indent=2))
        browser.close()
    print(f'{len(checks)} browser checks passed')
if __name__=='__main__':main()
