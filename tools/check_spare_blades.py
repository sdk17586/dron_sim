#!/usr/bin/env python3
"""Verify rendered spare blades as well as successful picking and installation."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/spare-blades-2026-11-12')
    parser.add_argument('--compatible', action='store_true')
    args = parser.parse_args(); output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    checks = []; snapshots = {}
    def passed(label): checks.append(label); print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        try:
            page = browser.new_page(viewport={'width': 1366, 'height': 1050}); page.set_default_timeout(15000)
            errors = []; page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url.rstrip('/') + ('/?compatible3d=1' if args.compatible else '/'))
            # Observe the actual scene objects without exposing test hooks in production.
            page.evaluate('''async()=>{
              const {Workshop3D}=await import('/src/ui/workshop3d.js');
              const stock=Workshop3D.prototype.stock;
              Workshop3D.prototype.stock=function(...args){const result=stock.apply(this,args);window.qaWorkshop=this;return result;};
            }''')
            def click(action): page.locator(f'[data-action="{action}"]').first.click(force=True)
            def canvas(): return page.locator('.immersive-stage [data-workshop=true]')
            def task(): return page.locator('[data-current-task]').get_attribute('data-current-task')
            def settle(): page.wait_for_function('()=>document.querySelector("[data-workshop=true]").dataset.busy3d!=="true"', polling=40)
            def xy(id):
                page.locator('.immersive-stage').evaluate('(e)=>e.scrollIntoView({block:"center",behavior:"instant"})')
                n = page.locator(f'[data-spatial-id="{id}"]'); box = canvas().bounding_box()
                return box['x'] + float(n.get_attribute('data-x')), box['y'] + float(n.get_attribute('data-y'))
            def mesh(id): page.mouse.click(*xy(id)); settle()
            def put(source, target): mesh(source); mesh(target)
            def drag(source, target):
                x, y = xy(source); tx, ty = xy(target)
                page.mouse.move(x, y); page.mouse.down(); page.mouse.move(tx, ty, steps=1); page.mouse.up(); settle()
            def stock():
                return page.evaluate('''()=>Object.fromEntries([0,1].map(index=>{
                  const entry=qaWorkshop.entries.find(e=>e.id===`new-blade-${index}`);
                  if(!entry)return [index,{present:false}];
                  let visible=true;for(let n=entry.object;n;n=n.parent)if(!n.visible)visible=false;
                  let meshes=0;entry.object.traverse(n=>{if(n.isMesh&&n.visible)meshes++;});
                  return [index,{present:true,visible,meshes,attached:entry.object.parent===qaWorkshop.bench,clickable:!entry.button.hidden}];
                }))''')
            def require_visible(label):
                snapshot = stock(); snapshots[label] = snapshot
                (output / 'visibility.json').write_text(json.dumps(snapshots, ensure_ascii=False, indent=2))
                assert all(s['present'] and s['visible'] and s['attached'] and s['meshes'] > 0 for s in snapshot.values()), (label, snapshot)
            click('intro-drone'); page.locator('#start-form button[type=submit]').click(force=True)
            page.wait_for_function('()=>document.querySelector("[data-workshop=true][data-ready=true]")', polling=40)
            mesh('drone-power'); drag('drone-battery', 'drone-discard')
            target = None
            for _ in range(4):
                motor = task().removeprefix('inspect-'); click('view-all'); mesh('motor-' + motor)
                damaged = page.locator('.scene-context').get_attribute('data-observation') == 'damaged'
                click('answer-replace' if damaged else 'answer-healthy')
                if damaged: target = motor
            mesh('motor-' + target)
            for index in [0, 1]: put('drone-driver', f'screw-{target}-{index}')
            require_visible('before-removal')
            drag(f'blade-{target}-0', 'drone-discard'); require_visible('after-first-removal')
            drag(f'blade-{target}-1', 'drone-discard'); require_visible('after-both-removals')
            passed('손상 날개 한 개·두 개를 수거해도 두 스페어의 실제 모형·표면·조작 위치 유지')
            mesh('new-blade-0')
            assert page.evaluate('()=>qaWorkshop.held.ghost.visible')
            page.keyboard.press('Escape'); require_visible('after-pick-cancel')
            put('new-blade-0', 'drone-discard'); require_visible('after-invalid-placement')
            passed('스페어 집기 모형 표시·Esc 취소·잘못된 놓기 후 재표시')
            for kit in ['B1', 'A1']:
                page.locator('[data-input=kit]').select_option(kit); require_visible('kit-' + kit)
            passed('포장을 바꿨다 돌아와도 스페어 모형 유지')
            drag('new-blade-0', f'blade-{target}-0')
            snapshot = stock(); assert not snapshot['0']['present'] and snapshot['1']['visible']
            drag('new-blade-1', f'blade-{target}-1')
            assert all(not blade['present'] for blade in stock().values())
            for index in [0, 1]:
                put(f'new-screw-{index}', f'screw-{target}-{index}')
                put('drone-driver', f'screw-{target}-{index}')
            for key in ['marks', 'count', 'fastening']: page.locator(f'.scene-context [data-check="{key}"]').check(force=True)
            click('final')
            assert page.locator('#course-completion').evaluate('(e)=>e.open')
            assert page.locator('.result-card').count() == 1 and not errors, errors
            passed('장착한 스페어만 재고에서 제거·나머지 표시 유지·두 날개 교체와 정비 완료')
            (output / 'browser-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks, 'errors': errors, 'compatible': args.compatible}, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
