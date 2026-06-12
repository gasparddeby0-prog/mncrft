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
import { raycast, type RaycastHit } from './VoxelRaycaster';

const REACH = 5;
const ACTION_INTERVAL = 0.18; // seconds between repeated break/place while held

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

  constructor(
    private readonly world: World,
    private readonly chunks: ChunkManager,
    private readonly player: Player,
    private readonly highlight: BlockHighlight,
  ) {}

  update(dt: number, input: Input): void {
    this.actionTimer -= dt;

    // Forward direction from yaw/pitch (matches Player's convention).
    const cp = Math.cos(this.player.pitch);
    this.dir.set(
      -Math.sin(this.player.yaw) * cp,
      Math.sin(this.player.pitch),
      -Math.cos(this.player.yaw) * cp,
    );
    this.player.getEye(this.eye);

    const hit = raycast(this.world, this.eye, this.dir, REACH);
    this.currentHit = hit;

    if (!hit) {
      this.highlight.hide();
      return;
    }
    this.highlight.showAt(hit.bx, hit.by, hit.bz);

    const breaking = input.isButtonDown(0);
    const placing = input.isButtonDown(2);

    if ((breaking || placing) && this.actionTimer <= 0) {
      if (breaking) {
        this.breakBlock(hit);
      } else if (placing) {
        this.placeBlock(hit);
      }
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
