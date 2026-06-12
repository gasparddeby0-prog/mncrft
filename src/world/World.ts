/**
 * World is the in-memory authority for all loaded voxel data.
 *
 * It maps chunk keys to Chunk objects and exposes world-space block access used
 * by the mesher (neighbour lookups), the player (collision) and the raycaster
 * (block picking). Streaming chunks in/out of this map is the ChunkManager's
 * job; World itself stays free of rendering and scheduling concerns.
 */

import { WORLD_HEIGHT } from '../constants';
import { BlockType, getBlock } from './Block';
import { Chunk } from './Chunk';
import { chunkKey, worldToChunk, worldToLocal } from './coords';

export class World {
  readonly seed: number;
  private readonly chunks = new Map<string, Chunk>();

  constructor(seed: number) {
    this.seed = seed;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  addChunk(chunk: Chunk): void {
    this.chunks.set(chunkKey(chunk.cx, chunk.cz), chunk);
  }

  removeChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
  }

  get loadedChunkCount(): number {
    return this.chunks.size;
  }

  /** Read a block id at world coordinates. Returns AIR if the chunk is absent. */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return BlockType.AIR;
    const chunk = this.getChunk(worldToChunk(wx), worldToChunk(wz));
    if (!chunk) return BlockType.AIR;
    return chunk.get(worldToLocal(wx), wy, worldToLocal(wz));
  }

  /**
   * Write a block id at world coordinates.
   * Returns the affected Chunk (now marked dirty + modified) or undefined if
   * the target chunk is not loaded.
   */
  setBlock(wx: number, wy: number, wz: number, id: number): Chunk | undefined {
    if (wy < 0 || wy >= WORLD_HEIGHT) return undefined;
    const chunk = this.getChunk(worldToChunk(wx), worldToChunk(wz));
    if (!chunk) return undefined;
    chunk.set(worldToLocal(wx), wy, worldToLocal(wz), id);
    chunk.modified = true;
    return chunk;
  }

  /** True if the block at these coordinates is solid (used for collision). */
  isSolid(wx: number, wy: number, wz: number): boolean {
    return getBlock(this.getBlock(wx, wy, wz)).solid;
  }

  /** True if the block fully occludes neighbouring faces. */
  isOpaque(wx: number, wy: number, wz: number): boolean {
    return getBlock(this.getBlock(wx, wy, wz)).opaque;
  }

  /** All currently loaded chunks (live view). */
  values(): IterableIterator<Chunk> {
    return this.chunks.values();
  }
}
