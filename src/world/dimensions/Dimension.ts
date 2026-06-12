/**
 * Dimension identifiers and the common generator contract.
 *
 * The three dimensions share the chunk/mesh/streaming pipeline but each has its
 * own terrain generator (selected inside the chunk worker by the dimension id
 * carried in the generate message).
 */

export enum Dimension {
  OVERWORLD = 0,
  NETHER = 1,
  END = 2,
}

export const DIMENSION_NAME: Record<Dimension, string> = {
  [Dimension.OVERWORLD]: 'Overworld',
  [Dimension.NETHER]: 'Nether',
  [Dimension.END]: 'The End',
};

export interface ChunkGenerator {
  generateChunk(cx: number, cz: number): Uint8Array;
}
