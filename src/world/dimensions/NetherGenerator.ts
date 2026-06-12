/**
 * Nether terrain generator.
 *
 * A closed dimension: bedrock floor and ceiling, netherrack masses carved into
 * caverns by 3D noise, a lava sea in the lower levels, glowstone clusters under
 * the ceiling and soul-sand patches near the floor. Deterministic from the seed.
 */

import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from '../../constants';
import { BlockType } from '../Block';
import { voxelIndex } from '../coords';
import { SimplexNoise } from '../noise/SimplexNoise';
import type { ChunkGenerator } from './Dimension';

const LAVA_LEVEL = 30;
const CEILING = WORLD_HEIGHT - 6;

export class NetherGenerator implements ChunkGenerator {
  private readonly density: SimplexNoise;
  private readonly detail: SimplexNoise;
  private readonly deco: SimplexNoise;

  constructor(seed: number) {
    this.density = new SimplexNoise(seed + 101);
    this.detail = new SimplexNoise(seed + 102);
    this.deco = new SimplexNoise(seed + 103);
  }

  generateChunk(cx: number, cz: number): Uint8Array {
    const voxels = new Uint8Array(CHUNK_VOLUME);
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;

        let ceilingRock = 0; // count solid blocks downward from ceiling for glowstone
        for (let y = 1; y < WORLD_HEIGHT; y++) {
          let block = BlockType.AIR;

          if (y >= CEILING || y <= 0) {
            block = BlockType.BEDROCK;
          } else {
            // Vertical bias: solid near floor & ceiling, open caverns mid-level.
            const bias = Math.abs(y - WORLD_HEIGHT * 0.5) / (WORLD_HEIGHT * 0.5);
            const n =
              this.density.noise3D(wx * 0.045, y * 0.05, wz * 0.045) +
              this.detail.noise3D(wx * 0.09, y * 0.1, wz * 0.09) * 0.4;
            const solid = n + bias * 0.9 > 0.35;
            if (solid) block = BlockType.NETHERRACK;
            else if (y <= LAVA_LEVEL) block = BlockType.LAVA;
          }

          if (y === 1) block = BlockType.BEDROCK; // solid floor

          if (block !== BlockType.AIR) {
            voxels[voxelIndex(lx, y, lz)] = block;
          }

          // Glowstone: occasionally on the underside of solid ceiling rock.
          if (block === BlockType.NETHERRACK) {
            ceilingRock++;
          } else {
            if (ceilingRock > 2 && y < CEILING - 1 && this.deco.noise3D(wx * 0.2, y * 0.2, wz * 0.2) > 0.7) {
              voxels[voxelIndex(lx, y, lz)] = BlockType.GLOWSTONE;
            }
            ceilingRock = 0;
          }
        }

        // Soul sand patch on the first solid surface above the lava.
        if (this.deco.noise2D(wx * 0.08, wz * 0.08) > 0.55) {
          for (let y = LAVA_LEVEL + 1; y < WORLD_HEIGHT - 1; y++) {
            const here = voxels[voxelIndex(lx, y, lz)];
            const above = voxels[voxelIndex(lx, y + 1, lz)];
            if (here === BlockType.NETHERRACK && above === BlockType.AIR) {
              voxels[voxelIndex(lx, y, lz)] = BlockType.SOUL_SAND;
              break;
            }
          }
        }
      }
    }

    return voxels;
  }
}
