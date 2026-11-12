const PREFERENCE_KEY = 'aerolab.voice.v1';

// Narration follows the guide, never the render rate or live joystick values.
export class GuideVoice {
  constructor({ synthesis = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, storage, onChange = () => {} } = {}) {
    this.synthesis = synthesis; this.Utterance = Utterance; this.storage = storage; this.onChange = onChange;
    this.supported = Boolean(synthesis?.speak && synthesis?.cancel && Utterance);
    this.enabled = true; this.current = null; this.lastKey = ''; this.generation = 0; this.speaking = false; this.error = ''; this.suspended = false;
    try { this.enabled = storage?.getItem(PREFERENCE_KEY) !== 'off'; } catch { /* Preference is optional. */ }
    this.voicesChanged = () => {
      if (this.retryWhenVoicesLoad && this.enabled && this.current && this.koreanVoice()) this.read();
    };
    synthesis?.addEventListener?.('voiceschanged', this.voicesChanged);
  }
  koreanVoice() {
    let voices = [];
    try { voices = this.synthesis?.getVoices?.() || []; } catch { /* The language still selects the browser default. */ }
    const korean = voices.filter(voice => /^ko(?:[-_]|$)/i.test(voice.lang));
    return korean.find(voice => voice.localService) || korean[0];
  }
  snapshot() {
    return { supported: this.supported, enabled: this.enabled, active: Boolean(this.current), speaking: this.speaking, error: this.error };
  }
  changed() { this.onChange(this.snapshot()); }
  update(guide, scope = '') {
    const task = guide?.current;
    if (!task || guide.complete) {
      if (this.current) this.stop();
      this.current = null; this.lastKey = ''; return;
    }
    const text = [task.title, task.detail, task.targetLabel ? `조작 대상. ${task.targetLabel}` : ''].filter(Boolean).join('. ');
    const key = JSON.stringify([scope, task.id, text]);
    this.current = { key, text };
    if (this.lastKey === key) return;
    this.lastKey = key;
    if (this.enabled) this.read();
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    try { this.storage?.setItem(PREFERENCE_KEY, this.enabled ? 'on' : 'off'); } catch { /* Do not affect training results. */ }
    if (this.enabled) this.read(); else this.stop();
    this.changed();
  }
  stop() {
    this.generation++; this.utterance = null; this.speaking = false; this.error = ''; this.retryWhenVoicesLoad = false;
    try { if (this.supported) this.synthesis.cancel(); } catch { /* A speech failure must not interrupt training. */ }
    this.changed();
  }
  suspend() { this.suspended = true; this.stop(); }
  resume() { this.suspended = false; }
  read() {
    if (!this.supported || !this.enabled || !this.current || this.suspended) return;
    this.stop(); const generation = this.generation;
    try {
      const utterance = new this.Utterance(this.current.text);
      utterance.lang = 'ko-KR'; utterance.rate = .95; utterance.pitch = 1; utterance.volume = 1;
      const voice = this.koreanVoice(); if (voice) utterance.voice = voice;
      this.utterance = utterance;
      utterance.onstart = () => { if (generation === this.generation) { this.speaking = true; this.changed(); } };
      utterance.onend = () => { if (generation === this.generation) { this.utterance = null; this.speaking = false; this.changed(); } };
      utterance.onerror = event => {
        if (generation !== this.generation) return;
        this.utterance = null; this.speaking = false;
        if (['canceled', 'interrupted'].includes(event.error)) { this.changed(); return; }
        this.retryWhenVoicesLoad = ['language-unavailable', 'voice-unavailable', 'synthesis-unavailable'].includes(event.error);
        this.error = event.error === 'not-allowed' ? '다시 듣기를 눌러 음성 안내를 시작하세요.'
          : this.retryWhenVoicesLoad ? '한국어 음성을 사용할 수 없습니다. 기기의 음성 설정을 확인하세요.' : '음성을 재생하지 못했습니다. 다시 듣기를 눌러주세요.';
        this.changed();
      };
      this.synthesis.speak(utterance);
    } catch {
      if (generation !== this.generation) return;
      this.utterance = null; this.speaking = false; this.error = '음성을 재생하지 못했습니다. 다시 듣기를 눌러주세요.'; this.changed();
    }
  }
  dispose() { this.stop(); this.synthesis?.removeEventListener?.('voiceschanged', this.voicesChanged); }
}

export function renderVoiceControls() {
  return `<div class="task-voice-controls" role="group" aria-label="현재 작업 음성 안내"><button type="button" data-action="voice-toggle" aria-pressed="true">음성 켜짐</button><button type="button" data-action="voice-repeat">다시 듣기</button><span class="voice-status" data-voice-status role="status" hidden></span></div>`;
}

export function updateVoiceControls(root, status) {
  root.querySelectorAll('.task-voice-controls').forEach(group => {
    const toggle = group.querySelector('[data-action="voice-toggle"]'), repeat = group.querySelector('[data-action="voice-repeat"]'), note = group.querySelector('[data-voice-status]');
    toggle.disabled = !status.supported; toggle.setAttribute('aria-pressed', String(status.enabled && status.supported));
    toggle.textContent = status.enabled && status.supported ? '음성 켜짐' : '음성 꺼짐';
    toggle.setAttribute('aria-label', status.enabled && status.supported ? '음성 안내 끄기' : '음성 안내 켜기');
    repeat.disabled = !status.supported || !status.enabled || !status.active;
    note.textContent = !status.supported ? '이 브라우저는 음성 안내를 지원하지 않습니다.' : status.error || (status.speaking ? '안내 읽는 중…' : '');
    note.hidden = !note.textContent;
  });
}
