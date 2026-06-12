/* Headless smoke test for the engine's pure-logic + geometry modules.
 * Not part of the app bundle — run with: npm run smoke
 */
import { TerrainGenerator } from '../src/world/TerrainGenerator';
import { SimplexNoise } from '../src/world/noise/SimplexNoise';
import { voxelIndex, worldToChunk, worldToLocal, chunkKey, parseChunkKey } from '../src/world/coords';
import { BlockType, getBlock } from '../src/world/Block';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../src/constants';
import { World } from '../src/world/World';
import { Chunk } from '../src/world/Chunk';
import { raycast } from '../src/player/VoxelRaycaster';
import { ChunkMesher, RenderLayer } from '../src/render/ChunkMesher';

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    failures++;
    console.error('  FAIL:', msg);
  } else {
    console.log('  ok  :', msg);
  }
}

console.log('noise');
const n1 = new SimplexNoise(42);
const n2 = new SimplexNoise(42);
assert(n1.noise2D(1.5, 2.5) === n2.noise2D(1.5, 2.5), 'noise2D deterministic for equal seeds');
assert(Math.abs(n1.noise2D(0.13, 0.27)) <= 1.0001, 'noise2D within [-1,1]');
assert(Math.abs(n1.noise3D(0.13, 0.27, 0.4)) <= 1.0001, 'noise3D within [-1,1]');

console.log('coords');
assert(worldToChunk(-1) === -1, 'worldToChunk(-1) === -1');
assert(worldToChunk(16) === 1, 'worldToChunk(16) === 1');
assert(worldToLocal(-1) === 15, 'worldToLocal(-1) === 15');
assert(parseChunkKey(chunkKey(-3, 7)).cx === -3, 'chunkKey/parseChunkKey roundtrip');
assert(voxelIndex(1, 2, 3) === 1 + CHUNK_SIZE * (3 + CHUNK_SIZE * 2), 'voxelIndex formula');

console.log('terrain generation');
const gen = new TerrainGenerator(1234);
const vox = gen.generateChunk(0, 0);
assert(vox.length === CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT, 'chunk has full volume');

let bedrockBottom = true;
for (let z = 0; z < CHUNK_SIZE; z++) {
  for (let x = 0; x < CHUNK_SIZE; x++) {
    if (vox[voxelIndex(x, 0, z)] !== BlockType.BEDROCK) bedrockBottom = false;
  }
}
assert(bedrockBottom, 'bedrock floor at y=0');

let nonAir = 0;
for (let i = 0; i < vox.length; i++) if (vox[i] !== 0) nonAir++;
assert(nonAir > 5000, `terrain is solid enough (${nonAir} blocks)`);

const vox2 = gen.generateChunk(0, 0);
let identical = true;
for (let i = 0; i < vox.length; i++) {
  if (vox[i] !== vox2[i]) {
    identical = false;
    break;
  }
}
assert(identical, 'generation is deterministic');

const h = gen.heightAt(0, 0);
assert(h > 2 && h < WORLD_HEIGHT - 12, `surface height in range (${h})`);

console.log('world + raycast');
const world = new World(1234);
world.addChunk(new Chunk(0, 0, vox));
let topY = -1;
for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
  const b = world.getBlock(8, y, 8);
  if (b !== 0 && !getBlock(b).liquid) {
    topY = y;
    break;
  }
}
assert(topY > 0, `found a surface column (topY=${topY})`);
const hit = raycast(
  world,
  { x: 8.5, y: topY + 5.5, z: 8.5 } as any,
  { x: 0, y: -1, z: 0 } as any,
  20,
);
assert(hit !== null && hit.by === topY && hit.ny === 1, 'ray downward hits the surface top face');

console.log('mesher');
const mesher = new ChunkMesher(world);
const geo = mesher.build(world.getChunk(0, 0)!);
const solid = geo[RenderLayer.SOLID];
assert(solid !== null && solid.attributes.position.count > 0, 'mesher produced solid geometry');
assert(solid !== null && solid.getAttribute('color').count === solid.getAttribute('position').count, 'color/position attribute counts match');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
if (failures) process.exit(1);
