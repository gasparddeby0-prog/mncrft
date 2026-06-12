/**
 * Inventory / crafting / furnace / chest screen.
 *
 * A single DOM overlay that adapts to four modes:
 *  - inventory : main + hotbar + armour + a 2x2 crafting grid
 *  - crafting  : a full 3x3 crafting grid (opened from a crafting table)
 *  - furnace   : input / fuel / output bound to a FurnaceState
 *  - chest     : 27 storage slots bound to a ChestState
 *
 * Item movement is click-based with a floating "cursor" stack, à la Minecraft:
 * left click picks up / drops / merges a whole stack, right click drops a
 * single item or picks up half. Crafting/furnace result slots are take-only.
 */

import { getItem } from '../item/items';
import { itemIcon } from '../item/ItemIcons';
import { matchCrafting } from '../item/recipes';
import { ARMOR_ORDER, Inventory, type ItemStack, makeStack, stackMax } from '../item/Inventory';
import { ChestState, FurnaceState } from '../item/Containers';

export type ScreenMode = 'inventory' | 'crafting' | 'furnace' | 'chest';

interface SlotView {
  el: HTMLElement;
  get(): ItemStack | null;
  set(s: ItemStack | null): void;
  accept?(s: ItemStack): boolean;
  takeOnly?: boolean;
  onTake?(): void;
}

export class InventoryUI {
  open = false;
  onClose: (() => void) | null = null;

  private mode: ScreenMode = 'inventory';
  private cursor: ItemStack | null = null;
  private craftGrid: (ItemStack | null)[] = [];
  private craftSize = 2;
  private craftResult: ItemStack | null = null;
  private furnace: FurnaceState | null = null;
  private chest: ChestState | null = null;

  private readonly screen: HTMLElement;
  private readonly window: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private slots: SlotView[] = [];

  constructor(root: HTMLElement, private readonly inventory: Inventory) {
    this.screen = document.createElement('div');
    this.screen.className = 'screen';
    this.window = document.createElement('div');
    this.window.className = 'window';
    this.screen.appendChild(this.window);
    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'cursor-item';
    this.screen.appendChild(this.cursorEl);
    root.appendChild(this.screen);

    window.addEventListener('mousemove', this.onMouseMove);
  }

  toggleInventory(): void {
    if (this.open) this.close();
    else this.openScreen('inventory');
  }

  openScreen(mode: ScreenMode, container?: FurnaceState | ChestState): void {
    this.mode = mode;
    this.furnace = container instanceof FurnaceState ? container : null;
    this.chest = container instanceof ChestState ? container : null;
    this.craftSize = mode === 'crafting' ? 3 : 2;
    this.craftGrid = new Array(this.craftSize * this.craftSize).fill(null);
    this.open = true;
    this.screen.classList.add('visible');
    this.build();
  }

  close(): void {
    if (!this.open) return;
    // Return crafting-grid items and the held cursor to the inventory.
    for (const s of this.craftGrid) if (s) this.inventory.add(s.id, s.count);
    this.craftGrid = [];
    if (this.cursor) {
      this.inventory.add(this.cursor.id, this.cursor.count);
      this.cursor = null;
    }
    this.open = false;
    this.screen.classList.remove('visible');
    this.renderCursor();
    this.onClose?.();
  }

  /** Called each frame while open so live containers (furnace) refresh. */
  refresh(): void {
    if (this.open && this.furnace) this.renderAll();
  }

  // --- DOM construction -------------------------------------------------

  private build(): void {
    this.window.innerHTML = '';
    this.slots = [];

    const title = document.createElement('h2');
    title.className = 'window-title';
    title.textContent = { inventory: 'Inventory', crafting: 'Crafting Table', furnace: 'Furnace', chest: 'Chest' }[this.mode];
    this.window.appendChild(title);

    const top = document.createElement('div');
    top.className = 'window-top';
    this.window.appendChild(top);

    if (this.mode === 'inventory') this.buildInventoryTop(top);
    else if (this.mode === 'crafting') this.buildCraftingTop(top, 3);
    else if (this.mode === 'furnace') this.buildFurnaceTop(top);
    else this.buildChestTop(top);

    // Shared player storage: 27 main + 9 hotbar.
    const mainGrid = this.makeGrid(9);
    for (let i = 0; i < 27; i++) {
      mainGrid.appendChild(this.makeSlot({ get: () => this.inventory.main[i], set: (s) => (this.inventory.main[i] = s) }));
    }
    this.window.appendChild(this.section('Inventory', mainGrid));

    const hotGrid = this.makeGrid(9);
    for (let i = 0; i < 9; i++) {
      hotGrid.appendChild(this.makeSlot({ get: () => this.inventory.hotbar[i], set: (s) => (this.inventory.hotbar[i] = s) }));
    }
    this.window.appendChild(this.section('Hotbar', hotGrid));

    this.renderAll();
  }

