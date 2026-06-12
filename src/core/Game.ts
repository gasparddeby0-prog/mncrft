/**
 * Game — the orchestrator that wires every subsystem together and runs the
 * main loop.
 *
 * Subsystems: rendering (Engine), input, the three dimensions (DimensionManager
 * over a shared worker pool), environment (sky/weather), the player + block
 * interaction, mobs (EntityManager), the inventory + crafting/furnace/chest UI,
 * interactive block-entities, dimension portals, and persistence.
 */

import * as THREE from 'three';
import { DEFAULT_RENDER_DISTANCE, CHUNK_SIZE } from '../constants';
import { Engine } from './Engine';
import { Input } from './Input';
import { TerrainGenerator } from '../world/TerrainGenerator';
import { BIOME_PROFILES } from '../world/Biome';
import { WorkerPool } from '../workers/WorkerPool';
import { createTextureAtlas } from '../render/TextureAtlas';
import { buildChunkMaterials } from '../render/Materials';
import { Environment, type Weather } from '../render/Environment';
import { BlockHighlight } from '../render/BlockHighlight';
import { EntityManager } from '../entity/EntityManager';
import { Player } from '../player/Player';
import { Interaction, type InteractionHost } from '../player/Interaction';
import { BLOCKS, BlockType } from '../world/Block';
import { HUD, type HotbarEntry } from '../ui/HUD';
import { InventoryUI } from '../ui/InventoryUI';
import { worldToChunk } from '../world/coords';
import { WorldStore, type PlayerSave } from '../persistence/WorldStore';
import { Inventory } from '../item/Inventory';
import { getItem } from '../item/items';
import { itemIcon } from '../item/ItemIcons';
import { FurnaceState, ChestState } from '../item/Containers';
import { DimensionManager } from '../world/dimensions/DimensionManager';
import { Dimension, DIMENSION_NAME } from '../world/dimensions/Dimension';
import type { World } from '../world/World';
import type { ChunkManager } from '../world/ChunkManager';
import type { RaycastHit } from '../player/VoxelRaycaster';

const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
const AUTOSAVE_INTERVAL = 15;
const PORTAL_COOLDOWN = 1.5;

export class Game implements InteractionHost {
  private readonly engine: Engine;
  private readonly input: Input;
  private readonly dimensions: DimensionManager;
  private readonly environment: Environment;
  private readonly player: Player;
  private readonly interaction: Interaction;
  private readonly highlight: BlockHighlight;
  private readonly entities: EntityManager;
  private readonly hud: HUD;
  private readonly inventory = new Inventory();
  private readonly invUI: InventoryUI;
  private readonly store = new WorldStore();
  private readonly generator: TerrainGenerator;
  private readonly pool: WorkerPool;
  private readonly seed: number;

  private readonly furnaces = new Map<string, FurnaceState>();
  private readonly chests = new Map<string, ChestState>();
  private readonly lastPos = new Map<Dimension, THREE.Vector3>();
  private pendingPlatform = false;
  private portalCooldown = 0;

  private readonly overlay: HTMLElement;
  private readonly playButton: HTMLButtonElement;

  private renderDistance = DEFAULT_RENDER_DISTANCE;
  private debugVisible = false;
  private started = false;

  private lastTime = 0;
  private fps = 0;
  private hudTimer = 0;
  private autosaveTimer = 0;
  private readonly tmpVec = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.seed = this.resolveSeed();

    this.engine = new Engine(canvas, { fov: 70 });
    this.input = new Input(canvas);
    this.generator = new TerrainGenerator(this.seed);
    this.pool = new WorkerPool(this.seed);

    const atlas = createTextureAtlas();
    const materials = buildChunkMaterials(atlas);
    this.dimensions = new DimensionManager(this.engine.scene, this.seed, this.pool, materials, this.renderDistance);
    this.dimensions.setPersistence(this.store);

    this.environment = new Environment(this.engine.scene);
    this.highlight = new BlockHighlight();
    this.engine.scene.add(this.highlight.object);

    this.entities = new EntityManager();
    this.engine.scene.add(this.entities.group);

    this.player = new Player(this.dimensions.world);
    this.interaction = new Interaction(this, this.player, this.highlight, this.entities, this.inventory);

    const hudRoot = document.getElementById('hud')!;
    this.hud = new HUD(hudRoot);
    this.invUI = new InventoryUI(hudRoot, this.inventory);
    this.invUI.onClose = () => {
      if (this.started) this.input.requestLock();
      this.refreshHotbar();
    };
    this.overlay = document.getElementById('overlay')!;
    this.playButton = document.getElementById('play-button') as HTMLButtonElement;

