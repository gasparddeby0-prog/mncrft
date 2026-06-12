/**
 * World persistence using IndexedDB.
 *
 * Stores two kinds of data, namespaced by world seed:
 *  - 'chunks': the full voxel array of every chunk the player has *edited*
 *    (untouched chunks are regenerated deterministically from the seed, so they
 *    cost no storage).
 *  - 'meta':   player position/orientation, time of day, weather and selected
 *    block, so a session resumes exactly where it left off.
 *
 * IndexedDB is asynchronous, but ChunkManager needs a *synchronous* lookup when
 * deciding what to load. We bridge this by loading all of a seed's edited
 * chunks into an in-memory cache during `init()`, serving `load()` from that
 * cache, and writing changes back to disk on a debounced flush.
 */

import type { ChunkPersistence } from '../world/ChunkManager';
import type { Chunk } from '../world/Chunk';
import { chunkKey } from '../world/coords';

const DB_NAME = 'voxelcraft';
const DB_VERSION = 1;
const CHUNK_STORE = 'chunks';
const META_STORE = 'meta';

export interface PlayerSave {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flying: boolean;
  health: number;
  timeOfDay: number;
  weather: string;
  dimension: number;
  inventory: unknown;
}

export class WorldStore implements ChunkPersistence {
  private db: IDBDatabase | null = null;
  private seed = 0;
  private readonly cache = new Map<string, Uint8Array>();
  private readonly dirtyKeys = new Set<string>();
  private flushTimer: number | null = null;
  playerSave: PlayerSave | null = null;

  /** Open the database and preload this seed's edited chunks + player state. */
  async init(seed: number): Promise<void> {
    this.seed = seed;
    this.db = await this.open();
    await this.preloadChunks();
    this.playerSave = await this.readMeta();
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CHUNK_STORE)) db.createObjectStore(CHUNK_STORE);
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private keyFor(cx: number, cz: number): string {
    return `${this.seed}:${cx}:${cz}`;
  }

  private preloadChunks(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(CHUNK_STORE, 'readonly');
      const store = tx.objectStore(CHUNK_STORE);
      const range = IDBKeyRange.bound(`${this.seed}:`, `${this.seed}:\uffff`);
      const cursorReq = store.openCursor(range);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const parts = String(cursor.key).split(':');
          const cx = Number(parts[1]);
          const cz = Number(parts[2]);
          this.cache.set(chunkKey(cx, cz), new Uint8Array(cursor.value as ArrayBuffer));
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private readMeta(): Promise<PlayerSave | null> {
    return new Promise((resolve) => {
      if (!this.db) return resolve(null);
      const tx = this.db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(this.seed);
      req.onsuccess = () => resolve((req.result as PlayerSave) ?? null);
      req.onerror = () => resolve(null);
    });
  }

  // --- ChunkPersistence implementation ---

  /** Synchronous lookup from the in-memory cache (a copy, so edits stay isolated). */
  load(cx: number, cz: number): Uint8Array | null {
    const cached = this.cache.get(chunkKey(cx, cz));
    return cached ? cached.slice() : null;
  }

  /** Cache a modified chunk and schedule a debounced write to disk. */
  save(chunk: Chunk): void {
    const key = chunkKey(chunk.cx, chunk.cz);
    this.cache.set(key, chunk.voxels.slice());
    this.dirtyKeys.add(key);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 1500);
  }

  /** Write all dirty chunks to IndexedDB in a single transaction. */
  flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db || this.dirtyKeys.size === 0) return resolve();
      const tx = this.db.transaction(CHUNK_STORE, 'readwrite');
      const store = tx.objectStore(CHUNK_STORE);
      for (const key of this.dirtyKeys) {
        const data = this.cache.get(key);
        if (!data) continue;
        const [cx, cz] = key.split(',').map(Number);
        // Store a copy of the buffer so the cached Uint8Array isn't detached.
        store.put(data.slice().buffer, this.keyFor(cx, cz));
      }
      this.dirtyKeys.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  savePlayer(save: PlayerSave): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(save, this.seed);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Persist everything now (used by auto-save and before unload). */
  async persistAll(manager: { saveAllModified(): void }, player: PlayerSave): Promise<void> {
    manager.saveAllModified();
    await this.flush();
    await this.savePlayer(player);
  }

  /** Erase this seed's saved chunks and metadata. */
  clearWorld(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction([CHUNK_STORE, META_STORE], 'readwrite');
      const chunkStore = tx.objectStore(CHUNK_STORE);
      const range = IDBKeyRange.bound(`${this.seed}:`, `${this.seed}:\uffff`);
      const cursorReq = chunkStore.openCursor(range);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.objectStore(META_STORE).delete(this.seed);
      this.cache.clear();
      this.dirtyKeys.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
