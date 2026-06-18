import * as THREE from 'three';
import { createViewer } from '../lib/viewer';

// Station 00 — the foundation: "how does the render loop turn?"
// A single mesh, a per-frame rotation callback, and OrbitControls. Nothing else.
export function mount(container: HTMLElement) {
  const viewer = createViewer(container);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x58a6ff, roughness: 0.4, metalness: 0.1 }),
  );
  viewer.scene.add(cube);
  viewer.scene.add(new THREE.GridHelper(20, 20, 0x30363d, 0x21262d));

  viewer.onFrame((elapsed) => {
    cube.rotation.x = elapsed * 0.6;
    cube.rotation.y = elapsed * 0.9;
  });

  return () => viewer.dispose();
}