  private buildInventoryTop(top: HTMLElement): void {
    // Armour column.
    const armorCol = this.makeGrid(1);
    for (let i = 0; i < 4; i++) {
      armorCol.appendChild(
        this.makeSlot({
          get: () => this.inventory.armor[i],
          set: (s) => (this.inventory.armor[i] = s),
          accept: (s) => getItem(s.id)?.armor?.slot === ARMOR_ORDER[i],
        }),
      );
    }
    top.appendChild(this.section('Armor', armorCol));
    top.appendChild(this.buildCraftingTop(document.createElement('div'), 2));
  }

  private buildCraftingTop(container: HTMLElement, size: number): HTMLElement {
    const wrap = container;
    wrap.className = 'craft-wrap';
    const grid = this.makeGrid(size);
    for (let i = 0; i < size * size; i++) {
      grid.appendChild(
        this.makeSlot({
          get: () => this.craftGrid[i],
          set: (s) => {
            this.craftGrid[i] = s;
            this.recomputeCraft();
          },
        }),
      );
    }
    wrap.appendChild(this.section('Craft', grid));

    const resultGrid = this.makeGrid(1);
    resultGrid.appendChild(
      this.makeSlot({
        get: () => this.craftResult,
        set: () => undefined,
        takeOnly: true,
        onTake: () => this.consumeCraft(),
      }),
    );
    wrap.appendChild(this.section('=>', resultGrid));
    return wrap;
  }

  private buildFurnaceTop(top: HTMLElement): void {
    const f = this.furnace!;
    const col = this.makeGrid(1);
    col.appendChild(this.makeSlot({ get: () => f.input, set: (s) => (f.input = s) }));
    col.appendChild(this.makeSlot({ get: () => f.fuel, set: (s) => (f.fuel = s) }));
    top.appendChild(this.section('In / Fuel', col));

    const out = this.makeGrid(1);
    out.appendChild(
      this.makeSlot({
        get: () => f.output,
        set: (s) => (f.output = s),
        takeOnly: true,
        onTake: () => (f.output = null),
      }),
    );
    top.appendChild(this.section('Output', out));
  }

  private buildChestTop(top: HTMLElement): void {
    const c = this.chest!;
    const grid = this.makeGrid(9);
    for (let i = 0; i < c.slots.length; i++) {
      grid.appendChild(this.makeSlot({ get: () => c.slots[i], set: (s) => (c.slots[i] = s) }));
    }
    top.appendChild(this.section('Chest', grid));
  }

