/**
 * Player inventory: 9-slot hotbar, 27-slot main store and 4 armour slots.
 *
 * Transient containers (the crafting grid, furnace and chests) keep their own
 * stack arrays; this class is the persistent player storage. It handles
 * stacking on insert, the selected hotbar slot, armour equipping and the total
 * defense used by the damage model.
 */

import { getItem } from './items';

export interface ItemStack {
  id: string;
  count: number;
  /** Remaining durability for tools/armour (undefined for stackables). */
  durability?: number;
}

export const ARMOR_ORDER = ['helmet', 'chest', 'legs', 'boots'] as const;

export function stackMax(id: string): number {
  return getItem(id)?.maxStack ?? 64;
}

/** Create a stack, initialising durability for tools/armour. */
export function makeStack(id: string, count = 1): ItemStack {
  const def = getItem(id);
  const dur = def?.tool?.durability ?? def?.armor?.durability;
  return dur !== undefined ? { id, count, durability: dur } : { id, count };
}

export class Inventory {
  readonly hotbar: (ItemStack | null)[] = new Array(9).fill(null);
  readonly main: (ItemStack | null)[] = new Array(27).fill(null);
  readonly armor: (ItemStack | null)[] = new Array(4).fill(null);
  selected = 0;

  getSelected(): ItemStack | null {
    return this.hotbar[this.selected];
  }

  /**
   * Add items, stacking onto existing matching stacks first, then into empty
   * slots (hotbar before main). Returns the count that didn't fit.
   */
  add(id: string, count: number): number {
    const max = stackMax(id);
    const slots = [this.hotbar, this.main];

    // Pass 1: top up existing stacks.
    for (const arr of slots) {
      for (let i = 0; i < arr.length && count > 0; i++) {
        const s = arr[i];
        if (s && s.id === id && s.count < max) {
          const room = max - s.count;
          const moved = Math.min(room, count);
          s.count += moved;
          count -= moved;
        }
      }
    }
    // Pass 2: fill empty slots.
    for (const arr of slots) {
      for (let i = 0; i < arr.length && count > 0; i++) {
        if (!arr[i]) {
          const moved = Math.min(max, count);
          arr[i] = makeStack(id, moved);
          count -= moved;
        }
      }
    }
    return count;
  }

  /** Remove one item from the selected hotbar slot (used when placing blocks). */
  decrementSelected(amount = 1): void {
    const s = this.hotbar[this.selected];
    if (!s) return;
    s.count -= amount;
    if (s.count <= 0) this.hotbar[this.selected] = null;
  }

  /** Damage the selected tool by one point; break it at zero. */
  damageSelectedTool(): void {
    const s = this.hotbar[this.selected];
    if (!s || s.durability === undefined) return;
    s.durability -= 1;
    if (s.durability <= 0) this.hotbar[this.selected] = null;
  }

  /** Sum of equipped armour defense points (0..20). */
  totalDefense(): number {
    let total = 0;
    for (const s of this.armor) {
      if (s) total += getItem(s.id)?.armor?.defense ?? 0;
    }
    return total;
  }

  /** Count how many of an item the player holds (hotbar + main). */
  count(id: string): number {
    let n = 0;
    for (const arr of [this.hotbar, this.main]) {
      for (const s of arr) if (s && s.id === id) n += s.count;
    }
    return n;
  }

  toJSON(): unknown {
    return {
      hotbar: this.hotbar,
      main: this.main,
      armor: this.armor,
      selected: this.selected,
    };
  }

  loadJSON(data: any): void {
    if (!data) return;
    const copy = (src: any[], dst: (ItemStack | null)[]) => {
      for (let i = 0; i < dst.length; i++) {
        const s = src?.[i];
        dst[i] = s && s.id ? { id: s.id, count: s.count, durability: s.durability } : null;
      }
    };
    copy(data.hotbar, this.hotbar);
    copy(data.main, this.main);
    copy(data.armor, this.armor);
    this.selected = typeof data.selected === 'number' ? data.selected : 0;
  }
}
