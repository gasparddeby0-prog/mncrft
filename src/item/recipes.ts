/**
 * Crafting and smelting recipes.
 *
 * Crafting recipes come in two flavours:
 *  - shaped:    the ingredients must form a specific pattern (matched anywhere
 *               in the grid, with separate entries for mirrored variants).
 *  - shapeless: any arrangement of the listed ingredients.
 *
 * Tool and armour recipes are generated programmatically for every material
 * tier. Smelting is a simple input → output map gated by furnace fuel.
 */

export interface CraftResult {
  result: string;
  count: number;
}

interface ShapedRecipe {
  type: 'shaped';
  pattern: string[];
  key: Record<string, string>;
  result: string;
  count: number;
}

interface ShapelessRecipe {
  type: 'shapeless';
  ingredients: string[];
  result: string;
  count: number;
}

const SHAPED: ShapedRecipe[] = [];
const SHAPELESS: ShapelessRecipe[] = [];

function shaped(pattern: string[], key: Record<string, string>, result: string, count = 1): void {
  SHAPED.push({ type: 'shaped', pattern, key, result, count });
}
function shapeless(ingredients: string[], result: string, count = 1): void {
  SHAPELESS.push({ type: 'shapeless', ingredients, result, count });
}

// --- Base recipes ---
shapeless(['wood'], 'planks', 4);
shaped(['P', 'P'], { P: 'planks' }, 'stick', 4);
shaped(['PP', 'PP'], { P: 'planks' }, 'crafting_table', 1);
shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace', 1);
shaped(['PPP', 'P P', 'PPP'], { P: 'planks' }, 'chest', 1);
shapeless(['iron_ingot', 'flint'], 'flint_and_steel', 1);

// --- Tools (material -> crafting ingredient) ---
const TOOL_INGREDIENT: Record<string, string> = {
  wood: 'planks',
  stone: 'cobblestone',
  iron: 'iron_ingot',
  gold: 'gold_ingot',
  diamond: 'diamond',
};

for (const [material, X] of Object.entries(TOOL_INGREDIENT)) {
  const key = { X, S: 'stick' };
  shaped(['XXX', ' S ', ' S '], key, `${material}_pickaxe`);
  shaped(['XX', 'XS', ' S'], key, `${material}_axe`);
  shaped(['XX', 'SX', 'S '], key, `${material}_axe`); // mirrored
  shaped(['X', 'S', 'S'], key, `${material}_shovel`);
  shaped(['X', 'X', 'S'], key, `${material}_sword`);
}

// --- Armor (iron / gold / diamond) ---
const ARMOR_INGREDIENT: Record<string, string> = {
  iron: 'iron_ingot',
  gold: 'gold_ingot',
  diamond: 'diamond',
};

for (const [material, X] of Object.entries(ARMOR_INGREDIENT)) {
  const key = { X };
  shaped(['XXX', 'X X'], key, `${material}_helmet`);
  shaped(['X X', 'XXX', 'XXX'], key, `${material}_chest`);
  shaped(['XXX', 'X X', 'X X'], key, `${material}_legs`);
  shaped(['X X', 'X X'], key, `${material}_boots`);
}

// --- Smelting ---
const SMELTING = new Map<string, string>([
  ['iron_ore', 'iron_ingot'],
  ['gold_ore', 'gold_ingot'],
  ['sand', 'glass'],
  ['cobblestone', 'stone'],
]);

export function smeltingResult(input: string): string | null {
  return SMELTING.get(input) ?? null;
}

// --- Matching ---

interface Grid2D {
  w: number;
  h: number;
  cells: (string | null)[][];
}

/** Crop a flat grid of size×size down to the bounding box of its non-null cells. */
function cropGrid(flat: (string | null)[], size: number): Grid2D | null {
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (flat[y * size + x]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null; // empty
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const cells: (string | null)[][] = [];
  for (let y = 0; y < h; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < w; x++) row.push(flat[(y + minY) * size + (x + minX)] ?? null);
    cells.push(row);
  }
  return { w, h, cells };
}

/** Turn a shaped recipe's pattern into the same cropped 2D form. */
function patternToGrid(pattern: string[], key: Record<string, string>): Grid2D {
  const cells = pattern.map((row) => [...row].map((ch) => (ch === ' ' ? null : key[ch] ?? null)));
  return { w: cells[0].length, h: cells.length, cells };
}

function gridsEqual(a: Grid2D, b: Grid2D): boolean {
  if (a.w !== b.w || a.h !== b.h) return false;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      if (a.cells[y][x] !== b.cells[y][x]) return false;
    }
  }
  return true;
}

/**
 * Match a flat crafting grid (size×size, row-major, item ids or null) against
 * all known recipes. Returns the produced item + count, or null.
 */
export function matchCrafting(flat: (string | null)[], size: number): CraftResult | null {
  const cropped = cropGrid(flat, size);
  if (!cropped) return null;

  for (const r of SHAPED) {
    if (gridsEqual(cropped, patternToGrid(r.pattern, r.key))) {
      return { result: r.result, count: r.count };
    }
  }

  // Shapeless: compare the multiset of non-null items.
  const items = flat.filter((i): i is string => i !== null).sort();
  for (const r of SHAPELESS) {
    const need = [...r.ingredients].sort();
    if (need.length === items.length && need.every((v, i) => v === items[i])) {
      return { result: r.result, count: r.count };
    }
  }
  return null;
}
