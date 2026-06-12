/**
 * EntityManager — owns every live mob.
 *
 * Each frame it:
 *  - ticks every entity's AI + physics;
 *  - removes dead or far-away entities (freeing their GPU resources);
 *  - keeps the population topped up by spawning animals in daylight and zombies
 *    at night, on valid ground within a ring around the player.
 *
 * It also exposes `raycast()` so the player can target and hit a mob.
 */

import * as THREE from 'three';
import { WORLD_HEIGHT } from '../constants';
import { BlockType } from '../world/Block';
import type { World } from '../world/World';
import type { Player } from '../player/Player';
import { Entity, type EntityContext } from './Entity';
import { createMob, type MobKind } from './mobs';
import { disposeModel } from './MobModel';

const MAX_PASSIVE = 10;
const MAX_HOSTILE = 10;
const SPAWN_MIN_RADIUS = 14;
const SPAWN_MAX_RADIUS = 34;
const DESPAWN_RADIUS = 52;
const SPAWN_INTERVAL = 1.2; // seconds between spawn attempts

const ANIMALS: MobKind[] = ['cow', 'pig', 'chicken'];
const GROUND_OK = new Set<number>([BlockType.GRASS, BlockType.DIRT, BlockType.SAND, BlockType.SNOW, BlockType.STONE]);

export interface EntityRayHit {
  entity: Entity;
  distance: number;
}

export class EntityManager {
  readonly group = new THREE.Group();
  private readonly entities: Entity[] = [];
  private spawnTimer = 0;

  constructor() {
    this.group.name = 'entities';
  }

  get count(): number {
    return this.entities.length;
  }

  get hostileCount(): number {
    return this.entities.reduce((n, e) => n + (e.name === 'Zombie' ? 1 : 0), 0);
  }

  update(dt: number, world: World, player: Player, timeOfDay: number): void {
    const ctx: EntityContext = { world, player, timeOfDay };
    const isDay = timeOfDay < 0.48;

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.update(dt, ctx);

      const far = e.position.distanceTo(player.position) > DESPAWN_RADIUS;
      // Zombies burn away in daylight (kept simple: they just despawn).
      const burns = e.name === 'Zombie' && isDay;
      if (e.dead || far || burns) {
        this.remove(i);
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      this.trySpawn(world, player, isDay);
    }
  }

  private trySpawn(world: World, player: Player, isDay: boolean): void {
    let passive = 0;
    let hostile = 0;
    for (const e of this.entities) {
      if (e.name === 'Zombie') hostile++;
      else passive++;
    }

    if (isDay && passive < MAX_PASSIVE) {
      const kind = ANIMALS[(Math.random() * ANIMALS.length) | 0];
      this.spawnAt(world, player, kind, true);
    }
    if (!isDay && hostile < MAX_HOSTILE) {
      this.spawnAt(world, player, 'zombie', false);
    }
  }

  private spawnAt(world: World, player: Player, kind: MobKind, requireGrass: boolean): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = SPAWN_MIN_RADIUS + Math.random() * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS);
    const x = Math.floor(player.position.x + Math.cos(angle) * radius) + 0.5;
    const z = Math.floor(player.position.z + Math.sin(angle) * radius) + 0.5;

    // Only spawn inside generated terrain.
    if (!world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) return;

    // Find the surface column height.
    let surfaceY = -1;
    for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
      if (world.isSolid(Math.floor(x), y, Math.floor(z))) {
        surfaceY = y;
        break;
      }
    }
    if (surfaceY < 0) return;

    const ground = world.getBlock(Math.floor(x), surfaceY, Math.floor(z));
    if (!GROUND_OK.has(ground)) return;
    if (requireGrass && ground !== BlockType.GRASS) return;

    // Need clear space above for the mob to stand.
    const feetY = surfaceY + 1;
    if (world.isSolid(Math.floor(x), feetY, Math.floor(z)) || world.isSolid(Math.floor(x), feetY + 1, Math.floor(z))) {
      return;
    }

    const mob = createMob(kind);
    mob.setPosition(x, feetY + 0.05, z);
    mob.yaw = Math.random() * Math.PI * 2;
    this.entities.push(mob);
    this.group.add(mob.object);
  }

  /**
   * Cast a ray against every entity's AABB (slab method) and return the nearest
   * hit within maxDistance, or null.
   */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number): EntityRayHit | null {
    let best: EntityRayHit | null = null;
    for (const e of this.entities) {
      const hw = e.halfWidth;
      const minX = e.position.x - hw;
      const maxX = e.position.x + hw;
      const minY = e.position.y;
      const maxY = e.position.y + e.height;
      const minZ = e.position.z - hw;
      const maxZ = e.position.z + hw;

      const t = this.rayBox(origin, dir, minX, minY, minZ, maxX, maxY, maxZ);
      if (t !== null && t <= maxDistance && (best === null || t < best.distance)) {
        best = { entity: e, distance: t };
      }
    }
    return best;
  }

  /** Ray vs axis-aligned box; returns entry distance or null. */
  private rayBox(
    o: THREE.Vector3, d: THREE.Vector3,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
  ): number | null {
    let tmin = 0;
    let tmax = Infinity;
    const oo = [o.x, o.y, o.z];
    const dd = [d.x, d.y, d.z];
    const lo = [minX, minY, minZ];
    const hi = [maxX, maxY, maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-8) {
        if (oo[i] < lo[i] || oo[i] > hi[i]) return null;
      } else {
        let t1 = (lo[i] - oo[i]) / dd[i];
        let t2 = (hi[i] - oo[i]) / dd[i];
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  private remove(index: number): void {
    const e = this.entities[index];
    this.group.remove(e.object);
    disposeModel(e.object);
    this.entities.splice(index, 1);
  }

  /** Test helper / external spawn (used by the smoke test). */
  addEntity(entity: Entity): void {
    this.entities.push(entity);
    this.group.add(entity.object);
  }

  dispose(): void {
    for (const e of this.entities) {
      this.group.remove(e.object);
      disposeModel(e.object);
    }
    this.entities.length = 0;
  }
}
