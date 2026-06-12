/**
 * A small pool of chunk-generation workers.
 *
 * It spreads generation requests across one worker per CPU core (capped), keeps
 * a queue of pending chunks, de-duplicates in-flight requests and invokes a
 * callback with the finished voxel data. This is the multithreading layer that
 * lets the world stream in without stalling the render loop.
 */

import { chunkKey } from '../world/coords';
import type { GeneratedMessage, WorkerRequest } from './messages';

export type GeneratedCallback = (cx: number, cz: number, voxels: Uint8Array) => void;

interface PooledWorker {
  worker: Worker;
  busy: boolean;
}

export class WorkerPool {
  private readonly workers: PooledWorker[] = [];
  private readonly queue: Array<{ cx: number; cz: number }> = [];
  private readonly pending = new Set<string>();
  private onGenerated: GeneratedCallback | null = null;

  constructor(seed: number, size?: number) {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const count = Math.max(1, Math.min(size ?? cores, 8));

    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), {
        type: 'module',
      });
      const pooled: PooledWorker = { worker, busy: false };
      worker.onmessage = (event: MessageEvent<GeneratedMessage>) => {
        const { cx, cz, voxels } = event.data;
        this.pending.delete(chunkKey(cx, cz));
        pooled.busy = false;
        this.onGenerated?.(cx, cz, new Uint8Array(voxels));
        this.dispatch();
      };
      const init: WorkerRequest = { type: 'init', seed };
      worker.postMessage(init);
      this.workers.push(pooled);
    }
  }

  setCallback(cb: GeneratedCallback): void {
    this.onGenerated = cb;
  }

  /** True if a chunk is already queued or being generated. */
  isPending(cx: number, cz: number): boolean {
    return this.pending.has(chunkKey(cx, cz));
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Queue a chunk for generation (ignored if already pending). */
  request(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.pending.has(key)) return;
    this.pending.add(key);
    this.queue.push({ cx, cz });
    this.dispatch();
  }

  /** Drop a queued (not yet started) request, e.g. when it scrolls out of range. */
  cancel(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (!this.pending.has(key)) return;
    const index = this.queue.findIndex((q) => q.cx === cx && q.cz === cz);
    if (index >= 0) {
      this.queue.splice(index, 1);
      this.pending.delete(key);
    }
    // If it is already running in a worker we simply let it finish.
  }

  /** Assign queued work to any idle workers. */
  private dispatch(): void {
    for (const pooled of this.workers) {
      if (pooled.busy || this.queue.length === 0) continue;
      const job = this.queue.shift()!;
      pooled.busy = true;
      const msg: WorkerRequest = { type: 'generate', cx: job.cx, cz: job.cz };
      pooled.worker.postMessage(msg);
    }
  }

  dispose(): void {
    for (const pooled of this.workers) pooled.worker.terminate();
    this.workers.length = 0;
    this.queue.length = 0;
    this.pending.clear();
  }
}
