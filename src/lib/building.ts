import type { ManifoldToplevel } from './manifold';

/**
 * Builds one little "building" using the three pillars of procedural solid
 * modeling — shared by the browser station (01) and the Node glb generator so
 * both render the exact same geometry.
 *
 *   1. primitive   — start from a box
 *   2. boolean     — subtract a shaft to carve a void (difference)
 *   3. extrude     — loft a 2D square upward, tapering, to make a roof; union it on
 *
 * Returns a Manifold solid (caller owns it; call .delete() when done in Node).
 */
export function buildBuilding(wasm: ManifoldToplevel) {
  const { Manifold, CrossSection } = wasm;

  // 1. primitive: the main body, centered at origin
  const body = Manifold.cube([4, 3, 4], true);

  // 2. boolean difference: carve a vertical shaft straight through the body
  const shaft = Manifold.cube([1.4, 4, 1.4], true);
  let solid = body.subtract(shaft);

  // 3. extrude a 2D cross-section into a tapered roof, then union it on top.
  //    extrude(crossSection, height, nDivisions, twistDegrees, scaleTop)
  const roofProfile = CrossSection.square([4, 4], true);
  const roof = Manifold.extrude(roofProfile, 1.6, 0, 0, [0.15, 0.15]);
  // extrude grows along +Z; rotate it so it rises along +Y, then sit it on the body.
  const roofPlaced = roof.rotate([-90, 0, 0]).translate([0, 1.5, 0]);
  solid = solid.add(roofPlaced);

  return solid;
}
