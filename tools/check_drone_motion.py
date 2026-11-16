#!/usr/bin/env python3
"""Exercise simple drone movement through actual controller input and rendered models."""
import argparse
import json
from pathlib import Path
from browser_courses import choose_course, complete_imu
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/drone-motion-2026-11-13/motion')
    parser.add_argument('--webgl', action='store_true')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    checks, errors, external = [], [], []
    def passed(label):
        checks.append(label)
        print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'] +
            (['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] if args.webgl else ['--disable-gpu']))
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1080})
            page.clock.install(time='2026-11-13T02:00:00Z')
            page.set_default_timeout(20000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: external.append(request.url) if not request.url.startswith(args.url + '/') and not request.url.startswith('blob:') else None)
            page.add_init_script('window.qaCsp=[];document.addEventListener("securitypolicyviolation",e=>qaCsp.push(e.effectiveDirective));')
            page.goto(args.url + ('/' if args.webgl else '/?compatible3d=1'))
            def click(action): choose_course(page, action)
            def pose():
                return page.locator('.controller-panel').evaluate('(e)=>({x:+e.dataset.moveX,z:+e.dataset.moveZ,yaw:+e.dataset.moveYaw})')
            def hold(side, key, milliseconds):
                page.locator(f'[data-stick={side}]').focus()
                page.keyboard.down(key)
                page.clock.run_for(milliseconds)
                page.keyboard.up(key)
                return pose()
            click('intro-drone'); click('controller'); click('controller-start')
            canvas = page.locator('#drone-viewport [data-ready=true]')
            canvas.wait_for()
            page.clock.pause_at('2026-11-13T03:00:00Z')
            saved = page.evaluate('localStorage.getItem("aerolab.results.v1")')
            assert hold('left', 'ArrowUp', 500) == {'x': 0, 'z': 0, 'yaw': 0}
            click('controller-aircraft-power'); click('controller-remote-power'); click('controller-link')
            assert hold('left', 'ArrowUp', 700) == {'x': 0, 'z': 0, 'yaw': 0}
            assert hold('right', 'ArrowRight', 700) == {'x': 0, 'z': 0, 'yaw': 0}
            assert not page.locator('[data-action=controller-position-reset]').count()
            click('controller-stop'); click('controller-imu-next')
            complete_imu(page)
            assert not page.locator('#course-completion').evaluate('(e)=>e.open')
            click('imu-flight-next')
            canvas.wait_for()
            assert page.locator('.controller-panel h1').inner_text() == '기체 이동 연습'
            passed('연결·스틱 확인 후에도 보정 전 이동/회전 잠금, 실제 여섯 자세·결과 확인 후에만 이동 단계 진입')
            page.evaluate('window.qaPad=document.querySelector("[data-stick=left]")')
            initial_geometry = canvas.inner_html() if not args.webgl else ''
            forward = hold('left', 'ArrowUp', 800)
            assert forward['z'] < -1 and abs(forward['x']) < .001
            assert page.evaluate('qaPad===document.querySelector("[data-stick=left]")')
            assert float(canvas.get_attribute('data-move-z')) == forward['z']
            if not args.webgl: assert canvas.inner_html() != initial_geometry
            stopped = pose(); page.clock.run_for(500)
            assert pose() == stopped and canvas.get_attribute('data-moving') == 'false'
            passed('전원·연결 전 움직임 차단, 왼쪽 ↑로 실제 3D 전진·스틱 DOM 유지·놓으면 즉시 정지')
            turned = hold('right', 'ArrowRight', 900)
            assert turned['x'] == forward['x'] and turned['z'] == forward['z'] and turned['yaw'] < -.8
            ahead = hold('left', 'ArrowUp', 500)
            assert ahead['x'] > .4 and ahead['z'] < turned['z']
            back = hold('left', 'ArrowDown', 500)
            assert abs(back['x'] - turned['x']) < .001 and abs(back['z'] - turned['z']) < .001
            passed('오른쪽 ←→는 위치 고정 제자리 회전, 회전 후 기체 앞을 기준으로 전진·후진')
            click('controller-position-reset')
            assert pose() == {'x': 0, 'z': 0, 'yaw': 0} and page.locator('.controller-panel').get_attribute('data-connected') == 'true'
            edge = hold('left', 'ArrowUp', 4000)
            assert abs(edge['z'] + 2.6) < .001
            assert hold('left', 'ArrowDown', 400)['z'] > edge['z']
            click('controller-position-reset')
            passed('연습 영역 제한·반대 방향 복구, 위치 초기화는 연결·진행을 유지')
            page.locator('[data-stick=left]').focus(); page.keyboard.down('ArrowUp'); page.clock.run_for(300)
            page.evaluate('window.dispatchEvent(new Event("blur"))'); snapshot = pose(); page.clock.run_for(500)
            assert pose() == snapshot; page.keyboard.up('ArrowUp')
            page.locator('[data-stick=right]').focus(); page.keyboard.down('ArrowRight'); page.clock.run_for(300)
            page.keyboard.press('Escape'); snapshot = pose(); page.clock.run_for(500)
            page.keyboard.up('ArrowRight')
            assert pose() == snapshot and page.locator('.controller-panel').get_attribute('data-connected') == 'false'
            assert page.locator('#course-completion').evaluate('(e)=>e.open')
            page.locator('[data-dismiss-completion]').click()
            passed('창 초점 이탈은 입력 해제·위치 고정, Esc는 이동·회전 정지와 연결 해제')
            click('controller-link')
            before_flat = pose()
            page.locator('.more-menu > summary').click()
            page.locator('[data-input=view-mode]').select_option('2d')
            page.locator('.more-menu > summary').click()
            assert pose() == before_flat
            transform = page.locator('[data-controller-airframe]').get_attribute('transform')
            flat = hold('left', 'ArrowUp', 300)
            assert flat != before_flat and page.locator('[data-controller-airframe]').get_attribute('transform') != transform
            assert float(page.locator('.drone-svg').get_attribute('data-move-z')) == flat['z']
            page.locator('.more-menu > summary').click()
            page.locator('[data-input=view-mode]').select_option('3d')
            page.locator('.more-menu > summary').click()
            canvas.wait_for()
            assert pose() == flat and float(canvas.get_attribute('data-move-z')) == flat['z']
            passed('2D 도식도 같은 위치·방향으로 움직이며 2D↔3D 전환 시 자세 보존')
            # Inspect the actual object origins and projection anchors, not just the UI state.
            geometry = page.evaluate('''async()=>{
                const {DroneViewport}=await import('/src/ui/drone3d.js');
                const {createControllerAircraft,createControllerState}=await import('/src/domain/controller.js');
                const THREE=await import('/src/vendor/three/three.module.min.js');
                const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;width:700px;height:600px';document.body.append(host);
                const v=new DroneViewport({compatible:true,onSelect(){}});v.attach(host);
                const s=createControllerState();s.aircraftPower=true;s.flightReady=true;s.pose={x:1.2,z:-.7,yaw:.6};
                const ui={controllerMode:true,controllerState:s,selected:'front-left'};
                v.sync(createControllerAircraft(),ui);await v.modelReady;
                const position=v.drone.getWorldPosition(new THREE.Vector3()).toArray();
                const shadow=v.shadowGroup.position.toArray(),yaw=v.drone.rotation.y;
                const power=v.power.getWorldPosition(new THREE.Vector3()).project(v.camera);
                const point=host.querySelector('[data-anchor=power]');
                const anchorError=Math.hypot(parseFloat(point.style.left)-(power.x+1)*.5*700,parseFloat(point.style.top)-(1-power.y)*.5*600);
                v.sync(createControllerAircraft(),{previewMode:true,selected:'front-left'});
                const reset=v.drone.position.toArray(),resetYaw=v.drone.rotation.y;
                v.dispose();host.remove();return {position,shadow,yaw,anchorError,reset,resetYaw};
            }''')
            assert geometry['position'] == [1.2, .7, -.7] and geometry['shadow'] == [1.2, 0, -.7]
            # Browser CSS serialization rounds the projected coordinates to decimal pixels.
            assert abs(geometry['yaw'] - .6) < 1e-8 and geometry['anchorError'] < .001, geometry
            assert geometry['reset'] == [0, 0, 0] and geometry['resetYaw'] == 0
            passed('실제 기체·그림자·전원 조작점이 함께 이동/회전하고 소개 화면에서는 원위치 복원')
            # Full-page GPU capture with a virtual clock can stall Chromium's compositor.
            if not args.webgl:
                page.screenshot(path=str(output / 'drone-movement.png'), full_page=True)
            click('controller-restart')
            canvas.wait_for()
            assert page.locator('#drone-viewport [data-ready=true]').get_attribute('data-move-x') == '0.0000'
            assert page.locator('#drone-viewport [data-ready=true]').get_attribute('data-move-yaw') == '0.0000'
            click('controller-aircraft-power'); click('controller-remote-power'); click('controller-link')
            assert hold('left', 'ArrowUp', 500) == {'x': 0, 'z': 0, 'yaw': 0}
            assert page.evaluate('localStorage.getItem("aerolab.results.v1")') == saved
            assert not errors and not external and not page.evaluate('qaCsp'), {'errors': errors, 'external': external}
            passed('전체 다시 시작은 IMU/이동 권한 초기화·이동 재잠금·기록 보존, JavaScript·외부 요청·CSP 오류 없음')
            (output / 'motion-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks, 'geometry': geometry, 'errors': errors, 'external': external, 'backend': 'webgl' if args.webgl else 'svg'}, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
