import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createViewer } from '../lib/viewer';

// Station 13 — transmission / glass. Unlike plain opacity (which just fades a
// surface), transmission lets light pass THROUGH and bend (refract), and dispersion
// splits it by wavelength (the rainbow edges). Graduation question: why does glass
// need an environment + visible background to look like anything?
// Because what you see "in" glass is the surroundings, refracted — no surroundings,
// nothing to bend, and it looks flat.
export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.camera.position.set(0, 0, 4.5);

  // environment drives both reflections and what the glass refracts; also show it as
  // the background so the bending is visible.
  const pmrem = new THREE.PMREMGenerator(viewer.renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  viewer.scene.environment = envTex;
  viewer.scene.background = envTex;

  let pivot: THREE.Group | null = null;
  new GLTFLoader().load('models/DispersionTest.glb', (gltf) => {
    const model = gltf.scene;
    // the model ships at an arbitrary scale/offset — normalize to ~3 units, centered
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    pivot = new THREE.Group();
    pivot.scale.setScalar(3 / size);
    pivot.add(model);
    viewer.scene.add(pivot);
    viewer.onFrame((_, delta) => { if (pivot) pivot.rotation.y += delta * 0.3; });
    console.log('[13-glass] transmission model loaded; span', size.toFixed(3));
  });

  const hint = document.createElement('div');
  hint.className = 'station-message';
  hint.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; pointer-events:none;';
  hint.innerHTML = '<p style="opacity:0.6">MeshPhysicalMaterial: transmission (light passes through) + IOR (bend) + dispersion (split by color). The background is what you see refracted.</p>';
  container.appendChild(hint);

  return () => {
    hint.remove();
    pmrem.dispose();
    envTex.dispose();
    if (pivot) pivot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m?.dispose();
      }
    });
    viewer.dispose();
  };
}
