import { escapeHTML as e, icon } from './shared.js';

export class CourseCompletionNotice {
  constructor() {
    this.shown = new Set();
    this.dialog = document.createElement('dialog');
    this.dialog.id = 'course-completion'; this.dialog.className = 'course-completion-dialog';
    this.dialog.setAttribute('aria-labelledby', 'course-completion-title');
    this.dialog.setAttribute('aria-describedby', 'course-completion-description');
    this.dialog.addEventListener('click', event => {
      if (event.target.closest('[data-dismiss-completion]')) this.dismiss();
    });
    this.dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.dismiss(); }
      if (event.key === 'Tab') { event.preventDefault(); this.dialog.querySelector('[data-dismiss-completion]').focus(); }
    });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.dismiss(); });
    this.dialog.addEventListener('close', () => { if (!this.dialog.open) document.documentElement.classList.remove('has-course-completion'); });
    document.body.append(this.dialog);
  }
  update(completion) {
    if (!completion) {
      if (this.dialog.open) this.dialog.close();
      document.documentElement.classList.remove('has-course-completion');
      this.activeKey = null;
      return;
    }
    if (this.activeKey === completion.key || this.shown.has(completion.key)) return;
    if (this.dialog.open) this.dialog.close();
    this.activeKey = completion.key; this.shown.add(completion.key);
    this.previousFocus = document.activeElement;
    this.dialog.dataset.course = completion.course;
    this.dialog.innerHTML = `<div class="course-completion-content"><div class="course-completion-check" aria-hidden="true">${icon('check')}</div><p class="course-completion-label">교육 완료</p><h2 id="course-completion-title">교육을 마쳤습니다!</h2><p id="course-completion-description"><strong>${e(completion.course)}</strong><span>모든 실습 단계를 완료했습니다.</span></p><button type="button" class="button primary" data-dismiss-completion autofocus>확인</button></div>`;
    document.documentElement.classList.add('has-course-completion');
    this.dialog.showModal();
    this.dialog.querySelector('[data-dismiss-completion]').focus({ preventScroll: true });
  }
  dismiss() {
    this.dialog.close();
    document.documentElement.classList.remove('has-course-completion');
    const target = this.previousFocus?.isConnected && !this.previousFocus.disabled ? this.previousFocus : document.querySelector('#main');
    target?.focus({ preventScroll: true });
  }
}
