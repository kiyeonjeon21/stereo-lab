import * as THREE from 'three';
import { getProject, types } from '@theatre/core';
import studio from '@theatre/studio';
import { createViewer } from '../lib/viewer';

// Station 04 — motion (Theatre.js). The north star: "3D motion."
// A keyframe is just a stored (time → value) function. Theatre's sheet holds
// animatable objects; the Studio panel (right side) is where you set keyframes
// and scrub the timeline. We wire those values straight onto a three.js mesh.

// studio.initialize() is global + one-shot; guard it across station remounts.
let studioReady = false;
function ensureStudio() {
  if (!studioReady) {
    studio.initialize();
    studioReady = true;
  }
}

// studio.ui.hide() hides the panels but leaves the studio root mounted in
// <body>, and its full-viewport overlay keeps intercepting pointer events on
// OTHER stations. So we also toggle the root's display to fully remove it from
// hit-testing when this station isn't active.
function setStudioActive(active: boolean) {
  if (active) studio.ui.restore();
  else studio.ui.hide();
  const root = document.getElementById('theatrejs-studio-root');
  if (root) root.style.display = active ? '' : 'none';
}

export function mount(container: HTMLElement) {
  ensureStudio();
  setStudioActive(true); // re-show the editor when entering this station

  const viewer = createViewer(container);
  viewer.scene.add(new THREE.GridHelper(20, 20, 0x30363d, 0x21262d));

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x58a6ff, roughness: 0.4, metalness: 0.1 }),
  );
  viewer.scene.add(mesh);

  // A Theatre object: each prop becomes a keyframe-able track in the Studio UI.
  const sheet = getProject('stereo-lab').sheet('motion');
  const obj = sheet.object('Cube', {
    position: {
      x: types.number(0, { range: [-6, 6] }),
      y: types.number(1, { range: [-6, 6] }),
      z: types.number(0, { range: [-6, 6] }),
    },
    rotation: {
      x: types.number(0, { range: [-Math.PI * 2, Math.PI * 2] }),
      y: types.number(0, { range: [-Math.PI * 2, Math.PI * 2] }),
      z: types.number(0, { range: [-Math.PI * 2, Math.PI * 2] }),
    },
    scale: types.number(1, { range: [0.2, 3] }),
    color: types.rgba({ r: 0.35, g: 0.65, b: 1, a: 1 }),
  });

  const applyToMesh = (v: typeof obj.value) => {
    mesh.position.set(v.position.x, v.position.y, v.position.z);
    mesh.rotation.set(v.rotation.x, v.rotation.y, v.rotation.z);
    mesh.scale.setScalar(v.scale);
    (mesh.material as THREE.MeshStandardMaterial).color.setRGB(v.color.r, v.color.g, v.color.b);
  };

  // The bridge: whenever Theatre's values change (scrub, play, or nudge a prop),
  // push them onto the mesh. This callback IS the integration. We also latch
  // `theatreDriving` so the default demo below yields to Theatre once you touch it.
  let theatreDriving = false;
  let firstEmit = true;
  const unsubscribe = obj.onValuesChange((v) => {
    applyToMesh(v);
    if (firstEmit) { firstEmit = false; return; } // ignore the initial sync emit
    theatreDriving = true; // a real change → Studio/sequencer is now in control
  });

  // Default motion so the scene isn't dead on arrival. This is PLAIN CODE, not a
  // keyframed timeline — that's the contrast: once you keyframe a prop in Studio
  // and scrub/play, Theatre takes over driving the very same mesh.
  viewer.onFrame((t) => {
    if (theatreDriving) return;
    mesh.position.set(0, 1 + Math.sin(t * 1.5) * 0.6, 0);
    mesh.rotation.set(Math.sin(t * 0.9) * 0.3, t * 0.6, 0);
  });

  const hint = document.createElement('div');
  hint.className = 'station-message';
  hint.style.cssText = 'inset:auto auto 16px 16px; align-items:flex-start; text-align:left; pointer-events:none; max-width:360px;';
  hint.innerHTML =
    '<p style="opacity:0.75">↻ The cube auto-wiggles via plain code right now.<br>' +
    '▸ Select <b>Cube</b> in the Studio panel (right) → move a prop → click ◆ to keyframe.<br>' +
    '▸ Scrub / press play and <b>Theatre takes over</b> the motion.</p>';
  container.appendChild(hint);

  console.log('[04-motion] Theatre sheet + object wired', obj.address.objectKey);

  return () => {
    unsubscribe();
    sheet.sequence.pause();
    setStudioActive(false); // tuck the editor away AND stop it intercepting clicks
    hint.remove();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    viewer.dispose();
  };
}
