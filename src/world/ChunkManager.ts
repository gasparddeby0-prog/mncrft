/**
 * ChunkManager — the streaming brain of the world.
 *
 * Responsibilities:
 *  - Load chunks within the render distance around the player (requesting
 *    terrain from the worker pool, or from saved data via a loader hook).
 *  - Unload chunks that fall outside the keep distance (freeing GPU memory and
 *    persisting any player edits through a save hook).
 *  - Schedule meshing on the main thread, throttled to a few chunks per frame
 *    so the frame rate stays smooth, prioritising the chunks nearest the player.
 *  - Re-mesh neighbours when a new chunk arrives so border faces stay correct.
 */

import * as THREE from 'three';
import { CHUNK_SIZE } from '../constants';
import { ChunkMesher, RenderLayer } from '../render/ChunkMesher';
import type { ChunkMaterials } from '../render/Materials';
import { Chunk, ChunkState } from './Chunk';
import { chunkKey, parseChunkKey, worldToChunk } from './coords';
import type { WorkerPool } from '../workers/WorkerPool';
import type { World } from './World';
import { Dimension } from './dimensions/Dimension';

/** Optional persistence hooks supplied by the save system. */
export interface ChunkPersistence {
  /** Return saved voxels for a chunk, or null if none exist. */
  load(cx: number, cz: number): Uint8Array | null;
  /** Persist a modified chunk before it is unloaded. */
  save(chunk: Chunk): void;
}

interface ChunkRender {
  meshes: (THREE.Mesh | null)[];
}

const MAX_MESH_PER_FRAME = 3;

export class ChunkManager {
  readonly group = new THREE.Group();

  private readonly renders = new Map<string, ChunkRender>();
  private readonly meshQueue: string[] = [];
  private readonly mesher: ChunkMesher;

  private renderDistance: number;
  private persistence: ChunkPersistence | null = null;

  private centerCX = Number.NaN;
  private centerCZ = Number.NaN;
  private playerX = 0;
  private playerZ = 0;

  constructor(
    private readonly world: World,
    private readonly pool: WorkerPool,
    private readonly materials: ChunkMaterials,
    renderDistance: number,
    readonly dimension: Dimension = Dimension.OVERWORLD,
  ) {
    this.renderDistance = renderDistance;
    this.mesher = new ChunkMesher(world);
    this.group.name = `chunks-${dimension}`;
  }

  setPersistence(p: ChunkPersistence): void {
    this.persistence = p;
  }

  setRenderDistance(distance: number): void {
    this.renderDistance = Math.max(2, Math.min(distance, 32));
    // Force a refresh on next update.
    this.centerCX = Number.NaN;
  }

  get queuedMeshCount(): number {
    return this.meshQueue.length;
  }

  /** Called every frame with the player's world position. */
  update(playerX: number, playerZ: number): void {
    this.playerX = playerX;
    this.playerZ = playerZ;
    const cx = worldToChunk(playerX);
    const cz = worldToChunk(playerZ);

    if (cx !== this.centerCX || cz !== this.centerCZ) {
      this.centerCX = cx;
      this.centerCZ = cz;
      this.refreshLoadedSet(cx, cz);
    }

    this.processMeshQueue();
  }

