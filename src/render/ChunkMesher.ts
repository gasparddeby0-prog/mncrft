/**
 * Chunk mesher.
 *
 * Converts a chunk's voxel data into renderable three.js geometry. Two key
 * optimisations keep triangle counts low:
 *
 *  - Face culling: a face is only emitted when its neighbour does not hide it
 *    (interior faces between solid blocks are skipped entirely).
 *  - Ambient occlusion: each vertex is darkened based on nearby solid blocks,
 *    baked into vertex colours so it costs nothing at render time.
 *
 * Geometry is split into three render layers so transparency sorts correctly:
 *  - SOLID:       fully opaque blocks
 *  - CUTOUT:      alpha-tested blocks (leaves, cactus)
 *  - TRANSLUCENT: alpha-blended blocks (water, glass)
 *
 * Neighbour lookups go through the World, so border faces are culled correctly
 * once adjacent chunks are present (the ChunkManager re-meshes a chunk when its
 * neighbours arrive).
 */

import * as THREE from 'three';
import { ATLAS_TILES, CHUNK_SIZE, WORLD_HEIGHT } from '../constants';
import { BlockType, getBlock } from '../world/Block';
import type { Chunk } from '../world/Chunk';
import type { World } from '../world/World';

export enum RenderLayer {
  SOLID,
  CUTOUT,
  TRANSLUCENT,
}

interface FaceDef {
  /** Direction to the neighbouring block that can hide this face. */
  dir: [number, number, number];
  /** The four corner offsets of the quad (cube-local, 0 or 1). */
  corners: [number, number, number][];
  /** Per-corner tile UV in {0,1}. */
  uv: [number, number][];
}

// Faces ordered: +X, -X, +Y, -Y, +Z, -Z. Vertices wound CCW when viewed from
// outside so the default FrontSide culling keeps them visible.
const FACES: FaceDef[] = [
  {
    dir: [1, 0, 0],
    corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dir: [-1, 0, 0],
    corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dir: [0, 1, 0],
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dir: [0, -1, 0],
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dir: [0, 0, 1],
    corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dir: [0, 0, -1],
    corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    uv: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
];

/** Directional shading (top brightest, bottom darkest) per face index. */
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];

/** Brightness multiplier for the four ambient-occlusion levels (0..3). */
const AO_LEVELS = [0.5, 0.7, 0.85, 1.0];

/** Atlas tile for a given block face index (matches FACES order). */
function faceTile(block: number, faceIndex: number): number {
  const f = getBlock(block).faces;
  switch (faceIndex) {
    case 0: return f.px;
    case 1: return f.nx;
    case 2: return f.py;
    case 3: return f.ny;
    case 4: return f.pz;
    default: return f.nz;
  }
}

function layerOf(block: number): RenderLayer {
  const def = getBlock(block);
  if (def.liquid || block === BlockType.GLASS) return RenderLayer.TRANSLUCENT;
  if (def.transparent) return RenderLayer.CUTOUT;
  return RenderLayer.SOLID;
}

interface Buffers {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
  vertexCount: number;
}

function newBuffers(): Buffers {
  return { positions: [], normals: [], colors: [], uvs: [], indices: [], vertexCount: 0 };
}

export interface ChunkGeometrySet {
  [RenderLayer.SOLID]: THREE.BufferGeometry | null;
  [RenderLayer.CUTOUT]: THREE.BufferGeometry | null;
  [RenderLayer.TRANSLUCENT]: THREE.BufferGeometry | null;
}

export class ChunkMesher {
  constructor(private readonly world: World) {}

  /**
   * Decide whether the face of `current` towards `neighbour` is visible.
   * Hidden if the neighbour is opaque, or is the same translucent block type
   * (so adjacent water/glass/leaves don't render their shared internal faces).
   */
  private faceVisible(current: number, neighbour: number): boolean {
    const nd = getBlock(neighbour);
    if (nd.opaque) return false;
    if (neighbour === BlockType.AIR) return true;
    if (neighbour === current) return false;
    return true;
  }

