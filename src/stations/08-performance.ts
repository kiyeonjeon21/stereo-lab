import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast, BVHHelper } from 'three-mesh-bvh';
import { createViewer } from '../lib/viewer';

// Station 08 — performance: make it small (gltf-transform, see scripts/optimize-glb.ts)
// and make it fast (three-mesh-bvh). This half is about FAST raycasting.
// Graduation question: why does a BVH make raycasting a dense mesh ~100× faster?
// A naive raycast tests EVERY triangle. A BVH is a tree of nested bounding boxes,
// so the ray skips whole branches whose box it misses — O(log n) instead of O(n).

// Patch three so geometries can build a BVH and meshes use the accelerated raycast.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.camera.position.set(0, 0, 3.2);

  const meshes: THREE.Mesh[] = [];
  const helpers: BVHHelper[] = [];
  let root: THREE.Object3D | null = null;

  const raycaster = new THREE.Raycaster();
  // three-mesh-bvh adds this flag: stop at the first hit instead of sorting all hits.
  (raycaster as THREE.Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
  const ndc = new THREE.Vector2();

  // a marker that snaps to wherever the ray hits the surface
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff5577 }),
  );
  marker.visible = false;
  viewer.scene.add(marker);

  const readout = document.createElement('div');
  readout.className = 'station-message';
  readout.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; pointer-events:auto;';
  container.appendChild(readout);

  new GLTFLoader().load('models/DamagedHelmet.glb', (gltf) => {
    root = gltf.scene;
    viewer.scene.add(root);

    let tris = 0;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.computeBoundsTree(); // build the BVH for this geometry
        meshes.push(mesh);
        const helper = new BVHHelper(mesh, 12);
        helper.visible = false;
        viewer.scene.add(helper);
        helpers.push(helper);
        const idx = mesh.geometry.getIndex();
        tris += (idx ? idx.count : mesh.geometry.getAttribute('position').count) / 3;
      }
    });

    // micro-benchmark: fire many rays and time them with the BVH on
    const N = 5000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      ndc.set(Math.sin(i) * 0.5, Math.cos(i) * 0.5);
      raycaster.setFromCamera(ndc, viewer.camera);
      raycaster.intersectObjects(meshes, false);
    }
    const ms = performance.now() - t0;

    readout.innerHTML =
      `<p style="opacity:0.8">${tris.toLocaleString()} triangles · ${N.toLocaleString()} BVH raycasts in ${ms.toFixed(0)}ms ` +
      `(${(ms / N * 1000).toFixed(1)}µs each)</p>` +
      `<label style="opacity:0.8"><input id="bvh" type="checkbox"> show BVH boxes</label>` +
      `<p id="hit" style="opacity:0.6">move the mouse over the helmet →</p>`;
    const toggle = readout.querySelector('#bvh') as HTMLInputElement;
    toggle.addEventListener('change', () => helpers.forEach((h) => (h.visible = toggle.checked)));
    console.log('[08-performance] BVH built;', tris, 'tris;', N, 'raycasts in', ms.toFixed(1), 'ms');
  });

  const hitText = () => readout.querySelector('#hit') as HTMLElement | null;
  const onMove = (e: PointerEvent) => {
    if (!meshes.length) return;
    const rect = viewer.renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, viewer.camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    marker.visible = !!hit;
    if (hit) {
      marker.position.copy(hit.point);
      const el = hitText();
      if (el) el.textContent = `hit face #${hit.faceIndex} at ${hit.distance.toFixed(2)}m`;
    }
  };
  viewer.renderer.domElement.addEventListener('pointermove', onMove);

  return () => {
    viewer.renderer.domElement.removeEventListener('pointermove', onMove);
    readout.remove();
    for (const m of meshes) m.geometry.disposeBoundsTree();
    for (const h of helpers) { viewer.scene.remove(h); h.dispose?.(); }
    marker.geometry.dispose();
    (marker.material as THREE.Material).dispose();
    if (root) root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat?.dispose();
      }
    });
    viewer.dispose();
  };
}
