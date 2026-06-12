/**
 * Block-entity states for interactive blocks: the smelting furnace and the
 * storage chest. Instances are keyed by world position and ticked by the game
 * while they exist.
 */

import { getItem } from './items';
import { smeltingResult } from './recipes';
import { type ItemStack, makeStack, stackMax } from './Inventory';

export class FurnaceState {
  input: ItemStack | null = null;
  fuel: ItemStack | null = null;
  output: ItemStack | null = null;

  /** Remaining burn time (s) from the current fuel unit. */
  burn = 0;
  burnMax = 0;
  /** Progress (s) cooking the current input. */
  cook = 0;

  static readonly COOK_TIME = 6;

  get lit(): boolean {
    return this.burn > 0;
  }

  tick(dt: number): void {
    const result = this.input ? smeltingResult(this.input.id) : null;
    const canOutput =
      result !== null && (!this.output || (this.output.id === result && this.output.count < stackMax(result)));

    // Light a new fuel unit if we have something smeltable and room for it.
    if (this.burn <= 0 && result && canOutput && this.fuel) {
      const fuelSeconds = getItem(this.fuel.id)?.fuel;
      if (fuelSeconds) {
        this.burn = fuelSeconds;
        this.burnMax = fuelSeconds;
        this.fuel.count -= 1;
        if (this.fuel.count <= 0) this.fuel = null;
      }
    }

    if (this.burn > 0) {
      this.burn -= dt;
      if (result && canOutput) {
        this.cook += dt;
        if (this.cook >= FurnaceState.COOK_TIME) {
          this.cook = 0;
          if (this.output && this.output.id === result) this.output.count += 1;
          else this.output = makeStack(result, 1);
          this.input!.count -= 1;
          if (this.input!.count <= 0) this.input = null;
        }
      } else {
        this.cook = 0;
      }
    } else {
      this.cook = 0;
    }
  }
}

export class ChestState {
  readonly slots: (ItemStack | null)[] = new Array(27).fill(null);
}
