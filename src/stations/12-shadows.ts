import * as THREE from 'three';
import { createViewer } from '../lib/viewer';

// Station 12 — shadows. A shadow map is the scene rendered ONCE from the light's
// point of view, storing depth; then while shading, each point checks "is something
// closer to the light than me? → I'm in shadow." Graduation question: why are
// shadows an extra render pass (and why the resolution/area trade-offs)?
export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.camera.position.set(7, 6, 9);
  viewer.renderer.shadowMap.enabled = true;
  viewer.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // the shadow-casting light: it gets its own (orthographic) camera to render depth from
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(5, 9, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);        // shadow map resolution (sharper = costlier)
  const d = 10;
  Object.assign(light.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 0.5, far: 40 });
  light.shadow.bias = -0.0004;                 // nudge to avoid self-shadow acne
  viewer.scene.add(light);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true; // the surface shadows land on
  viewer.scene.add(ground);

  const casters: THREE.Mesh[] = [];
  const geos = [
    new THREE.TorusKnotGeometry(0.6, 0.22, 100, 16),
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.IcosahedronGeometry(0.8, 0),
  ];
  const cols = [0x58a6ff, 0xffa657, 0x7ee787];
  geos.forEach((g, i) => {
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.4 }));
    m.position.set((i - 1) * 3, 2, 0);
    m.castShadow = true; // this object blocks light → casts a shadow
    viewer.scene.add(m);
    casters.push(m);
  });
  viewer.onFrame((t, delta) => casters.forEach((m, i) => {
    m.rotation.x += delta * 0.5; m.rotation.y += delta * 0.7;
    m.position.y = 2 + Math.sin(t * 1.2 + i) * 0.6; // bob so the shadow moves
  }));

  const ui = document.createElement('div');
  ui.className = 'station-message';
  ui.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; pointer-events:auto;';
  ui.innerHTML =
    '<label style="opacity:0.8"><input id="sh" type="checkbox" checked> cast shadows</label>' +
    '<p style="opacity:0.6">shadows = one extra render of the scene from the light\'s view (a depth map)</p>';
  container.appendChild(ui);
  (ui.querySelector('#sh') as HTMLInputElement).addEventListener('change', (e) => {
    viewer.renderer.shadowMap.enabled = (e.target as HTMLInputElement).checked;
    for (const m of [...casters, ground]) (m.material as THREE.Material).needsUpdate = true;
  });

  return () => {
    ui.remove();
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    for (const m of casters) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    viewer.dispose();
  };
}