    this.player.onDamage = () => this.hud.flashHurt();

    this.applyViewDistance();
  }

  // --- InteractionHost ---
  world(): World {
    return this.dimensions.world;
  }
  chunks(): ChunkManager {
    return this.dimensions.chunks;
  }

  onInteractBlock(hit: RaycastHit): boolean {
    const block = this.world().getBlock(hit.bx, hit.by, hit.bz);
    if (block === BlockType.CRAFTING_TABLE) {
      this.openScreen('crafting');
      return true;
    }
    if (block === BlockType.FURNACE) {
      this.openScreen('furnace', this.getFurnace(hit.bx, hit.by, hit.bz));
      return true;
    }
    if (block === BlockType.CHEST) {
      this.openScreen('chest', this.getChest(hit.bx, hit.by, hit.bz));
      return true;
    }
    return false;
  }

  onUseItem(itemId: string, hit: RaycastHit): boolean {
    if (itemId === 'flint_and_steel') {
      return this.tryIgnitePortal(hit.bx + hit.nx, hit.by + hit.ny, hit.bz + hit.nz);
    }
    return false;
  }

  afterInventoryChange(): void {
    this.refreshHotbar();
  }

  private getFurnace(x: number, y: number, z: number): FurnaceState {
    const key = `${this.dimensions.active}:${x},${y},${z}`;
    let s = this.furnaces.get(key);
    if (!s) {
      s = new FurnaceState();
      this.furnaces.set(key, s);
    }
    return s;
  }

  private getChest(x: number, y: number, z: number): ChestState {
    const key = `${this.dimensions.active}:${x},${y},${z}`;
    let s = this.chests.get(key);
    if (!s) {
      s = new ChestState();
      this.chests.set(key, s);
    }
    return s;
  }

  private openScreen(mode: 'crafting' | 'furnace' | 'chest', container?: FurnaceState | ChestState): void {
    this.input.exitLock();
    this.invUI.openScreen(mode, container);
    this.updateOverlay();
  }

  private resolveSeed(): number {
    const param = new URLSearchParams(location.search).get('seed');
    if (param !== null && param.trim() !== '') {
      const n = Number(param);
      if (Number.isFinite(n)) return Math.floor(n);
      let h = 0;
      for (let i = 0; i < param.length; i++) h = (Math.imul(h, 31) + param.charCodeAt(i)) | 0;
      return h;
    }
    return (Math.random() * 2 ** 31) | 0;
  }

  async start(): Promise<void> {
    await this.store.init(this.seed);
    this.input.attach();

    const save = this.store.playerSave;
    if (save) {
      this.dimensions.setActive((save.dimension as Dimension) ?? Dimension.OVERWORLD);
      this.player.world = this.dimensions.world;
      this.player.setPosition(save.x, save.y, save.z);
      this.player.yaw = save.yaw;
      this.player.pitch = save.pitch;
      this.player.flying = save.flying;
      this.player.health = save.health;
      this.environment.timeOfDay = save.timeOfDay;
      this.environment.setWeather(save.weather as Weather);
      this.inventory.loadJSON(save.inventory);
    } else {
      const h = this.generator.heightAt(0, 0);
      this.player.setPosition(0.5, h + 2, 0.5);
      this.giveStartingItems();
    }

    this.refreshHotbar();
    this.bindControls();
    window.addEventListener('beforeunload', () => this.persist());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persist();
    });

    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private giveStartingItems(): void {
    // A demo kit so every feature is immediately usable.
    const kit: Array<[string, number]> = [
      ['diamond_pickaxe', 1], ['diamond_sword', 1], ['diamond_axe', 1],
      ['cobblestone', 64], ['planks', 64], ['obsidian', 16],
      ['flint_and_steel', 1], ['crafting_table', 1], ['furnace', 1],
      ['glass', 32], ['chest', 1], ['glowstone', 16],
      ['iron_ingot', 16], ['gold_ingot', 8], ['diamond', 8], ['coal', 16],
      ['wood', 16], ['dirt', 64], ['sand', 32], ['end_stone', 16], ['netherrack', 16],
    ];
    for (const [id, count] of kit) {
      if (count > 0 && getItem(id)) this.inventory.add(id, count);
    }
  }

  private bindControls(): void {
    this.playButton.addEventListener('click', () => this.input.requestLock());
    document.addEventListener('pointerlockchange', () => {
      this.started = this.started || this.input.locked;
      this.updateOverlay();
    });
  }

  private updateOverlay(): void {
    this.overlay.classList.toggle('hidden', this.input.locked || this.invUI.open);
  }

  // --- Hotbar ---

  private refreshHotbar(): void {
    const entries: HotbarEntry[] = this.inventory.hotbar.map((stack) => {
      if (!stack) return { iconUrl: null, label: '', count: 0, durability: null };
      const def = getItem(stack.id);
      const maxDur = def?.tool?.durability ?? def?.armor?.durability;
      return {
        iconUrl: itemIcon(stack.id),
        label: def?.name ?? stack.id,
        count: stack.count,
        durability: stack.durability !== undefined && maxDur ? stack.durability / maxDur : null,
      };
    });
    this.hud.updateHotbar(entries);
    this.hud.setSelected(this.inventory.selected);
  }

  // --- Main loop ---

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.1) dt = 0.1;

    this.handleGlobalKeys();
    const playing = this.input.locked && !this.invUI.open;
    if (playing) {
      this.handleInput(dt);
      this.update(dt);
    }
    if (this.started) this.tickContainers(dt);
    if (this.invUI.open) this.invUI.refresh();

    this.engine.render();
    this.updateHud(dt);
    this.updateOverlay();
  };

  /** Keys that work whether or not the pointer is locked (inventory toggle). */
  private handleGlobalKeys(): void {
    if (this.input.consumePress('KeyE')) {
      if (this.invUI.open) this.invUI.close();
      else if (this.input.locked) {
        this.input.exitLock();
        this.invUI.toggleInventory();
      }
    }
    if (this.input.consumePress('Escape') && this.invUI.open) {
      this.invUI.close();
    }
  }

  private handleInput(dt: number): void {
    void dt;
    const input = this.input;

    const mouse = input.consumeMouse();
    if (mouse.dx !== 0 || mouse.dy !== 0) this.player.look(mouse.dx, mouse.dy);

    for (let i = 0; i < DIGIT_CODES.length; i++) {
      if (input.consumePress(DIGIT_CODES[i])) {
        this.inventory.selected = i;
        this.refreshHotbar();
      }
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      const dir = wheel > 0 ? 1 : -1;
      this.inventory.selected = (this.inventory.selected + dir + 9) % 9;
      this.refreshHotbar();
    }

    if (input.consumePress('KeyF')) {
      this.player.toggleFly();
      this.hud.toast(this.player.flying ? 'Fly: ON' : 'Fly: OFF');
    }
    if (input.consumePress('F3')) {
      this.debugVisible = !this.debugVisible;
      this.hud.setDebugVisible(this.debugVisible);
    }
    if (input.consumePress('KeyR')) this.hud.toast(`Weather: ${this.environment.cycleWeather()}`);
    if (input.consumePress('KeyT')) {
      this.environment.timeScale = this.environment.timeScale === 1 ? 60 : 1;
      this.hud.toast(this.environment.timeScale === 1 ? 'Time: normal' : 'Time: fast');
    }
    if (input.consumePress('BracketRight')) this.changeRenderDistance(1);
    if (input.consumePress('BracketLeft')) this.changeRenderDistance(-1);
    // F4: admin dimension cycle (Overworld -> Nether -> End -> ...).
    if (input.consumePress('F4')) {
      const next = ((this.dimensions.active + 1) % 3) as Dimension;
      this.travelTo(next);
    }
  }

  private update(dt: number): void {
    if (this.portalCooldown > 0) this.portalCooldown -= dt;

    const pcx = worldToChunk(this.player.position.x);
    const pcz = worldToChunk(this.player.position.z);
    const spawnReady = this.world().hasChunk(pcx, pcz);

    if (this.pendingPlatform && spawnReady) {
      this.buildSpawnPlatform();
      this.pendingPlatform = false;
    }

    if (spawnReady && !this.pendingPlatform) {
      const input = this.input;
      const move = {
        forward: (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0),
        strafe: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
        jump: input.isDown('Space'),
        sneak: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
        sprint: input.isDown('ControlLeft') || input.isDown('ControlRight'),
      };
      this.player.update(dt, move);
      this.interaction.update(dt, input);
      this.entities.update(dt, this.world(), this.player, this.environment.timeOfDay);
      this.applyArmorAndCheckPortals();

      if (this.player.health <= 0) this.respawn();
    }

    this.player.getEye(this.tmpVec);
    this.engine.camera.position.copy(this.tmpVec);
    this.engine.camera.rotation.set(this.player.pitch, this.player.yaw, 0);

    this.dimensions.update(this.player.position.x, this.player.position.z);
    this.environment.update(dt, this.engine.camera.position);

    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL) {
      this.autosaveTimer = 0;
      void this.persist();
    }
  }

  /** Reduce incoming damage by armour, and trigger portal travel. */
  private applyArmorAndCheckPortals(): void {
    const feet = this.world().getBlock(Math.floor(this.player.position.x), Math.floor(this.player.position.y), Math.floor(this.player.position.z));
    if (this.portalCooldown <= 0) {
      if (feet === BlockType.NETHER_PORTAL) {
        this.travelTo(this.dimensions.active === Dimension.NETHER ? Dimension.OVERWORLD : Dimension.NETHER);
      } else if (feet === BlockType.END_PORTAL) {
        this.travelTo(this.dimensions.active === Dimension.END ? Dimension.OVERWORLD : Dimension.END);
      }
    }
  }

  private tickContainers(dt: number): void {
    for (const furnace of this.furnaces.values()) furnace.tick(dt);
  }

  // --- Dimensions & portals ---

  private travelTo(dim: Dimension): void {
    if (dim === this.dimensions.active) return;
    this.lastPos.set(this.dimensions.active, this.player.position.clone());
    this.portalCooldown = PORTAL_COOLDOWN;

    this.entities.dispose();
    this.dimensions.setActive(dim);
    this.player.world = this.dimensions.world;

    const remembered = this.lastPos.get(dim);
    if (remembered) {
      this.player.setPosition(remembered.x, remembered.y, remembered.z);
      this.pendingPlatform = false;
    } else {
      // First visit: drop in at a safe height and stamp a platform on arrival.
      const y = dim === Dimension.NETHER ? 64 : dim === Dimension.END ? 64 : this.generator.heightAt(0, 0) + 2;
      this.player.setPosition(0.5, y, 0.5);
      this.pendingPlatform = dim !== Dimension.OVERWORLD;
    }
    this.player.velocity.set(0, 0, 0);
    this.hud.toast(`Entered ${DIMENSION_NAME[dim]}`);
  }

  /** Build a guaranteed obsidian platform under the player after dimension travel. */
  private buildSpawnPlatform(): void {
    const world = this.world();
    const px = Math.floor(this.player.position.x);
    const pz = Math.floor(this.player.position.z);
    const py = Math.floor(this.player.position.y);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        world.setBlock(px + dx, py - 1, pz + dz, BlockType.OBSIDIAN);
        for (let dy = 0; dy < 3; dy++) world.setBlock(px + dx, py + dy, pz + dz, BlockType.AIR);
      }
    }
    // Rebuild affected chunks.
    for (let dx = -CHUNK_SIZE; dx <= CHUNK_SIZE; dx += CHUNK_SIZE) {
      for (let dz = -CHUNK_SIZE; dz <= CHUNK_SIZE; dz += CHUNK_SIZE) {
        this.chunks().rebuildForBlock(px + dx, pz + dz);
      }
    }
    this.player.setPosition(px + 0.5, py, pz + 0.5);
  }

  /**
   * Light a Nether portal: flood-fill the air region in a vertical plane and,
   * if it is fully enclosed by obsidian, fill it with portal blocks.
   */
  private tryIgnitePortal(x: number, y: number, z: number): boolean {
    const world = this.world();
    if (world.getBlock(x, y, z) !== BlockType.AIR) return false;

    for (const axis of ['x', 'z'] as const) {
      const cells = this.floodPortalPlane(x, y, z, axis);
      if (cells) {
        for (const c of cells) world.setBlock(c[0], c[1], c[2], BlockType.NETHER_PORTAL);
        const touched = new Set<string>();
        for (const c of cells) {
          const k = `${worldToChunk(c[0])},${worldToChunk(c[2])}`;
          if (!touched.has(k)) {
            touched.add(k);
            this.chunks().rebuildForBlock(c[0], c[2]);
          }
        }
        this.hud.toast('Portal lit');
        return true;
      }
    }
    return false;
  }

  /** Flood the connected air cells in one vertical plane; null if not enclosed by obsidian. */
  private floodPortalPlane(sx: number, sy: number, sz: number, axis: 'x' | 'z'): [number, number, number][] | null {
    const world = this.world();
    const cells: [number, number, number][] = [];
    const seen = new Set<string>();
    const stack: [number, number, number][] = [[sx, sy, sz]];
    const CAP = 60;

    while (stack.length) {
      const [x, y, z] = stack.pop()!;
      const key = `${x},${y},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const b = world.getBlock(x, y, z);
      if (b === BlockType.OBSIDIAN) continue; // frame boundary
      if (b !== BlockType.AIR) return null; // not a clean interior
      cells.push([x, y, z]);
      if (cells.length > CAP) return null; // open / too big

      const neighbours: [number, number, number][] =
        axis === 'x'
          ? [[x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z]]
          : [[x, y, z + 1], [x, y, z - 1], [x, y + 1, z], [x, y - 1, z]];
      for (const n of neighbours) stack.push(n);
    }

    return cells.length >= 2 ? cells : null;
  }

  private respawn(): void {
    if (this.dimensions.active !== Dimension.OVERWORLD) {
      this.travelTo(Dimension.OVERWORLD);
    } else {
      const h = this.generator.heightAt(0, 0);
      this.player.setPosition(0.5, h + 2, 0.5);
    }
    this.player.health = 20;
    this.hud.toast('You died — respawned');
  }

  private changeRenderDistance(delta: number): void {
    this.renderDistance = Math.max(3, Math.min(this.renderDistance + delta, 24));
    this.dimensions.setRenderDistance(this.renderDistance);
    this.applyViewDistance();
    this.hud.toast(`Render distance: ${this.renderDistance}`);
  }

  private applyViewDistance(): void {
    const blocks = this.renderDistance * CHUNK_SIZE;
    this.environment.setFogFar(blocks);
    this.engine.setViewDistance(blocks);
  }

  // --- HUD ---

  private updateHud(dt: number): void {
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.1;
    this.hud.setHealth(this.player.health);

    this.hudTimer += dt;
    if (this.debugVisible && this.hudTimer >= 0.2) {
      this.hudTimer = 0;
      this.hud.setDebugText(this.buildDebugText());
    }
  }

  private buildDebugText(): string {
    const p = this.player.position;
    const cx = worldToChunk(p.x);
    const cz = worldToChunk(p.z);
    const hit = this.interaction.currentHit;
    const looking = hit ? `${BLOCKS[hit.block].name} @ ${hit.bx},${hit.by},${hit.bz}` : '—';
    const held = this.inventory.getSelected();
    const heldName = held ? getItem(held.id)?.name ?? held.id : 'empty hand';

    let biomeLine = 'biome    —';
    if (this.dimensions.active === Dimension.OVERWORLD) {
      const h = this.generator.heightAt(Math.floor(p.x), Math.floor(p.z));
      biomeLine = `biome    ${BIOME_PROFILES[this.generator.biomeAt(Math.floor(p.x), Math.floor(p.z), h)].name}`;
    }

    return [
      `VoxelCraft  (${DIMENSION_NAME[this.dimensions.active]})`,
      `fps      ${this.fps.toFixed(0)}`,
      `xyz      ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}`,
      `chunk    ${cx}, ${cz}`,
      `facing   ${this.facing()}`,
      biomeLine,
      `looking  ${looking}`,
      `held     ${heldName}`,
      `armor    ${this.inventory.totalDefense()} pts`,
      `seed     ${this.seed}`,
      `chunks   ${this.world().loadedChunkCount} loaded`,
      `gen      ${this.pool.pendingCount} pending`,
      `mobs     ${this.entities.count} (${this.entities.hostileCount} hostile)`,
      `time     ${this.environment.clock}  (${this.environment.weather})`,
      `mode     ${this.player.flying ? 'fly' : this.player.onGround ? 'ground' : 'air'}`,
      `keys     E inv · F4 dimension · F fly · R weather`,
    ].join('\n');
  }

  private facing(): string {
    const deg = ((-this.player.yaw * 180) / Math.PI) % 360;
    const a = (deg + 360) % 360;
    if (a < 45 || a >= 315) return 'North (-Z)';
    if (a < 135) return 'East (+X)';
    if (a < 225) return 'South (+Z)';
    return 'West (-X)';
  }

  private async persist(): Promise<void> {
    const save: PlayerSave = {
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      flying: this.player.flying,
      health: this.player.health,
      timeOfDay: this.environment.timeOfDay,
      weather: this.environment.weather,
      dimension: this.dimensions.active,
      inventory: this.inventory.toJSON(),
    };
    await this.store.persistAll(this.dimensions, save);
  }
}
