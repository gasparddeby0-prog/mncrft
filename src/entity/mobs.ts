/**
 * Concrete mobs.
 *
 *  - PassiveMob: wanders idly, flees from whatever hurts it (cows, pigs, chickens).
 *  - Zombie: a hostile monster that chases and melee-attacks the player within
 *    its aggro range, and wanders otherwise.
 *
 * Each mob builds its blocky model in its constructor and registers the limbs
 * the animator should swing.
 */

import * as THREE from 'three';
import { Entity, type EntityContext } from './Entity';
import { box, limb } from './MobModel';

export type MobKind = 'cow' | 'pig' | 'chicken' | 'zombie';

/** Shared behaviour for peaceful animals. */
abstract class PassiveMob extends Entity {
  protected walkSpeed: number;
  private fleeTimer = 0;

  constructor(name: string, maxHealth: number, width: number, height: number, walkSpeed: number) {
    super(name, maxHealth, width, height);
    this.walkSpeed = walkSpeed;
  }

  override damage(amount: number, knockX = 0, knockZ = 0): void {
    super.damage(amount, knockX, knockZ);
    this.fleeTimer = 3; // panic and run after being hit
  }

  protected ai(dt: number, ctx: EntityContext): void {
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      // Face directly away from the player and bolt.
      const ax = this.position.x - ctx.player.position.x;
      const az = this.position.z - ctx.player.position.z;
      this.yaw = Math.atan2(ax, az);
      this.walkForward(this.walkSpeed * 1.8);
      return;
    }
    this.wander(dt, this.walkSpeed);
  }
}

export class Cow extends PassiveMob {
  constructor() {
    super('Cow', 10, 0.9, 1.4, 1.3);
    const hide = 0x5a4632;
    const dark = 0x40331f;

    // Body sits above the legs; head pokes out the front (-Z is forward).
    const body = box(0.9, 0.8, 1.5, hide);
    body.position.set(0, 1.0, 0);
    const head = box(0.55, 0.55, 0.55, dark);
    head.position.set(0, 1.15, -0.95);
    this.object.add(body, head);

    const legPos: [number, number][] = [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]];
    for (const [x, z] of legPos) {
      const leg = limb(0.26, 0.65, 0.26, dark);
      leg.position.set(x, 0.65, z);
      this.object.add(leg);
      this.legs.push(leg);
    }
  }
}

export class Pig extends PassiveMob {
  constructor() {
    super('Pig', 10, 0.9, 0.95, 1.4);
    const skin = 0xe7a0aa;
    const snout = 0xd98590;

    const body = box(0.85, 0.6, 1.3, skin);
    body.position.set(0, 0.65, 0);
    const head = box(0.5, 0.5, 0.5, skin);
    head.position.set(0, 0.7, -0.8);
    const nose = box(0.25, 0.2, 0.1, snout);
    nose.position.set(0, 0.62, -1.05);
    this.object.add(body, head, nose);

    const legPos: [number, number][] = [[-0.28, 0.45], [0.28, 0.45], [-0.28, -0.45], [0.28, -0.45]];
    for (const [x, z] of legPos) {
      const leg = limb(0.22, 0.4, 0.22, snout);
      leg.position.set(x, 0.4, z);
      this.object.add(leg);
      this.legs.push(leg);
    }
  }
}

export class Chicken extends PassiveMob {
  private wings: THREE.Object3D[] = [];

  constructor() {
    super('Chicken', 4, 0.4, 0.7, 1.6);
    const feather = 0xeeeeee;
    const beakColor = 0xe0a020;
    const combColor = 0xcc3333;

    const body = box(0.35, 0.4, 0.5, feather);
    body.position.set(0, 0.45, 0);
    const head = box(0.25, 0.25, 0.25, feather);
    head.position.set(0, 0.78, -0.18);
    const beak = box(0.12, 0.1, 0.12, beakColor);
    beak.position.set(0, 0.74, -0.34);
    const comb = box(0.08, 0.12, 0.2, combColor);
    comb.position.set(0, 0.92, -0.14);
    this.object.add(body, head, beak, comb);

    for (const side of [-1, 1]) {
      const wing = box(0.06, 0.3, 0.4, feather);
      wing.position.set(side * 0.2, 0.5, 0);
      this.object.add(wing);
      this.wings.push(wing);
    }

    for (const x of [-0.1, 0.1]) {
      const leg = limb(0.08, 0.3, 0.08, beakColor);
      leg.position.set(x, 0.3, 0);
      this.object.add(leg);
      this.legs.push(leg);
    }
  }

  protected override animate(dt: number): void {
    super.animate(dt);
    // Gentle wing flap, faster while moving.
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const flap = Math.sin(this.animTime * 16) * (0.15 + Math.min(speed, 3) * 0.12);
    if (this.wings[0]) this.wings[0].rotation.z = flap;
    if (this.wings[1]) this.wings[1].rotation.z = -flap;
  }
}

export class Zombie extends Entity {
  private static readonly AGGRO = 16;
  private static readonly ATTACK_RANGE = 1.6;
  private static readonly ATTACK_DAMAGE = 3;
  private readonly arms: THREE.Object3D[] = [];

  constructor() {
    super('Zombie', 20, 0.6, 1.95);
    const shirt = 0x3f7a3a;
    const skin = 0x35632c;
    const pants = 0x2b3a63;

    const body = box(0.5, 0.75, 0.28, shirt);
    body.position.set(0, 1.25, 0);
    const head = box(0.45, 0.45, 0.45, skin);
    head.position.set(0, 1.9, 0);
    this.object.add(body, head);

    for (const side of [-1, 1]) {
      const arm = limb(0.22, 0.7, 0.22, skin);
      arm.position.set(side * 0.36, 1.6, 0);
      arm.rotation.x = -Math.PI / 2; // arms outstretched
      this.object.add(arm);
      this.arms.push(arm);

      const leg = limb(0.24, 0.85, 0.24, pants);
      leg.position.set(side * 0.13, 0.85, 0);
      this.object.add(leg);
      this.legs.push(leg);
    }
  }

  protected ai(dt: number, ctx: EntityContext): void {
    const dx = ctx.player.position.x - this.position.x;
    const dz = ctx.player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < Zombie.AGGRO) {
      // Face and chase the player.
      this.yaw = Math.atan2(-dx, -dz);
      this.walkForward(2.3);
      if (dist < Zombie.ATTACK_RANGE && this.attackCooldown <= 0) {
        ctx.player.damage(Zombie.ATTACK_DAMAGE);
        this.attackCooldown = 1.0;
      }
    } else {
      this.wander(dt, 1.2);
    }
  }

  protected override animate(dt: number): void {
    super.animate(dt);
    // Keep arms reaching forward with a subtle sway.
    const sway = Math.sin(this.animTime * 4) * 0.08;
    for (const arm of this.arms) arm.rotation.x = -Math.PI / 2 + sway;
  }
}

/** Factory used by the spawner. */
export function createMob(kind: MobKind): Entity {
  switch (kind) {
    case 'cow': return new Cow();
    case 'pig': return new Pig();
    case 'chicken': return new Chicken();
    case 'zombie': return new Zombie();
  }
}
