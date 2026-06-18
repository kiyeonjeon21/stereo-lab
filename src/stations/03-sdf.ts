import frag from './03-sdf.frag.glsl?raw';
import { createShaderViewer } from '../lib/fullscreenShader';

// Station 03 — Shadertoy-style SDF raymarching: "see the math."
// No meshes — a single fullscreen fragment shader builds the whole scene from
// distance functions. Drag to orbit. See 03-sdf.frag.glsl for the marching loop.
export function mount(container: HTMLElement) {
  const viewer = createShaderViewer(container, frag);
  console.log('[03-sdf] raymarcher mounted', viewer.renderer.getContext().constructor.name);
  return () => viewer.dispose();
}
