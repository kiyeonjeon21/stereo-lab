// Station 08 helper — shrink a glTF with gltf-transform. Run: npm run optimize
// Geometry-only transforms (no extra native deps):
//   dedup    — merge identical accessors/meshes/textures
//   prune    — drop unused nodes/materials/data
//   weld     — merge duplicate vertices (index the mesh tighter)
//   quantize — store positions/normals/uvs at lower bit depth (KHR_mesh_quantization)
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize } from '@gltf-transform/functions';

const IN = resolve(process.cwd(), 'public/models/DamagedHelmet.glb');
const OUT = resolve(process.cwd(), 'public/models/DamagedHelmet.opt.glb');

async function main() {
  // register extensions so quantize's KHR_mesh_quantization is actually written
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(IN);

  // sum the geometry accessors (vertex data) so we can see geometry shrink even
  // when the file total is dominated by textures.
  const geomBytes = (d: typeof doc) =>
    d.getRoot().listAccessors().reduce((n, a) => n + (a.getArray()?.byteLength ?? 0), 0);
  const geomBefore = geomBytes(doc);

  await doc.transform(dedup(), prune(), weld(), quantize());
  await io.write(OUT, doc);

  const kb = (n: number) => (n / 1024).toFixed(0).padStart(5) + ' KB';
  const totalBefore = statSync(IN).size;
  const totalAfter = statSync(OUT).size;
  const reread = await io.read(OUT);
  const geomAfter = geomBytes(reread);

  console.log('[optimize] geometry buffers:', kb(geomBefore), '→', kb(geomAfter),
    `(${(100 * (1 - geomAfter / geomBefore)).toFixed(0)}% smaller)`);
  console.log('[optimize] file total:      ', kb(totalBefore), '→', kb(totalAfter),
    '— note: this model is mostly textures, so total moves less than geometry. Profile before optimizing.');
  console.log('[optimize] wrote', OUT);
}

main().catch((err) => { console.error(err); process.exit(1); });
