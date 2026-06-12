/**
 * Procedural terrain generation.
 *
 * Produces the voxel data for a chunk purely from a world seed and the chunk
 * coordinates, so generation is deterministic and reproducible. The generator
 * is rendering-free and is executed inside a Web Worker (see workers/) so the
 * main thread never stalls while building the world.
 *
 * Pipeline per column (x, z):
 *   1. Climate noise  -> elevation, temperature, humidity
 *   2. Height + biome -> terrain surface height and biome profile
 *   3. Column fill    -> bedrock / stone / subsurface / surface / water
 *   4. Caves          -> 3D "spaghetti" cave carving
 *   5. Ores           -> depth-dependent ore placement in stone
 *   6. Decoration     -> trees & cacti (stamped with a margin so structures
 *                        cross chunk borders seamlessly)
 */

import { CHUNK_SIZE, CHUNK_VOLUME, SEA_LEVEL, WORLD_HEIGHT } from '../constants';
import { BlockType } from './Block';
import { Biome, BIOME_PROFILES } from './Biome';
import { voxelIndex } from './coords';
import { SimplexNoise } from './noise/SimplexNoise';

/** Deterministic 0..1 hash for a world column, used for decoration scatter. */
function hashColumn(x: number, z: number, seed: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 982451653);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export class TerrainGenerator {
  private readonly elevation: SimplexNoise;
  private readonly detail: SimplexNoise;
  private readonly mountain: SimplexNoise;
  private readonly temperature: SimplexNoise;
  private readonly humidity: SimplexNoise;
  private readonly cave1: SimplexNoise;
  private readonly cave2: SimplexNoise;
  private readonly ore: SimplexNoise;
  private readonly ravine: SimplexNoise;
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    // Distinct seeds keep the noise fields independent.
    this.elevation = new SimplexNoise(seed + 1);
    this.detail = new SimplexNoise(seed + 2);
    this.mountain = new SimplexNoise(seed + 3);
    this.temperature = new SimplexNoise(seed + 4);
    this.humidity = new SimplexNoise(seed + 5);
    this.cave1 = new SimplexNoise(seed + 6);
    this.cave2 = new SimplexNoise(seed + 7);
    this.ore = new SimplexNoise(seed + 8);
    this.ravine = new SimplexNoise(seed + 9);
  }

  /** Surface terrain height (top solid Y) for a world column. */
  heightAt(wx: number, wz: number): number {
    // Large-scale rolling elevation, normalised to [-1, 1].
    const base = this.elevation.fbm2D(wx * 0.0042, wz * 0.0042, 5, 2, 0.5);
    // Smaller hills add local relief.
    const hills = this.detail.fbm2D(wx * 0.018, wz * 0.018, 3, 2, 0.5) * 0.5;

    // Mountainous mask: where this is high, terrain rises into sharp peaks.
    const mask = Math.max(0, this.mountain.fbm2D(wx * 0.0016, wz * 0.0016, 3, 2, 0.5));
    // Ridge noise (1 - |noise|) gives crisp mountain ridges.
    const ridge = 1 - Math.abs(this.mountain.noise2D(wx * 0.01, wz * 0.01));
    const peaks = mask * mask * ridge * 48;

    let height = SEA_LEVEL + base * 26 + hills * 8 + peaks;
    // Flatten ocean basins a little so they are not too spiky.
    if (height < SEA_LEVEL) height = SEA_LEVEL - (SEA_LEVEL - height) * 0.7;

    return Math.max(2, Math.min(WORLD_HEIGHT - 12, Math.floor(height)));
  }

  /** Biome for a world column given its computed height. */
  biomeAt(wx: number, wz: number, height: number): Biome {
    const temp = (this.temperature.fbm2D(wx * 0.0035, wz * 0.0035, 3) + 1) / 2;
    const humid = (this.humidity.fbm2D(wx * 0.003, wz * 0.003, 3) + 1) / 2;

    if (height < SEA_LEVEL - 2) return Biome.OCEAN;
    if (height <= SEA_LEVEL + 1 && humid > 0.62) return Biome.SWAMP;
    if (temp > 0.68 && humid < 0.38) return Biome.DESERT;
    if (height > SEA_LEVEL + 30) return Biome.MOUNTAINS;
    if (temp < 0.28) return Biome.SNOWY;
    if (humid > 0.55) return Biome.FOREST;
    return Biome.PLAINS;
  }

  /** Generate the full voxel array for a chunk. */
  generateChunk(cx: number, cz: number): Uint8Array {
    const voxels = new Uint8Array(CHUNK_VOLUME);
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;

    // --- 1-5: per-column terrain, caves and ores ---
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = originX + lx;
        const wz = originZ + lz;
        const height = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz, height);
        const profile = BIOME_PROFILES[biome];

        for (let y = 0; y <= Math.max(height, SEA_LEVEL); y++) {
          let block = BlockType.AIR;

          if (y === 0) {
            block = BlockType.BEDROCK;
          } else if (y <= 2 && hashColumn(wx * 7 + y, wz * 13, this.seed) < 0.5) {
            block = BlockType.BEDROCK;
          } else if (y < height - 4) {
            block = BlockType.STONE;
          } else if (y < height) {
            block = profile.subsurface;
          } else if (y === height) {
            // Underwater surfaces become sand/gravel rather than grass.
            if (height < SEA_LEVEL) {
              block = BlockType.SAND;
            } else if (biome === Biome.MOUNTAINS && y > 92) {
              block = BlockType.SNOW;
            } else {
              block = profile.surface;
            }
          } else if (y <= SEA_LEVEL) {
            block = BlockType.WATER;
          }

          // Cave carving: only inside solid stone, leaves a stone shell near
          // the surface and never breaches bedrock.
          if (block === BlockType.STONE && y > 3 && y < height - 1) {
            const a = this.cave1.noise3D(wx * 0.05, y * 0.05, wz * 0.05);
            const b = this.cave2.noise3D(wx * 0.05, y * 0.05, wz * 0.05);
            if (a * a + b * b < 0.0016) {
              block = BlockType.AIR;
            }
            // Ravines: thin, deep canyons following ridge lines.
            const rn = this.ravine.noise2D(wx * 0.0075, wz * 0.0075);
            if (Math.abs(rn) < 0.02 && y > 9 && y < height - 2) {
              block = BlockType.AIR;
            }
          }

          // Ore placement inside stone, gated by depth.
          if (block === BlockType.STONE) {
            block = this.oreAt(wx, y, wz);
          }

          if (block !== BlockType.AIR) {
            voxels[voxelIndex(lx, y, lz)] = block;
          }
        }
      }
    }

    // --- 6: decoration (trees & cacti) with a 2-block margin so trunks in
    // neighbouring columns still drop their leaves into this chunk. ---
    const MARGIN = 3;
    for (let tz = -MARGIN; tz < CHUNK_SIZE + MARGIN; tz++) {
      for (let tx = -MARGIN; tx < CHUNK_SIZE + MARGIN; tx++) {
        const wx = originX + tx;
        const wz = originZ + tz;
        const height = this.heightAt(wx, wz);
        if (height < SEA_LEVEL) continue; // no plants underwater
        const biome = this.biomeAt(wx, wz, height);
        const profile = BIOME_PROFILES[biome];

        const roll = hashColumn(wx, wz, this.seed + 99);
        if (profile.treeDensity > 0 && roll < profile.treeDensity) {
          this.stampTree(voxels, originX, originZ, wx, height, wz, biome);
        } else if (profile.cactusDensity > 0 && roll < profile.cactusDensity) {
          this.stampCactus(voxels, originX, originZ, wx, height, wz);
        }
      }
    }

    // --- 7: structures (dungeons, villages) stamped deterministically with a
    // margin so they span chunk borders seamlessly. ---
    this.generateStructures(voxels, originX, originZ);

    return voxels;
  }

  /** Stamp any dungeons/villages whose footprint overlaps this chunk. */
  private generateStructures(voxels: Uint8Array, originX: number, originZ: number): void {
    // Dungeons: one candidate per 32-block region, ~16% chance, underground.
    const DR = 32;
    const margin = 6;
    const rgx0 = Math.floor((originX - margin) / DR);
    const rgx1 = Math.floor((originX + CHUNK_SIZE + margin) / DR);
    const rgz0 = Math.floor((originZ - margin) / DR);
    const rgz1 = Math.floor((originZ + CHUNK_SIZE + margin) / DR);
    for (let rgx = rgx0; rgx <= rgx1; rgx++) {
      for (let rgz = rgz0; rgz <= rgz1; rgz++) {
        if (hashColumn(rgx, rgz, this.seed + 555) >= 0.16) continue;
        const dx = rgx * DR + 6 + Math.floor(hashColumn(rgx, rgz, this.seed + 556) * 14);
        const dz = rgz * DR + 6 + Math.floor(hashColumn(rgx, rgz, this.seed + 557) * 14);
        const surf = this.heightAt(dx + 3, dz + 3);
        const maxDepth = Math.max(10, surf - 16);
        const dy = 8 + Math.floor(hashColumn(rgx, rgz, this.seed + 558) * (maxDepth - 8));
        if (dy + 6 < surf - 2) this.stampDungeon(voxels, originX, originZ, dx, dy, dz);
      }
    }

    // Villages: one candidate per 112-block region, ~22% chance, on land.
    const VR = 112;
    const vMargin = 16;
    const vgx0 = Math.floor((originX - vMargin) / VR);
    const vgx1 = Math.floor((originX + CHUNK_SIZE + vMargin) / VR);
    const vgz0 = Math.floor((originZ - vMargin) / VR);
    const vgz1 = Math.floor((originZ + CHUNK_SIZE + vMargin) / VR);
    for (let vgx = vgx0; vgx <= vgx1; vgx++) {
      for (let vgz = vgz0; vgz <= vgz1; vgz++) {
        if (hashColumn(vgx, vgz, this.seed + 777) >= 0.22) continue;
        const cxw = vgx * VR + 24 + Math.floor(hashColumn(vgx, vgz, this.seed + 778) * 60);
        const czw = vgz * VR + 24 + Math.floor(hashColumn(vgx, vgz, this.seed + 779) * 60);
        const offsets: [number, number][] = [[0, 0], [-11, -2], [10, 1], [-2, 11], [3, -12], [12, 12]];
        for (let i = 0; i < offsets.length; i++) {
          const hx = cxw + offsets[i][0];
          const hz = czw + offsets[i][1];
          const g = this.heightAt(hx + 3, hz + 3);
          const biome = this.biomeAt(hx + 3, hz + 3, g);
          if (g < SEA_LEVEL || biome === Biome.OCEAN) continue;
          this.stampHouse(voxels, originX, originZ, hx, g, hz, i);
        }
      }
    }
  }

  /** A small cobblestone dungeon room with a spawner and two chests. */
  private stampDungeon(voxels: Uint8Array, ox: number, oz: number, dx: number, dy: number, dz: number): void {
    const W = 7, H = 5, D = 7;
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        for (let y = 0; y < H; y++) {
          const shell = x === 0 || x === W - 1 || z === 0 || z === D - 1 || y === 0 || y === H - 1;
          this.place(voxels, ox, oz, dx + x, dy + y, dz + z, shell ? BlockType.COBBLESTONE : BlockType.AIR, true);
        }
      }
    }
    this.place(voxels, ox, oz, dx + 3, dy + 1, dz + 3, BlockType.SPAWNER, true);
    this.place(voxels, ox, oz, dx + 1, dy + 1, dz + 1, BlockType.CHEST, true);
    this.place(voxels, ox, oz, dx + W - 2, dy + 1, dz + D - 2, BlockType.CHEST, true);
  }

  /** A small village house: cobble base, plank walls, glass windows, door, roof. */
  private stampHouse(voxels: Uint8Array, ox: number, oz: number, hx: number, groundY: number, hz: number, variant: number): void {
    const W = 7, D = 6, wallH = 4;
    const floorY = groundY;
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        // Foundation + clear the interior column above it.
        this.place(voxels, ox, oz, hx + x, floorY, hz + z, BlockType.COBBLESTONE, true);
        for (let y = 1; y <= wallH + 1; y++) {
          this.place(voxels, ox, oz, hx + x, floorY + y, hz + z, BlockType.AIR, true);
        }
      }
    }
    // Walls.
    for (let y = 1; y <= wallH; y++) {
      for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
          const edge = x === 0 || x === W - 1 || z === 0 || z === D - 1;
          if (!edge) continue;
          const corner = (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
          let block: BlockType = corner ? BlockType.WOOD : BlockType.PLANKS;
          // Windows at mid height on the long walls.
          if (y === 2 && !corner && (x === 0 || x === W - 1) && z % 2 === 1) block = BlockType.GLASS;
          if (y === 2 && !corner && (z === 0 || z === D - 1) && x % 2 === 1) block = BlockType.GLASS;
          this.place(voxels, ox, oz, hx + x, floorY + y, hz + z, block, true);
        }
      }
    }
    // Door (front centre, two-high gap).
    const doorX = hx + 3;
    this.place(voxels, ox, oz, doorX, floorY + 1, hz, BlockType.AIR, true);
    this.place(voxels, ox, oz, doorX, floorY + 2, hz, BlockType.AIR, true);
    // Flat plank roof.
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        this.place(voxels, ox, oz, hx + x, floorY + wallH + 1, hz + z, BlockType.PLANKS, true);
      }
    }
    // A crafting table or furnace inside, alternating per house.
    const fixture = variant % 2 === 0 ? BlockType.CRAFTING_TABLE : BlockType.FURNACE;
    this.place(voxels, ox, oz, hx + 1, floorY + 1, hz + 1, fixture, true);
  }

  /** Decide which ore (if any) replaces stone at a position. */
  private oreAt(wx: number, y: number, wz: number): BlockType {
    const n = this.ore.noise3D(wx * 0.1, y * 0.1, wz * 0.1);
    const r = hashColumn(wx + y * 31, wz - y * 17, this.seed + 8);
    if (y < 16 && n > 0.84 && r < 0.5) return BlockType.DIAMOND_ORE;
    if (y < 28 && n > 0.8 && r < 0.6) return BlockType.GOLD_ORE;
    if (y < 48 && n > 0.74) return BlockType.IRON_ORE;
    if (y < 70 && n > 0.7) return BlockType.COAL_ORE;
    return BlockType.STONE;
  }

  /** Write a voxel only if it falls inside the chunk being generated. */
  private place(
    voxels: Uint8Array,
    originX: number,
    originZ: number,
    wx: number,
    y: number,
    wz: number,
    id: BlockType,
    overwrite: boolean,
  ): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const lx = wx - originX;
    const lz = wz - originZ;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    const idx = voxelIndex(lx, y, lz);
    if (!overwrite && voxels[idx] !== BlockType.AIR) return;
    voxels[idx] = id;
  }

  /** Stamp a tree (trunk + leaf canopy) at a world column. */
  private stampTree(
    voxels: Uint8Array,
    originX: number,
    originZ: number,
    wx: number,
    baseY: number,
    wz: number,
    biome: Biome,
  ): void {
    const h = hashColumn(wx, wz, this.seed + 7);
    const trunkHeight = 4 + Math.floor(h * 3); // 4..6
    const topY = baseY + trunkHeight;

    // Canopy: layered leaves, wider in the middle.
    for (let dy = -2; dy <= 1; dy++) {
      const y = topY + dy;
      const radius = dy >= 0 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Trim the corners of the widest layers for a rounder shape.
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius === 2) {
            if (hashColumn(wx + dx, wz + dz, this.seed + dy) < 0.5) continue;
          }
          this.place(voxels, originX, originZ, wx + dx, y, wz + dz, BlockType.LEAVES, false);
        }
      }
    }

    // Trunk last so it overwrites any leaves placed at its column.
    for (let i = 1; i <= trunkHeight; i++) {
      this.place(voxels, originX, originZ, wx, baseY + i, wz, BlockType.WOOD, true);
    }

    // Swamp trees are shorter — handled by trunkHeight noise; biome kept for
    // future variation (kept referenced to avoid unused warnings).
    void biome;
  }

  /** Stamp a 1-3 tall cactus. */
  private stampCactus(
    voxels: Uint8Array,
    originX: number,
    originZ: number,
    wx: number,
    baseY: number,
    wz: number,
  ): void {
    const height = 1 + Math.floor(hashColumn(wx, wz, this.seed + 11) * 3);
    for (let i = 1; i <= height; i++) {
      this.place(voxels, originX, originZ, wx, baseY + i, wz, BlockType.CACTUS, true);
    }
  }
}
