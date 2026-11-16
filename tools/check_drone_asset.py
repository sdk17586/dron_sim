#!/usr/bin/env python3
"""Verify X500 assets, local textures, detachable parts and independent view lifetimes."""
import argparse
import json
from pathlib import Path
from browser_courses import choose_course
from playwright.sync_api import sync_playwright


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--output',default='verification/x500-model-2026-11-12/asset')
    args=parser.parse_args();output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    checks=[]
    def passed(label):checks.append(label);print('PASS',label,flush=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(30000)
            errors=[];external=[];policy=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('request',lambda request:external.append(request.url) if not request.url.startswith(args.url+'/') and not request.url.startswith('blob:') else None)
            page.expose_function('reportPolicy',lambda directive:policy.append(directive))
            page.add_init_script('document.addEventListener("securitypolicyviolation", e=>window.reportPolicy(e.effectiveDirective))')
            page.goto(args.url+'/');choose_course(page, 'intro-drone')
            canvas=page.locator('.drone-3d-canvas[data-ready=true]');canvas.wait_for()
            assert canvas.get_attribute('data-model-source')=='px4-x500'
            assert canvas.get_attribute('data-model-quality')=='detail' and canvas.get_attribute('data-render-backend')=='webgl'
            assert int(canvas.get_attribute('data-triangles'))>200000
            page.screenshot(path=str(output/'x500-intro-webgl.png'),full_page=True)
            passed('드론 소개에서 상세 X500 GLB 출력과 WebGL 화면 캡처')
            mapping=page.evaluate('''async () => {
                const {DroneViewport}=await import('/src/ui/drone3d.js');
                const {createState}=await import('/src/domain/state.js');
                const THREE=await import('/src/vendor/three/three.module.min.js');
                const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;width:800px;height:600px';document.body.append(host);
                const v=new DroneViewport({compatible:true,onSelect(){}});v.attach(host);
                const s=createState(),ui={selected:'front-left',previewMode:false,zoomed:true,kitId:'A1'};
                v.sync(s,ui);await v.modelReady;
                const positions=[...v.motors].map(([id,m])=>({id,position:m.group.position.toArray(),
                    blade:m.blades[0].good.name,anchor:m.bladeAnchors[0].toArray(),screw:m.screwAnchors[0].toArray()}));
                const assetBounds=new THREE.Box3().setFromObject(v.portedDrone.frame);
                const battery=v.battery.position.y;
                s.motors['front-left'].blades[0].present=false;s.motors['front-left'].screws[0].present=false;v.sync(s,ui);
                const removed=v.canvas.dataset.blades==='7' && v.canvas.dataset.screws==='7';
                // Supplies must clone the new geometry, including a visible good blade after removal.
                s.safetyConfirmed=true;s.battery=false;for(const pack of s.batteryPacks)if(pack.location==='aircraft')pack.location='tray';
                ui.immersiveMode=true;v.sync(s,ui);
                const stock=v.workshop.entries.find(e=>e.id==='new-blade-0');
                const spare=stock.object.getObjectByName('blade_front-left_0_good');
                const spareVisible=Boolean(spare?.visible);
                ui.controllerMode=true;ui.immersiveMode=false;v.sync(s,ui);v.setRotorPreview(.8);
                const projected=[...v.rotorLayer.querySelectorAll('[data-preview-motor]')].map(e=>e.getAttribute('transform'));
                const rotating=v.canvas.dataset.rotorDemand==='80' && !v.rotorLayer.hasAttribute('hidden');
                v.setRotorPreview(0);const stopped=v.rotorLayer.hasAttribute('hidden');
                v.dispose();host.remove();return {positions,removed,spareVisible,rotating,stopped,projected,battery,minY:assetBounds.min.y};
            }''')
            assert all(abs(abs(m['position'][0])-2.784)<1e-4 and abs(abs(m['position'][2])-2.784)<1e-4 for m in mapping['positions'])
            assert all(m['blade']=='blade_'+m['id']+'_0_good' and m['anchor'][0]<-.5 and m['screw'][1]<.5 for m in mapping['positions'])
            assert mapping['minY']>.025 and mapping['battery']>3
            assert mapping['removed'] and mapping['spareVisible']
            passed('네 모터 좌표와 실제 날개·정비점 연결, 날개/나사 분리 후 새 형상의 스페어 표시')
            assert mapping['rotating'] and mapping['stopped'] and all('NaN' not in t for t in mapping['projected'])
            passed('조종기 회전 표시를 새 모터 위치·날개 크기에 맞춤, 정지 시 표시 복원')
            texture=page.evaluate('''async () => {
                const {DroneViewport}=await import('/src/ui/drone3d.js');const {createState}=await import('/src/domain/state.js');
                const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;width:640px;height:480px';document.body.append(host);
                const v=new DroneViewport({onSelect(){}});v.attach(host);v.sync(createState(),{selected:'front-left',previewMode:true});await v.modelReady;
                const material=Object.values(v.materials).find(m=>m.map);
                const image=material?.map.image,result={loaded:Boolean(image?.width),width:image?.width,textures:v.assetTextures.size};
                v.dispose();host.remove();return result;
            }''')
            assert texture['loaded'] and texture['textures']>=1
            assert canvas.get_attribute('data-model-source')=='px4-x500'
            passed('GLB 내장 카본 텍스처 로드, 별도 상세·호환 뷰 해제 후 기존 모델 표시 유지')
            fallback=browser.new_page();fallback.route('**/assets/models/x500/*.glb',lambda route:route.abort())
            fallback.goto(args.url+'/?compatible3d=1');choose_course(fallback, 'intro-drone')
            fallback.locator('.drone-3d-canvas[data-model-status=error][data-ready=false]').wait_for()
            assert fallback.locator('.drone-asset-note').is_visible()
            assert fallback.locator('.drone-3d-canvas').get_attribute('data-model-source')=='unavailable'
            fallback.unroute('**/assets/models/x500/*.glb')
            fallback.locator('[data-model-retry]').click()
            fallback.locator('[data-model-source=px4-x500][data-ready=true]').wait_for()
            fallback.close()
            assert not errors and not external and not policy,{'errors':errors,'external':external,'policy':policy}
            passed('모델 요청 실패 시 구형 기체 없이 안내·재시도로 X500 복원, JavaScript·외부 요청·보안 정책 오류 없음')
            (output/'asset-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'mapping':mapping,
                'texture':texture,'errors':errors,'external':external,'policy':policy,'webgl':'Chromium SwiftShader'},ensure_ascii=False,indent=2))
        finally:browser.close()


if __name__=='__main__':main()
