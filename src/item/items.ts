/**
 * Item registry.
 *
 * Items are identified by string ids (e.g. "stone", "iron_pickaxe"). There are
 * four categories:
 *  - block:    can be placed in the world (maps to a BlockType)
 *  - material: crafting ingredients (stick, coal, ingots, diamond, flint…)
 *  - tool:     pickaxe / axe / shovel / sword in 4 material tiers
 *  - armor:    helmet / chestplate / leggings / boots in 3 material tiers
 *
 * Tools and armour carry stats (mining speed, attack, defense, durability).
 * This module is the single source of truth used by crafting, the inventory,
 * mining, combat and the HUD.
 */

import { BlockType, getBlock } from '../world/Block';

export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword';
export type ArmorSlot = 'helmet' | 'chest' | 'legs' | 'boots';

export interface ItemDef {
  id: string;
  name: string;
  maxStack: number;
  category: 'block' | 'material' | 'tool' | 'armor';
  placesBlock?: BlockType;
  /** Atlas tile for block icons. */
  tile?: number;
  tool?: { kind: ToolKind; material: string; tier: number; speed: number; attack: number; durability: number };
  armor?: { slot: ArmorSlot; material: string; defense: number; durability: number };
  /** Furnace burn time in seconds when used as fuel. */
  fuel?: number;
  /** Health restored when eaten. */
  food?: number;
  /** Base colour used to draw procedural (non-block) icons. */
  color?: number;
}

const REGISTRY = new Map<string, ItemDef>();

function register(def: ItemDef): void {
  REGISTRY.set(def.id, def);
}

export function getItem(id: string): ItemDef | undefined {
  return REGISTRY.get(id);
}

export function itemName(id: string): string {
  return REGISTRY.get(id)?.name ?? id;
}

// --- Block items -----------------------------------------------------------
// Each entry is a placeable item bound to a BlockType. The icon uses the
// block's top face tile.

interface BlockItemSpec {
  id: string;
  block: BlockType;
  name: string;
}

const BLOCK_ITEMS: BlockItemSpec[] = [
  { id: 'grass', block: BlockType.GRASS, name: 'Grass Block' },
  { id: 'dirt', block: BlockType.DIRT, name: 'Dirt' },
  { id: 'stone', block: BlockType.STONE, name: 'Stone' },
  { id: 'cobblestone', block: BlockType.COBBLESTONE, name: 'Cobblestone' },
  { id: 'planks', block: BlockType.PLANKS, name: 'Planks' },
  { id: 'wood', block: BlockType.WOOD, name: 'Wood Log' },
  { id: 'leaves', block: BlockType.LEAVES, name: 'Leaves' },
  { id: 'sand', block: BlockType.SAND, name: 'Sand' },
  { id: 'glass', block: BlockType.GLASS, name: 'Glass' },
  { id: 'gravel', block: BlockType.GRAVEL, name: 'Gravel' },
  { id: 'snow', block: BlockType.SNOW, name: 'Snow' },
  { id: 'cactus', block: BlockType.CACTUS, name: 'Cactus' },
  { id: 'coal_ore', block: BlockType.COAL_ORE, name: 'Coal Ore' },
  { id: 'iron_ore', block: BlockType.IRON_ORE, name: 'Iron Ore' },
  { id: 'gold_ore', block: BlockType.GOLD_ORE, name: 'Gold Ore' },
  { id: 'diamond_ore', block: BlockType.DIAMOND_ORE, name: 'Diamond Ore' },
  { id: 'crafting_table', block: BlockType.CRAFTING_TABLE, name: 'Crafting Table' },
  { id: 'furnace', block: BlockType.FURNACE, name: 'Furnace' },
  { id: 'obsidian', block: BlockType.OBSIDIAN, name: 'Obsidian' },
  { id: 'netherrack', block: BlockType.NETHERRACK, name: 'Netherrack' },
  { id: 'glowstone', block: BlockType.GLOWSTONE, name: 'Glowstone' },
  { id: 'soul_sand', block: BlockType.SOUL_SAND, name: 'Soul Sand' },
  { id: 'end_stone', block: BlockType.END_STONE, name: 'End Stone' },
  { id: 'chest', block: BlockType.CHEST, name: 'Chest' },
];

