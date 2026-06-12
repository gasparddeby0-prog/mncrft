/**
 * DimensionManager — owns a World + ChunkManager + scene group for each of the
 * three dimensions and switches the active one.
 *
 * A single WorkerPool serves all dimensions; this class routes each generated
 * chunk to the manager of the dimension it was requested for. Only the active
 * dimension streams chunks and is added to the scene, so inactive dimensions
 * sit idle (their loaded chunks are retained for fast return travel).
 */

import * as THREE from 'three';
import { World } from '../World';
import { ChunkManager, type ChunkPersistence } from '../ChunkManager';
import type { WorkerPool } from '../../workers/WorkerPool';
import type { ChunkMaterials } from '../../render/Materials';
import { Dimension } from './Dimension';

const ALL: Dimension[] = [Dimension.OVERWORLD, Dimension.NETHER, Dimension.END];

export class DimensionManager {
  active: Dimension = Dimension.OVERWORLD;
  readonly worlds = new Map<Dimension, World>();
  readonly managers = new Map<Dimension, ChunkManager>();

  constructor(
    private readonly scene: THREE.Scene,
    seed: number,
    pool: WorkerPool,
    materials: ChunkMaterials,
    renderDistance: number,
  ) {
    for (const dim of ALL) {
      const world = new World(seed);
      const manager = new ChunkManager(world, pool, materials, renderDistance, dim);
      this.worlds.set(dim, world);
      this.managers.set(dim, manager);
    }

    pool.setCallback((cx, cz, dimension, voxels) => {
      this.managers.get(dimension as Dimension)?.acceptGenerated(cx, cz, voxels);
    });

    this.scene.add(this.chunks.group);
  }

  get world(): World {
    return this.worlds.get(this.active)!;
  }

  get chunks(): ChunkManager {
    return this.managers.get(this.active)!;
  }

  worldFor(dim: Dimension): World {
    return this.worlds.get(dim)!;
  }

  chunksFor(dim: Dimension): ChunkManager {
    return this.managers.get(dim)!;
  }

  setActive(dim: Dimension): void {
    if (dim === this.active) return;
    this.scene.remove(this.chunks.group);
    this.active = dim;
    this.scene.add(this.chunks.group);
  }

  setRenderDistance(distance: number): void {
    for (const m of this.managers.values()) m.setRenderDistance(distance);
  }

  setPersistence(p: ChunkPersistence): void {
    // Only the overworld is persisted; nether/end regenerate from the seed.
    this.managers.get(Dimension.OVERWORLD)!.setPersistence(p);
  }

  update(px: number, pz: number): void {
    this.chunks.update(px, pz);
  }

  saveAllModified(): void {
    this.managers.get(Dimension.OVERWORLD)!.saveAllModified();
  }
}
