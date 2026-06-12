/**
 * Coordinate helpers shared between world, mesher, generator and workers.
 *
 * Three coordinate spaces exist:
 *  - World coordinates: absolute (x, y, z) in blocks.
 *  - Chunk coordinates: (cx, cz) identifying a chunk column.
 *  - Local coordinates: (lx, ly, lz) inside a single chunk, 0..CHUNK_SIZE-1
 *    horizontally and 0..WORLD_HEIGHT-1 vertically.
 */

import { CHUNK_SIZE } from '../constants';

/** Convert a world X/Z to its chunk index (floor division). */
export function worldToChunk(coord: number): number {
  return Math.floor(coord / CHUNK_SIZE);
}

/** Convert a world X/Z to its local coordinate inside a chunk (always 0..15). */
export function worldToLocal(coord: number): number {
  return ((coord % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}

/** Stable string key for a chunk, usable as a Map key. */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Parse a chunk key back into coordinates. */
export function parseChunkKey(key: string): { cx: number; cz: number } {
  const comma = key.indexOf(',');
  return {
    cx: Number(key.slice(0, comma)),
    cz: Number(key.slice(comma + 1)),
  };
}

/** Linear index of a voxel inside a chunk's flat array. */
export function voxelIndex(lx: number, ly: number, lz: number): number {
  return lx + CHUNK_SIZE * (lz + CHUNK_SIZE * ly);
}
