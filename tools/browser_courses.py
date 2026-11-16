"""Follow the public equipment/category choices in browser regression checks."""


def choose_course(page, action, **options):
    if action == 'robot-controller-power':
        button = page.locator('[data-spatial-id=robot-body-power]')
        button.wait_for(state='visible')
        previous = page.locator('.robot-3d-canvas').get_attribute('data-power')
        button.evaluate('(element)=>element.click()')
        page.wait_for_function('(value)=>document.querySelector(".robot-3d-canvas")?.dataset.power!==value',arg=previous)
        return
    equipment = {'intro-drone': 'drone', 'controller': 'drone', 'robot': 'robot', 'robot-controller': 'robot'}.get(action)
    if equipment and page.locator('.course-home').count():
        page.locator(f'.course-home [data-action={equipment}-education]').click(**options)
    page.locator(f'[data-action="{action}"]').first.click(**options)


def complete_imu(page):
    """Use actual pose keys and the caller's controlled clock to finish calibration."""
    for action in ['imu-surface', 'imu-link', 'imu-begin']:
        choose_course(page, action, force=True)
    sequences = [[], ['ArrowLeft'], ['ArrowRight', 'ArrowRight'], ['ArrowLeft', 'ArrowUp'], ['ArrowDown', 'ArrowDown'], ['ArrowDown']]
    for keys in sequences:
        for key in keys:
            page.locator('[data-imu-body]').press(key)
        page.clock.run_for(3100)
    for key in ['ArrowUp', 'ArrowUp']:
        page.locator('[data-imu-body]').press(key)
    choose_course(page, 'imu-verify', force=True)
