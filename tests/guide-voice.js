import { GuideVoice } from '../src/ui/guide-voice.js';

let passed = 0;
const assert = (value, message) => { if (!value) throw new Error(message); };
const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
const guide = (id = 'power', detail = '전원을 확인하세요.') => ({ current: { id, title: '현재 작업', detail, targetLabel: '본체 전원' }, complete: false });
function setup(preference = null) {
  const spoken = [], stored = new Map(preference ? [['aerolab.voice.v1', preference]] : []), listeners = new Map();
  let voices = [{ lang: 'en-US', localService: true }, { lang: 'ko-KR', localService: false }, { lang: 'ko-KR', localService: true }];
  const synthesis = { speak: utterance => spoken.push(utterance), cancel() { this.cancelled = (this.cancelled || 0) + 1; }, getVoices: () => voices,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const narrator = new GuideVoice({ synthesis, Utterance: class { constructor(text) { this.text = text; } },
    storage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } });
  return { narrator, spoken, stored, synthesis, listeners, voices: list => { voices = list; } };
}
test('현재 제목·설명·조작 대상을 한국어로 읽고 기기의 한국어 음성을 우선 선택', () => {
  const { narrator, spoken } = setup(); narrator.update(guide(), 'drone');
  assert(spoken.length === 1 && spoken[0].lang === 'ko-KR' && spoken[0].voice.localService, 'wrong language or voice');
  assert(spoken[0].text.includes('전원을 확인하세요.') && spoken[0].text.includes('본체 전원'), 'missing guide text');
});
test('도움말·반복 화면 갱신은 중복 재생하지 않고 작업/내용/회차 변경만 새로 재생', () => {
  const { narrator, spoken } = setup();
  for (let i = 0; i < 100; i++) narrator.update({ ...guide(), remaining: i }, 'drone:1');
  assert(spoken.length === 1, 'render caused repeat');
  narrator.update(guide('battery'), 'drone:1'); narrator.update(guide('battery', '배터리를 꺼내세요.'), 'drone:1'); narrator.update(guide('battery'), 'drone:2');
  assert(spoken.length === 4, 'guide change not narrated');
});
test('새 작업·다시 듣기는 이전 음성을 취소하고 지연된 이전 콜백을 무시', () => {
  const { narrator, spoken, synthesis } = setup(); narrator.update(guide()); const old = spoken[0];
  narrator.update(guide('battery')); const current = spoken[1]; current.onstart(); old.onerror({ error: 'not-allowed' }); old.onend();
  assert(narrator.speaking && !narrator.error && synthesis.cancelled >= 2, 'stale callback changed current state');
  narrator.read(); assert(spoken.length === 3, 'replay failed');
});
test('음성 끄기는 즉시 취소·설정 보존, 다음 작업도 조용하며 켜면 현재 작업부터 재생', () => {
  const { narrator, spoken, stored } = setup(); narrator.update(guide()); narrator.setEnabled(false); narrator.update(guide('battery'));
  assert(spoken.length === 1 && stored.get('aerolab.voice.v1') === 'off', 'mute not retained');
  narrator.setEnabled(true); assert(spoken.length === 2 && stored.get('aerolab.voice.v1') === 'on', 'enable did not read current');
  const muted = setup('off'); muted.narrator.update(guide()); assert(!muted.spoken.length, 'saved mute ignored');
});
test('화면 이탈·교육 완료 시 취소하고 새 교육에 다시 진입하면 현재 안내 재생', () => {
  const { narrator, spoken } = setup(); narrator.update(guide()); narrator.update(null); narrator.read();
  assert(spoken.length === 1 && !narrator.current, 'read after leaving');
  narrator.update(guide()); narrator.update({ ...guide(), complete: true }); narrator.read();
  assert(spoken.length === 2 && !narrator.current, 'completion did not stop');
});
test('초점 이탈 후 상태 변경·음성 버튼으로 재생하지 않으며 복귀만으로 재개하지 않음', () => {
  const { narrator, spoken } = setup(); narrator.update(guide()); narrator.suspend(); narrator.update(guide('battery')); narrator.read();
  assert(spoken.length === 1, 'background speech'); narrator.resume(); narrator.update(guide('battery'));
  assert(spoken.length === 1, 'resumed automatically'); narrator.read(); assert(spoken.length === 2, 'explicit replay failed');
});
test('재생 차단 오류 안내·직접 재시도와 비동기 한국어 음성 목록 로딩', () => {
  const { narrator, spoken, voices, listeners } = setup(); voices([]); narrator.update(guide());
  spoken[0].onerror({ error: 'not-allowed' }); assert(narrator.error.includes('다시 듣기'), 'missing autoplay feedback');
  narrator.read(); spoken[1].onerror({ error: 'language-unavailable' });
  voices([{ lang: 'ko-KR', localService: true }]); listeners.get('voiceschanged')();
  assert(spoken.length === 3 && spoken[2].voice.lang === 'ko-KR' && !narrator.error, 'late voice not used');
});
test('음성 API 미지원·저장 차단·재생 예외가 교육을 중단하지 않음', () => {
  const unsupported = new GuideVoice({ synthesis: null, Utterance: null }); unsupported.update(guide()); unsupported.read();
  assert(!unsupported.supported, 'unsupported API accepted');
  const { synthesis } = setup(); synthesis.speak = () => { throw new Error('unavailable'); };
  const narrator = new GuideVoice({ synthesis, Utterance: class {}, storage: { getItem() { throw new Error(); }, setItem() { throw new Error(); } } });
  narrator.update(guide()); assert(narrator.error, 'missing error feedback'); narrator.setEnabled(false);
});
console.log(`ALL PASS · ${passed} guide voice checks`);
