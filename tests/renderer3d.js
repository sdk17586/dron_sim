import { chooseRenderBackend, CONTEXT_OPTIONS, watchRendererContext, disposeRenderer3D } from '../src/ui/renderer3d.js';

let passed = 0;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
const originals = { Worker: globalThis.Worker, OffscreenCanvas: globalThis.OffscreenCanvas };
let created = 0, terminated = 0, options;
function worker(mode) {
  globalThis.OffscreenCanvas = class {};
  globalThis.Worker = class {
    constructor(url, config) { assert(String(url).endsWith('/webgl-probe.js') && config.type === 'module', 'wrong probe'); created++; }
    postMessage(attributes) {
      options = attributes;
      if (mode === 'timeout') return;
      setTimeout(() => mode === 'error' ? this.onerror({ preventDefault() {} }) : this.onmessage({ data: { available: mode === 'webgl' } }), 0);
    }
    terminate() { terminated++; }
  };
}
try {
  await test('호환 표시를 명시하면 그래픽 검사를 건너뜀', async () => {
    worker('webgl'); const before = created;
    assert(await chooseRenderBackend({ compatible: true }) === 'svg' && before === created, 'forced compatibility ignored');
  });
  await test('그래픽 검사에 필요한 브라우저 기능이 없으면 호환 3D', async () => {
    globalThis.Worker = undefined; assert(await chooseRenderBackend() === 'svg', 'missing Worker accepted');
    worker('webgl'); globalThis.OffscreenCanvas = undefined; assert(await chooseRenderBackend() === 'svg', 'missing OffscreenCanvas accepted');
  });
  await test('깊이 검사 성공 시 WebGL 선택·검사 자원 해제', async () => {
    worker('webgl'); const before = terminated;
    assert(await chooseRenderBackend() === 'webgl' && terminated === before + 1, 'success not released');
    assert(options.depth && options.antialias && !options.stencil && options.powerPreference === 'low-power', 'wrong context options');
    assert(Object.isFrozen(CONTEXT_OPTIONS), 'context defaults can drift');
  });
  await test('그래픽 미지원·검사 오류는 호환 3D로 복구', async () => {
    for (const mode of ['svg', 'error']) { worker(mode); assert(await chooseRenderBackend() === 'svg', 'failed probe accepted'); }
    globalThis.Worker = class { constructor() { throw new Error('unavailable'); } };
    assert(await chooseRenderBackend() === 'svg', 'worker startup failure escaped');
  });
  await test('응답 없는 검사는 제한 시간 후 정리하고 호환 표시 선택', async () => {
    worker('timeout'); const before = terminated;
    assert(await chooseRenderBackend({ timeout: 10 }) === 'svg' && terminated === before + 1, 'timeout not handled');
  });
  await test('현재 화면의 그래픽 연결 중단만 복구 콜백으로 전달', async () => {
    const view={canvas:new EventTarget(),disposed:false};let calls=0;
    const release=watchRendererContext(view,()=>calls++);
    const active=new Event('webglcontextlost',{cancelable:true});view.canvas.dispatchEvent(active);
    assert(calls===1&&active.defaultPrevented,'active context ignored');
    view.disposed=true;const retired=new Event('webglcontextlost',{cancelable:true});view.canvas.dispatchEvent(retired);
    assert(calls===1&&!retired.defaultPrevented,'retired context changed live backend');release();
  });
  await test('폐기 시 연결 감시를 제거해 지연된 오류를 무시', async () => {
    const view={canvas:new EventTarget()};let calls=0;
    const release=watchRendererContext(view,()=>calls++);release();
    view.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert(calls===0,'listener leaked');
  });
  await test('렌더러 객체와 네이티브 그래픽 연결을 순서대로 해제하며 호환 표시도 처리', async () => {
    const calls=[];disposeRenderer3D({dispose:()=>calls.push('dispose'),forceContextLoss:()=>calls.push('release')});
    assert(calls.join(',')==='dispose,release','native context retained');
    disposeRenderer3D({dispose:()=>calls.push('svg')});assert(calls.at(-1)==='svg','SVG cleanup failed');
    disposeRenderer3D({dispose:()=>calls.push('already-lost'),getContext:()=>({isContextLost:()=>true}),forceContextLoss:()=>{throw new Error('lost twice');}});
    assert(calls.at(-1)==='already-lost','lost context cleanup failed');
  });
} finally {
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
console.log(`ALL PASS · ${passed} renderer checks`);
