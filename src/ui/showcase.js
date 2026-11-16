import * as THREE from '../vendor/three/three.module.min.js';
import { QuadrupedViewport } from './quadruped3d.js';
import { createRobotState, robotTransition, placeRobotPart, robotGuide, robotCanTest, robotIsolated } from '../domain/quadruped.js';
import { createShowcaseRobot, showcasePlan, SHOWCASE_STAGES, applyShowcaseAction } from '../domain/showcase.js';
import { CourseCompletionNotice } from './course-completion.js';
import { escapeHTML as e, icon } from './shared.js';
import { PANDA_SHOWCASE_STAGES } from '../domain/panda-showcase.js';

function renderPandaShowcase() {
  return `<section class="showcase panda-guide" aria-label="로봇팔 가상 해체 가이드 자동 시연" data-showcase-kind="panda" data-showcase-state="loading">
    <div class="showcase-heading"><div><span class="showcase-eyebrow">AEROLAB / ROBOT ARM GAME GUIDE</span><h1 tabindex="-1">목표를 확인하고, 선택하다.</h1></div><button class="showcase-exit" data-showcase="exit" data-action="showcase-exit">시연 나가기 ↗</button></div>
    <ol class="showcase-chapters" aria-label="시연 순서">${PANDA_SHOWCASE_STAGES.map((s,i)=>`<li data-chapter="${i}"><span>0${i+1}</span>${s}</li>`).join('')}</ol>
    <div class="panda-guide-layout"><div class="showcase-stage immersive-stage"><div class="showcase-viewport" id="showcase-viewport"><span class="three-loading">로봇팔 가이드를 준비하고 있습니다…</span></div>
      <div class="showcase-topline"><span class="showcase-live"><i></i><span data-showcase-mode>모델 준비 중</span></span><span>Franka Panda <span class="showcase-muted">/ 가상 폭탄 해체 교육</span></span></div>
      <div class="panda-guide-alert" hidden role="status"><strong data-guide-alert-title>가상 색상 퍼즐</strong><span>목표 색 확인 → 선택 → 가상 선 자르기</span></div>
    </div><aside class="panda-guide-sidebar"><div class="showcase-narrative" role="status"><span data-showcase-caption>01 / 장비 소개</span><h2 data-showcase-title>가상 폭탄 해체 교육</h2><p data-showcase-detail>목표 색 확인부터 선 선택·이동·가상 절단까지 살펴보세요.</p></div>
      <div class="panda-guide-mission"><span>COLOR MATCH GAME</span><strong>목표와 같은 색의 선을 고르세요</strong><small>실제 폭발물 구조·배선·해체법과<br>무관한 가상 색상 퍼즐입니다.</small></div>
      <div class="showcase-status"><div><span>훈련 장치</span><strong data-health>점검 전</strong></div><div><span>목표 색</span><strong data-module>색상 확인</strong></div><div><span>게임 상태</span><strong data-motion>정비 대기</strong></div></div>
    </aside></div>
    <div class="showcase-controls"><div class="showcase-playback"><button data-showcase="toggle">Ⅱ 일시정지</button><button data-showcase="restart">↻ 처음부터</button><span data-showcase-progress>약 35초</span></div><button class="showcase-takeover" data-showcase="takeover">직접 훈련하기 ${icon('arrow')}</button></div>
    <progress class="showcase-progress" max="100" value="0" aria-label="로봇팔 가이드 진행률"></progress>
    <p class="showcase-footnote">약 35초의 3D 가이드 시연입니다. 시연은 훈련 기록에 저장하지 않습니다. 직접 훈련은 새 과제로 시작합니다.</p>
  </section>`;
}

