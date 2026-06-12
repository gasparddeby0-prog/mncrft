/**
 * A small pool of chunk-generation workers.
 *
 * It spreads generation requests across one worker per CPU core (capped), keeps
 * a queue of pending chunks, de-duplicates in-flight requests and invokes a
 * callback with the finished voxel data. Requests carry a dimension id so a
 * single pool serves the overworld, nether and end. This is the multithreading
 * layer that lets every dimension stream in without stalling the render loop.
 */

import type { GeneratedMessage, WorkerRequest } from './messages';

export type GeneratedCallback = (cx: number, cz: number, dimension: number, voxels: Uint8Array) => void;

interface PooledWorker {
  worker: Worker;
  busy: boolean;
}

interface Job {
  cx: number;
  cz: number;
  dimension: number;
}

function jobKey(cx: number, cz: number, dimension: number): string {
  return `${dimension}:${cx},${cz}`;
}

export class WorkerPool {
  private readonly workers: PooledWorker[] = [];
  private readonly queue: Job[] = [];
  private readonly pending = new Set<string>();
  private onGenerated: GeneratedCallback | null = null;

  constructor(seed: number, size?: number) {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const count = Math.max(1, Math.min(size ?? cores, 8));

    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      const pooled: PooledWorker = { worker, busy: false };
      worker.onmessage = (event: MessageEvent<GeneratedMessage>) => {
        const { cx, cz, dimension, voxels } = event.data;
        this.pending.delete(jobKey(cx, cz, dimension));
        pooled.busy = false;
        this.onGenerated?.(cx, cz, dimension, new Uint8Array(voxels));
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

  isPending(cx: number, cz: number, dimension: number): boolean {
    return this.pending.has(jobKey(cx, cz, dimension));
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Queue a chunk for generation (ignored if already pending). */
  request(cx: number, cz: number, dimension: number): void {
    const key = jobKey(cx, cz, dimension);
    if (this.pending.has(key)) return;
    this.pending.add(key);
    this.queue.push({ cx, cz, dimension });
    this.dispatch();
  }

  /** Drop a queued (not yet started) request, e.g. when it scrolls out of range. */
  cancel(cx: number, cz: number, dimension: number): void {
    const key = jobKey(cx, cz, dimension);
    if (!this.pending.has(key)) return;
    const index = this.queue.findIndex((q) => q.cx === cx && q.cz === cz && q.dimension === dimension);
    if (index >= 0) {
      this.queue.splice(index, 1);
      this.pending.delete(key);
    }
  }

  private dispatch(): void {
    for (const pooled of this.workers) {
      if (pooled.busy || this.queue.length === 0) continue;
      const job = this.queue.shift()!;
      pooled.busy = true;
      const msg: WorkerRequest = { type: 'generate', cx: job.cx, cz: job.cz, dimension: job.dimension };
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
