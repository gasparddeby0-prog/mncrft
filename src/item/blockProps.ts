/**
 * Mining properties: how long each block takes to break, which tool is
 * effective, the minimum tool tier required to yield a drop, and what item it
 * drops. Kept on the item side (main thread) so the worker-safe Block registry
 * stays free of gameplay data.
 */

import { BlockType } from '../world/Block';
import type { ToolKind } from './items';

export interface MiningProps {
  /** Base seconds to break by hand. The effective tool divides this. */
  hardness: number;
  /** Tool that speeds up (and may be required for a drop). */
  tool: ToolKind | null;
  /** Minimum tool tier (1 wood … 4 diamond) needed to drop anything. */
  minTier: number;
  /** Item id dropped, or null for nothing. */
  drop: string | null;
  dropCount: number;
}

const DEFAULT: MiningProps = { hardness: 1, tool: null, minTier: 0, drop: null, dropCount: 1 };

const PROPS: Partial<Record<BlockType, MiningProps>> = {
  [BlockType.GRASS]: { hardness: 0.6, tool: 'shovel', minTier: 0, drop: 'dirt', dropCount: 1 },
  [BlockType.DIRT]: { hardness: 0.5, tool: 'shovel', minTier: 0, drop: 'dirt', dropCount: 1 },
  [BlockType.SAND]: { hardness: 0.5, tool: 'shovel', minTier: 0, drop: 'sand', dropCount: 1 },
  [BlockType.GRAVEL]: { hardness: 0.6, tool: 'shovel', minTier: 0, drop: 'gravel', dropCount: 1 },
  [BlockType.SNOW]: { hardness: 0.5, tool: 'shovel', minTier: 0, drop: 'snow', dropCount: 1 },
  [BlockType.SOUL_SAND]: { hardness: 0.5, tool: 'shovel', minTier: 0, drop: 'soul_sand', dropCount: 1 },
  [BlockType.STONE]: { hardness: 1.5, tool: 'pickaxe', minTier: 1, drop: 'cobblestone', dropCount: 1 },
  [BlockType.COBBLESTONE]: { hardness: 2, tool: 'pickaxe', minTier: 1, drop: 'cobblestone', dropCount: 1 },
  [BlockType.COAL_ORE]: { hardness: 3, tool: 'pickaxe', minTier: 1, drop: 'coal', dropCount: 1 },
  [BlockType.IRON_ORE]: { hardness: 3, tool: 'pickaxe', minTier: 2, drop: 'iron_ore', dropCount: 1 },
  [BlockType.GOLD_ORE]: { hardness: 3, tool: 'pickaxe', minTier: 3, drop: 'gold_ore', dropCount: 1 },
  [BlockType.DIAMOND_ORE]: { hardness: 3, tool: 'pickaxe', minTier: 3, drop: 'diamond', dropCount: 1 },
  [BlockType.OBSIDIAN]: { hardness: 9, tool: 'pickaxe', minTier: 4, drop: 'obsidian', dropCount: 1 },
  [BlockType.NETHERRACK]: { hardness: 0.4, tool: 'pickaxe', minTier: 1, drop: 'netherrack', dropCount: 1 },
  [BlockType.GLOWSTONE]: { hardness: 0.3, tool: null, minTier: 0, drop: 'glowstone', dropCount: 1 },
  [BlockType.END_STONE]: { hardness: 3, tool: 'pickaxe', minTier: 1, drop: 'end_stone', dropCount: 1 },
  [BlockType.WOOD]: { hardness: 2, tool: 'axe', minTier: 0, drop: 'wood', dropCount: 1 },
  [BlockType.PLANKS]: { hardness: 2, tool: 'axe', minTier: 0, drop: 'planks', dropCount: 1 },
  [BlockType.CRAFTING_TABLE]: { hardness: 2.5, tool: 'axe', minTier: 0, drop: 'crafting_table', dropCount: 1 },
  [BlockType.CHEST]: { hardness: 2.5, tool: 'axe', minTier: 0, drop: 'chest', dropCount: 1 },
  [BlockType.FURNACE]: { hardness: 3.5, tool: 'pickaxe', minTier: 1, drop: 'furnace', dropCount: 1 },
  [BlockType.LEAVES]: { hardness: 0.2, tool: null, minTier: 0, drop: null, dropCount: 0 },
  [BlockType.GLASS]: { hardness: 0.3, tool: null, minTier: 0, drop: null, dropCount: 0 },
  [BlockType.CACTUS]: { hardness: 0.4, tool: null, minTier: 0, drop: 'cactus', dropCount: 1 },
  [BlockType.SPAWNER]: { hardness: 5, tool: 'pickaxe', minTier: 2, drop: null, dropCount: 0 },
  [BlockType.BEDROCK]: { hardness: Infinity, tool: 'pickaxe', minTier: 99, drop: null, dropCount: 0 },
};

export function miningProps(block: BlockType): MiningProps {
  return PROPS[block] ?? DEFAULT;
}