export function renderShowcase(kind='robot') {
  if(kind==='panda')return renderPandaShowcase();
  const drone=kind==='drone';
  return `<section class="showcase" aria-label="${drone?'드론 정비 가이드':'로봇'} 자동 시연" data-showcase-kind="${kind}" data-showcase-state="loading">
    <div class="showcase-heading"><div><span class="showcase-eyebrow">AEROLAB / ${drone?'DRONE MAINTENANCE GUIDE':'LIVE DEMONSTRATION'}</span><h1 tabindex="-1">${drone?'손상을 찾고, 정확하게 고치다.':'직접 고치고, 다시 움직이다.'}</h1></div><button class="showcase-exit" data-showcase="exit" data-action="showcase-exit">시연 나가기 ↗</button></div>
    <div class="showcase-stage immersive-stage"><div class="showcase-viewport" id="showcase-viewport"><span class="three-loading">시연 장면을 준비하고 있습니다…</span></div>
      <div class="showcase-topline"><span class="showcase-live"><i></i><span data-showcase-mode>자동 시연 중</span></span><span>${drone?'Q-DRONE':'Q-TRAIN'} <span class="showcase-muted">/ ${drone?'X500':'Go2'} 외형 기반</span></span></div>
      <ol class="showcase-chapters" aria-label="시연 순서">${SHOWCASE_STAGES.map((s, i) => `<li data-chapter="${i}"><span>0${i + 1}</span>${s}</li>`).join('')}</ol>
      <div class="showcase-scan" hidden aria-hidden="true"><span></span></div>
      <div class="showcase-callout" hidden><span data-callout-label></span><strong data-callout-title></strong></div>
      <div class="showcase-narrative" role="status"><span data-showcase-caption>01 / 장비 살펴보기</span><h2 data-showcase-title>한 곳의 고장, 한 번의 교체.</h2><p data-showcase-detail>고장을 찾고, 부품을 바꾸고, 결과를 확인하는 과정을 만나보세요.</p></div>
      <div class="showcase-manual-actions"></div>
      <div class="showcase-status"><div><span>${drone?'프로펠러 상태':'관절 상태'}</span><strong data-health>점검 전</strong></div><div><span>${drone?'날개·나사 교체':'모듈 교체'}</span><strong data-module>대기</strong></div><div><span>${drone?'최종 확인':'작동 확인'}</span><strong data-motion>대기</strong></div></div>
    </div>
    <div class="showcase-controls"><div class="showcase-playback"><button data-showcase="toggle">Ⅱ 일시정지</button><button data-showcase="restart">↻ 처음부터</button><button data-showcase="overview" hidden>전체 보기</button><span data-showcase-progress>약 75초</span></div><button class="showcase-takeover" data-showcase="takeover">직접 해보기 ${icon('arrow')}</button></div>
    <progress class="showcase-progress" max="100" value="0" aria-label="자동 시연 진행률"></progress>
    <p class="showcase-footnote">자동 시연은 별도 과제로 진행하며 교육 기록에 저장하지 않습니다. ${drone?'정비 완료까지 전원 차단·배터리 분리 상태를 유지합니다.':'보행은 정상 가상 모델의 시각 연출입니다.'}</p>
  </section>`;
}

