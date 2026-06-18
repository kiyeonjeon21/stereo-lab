import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Viewer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Register a per-frame callback. Receives seconds elapsed since start. */
  onFrame: (cb: (elapsed: number, delta: number) => void) => void;
  dispose: () => void;
}

/**
 * Shared three.js bootstrap so every station starts with zero boilerplate:
 * scene + perspective camera + WebGL renderer + OrbitControls + a rAF loop
 * + automatic resize. Returns a `dispose()` that fully unwinds the loop,
 * listeners, and GPU context (the router calls it on station switch).
 */
export function createViewer(
  container: HTMLElement,
  opts: { background?: number; renderOverride?: () => void } = {},
): Viewer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.background ?? 0x0b0d10);

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(6, 5, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // default lighting — stations can add/replace as needed
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(5, 10, 7);
  scene.add(key);

  const callbacks: ((elapsed: number, delta: number) => void)[] = [];
  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    for (const cb of callbacks) cb(elapsed, delta);
    controls.update();
    // a station doing postprocessing can replace the draw call (e.g. composer.render())
    if (opts.renderOverride) opts.renderOverride();
    else renderer.render(scene, camera);
  }
  loop();

  const resize = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resize.observe(container);

  return {
    scene,
    camera,
    renderer,
    controls,
    onFrame: (cb) => callbacks.push(cb),
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
