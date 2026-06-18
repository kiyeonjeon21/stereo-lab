import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createViewer } from '../lib/viewer';

// Station 06 — a real PBR model + image-based lighting.
// Unlike the toy building.glb (positions only), DamagedHelmet carries textures:
// base color, normal, metalness/roughness, emissive, ambient occlusion.
// Graduation question: why does PBR *need* an environment map?
// Because metallic/glossy surfaces show mostly REFLECTIONS — with no environment
// to reflect, metal just looks flat black. IBL gives them something to mirror.
export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.camera.position.set(0, 0.2, 3.2);
  viewer.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  viewer.renderer.toneMappingExposure = 1.0;

  // Build an environment map from three's procedural room (no HDR file needed),
  // pre-filtered by PMREMGenerator into the format PBR materials reflect.
  const pmrem = new THREE.PMREMGenerator(viewer.renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  viewer.scene.environment = envTex;

  let model: THREE.Object3D | null = null;
  new GLTFLoader().load('models/DamagedHelmet.glb', (gltf) => {
    model = gltf.scene;
    viewer.scene.add(model);
    viewer.onFrame((_, delta) => { if (model) model.rotation.y += delta * 0.25; });
    console.log('[06-pbr] helmet loaded; materials:', collectMaterials(model).map((m) => m.type));
  });

  // exposure slider — drag to see tone mapping compress highlights
  const ui = document.createElement('div');
  ui.className = 'station-message';
  ui.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; pointer-events:auto;';
  ui.innerHTML =
    '<label style="opacity:0.8">exposure <input id="exp" type="range" min="0.2" max="2.5" step="0.05" value="1"></label>' +
    '<p style="opacity:0.6">Real PBR textures + image-based lighting (reflections come from the environment map).</p>';
  container.appendChild(ui);
  const slider = ui.querySelector('#exp') as HTMLInputElement;
  slider.addEventListener('input', () => { viewer.renderer.toneMappingExposure = Number(slider.value); });

  return () => {
    ui.remove();
    pmrem.dispose();
    envTex.dispose();
    if (model) {
      for (const m of collectMaterials(model)) m.dispose();
      model.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) mesh.geometry?.dispose(); });
    }
    viewer.dispose();
  };
}

function collectMaterials(root: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) out.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  });
  return out;
}
