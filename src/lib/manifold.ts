import * as THREE from 'three';
import Module from 'manifold-3d';
// Explicit URL import so Vite serves the .wasm as a static asset; we hand the
// resolved URL to Emscripten's locateFile (see vite.config.ts for the why).
import wasmUrl from 'manifold-3d/manifold.wasm?url';

export type ManifoldToplevel = Awaited<ReturnType<typeof Module>>;

let instance: ManifoldToplevel | null = null;

/** Initialize the Manifold WASM module once and cache it. */
export async function getManifold(): Promise<ManifoldToplevel> {
  if (!instance) {
    instance = await Module({ locateFile: () => wasmUrl });
    instance.setup();
  }
  return instance;
}

/**
 * Convert a Manifold solid into a three.js BufferGeometry.
 * `getMesh()` returns interleaved vertex properties (numProp floats per vertex,
 * first 3 are position) and a flat Uint32Array of triangle indices.
 */
export function manifoldToGeometry(manifold: { getMesh: () => { numProp: number; vertProperties: Float32Array; triVerts: Uint32Array } }): THREE.BufferGeometry {
  const mesh = manifold.getMesh();
  const geometry = new THREE.BufferGeometry();
  if (mesh.numProp === 3) {
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertProperties, 3));
  } else {
    // numProp > 3: positions are the first 3 of each numProp-stride vertex record.
    const interleaved = new THREE.InterleavedBuffer(mesh.vertProperties, mesh.numProp);
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
  }
  geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  geometry.computeVertexNormals();
  return geometry;
}
