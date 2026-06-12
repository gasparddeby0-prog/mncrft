/// <reference lib="webworker" />
/**
 * Chunk generation worker.
 *
 * Each instance owns one generator per dimension (overworld, nether, end) and
 * picks the right one based on the dimension carried in each request. The main
 * thread spins up a pool of these (one per CPU core) so terrain for every
 * dimension is generated in parallel without blocking rendering or input. The
 * generated voxel buffer is transferred (zero-copy) back to the main thread.
 */

import { TerrainGenerator } from '../world/TerrainGenerator';
import { NetherGenerator } from '../world/dimensions/NetherGenerator';
import { EndGenerator } from '../world/dimensions/EndGenerator';
import { Dimension, type ChunkGenerator } from '../world/dimensions/Dimension';
import type { GeneratedMessage, WorkerRequest } from './messages';

let generators: Record<number, ChunkGenerator> | null = null;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    generators = {
      [Dimension.OVERWORLD]: new TerrainGenerator(msg.seed),
      [Dimension.NETHER]: new NetherGenerator(msg.seed),
      [Dimension.END]: new EndGenerator(msg.seed),
    };
    return;
  }

  if (msg.type === 'generate') {
    if (!generators) throw new Error('chunkWorker received "generate" before "init"');
    const generator = generators[msg.dimension] ?? generators[Dimension.OVERWORLD];
    const voxels = generator.generateChunk(msg.cx, msg.cz);
    const buffer = voxels.buffer as ArrayBuffer;
    const response: GeneratedMessage = {
      type: 'generated',
      cx: msg.cx,
      cz: msg.cz,
      dimension: msg.dimension,
      voxels: buffer,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(response, [buffer]);
  }
};
