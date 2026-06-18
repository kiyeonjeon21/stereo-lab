import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createViewer } from '../lib/viewer';

// Station 11 — postprocessing (bloom). The image isn't done when the scene is drawn.
// Graduation question: why is postprocessing a CHAIN OF PASSES? Because each pass
// renders into an offscreen texture that the next pass reads — render the scene to a
// texture, extract the bright pixels, blur them, add them back = glow.
export function mount(container: HTMLElement) {
  // composer needs the viewer's renderer/scene/camera, but renderOverride is set at
  // creation — so we hand it a closure that reads a `composer` filled in just below.
  let composer: EffectComposer | null = null;
  const viewer = createViewer(container, {
    background: 0x05060a,
    renderOverride: () => composer?.render(),
  });

  // a cluster of self-illuminated shapes; emissive intensity > 1 is what bloom catches
  const colors = [0x58a6ff, 0xff7b72, 0x7ee787, 0xffa657, 0xd2a8ff];
  const shapes: THREE.Mesh[] = [];
  for (let i = 0; i < colors.length; i++) {
    const mesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.5, 0.18, 120, 16),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: colors[i], emissiveIntensity: 2.5 }),
    );
    const a = (i / colors.length) * Math.PI * 2;
    mesh.position.set(Math.cos(a) * 3, Math.sin(a) * 1.2, Math.sin(a) * 2);
    viewer.scene.add(mesh);
    shapes.push(mesh);
  }
  viewer.onFrame((_, delta) => shapes.forEach((m, i) => { m.rotation.x += delta * (0.3 + i * 0.1); m.rotation.y += delta * 0.4; }));

  // pass chain: draw scene → extract+blur bright pixels (bloom) → output to screen
  composer = new EffectComposer(viewer.renderer);
  composer.addPass(new RenderPass(viewer.scene, viewer.camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.9,  // strength
    0.5,  // radius
    0.0,  // threshold (0 = everything blooms a bit; raise to bloom only the brightest)
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = new ResizeObserver(() => composer?.setSize(container.clientWidth, container.clientHeight));
  resize.observe(container);

  const ui = document.createElement('div');
  ui.className = 'station-message';
  ui.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; pointer-events:auto;';
  ui.innerHTML =
    '<label style="opacity:0.8">bloom <input id="b" type="range" min="0" max="3" step="0.05" value="0.9"></label>' +
    '<p style="opacity:0.6">scene → bloom pass (bright→blur→add) → screen</p>';
  container.appendChild(ui);
  (ui.querySelector('#b') as HTMLInputElement).addEventListener('input', (e) => {
    bloom.strength = Number((e.target as HTMLInputElement).value);
  });

  return () => {
    resize.disconnect();
    ui.remove();
    for (const m of shapes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    composer?.dispose();
    viewer.dispose();
  };
}
