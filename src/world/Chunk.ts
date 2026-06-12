/**
 * A Chunk stores the voxels for one CHUNK_SIZE x WORLD_HEIGHT x CHUNK_SIZE
 * column of the world in a flat Uint8Array (one byte per block id).
 *
 * The chunk only owns *data*. Its three.js mesh is owned and managed by the
 * ChunkManager / renderer so that this class stays free of rendering concerns
 * and could in principle run inside a worker.
 */

import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../constants';
import { BlockType } from './Block';
import { voxelIndex } from './coords';

export enum ChunkState {
  /** Created, waiting for terrain data. */
  EMPTY,
  /** Voxel data has been generated/loaded. */
  GENERATED,
  /** A mesh has been built and added to the scene. */
  MESHED,
}

export class Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly voxels: Uint8Array;

  state: ChunkState = ChunkState.EMPTY;

  /** True when voxels changed and the mesh must be rebuilt. */
  dirty = false;

  /** True when the player has edited this chunk (must be persisted). */
  modified = false;

  constructor(cx: number, cz: number, voxels?: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.voxels = voxels ?? new Uint8Array(CHUNK_VOLUME);
    if (voxels) this.state = ChunkState.GENERATED;
  }

  /** Read a voxel using local coordinates. Out-of-range Y is treated as AIR. */
  get(lx: number, ly: number, lz: number): number {
    if (ly < 0 || ly >= WORLD_HEIGHT) return BlockType.AIR;
    return this.voxels[voxelIndex(lx, ly, lz)];
  }

  /** Write a voxel using local coordinates. Returns false if Y is out of range. */
  set(lx: number, ly: number, lz: number, id: number): boolean {
    if (ly < 0 || ly >= WORLD_HEIGHT) return false;
    this.voxels[voxelIndex(lx, ly, lz)] = id;
    this.dirty = true;
    return true;
  }

  /** World-space origin (minimum corner) of this chunk. */
  get originX(): number {
    return this.cx * CHUNK_SIZE;
  }

  get originZ(): number {
    return this.cz * CHUNK_SIZE;
  }
}
