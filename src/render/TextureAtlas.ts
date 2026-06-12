/**
 * Procedural texture atlas.
 *
 * Every block texture is drawn from scratch onto a single canvas at startup, so
 * the project ships with zero external image assets — everything here is
 * original and free of any licensing concerns. The canvas is uploaded once as a
 * GPU texture and shared by all chunk materials.
 *
 * Layout: ATLAS_TILES x ATLAS_TILES grid of TILE_SIZE px tiles, indexed
 * row-major to match the `Tile` constants in world/Block.ts.
 */

import * as THREE from 'three';
import { ATLAS_TILES, TILE_SIZE } from '../constants';
import { Tile } from '../world/Block';

/** Small deterministic PRNG so textures look identical every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function vary(base: RGB, amount: number, r: () => number): string {
  const d = (r() * 2 - 1) * amount;
  return `rgb(${clamp(base[0] + d)},${clamp(base[1] + d)},${clamp(base[2] + d)})`;
}

/** Helper bound to one tile: paints a single texel at local (x, y). */
interface TilePainter {
  ctx: CanvasRenderingContext2D;
  ox: number;
  oy: number;
  px(x: number, y: number, color: string): void;
  clear(x: number, y: number): void;
}

function painter(ctx: CanvasRenderingContext2D, tile: number): TilePainter {
  const ox = (tile % ATLAS_TILES) * TILE_SIZE;
  const oy = Math.floor(tile / ATLAS_TILES) * TILE_SIZE;
  return {
    ctx,
    ox,
    oy,
    px(x, y, color) {
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    },
    clear(x, y) {
      ctx.clearRect(ox + x, oy + y, 1, 1);
    },
  };
}

/** Fill a whole tile with noisy variations of a base colour. */
function fillNoise(p: TilePainter, base: RGB, amount: number, seed: number): void {
  const r = rng(seed);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      p.px(x, y, vary(base, amount, r));
    }
  }
}

/** Scatter darker/lighter speckles to mimic ore or rock. */
function speckle(p: TilePainter, color: RGB, chance: number, amount: number, seed: number): void {
  const r = rng(seed);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (r() < chance) p.px(x, y, vary(color, amount, r));
    }
  }
}

function drawStone(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.STONE);
  fillNoise(p, [125, 125, 128], 14, 1001);
  speckle(p, [95, 95, 98], 0.08, 10, 1002);
}

function drawDirt(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.DIRT);
  fillNoise(p, [134, 96, 67], 16, 2001);
}

function drawGrassTop(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.GRASS_TOP);
  fillNoise(p, [95, 159, 53], 18, 3001);
  speckle(p, [80, 140, 45], 0.15, 12, 3002);
}

function drawGrassSide(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.GRASS_SIDE);
  // Dirt body.
  fillNoise(p, [134, 96, 67], 16, 4001);
  // Green strip at the TOP of the tile (small y) -> appears at the block top.
  const r = rng(4002);
  const lip = 4;
  for (let y = 0; y < lip + 1; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      // Ragged lower edge of the grass overhang.
      if (y === lip && r() < 0.5) continue;
      p.px(x, y, vary([95, 159, 53], 16, r));
    }
  }
}

function drawSand(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.SAND);
  fillNoise(p, [219, 209, 160], 10, 5001);
}

function drawWoodTop(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.WOOD_TOP);
  const r = rng(6001);
  const cx = 7.5;
  const cy = 7.5;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const ring = Math.sin(d * 1.6) * 0.5 + 0.5;
      const base: RGB = [150 - ring * 35, 111 - ring * 30, 64 - ring * 18];
      p.px(x, y, vary(base, 6, r));
    }
  }
}

function drawWoodSide(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.WOOD_SIDE);
  const r = rng(7001);
  for (let x = 0; x < TILE_SIZE; x++) {
    // Vertical bark streaks.
    const streak = Math.sin(x * 1.3) * 0.5 + 0.5;
    for (let y = 0; y < TILE_SIZE; y++) {
      const base: RGB = [105 - streak * 22, 75 - streak * 18, 45 - streak * 12];
      p.px(x, y, vary(base, 7, r));
    }
  }
}

function drawLeaves(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.LEAVES);
  const r = rng(8001);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (r() < 0.14) {
        p.clear(x, y); // transparent gaps -> alpha-tested holes
      } else {
        p.px(x, y, vary([60, 120, 40], 26, r));
      }
    }
  }
}

function drawWater(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.WATER);
  fillNoise(p, [55, 105, 200], 16, 9001);
}

function drawPlanks(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.PLANKS);
  const r = rng(10001);
  for (let y = 0; y < TILE_SIZE; y++) {
    const plankEdge = y % 4 === 0;
    for (let x = 0; x < TILE_SIZE; x++) {
      const base: RGB = plankEdge ? [120, 88, 52] : [165, 124, 76];
      p.px(x, y, vary(base, 8, r));
    }
  }
}

function drawCobblestone(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.COBBLESTONE);
  fillNoise(p, [120, 120, 123], 8, 11001);
  const r = rng(11002);
  // Mortar grid lines.
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (x % 5 === 0 || y % 5 === 0) p.px(x, y, vary([85, 85, 88], 6, r));
      else if (r() < 0.1) p.px(x, y, vary([150, 150, 153], 8, r));
    }
  }
}

