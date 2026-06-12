/**
 * Typed message contract between the main thread and chunk-generation workers.
 * Kept in its own module so both sides share exactly the same shapes.
 */

/** Sent once to configure a worker with the world seed. */
export interface InitMessage {
  type: 'init';
  seed: number;
}

/** Request to generate the voxel data for a chunk. */
export interface GenerateMessage {
  type: 'generate';
  cx: number;
  cz: number;
}

export type WorkerRequest = InitMessage | GenerateMessage;

/** Worker -> main thread: a freshly generated chunk. */
export interface GeneratedMessage {
  type: 'generated';
  cx: number;
  cz: number;
  /** Transferred Uint8Array buffer with CHUNK_VOLUME bytes. */
  voxels: ArrayBuffer;
}

export type WorkerResponse = GeneratedMessage;
