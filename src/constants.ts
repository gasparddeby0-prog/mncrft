/**
 * Global engine constants.
 *
 * Chunks are columns of voxels: CHUNK_SIZE wide/deep and WORLD_HEIGHT tall.
 * Keeping the full vertical column in a single chunk simplifies terrain
 * generation and meshing while still being memory friendly
 * (CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT bytes per chunk).
 */

/** Horizontal size (X and Z) of a chunk in blocks. */
export const CHUNK_SIZE = 16;

/** Vertical size (Y) of the world in blocks. */
export const WORLD_HEIGHT = 128;

/** Y level used as the default sea level for terrain/water generation. */
export const SEA_LEVEL = 48;

/** Number of voxels stored per chunk. */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

/** How many chunks (radius) are kept loaded around the player. */
export const DEFAULT_RENDER_DISTANCE = 8;

/** Size in pixels of a single tile in the procedurally generated texture atlas. */
export const TILE_SIZE = 16;

/** Number of tiles per row/column in the texture atlas (16x16 = 256 tiles). */
export const ATLAS_TILES = 16;

/** Seconds for a full in-game day/night cycle. */
export const DAY_LENGTH_SECONDS = 600;

/** Gravity acceleration in blocks per second squared. */
export const GRAVITY = 28;

/** Terminal falling velocity (blocks/second). */
export const MAX_FALL_SPEED = 56;