function drawBedrock(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.BEDROCK);
  fillNoise(p, [70, 70, 73], 28, 12001);
}

function drawGravel(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.GRAVEL);
  fillNoise(p, [122, 110, 104], 22, 13001);
}

function drawSnow(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.SNOW);
  fillNoise(p, [240, 244, 250], 8, 14001);
}

/** Generic ore: stone background with coloured ore blobs. */
function drawOre(ctx: CanvasRenderingContext2D, tile: number, color: RGB, seed: number): void {
  const p = painter(ctx, tile);
  fillNoise(p, [125, 125, 128], 12, seed);
  const r = rng(seed + 1);
  // 4-6 ore clusters.
  const clusters = 4 + Math.floor(r() * 3);
  for (let c = 0; c < clusters; c++) {
    const bx = 1 + Math.floor(r() * (TILE_SIZE - 3));
    const by = 1 + Math.floor(r() * (TILE_SIZE - 3));
    const size = 1 + Math.floor(r() * 2);
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        if (Math.hypot(dx, dy) > size) continue;
        const x = bx + dx;
        const y = by + dy;
        if (x < 0 || x >= TILE_SIZE || y < 0 || y >= TILE_SIZE) continue;
        p.px(x, y, vary(color, 18, r));
      }
    }
  }
}

function drawGlass(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.GLASS);
  // Mostly clear, with a light border frame and a couple of highlight streaks.
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const border = x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
      if (border) {
        p.ctx.fillStyle = 'rgba(200,225,235,0.85)';
      } else if (x === y || x === TILE_SIZE - 1 - y) {
        p.ctx.fillStyle = 'rgba(220,240,250,0.35)';
      } else {
        p.ctx.fillStyle = 'rgba(190,215,225,0.12)';
      }
      p.ctx.fillRect(p.ox + x, p.oy + y, 1, 1);
    }
  }
}

function drawLava(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.LAVA);
  fillNoise(p, [205, 75, 20], 20, 16001);
  speckle(p, [255, 190, 60], 0.12, 30, 16002);
}

function drawCactusSide(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.CACTUS_SIDE);
  fillNoise(p, [70, 120, 55], 10, 17001);
  const r = rng(17002);
  // Vertical ridges + spines.
  for (let y = 0; y < TILE_SIZE; y++) {
    p.px(2, y, vary([55, 95, 45], 6, r));
    p.px(13, y, vary([55, 95, 45], 6, r));
    if (y % 4 === 0) p.px(7, y, 'rgb(220,220,180)');
  }
}

function drawCactusTop(ctx: CanvasRenderingContext2D): void {
  const p = painter(ctx, Tile.CACTUS_TOP);
  fillNoise(p, [80, 135, 60], 10, 18001);
  const r = rng(18002);
  for (let y = 4; y < 12; y++) {
    for (let x = 4; x < 12; x++) {
      p.px(x, y, vary([60, 110, 50], 8, r));
    }
  }
}

/** Paint every block tile onto a freshly-cleared atlas context. */
function drawAllTiles(ctx: CanvasRenderingContext2D): void {
  drawStone(ctx);
  drawDirt(ctx);
  drawGrassTop(ctx);
  drawGrassSide(ctx);
  drawSand(ctx);
  drawWoodTop(ctx);
  drawWoodSide(ctx);
  drawLeaves(ctx);
  drawWater(ctx);
  drawPlanks(ctx);
  drawCobblestone(ctx);
  drawBedrock(ctx);
  drawGravel(ctx);
  drawSnow(ctx);
  drawOre(ctx, Tile.COAL_ORE, [40, 40, 40], 20001);
  drawOre(ctx, Tile.IRON_ORE, [205, 165, 120], 21001);
  drawOre(ctx, Tile.GOLD_ORE, [240, 205, 70], 22001);
  drawOre(ctx, Tile.DIAMOND_ORE, [110, 225, 220], 23001);
  drawGlass(ctx);
  drawLava(ctx);
  drawCactusSide(ctx);
  drawCactusTop(ctx);
}

/** Build and return the shared block texture. */
export function createTextureAtlas(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_TILES * TILE_SIZE;
  canvas.height = ATLAS_TILES * TILE_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawAllTiles(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = false; // matches the UV convention used by ChunkMesher
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Cached full-resolution atlas canvas used to crop hotbar icons. */
let iconSource: HTMLCanvasElement | null = null;

function getIconSource(): HTMLCanvasElement {
  if (iconSource) return iconSource;
  const src = document.createElement('canvas');
  src.width = ATLAS_TILES * TILE_SIZE;
  src.height = ATLAS_TILES * TILE_SIZE;
  const sctx = src.getContext('2d')!;
  drawAllTiles(sctx);
  iconSource = src;
  return src;
}

/**
 * Render a single block tile to a small data URL — handy for the HUD hotbar
 * icons so they always match the in-world textures.
 */
export function tileDataUrl(tile: number, size = 32): string {
  const src = getIconSource();
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = false;
  const sx = (tile % ATLAS_TILES) * TILE_SIZE;
  const sy = Math.floor(tile / ATLAS_TILES) * TILE_SIZE;
  octx.drawImage(src, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, size, size);
  return out.toDataURL();
}
