#!/usr/bin/env python3
"""Verify equipment → course selection → introduction → practice navigation."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', default='verification/education-navigation-2026-11-13')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    checks, errors, external = [], [], []
    def passed(label):
        checks.append(label)
        print('PASS', label, flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        try:
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: external.append(request.url) if not request.url.startswith(args.url + '/') else None)
            page.add_init_script('window.qaCsp=[];document.addEventListener("securitypolicyviolation",e=>qaCsp.push(e.effectiveDirective));localStorage.setItem("aerolab.voice.v1","false");')
            page.goto(args.url + '/?compatible3d=1')
            def click(action): page.locator(f'[data-action={action}]').first.click()
            def records(): return page.evaluate('localStorage.getItem("aerolab.results.v1")')
            def hub(kind):
                page.locator(f'.equipment-course-hub[data-education-kind={kind}]').wait_for()
                assert page.locator('.education-choice strong').all_text_contents() == ['정비 교육', '조종기 교육']
                assert page.locator('#start-form,#robot-start-form,.controller-panel,[data-current-task],[data-stick]').count() == 0
            assert page.locator('.course-home .course-card strong').all_text_contents() == ['드론 교육', '사족보행 로봇 교육', '로봇팔 교육']
            baseline = records()
            page.screenshot(path=str(output / 'home.png'), full_page=True)
            passed('첫 화면의 장비 선택 이름은 드론 교육·사족보행 로봇 교육·로봇팔 교육')
            for kind, title, maintenance, controller in [
                ('drone', '드론 교육', 'intro-drone', 'controller'),
                ('robot', '사족보행 로봇 교육', 'robot', 'robot-controller'),
            ]:
                click(kind + '-education'); hub(kind)
                assert page.locator('.equipment-course-options h1').inner_text() == title
                page.locator(f'[data-home-preview={kind}][data-ready=true]').wait_for()
                assert page.locator('[data-equipment-preview]').count() == 1
                assert records() == baseline
                page.screenshot(path=str(output / (kind + '-courses.png')), full_page=True)
                click('open-help')
                assert '정비 교육' in page.locator('#learning-help').inner_text() and '조종기 교육' in page.locator('#learning-help').inner_text()
                page.keyboard.press('Escape'); hub(kind)
                click(maintenance)
                form = '#robot-start-form' if kind == 'robot' else '#start-form'
                page.locator(form).wait_for()
                assert page.locator('.equipment-course-hub,.controller-panel,[data-current-task]').count() == 0
                assert records() == baseline
                click(kind + '-education'); hub(kind)
                click(controller)
                start = 'robot-controller-start' if kind == 'robot' else 'controller-start'
                page.locator(f'[data-action={start}]').wait_for()
                assert page.locator('#start-form,#robot-start-form,[data-stick]').count() == 0
                click(start)
                page.locator('[data-stick=left]').wait_for()
                click(kind + '-education'); hub(kind)
                assert records() == baseline
                click('home')
                passed(title + ': 정비·조종기를 먼저 선택하고 소개 후 실습 시작, 상위 복귀·기록 보존')
            for kind, maintenance, form, task in [
                ('drone', 'intro-drone', '#start-form', 'power-confirm'),
                ('robot', 'robot', '#robot-start-form', 'robot-estop'),
            ]:
                click(kind + '-education'); click(maintenance)
                page.locator(form + ' button[type=submit]').click()
                page.locator('[data-current-task]').wait_for()
                previous = records()
                current = page.locator('[data-current-task]').get_attribute('data-current-task')
                page.once('dialog', lambda dialog: dialog.dismiss())
                click(kind + '-education')
                assert page.locator('[data-current-task]').get_attribute('data-current-task') == current and records() == previous
                page.once('dialog', lambda dialog: dialog.accept())
                click(kind + '-education'); hub(kind)
                saved = json.loads(records())['records']
                assert len(saved) == (1 if kind == 'drone' else 2) and all(record['status'] == 'abandoned' for record in saved)
                after = records()
                click('home'); click(kind + '-education'); hub(kind)
                assert records() == after
                click('home')
            passed('진행 중 정비의 상위 이동 취소는 과제 보존, 승인 시 중단 기록은 정확히 한 번 저장')
            baseline = records()
            for width, height in [(1366, 768), (390, 844), (320, 640)]:
                page.set_viewport_size({'width': width, 'height': height})
                for kind in ['drone', 'robot']:
                    click(kind + '-education'); hub(kind)
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                    for choice in page.locator('.education-choice').all():
                        choice.scroll_into_view_if_needed()
                        assert choice.is_visible()
                    page.screenshot(path=str(output / f'{kind}-courses-{width}.png'), full_page=True)
                    page.locator('.education-choice').first.click()
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                    click(kind + '-education'); hub(kind)
                    click('home')
            assert records() == baseline
            passed('1366·390·320px에서 두 장비의 과정 선택·상위 이동 접근, 가로 넘침·기록 변경 없음')
            failed = browser.new_page()
            failed.route('**/assets/models/**/*.glb', lambda route: route.abort())
            failed.goto(args.url + '/?compatible3d=1')
            failed.locator('[data-action=drone-education]').click()
            failed.locator('.education-choice[data-action=controller]').click()
            failed.locator('[data-action=controller-start]').wait_for()
            failed.close()
            assert not errors and not external and not page.evaluate('qaCsp'), {'errors': errors, 'external': external}
            passed('3D 모델 실패·로딩 중에도 과정 선택 가능, JavaScript·외부 요청·CSP 오류 없음')
            (output / 'browser-results.json').write_text(json.dumps({'passed': len(checks), 'checks': checks, 'errors': errors, 'external': external}, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == '__main__':
    main()
