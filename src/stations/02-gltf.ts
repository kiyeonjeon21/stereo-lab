import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createViewer } from '../lib/viewer';

// Station 02 — the I/O layer round-trip.
// The SAME building, but generated offline by `npm run gen:glb` (manifold →
// gltf-transform → public/models/building.glb) and loaded back here. Open the
// console to see the raw glTF JSON: scenes → nodes → meshes → accessors.
export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.scene.add(new THREE.GridHelper(20, 20, 0x30363d, 0x21262d));

  const loaded: THREE.Object3D[] = [];
  const loader = new GLTFLoader();
  loader.load(
    'models/building.glb',
    (gltf) => {
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).material = new THREE.MeshStandardMaterial({
            color: 0x7ee787,
            roughness: 0.5,
            metalness: 0.1,
            flatShading: true,
          });
        }
      });
      viewer.scene.add(gltf.scene);
      loaded.push(gltf.scene);
      // Peek inside the format: this is the parsed glTF 2.0 JSON document.
      console.log('[02-gltf] glTF JSON tree:', gltf.parser.json);
    },
    undefined,
    (err) => {
      console.error('[02-gltf] load failed — did you run `npm run gen:glb`?', err);
      const msg = document.createElement('div');
      msg.className = 'station-message';
      msg.innerHTML =
        '<h1>📦 no building.glb yet</h1><p>Run <code>npm run gen:glb</code> to generate <code>public/models/building.glb</code>, then reload.</p>';
      container.appendChild(msg);
    },
  );

  return () => {
    for (const obj of loaded) {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          (m.material as THREE.Material)?.dispose();
        }
      });
    }
    viewer.dispose();
  };
}
