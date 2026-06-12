/**
 * Block interaction: breaking and placing.
 *
 * Each frame it casts a ray from the player's eye, highlights the targeted
 * block, and on input either removes that block (left) or places the currently
 * selected block against the hit face (right). Edits go through World.setBlock
 * and then ChunkManager.rebuildForBlock so only the affected chunk(s) re-mesh.
 */

import * as THREE from 'three';
import { BlockType, getBlock } from '../world/Block';
import type { ChunkManager } from '../world/ChunkManager';
import type { World } from '../world/World';
import type { Input } from '../core/Input';
import type { Player } from './Player';
import type { BlockHighlight } from '../render/BlockHighlight';
import type { EntityManager } from '../entity/EntityManager';
import { raycast, type RaycastHit } from './VoxelRaycaster';

const REACH = 5;
const ACTION_INTERVAL = 0.18; // seconds between repeated break/place while held
const ATTACK_INTERVAL = 0.4; // seconds between melee hits

// Player AABB (kept in sync with Player.ts).
const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;

export class Interaction {
  selectedBlock: BlockType = BlockType.GRASS;

  /** Set by the game loop to the current targeted block (for the HUD). */
  currentHit: RaycastHit | null = null;

  private readonly dir = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private actionTimer = 0;
  private attackTimer = 0;

  constructor(
    private readonly world: World,
    private readonly chunks: ChunkManager,
    private readonly player: Player,
    private readonly highlight: BlockHighlight,
    private readonly entities: EntityManager,
  ) {}

  update(dt: number, input: Input): void {
    this.actionTimer -= dt;
    this.attackTimer -= dt;

    // Forward direction from yaw/pitch (matches Player's convention).
    const cp = Math.cos(this.player.pitch);
    this.dir.set(
      -Math.sin(this.player.yaw) * cp,
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * cp,
    );
    this.player.getEye(this.eye);

    const blockHit = raycast(this.world, this.eye, this.dir, REACH);
    this.currentHit = blockHit;
    const entityHit = this.entities.raycast(this.eye, this.dir, REACH);

    // The outline only ever marks a block.
    if (blockHit) this.highlight.showAt(blockHit.bx, blockHit.by, blockHit.bz);
    else this.highlight.hide();

    const blockDist = blockHit
      ? Math.hypot(
          this.eye.x - (blockHit.bx + 0.5),
          this.eye.y - (blockHit.by + 0.5),
          this.eye.z - (blockHit.bz + 0.5),
        )
      : Infinity;

    // Left button: attack a mob if one is in front and nearer than any block,
    // otherwise break the targeted block.
    if (input.isButtonDown(0)) {
      if (entityHit && entityHit.distance <= blockDist) {
        if (this.attackTimer <= 0) {
          entityHit.entity.damage(4, this.dir.x, this.dir.z);
          this.attackTimer = ATTACK_INTERVAL;
        }
      } else if (blockHit && this.actionTimer <= 0) {
        this.breakBlock(blockHit);
        this.actionTimer = ACTION_INTERVAL;
      }
    }

    // Right button: place against the targeted block face.
    if (input.isButtonDown(2) && blockHit && this.actionTimer <= 0) {
      this.placeBlock(blockHit);
      this.actionTimer = ACTION_INTERVAL;
    }
  }

  private breakBlock(hit: RaycastHit): void {
    if (hit.block === BlockType.BEDROCK) return; // bedrock is indestructible
    this.world.setBlock(hit.bx, hit.by, hit.bz, BlockType.AIR);
    this.chunks.rebuildForBlock(hit.bx, hit.bz);
  }

  private placeBlock(hit: RaycastHit): void {
    if (this.selectedBlock === BlockType.AIR) return;
    const px = hit.bx + hit.nx;
    const py = hit.by + hit.ny;
    const pz = hit.bz + hit.nz;

    // Only replace empty space or water.
    const target = this.world.getBlock(px, py, pz);
    if (target !== BlockType.AIR && !getBlock(target).liquid) return;

    // Don't place a solid block inside the player.
    if (getBlock(this.selectedBlock).solid && this.intersectsPlayer(px, py, pz)) return;

    this.world.setBlock(px, py, pz, this.selectedBlock);
    this.chunks.rebuildForBlock(px, pz);
  }

  /** AABB overlap test between a unit block cell and the player's body. */
  private intersectsPlayer(bx: number, by: number, bz: number): boolean {
    const p = this.player.position;
    const overlapX = bx < p.x + PLAYER_HALF_WIDTH && bx + 1 > p.x - PLAYER_HALF_WIDTH;
    const overlapZ = bz < p.z + PLAYER_HALF_WIDTH && bz + 1 > p.z - PLAYER_HALF_WIDTH;
    const overlapY = by < p.y + PLAYER_HEIGHT && by + 1 > p.y;
    return overlapX && overlapY && overlapZ;
  }
}
