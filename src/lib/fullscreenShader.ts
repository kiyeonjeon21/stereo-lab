import * as THREE from 'three';

export interface ShaderViewer {
  uniforms: Record<string, THREE.IUniform>;
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
}

// A fullscreen-triangle vertex shader: it writes clip-space positions directly,
// so the quad always covers the viewport regardless of any camera. Every
// fragment then runs the raymarcher independently — that's the whole point.
const VERT = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Mount a Shadertoy-style fullscreen fragment shader. Sibling to
 * `viewer.ts:createViewer` but for 2D image shaders instead of a 3D scene.
 * Provides iResolution / iTime / iMouse uniforms (Shadertoy convention) and
 * the same mount→dispose cleanup contract the router relies on.
 */
export function createShaderViewer(
  container: HTMLElement,
  fragmentShader: string,
  extraUniforms: Record<string, THREE.IUniform> = {},
): ShaderViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const uniforms: Record<string, THREE.IUniform> = {
    iResolution: { value: new THREE.Vector2(container.clientWidth * pixelRatio, container.clientHeight * pixelRatio) },
    iTime: { value: 0 },
    // (x, y) = last pointer position in pixels, z = 1 while pressed, else 0.
    iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
    ...extraUniforms,
  };

  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera(); // unused by the vertex shader, but render() needs one

  // --- pointer → iMouse (drag to orbit the raymarched camera) ---
  const mouse = uniforms.iMouse.value as THREE.Vector4;
  const setPos = (e: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * pixelRatio;
    mouse.y = (rect.height - (e.clientY - rect.top)) * pixelRatio; // flip Y to match gl_FragCoord
  };
  const onDown = (e: PointerEvent) => { mouse.z = 1; setPos(e); };
  const onMove = (e: PointerEvent) => { if (mouse.z > 0.5) setPos(e); };
  const onUp = () => { mouse.z = 0; };
  renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;
  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    uniforms.iTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  }
  loop();

  const resize = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    (uniforms.iResolution.value as THREE.Vector2).set(w * pixelRatio, h * pixelRatio);
  });
  resize.observe(container);

  return {
    uniforms,
    renderer,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
