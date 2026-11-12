// Only capability detection happens here; the visible renderer stays on the main thread.
self.onmessage = event => {
  let gl, available = false;
  try {
    gl = new OffscreenCanvas(4, 4).getContext('webgl2', event.data);
    if (gl?.getContextAttributes()?.depth) {
      gl.clearColor(.2, .4, .6, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      available = !gl.isContextLost() && pixel[3] === 255;
    }
  } catch { available = false; }
  finally {
    try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* Capability failure still needs a reply. */ }
    self.postMessage({ available });
  }
};
