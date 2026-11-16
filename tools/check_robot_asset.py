#!/usr/bin/env python3
"""Verify the ported URDF hierarchy, teaching handles and local GLB delivery."""
import argparse
import json
from pathlib import Path
from browser_courses import choose_course
from playwright.sync_api import sync_playwright


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--output',default='verification/go2-model-2026-11-12')
    args=parser.parse_args(); output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    checks=[]
    def passed(label):checks.append(label);print('PASS',label,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(20000)
            errors=[];external=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('request',lambda request:external.append(request.url) if not request.url.startswith(args.url+'/') else None)
            page.goto(args.url+'/');choose_course(page, 'robot')
            canvas=page.locator('.robot-3d-canvas[data-ready=true]');canvas.wait_for()
            assert canvas.get_attribute('data-model-source')=='unitree-go2'
            assert canvas.get_attribute('data-model-quality')=='detail'
            assert canvas.get_attribute('data-render-backend')=='webgl'
            assert int(canvas.get_attribute('data-model-triangles'))>100000
            page.screenshot(path=str(output/'go2-webgl-intro.png'),full_page=True)
            passed('WebGL에서 원본 Go2 상세 GLB 로드·출력과 소개 화면 캡처')
            mapping=page.evaluate('''async () => {
                const {QuadrupedViewport} = await import('/src/ui/quadruped3d.js');
                const {createRobotState} = await import('/src/domain/quadruped.js');
                const THREE = await import('/src/vendor/three/three.module.min.js');
                const host=document.createElement('div'); host.style.width='640px'; host.style.height='480px';
                host.style.position='fixed';host.style.left='-10000px';document.body.append(host);
                const v=new QuadrupedViewport({compatible:true});v.attach(host);
                const state=createRobotState({active:true,targetLeg:'front-left'});
                const ui={previewMode:true,robotSelected:'front-left',robotZoomed:false,robotModule:'QJ-01'};
                v.sync(state,ui);await v.modelReady;
                const source=v.canvas.dataset.modelSource;
                const alignment=[...v.legs.keys()].map(id => v.legs.get(id).knee.getWorldPosition(new THREE.Vector3()).distanceTo(v.portedRig.joints.get(id).calf.getWorldPosition(new THREE.Vector3())));
                const original=v.portedRig.joints.get('front-left').thigh.rotation.y;
                v.setDrive({pose:{x:0,z:0,yaw:0,phase:Math.PI/2},estop:false,boundary:false},true);
                const animated=v.portedRig.joints.get('front-left').thigh.rotation.y;
                state.legs['front-left'].present=false;v.sync(state,ui);
                const hidden=!v.portedRig.joints.get('front-left').module.visible;
                const spare=v.portedRig.spareModule();
                const spareVisible=spare.visible&&spare.children.some(o=>o.visible);
                const modules=v.canvas.dataset.modules, triangles=v.canvas.dataset.modelTriangles;
                v.dispose();host.remove();
                return {source,alignment,original,animated,hidden,spareVisible,modules,triangles};
            }''')
            assert mapping['source']=='unitree-go2' and max(mapping['alignment'])<1e-5
            assert abs(mapping['animated']-mapping['original'])>.05
            assert mapping['hidden'] and mapping['spareVisible'] and mapping['modules']=='3'
            passed('URDF 관절과 정비 조작점 위치 일치·실제 관절 회전·모듈 분리·분리 후 스페어 표시 유지')
            assert canvas.get_attribute('data-model-source')=='unitree-go2'
            passed('별도 호환 뷰포트 해제 후 기존 상세 모델의 자원·표시 유지')
            page.locator('[data-action=home]').first.click();page.locator('[data-action=showcase]').click()
            page.locator('.showcase [data-model-source=unitree-go2][data-ready=true]').wait_for()
            page.locator('[data-showcase=toggle]').click(force=True)
            page.screenshot(path=str(output/'go2-webgl-showcase.png'),full_page=True)
            passed('자동 시연에서도 새 Go2 모델 사용과 화면 캡처')
            fallback=browser.new_page();fallback.route('**/assets/models/go2/*.glb',lambda route:route.abort())
            fallback.goto(args.url+'/?compatible3d=1');choose_course(fallback, 'robot')
            fallback.locator('.robot-3d-canvas[data-model-status=error][data-ready=false]').wait_for()
            assert fallback.locator('.robot-asset-note').is_visible()
            assert fallback.locator('.robot-3d-canvas').get_attribute('data-model-source')=='unavailable'
            fallback.unroute('**/assets/models/go2/*.glb')
            fallback.locator('[data-model-retry]').click()
            fallback.locator('[data-model-source=unitree-go2][data-ready=true]').wait_for()
            fallback.close()
            assert not errors and not external,{'errors':errors,'external':external}
            passed('GLB 로드 실패 시 구형 모델 없이 안내·재시도로 Go2 복원, 외부 요청·JavaScript 오류 없음')
            (output/'asset-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'mapping':mapping,'errors':errors,'external':external,'webgl':'SwiftShader software renderer'},ensure_ascii=False,indent=2))
        finally:browser.close()


if __name__=='__main__':main()
