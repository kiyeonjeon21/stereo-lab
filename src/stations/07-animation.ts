import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createViewer } from '../lib/viewer';

// Station 07 — skeletal animation. The north star: "3D motion."
// Soldier.glb ships a skeleton plus several baked clips (Idle / Walk / Run).
// An AnimationMixer plays them and we crossfade between them on demand.
// Graduation question: how does mixer.update(delta) mesh with the render loop?
// (Same time-driven idea as station 00 — we feed it real elapsed time per frame.)
export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.camera.position.set(2.5, 1.6, 4);
  viewer.controls.target.set(0, 1, 0);
  viewer.scene.add(new THREE.GridHelper(20, 20, 0x30363d, 0x21262d));

  let mixer: THREE.AnimationMixer | null = null;
  let root: THREE.Object3D | null = null;

  const ui = document.createElement('div');
  ui.className = 'station-message';
  ui.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; gap:6px; pointer-events:auto;';
  container.appendChild(ui);

  new GLTFLoader().load('models/Soldier.glb', (gltf) => {
    root = gltf.scene;
    viewer.scene.add(root);

    mixer = new THREE.AnimationMixer(root);
    // one action per clip; key them by clip name (Idle / Walk / Run / TPose…)
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);

    const names = gltf.animations.map((c) => c.name);
    let current = actions[names[0]];
    current.play();

    // crossfade: blend the outgoing action into the incoming one over 0.3s
    const fadeTo = (name: string) => {
      const next = actions[name];
      if (!next || next === current) return;
      next.reset().setEffectiveWeight(1).play();
      current.crossFadeTo(next, 0.3, false);
      current = next;
    };

    for (const name of names) {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.style.cssText = 'margin-right:4px; padding:4px 10px; cursor:pointer; background:#161b22; color:#e6e6e6; border:1px solid #30363d; border-radius:6px;';
      btn.addEventListener('click', () => fadeTo(name));
      ui.appendChild(btn);
    }
    const hint = document.createElement('p');
    hint.style.cssText = 'opacity:0.6; width:100%';
    hint.textContent = 'Click a clip to crossfade. The mixer advances on render-loop time (delta).';
    ui.appendChild(hint);

    // the bridge to the render loop: advance the animation by real elapsed time
    viewer.onFrame((_, delta) => mixer?.update(delta));
    console.log('[07-animation] clips:', names);
  });

  return () => {
    ui.remove();
    if (mixer && root) { mixer.stopAllAction(); mixer.uncacheRoot(root); }
    if (root) {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m?.dispose();
        }
      });
    }
    viewer.dispose();
  };
}
