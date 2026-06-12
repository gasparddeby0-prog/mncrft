/**
 * The End terrain generator.
 *
 * Floating end-stone islands suspended in the void. A large central island sits
 * around the origin (the arrival platform), with smaller islands scattered by
 * low-frequency noise. Everything outside the island bands is empty (void).
 */

import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../../constants';
import { BlockType } from '../Block';
import { voxelIndex } from '../coords';
import { SimplexNoise } from '../noise/SimplexNoise';
import type { ChunkGenerator } from './Dimension';

const ISLAND_CENTER_Y = 60;

export class EndGenerator implements ChunkGenerator {
  private readonly island: SimplexNoise;
  private readonly shape: SimplexNoise;

  constructor(seed: number) {
    this.island = new SimplexNoise(seed + 201);
    this.shape = new SimplexNoise(seed + 202);
  }

  generateChunk(cx: number, cz: number): Uint8Array {
    const voxels = new Uint8Array(CHUNK_VOLUME);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;

        // Distance falloff so a guaranteed main island surrounds the origin.
        const dist = Math.hypot(wx, wz);
        const centralBoost = Math.max(0, 1 - dist / 90);
        // Where islands exist at all.
        const mask = this.island.fbm2D(wx * 0.01, wz * 0.01, 3) + centralBoost * 1.4;
        if (mask < 0.25) continue; // void

        const thickness = 4 + mask * 8;
        const lo = Math.max(1, Math.floor(ISLAND_CENTER_Y - thickness));
        const hi = Math.min(WORLD_HEIGHT - 1, Math.ceil(ISLAND_CENTER_Y + thickness));
        for (let y = lo; y <= hi; y++) {
          const vertical = 1 - Math.abs(y - ISLAND_CENTER_Y) / (thickness + 1);
          const n = this.shape.noise3D(wx * 0.06, y * 0.06, wz * 0.06);
          if (n + vertical * 0.8 + (mask - 0.4) > 0.55) {
            voxels[voxelIndex(lx, y, lz)] = BlockType.END_STONE;
          }
        }
      }
    }

    return voxels;
  }
}
