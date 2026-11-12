#!/usr/bin/env python3
"""Check visible completion, modal keyboard behavior and per-attempt display."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/completion-dialog-2026-11-12')
    parser.add_argument('--compatible', action='store_true')
    args = parser.parse_args(); base = args.url.rstrip('/')
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True); checks = []
    def passed(label): checks.append(label); print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        try:
            page = browser.new_page(viewport={'width': 1366, 'height': 1000}); page.set_default_timeout(15000)
            errors = []; page.on('pageerror', lambda error: errors.append(str(error)))
            page.clock.install(time='2026-11-12T01:00:00Z')
            page.goto(base + ('/?compatible3d=1' if args.compatible else '/'))
            def click(action): page.locator(f'[data-action="{action}"]').first.click(force=True)
            def opened(): return page.locator('#course-completion').evaluate('(e)=>e.open')
            def task(): return page.locator('[data-current-task]').get_attribute('data-current-task')
            click('robot'); click('robot-controller'); click('robot-controller-start')
            page.wait_for_function('()=>document.querySelector(".robot-3d-canvas[data-ready=true]")', polling=40)
            page.clock.pause_at('2026-11-12T02:00:00Z')
            def complete():
                for action in ['robot-controller-power', 'robot-controller-remote', 'robot-controller-link', 'robot-controller-estop']: click(action)
                for side, key in [('left', 'ArrowUp'), ('right', 'ArrowRight')]:
                    page.locator(f'[data-stick="{side}"]').focus(); page.keyboard.down(key); page.clock.run_for(200); page.keyboard.up(key)
                click('robot-controller-stop'); assert not opened()
                page.keyboard.press('Escape')
            complete(); page.clock.run_for(300)
            dialog = page.locator('#course-completion')
            assert opened() and dialog.locator('h2').inner_text() == '교육을 마쳤습니다!'
            assert '사족보행 로봇 조종기 교육' in dialog.inner_text()
            assert task() == 'robot-control-complete'
            assert page.evaluate('()=>document.activeElement.hasAttribute("data-dismiss-completion")')
            passed('전체 과정 완료 시에만 중앙 완료 창·과정명·확인 버튼 초점 표시')
            sizes = []
            for width, height in [(1366, 1000), (1920, 1080), (390, 844), (320, 500)]:
                page.set_viewport_size({'width': width, 'height': height}); page.clock.run_for(300)
                box = dialog.bounding_box()
                assert abs(box['x'] + box['width'] / 2 - width / 2) <= 2
                assert abs(box['y'] + box['height'] / 2 - height / 2) <= 2
                assert box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= width + 1 and box['y'] + box['height'] <= height + 1
                size = dialog.locator('h2').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)'); assert size >= 28
                assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth+1')
                sizes.append({'width': width, 'height': height, 'dialog': box, 'headingSize': size})
            passed('1366·1920·390·320px에서 큰 글씨·화면 정중앙 배치·넘침 없음')
            page.keyboard.press('Tab'); assert page.evaluate('()=>Boolean(document.activeElement.closest("#course-completion"))')
            page.keyboard.press('Escape'); assert not opened() and task() == 'robot-control-complete'
            click('open-help'); assert page.locator('#learning-help').evaluate('(e)=>e.open') and not opened()
            page.keyboard.press('Escape'); page.evaluate('()=>window.dispatchEvent(new Event("storage"))'); assert not opened()
            passed('Tab 초점 유지·Esc 닫기·완료 상태 보존·도움말/재렌더링에 중복 표시 없음')
            page.set_viewport_size({'width': 1366, 'height': 1000}); click('robot-controller-restart')
            assert not opened() and task() == 'robot-control-robot'
            complete(); assert opened()
            dialog.locator('[data-dismiss-completion]').click(force=True)
            assert not opened() and not page.evaluate('()=>document.documentElement.classList.contains("has-course-completion")')
            assert not errors, errors
            passed('다시 시작 후 새 교육 완료 시 다시 표시·확인으로 닫기·화면 스크롤 복구·오류 없음')
            (output / 'browser-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks, 'sizes': sizes, 'errors': errors, 'compatible': args.compatible}, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
