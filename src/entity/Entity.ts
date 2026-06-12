/**
 * Base class for every living entity (animals, monsters).
 *
 * Provides shared behaviour:
 *  - gravity + substepped, axis-separated AABB collision against the voxel world
 *    (so mobs walk on terrain, slide along walls and don't fall through floors);
 *  - health, damage and knockback;
 *  - a default walk animation that swings the registered limbs based on speed.
 *
 * Subclasses implement `ai()` (and may override `animate()`); they build their
 * model in their own constructor and register the limbs they want animated.
 */

import * as THREE from 'three';
import { GRAVITY, MAX_FALL_SPEED } from '../constants';
import type { World } from '../world/World';
import type { Player } from '../player/Player';

const EPS = 1e-3;

/** Everything an entity's AI needs to know about the world each tick. */
export interface EntityContext {
  world: World;
  player: Player;
  /** Day fraction (0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight). */
  timeOfDay: number;
}

export abstract class Entity {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();

  yaw = 0;
  health: number;
  readonly maxHealth: number;
  readonly width: number;
  readonly height: number;
  readonly name: string;

  dead = false;
  onGround = false;

  /** Limbs swung by the default walk animation. */
  protected legs: THREE.Object3D[] = [];
  protected animTime = 0;
  protected aiTimer = 0;
  protected wandering = false;
  protected attackCooldown = 0;
  protected hurtFlash = 0;

  constructor(name: string, maxHealth: number, width: number, height: number) {
    this.name = name;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.width = width;
    this.height = height;
    this.object.frustumCulled = false;
  }

  get halfWidth(): number {
    return this.width / 2;
  }

  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.object.position.set(x, y, z);
  }

  /** Apply damage with optional horizontal knockback direction. */
  damage(amount: number, knockX = 0, knockZ = 0): void {
    if (this.dead || amount <= 0) return;
    this.health -= amount;
    this.hurtFlash = 0.25;
    const len = Math.hypot(knockX, knockZ);
    if (len > 0) {
      this.velocity.x += (knockX / len) * 6;
      this.velocity.z += (knockZ / len) * 6;
      this.velocity.y = Math.max(this.velocity.y, 5);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  /** Advance the entity one tick. */
  update(dt: number, ctx: EntityContext): void {
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    this.ai(dt, ctx);

    // Gravity.
    this.velocity.y = Math.max(this.velocity.y - GRAVITY * dt, -MAX_FALL_SPEED);
    // Horizontal damping (so knockback decays and mobs don't slide forever).
    this.velocity.x *= 0.82;
    this.velocity.z *= 0.82;

    this.integrate(dt, ctx.world);

    this.object.position.copy(this.position);
    this.object.rotation.y = this.yaw;

    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    this.animate(dt);
  }

  protected abstract ai(dt: number, ctx: EntityContext): void;

  /** Default walk cycle: alternate-swing the registered limbs by current speed. */
  protected animate(dt: number): void {
    this.animTime += dt;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const swing = Math.sin(this.animTime * 9) * Math.min(speed, 3) * 0.45;
    for (let i = 0; i < this.legs.length; i++) {
      // Alternate legs (and diagonal gait for quadrupeds).
      const sign = i % 2 === 0 ? 1 : -1;
      this.legs[i].rotation.x = swing * sign;
    }
  }

  // --- Physics (mirrors the player's collision approach) ---

  protected integrate(dt: number, world: World): void {
    const dx = this.velocity.x * dt;
    const dy = this.velocity.y * dt;
    const dz = this.velocity.z * dt;
    const maxComp = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(maxComp / 0.2));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(world, 0, this.velocity.x * sdt);
      this.moveAxis(world, 2, this.velocity.z * sdt);
      this.moveAxis(world, 1, this.velocity.y * sdt);
    }
  }

  private moveAxis(world: World, axis: number, amount: number): void {
    if (amount === 0) return;
    const p = this.position;
    if (axis === 0) p.x += amount;
    else if (axis === 1) p.y += amount;
    else p.z += amount;

    if (!this.collides(world)) {
      if (axis === 1) this.onGround = false;
      return;
    }

    const hw = this.halfWidth;
    if (axis === 0) {
      p.x = amount > 0 ? Math.floor(p.x + hw) - hw - EPS : Math.floor(p.x - hw) + 1 + hw + EPS;
      this.velocity.x = 0;
    } else if (axis === 2) {
      p.z = amount > 0 ? Math.floor(p.z + hw) - hw - EPS : Math.floor(p.z - hw) + 1 + hw + EPS;
      this.velocity.z = 0;
    } else {
      if (amount > 0) {
        p.y = Math.floor(p.y + this.height) - this.height - EPS;
      } else {
        p.y = Math.floor(p.y) + 1 + EPS;
        this.onGround = true;
      }
      this.velocity.y = 0;
    }
  }

  protected collides(world: World): boolean {
    const p = this.position;
    const hw = this.halfWidth;
    const minX = Math.floor(p.x - hw);
    const maxX = Math.floor(p.x + hw);
    const minY = Math.floor(p.y);
    const maxY = Math.floor(p.y + this.height - EPS);
    const minZ = Math.floor(p.z - hw);
    const maxZ = Math.floor(p.z + hw);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Walk toward a yaw at a given speed, auto-jumping over 1-block steps when
   * blocked on the ground. Shared by passive and hostile movement.
   */
  protected walkForward(speed: number): void {
    // While being knocked back, let physics carry the entity instead of
    // immediately overwriting its velocity with AI movement.
    if (this.hurtFlash > 0) return;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const blocked = this.velocity.x === 0 && this.velocity.z === 0 && this.animTime > 0.1;
    this.velocity.x = fx * speed;
    this.velocity.z = fz * speed;
    if (blocked && this.onGround) this.velocity.y = 7.5; // hop over an edge
  }

  /**
   * Idle wandering: every few seconds, randomly decide to stand still or pick a
   * new heading and stroll. Shared by passive animals and idle monsters.
   */
  protected wander(dt: number, speed: number): void {
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.wandering = Math.random() < 0.6;
      if (this.wandering) this.yaw = Math.random() * Math.PI * 2;
      this.aiTimer = 2 + Math.random() * 4;
    }
    if (this.wandering) this.walkForward(speed);
  }
}