/** Map a BlockType to the item id it places. */
for (const spec of BLOCK_ITEMS) {
  register({
    id: spec.id,
    name: spec.name,
    maxStack: 64,
    category: 'block',
    placesBlock: spec.block,
    tile: getBlock(spec.block).faces.py,
    // Wood/planks burn in a furnace.
    fuel: spec.block === BlockType.PLANKS || spec.block === BlockType.WOOD ? 15 : undefined,
  });
}

export const BLOCK_ITEM_ID = new Map<BlockType, string>(BLOCK_ITEMS.map((s) => [s.block, s.id]));

// --- Materials -------------------------------------------------------------

register({ id: 'stick', name: 'Stick', maxStack: 64, category: 'material', color: 0x9b6b3f, fuel: 5 });
register({ id: 'coal', name: 'Coal', maxStack: 64, category: 'material', color: 0x232323, fuel: 80 });
register({ id: 'iron_ingot', name: 'Iron Ingot', maxStack: 64, category: 'material', color: 0xd8d8d8 });
register({ id: 'gold_ingot', name: 'Gold Ingot', maxStack: 64, category: 'material', color: 0xf4d850 });
register({ id: 'diamond', name: 'Diamond', maxStack: 64, category: 'material', color: 0x4fe0d8 });
register({ id: 'flint', name: 'Flint', maxStack: 64, category: 'material', color: 0x3a3a3a });
register({ id: 'flint_and_steel', name: 'Flint and Steel', maxStack: 1, category: 'material', color: 0xb0b0b0 });
register({ id: 'apple', name: 'Apple', maxStack: 64, category: 'material', color: 0xd83a3a, food: 4 });

// --- Tools -----------------------------------------------------------------

const TOOL_MATERIALS: Record<string, { tier: number; speed: number; atk: number; dur: number; color: number }> = {
  wood: { tier: 1, speed: 2, atk: 4, dur: 59, color: 0x9b6b3f },
  stone: { tier: 2, speed: 4, atk: 5, dur: 131, color: 0x8a8a8a },
  iron: { tier: 3, speed: 6, atk: 6, dur: 250, color: 0xd8d8d8 },
  diamond: { tier: 4, speed: 8, atk: 7, dur: 1561, color: 0x4fe0d8 },
};

const TOOL_KINDS: ToolKind[] = ['pickaxe', 'axe', 'shovel', 'sword'];

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

for (const [material, m] of Object.entries(TOOL_MATERIALS)) {
  for (const kind of TOOL_KINDS) {
    // Swords hit hardest; other tools do less but still more than a fist.
    const attack = kind === 'sword' ? m.atk : Math.max(1, m.atk - 3 + (kind === 'axe' ? 2 : 0));
    register({
      id: `${material}_${kind}`,
      name: `${titleCase(material)} ${titleCase(kind)}`,
      maxStack: 1,
      category: 'tool',
      color: m.color,
      tool: { kind, material, tier: m.tier, speed: m.speed, attack, durability: m.dur },
    });
  }
}

// --- Armor -----------------------------------------------------------------

const ARMOR_MATERIALS: Record<string, { color: number; dur: number; defense: Record<ArmorSlot, number> }> = {
  iron: { color: 0xd8d8d8, dur: 240, defense: { helmet: 2, chest: 6, legs: 5, boots: 2 } },
  gold: { color: 0xf4d850, dur: 112, defense: { helmet: 2, chest: 5, legs: 3, boots: 1 } },
  diamond: { color: 0x4fe0d8, dur: 528, defense: { helmet: 3, chest: 8, legs: 6, boots: 3 } },
};

const ARMOR_SLOTS: ArmorSlot[] = ['helmet', 'chest', 'legs', 'boots'];
const ARMOR_LABEL: Record<ArmorSlot, string> = { helmet: 'Helmet', chest: 'Chestplate', legs: 'Leggings', boots: 'Boots' };

for (const [material, m] of Object.entries(ARMOR_MATERIALS)) {
  for (const slot of ARMOR_SLOTS) {
    register({
      id: `${material}_${slot}`,
      name: `${titleCase(material)} ${ARMOR_LABEL[slot]}`,
      maxStack: 1,
      category: 'armor',
      color: m.color,
      armor: { slot, material, defense: m.defense[slot], durability: m.dur },
    });
  }
}

/** All registered item ids (used by tooling/tests). */
export function allItemIds(): string[] {
  return [...REGISTRY.keys()];
}