  private section(label: string, content: HTMLElement): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'inv-section';
    const h = document.createElement('div');
    h.className = 'inv-label';
    h.textContent = label;
    sec.appendChild(h);
    sec.appendChild(content);
    return sec;
  }

  private makeGrid(cols: number): HTMLElement {
    const g = document.createElement('div');
    g.className = 'inv-grid';
    g.style.gridTemplateColumns = `repeat(${cols}, 48px)`;
    return g;
  }

  private makeSlot(view: Omit<SlotView, 'el'>): HTMLElement {
    const el = document.createElement('div');
    el.className = 'inv-slot';
    const full: SlotView = { ...view, el };
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.handleClick(full, e.button);
    });
    this.slots.push(full);
    return el;
  }

  // --- Click logic ------------------------------------------------------

  private handleClick(view: SlotView, button: number): void {
    if (view.takeOnly) {
      this.takeFromResult(view);
      this.renderAll();
      return;
    }
    if (button === 2) this.rightClick(view);
    else this.leftClick(view);
    this.renderAll();
  }

  private leftClick(view: SlotView): void {
    const slot = view.get();
    const cur = this.cursor;
    if (!cur) {
      if (slot) {
        this.cursor = slot;
        view.set(null);
      }
      return;
    }
    if (view.accept && !view.accept(cur)) return;
    if (!slot) {
      const max = stackMax(cur.id);
      if (cur.count <= max) {
        view.set(cur);
        this.cursor = null;
      } else {
        view.set(makeStack(cur.id, max));
        cur.count -= max;
      }
    } else if (slot.id === cur.id) {
      const max = stackMax(slot.id);
      const moved = Math.min(max - slot.count, cur.count);
      slot.count += moved;
      cur.count -= moved;
      if (cur.count <= 0) this.cursor = null;
    } else {
      view.set(cur);
      this.cursor = slot;
    }
  }

  private rightClick(view: SlotView): void {
    const slot = view.get();
    const cur = this.cursor;
    if (cur) {
      // Drop a single item.
      if (!slot) {
        view.set(makeStack(cur.id, 1));
        cur.count -= 1;
      } else if (slot.id === cur.id && slot.count < stackMax(slot.id)) {
        slot.count += 1;
        cur.count -= 1;
      } else {
        return;
      }
      if (cur.count <= 0) this.cursor = null;
    } else if (slot) {
      // Pick up half.
      const half = Math.ceil(slot.count / 2);
      this.cursor = makeStack(slot.id, half);
      slot.count -= half;
      if (slot.count <= 0) view.set(null);
    }
  }

  private takeFromResult(view: SlotView): void {
    const slot = view.get();
    if (!slot) return;
    const cur = this.cursor;
    if (cur && (cur.id !== slot.id || cur.count + slot.count > stackMax(slot.id))) return;
    if (cur && cur.id === slot.id) cur.count += slot.count;
    else this.cursor = makeStack(slot.id, slot.count);
    view.onTake?.();
  }

  private recomputeCraft(): void {
    const ids = this.craftGrid.map((s) => (s ? s.id : null));
    const res = matchCrafting(ids, this.craftSize);
    this.craftResult = res ? makeStack(res.result, res.count) : null;
  }

  private consumeCraft(): void {
    for (let i = 0; i < this.craftGrid.length; i++) {
      const s = this.craftGrid[i];
      if (s) {
        s.count -= 1;
        if (s.count <= 0) this.craftGrid[i] = null;
      }
    }
    this.recomputeCraft();
  }

  // --- Rendering --------------------------------------------------------

  private renderAll(): void {
    for (const view of this.slots) this.renderSlot(view);
    this.renderCursor();
  }

  private renderSlot(view: SlotView): void {
    const s = view.get();
    view.el.innerHTML = '';
    if (!s) return;
    const img = document.createElement('img');
    img.src = itemIcon(s.id);
    img.alt = s.id;
    view.el.appendChild(img);
    if (s.count > 1) {
      const n = document.createElement('span');
      n.className = 'count';
      n.textContent = String(s.count);
      view.el.appendChild(n);
    }
    if (s.durability !== undefined) {
      const def = getItem(s.id);
      const max = def?.tool?.durability ?? def?.armor?.durability ?? 1;
      const bar = document.createElement('div');
      bar.className = 'durability';
      bar.style.width = `${Math.max(0, Math.min(1, s.durability / max)) * 100}%`;
      view.el.appendChild(bar);
    }
  }

  private renderCursor(): void {
    if (!this.cursor) {
      this.cursorEl.style.display = 'none';
      return;
    }
    this.cursorEl.style.display = 'block';
    this.cursorEl.innerHTML = '';
    const img = document.createElement('img');
    img.src = itemIcon(this.cursor.id);
    this.cursorEl.appendChild(img);
    if (this.cursor.count > 1) {
      const n = document.createElement('span');
      n.className = 'count';
      n.textContent = String(this.cursor.count);
      this.cursorEl.appendChild(n);
    }
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.open || !this.cursor) return;
    this.cursorEl.style.left = `${e.clientX + 8}px`;
    this.cursorEl.style.top = `${e.clientY + 8}px`;
  };
}
