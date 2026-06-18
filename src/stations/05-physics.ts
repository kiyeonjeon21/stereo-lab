import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World, RigidBody } from '@dimforge/rapier3d-compat';
import { createViewer } from '../lib/viewer';

// Station 05 — physics (Rapier, Rust→WASM).
// The "feel" station. Graduation question: why must the physics step be
// decoupled from the render step? Because a stable simulation needs a FIXED dt,
// while requestAnimationFrame ticks at a variable rate. So we accumulate real
// elapsed time and step the world in fixed 1/60s chunks — the render just reads
// each body's transform and copies it onto its mesh.

const FIXED_DT = 1 / 60;
const MAX_BODIES = 120; // cap so click-spamming can't grow the world forever

const COLORS = [0x58a6ff, 0xffa657, 0x7ee787, 0xff7b72, 0xd2a8ff, 0xf2cc60];

interface Body3D {
  mesh: THREE.Mesh;
  body: RigidBody;
}

export function mount(container: HTMLElement) {
  const viewer = createViewer(container);
  viewer.camera.position.set(10, 8, 12);
  viewer.scene.add(new THREE.GridHelper(40, 40, 0x30363d, 0x21262d));

  const objects: Body3D[] = [];
  let world: World | null = null;
  let disposed = false;
  let colorIdx = 0;

  // shared geometry/material factory; geometries are disposed on cleanup
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function addBox(pos: THREE.Vector3, color: number) {
    if (!world) return;
    // physics: a dynamic rigid body + a cuboid collider (half-extents = 0.5)
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setRestitution(0.4), body);

    // render: a matching mesh whose transform we'll sync from the body each frame
    const mesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    viewer.scene.add(mesh);

    objects.push({ mesh, body });
    if (objects.length > MAX_BODIES) {
      const old = objects.shift()!;
      world.removeRigidBody(old.body); // also removes its collider
      viewer.scene.remove(old.mesh);
      (old.mesh.material as THREE.Material).dispose();
    }
  }

  RAPIER.init().then(() => {
    if (disposed) return;
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = FIXED_DT;

    // ground: a FIXED body so it never moves. Collider top surface sits at y=0.
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20), ground);

    // a starting stack to knock around
    for (let i = 0; i < 6; i++) {
      addBox(new THREE.Vector3((i % 2) * 0.15, 0.5 + i * 1.05, 0), COLORS[i % COLORS.length]);
    }

    let accumulator = 0;
    viewer.onFrame((_, delta) => {
      if (!world) return;
      // clamp delta to avoid the "spiral of death" after a tab stall
      accumulator += Math.min(delta, 0.25);
      while (accumulator >= FIXED_DT) {
        world.step();          // <-- fixed-size physics step, independent of fps
        accumulator -= FIXED_DT;
      }
      // render step: copy each body's pose onto its mesh
      for (const { mesh, body } of objects) {
        const t = body.translation();
        const r = body.rotation();
        mesh.position.set(t.x, t.y, t.z);
        mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    });
    console.log('[05-physics] Rapier world ready, gravity', world.gravity.y);
  });

  // click (not drag) to drop a box from above at a random spot
  let downPos: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { downPos = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved < 6) {
      addBox(new THREE.Vector3((Math.random() - 0.5) * 4, 10, (Math.random() - 0.5) * 4), COLORS[colorIdx++ % COLORS.length]);
    }
  };
  const canvas = viewer.renderer.domElement;
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  const hint = document.createElement('div');
  hint.className = 'station-message';
  hint.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; text-align:left; pointer-events:none; max-width:340px;';
  hint.innerHTML = '<p style="opacity:0.75">▸ Click to drop a box (drag to orbit).<br>▸ Physics steps at a fixed 1/60s; the render just reads each body\'s transform.</p>';
  container.appendChild(hint);

  return () => {
    disposed = true;
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    hint.remove();
    for (const { mesh } of objects) (mesh.material as THREE.Material).dispose();
    boxGeo.dispose();
    world?.free(); // release all WASM-side simulation memory
    world = null;
    viewer.dispose();
  };
}
