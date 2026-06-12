/**
 * Block interaction: mining, placing, using and combat.
 *
 *  - Left button: attack a mob in front, otherwise mine the targeted block.
 *    Mining is progressive — time depends on block hardness and the held tool;
 *    breaking yields a drop into the inventory (gated by tool tier) and wears
 *    the tool. Bedrock is unbreakable.
 *  - Right button: first let the host handle the block (open a container) or the
 *    held item (flint & steel); otherwise place the selected block.
 *
 * The active World/ChunkManager are read through the host so the same
 * Interaction works across dimensions.
 */

import * as THREE from 'three';
import { BlockType, getBlock } from '../world/Block';
import type { World } from '../world/World';
import type { ChunkManager } from '../world/ChunkManager';
import type { Input } from '../core/Input';
import type { Player } from './Player';
import type { BlockHighlight } from '../render/BlockHighlight';
import type { EntityManager } from '../entity/EntityManager';
import type { Inventory } from '../item/Inventory';
import { getItem } from '../item/items';
import { miningProps } from '../item/blockProps';
import { raycast, type RaycastHit } from './VoxelRaycaster';

const REACH = 5;
const PLACE_INTERVAL = 0.22;
const ATTACK_INTERVAL = 0.4;
const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;

export interface InteractionHost {
  world(): World;
  chunks(): ChunkManager;
  /** Right-click on a block (e.g. open a crafting table/furnace/chest). */
  onInteractBlock(hit: RaycastHit): boolean;
  /** Use the held item against a block (e.g. flint & steel). */
  onUseItem(itemId: string, hit: RaycastHit): boolean;
  /** Called after the inventory contents change so the HUD can refresh. */
  afterInventoryChange(): void;
}

export class Interaction {
  currentHit: RaycastHit | null = null;

  private readonly dir = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private placeTimer = 0;
  private attackTimer = 0;

  private miningKey = '';
  private miningTime = 0;

  constructor(
    private readonly host: InteractionHost,
    private readonly player: Player,
    private readonly highlight: BlockHighlight,
    private readonly entities: EntityManager,
    private readonly inventory: Inventory,
  ) {}

  update(dt: number, input: Input): void {
    this.placeTimer -= dt;
    this.attackTimer -= dt;
    const world = this.host.world();

    const cp = Math.cos(this.player.pitch);
    this.dir.set(
      -Math.sin(this.player.yaw) * cp,
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * cp,
    );
    this.player.getEye(this.eye);

    const blockHit = raycast(world, this.eye, this.dir, REACH);
    this.currentHit = blockHit;
    const entityHit = this.entities.raycast(this.eye, this.dir, REACH);

    if (blockHit) this.highlight.showAt(blockHit.bx, blockHit.by, blockHit.bz);
    else this.highlight.hide();

    const blockDist = blockHit
      ? Math.hypot(this.eye.x - (blockHit.bx + 0.5), this.eye.y - (blockHit.by + 0.5), this.eye.z - (blockHit.bz + 0.5))
      : Infinity;

    // --- Left: attack or mine ---
    if (input.isButtonDown(0)) {
      if (entityHit && entityHit.distance <= blockDist) {
        this.miningKey = '';
        if (this.attackTimer <= 0) {
          entityHit.entity.damage(this.attackDamage(), this.dir.x, this.dir.z);
          this.attackTimer = ATTACK_INTERVAL;
        }
      } else if (blockHit) {
        this.mine(dt, blockHit);
      } else {
        this.miningKey = '';
      }
    } else {
      this.miningKey = '';
      this.miningTime = 0;
    }

    // --- Right: interact / use / place ---
    if (input.isButtonDown(2) && this.placeTimer <= 0 && blockHit) {
      if (this.host.onInteractBlock(blockHit)) {
        this.placeTimer = PLACE_INTERVAL;
      } else {
        const stack = this.inventory.getSelected();
        if (stack && this.host.onUseItem(stack.id, blockHit)) {
          this.placeTimer = PLACE_INTERVAL;
        } else {
          this.placeBlock(blockHit);
          this.placeTimer = PLACE_INTERVAL;
        }
      }
    }
  }

  /** Attack damage of the held item (fist = 1). */
  private attackDamage(): number {
    const stack = this.inventory.getSelected();
    const tool = stack ? getItem(stack.id)?.tool : undefined;
    return tool ? tool.attack : 1;
  }

  /** Progressive mining of the targeted block. */
  private mine(dt: number, hit: RaycastHit): void {
    const key = `${hit.bx},${hit.by},${hit.bz}`;
    if (key !== this.miningKey) {
      this.miningKey = key;
      this.miningTime = 0;
    }
    const props = miningProps(hit.block);
    if (!Number.isFinite(props.hardness)) return; // bedrock

    this.miningTime += dt;
    if (this.miningTime >= this.breakTime(hit.block)) {
      this.breakBlock(hit);
      this.miningKey = '';
      this.miningTime = 0;
    }
  }

  /** Seconds required to break a block with the currently held item. */
  private breakTime(block: BlockType): number {
    const props = miningProps(block);
    const stack = this.inventory.getSelected();
    const tool = stack ? getItem(stack.id)?.tool : undefined;
    let time = props.hardness;
    if (tool && props.tool && tool.kind === props.tool) {
      time = props.hardness / tool.speed;
    } else if (props.tool) {
      // Wrong/!no tool: slower.
      time = props.hardness * 1.5;
    }
    return Math.max(0.05, time);
  }

  private breakBlock(hit: RaycastHit): void {
    if (hit.block === BlockType.BEDROCK) return;
    const props = miningProps(hit.block);
    const world = this.host.world();

    world.setBlock(hit.bx, hit.by, hit.bz, BlockType.AIR);
    this.host.chunks().rebuildForBlock(hit.bx, hit.bz);

    // Drop, gated by tool tier.
    const stack = this.inventory.getSelected();
    const tool = stack ? getItem(stack.id)?.tool : undefined;
    const tier = tool ? tool.tier : 0;
    if (props.drop && (props.minTier === 0 || tier >= props.minTier)) {
      this.inventory.add(props.drop, props.dropCount);
    }
    // Wear the tool.
    if (tool) this.inventory.damageSelectedTool();
    this.host.afterInventoryChange();
  }

  private placeBlock(hit: RaycastHit): void {
    const stack = this.inventory.getSelected();
    if (!stack) return;
    const def = getItem(stack.id);
    if (!def || def.placesBlock === undefined) return;

    const px = hit.bx + hit.nx;
    const py = hit.by + hit.ny;
    const pz = hit.bz + hit.nz;
    const world = this.host.world();

    const target = world.getBlock(px, py, pz);
    if (target !== BlockType.AIR && !getBlock(target).liquid) return;
    if (getBlock(def.placesBlock).solid && this.intersectsPlayer(px, py, pz)) return;

    world.setBlock(px, py, pz, def.placesBlock);
    this.host.chunks().rebuildForBlock(px, pz);
    this.inventory.decrementSelected();
    this.host.afterInventoryChange();
  }

  private intersectsPlayer(bx: number, by: number, bz: number): boolean {
    const p = this.player.position;
    const overlapX = bx < p.x + PLAYER_HALF_WIDTH && bx + 1 > p.x - PLAYER_HALF_WIDTH;
    const overlapZ = bz < p.z + PLAYER_HALF_WIDTH && bz + 1 > p.z - PLAYER_HALF_WIDTH;
    const overlapY = by < p.y + PLAYER_HEIGHT && by + 1 > p.y;
    return overlapX && overlapY && overlapZ;
  }
}
