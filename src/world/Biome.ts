/**
 * Biome definitions and selection.
 *
 * A biome is chosen per column from three climate inputs (elevation,
 * temperature, humidity). Each biome describes its surface composition and how
 * likely trees / cacti are to spawn there.
 */

import { BlockType } from './Block';

export enum Biome {
  OCEAN,
  PLAINS,
  FOREST,
  DESERT,
  MOUNTAINS,
  SWAMP,
  SNOWY,
}

export interface BiomeProfile {
  biome: Biome;
  name: string;
  /** Top surface block on land. */
  surface: BlockType;
  /** Block just beneath the surface (a few layers). */
  subsurface: BlockType;
  /** Probability [0..1] of a tree per column. */
  treeDensity: number;
  /** Probability [0..1] of a cactus per column. */
  cactusDensity: number;
}

export const BIOME_PROFILES: Record<Biome, BiomeProfile> = {
  [Biome.OCEAN]: {
    biome: Biome.OCEAN,
    name: 'Ocean',
    surface: BlockType.SAND,
    subsurface: BlockType.SAND,
    treeDensity: 0,
    cactusDensity: 0,
  },
  [Biome.PLAINS]: {
    biome: Biome.PLAINS,
    name: 'Plains',
    surface: BlockType.GRASS,
    subsurface: BlockType.DIRT,
    treeDensity: 0.008,
    cactusDensity: 0,
  },
  [Biome.FOREST]: {
    biome: Biome.FOREST,
    name: 'Forest',
    surface: BlockType.GRASS,
    subsurface: BlockType.DIRT,
    treeDensity: 0.06,
    cactusDensity: 0,
  },
  [Biome.DESERT]: {
    biome: Biome.DESERT,
    name: 'Desert',
    surface: BlockType.SAND,
    subsurface: BlockType.SAND,
    treeDensity: 0,
    cactusDensity: 0.012,
  },
  [Biome.MOUNTAINS]: {
    biome: Biome.MOUNTAINS,
    name: 'Mountains',
    surface: BlockType.GRASS,
    subsurface: BlockType.DIRT,
    treeDensity: 0.02,
    cactusDensity: 0,
  },
  [Biome.SWAMP]: {
    biome: Biome.SWAMP,
    name: 'Swamp',
    surface: BlockType.GRASS,
    subsurface: BlockType.DIRT,
    treeDensity: 0.03,
    cactusDensity: 0,
  },
  [Biome.SNOWY]: {
    biome: Biome.SNOWY,
    name: 'Snowy',
    surface: BlockType.SNOW,
    subsurface: BlockType.DIRT,
    treeDensity: 0.015,
    cactusDensity: 0,
  },
};
