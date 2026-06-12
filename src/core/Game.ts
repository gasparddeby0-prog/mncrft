/**
 * Game — the orchestrator that wires every subsystem together and runs the
 * main loop.
 *
 * Flow:
 *  1. Build the renderer, texture atlas, materials and world subsystems.
 *  2. Open persistent storage, restoring the player + edited chunks if present.
 *  3. On "play", lock the pointer and start the fixed-timestep-ish loop:
 *     input -> player physics -> block interaction -> chunk streaming ->
 *     environment -> render -> HUD.
 *  4. Auto-save periodically and on page exit.
 */

import * as THREE from 'three';
import { DEFAULT_RENDER_DISTANCE, CHUNK_SIZE } from '../constants';
import { Engine } from './Engine';
import { Input } from './Input';
import { World } from '../world/World';
import { ChunkManager } from '../world/ChunkManager';
import { TerrainGenerator } from '../world/TerrainGenerator';
import { BIOME_PROFILES } from '../world/Biome';
import { WorkerPool } from '../workers/WorkerPool';
import { createTextureAtlas, tileDataUrl } from '../render/TextureAtlas';
import { buildChunkMaterials } from '../render/Materials';
import { Environment, type Weather } from '../render/Environment';
import { BlockHighlight } from '../render/BlockHighlight';
import { Player } from '../player/Player';
import { Interaction } from '../player/Interaction';
import { BLOCKS, PLACEABLE_BLOCKS, getBlock } from '../world/Block';
import { HUD, type HotbarItem } from '../ui/HUD';
import { worldToChunk } from '../world/coords';
import { WorldStore, type PlayerSave } from '../persistence/WorldStore';

const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const AUTOSAVE_INTERVAL = 15; // seconds

export class Game {
  private readonly engine: Engine;
  private readonly input: Input;
  private readonly world: World;
  private readonly pool: WorkerPool;
  private readonly chunks: ChunkManager;
  private readonly environment: Environment;
  private readonly player: Player;
  private readonly interaction: Interaction;
  private readonly highlight: BlockHighlight;
  private readonly hud: HUD;
  private readonly store = new WorldStore();
  private readonly generator: TerrainGenerator;
  private readonly seed: number;

  private readonly overlay: HTMLElement;
  private readonly playButton: HTMLButtonElement;

  private renderDistance = DEFAULT_RENDER_DISTANCE;
  private selectedIndex = 0;
  private debugVisible = false;
  private started = false;
  private running = false;

  private lastTime = 0;
  private fps = 0;
  private hudTimer = 0;
  private autosaveTimer = 0;
  private readonly tmpVec = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.seed = this.resolveSeed();

    this.engine = new Engine(canvas, { fov: 70 });
    this.input = new Input(canvas);

    this.world = new World(this.seed);
    this.generator = new TerrainGenerator(this.seed);
    this.pool = new WorkerPool(this.seed);

    const atlas = createTextureAtlas();
    const materials = buildChunkMaterials(atlas);
    this.chunks = new ChunkManager(this.world, this.pool, materials, this.renderDistance);
    this.chunks.setPersistence(this.store);
    this.engine.scene.add(this.chunks.group);

    this.environment = new Environment(this.engine.scene);
    this.highlight = new BlockHighlight();
    this.engine.scene.add(this.highlight.object);

    this.player = new Player(this.world);
    this.interaction = new Interaction(this.world, this.chunks, this.player, this.highlight);

    const hudRoot = document.getElementById('hud')!;
    this.hud = new HUD(hudRoot);
    this.overlay = document.getElementById('overlay')!;
    this.playButton = document.getElementById('play-button') as HTMLButtonElement;

    this.player.onDamage = () => this.hud.flashHurt();

