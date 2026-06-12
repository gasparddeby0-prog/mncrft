/**
 * Voxel ray casting using the Amanatides & Woo grid traversal algorithm.
 *
 * Marches a ray through the voxel grid one cell at a time (no fixed step size,
 * so it never skips or double-counts a block) and returns the first targetable
 * block hit, along with the face normal that was crossed to reach it. The
 * normal is what placement uses to decide which adjacent cell to fill.
 */

import type * as THREE from 'three';
import { getBlock } from '../world/Block';
import type { World } from '../world/World';

export interface RaycastHit {
  /** Coordinates of the hit block. */
  bx: number;
  by: number;
  bz: number;
  /** Face normal pointing out of the hit block toward the ray origin. */
  nx: number;
  ny: number;
  nz: number;
  /** The block id that was hit. */
  block: number;
}

/** A block is targetable if it is not air and not a fluid. */
function targetable(block: number): boolean {
  if (block === 0) return false;
  return !getBlock(block).liquid;
}

export function raycast(
  world: World,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  maxDistance: number,
): RaycastHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

  // Distance (in t) to cross one cell along each axis.
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

  // Distance (in t) to the first voxel boundary on each axis.
  const fracX = origin.x - x;
  const fracY = origin.y - y;
  const fracZ = origin.z - z;
  let tMaxX = stepX > 0 ? (1 - fracX) * tDeltaX : fracX * tDeltaX;
  let tMaxY = stepY > 0 ? (1 - fracY) * tDeltaY : fracY * tDeltaY;
  let tMaxZ = stepZ > 0 ? (1 - fracZ) * tDeltaZ : fracZ * tDeltaZ;
  if (stepX === 0) tMaxX = Infinity;
  if (stepY === 0) tMaxY = Infinity;
  if (stepZ === 0) tMaxZ = Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  // The very first cell could already contain a block (e.g. head in a wall).
  if (targetable(world.getBlock(x, y, z))) {
    return { bx: x, by: y, bz: z, nx: 0, ny: 0, nz: 0, block: world.getBlock(x, y, z) };
  }

  while (t <= maxDistance) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }

    if (t > maxDistance) break;

    const block = world.getBlock(x, y, z);
    if (targetable(block)) {
      return { bx: x, by: y, bz: z, nx, ny, nz, block };
    }
  }

  return null;
}
