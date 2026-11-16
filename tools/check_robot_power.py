#!/usr/bin/env python3
"""Click the imported Go2's physical power button in controller and maintenance."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--url',default='http://127.0.0.1:8000');ap.add_argument('--webgl',action='store_true');ap.add_argument('--output',default='verification/robot-body-power-2026-11-13/svg');args=ap.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
 def passed(name):checks.append(name);print('PASS',name,flush=True)
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage']+(['--use-angle=swiftshader','--enable-unsafe-swiftshader'] if args.webgl else ['--disable-gpu']))
  page=b.new_page(viewport={'width':1440,'height':1100},reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('window.qaCsp=[];document.addEventListener("securitypolicyviolation",e=>qaCsp.push(e.effectiveDirective));localStorage.setItem("aerolab.voice.v1","off")')
  page.goto(args.url+('/' if args.webgl else '/?compatible3d=1'))
  def click(a):page.locator('[data-action='+a+']').first.click(force=True)
  click('robot-education');click('robot-controller');click('robot-controller-start');canvas=page.locator('.robot-3d-canvas[data-ready=true]');canvas.wait_for()
  assert page.locator('[data-action=robot-controller-power],.robot-console-power').count()==0
  page.screenshot(path=str(out/'power-off.png'),full_page=True)
  page.clock.install();page.clock.pause_at(page.evaluate('Date.now()/1000+.1'))
  def power():return canvas.get_attribute('data-power')
  def point(key):
   canvas.scroll_into_view_if_needed();e=page.locator('[data-spatial-id='+key+']');assert e.is_visible();r=canvas.bounding_box();return r['x']+float(e.get_attribute('data-x')),r['y']+float(e.get_attribute('data-y'))
  def physical(key):
   x,y=point(key);assert page.evaluate('([x,y])=>!!document.elementFromPoint(x,y)?.closest(".robot-3d-canvas")',[x,y]);page.mouse.click(x,y);page.clock.run_for(280)
  assert power()=='false';click('locate-task');assert power()=='false';page.clock.run_for(50)
  physical('robot-body-power');assert power()=='true';assert page.locator('[data-current-task]').get_attribute('data-current-task')=='robot-control-remote'
  assert page.locator('[data-robot-body-power]').inner_text()=='본체 전원 켜짐'
  passed('박스 전원 버튼 제거·위치 보기는 시점만 이동·3D 본체 전원 클릭으로 켜짐/다음 과제')
  click('robot-controller-remote');click('robot-controller-link');click('robot-controller-estop');stick=page.locator('[data-stick=left]');stick.focus();page.keyboard.down('ArrowUp');page.clock.run_for(400);page.keyboard.up('ArrowUp');assert float(canvas.get_attribute('data-drive-z'))<0
  before=canvas.get_attribute('data-drive-z');physical('robot-body-power');assert power()=='false';assert page.locator('.robot-controller-panel').get_attribute('data-connected')=='false';assert canvas.get_attribute('data-estop')=='true';page.clock.run_for(500);assert before==canvas.get_attribute('data-drive-z')
  passed('이동한 로봇의 전원 버튼 위치 추적·본체 전원 차단 시 정지/연결 해제/비상 정지')
  physical('robot-body-power');assert power()=='true' and page.locator('.robot-controller-panel').get_attribute('data-connected')=='false'
  # Keyboard activates the hotspot seated on the same model part.
  page.locator('[data-spatial-id=robot-body-power]').focus();page.keyboard.press('Enter');page.clock.run_for(280);assert power()=='false'
  passed('전원 복구 후 자동 운행 없음·키보드로도 본체 위치의 버튼 조작')
  click('home');click('robot-education');click('robot');page.locator('#robot-start-form button[type=submit]').click(force=True);canvas.wait_for();assert power()=='true'
  physical('robot-estop');physical('robot-power');assert power()=='false';assert page.locator('[data-current-task]').get_attribute('data-current-task')=='robot-support'
  passed('정비 교육도 본체 스위치로 비상 정지/주 전원 차단 후 다음 단계')
  # Leaving cancels a pending physical press without committing the action.
  page.once('dialog',lambda d:d.accept());click('home');click('robot-education');click('robot-controller');click('robot-controller-start');canvas.wait_for();assert power()=='false'
  page.emulate_media(reduced_motion='no-preference');x,y=point('robot-body-power');page.mouse.click(x,y);page.clock.run_for(80);page.evaluate('window.dispatchEvent(new Event("blur"))');page.clock.run_for(300);assert power()=='false';page.emulate_media(reduced_motion='reduce')
  passed('버튼 누름 중 창 이탈은 취소·전원 상태 보존')
  for w,h in [(1366,768),(390,844),(320,640)]:
   page.set_viewport_size({'width':w,'height':h});page.clock.run_for(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),w
   click('locate-task');page.clock.run_for(100);assert page.locator('[data-spatial-id=robot-body-power]').is_visible();physical('robot-body-power');assert power()=='true';physical('robot-body-power');assert power()=='false'
  assert not errors,errors;assert not page.evaluate('qaCsp'),page.evaluate('qaCsp')
  passed('1366/390/320px 본체 버튼 접근·반복 켜기/끄기·브라우저/CSP 오류 없음')
  (out/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2));b.close()
if __name__=='__main__':main()