    this.applyViewDistance();
    this.buildHotbar();
  }

  /** Use ?seed= from the URL if present, otherwise a random world. */
  private resolveSeed(): number {
    const param = new URLSearchParams(location.search).get('seed');
    if (param !== null && param.trim() !== '') {
      const n = Number(param);
      if (Number.isFinite(n)) return Math.floor(n);
      // Hash a string seed.
      let h = 0;
      for (let i = 0; i < param.length; i++) h = (Math.imul(h, 31) + param.charCodeAt(i)) | 0;
      return h;
    }
    return (Math.random() * 2 ** 31) | 0;
  }

  async start(): Promise<void> {
    await this.store.init(this.seed);
    this.input.attach();

    // Restore the saved player, or spawn fresh on the surface at (0, 0).
    const save = this.store.playerSave;
    if (save) {
      this.player.setPosition(save.x, save.y, save.z);
      this.player.yaw = save.yaw;
      this.player.pitch = save.pitch;
      this.player.flying = save.flying;
      this.player.health = save.health;
      this.environment.timeOfDay = save.timeOfDay;
      this.environment.setWeather(save.weather as Weather);
      this.selectBlock(PLACEABLE_BLOCKS.indexOf(save.selected));
    } else {
      const h = this.generator.heightAt(0, 0);
      this.player.setPosition(0.5, h + 2, 0.5);
    }

    this.bindControls();
    window.addEventListener('beforeunload', () => this.persist());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.persist();
    });

    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private bindControls(): void {
    this.playButton.addEventListener('click', () => this.input.requestLock());

    document.addEventListener('pointerlockchange', () => {
      this.running = this.input.locked;
      this.started = this.started || this.running;
      this.overlay.classList.toggle('hidden', this.running);
    });
  }

  // --- Hotbar / block selection ---

  private buildHotbar(): void {
    const items: HotbarItem[] = PLACEABLE_BLOCKS.map((id, i) => {
      const def = getBlock(id);
      return {
        tile: def.faces.py,
        iconUrl: tileDataUrl(def.faces.py, 40),
        label: def.name,
        key: String((i + 1) % 10),
      };
    });
    this.hud.setHotbar(items);
    this.selectBlock(0);
  }

  private selectBlock(index: number): void {
    if (index < 0 || index >= PLACEABLE_BLOCKS.length) index = 0;
    this.selectedIndex = index;
    this.interaction.selectedBlock = PLACEABLE_BLOCKS[index];
    this.hud.setSelected(index);
  }

  // --- Main loop ---

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.1) dt = 0.1; // clamp after stalls / tab switches

    if (this.running) {
      this.handleInput(dt);
      this.update(dt);
    }

    this.engine.render();
    this.updateHud(dt);
  };

  private handleInput(dt: number): void {
    void dt;
    const input = this.input;

    // Mouse look.
    const mouse = input.consumeMouse();
    if (mouse.dx !== 0 || mouse.dy !== 0) this.player.look(mouse.dx, mouse.dy);

    // Hotbar selection.
    for (let i = 0; i < DIGIT_CODES.length; i++) {
      if (input.consumePress(DIGIT_CODES[i])) this.selectBlock(i);
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      const dir = wheel > 0 ? 1 : -1;
      const next = (this.selectedIndex + dir + PLACEABLE_BLOCKS.length) % PLACEABLE_BLOCKS.length;
      this.selectBlock(next);
    }

    // Toggles.
    if (input.consumePress('KeyF')) {
      this.player.toggleFly();
      this.hud.toast(this.player.flying ? 'Fly: ON' : 'Fly: OFF');
    }
    if (input.consumePress('F3')) {
      this.debugVisible = !this.debugVisible;
      this.hud.setDebugVisible(this.debugVisible);
    }
    if (input.consumePress('KeyR')) {
      const w = this.environment.cycleWeather();
      this.hud.toast(`Weather: ${w}`);
    }
    if (input.consumePress('KeyT')) {
      this.environment.timeScale = this.environment.timeScale === 1 ? 60 : 1;
      this.hud.toast(this.environment.timeScale === 1 ? 'Time: normal' : 'Time: fast');
    }
    if (input.consumePress('BracketRight')) this.changeRenderDistance(1);
    if (input.consumePress('BracketLeft')) this.changeRenderDistance(-1);
  }

  private update(dt: number): void {
    const pcx = worldToChunk(this.player.position.x);
    const pcz = worldToChunk(this.player.position.z);
    const spawnReady = this.world.hasChunk(pcx, pcz);

    // Freeze physics until the chunk beneath the player exists, so the player
    // doesn't fall through ungenerated space on first load.
    if (spawnReady) {
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

      if (this.player.health <= 0) this.respawn();
    }

    // Camera follows the player's eye.
    this.player.getEye(this.tmpVec);
    this.engine.camera.position.copy(this.tmpVec);
    this.engine.camera.rotation.set(this.player.pitch, this.player.yaw, 0);

    this.chunks.update(this.player.position.x, this.player.position.z);
    this.environment.update(dt, this.engine.camera.position);

    // Auto-save.
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL) {
      this.autosaveTimer = 0;
      void this.persist();
    }
  }

  private respawn(): void {
    const h = this.generator.heightAt(0, 0);
    this.player.setPosition(0.5, h + 2, 0.5);
    this.player.health = 20;
    this.hud.toast('You died — respawned');
  }

  private changeRenderDistance(delta: number): void {
    this.renderDistance = Math.max(3, Math.min(this.renderDistance + delta, 24));
    this.chunks.setRenderDistance(this.renderDistance);
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
    const h = this.generator.heightAt(Math.floor(p.x), Math.floor(p.z));
    const biome = this.generator.biomeAt(Math.floor(p.x), Math.floor(p.z), h);
    const hit = this.interaction.currentHit;
    const looking = hit ? `${BLOCKS[hit.block].name} @ ${hit.bx},${hit.by},${hit.bz}` : '—';

    return [
      'VoxelCraft  (F3 debug)',
      `fps      ${this.fps.toFixed(0)}`,
      `xyz      ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}`,
      `chunk    ${cx}, ${cz}`,
      `facing   ${this.facing()}`,
      `biome    ${BIOME_PROFILES[biome].name}`,
      `looking  ${looking}`,
      `seed     ${this.seed}`,
      `chunks   ${this.world.loadedChunkCount} loaded`,
      `gen      ${this.pool.pendingCount} pending`,
      `mesh Q   ${this.chunks.queuedMeshCount}`,
      `time     ${this.environment.clock}  (${this.environment.weather})`,
      `mode     ${this.player.flying ? 'fly' : this.player.onGround ? 'ground' : 'air'}`,
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
      selected: PLACEABLE_BLOCKS[this.selectedIndex],
      timeOfDay: this.environment.timeOfDay,
      weather: this.environment.weather,
    };
    await this.store.persistAll(this.chunks, save);
  }
}
