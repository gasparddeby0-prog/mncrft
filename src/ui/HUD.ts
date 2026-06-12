/**
 * Heads-up display.
 *
 * Builds and updates the DOM overlay: crosshair, block hotbar (with icons that
 * match the in-world textures), a health bar, a toggleable F3-style debug
 * panel, transient toast messages and a damage vignette. The HUD is pure
 * presentation — the game tells it what to show.
 */

export interface HotbarItem {
  tile: number;
  iconUrl: string;
  label: string;
  key: string;
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

  /** Populate the hotbar with block icons. */
  setHotbar(items: HotbarItem[]): void {
    this.hotbarEl.innerHTML = '';
    this.slots = items.map((item) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.title = item.label;

      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = item.key;
      slot.appendChild(key);

      const img = document.createElement('img');
      img.src = item.iconUrl;
      img.alt = item.label;
      slot.appendChild(img);

      this.hotbarEl.appendChild(slot);
      return slot;
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
