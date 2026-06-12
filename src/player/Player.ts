/**
 * First-person player controller.
 *
 * Handles mouse-look, walking / sprinting / sneaking, flying, gravity, jumping,
 * swimming, axis-separated AABB collision against the voxel world, and fall
 * damage. The player is modelled as an axis-aligned box; collisions are
 * resolved one axis at a time so the player slides smoothly along walls.
 */

import * as THREE from 'three';
import { GRAVITY, MAX_FALL_SPEED } from '../constants';
import { BlockType, getBlock } from '../world/Block';
import type { World } from '../world/World';

const HALF_WIDTH = 0.3;
const HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const EPS = 1e-3;

const WALK_SPEED = 4.317;
const SPRINT_MULT = 1.35;
const SNEAK_MULT = 0.35;
const FLY_SPEED = 11;
const FLY_SPRINT_MULT = 2.2;
const JUMP_SPEED = 8.4;
const SWIM_SPEED = 3.5;
const MOUSE_SENS = 0.0022;
const MAX_HEALTH = 20;

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();

  yaw = 0;
  pitch = 0;

  flying = false;
  onGround = false;
  inWater = false;
  sprinting = false;

  health = MAX_HEALTH;
  /** Armour defense points (0..20), refreshed from the inventory each frame. */
  armorPoints = 0;

  /** Optional callback fired when the player takes damage (for HUD feedback). */
  onDamage: ((amount: number) => void) | null = null;

  private maxAirY = 0;
  private prevOnGround = true;
  private regenTimer = 0;
  private hurtCooldown = 0;

  constructor(public world: World) {}

  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.maxAirY = y;
  }

  /** Eye position, used for the camera and for raycasting. */
  getEye(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
  }

  /** Apply mouse-look from a raw pixel delta. */
  look(dx: number, dy: number): void {
    this.yaw -= dx * MOUSE_SENS;
    this.pitch -= dy * MOUSE_SENS;
    const limit = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  /**
   * Advance the simulation.
   * @param dt seconds
   * @param move per-axis intent: forward/back, strafe, up (jump/fly), sneak flag
   */
  update(
    dt: number,
    move: { forward: number; strafe: number; jump: boolean; sneak: boolean; sprint: boolean },
  ): void {
    this.sprinting = move.sprint;
    this.updateWaterState();

    // --- Horizontal intent relative to yaw ---
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Forward vector on the XZ plane (yaw=0 looks toward -Z).
    const fx = -sin;
    const fz = -cos;
    // Right vector.
    const rx = cos;
    const rz = -sin;

    let wishX = fx * move.forward + rx * move.strafe;
    let wishZ = fz * move.forward + rz * move.strafe;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    let speed = WALK_SPEED;
    if (this.flying) speed = FLY_SPEED * (move.sprint ? FLY_SPRINT_MULT : 1);
    else if (move.sneak) speed *= SNEAK_MULT;
    else if (move.sprint) speed *= SPRINT_MULT;

    this.velocity.x = wishX * speed;
    this.velocity.z = wishZ * speed;

    // --- Vertical motion ---
    if (this.flying) {
      let vy = 0;
      if (move.jump) vy += 1;
      if (move.sneak) vy -= 1;
      this.velocity.y = vy * speed;
    } else if (this.inWater) {
      // Buoyant swimming: gentle sink, space to rise.
      this.velocity.y += -GRAVITY * 0.3 * dt;
      this.velocity.y = Math.max(this.velocity.y, -SWIM_SPEED);
      if (move.jump) this.velocity.y = SWIM_SPEED;
    } else {
      this.velocity.y -= GRAVITY * dt;
      this.velocity.y = Math.max(this.velocity.y, -MAX_FALL_SPEED);
      if (move.jump && this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    this.integrate(dt);
    this.handleFallDamage();
    this.tickHealth(dt);
  }

  /** Move with collision, substepped to avoid tunnelling at high speed. */
  private integrate(dt: number): void {
    const dx = this.velocity.x * dt;
    const dy = this.velocity.y * dt;
    const dz = this.velocity.z * dt;
    const maxComp = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(maxComp / 0.2));
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.moveAxis(0, this.velocity.x * sdt);
      this.moveAxis(2, this.velocity.z * sdt);
      this.moveAxis(1, this.velocity.y * sdt);
    }
  }

  /** Move along one axis (0=x,1=y,2=z) and resolve collision by snapping. */
  private moveAxis(axis: number, amount: number): void {
    if (amount === 0) return;
    const p = this.position;
    if (axis === 0) p.x += amount;
    else if (axis === 1) p.y += amount;
    else p.z += amount;

    if (!this.collides()) {
      if (axis === 1) this.onGround = false;
      return;
    }

    if (axis === 0) {
      p.x = amount > 0 ? Math.floor(p.x + HALF_WIDTH) - HALF_WIDTH - EPS : Math.floor(p.x - HALF_WIDTH) + 1 + HALF_WIDTH + EPS;
      this.velocity.x = 0;
    } else if (axis === 2) {
      p.z = amount > 0 ? Math.floor(p.z + HALF_WIDTH) - HALF_WIDTH - EPS : Math.floor(p.z - HALF_WIDTH) + 1 + HALF_WIDTH + EPS;
      this.velocity.z = 0;
    } else {
      if (amount > 0) {
        p.y = Math.floor(p.y + HEIGHT) - HEIGHT - EPS;
      } else {
        p.y = Math.floor(p.y) + 1 + EPS;
        this.onGround = true;
      }
      this.velocity.y = 0;
    }
  }

  /** True if the player's AABB overlaps any solid block. */
  private collides(): boolean {
    const p = this.position;
    const minX = Math.floor(p.x - HALF_WIDTH);
    const maxX = Math.floor(p.x + HALF_WIDTH);
    const minY = Math.floor(p.y);
    const maxY = Math.floor(p.y + HEIGHT - EPS);
    const minZ = Math.floor(p.z - HALF_WIDTH);
    const maxZ = Math.floor(p.z + HALF_WIDTH);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.isSolid(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private updateWaterState(): void {
    const p = this.position;
    this.inWater = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z)) === BlockType.WATER;
  }

  private handleFallDamage(): void {
    if (this.flying || this.inWater) {
      this.maxAirY = this.position.y;
    } else if (!this.onGround) {
      this.maxAirY = Math.max(this.maxAirY, this.position.y);
    }

    // Detect the moment of landing.
    if (this.onGround && !this.prevOnGround) {
      const fall = this.maxAirY - this.position.y;
      if (fall > 3.5) {
        const damage = Math.floor(fall - 3);
        this.damage(damage);
      }
      this.maxAirY = this.position.y;
    }
    this.prevOnGround = this.onGround;
  }

  damage(amount: number): void {
    if (amount <= 0 || this.hurtCooldown > 0) return;
    // Armour mitigation: each point reduces incoming damage by 4% (max 80%).
    const mitigated = amount * (1 - Math.min(20, this.armorPoints) * 0.04);
    this.health = Math.max(0, this.health - mitigated);
    this.hurtCooldown = 0.5;
    this.regenTimer = 0;
    this.onDamage?.(mitigated);
  }

  private tickHealth(dt: number): void {
    if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
    // Slow passive regeneration (no hunger system yet).
    if (this.health > 0 && this.health < MAX_HEALTH) {
      this.regenTimer += dt;
      if (this.regenTimer >= 3) {
        this.regenTimer = 0;
        this.health = Math.min(MAX_HEALTH, this.health + 1);
      }
    }
  }

  toggleFly(): void {
    this.flying = !this.flying;
    this.velocity.y = 0;
  }

  /** Block the player is standing in (used for debug HUD). */
  blockAtFeet(): number {
    return getBlock(this.world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z))).id;
  }
}
