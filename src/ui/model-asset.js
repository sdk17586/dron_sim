// Current models are required. A failed load leaves an empty stage and can be retried.
export function loadModelAsset(view, loader) {
  if (view.disposed || view.canvas.dataset.modelStatus === 'loading') return view.modelReady;
  const root = view.drone || view.body;
  const geometries = new Set(view.geometries);
  const materials = new Set(view.materials instanceof Set ? view.materials : Object.values(view.materials));
  view.canvas.dataset.modelStatus = 'loading';
  view.canvas.dataset.ready = 'false';
  delete view.canvas.dataset.modelError;
  const draw = () => (view.draw || view.render).call(view);
  draw();
  view.modelReady = loader(view).then(() => {
    if (view.disposed) return;
    view.canvas.dataset.modelStatus = 'ready';
    if (view.ui) view.sync(view.state, view.ui);
    draw();
    view.host?.dispatchEvent(new CustomEvent('model-ready', { bubbles: true }));
  }).catch(error => {
    if (view.disposed) return;
    // Discard even a partially assembled model before retrying it.
    view.workshop?.dispose(); delete view.workshop;
    view.imuInteraction?.dispose(); delete view.imuInteraction;
    root.clear();
    (view.motors || view.legs)?.clear();
    delete view.portedDrone; delete view.portedRig;
    for (const geometry of view.geometries) if (!geometries.has(geometry)) {
      geometry.dispose(); view.geometries.delete(geometry);
    }
    if (view.materials instanceof Set) {
      for (const material of view.materials) if (!materials.has(material)) {
        material.dispose(); view.materials.delete(material);
      }
    } else for (const [key, material] of Object.entries(view.materials)) if (!materials.has(material)) {
      material.dispose(); delete view.materials[key];
    }
    view.assetTextures?.forEach(texture => texture.dispose());
    view.assetTextures?.clear();
    view.syncing = false;
    view.canvas.dataset.modelStatus = 'error';
    view.canvas.dataset.ready = 'false';
    view.canvas.dataset.modelSource = 'unavailable';
    delete view.canvas.dataset.modelQuality; delete view.canvas.dataset.modelLinks;
    view.canvas.dataset.modelError = error.message;
    draw();
  });
  return view.modelReady;
}

export function renderModelStatus(view, name, className, loader) {
  const ready = view.canvas.dataset.modelStatus === 'ready';
  view.canvas.dataset.ready = String(ready);
  let note = view.host.querySelector(`.${className}`);
  if (ready) { note?.remove(); return true; }
  if (!note) {
    note = document.createElement('div');
    note.className = `${className} model-asset-status`;
    note.setAttribute('role', 'status');
    note.append(document.createElement('p'));
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'button'; retry.dataset.modelRetry = '';
    retry.textContent = '모델 다시 불러오기';
    retry.addEventListener('click', event => {
      event.stopPropagation(); loadModelAsset(view, loader);
    });
    note.append(retry); view.host.append(note);
  }
  const loading = view.canvas.dataset.modelStatus === 'loading';
  note.querySelector('p').textContent = loading ? `${name} 모델을 불러오고 있습니다…` : `${name} 모델을 불러오지 못했습니다. 다시 시도해 주세요.`;
  note.querySelector('button').hidden = loading;
  return false;
}
