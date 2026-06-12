/// <reference lib="webworker" />
/**
 * Chunk generation worker.
 *
 * Each instance owns its own TerrainGenerator. The main thread spins up a pool
 * of these (one per CPU core) so terrain for many chunks is generated in
 * parallel without ever blocking rendering or input. The generated voxel buffer
 * is transferred (zero-copy) back to the main thread.
 */

import { TerrainGenerator } from '../world/TerrainGenerator';
import type { GeneratedMessage, WorkerRequest } from './messages';

let generator: TerrainGenerator | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    generator = new TerrainGenerator(msg.seed);
    return;
  }

  if (msg.type === 'generate') {
    if (!generator) {
      // Should not happen, but fail loud rather than silently producing air.
      throw new Error('chunkWorker received "generate" before "init"');
    }
    const voxels = generator.generateChunk(msg.cx, msg.cz);
    const buffer = voxels.buffer as ArrayBuffer;
    const response: GeneratedMessage = {
      type: 'generated',
      cx: msg.cx,
      cz: msg.cz,
      voxels: buffer,
    };
    // Transfer the underlying buffer to avoid a copy.
    (self as DedicatedWorkerGlobalScope).postMessage(response, [buffer]);
  }
};
