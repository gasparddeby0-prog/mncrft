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
import { Cow, Zombie } from '../src/entity/mobs';
import { EntityManager } from '../src/entity/EntityManager';
import { Player } from '../src/player/Player';
import { matchCrafting } from '../src/item/recipes';
import { Inventory, makeStack } from '../src/item/Inventory';
import { NetherGenerator } from '../src/world/dimensions/NetherGenerator';
import { EndGenerator } from '../src/world/dimensions/EndGenerator';

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

console.log('entities');
function surfaceY(x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
    if (world.isSolid(Math.floor(x), y, Math.floor(z))) return y;
  }
  return 0;
}

// A cow dropped above the ground should fall and settle on the surface.
const cow = new Cow();
const cowSurface = surfaceY(8.5, 8.5);
cow.setPosition(8.5, cowSurface + 4, 8.5);
const ctx = { world, player: new Player(world), timeOfDay: 0.25 };
ctx.player.setPosition(8.5, cowSurface + 1, 8.5);
for (let i = 0; i < 180; i++) cow.update(1 / 60, ctx as any);
assert(cow.onGround, 'cow lands on the ground');
assert(Math.abs(cow.position.y - (cowSurface + 1)) < 0.2, `cow rests on the surface (y=${cow.position.y.toFixed(2)}, surface+1=${cowSurface + 1})`);

// A zombie should move toward a nearby player.
const zombie = new Zombie();
const zStart = surfaceY(2.5, 2.5);
zombie.setPosition(2.5, zStart + 1, 2.5);
const target = new Player(world);
const pSurface = surfaceY(13.5, 13.5);
target.setPosition(13.5, pSurface + 1, 13.5);
const zctx = { world, player: target, timeOfDay: 0.75 };
const startDist = Math.hypot(target.position.x - zombie.position.x, target.position.z - zombie.position.z);
for (let i = 0; i < 60; i++) zombie.update(1 / 60, zctx as any);
const endDist = Math.hypot(target.position.x - zombie.position.x, target.position.z - zombie.position.z);
assert(endDist < startDist - 0.3, `zombie chases the player (dist ${startDist.toFixed(2)} -> ${endDist.toFixed(2)})`);

// EntityManager raycast should hit an entity in the line of fire.
const manager = new EntityManager();
const targetCow = new Cow();
targetCow.setPosition(0, 0, -3);
manager.addEntity(targetCow);
const eHit = manager.raycast(
  { x: 0, y: 0.7, z: 0 } as any,
  { x: 0, y: 0, z: -1 } as any,
  5,
);
assert(eHit !== null && eHit.entity === targetCow, 'entity raycast hits a mob in front');

// Damage + knockback kills and flags the entity dead.
const victim = new Cow();
victim.setPosition(0, 0, 0);
victim.damage(100, 0, 1);
assert(victim.dead, 'lethal damage marks the entity dead');

console.log('crafting recipes');
assert(matchCrafting(['wood', null, null, null], 2)?.result === 'planks', 'wood -> planks (shapeless)');
assert(matchCrafting(['planks', null, 'planks', null], 2)?.result === 'stick', '2 planks -> sticks');
const pick = matchCrafting(['diamond', 'diamond', 'diamond', null, 'stick', null, null, 'stick', null], 3);
assert(pick?.result === 'diamond_pickaxe', '3x3 -> diamond pickaxe');
const furnace = matchCrafting(
  ['cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', null, 'cobblestone', 'cobblestone', 'cobblestone', 'cobblestone'],
  3,
);
assert(furnace?.result === 'furnace', '8 cobblestone -> furnace');

console.log('inventory');
const inv = new Inventory();
const leftover = inv.add('cobblestone', 70);
assert(leftover === 0 && inv.count('cobblestone') === 70, 'stacking across slots (70 cobblestone)');
inv.selected = 0;
inv.decrementSelected();
assert(inv.count('cobblestone') === 69, 'decrement selected stack');
inv.armor[0] = makeStack('diamond_helmet');
inv.armor[1] = makeStack('diamond_chest');
inv.armor[2] = makeStack('diamond_legs');
inv.armor[3] = makeStack('diamond_boots');
assert(inv.totalDefense() === 20, 'full diamond armour = 20 defense points');

console.log('nether & end generation');
const nether = new NetherGenerator(1).generateChunk(0, 0);
let netherrack = 0;
let lava = 0;
for (let i = 0; i < nether.length; i++) {
  if (nether[i] === BlockType.NETHERRACK) netherrack++;
  if (nether[i] === BlockType.LAVA) lava++;
}
assert(netherrack > 2000, `nether is full of netherrack (${netherrack})`);
assert(lava > 0, `nether has lava (${lava})`);

const end = new EndGenerator(1).generateChunk(0, 0);
let endStone = 0;
for (let i = 0; i < end.length; i++) if (end[i] === BlockType.END_STONE) endStone++;
assert(endStone > 100, `end island exists near origin (${endStone})`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
if (failures) process.exit(1);
