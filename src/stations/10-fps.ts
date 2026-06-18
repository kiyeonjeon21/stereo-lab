import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';

// Station 10 — a walkable level (first-person + collision). The "map".
// Graduation question: station 08 used a BVH to accelerate RAYCASTS; here three's
// Octree accelerates CAPSULE-vs-world collision. Same family (spatial partitioning
// of triangles), different query. This is the canonical three.js FPS technique.
const GRAVITY = 30;
const STEPS_PER_FRAME = 5; // sub-step so fast motion can't tunnel through walls

export function mount(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88ccee);
  scene.fog = new THREE.Fog(0x88ccee, 20, 70);

  const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.rotation.order = 'YXZ'; // yaw then pitch, so look-around doesn't roll

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x335577, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-5, 25, -1);
  scene.add(sun);

  // physics world + player
  const worldOctree = new Octree();
  const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);
  const playerVelocity = new THREE.Vector3();
  const playerDirection = new THREE.Vector3();
  let playerOnFloor = false;

  new GLTFLoader().load('models/collision-world.glb', (gltf) => {
    scene.add(gltf.scene);
    worldOctree.fromGraphNode(gltf.scene); // build the collision Octree from the level mesh
    console.log('[10-fps] level + octree ready');
  });

  // --- input ---
  const keys: Record<string, boolean> = {};
  const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  const onMouseDown = () => renderer.domElement.requestPointerLock();
  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement === renderer.domElement) {
      camera.rotation.y -= e.movementX / 500;
      camera.rotation.x -= e.movementY / 500;
    }
  };
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);

  // --- collision + movement (three.js games_fps technique) ---
  function playerCollisions() {
    const result = worldOctree.capsuleIntersect(playerCollider);
    playerOnFloor = false;
    if (result) {
      playerOnFloor = result.normal.y > 0;
      if (!playerOnFloor) playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
      if (result.depth >= 1e-10) playerCollider.translate(result.normal.multiplyScalar(result.depth));
    }
  }

  function updatePlayer(dt: number) {
    let damping = Math.exp(-4 * dt) - 1;
    if (!playerOnFloor) { playerVelocity.y -= GRAVITY * dt; damping *= 0.1; } // air control
    playerVelocity.addScaledVector(playerVelocity, damping);
    playerCollider.translate(playerVelocity.clone().multiplyScalar(dt));
    playerCollisions();
    camera.position.copy(playerCollider.end);
  }

  const forward = () => { camera.getWorldDirection(playerDirection); playerDirection.y = 0; return playerDirection.normalize(); };
  const side = () => { forward(); return playerDirection.cross(camera.up); };

  function applyControls(dt: number) {
    const speed = dt * (playerOnFloor ? 25 : 8);
    if (keys['KeyW']) playerVelocity.add(forward().multiplyScalar(speed));
    if (keys['KeyS']) playerVelocity.add(forward().multiplyScalar(-speed));
    if (keys['KeyA']) playerVelocity.add(side().multiplyScalar(-speed));
    if (keys['KeyD']) playerVelocity.add(side().multiplyScalar(speed));
    if (playerOnFloor && keys['Space']) playerVelocity.y = 12;
  }

  function teleportIfOob() {
    if (camera.position.y <= -25) {
      playerCollider.start.set(0, 0.35, 0);
      playerCollider.end.set(0, 1, 0);
      playerVelocity.set(0, 0, 0);
      camera.position.copy(playerCollider.end);
      camera.rotation.set(0, 0, 0);
    }
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;
  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME;
    for (let i = 0; i < STEPS_PER_FRAME; i++) { applyControls(dt); updatePlayer(dt); teleportIfOob(); }
    renderer.render(scene, camera);
  }
  loop();

  const resize = new ResizeObserver(() => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  resize.observe(container);

  const hint = document.createElement('div');
  hint.className = 'station-message';
  hint.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; pointer-events:none;';
  hint.innerHTML = '<p style="opacity:0.8">click to look · <b>WASD</b> move · <b>Space</b> jump · <b>Esc</b> release<br>collision via three\'s Octree (capsule vs level)</p>';
  container.appendChild(hint);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    resize.disconnect();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    hint.remove();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
