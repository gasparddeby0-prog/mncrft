/**
 * Heads-up display.
 *
 * Builds and updates the DOM overlay: crosshair, block hotbar (with icons that
 * match the in-world textures), a health bar, a toggleable F3-style debug
 * panel, transient toast messages and a damage vignette. The HUD is pure
 * presentation — the game tells it what to show.
 */

export interface HotbarEntry {
  iconUrl: string | null;
  label: string;
  count: number;
  /** Durability fraction 0..1, or null for non-tools. */
  durability: number | null;
}

export class HUD {
  private readonly root: HTMLElement;
  private hotbarEl!: HTMLElement;
  private healthFill!: HTMLElement;
  private debugEl!: HTMLElement;
  private toastsEl!: HTMLElement;
  private hurtEl!: HTMLElement;
  private slots: HTMLElement[] = [];
  private hurtTimer: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = '';

    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    this.root.appendChild(crosshair);

    const health = document.createElement('div');
    health.className = 'health';
    this.healthFill = document.createElement('div');
    this.healthFill.className = 'health-fill';
    health.appendChild(this.healthFill);
    this.root.appendChild(health);

    this.hotbarEl = document.createElement('div');
    this.hotbarEl.className = 'hotbar';
    this.root.appendChild(this.hotbarEl);
    this.buildHotbarSlots();

    this.debugEl = document.createElement('div');
    this.debugEl.className = 'debug';
    this.root.appendChild(this.debugEl);

    this.toastsEl = document.createElement('div');
    this.toastsEl.className = 'toasts';
    this.root.appendChild(this.toastsEl);

    this.hurtEl = document.createElement('div');
    this.hurtEl.className = 'hurt';
    this.root.appendChild(this.hurtEl);
  }

  /** Build the nine empty hotbar slots once (with their number labels). */
  private buildHotbarSlots(): void {
    this.hotbarEl.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String((i + 1) % 10);
      slot.appendChild(key);
      this.hotbarEl.appendChild(slot);
      this.slots.push(slot);
    }
  }

  /** Update the hotbar from the player's inventory stacks. */
  updateHotbar(entries: HotbarEntry[]): void {
    entries.forEach((entry, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      slot.title = entry.label;
      slot.querySelectorAll('img, .count, .durability').forEach((n) => n.remove());
      if (!entry.iconUrl) return;

      const img = document.createElement('img');
      img.src = entry.iconUrl;
      img.alt = entry.label;
      slot.appendChild(img);

      if (entry.count > 1) {
        const n = document.createElement('span');
        n.className = 'count';
        n.textContent = String(entry.count);
        slot.appendChild(n);
      }
      if (entry.durability !== null) {
        const bar = document.createElement('div');
        bar.className = 'durability';
        bar.style.width = `${Math.max(0, Math.min(1, entry.durability)) * 100}%`;
        slot.appendChild(bar);
      }
    });
  }

  setSelected(index: number): void {
    this.slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === index);
    });
  }

  /** Health 0..20 -> bar fill. */
  setHealth(health: number): void {
    const pct = Math.max(0, Math.min(1, health / 20)) * 100;
    this.healthFill.style.width = `${pct}%`;
  }

  setDebugVisible(visible: boolean): void {
    this.debugEl.classList.toggle('visible', visible);
  }

  setDebugText(text: string): void {
    this.debugEl.textContent = text;
  }

  toast(message: string, durationMs = 1800): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.toastsEl.appendChild(el);
    // Force layout then animate in.
    requestAnimationFrame(() => el.classList.add('show'));
    window.setTimeout(() => {
      el.classList.remove('show');
      window.setTimeout(() => el.remove(), 300);
    }, durationMs);
  }

  flashHurt(): void {
    this.hurtEl.classList.add('show');
    if (this.hurtTimer !== null) window.clearTimeout(this.hurtTimer);
    this.hurtTimer = window.setTimeout(() => this.hurtEl.classList.remove('show'), 150);
  }
}
