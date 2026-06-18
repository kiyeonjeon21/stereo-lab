import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createViewer } from '../lib/viewer';

// Station 14 — morph-target flock. Station 07 animated a SKELETON (bones rotate the
// mesh). These birds have no bones — each wing-flap clip blends the vertices toward
// stored target shapes (morph targets / blend shapes). Graduation question: how do
// you flap a wing with no skeleton? Interpolate vertex positions toward a target pose.
interface Bird { obj: THREE.Object3D; radius: number; speed: number; phase: number; y: number; }

export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.camera.position.set(0, 3, 16);
  viewer.controls.target.set(0, 1, 0);
  viewer.scene.add(new THREE.GridHelper(40, 40, 0x30363d, 0x21262d));

  const loader = new GLTFLoader();
  const mixers: THREE.AnimationMixer[] = [];
  const birds: Bird[] = [];
  const kinds = ['models/Flamingo.glb', 'models/Parrot.glb', 'models/Stork.glb'];

  kinds.forEach((url, k) => {
    loader.load(url, (gltf) => {
      const template = gltf.scene;
      // normalize size — these models ship at very different scales
      const span = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).length();
      const scale = 4 / span;

      // a small flock of each species at different orbits/heights/phases
      for (let i = 0; i < 3; i++) {
        const obj = k === 0 && i === 0 ? template : template.clone(true);
        obj.scale.setScalar(scale);
        viewer.scene.add(obj);

        const mixer = new THREE.AnimationMixer(obj);
        mixer.clipAction(gltf.animations[0]).play(); // the wing-flap morph clip
        mixer.timeScale = 0.8 + Math.random() * 0.6;
        mixers.push(mixer);

        birds.push({ obj, radius: 4 + k * 2 + i * 0.8, speed: 0.5 - k * 0.08, phase: (i / 3) * Math.PI * 2 + k, y: 1.5 + k * 1.2 });
      }
      console.log(`[14-birds] ${url.split('/').pop()} ×3, scale ${scale.toFixed(3)}, clips:`, gltf.animations.map((c) => c.name));
    });
  });

  viewer.onFrame((t, delta) => {
    for (const m of mixers) m.update(delta);            // advance the wing-flap morphs
    for (const b of birds) {
      const a = t * b.speed + b.phase;
      b.obj.position.set(Math.cos(a) * b.radius, b.y + Math.sin(t + b.phase) * 0.5, Math.sin(a) * b.radius);
      b.obj.rotation.y = -a; // face along the circular path
    }
  });

  const hint = document.createElement('div');
  hint.className = 'station-message';
  hint.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; pointer-events:none;';
  hint.innerHTML = '<p style="opacity:0.6">morph-target (blend-shape) animation — no skeleton; the flap blends vertices toward a target pose. Contrast with station 07 (skeletal).</p>';
  container.appendChild(hint);

  return () => {
    hint.remove();
    for (const m of mixers) m.stopAllAction();
    for (const b of birds) b.obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat?.dispose();
      }
    });
    viewer.dispose();
  };
}
