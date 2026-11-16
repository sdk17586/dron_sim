#!/usr/bin/env python3
"""Check real WebGL preview lifetimes, delayed loss events and context pressure."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8000');parser.add_argument('--output',default='verification/preview-rendering-2026-11-13/fixed');args=parser.parse_args()
 out=Path(args.output);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[];warnings=[]
 def passed(label):checks.append(label);print('PASS',label,flush=True)
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('console',lambda msg:warnings.append(msg.text) if 'Too many active WebGL contexts' in msg.text or 'INVALID_OPERATION' in msg.text else None)
  page.add_init_script('window.qaPolicy=[];document.addEventListener("securitypolicyviolation",e=>qaPolicy.push(e.effectiveDirective));try{localStorage.setItem("aerolab.voice.v1","false")}catch{}')
  try:
   page.goto(args.url+'/')
   def ready():
    for kind in ['drone','robot','panda']:page.locator(f'[data-home-preview={kind}][data-ready=true]').wait_for()
   def backend():return page.locator('[data-home-preview]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.renderBackend)')
   def click(action):page.locator(f'[data-action={action}]').first.click()
   ready();assert backend()==['webgl']*3
   baseline=page.evaluate('localStorage.getItem("aerolab.results.v1")')
   page.evaluate('''async()=>{
    window.qaRetired=[];window.qaLive=[];
    for(const [path,key] of [['drone3d','DroneViewport'],['quadruped3d','QuadrupedViewport'],['panda3d','PandaViewport']]){
     const C=(await import('/src/ui/'+path+'.js'))[key],dispose=C.prototype.dispose,attach=C.prototype.attach;
     C.prototype.attach=function(host){if(!qaLive.includes(this))qaLive.push(this);return attach.call(this,host);};
     C.prototype.dispose=function(){if(!this.disposed)qaRetired.push({kind:this.canvas.dataset.homePreview||key,canvas:this.canvas,view:this});return dispose.call(this);};
    }
   }''')
   # Keep references to retired canvases deliberately: cleanup cannot depend on GC.
   click('drone-education');page.locator('.equipment-course-hub [data-ready=true]').wait_for();click('home');ready()
   page.wait_for_function('()=>qaRetired.length>=4&&qaRetired.every(r=>r.canvas.getContext("webgl2").isContextLost())')
   assert backend()==['webgl']*3
   for kind in ['drone','robot','panda']:
    page.evaluate('''kind=>{const r=qaRetired.find(r=>r.kind===kind);if(!r||r.canvas.isConnected)throw Error('retired canvas missing');r.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));}''',kind)
    page.wait_for_timeout(100);assert backend()==['webgl']*3
   page.screenshot(path=str(out/'retired-events-still-webgl.png'),full_page=True)
   passed('폐기된 세 모델의 실제 네이티브 연결 해제·지연 contextlost 후 현재 홈은 WebGL 유지')
   for i in range(9):
    kind=['drone','robot','panda'][i%3];click(kind+'-education');page.locator('.equipment-course-hub [data-ready=true]').wait_for();click('home');ready()
    assert backend()==['webgl']*3
   page.wait_for_function('()=>qaRetired.every(r=>r.canvas.getContext("webgl2").isContextLost())')
   pressure=page.evaluate('''()=>({retired:qaRetired.length,released:qaRetired.filter(r=>r.canvas.getContext('webgl2').isContextLost()).length,live:qaLive.filter(v=>!v.disposed).length})''')
   assert pressure['retired']>=40 and pressure['released']==pressure['retired'] and pressure['live']==3,pressure
   assert warnings==[],warnings
   passed('홈↔장비 선택 10회·40개 이상 이전 컨텍스트 참조를 유지해도 누적/브라우저 한도 경고/강제 호환 전환 없음')
   # A native delayed event from each retired renderer remains harmless after churn.
   page.evaluate('()=>qaRetired.forEach(r=>r.canvas.dispatchEvent(new Event("webglcontextlost",{cancelable:true})))')
   page.wait_for_timeout(200);assert backend()==['webgl']*3
   for width,height in [(1920,1080),(1366,768),(390,844),(320,640)]:
    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(150)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    for kind in ['robot','panda']:
     canvas=page.locator(f'[data-home-preview={kind}]');canvas.focus();canvas.press('ArrowRight');canvas.press('ArrowLeft')
    assert backend()==['webgl']*3
   page.set_viewport_size({'width':1440,'height':1000});page.wait_for_timeout(200)
   # Repeat identical poses: framebuffer pixels must not vary across redraws.
   stable=page.evaluate('''async()=>{
    const views=qaLive.filter(v=>!v.disposed),out=[];
    for(const v of views){
     const gl=v.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
     const read=()=>{v.renderer.render(v.scene,v.camera);const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);let hash=2166136261,lit=0;for(let i=0;i<p.length;i++){hash=Math.imul(hash^p[i],16777619);if(i%4!==3&&p[i]>80)lit++;}return {hash:hash>>>0,lit};};
     const first=read(),second=read();out.push({kind:v.canvas.dataset.homePreview,first,second,depth:gl.getParameter(gl.DEPTH_BITS)});
    }return out;
   }''')
   assert len(stable)==3 and all(r['depth']>=16 and r['first']==r['second'] and r['first']['lit']>100 for r in stable),stable
   page.screenshot(path=str(out/'home-after-stress.png'),full_page=True)
   passed('반복 회전·1920/1366/390/320px 크기 변경·세 모델 깊이 버퍼와 동일 자세 프레임 픽셀 안정성')
   # Guide disposal uses the same cleanup path, without leaking its renderer.
   click('panda-showcase');page.locator('.showcase .panda-3d-canvas[data-ready=true]').wait_for();click('showcase-exit');ready()
   page.wait_for_function('()=>qaRetired.every(r=>r.canvas.getContext("webgl2").isContextLost())');assert backend()==['webgl']*3
   passed('로봇팔 가이드 종료도 그래픽 연결 해제·홈으로 돌아와도 상세 표시 유지')
   # Loss of an active native GPU context must still trigger a usable fallback.
   page.evaluate('()=>document.querySelector("[data-home-preview=robot]").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()')
   page.wait_for_function('()=>document.querySelectorAll("[data-home-preview][data-ready=true][data-render-backend=svg]").length===3')
   assert page.locator('[data-action=robot-education]').is_enabled()
   click('robot-education');page.locator('.equipment-course-hub [data-ready=true]').wait_for();assert page.locator('[data-action=robot-controller]').is_enabled()
   assert page.evaluate('localStorage.getItem("aerolab.results.v1")')==baseline
   passed('현재 사용 중인 GPU가 실제 중단되면 호환 표시 복구와 교육 버튼·기록 보존')
   assert errors==[] and warnings==[] and page.evaluate('qaPolicy')==[],(errors,warnings,page.evaluate('qaPolicy'))
   passed('JavaScript 오류·그래픽 한도/잘못된 GPU 호출 경고·CSP 위반 없음')
   (out/'native-results.json').write_text(json.dumps({'pressure':pressure,'stableFrames':stable},ensure_ascii=False,indent=2))
  finally:
   (out/'browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'warnings':warnings},ensure_ascii=False,indent=2));browser.close()


if __name__=='__main__':main()