  /** Recompute which chunks should be loaded and request/unload accordingly. */
  private refreshLoadedSet(cx: number, cz: number): void {
    const r = this.renderDistance;
    const keep = r + 2;

    // Request missing chunks within the render distance, nearest first.
    const wanted: Array<{ cx: number; cz: number; d: number }> = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dz * dz;
        if (d > r * r) continue; // circular load area
        wanted.push({ cx: cx + dx, cz: cz + dz, d });
      }
    }
    wanted.sort((a, b) => a.d - b.d);

    for (const w of wanted) {
      if (this.world.hasChunk(w.cx, w.cz) || this.pool.isPending(w.cx, w.cz, this.dimension)) continue;
      // Prefer saved data when available, otherwise generate procedurally.
      const saved = this.persistence?.load(w.cx, w.cz) ?? null;
      if (saved) {
        this.acceptGenerated(w.cx, w.cz, saved);
      } else {
        this.pool.request(w.cx, w.cz, this.dimension);
      }
    }

    // Unload chunks beyond the keep distance.
    for (const chunk of [...this.world.values()]) {
      const ddx = chunk.cx - cx;
      const ddz = chunk.cz - cz;
      if (Math.abs(ddx) > keep || Math.abs(ddz) > keep) {
        this.unload(chunk);
      }
    }
  }

  /** Register a generated (or loaded) chunk and queue it + neighbours for meshing. */
  acceptGenerated(cx: number, cz: number, voxels: Uint8Array): void {
    if (this.world.hasChunk(cx, cz)) return;
    const chunk = new Chunk(cx, cz, voxels);
    chunk.state = ChunkState.GENERATED;
    this.world.addChunk(chunk);

    this.enqueueMesh(cx, cz);
    // Neighbours that already have meshes must update their shared borders.
    this.enqueueMesh(cx + 1, cz);
    this.enqueueMesh(cx - 1, cz);
    this.enqueueMesh(cx, cz + 1);
    this.enqueueMesh(cx, cz - 1);
  }

  /** Queue a chunk for (re)meshing if it exists and is not already queued. */
  enqueueMesh(cx: number, cz: number): void {
    if (!this.world.hasChunk(cx, cz)) return;
    const key = chunkKey(cx, cz);
    if (!this.meshQueue.includes(key)) this.meshQueue.push(key);
  }

  /** Build meshes for up to MAX_MESH_PER_FRAME nearest queued chunks. */
  private processMeshQueue(): void {
    if (this.meshQueue.length === 0) return;

    // Sort nearest-first so the world appears around the player quickly.
    const pcx = worldToChunk(this.playerX);
    const pcz = worldToChunk(this.playerZ);
    this.meshQueue.sort((a, b) => {
      const ka = parseChunkKey(a);
      const kb = parseChunkKey(b);
      const da = (ka.cx - pcx) ** 2 + (ka.cz - pcz) ** 2;
      const db = (kb.cx - pcx) ** 2 + (kb.cz - pcz) ** 2;
      return da - db;
    });

    let built = 0;
    while (built < MAX_MESH_PER_FRAME && this.meshQueue.length > 0) {
      const key = this.meshQueue.shift()!;
      const { cx, cz } = parseChunkKey(key);
      const chunk = this.world.getChunk(cx, cz);
      if (!chunk) continue;
      this.buildChunkMesh(chunk);
      built++;
    }
  }

  private buildChunkMesh(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cz);
    const geometries = this.mesher.build(chunk);

    let render = this.renders.get(key);
    if (!render) {
      render = { meshes: [null, null, null] };
      this.renders.set(key, render);
    }

    for (const layer of [RenderLayer.SOLID, RenderLayer.CUTOUT, RenderLayer.TRANSLUCENT]) {
      const geometry = geometries[layer];
      const existing = render.meshes[layer];
      if (existing) {
        this.group.remove(existing);
        existing.geometry.dispose();
        render.meshes[layer] = null;
      }
      if (geometry) {
        const mesh = new THREE.Mesh(geometry, this.materials[layer]);
        mesh.frustumCulled = true;
        mesh.renderOrder = layer === RenderLayer.TRANSLUCENT ? 1 : 0;
        this.group.add(mesh);
        render.meshes[layer] = mesh;
      }
    }

    chunk.state = ChunkState.MESHED;
    chunk.dirty = false;
  }

  private unload(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cz);
    if (chunk.modified) this.persistence?.save(chunk);

    const render = this.renders.get(key);
    if (render) {
      for (const mesh of render.meshes) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.geometry.dispose();
        }
      }
      this.renders.delete(key);
    }

    this.world.removeChunk(chunk.cx, chunk.cz);
    this.pool.cancel(chunk.cx, chunk.cz, this.dimension);

    const idx = this.meshQueue.indexOf(key);
    if (idx >= 0) this.meshQueue.splice(idx, 1);
  }

  /**
   * Re-mesh the chunk containing a world block, plus any neighbouring chunk if
   * the block sits on a shared border. Used after the player edits a block.
   */
  rebuildForBlock(wx: number, wz: number): void {
    const cx = worldToChunk(wx);
    const cz = worldToChunk(wz);
    this.buildImmediate(cx, cz);

    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    if (lx === 0) this.buildImmediate(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.buildImmediate(cx + 1, cz);
    if (lz === 0) this.buildImmediate(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.buildImmediate(cx, cz + 1);
  }

  /** Immediately (this frame) rebuild a chunk's mesh if it is loaded. */
  private buildImmediate(cx: number, cz: number): void {
    const chunk = this.world.getChunk(cx, cz);
    if (chunk) this.buildChunkMesh(chunk);
  }

  /** Persist every modified loaded chunk (used by auto-save). */
  saveAllModified(): void {
    if (!this.persistence) return;
    for (const chunk of this.world.values()) {
      if (chunk.modified) this.persistence.save(chunk);
    }
  }

  dispose(): void {
    for (const render of this.renders.values()) {
      for (const mesh of render.meshes) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.geometry.dispose();
        }
      }
    }
    this.renders.clear();
    this.meshQueue.length = 0;
  }
}
