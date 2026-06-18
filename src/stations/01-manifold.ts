import * as THREE from 'three';
import { createViewer } from '../lib/viewer';
import { getManifold, manifoldToGeometry } from '../lib/manifold';
import { buildBuilding } from '../lib/building';

// Station 01 — procedural generation in the browser.
// The Manifold WASM kernel runs box → boolean → extrude, hands back raw vertex
// and index arrays, and we wrap them straight into a three.js BufferGeometry.
// Takeaway: "the kernel outputs arrays; the renderer just consumes them."
export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.scene.add(new THREE.GridHelper(20, 20, 0x30363d, 0x21262d));

  let mesh: THREE.Mesh | null = null;

  getManifold()
    .then((wasm) => {
      const solid = buildBuilding(wasm);
      const geometry = manifoldToGeometry(solid);
      solid.delete(); // free the WASM-side solid once we've copied its mesh out

      const material = new THREE.MeshStandardMaterial({
        color: 0xffa657,
        roughness: 0.5,
        metalness: 0.1,
        flatShading: true,
      });
      mesh = new THREE.Mesh(geometry, material);
      viewer.scene.add(mesh);
      viewer.onFrame((_, delta) => {
        if (mesh) mesh.rotation.y += delta * 0.3;
      });
      console.log('[01-manifold] geometry built', geometry);
    })
    .catch((err) => console.error('[01-manifold] failed', err));

  return () => {
    mesh?.geometry.dispose();
    (mesh?.material as THREE.Material | undefined)?.dispose();
    viewer.dispose();
  };
}
