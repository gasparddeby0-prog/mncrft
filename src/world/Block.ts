/**
 * Block registry.
 *
 * This module is intentionally free of any rendering (three.js) imports so it
 * can be shared between the main thread and the Web Workers that generate
 * terrain. It describes every block type, its physical properties, and which
 * texture-atlas tiles each face uses.
 */

/** Numeric block ids. Stored as a single byte per voxel (Uint8Array). */
export enum BlockType {
  AIR = 0,
  STONE = 1,
  DIRT = 2,
  GRASS = 3,
  SAND = 4,
  WOOD = 5,
  LEAVES = 6,
  WATER = 7,
  PLANKS = 8,
  COBBLESTONE = 9,
  BEDROCK = 10,
  GRAVEL = 11,
  SNOW = 12,
  COAL_ORE = 13,
  IRON_ORE = 14,
  GOLD_ORE = 15,
  DIAMOND_ORE = 16,
  GLASS = 17,
  LAVA = 18,
  CACTUS = 19,
  CRAFTING_TABLE = 20,
  FURNACE = 21,
  OBSIDIAN = 22,
  NETHERRACK = 23,
  GLOWSTONE = 24,
  SOUL_SAND = 25,
  END_STONE = 26,
  NETHER_PORTAL = 27,
  END_PORTAL = 28,
  CHEST = 29,
  SPAWNER = 30,
}

/**
 * Texture-atlas tile indices. The atlas is a grid of ATLAS_TILES x ATLAS_TILES
 * tiles; these indices are linear (row-major) positions into that grid.
 * TextureAtlas.ts draws a matching tile for every index here.
 */
export const Tile = {
  STONE: 0,
  DIRT: 1,
  GRASS_TOP: 2,
  GRASS_SIDE: 3,
  SAND: 4,
  WOOD_TOP: 5,
  WOOD_SIDE: 6,
  LEAVES: 7,
  WATER: 8,
  PLANKS: 9,
  COBBLESTONE: 10,
  BEDROCK: 11,
  GRAVEL: 12,
  SNOW: 13,
  COAL_ORE: 14,
  IRON_ORE: 15,
  GOLD_ORE: 16,
  DIAMOND_ORE: 17,
  GLASS: 18,
  LAVA: 19,
  CACTUS_SIDE: 20,
  CACTUS_TOP: 21,
  CRAFTING_TOP: 22,
  CRAFTING_SIDE: 23,
  FURNACE_FRONT: 24,
  FURNACE_TOP: 25,
  OBSIDIAN: 26,
  NETHERRACK: 27,
  GLOWSTONE: 28,
  SOUL_SAND: 29,
  END_STONE: 30,
  NETHER_PORTAL: 31,
  END_PORTAL: 32,
  CHEST: 33,
  SPAWNER: 34,
} as const;

/** Per-face tile indices in order: +X, -X, +Y(top), -Y(bottom), +Z, -Z. */
export interface BlockFaces {
  px: number;
  nx: number;
  py: number;
  ny: number;
  pz: number;
  nz: number;
}

export interface BlockDefinition {
  id: BlockType;
  name: string;
  /** Whether the block blocks player movement. */
  solid: boolean;
  /**
   * Opaque blocks fully hide the faces of neighbouring blocks. Transparent
   * blocks (glass, leaves, water) do not, so neighbour faces remain visible.
   */
  opaque: boolean;
  /** Rendered with alpha blending / partial transparency. */
  transparent: boolean;
  /** Fluid blocks are non-solid and rendered slightly shrunk + translucent. */
  liquid: boolean;
  /** Light level (0-15) emitted by the block. */
  light: number;
  /** Texture-atlas tile for each face. */
  faces: BlockFaces;
}

/** Helper to build a cube whose faces all use the same tile. */
function uniform(tile: number): BlockFaces {
  return { px: tile, nx: tile, py: tile, ny: tile, pz: tile, nz: tile };
}

/** Helper for a column block (distinct top/bottom vs. sides). */
function column(top: number, bottom: number, side: number): BlockFaces {
  return { px: side, nx: side, py: top, ny: bottom, pz: side, nz: side };
}

/**
 * The registry, indexed by BlockType. Order matters: index === BlockType id.
 */
