#!/usr/bin/env python3
"""Exercise Panda's shared spatial workshop and independent course routing."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--url',default='http://127.0.0.1:8000');ap.add_argument('--webgl',action='store_true');ap.add_argument('--output',default='verification/panda-gripper-2026-11-13/svg');args=ap.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True);errors=[];checks=[]
 def passed(s):checks.append(s);print('PASS',s,flush=True)
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage']+(['--use-angle=swiftshader','--enable-unsafe-swiftshader'] if args.webgl else ['--disable-gpu']));page=b.new_page(viewport={'width':1440,'height':1000},accept_downloads=True,reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('window.qaCsp=[];document.addEventListener("securitypolicyviolation",e=>qaCsp.push(e.effectiveDirective));localStorage.setItem("aerolab.voice.v1","off")');page.goto(args.url+('/' if args.webgl else '/?compatible3d=1'))
  page.evaluate('''async()=>{const {PandaGripperService}=await import('/src/ui/panda-gripper-service.js');const sync=PandaGripperService.prototype.sync;PandaGripperService.prototype.sync=function(...args){window.qaService=this;return sync.apply(this,args);};}''')
  def action(v):page.locator('[data-action="'+v+'"]').first.click(force=True)
  def command(v):page.locator('[data-service-command='+v+']').click(force=True)
  def task():return page.locator('.panda-maintenance').get_attribute('data-task')
  def records():return page.evaluate('JSON.parse(localStorage.getItem("aerolab.results.v1")||\'{"records":[]}\').records')
  action('panda-education');assert page.locator('.education-choice strong').all_text_contents()==['정비 교육','폭탄 해체 교육'];assert not page.locator('[data-action=panda-start]').count();page.screenshot(path=str(out/'courses.png'),full_page=True)
  action('panda-maintenance-intro');page.locator('[name=session]').fill('그리퍼-01');page.locator('[name=trainee]').fill('P-023');action('panda-maintenance-start');page.locator('.panda-maintenance .panda-3d-canvas[data-ready=true]').wait_for();assert task()=='stop';assert not page.locator('.panda-colour-game').count();page.screenshot(path=str(out/'workstation.png'),full_page=True)
  page.clock.install();page.clock.pause_at(page.evaluate('Date.now()/1000+.1'))
  def spatial(v):page.locator('[data-spatial-id='+v+']').evaluate('(button)=>button.click()')
  def place(source,target,ms=2700):spatial(source);spatial(target);page.clock.run_for(ms)
  def visible_part(model,name):
   return page.evaluate('''([model,name])=>{
    const root=model==='installed'?qaService.unit:qaService.workshop.entries.find(e=>e.id===model).object;
    let found=false;
    root.traverseVisible(node=>{if(node.name===name)found=true;});
    return found;
   }''',[model,name])
  def capture(name):
   if not args.webgl:page.screenshot(path=str(out/(name+'.png')),full_page=True)
  # 3D hit button activation follows the same Workshop3D path used by canvas picking.
  spatial('panda-stop');spatial('panda-power');assert task()=='inspect';spatial('panda-gripper');assert task()=='diagnose';capture('damage')
  for part in ['impact_shell','impact_fracture','impact_jaw','impact_pad_tear']:
   assert visible_part('installed',part),part
  assert not visible_part('installed','panda_leftfinger_visual_1')
  page.locator('[data-service-command=DIAGNOSE][data-verdict=healthy]').click(force=True);assert task()=='diagnose';assert '변형' in page.locator('[data-service-message]').inner_text()
  page.locator('[data-service-command=DIAGNOSE][data-verdict=replace]').click(force=True);assert task()=='disconnect';passed('두 과정 분리·실제 Panda 그리퍼 손상 관찰·안전 준비·교체 판단')
  # Gripper cannot be removed while plug/bolts are still attached.
  place('panda-gripper','panda-discard',400);assert task()=='disconnect' and page.locator('.panda-maintenance').get_attribute('data-gripper')=='original'
  spatial('panda-connector');assert task()=='unbolt-0'
  def coordinate(key):
   locator=page.locator('[data-spatial-id='+key+']');assert locator.is_visible();rect=page.locator('.panda-3d-canvas').bounding_box();return rect['x']+float(locator.get_attribute('data-x')),rect['y']+float(locator.get_attribute('data-y'))
  page.emulate_media(reduced_motion='no-preference')
  source=coordinate('panda-driver');dest=coordinate('panda-bolt-0');page.mouse.move(*source);page.mouse.down();page.mouse.move(*dest,steps=10);page.mouse.up();page.clock.run_for(2700);assert task()=='unbolt-1';page.emulate_media(reduced_motion='reduce')

  place('panda-driver','panda-bolt-1');assert task()=='remove';capture('unbolted')
  spatial('panda-gripper');page.keyboard.press('Escape');assert page.locator('.panda-3d-canvas').get_attribute('data-holding3d')=='' and task()=='remove'
  place('panda-gripper','panda-discard',850);assert task()=='install';assert page.locator('.panda-maintenance').get_attribute('data-gripper')=='removed';capture('removed')
  assert visible_part('panda-discard','impact_jaw') and not visible_part('panda-spare','impact_jaw')
  assert visible_part('panda-spare','panda_leftfinger_visual_1')
  passed('커넥터·볼트2개 공구 회전·손상 그리퍼 수거함 배치·선행 조건과 Esc 취소')
  page.locator('[data-service-module]').select_option('PG-02');place('panda-spare','panda-gripper',850);assert task()=='install' and '규격' in page.locator('[data-service-message]').inner_text()
  page.locator('[data-service-module]').select_option('PG-01');place('panda-spare','panda-gripper',850);assert task()=='fasten-0';assert page.locator('.panda-maintenance').get_attribute('data-gripper')=='new'
  assert visible_part('installed','panda_leftfinger_visual_1') and not visible_part('installed','impact_fracture')
  assert visible_part('panda-discard','impact_fracture') and not visible_part('panda-discard','panda_hand_visual_1')
  place('panda-driver','panda-bolt-0');assert task()=='fasten-1';place('panda-driver','panda-bolt-1');assert task()=='connect';point=coordinate('panda-connector');assert page.evaluate('''([x,y])=>!!document.elementFromPoint(x,y)?.closest('.panda-3d-canvas')&&qaService.workshop.hit({clientX:x,clientY:y})?.id==='panda-connector' ''',point);page.mouse.click(*point);page.clock.run_for(50);assert task()=='test-power',(task(),page.locator('[data-service-message]').inner_text(),errors);capture('installed')
  assert page.locator('[data-service-command=TEST]').is_disabled();spatial('panda-power');spatial('panda-stop');assert task()=='test';command('TEST');page.clock.run_for(1000);assert page.locator('.panda-maintenance').get_attribute('data-testing')=='true'
  action('open-help');page.clock.run_for(1500);action('close-help');page.locator('.panda-maintenance .panda-3d-canvas[data-ready=true]').wait_for();assert task()=='test-release' and page.locator('.panda-maintenance').get_attribute('data-testing')=='false'
  spatial('panda-stop');command('TEST');page.clock.run_for(4200);assert task()=='final-stop';assert not records();capture('test-complete');passed('다른 규격 차단·새 그리퍼 장착/체결/연결·개폐 시험·도움말 시험 중단과 재시험')
  spatial('panda-stop');spatial('panda-power');assert task()=='finish';assert page.locator('[data-service-command=COMPLETE]').is_disabled()
  for key in ['fastening','connection','movement']:page.locator('[data-service-check='+key+']').check(force=True)
  dialog=page.locator('#course-completion')
  assert not dialog.is_visible()
  command('COMPLETE');assert page.locator('.panda-maintenance').get_attribute('data-phase')=='complete';assert len(records())==1 and records()[0]['scenarioId']=='panda-gripper-replacement-v1';page.clock.run_for(1000);assert len(records())==1
  assert dialog.evaluate('e=>e.matches(":modal")')
  assert dialog.get_by_role('heading',name='교육을 마쳤습니다!',exact=True).is_visible()
  assert dialog.get_by_text('로봇팔 정비 교육 · 그리퍼 교체',exact=True).is_visible()
  dialog.get_by_role('button',name='확인',exact=True).click()
  assert not dialog.is_visible()
  capture('complete')
  with page.expect_download() as dl:command('EXPORT')
  dl.value.save_as(out/'result.csv');assert '그리퍼-01' in (out/'result.csv').read_text(encoding='utf-8-sig');passed('시험 후 정지·전원차단·최종 확인·완료 기록1회·CSV 내보내기')
  for w,h in [(1366,768),(390,844),(320,640)]:
   page.set_viewport_size({'width':w,'height':h});page.clock.run_for(100);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),w;capture('layout-'+str(w))
  page.set_viewport_size({'width':1440,'height':1000});page.clock.run_for(100)
  action('panda-education');assert page.evaluate('()=>qaService.view.disposed&&!qaService.workshop.active&&qaService.workshop.lifecycle.signal.aborted');action('panda-bomb-intro');page.locator('[data-action=panda-start][data-mode=guided]').click(force=True);page.locator('[data-panda-command=execute]:not([disabled])').wait_for();assert page.locator('.panda-course').get_attribute('data-phase')=='brief';assert page.locator('[data-service]').count()==0;assert len(records())==1
  page.locator('[data-panda-command=execute]').click(force=True);assert page.locator('.panda-course').get_attribute('data-phase')=='choose';goal=page.locator('.panda-course').get_attribute('data-goal');page.locator('[data-panda-command=wire][data-value='+goal+']').click(force=True);page.clock.run_for(3100);page.locator('[data-panda-command=execute]').click(force=True);page.clock.run_for(4400);assert len(records())==2 and records()[1]['scenarioId']=='panda-wire-game-v2';page.locator('[data-dismiss-completion]').click(force=True)
  action('operations');assert '로봇팔 정비 · 그리퍼 교체' in page.locator('.records-table').inner_text() and '폭탄 해체 교육' in page.locator('.records-table').inner_text();passed('모바일 표시·정비와 해체 진행/결과 분리·해체는 정비 없이 시작하고 별도 저장')
  action('home');action('panda-education');action('panda-maintenance-intro');action('panda-maintenance-start');page.locator('.panda-maintenance .panda-3d-canvas[data-ready=true]').wait_for();page.once('dialog',lambda d:d.dismiss());action('panda-education');assert page.locator('.panda-maintenance').count()==1 and len(records())==2
  page.once('dialog',lambda d:d.accept());action('panda-education');assert len(records())==3 and records()[-1]['status']=='abandoned';passed('진행 중 교육 이동 취소는 유지·승인 시 중단 기록1회')
  assert not errors,errors;assert not page.evaluate('qaCsp'),page.evaluate('qaCsp');passed('브라우저 오류와 CSP 위반 없음')
  (out/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2));b.close()
if __name__=='__main__':main()