export class Showcase {
  constructor(root, { compatible, onExit, repaired = false, onUnavailable, plan=showcasePlan, createView=options=>new QuadrupedViewport(options) } = {}) {
    this.root = root; this.onExit = onExit; this.steps = plan(); this.attempt = 0;
    this.notice = new CourseCompletionNotice({ id: 'showcase-completion' });
    this.notice.dialog.addEventListener('close', () => {
      if (this.completed) this.root.querySelector('[data-showcase="restart"]')?.focus();
    });
    this.view = createView({ compatible, onUnavailable: () => { this.pause(); onUnavailable?.(); } });
    this.view.attach(root.querySelector('#showcase-viewport'));
    this.click = event => {
      const button = event.target.closest('[data-showcase]'); if (!button) return;
      event.preventDefault(); event.stopPropagation();
      this.handleCommand(button.dataset.showcase);
    };
    root.addEventListener('click', this.click);
    this.actionListener = event => {
      event.stopPropagation();
      if (this.running && this.status !== 'operation') return;
      this.handleAction(event.detail);
    };
    this.placeListener = event => {
      event.stopPropagation();
      this.acceptPlacement(event.detail);
    };
    root.addEventListener('workshop-action', this.actionListener);
    root.addEventListener('workshop-place', this.placeListener);
    root.addEventListener('workshop-message', event => { event.stopPropagation(); });
    this.suspend = () => { if (this.running || this.state.testing) this.pause('창을 벗어나 시연을 멈췄습니다. 재생을 눌러 이어가세요.'); };
    this.visibility = () => { if (document.hidden) this.suspend(); };
    this.escape = event => { if (event.key === 'Escape' && !this.notice.dialog.open) { event.preventDefault(); event.stopPropagation(); this.pause(); } };
    window.addEventListener('blur', this.suspend); document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('keydown', this.escape, true);
    // Ordinary pointer input is accepted after the explicit takeover button.
    this.blockInput = event => {
      if (this.manual || event.target.closest('[data-model-retry]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    this.view.host.addEventListener('pointerdown', this.blockInput, true);
    this.view.host.addEventListener('keydown', this.blockInput, true);
    this.restart(repaired);
    this.frame = requestAnimationFrame(now => this.tick(now));
  }
  handleCommand(action) {
    if (action === 'exit') this.onExit();
    else if (action === 'toggle') this.running ? this.pause() : this.resume();
    else if (action === 'restart') this.restart();
    else if (action === 'takeover') this.takeOver();
    else if (action === 'overview') { this.ui.robotZoomed = false; this.sync(); }
    else if (action === 'healthy' || action === 'replace') this.commit({ type: 'DIAGNOSE', legId: this.ui.robotSelected, answer: action });
    else if (action === 'test') this.commit({ type: 'START_TEST' });
    else if (action === 'complete') this.commit({ type: 'COMPLETE' });
    else if (action === 'reveal') this.startReveal();
  }
  handleAction(detail) {
    const a=detail.action;
    if(a==='robot-select-leg'){this.inspect(detail.leg);return;}
    const type={'robot-estop':'ESTOP','robot-power':'POWER','robot-connector':'CONNECTOR'}[a];
    if(type)this.commit({type,legId:this.ui.robotSelected});
  }
  acceptPlacement({piece,target}) { this.accept(placeRobotPart(this.state,piece,target)); }
  restart(repaired = false) {
    clearTimeout(this.testTimer); this.view.workshop?.cancel(); this.view.travel?.cancel();
    this.attempt++; this.notice.update(null); this.completed = false; this.revealing = false; this.manual = false;
    this.running = true; this.index = 0; this.status = 'ready'; this.elapsed = 0;
    this.root.querySelector('.showcase-manual-actions').innerHTML = '';
    this.root.querySelector('progress').value = 0;
    delete this.root.dataset.showcaseError;
    this.state = createShowcaseRobot(); this.ui = { immersiveMode: true, presentationMode: true, robotSelected: 'front-left', robotZoomed: false, robotModule: 'QJ-01' };
    this.view.cameraKey = ''; this.sync();
    if (repaired) { this.running = false; this.manual = true; this.startReveal(); }
    this.updateControls();
  }
  accept(next) {
    if (next.feedback.kind !== 'success') { this.showError(next.feedback.message); return; }
    this.state = next.state; this.sync();
    if (this.status === 'operation' && this.running) { this.status = 'hold'; this.hold = this.steps[this.index].hold; }
    if (this.manual) {
      if (this.state.testing && !this.testTimer) this.testTimer = setTimeout(() => { this.testTimer = null; this.commit({ type: 'FINISH_TEST' }); }, 3000);
      this.updateManual();
    }
  }
  commit(action) { this.accept(robotTransition(this.state, action)); }
  inspect(id) {
    this.ui.robotSelected = id; this.ui.robotZoomed = true;
    if (!this.state.legs[id].inspected && robotIsolated(this.state)) this.state = applyShowcaseAction(this.state, { type: 'INSPECT', legId: id });
    this.sync();
    if (this.manual) this.updateManual();
  }
  sync() {
    if (robotGuide(this.state, this.ui.robotSelected).phaseIndex === 3) this.ui.robotZoomed = false;
    this.view.sync(this.state, this.ui);
    const fault = this.state.legs[this.state.targetLeg];
    const scanned = fault.inspected, repaired = fault.source === 'new';
    this.root.dataset.repaired = String(repaired); this.root.dataset.modules = this.view.canvas.dataset.modules;
    this.root.querySelector('[data-health]').textContent = repaired ? '정상 4 / 4' : scanned ? '손상 1곳 발견' : '점검 전';
    this.root.querySelector('[data-module]').textContent = repaired ? '교체 완료' : !fault.present ? '분리 완료' : '대기';
    this.root.querySelector('[data-motion]').textContent = this.state.tested ? '관절 시험 완료' : this.state.testing ? '시험 중' : '대기';
  }
  tick(now) {
    if (this.disposed) return;
    const delta = Math.min(100, this.previous ? now - this.previous : 0); this.previous = now;
    if (this.running && !this.manual && !document.hidden && !this.completed && this.view.canvas.dataset.modelStatus === 'ready') {
      this.elapsed += delta;
      if (this.status === 'ready') this.execute();
      else if (this.status === 'hold') {
        this.hold -= delta;
        if (this.hold <= 0) {
          this.index++;
          if (this.index === this.steps.length) this.finish();
          else this.status = 'ready';
        }
      }
    }
    if (this.revealing && this.running && !document.hidden) this.animateReveal(delta);
    this.updateCallout();
    this.frame = requestAnimationFrame(time => this.tick(time));
  }
  execute() {
    const step = this.steps[this.index], op = step.operation;
    this.root.dataset.showcaseStep = String(this.index); this.root.dataset.showcaseStage = String(step.stage);
    this.status = 'operation'; this.setNarrative(step.stage, step.title, step.detail);
    const scan = this.root.querySelector('.showcase-scan'); scan.hidden = step.stage !== 2;
    this.root.querySelector('progress').value = this.index / this.steps.length * 100;
    this.root.querySelector('[data-showcase-progress]').textContent = `${this.index + 1} / ${this.steps.length} 장면`;
    try {
      if (op.type === 'place') {
        const w = this.view.workshop, from = w.entries.find(e => e.id === op.from), to = w.entries.find(e => e.id === op.to);
        if (!from || !to) throw new Error('시연 부품을 준비하지 못했습니다. 처음부터 다시 실행해 주세요.');
        w.pick(from); w.place(to); return;
      }
      if (op.type === 'action') this.state = applyShowcaseAction(this.state, op.action);
      else if (op.type === 'inspect') this.inspect(op.legId);
      else if (op.type === 'connector') {
        this.ui.robotSelected = this.state.targetLeg; this.ui.robotZoomed = true;
        this.state = applyShowcaseAction(this.state, { type: 'CONNECTOR', legId: this.state.targetLeg });
      } else if (op.type === 'overview') {
        this.view.workshop.bench.visible = false; this.view.workshop.layer.hidden = true;
        this.view.travel.move(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(-5, 3.8, -7), 3500);
      } else if (op.type === 'reveal') { this.startReveal(); }
      if (op.type !== 'overview' && op.type !== 'reveal') this.sync();
      this.status = 'hold'; this.hold = step.hold;
    } catch (error) { this.showError(error.message); }
  }
  setNarrative(stage, title, detail) {
    this.root.dataset.showcaseStage=String(stage);
    this.root.querySelector('[data-showcase-title]').textContent = title;
    this.root.querySelector('[data-showcase-detail]').textContent = detail;
    this.root.querySelector('[data-showcase-caption]').textContent = `0${stage + 1} / ${SHOWCASE_STAGES[stage]}`;
    this.root.querySelectorAll('[data-chapter]').forEach((node, i) => {
      node.dataset.state = i < stage ? 'done' : i === stage ? 'current' : 'pending';
      if (i === stage) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
    });
  }
  updateCallout() {
    const node = this.root.querySelector('.showcase-callout'), leg = this.state.legs[this.state.targetLeg];
    const visible = !this.revealing && leg.inspected && (leg.condition === 'damaged' || leg.source === 'new') && this.ui.robotZoomed && this.ui.robotSelected === this.state.targetLeg;
    node.hidden = !visible; if (!visible) return;
    const p = this.view.legs.get(this.state.targetLeg).knee.getWorldPosition(new THREE.Vector3()).project(this.view.camera);
    node.style.left = `${Math.min(77, Math.max(25, (p.x + 1) * 50))}%`;
    node.style.top = `${Math.min(68, Math.max(34, (1 - p.y) * 50 - 12))}%`;
    node.dataset.healthy = String(leg.source === 'new');
    node.querySelector('[data-callout-label]').textContent = leg.source === 'new' ? 'RESTORED' : 'FAULT FOUND';
    node.querySelector('[data-callout-title]').textContent = leg.source === 'new' ? '새 관절 모듈 장착' : '01번 관절 · 하우징 손상';
  }
  startReveal() {
    this.revealing = true; this.revealTime = 0; this.running = true;
    this.view.workshop?.detach();
    const model = createRobotState({ targetLeg: 'front-left' });
    Object.values(model.legs).forEach(leg => { leg.condition = 'healthy'; });
    model.power = true; model.estop = false; model.supported = false;
    this.view.sync(model, { ...this.ui, immersiveMode: false, previewMode: true, robotZoomed: false });
    this.view.travel.move(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(-5.8, 3.8, -7), 1200);
    this.root.dataset.showcaseState = 'reveal';
    this.root.querySelector('[data-motion]').textContent = '정상 모델 보행 연출';
    this.root.querySelector('[data-health]').textContent = '정상 4 / 4';
    this.root.querySelector('[data-module]').textContent = '복구 모델';
    this.root.querySelector('.showcase-scan').hidden = true;
    this.root.querySelector('.showcase-manual-actions').innerHTML = '';
    this.setNarrative(4, '다시, 움직일 준비.', '정비 과제를 마친 뒤, 정상 가상 모델의 보행 연출을 보여드립니다.');
    this.updateControls();
  }
  animateReveal(delta) {
    this.revealTime += delta;
    const t = Math.min(1, this.revealTime / 9000), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const moving = !reduced && t > .15 && t < .85;
    const d = t < .5 ? Math.max(0, (t - .15) / .35) : Math.max(0, (.85 - t) / .35);
    this.view.setDrive({ pose: { x: 0, z: reduced ? 0 : -1.4 * d, yaw: t < .5 ? 0 : Math.PI * Math.min(1, (t - .5) / .15), phase: t * 40 }, estop: false, boundary: false }, moving);
    this.view.body.position.y += reduced ? 0 : -.35 * (1 - Math.min(1, t / .15));
    this.view.draw();
    this.view.canvas.dataset.revealFrame = String((Number(this.view.canvas.dataset.revealFrame) || 0) + 1);
    if (this.manual && this.revealTime >= 10500) this.finish();
  }
  pause(message) {
    this.running = false; this.view.travel.cancel();
    this.view.workshop?.cancel();
    if (this.status === 'operation') this.status = 'ready';
    this.view.stopMotion?.();
    (this.view.draw || this.view.render).call(this.view);
    if (this.state.testing && this.manual) {
      clearTimeout(this.testTimer); this.testTimer = null;
      this.state = robotTransition(this.state, { type: 'CANCEL_TEST' }).state; this.sync();
      this.updateManual();
    }
    this.updateControls();
    if (message) this.root.querySelector('[data-showcase-detail]').textContent = message;
  }
  resume() {
    if (this.completed || this.manual && !this.revealing) return this.restart();
    this.running = true; this.previous = performance.now();
    if (this.state.testing) this.view.startMotion?.();
    this.updateControls();
  }
  takeOver() {
    if (this.revealing || this.completed) this.restart();
    this.pause(); this.manual = true; this.sync(); this.updateControls(); this.updateManual();
  }
  updateManual() {
    const guide = robotGuide(this.state, this.ui.robotSelected), task = guide.current;
    if (guide.phaseIndex >= 2 && task.legId && this.ui.robotSelected !== task.legId) {
      this.ui.robotSelected = task.legId; this.ui.robotZoomed = true; this.sync();
    }
    this.setNarrative(guide.phaseIndex + 1, task.title, task.detail);
    this.root.querySelector('.showcase-scan').hidden = true;
    let buttons = '';
    if (task.id.startsWith('robot-inspect-')) {
      const leg = this.state.legs[this.ui.robotSelected];
      if (leg.inspected && !leg.verdict) buttons = '<button data-showcase="healthy">정상</button><button data-showcase="replace">교체 필요</button>';
    } else if (robotCanTest(this.state) && !this.state.testing && !this.state.tested) buttons = '<button data-showcase="test">관절 시험</button>';
    else if (task.id === 'robot-finish') buttons = '<button data-showcase="complete">정비 완료</button>';
    else if (guide.complete) buttons = '<button data-showcase="reveal">복구된 로봇 보기 →</button>';
    this.root.querySelector('.showcase-manual-actions').innerHTML = buttons;
  }
  updateControls() {
    this.root.dataset.showcaseState = this.completed ? 'completed' : this.revealing ? (this.running ? 'reveal' : 'paused') : this.manual ? 'manual' : this.running ? 'playing' : 'paused';
    this.root.querySelector('[data-showcase-mode]').textContent = this.completed ? '자동 시연 완료' : this.revealing ? (this.running ? '복구 작동 시연 중' : '시연 일시정지') : this.manual ? '직접 조작 중' : this.running ? '자동 시연 중' : '시연 일시정지';
    this.root.querySelector('[data-showcase="toggle"]').textContent = this.completed || this.manual && !this.revealing ? '▶ 자동 시연' : this.running ? 'Ⅱ 일시정지' : '▶ 이어서 재생';
    this.root.querySelector('[data-showcase="takeover"]').hidden = this.manual;
    this.root.querySelector('[data-showcase="overview"]').hidden = !this.manual || this.revealing;
  }
  showError(message) { this.pause(); this.root.querySelector('[data-showcase-detail]').textContent = message; this.root.dataset.showcaseError = 'true'; }
  finish() {
    this.running = false; this.completed = true; this.revealing = false;
    this.view.stopMotion(); this.root.querySelector('progress').value = 100;
    this.view.canvas.dataset.driving = 'false';
    this.setNarrative(4, '직접 고치고, 다시 움직였습니다.', '이제 교육을 선택해 직접 정비를 체험해보세요.');
    this.updateControls();
    this.notice.update({ key: `showcase:${this.attempt}`, course: 'Q-TRAIN 정비와 복구', demo: true });
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); clearTimeout(this.testTimer);
    this.notice.dismiss(); this.notice.dialog.remove(); this.view.dispose();
    this.root.removeEventListener('click', this.click); window.removeEventListener('keydown', this.escape, true);
    this.root.removeEventListener('workshop-action', this.actionListener); this.root.removeEventListener('workshop-place', this.placeListener);
    window.removeEventListener('blur', this.suspend); document.removeEventListener('visibilitychange', this.visibility);
  }
}
