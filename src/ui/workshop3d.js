import * as THREE from '../vendor/three/three.module.min.js';

// Shared spatial interaction for both teaching models. Domain state is committed
// only after a valid placement animation; cancellation never changes the parts.
export class Workshop3D {
  constructor(view) {
    this.view = view; this.scene = view.scene; this.camera = view.camera; this.canvas = view.canvas;
    this.entries = []; this.geometries = new Set(); this.materials = new Map(); this.epoch = 0;
    this.bench = new THREE.Group(); this.scene.add(this.bench); this.bench.visible = false;
    this.proxies = new THREE.Group(); this.scene.add(this.proxies); this.ray = new THREE.Raycaster();
    this.markers = new THREE.Group(); this.scene.add(this.markers);
    this.proxyGeometry = new THREE.SphereGeometry(1, 8, 6); this.geometries.add(this.proxyGeometry);
    this.ring = this.mesh(new THREE.TorusGeometry(.18, .018, 5, 28), '#3b82f6'); this.scene.add(this.ring); this.ring.visible = false;
    this.listen();
  }
  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshLambertMaterial({ color }));
    return this.materials.get(color);
  }
  mesh(geometry, color, parent, position = [0,0,0]) {
    this.geometries.add(geometry); const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(...position); parent?.add(mesh); return mesh;
  }
  box(x,y,z,color,parent,position) { return this.mesh(new THREE.BoxGeometry(x,y,z),color,parent,position); }
  cylinder(r,h,color,parent,position) { return this.mesh(new THREE.CylinderGeometry(r,r,h,12),color,parent,position); }
  art(kind, color = '#496958', charge = 100) {
    const g = new THREE.Group();
    if (kind === 'driver') {
      this.cylinder(.11,.55,color,g,[0,.42,0]); this.cylinder(.025,.5,'#aab8ae',g,[0,-.09,0]);
      this.box(.065,.12,.025,'#c4cec4',g,[0,-.37,0]); g.rotation.z = -.65;
    } else if (kind === 'blade') {
      const blade = this.box(1,.05,.18,color,g,[0,.08,0]); blade.rotation.y = -.3;
      this.cylinder(.095,.07,'#c9d5c5',g,[.4,.1,-.12]);
    } else if (kind === 'screw') {
      this.cylinder(.09,.07,'#bac9ba',g,[0,.2,0]); this.cylinder(.035,.27,'#7d9483',g,[0,.04,0]);
      this.box(.13,.012,.025,'#405a49',g,[0,.24,0]);
    } else if (kind === 'module') {
      const housing=this.cylinder(.29,.35,color,g,[0,.3,0]); housing.rotation.z=Math.PI/2;
      const cap=this.cylinder(.19,.38,'#b8c9c0',g,[0,.3,0]); cap.rotation.z=Math.PI/2;
      const axle=this.cylinder(.1,.41,'#3d625b',g,[0,.3,0]); axle.rotation.z=Math.PI/2;
    } else if (kind === 'stand') {
      for (const x of [-.25,.25]) this.box(.09,.65,.1,'#97aaa1',g,[x,.34,0]);
      this.box(.72,.08,.42,color,g,[0,.05,0]); this.box(.65,.09,.25,'#c49b62',g,[0,.7,0]);
    } else if (kind === 'tray') {
      this.box(1.4,.08,1.1,'#9aada2',g,[0,.04,0]);
      for (const x of [-.72,.72]) this.box(.06,.25,1.18,'#607e6c',g,[x,.14,0]);
      for (const z of [-.57,.57]) this.box(1.5,.25,.06,'#607e6c',g,[0,.14,z]);
    } else {
      this.box(.66,.3,.43,color,g,[0,.2,0]); this.box(.48,.02,.045,'#263a2d',g,[0,.36,0]);
      if(charge>0)this.box(.48*charge/100,.025,.045,charge<=20?'#cf674b':charge<=50?'#c99a3c':'#71ad50',g,[-.24+.24*charge/100,.365,0]);
      this.box(.08,.18,.2,'#b4c5b4',g,[.36,.2,0]);
    }
    return g;
  }
  event(name, detail) { this.view.host?.dispatchEvent(new CustomEvent(`workshop-${name}`, { bubbles:true, detail })); }
  reset(active, validate) {
    this.cancel(); this.epoch++; this.active = active; this.validate = validate;
    this.tooltip?.remove(); this.tooltip=null;
    this.entries = []; this.proxies.clear(); this.markers.clear();
    this.bench.traverse(o => { if (o.isMesh && this.geometries.has(o.geometry)) { o.geometry.dispose(); this.geometries.delete(o.geometry); } });
    this.bench.clear(); this.bench.visible = active;
    this.layer?.remove(); this.layer = null; this.ring.visible = false;
    this.canvas.dataset.workshop = String(active);
    if (!active || !this.view.host) return;
    this.layer = document.createElement('div'); this.layer.className = 'spatial-labels'; this.view.host.append(this.layer);
    this.tooltip = document.createElement('output'); this.tooltip.className = 'spatial-tooltip'; this.tooltip.hidden = true; this.view.host.append(this.tooltip);
    this.box(9,.12,1.55,'#c9d2c7',this.bench,[0,-.1,0]);
    this.canvas.dataset.workshop = 'true';
  }
  bind(id, object, options = {}) {
    const entry = { id, object, radius:.16, ...options };
    const proxy = new THREE.Mesh(this.proxyGeometry, this.material('#8aa180')); proxy.visible = false;
    proxy.userData.entry = entry; this.proxies.add(proxy); entry.proxy = proxy;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'spatial-hit';
    button.dataset.spatialId = id; button.setAttribute('aria-label', entry.label || id); button.textContent = entry.label || id;
    button.dataset.current = String(Boolean(entry.current));
    button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.activate(entry); });
    button.addEventListener('focus', () => this.showHint(entry)); this.layer.append(button); entry.button = button;
    const cue = document.createElement('span'); cue.className = 'spatial-task-cue'; cue.setAttribute('aria-hidden','true'); cue.hidden = true;
    this.layer.append(cue); entry.cue = cue;
    if (entry.caption) { const label = document.createElement('span'); label.className = 'spatial-caption'; label.textContent = entry.caption; this.layer.append(label); entry.captionNode = label; }
    this.entries.push(entry); return entry;
  }
  stock(id, kind, x, options = {}) {
    const object = options.model || this.art(kind, options.color,options.charge); object.position.set(x,.02,0); this.bench.add(object);
    return this.bind(id,object,{ radius:.34, caption:options.label, ...options, anchor:() => object.localToWorld(new THREE.Vector3(0,.28,0)), supply:true });
  }
  anchor(entry) { return entry.anchor ? entry.anchor() : entry.object.getWorldPosition(new THREE.Vector3()); }
  accepts(piece,target) {
    const kinds={battery:'discard','mounted-blade':'discard','battery-pack':'battery-slot',driver:'screw',blade:'blade',screw:'screw','robot-battery':'robot-discard','robot-mounted-module':'robot-discard','robot-stored-battery':'robot-battery-slot','robot-driver':'robot-bolt','robot-module':'robot-module-slot','robot-support':'robot-support-slot'};
    return Boolean(piece && target && kinds[piece.kind]===target.kind);
  }
  update() {
    if (!this.active || !this.view.host?.isConnected) return;
    // OrbitControls changes the camera before the renderer updates its matrices.
    // Picking, projected hints and the tool tray must use the new camera together.
    this.camera.updateMatrixWorld(true);
    const distance = this.camera.position.distanceTo(this.view.controls.target);
    const direction = new THREE.Vector3(0,-.68,.3).unproject(this.camera).sub(this.camera.position).normalize();
    this.bench.position.copy(this.camera.position).addScaledVector(direction,distance*.72);
    this.bench.quaternion.copy(this.camera.quaternion); this.bench.rotateX(Math.PI/2-.35);
    this.bench.scale.setScalar(distance * .065 * Math.min(1,this.camera.aspect));
    this.scene.updateMatrixWorld(true);
    const w = this.view.host.clientWidth, h = this.view.host.clientHeight; this.ring.visible=false;
    for (const entry of this.entries) {
      const point = this.anchor(entry); entry.proxy.position.copy(point);
      entry.proxy.scale.setScalar(entry.supply ? distance*.032*Math.min(1,this.camera.aspect) : entry.radius);
      const p = point.clone().project(this.camera), x = (p.x+1)*.5*w, y = (1-p.y)*.5*h;
      entry.button.style.left = `${x}px`; entry.button.style.top = `${y}px`;
      const visible = Math.abs(p.x)<.97 && Math.abs(p.y)<.97 && p.z<1 && entry.enabled !== false;
      entry.button.hidden = !visible; entry.button.dataset.x = String(x); entry.button.dataset.y = String(y);
      entry.cue.style.left = `${x}px`; entry.cue.style.top = `${y}px`;
      entry.cue.hidden = !visible || !(this.held ? this.accepts(this.held.entry.piece,entry.drop) : entry.current);
      if (entry.captionNode) { entry.captionNode.style.left = `${x}px`; entry.captionNode.style.top = `${y+23}px`; entry.captionNode.hidden = !visible; }
      if (entry.current && !this.held) { this.ring.position.copy(point); this.ring.quaternion.copy(this.camera.quaternion); this.ring.visible = visible; }
      if(entry.drop){
        if(!entry.marker){entry.marker=new THREE.Mesh(this.ring.geometry,this.ring.material);this.markers.add(entry.marker);}
        entry.marker.position.copy(point);entry.marker.quaternion.copy(this.camera.quaternion);
        entry.marker.visible=visible && this.accepts(this.held?.entry.piece,entry.drop);
      }
    }
    this.proxies.updateMatrixWorld(true);
    this.canvas.dataset.holding3d = this.held?.entry.piece?.kind || '';
    const heldNote=this.view.host.closest('.immersive-stage')?.querySelector('.scene-held-note');
    if(heldNote){heldNote.hidden=!this.held;heldNote.textContent=this.held?`들고 있음: ${this.held.entry.label} · Esc 취소`:'';}
  }
  hit(event) {
    this.update(); const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),this.camera);
    return this.ray.intersectObjects(this.proxies.children,false).map(hit => hit.object.userData.entry)
      .filter(entry => entry.enabled !== false && !entry.button.hidden && (!this.held || entry.drop || entry.piece))
      .sort((a,b)=>(b.priority||0)-(a.priority||0))[0];
  }
  showHint(entry) {
    if (!this.tooltip || !entry) return;
    this.tooltip.textContent = entry.label; this.tooltip.hidden = false;
    const p = this.anchor(entry).project(this.camera);
    this.tooltip.style.left = `${Math.max(90,Math.min(this.view.host.clientWidth-90,(p.x+1)*.5*this.view.host.clientWidth))}px`;
    this.tooltip.style.top = `${Math.max(30,(1-p.y)*.5*this.view.host.clientHeight-30)}px`;
  }
  pick(entry) {
    this.cancel(); const ghost = entry.object.clone(true); ghost.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = false; o.material.opacity = 1; } });
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    entry.object.matrixWorld.decompose(position,quaternion,scale); ghost.position.copy(position); ghost.quaternion.copy(quaternion); ghost.scale.copy(scale);
    this.scene.add(ghost); const visible = entry.object.visible; entry.object.visible = false;
    this.held = { entry, ghost, visible }; this.view.controls.enabled = false;
    this.event('message',`${entry.label} · 놓을 곳을 클릭하거나 끌어 놓으세요. 취소: Esc`); this.draw();
  }
  move(event) {
    if (!this.held) return;
    const target=this.hit(event); if(target)this.showHint(target);else if(this.tooltip)this.tooltip.hidden=true;
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal,this.view.controls.target);
    const point = this.ray.ray.intersectPlane(plane,new THREE.Vector3());
    if (point) this.held.ghost.position.copy(point);
    this.draw();
  }
  draw() { this.view.render ? this.view.render() : this.view.draw(); }
  cancel() {
    this.epoch++; clearInterval(this.animation); this.animation = null; this.busy = false;
    if (this.held) {
      this.held.entry.object.visible = this.held.visible; this.held.ghost.removeFromParent();
      this.held.ghost.traverse(o => { if (o.isMesh) o.material.dispose(); }); this.held = null;
    }
    if (this.operation) { this.operation.object.position.copy(this.operation.position); this.operation.object.quaternion.copy(this.operation.quaternion); this.operation=null; }
    if (this.tooltip) this.tooltip.hidden=true;
    if (this.active) this.view.controls.enabled = true;
    this.canvas.dataset.holding3d = ''; this.canvas.dataset.busy3d = 'false'; this.down = null;
  }
  activate(entry) {
    if (!this.active || this.busy) return;
    if (this.held && entry.drop) { this.place(entry); return; }
    if (entry.piece) { this.pick(entry); return; }
    if (this.held) return;
    if (entry.action && entry.press) {
      this.busy=true; this.canvas.dataset.busy3d='true'; const token=this.epoch, start=performance.now();
      this.operation={object:entry.object,position:entry.object.position.clone(),quaternion:entry.object.quaternion.clone()};
      this.animation=setInterval(()=>{
        if (token!==this.epoch || !this.view.host?.isConnected) return this.cancel();
        const t=window.matchMedia('(prefers-reduced-motion: reduce)').matches?1:Math.min(1,(performance.now()-start)/200);
        entry.object.position.copy(this.operation.position).addScaledVector(entry.press,t); this.draw();
        if(t===1){this.cancel();this.event('action',entry.action);}
      },40);
    } else if (entry.action) this.event('action',entry.action);
    else if (entry.drop) this.event('message','먼저 3D 작업대의 공구나 부품을 집어주세요.');
  }
  place(destination) {
    const carried = this.held; if (!carried) return;
    const piece = carried.entry.piece, target = destination.drop;
    if (this.validate && !this.validate(piece,target)) { this.cancel(); this.event('place',{piece,target}); return; }
    this.busy = true; this.canvas.dataset.busy3d = 'true';
    const token = this.epoch, start = performance.now(), from = carried.ghost.position.clone(), to = this.anchor(destination);
    const driver=piece.kind.includes('driver'), axis=destination.toolAxis || new THREE.Vector3(0,1,0);
    const toolRotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
    if(driver)to.addScaledVector(axis,.38*carried.ghost.scale.y);
    if (destination.turn) this.operation={object:destination.turn,position:destination.turn.position.clone(),quaternion:destination.turn.quaternion.clone()};
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : piece.kind.includes('driver') ? 500 : 330;
    this.animation = setInterval(() => {
      if (token !== this.epoch || !this.view.host?.isConnected) return this.cancel();
      const t = duration ? Math.min(1,(performance.now()-start)/duration) : 1;
      carried.ghost.position.lerpVectors(from,to,t); carried.ghost.position.y += Math.sin(t*Math.PI)*.22;
      if (piece.kind.includes('driver')) {
        carried.ghost.quaternion.copy(toolRotation); carried.ghost.rotateY(t*Math.PI*6);
        if (this.operation) {
          this.operation.object.quaternion.copy(this.operation.quaternion); this.operation.object.rotateY(t*Math.PI*6);
          this.operation.object.position.copy(this.operation.position).addScaledVector(destination.turnOffset || new THREE.Vector3(0,.13,0),t);
        }
      }
      this.canvas.dataset.animationFrame3d = String((Number(this.canvas.dataset.animationFrame3d)||0)+1); this.draw();
      if (t === 1) { this.cancel(); this.event('place',{piece,target}); }
    },40);
  }
  listen() {
    this.canvas.addEventListener('pointerdown', event => {
      if (!this.active || event.button !== 0) return;
      const entry = this.hit(event); if (!entry && !this.held) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (this.busy) return;
      this.down = { entry, x:event.clientX, y:event.clientY, id:event.pointerId, dragged:false };
      this.view.controls.enabled = false; this.canvas.setPointerCapture(event.pointerId);
    },true);
    this.canvas.addEventListener('pointermove', event => {
      if (!this.active) return;
      if (this.down && this.down.id === event.pointerId) {
        if (Math.hypot(event.clientX-this.down.x,event.clientY-this.down.y)>5) {
          const entry = this.down.entry; this.down.dragged = true;
          if (!this.held && entry?.piece) { const down = this.down; this.pick(entry); this.down = down; }
          if (this.held) this.move(event);
        }
        event.stopImmediatePropagation();
      } else if (this.held) this.move(event);
      else { const hit = this.hit(event); this.canvas.style.cursor = hit ? hit.piece ? 'grab' : 'pointer' : 'grab'; if (hit) this.showHint(hit); else if(this.tooltip)this.tooltip.hidden=true; }
    },true);
    this.canvas.addEventListener('pointerup', event => {
      if (!this.active || !this.down || this.down.id !== event.pointerId) return;
      const down = this.down, entry = this.hit(event); this.down = null;
      event.preventDefault(); event.stopImmediatePropagation();
      if (down.dragged) { if (this.held && entry?.drop) this.place(entry); else { this.cancel(); this.draw(); } }
      else if (entry) this.activate(entry);
      if (!this.held) this.view.controls.enabled = true;
    },true);
    this.canvas.addEventListener('pointercancel',() => { this.cancel(); this.draw(); });
    this.canvas.addEventListener('keydown', event => {
      if (event.key === 'Escape' && (this.held || this.busy)) { event.preventDefault(); event.stopImmediatePropagation(); this.cancel(); this.draw(); }
    },true);
    window.addEventListener('blur',() => { this.cancel(); this.draw(); });
    document.addEventListener('visibilitychange',() => { if (document.hidden) { this.cancel(); this.draw(); } });
  }
  detach() { this.cancel(); this.active = false; this.canvas.dataset.workshop = 'false'; this.bench.visible = false; this.ring.visible = false; this.markers.clear(); this.layer?.remove(); this.tooltip?.remove();this.tooltip=null; }
  dispose() { this.detach(); this.bench.removeFromParent(); this.proxies.removeFromParent(); this.markers.removeFromParent(); this.ring.removeFromParent(); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); }
}