export const BLOCKS: BlockDefinition[] = [
  { id: BlockType.AIR, name: 'Air', solid: false, opaque: false, transparent: true, liquid: false, light: 0, faces: uniform(0) },
  { id: BlockType.STONE, name: 'Stone', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.STONE) },
  { id: BlockType.DIRT, name: 'Dirt', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.DIRT) },
  { id: BlockType.GRASS, name: 'Grass Block', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: column(Tile.GRASS_TOP, Tile.DIRT, Tile.GRASS_SIDE) },
  { id: BlockType.SAND, name: 'Sand', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.SAND) },
  { id: BlockType.WOOD, name: 'Wood Log', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: column(Tile.WOOD_TOP, Tile.WOOD_TOP, Tile.WOOD_SIDE) },
  { id: BlockType.LEAVES, name: 'Leaves', solid: true, opaque: false, transparent: true, liquid: false, light: 0, faces: uniform(Tile.LEAVES) },
  { id: BlockType.WATER, name: 'Water', solid: false, opaque: false, transparent: true, liquid: true, light: 0, faces: uniform(Tile.WATER) },
  { id: BlockType.PLANKS, name: 'Planks', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.PLANKS) },
  { id: BlockType.COBBLESTONE, name: 'Cobblestone', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.COBBLESTONE) },
  { id: BlockType.BEDROCK, name: 'Bedrock', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.BEDROCK) },
  { id: BlockType.GRAVEL, name: 'Gravel', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.GRAVEL) },
  { id: BlockType.SNOW, name: 'Snow', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.SNOW) },
  { id: BlockType.COAL_ORE, name: 'Coal Ore', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.COAL_ORE) },
  { id: BlockType.IRON_ORE, name: 'Iron Ore', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.IRON_ORE) },
  { id: BlockType.GOLD_ORE, name: 'Gold Ore', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.GOLD_ORE) },
  { id: BlockType.DIAMOND_ORE, name: 'Diamond Ore', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.DIAMOND_ORE) },
  { id: BlockType.GLASS, name: 'Glass', solid: true, opaque: false, transparent: true, liquid: false, light: 0, faces: uniform(Tile.GLASS) },
  { id: BlockType.LAVA, name: 'Lava', solid: false, opaque: true, transparent: false, liquid: true, light: 15, faces: uniform(Tile.LAVA) },
  { id: BlockType.CACTUS, name: 'Cactus', solid: true, opaque: false, transparent: true, liquid: false, light: 0, faces: column(Tile.CACTUS_TOP, Tile.CACTUS_TOP, Tile.CACTUS_SIDE) },
  { id: BlockType.CRAFTING_TABLE, name: 'Crafting Table', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: column(Tile.CRAFTING_TOP, Tile.PLANKS, Tile.CRAFTING_SIDE) },
  { id: BlockType.FURNACE, name: 'Furnace', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: column(Tile.FURNACE_TOP, Tile.FURNACE_TOP, Tile.FURNACE_FRONT) },
  { id: BlockType.OBSIDIAN, name: 'Obsidian', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.OBSIDIAN) },
  { id: BlockType.NETHERRACK, name: 'Netherrack', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.NETHERRACK) },
  { id: BlockType.GLOWSTONE, name: 'Glowstone', solid: true, opaque: true, transparent: false, liquid: false, light: 15, faces: uniform(Tile.GLOWSTONE) },
  { id: BlockType.SOUL_SAND, name: 'Soul Sand', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.SOUL_SAND) },
  { id: BlockType.END_STONE, name: 'End Stone', solid: true, opaque: true, transparent: false, liquid: false, light: 0, faces: uniform(Tile.END_STONE) },
  { id: BlockType.NETHER_PORTAL, name: 'Nether Portal', solid: false, opaque: false, transparent: true, liquid: false, light: 11, faces: uniform(Tile.NETHER_PORTAL) },
  { id: BlockType.END_PORTAL, name: 'End Portal', solid: false, opaque: false, transparent: true, liquid: false, light: 15, faces: uniform(Tile.END_PORTAL) },
  { id: BlockType.CHEST, name: 'Chest', solid: true, opaque: false, transparent: true, liquid: false, light: 0, faces: column(Tile.CHEST, Tile.PLANKS, Tile.CHEST) },
  { id: BlockType.SPAWNER, name: 'Monster Spawner', solid: true, opaque: false, transparent: true, liquid: false, light: 3, faces: uniform(Tile.SPAWNER) },
];

/** Look up a block definition by id (falls back to AIR). */
export function getBlock(id: number): BlockDefinition {
  return BLOCKS[id] ?? BLOCKS[BlockType.AIR];
}

/** Blocks that can be selected in the hotbar / placed by the player. */
export const PLACEABLE_BLOCKS: BlockType[] = [
  BlockType.GRASS,
  BlockType.DIRT,
  BlockType.STONE,
  BlockType.COBBLESTONE,
  BlockType.PLANKS,
  BlockType.WOOD,
  BlockType.LEAVES,
  BlockType.SAND,
  BlockType.GLASS,
  BlockType.WATER,
];
