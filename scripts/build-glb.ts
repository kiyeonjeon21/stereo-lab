// Station 02 generator — the I/O layer, by hand.
// Runs the SAME procedural building logic in Node, then assembles a glTF
// Document with gltf-transform (buffer → accessors → primitive → mesh → node →
// scene) and writes a binary .glb. Run with: npm run gen:glb
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Module from 'manifold-3d';
import { Document, NodeIO } from '@gltf-transform/core';
import { buildBuilding } from '../src/lib/building';

const OUT = resolve(process.cwd(), 'public/models/building.glb');

async function main() {
  // In Node, Emscripten resolves manifold.wasm from node_modules via fs —
  // no locateFile needed (that's only for the browser/Vite path).
  const wasm = await Module();
  wasm.setup();

  const solid = buildBuilding(wasm);
  const mesh = solid.getMesh();
  console.log(`[gen:glb] solid: ${mesh.vertProperties.length / mesh.numProp} verts, ${mesh.triVerts.length / 3} tris (numProp=${mesh.numProp})`);

  // gltf-transform wants tightly-packed VEC3 positions. If numProp > 3, strip
  // the extra interleaved props down to xyz.
  let positions: Float32Array;
  if (mesh.numProp === 3) {
    positions = mesh.vertProperties;
  } else {
    const n = mesh.vertProperties.length / mesh.numProp;
    positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = mesh.vertProperties[i * mesh.numProp];
      positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
      positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
    }
  }

  // Copy into freshly-allocated ArrayBuffer-backed arrays — manifold's typed
  // arrays are declared ArrayBufferLike, which gltf-transform's setArray rejects.
  const positionArray = new Float32Array(positions);
  const indexArray = new Uint32Array(mesh.triVerts);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor('POSITION').setType('VEC3').setArray(positionArray).setBuffer(buffer);
  const indices = doc.createAccessor().setType('SCALAR').setArray(indexArray).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
  const gltfMesh = doc.createMesh('building').addPrimitive(prim);
  const node = doc.createNode('building').setMesh(gltfMesh);
  doc.createScene('scene').addChild(node);

  solid.delete();

  await mkdir(dirname(OUT), { recursive: true });
  await new NodeIO().write(OUT, doc);
  console.log(`[gen:glb] wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