  /** Ambient-occlusion level (0..3) for a vertex given its three neighbours. */
  private ao(s1: boolean, s2: boolean, c: boolean): number {
    if (s1 && s2) return 0;
    return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0));
  }

  /** Build the geometry set for a chunk. */
  build(chunk: Chunk): ChunkGeometrySet {
    const world = this.world;
    const ox = chunk.originX;
    const oz = chunk.originZ;

    const layers: Record<RenderLayer, Buffers> = {
      [RenderLayer.SOLID]: newBuffers(),
      [RenderLayer.CUTOUT]: newBuffers(),
      [RenderLayer.TRANSLUCENT]: newBuffers(),
    };

    const isOpaque = (wx: number, wy: number, wz: number): boolean =>
      getBlock(world.getBlock(wx, wy, wz)).opaque;

    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const block = chunk.get(lx, ly, lz);
          if (block === BlockType.AIR) continue;

          const wx = ox + lx;
          const wy = ly;
          const wz = oz + lz;
          const layer = layerOf(block);
          const buf = layers[layer];

          for (let fi = 0; fi < 6; fi++) {
            const face = FACES[fi];
            const nx = wx + face.dir[0];
            const ny = wy + face.dir[1];
            const nz = wz + face.dir[2];
            const neighbour = world.getBlock(nx, ny, nz);
            if (!this.faceVisible(block, neighbour)) continue;

            const tile = faceTile(block, fi);
            const tileX = tile % ATLAS_TILES;
            const tileY = Math.floor(tile / ATLAS_TILES);
            const shade = FACE_SHADE[fi];
            const base = buf.vertexCount;

            // Per-vertex AO based on the eight blocks around this face.
            const aoValues: number[] = [];
            for (let v = 0; v < 4; v++) {
              const corner = face.corners[v];
              const sx = corner[0] === 1 ? 1 : -1;
              const sy = corner[1] === 1 ? 1 : -1;
              const sz = corner[2] === 1 ? 1 : -1;

              // Project the two in-plane axes (the ones not equal to the normal).
              let s1: boolean;
              let s2: boolean;
              let cnr: boolean;
              if (face.dir[0] !== 0) {
                s1 = isOpaque(wx + face.dir[0], wy + sy, wz);
                s2 = isOpaque(wx + face.dir[0], wy, wz + sz);
                cnr = isOpaque(wx + face.dir[0], wy + sy, wz + sz);
              } else if (face.dir[1] !== 0) {
                s1 = isOpaque(wx + sx, wy + face.dir[1], wz);
                s2 = isOpaque(wx, wy + face.dir[1], wz + sz);
                cnr = isOpaque(wx + sx, wy + face.dir[1], wz + sz);
              } else {
                s1 = isOpaque(wx + sx, wy, wz + face.dir[2]);
                s2 = isOpaque(wx, wy + sy, wz + face.dir[2]);
                cnr = isOpaque(wx + sx, wy + sy, wz + face.dir[2]);
              }
              aoValues.push(this.ao(s1, s2, cnr));
            }

            for (let v = 0; v < 4; v++) {
              const corner = face.corners[v];
              buf.positions.push(lx + corner[0], ly + corner[1], lz + corner[2]);
              buf.normals.push(face.dir[0], face.dir[1], face.dir[2]);

              const brightness = shade * AO_LEVELS[aoValues[v]];
              buf.colors.push(brightness, brightness, brightness);

              const [uu, vv] = face.uv[v];
              const u = (tileX + uu) / ATLAS_TILES;
              const tv = (tileY + (1 - vv)) / ATLAS_TILES;
              buf.uvs.push(u, tv);
            }

            // Flip the quad's diagonal when AO is anisotropic to avoid
            // the classic ambient-occlusion seam artefact.
            if (aoValues[0] + aoValues[2] > aoValues[1] + aoValues[3]) {
              buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            } else {
              buf.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            }
            buf.vertexCount += 4;
          }
        }
      }
    }

    return {
      [RenderLayer.SOLID]: this.toGeometry(layers[RenderLayer.SOLID], ox, oz),
      [RenderLayer.CUTOUT]: this.toGeometry(layers[RenderLayer.CUTOUT], ox, oz),
      [RenderLayer.TRANSLUCENT]: this.toGeometry(layers[RenderLayer.TRANSLUCENT], ox, oz),
    };
  }

  private toGeometry(buf: Buffers, ox: number, oz: number): THREE.BufferGeometry | null {
    if (buf.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
    geometry.setIndex(buf.indices);
    // Position the geometry at the chunk's world origin.
    geometry.translate(ox, 0, oz);
    geometry.computeBoundingSphere();
    return geometry;
  }
}
