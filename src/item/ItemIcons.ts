/**
 * Item icons.
 *
 * Block items crop their icon from the procedural texture atlas (so they match
 * the in-world look). Tools, armour and materials are drawn here as small,
 * recognisable pixel silhouettes tinted by the item's material colour. Results
 * are cached as data URLs.
 */

import { tileDataUrl } from '../render/TextureAtlas';
import { getItem, type ItemDef } from './items';

const cache = new Map<string, string>();
const GRID = 16;
const SCALE = 3; // 48px icons

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function shade(n: number, factor: number): string {
  const r = Math.min(255, ((n >> 16) & 255) * factor) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * factor) | 0;
  const b = Math.min(255, (n & 255) * factor) | 0;
  return `rgb(${r},${g},${b})`;
}

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = GRID * SCALE;
  canvas.height = GRID * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function cell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
}

/** Brown diagonal handle shared by all tools. */
function drawHandle(ctx: CanvasRenderingContext2D): void {
  const wood = '#6b4a2a';
  for (let t = 0; t < 8; t++) cell(ctx, 3 + t, 12 - t, wood);
}

function drawTool(ctx: CanvasRenderingContext2D, kind: string, color: number): void {
  const c = hex(color);
  const edge = shade(color, 0.7);
  drawHandle(ctx);
  if (kind === 'pickaxe') {
    const arc: [number, number][] = [[6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [5, 4], [11, 4], [4, 5], [12, 5]];
    for (const [x, y] of arc) cell(ctx, x, y, c);
    cell(ctx, 8, 4, edge);
  } else if (kind === 'axe') {
    for (let y = 3; y <= 7; y++) for (let x = 9; x <= 12; x++) if (x - 9 <= 7 - y + 3) cell(ctx, x, y, c);
    for (let y = 3; y <= 6; y++) cell(ctx, 9, y, edge);
  } else if (kind === 'shovel') {
    for (let y = 3; y <= 6; y++) for (let x = 9; x <= 11; x++) cell(ctx, x, y, c);
    cell(ctx, 10, 7, c);
    cell(ctx, 9, 3, edge);
  } else {
    // sword: bright blade along the diagonal with a guard.
    for (let t = 0; t < 7; t++) {
      cell(ctx, 7 + t, 8 - t, c);
      cell(ctx, 8 + t, 8 - t, edge);
    }
    cell(ctx, 5, 11, '#555');
    cell(ctx, 6, 10, '#777');
    cell(ctx, 7, 9, '#777');
  }
}

function drawArmor(ctx: CanvasRenderingContext2D, slot: string, color: number): void {
  const c = hex(color);
  const edge = shade(color, 0.7);
  const fillRect = (x0: number, y0: number, x1: number, y1: number, col: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cell(ctx, x, y, col);
  };
  if (slot === 'helmet') {
    fillRect(4, 3, 11, 7, c);
    fillRect(4, 8, 11, 9, edge);
    ctx.clearRect(6 * SCALE, 8 * SCALE, 4 * SCALE, 2 * SCALE); // visor gap
  } else if (slot === 'chest') {
    fillRect(3, 3, 12, 4, c);
    fillRect(4, 5, 11, 12, c);
    fillRect(4, 5, 5, 12, edge);
  } else if (slot === 'legs') {
    fillRect(4, 3, 11, 5, c);
    fillRect(4, 6, 6, 13, c);
    fillRect(9, 6, 11, 13, c);
  } else {
    fillRect(3, 9, 6, 13, c);
    fillRect(9, 9, 12, 13, c);
    fillRect(3, 12, 12, 13, edge);
  }
}

function drawMaterial(ctx: CanvasRenderingContext2D, def: ItemDef): void {
  const color = def.color ?? 0x999999;
  const c = hex(color);
  const edge = shade(color, 0.65);
  const fillRect = (x0: number, y0: number, x1: number, y1: number, col: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cell(ctx, x, y, col);
  };

  switch (def.id) {
    case 'stick':
      for (let t = 0; t < 9; t++) cell(ctx, 4 + t, 12 - t, c);
      break;
    case 'diamond': {
      const rows = [[7, 8], [6, 9], [5, 10], [6, 9], [7, 8]];
      let y = 4;
      for (const [a, b] of rows) {
        for (let x = a; x <= b; x++) cell(ctx, x, y, c);
        y++;
      }
      cell(ctx, 8, 6, '#cffffb');
      break;
    }
    case 'coal':
    case 'flint':
      fillRect(5, 5, 11, 11, c);
      cell(ctx, 6, 6, edge);
      cell(ctx, 9, 9, edge);
      break;
    case 'apple':
      fillRect(5, 5, 11, 11, c);
      fillRect(5, 5, 6, 6, edge);
      cell(ctx, 8, 3, '#3a7a2a'); // stem
      cell(ctx, 8, 4, '#6b4a2a');
      break;
    case 'flint_and_steel':
      fillRect(4, 6, 9, 9, '#9a9a9a'); // steel
      fillRect(8, 9, 11, 12, '#3a3a3a'); // flint
      break;
    default:
      // generic ingot bar
      fillRect(4, 7, 12, 10, c);
      fillRect(4, 7, 12, 7, shade(color, 1.2));
      fillRect(4, 10, 12, 10, edge);
  }
}

export function itemIcon(id: string): string {
  const cached = cache.get(id);
  if (cached) return cached;

  const def = getItem(id);
  let url: string;
  if (def?.category === 'block' && def.tile !== undefined) {
    url = tileDataUrl(def.tile, 48);
  } else {
    const { canvas, ctx } = newCanvas();
    if (def?.category === 'tool' && def.tool) drawTool(ctx, def.tool.kind, def.color ?? 0xffffff);
    else if (def?.category === 'armor' && def.armor) drawArmor(ctx, def.armor.slot, def.color ?? 0xffffff);
    else if (def) drawMaterial(ctx, def);
    url = canvas.toDataURL();
  }
  cache.set(id, url);
  return url;
}
