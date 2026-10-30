import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

globalThis.window = { location: { search: '' }, devicePixelRatio: 1 };
const temporary = await mkdtemp(new URL('../.startup-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: { contents: `
  export { AssetLoader } from './src/loaders/AssetLoader';
  export { ASSETS, STARTUP_ASSETS } from './src/loaders/AssetManifest';
  export { NpcManager } from './src/world/npc/NpcManager';
  export { World } from './src/world/World';
  export { Player } from './src/world/player/Player';
  export { HouseInterior } from './src/world/house/HouseInterior';
  export { AnimatedBook3D } from './src/world/house/AnimatedBook3D';
`, resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle,
  bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { AssetLoader, ASSETS, STARTUP_ASSETS, NpcManager, World, Player, HouseInterior, AnimatedBook3D } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function asset() {
  return { scene: new THREE.Group(), animations: [new THREE.AnimationClip('clip', 1, [])] };
}
function instrumentLoader(t, load) {
  const original = AssetLoader.prototype.loadGLB;
  AssetLoader.prototype.loadGLB = async function(url) {
    const result = await load(url, this.gltfLoader.manager);
    this.onAssetReady?.(url);
    return result;
  };
  t.after(() => { AssetLoader.prototype.loadGLB = original; });
}

test('startup waits for Frequenc and its clips, constructs it once, and leaves the other models optional', async t => {
  const model = deferred(), lastClip = deferred(), requests = [], ready = [];
  const startupManager = new THREE.LoadingManager();
  instrumentLoader(t, async (url, manager) => {
    requests.push({ url, manager });
    if (url === ASSETS.characters.frequenc) return model.promise;
    if (url === ASSETS.npcAnimations.talking3) return lastClip.promise;
    return asset();
  });
  const scene = new THREE.Scene();
  const npcs = new NpcManager(scene, startupManager, url => ready.push(url));
  const first = npcs.loadStartup();
  assert.equal(npcs.loadStartup(), first);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(({ url, manager }) => STARTUP_ASSETS.includes(url) && manager === startupManager));
  assert.ok(!STARTUP_ASSETS.includes(ASSETS.house));
  assert.ok(!STARTUP_ASSETS.includes(ASSETS.bookAnimated));
  model.resolve(asset()); await tick();
  assert.equal(npcs.npcs.length, 0, 'a parsed model must wait for its animation dependencies');
  lastClip.resolve(asset()); await first;
  const frequenc = npcs.npcs[0];
  assert.equal(frequenc.id, 'frequenc');
  assert.equal(frequenc.model.parent, scene);
  assert.equal(new Set(ready).size, 5);
  const background = npcs.load();
  assert.equal(npcs.load(), background); await background;
  await npcs.loadStartup();
  assert.equal(npcs.npcs.length, 7);
  assert.equal(npcs.npcs[0], frequenc);
  assert.equal(requests.filter(({ url }) => url === ASSETS.characters.frequenc).length, 1);
  assert.equal(ready.length, 5, 'background models must not report startup progress');
  assert.ok(requests.slice(5).every(({ manager }) => manager !== startupManager));
});

test('an optional NPC failure keeps Frequenc visible and retries without duplicate models or clips', async t => {
  const requests = [], ready = [];
  let fail = true;
  instrumentLoader(t, async url => {
    requests.push(url);
    if (url === ASSETS.characters.mtc && fail) { fail = false; throw new Error('optional download failed'); }
    return asset();
  });
  const npcs = new NpcManager(new THREE.Scene(), new THREE.LoadingManager(), url => ready.push(url));
  await npcs.loadStartup();
  const frequenc = npcs.npcs[0];
  await assert.rejects(npcs.load(), /optional download failed/);
  assert.deepEqual(npcs.npcs, [frequenc]);
  await npcs.load();
  assert.equal(new Set(npcs.npcs.map(npc => npc.id)).size, 7);
  for (const url of [ASSETS.characters.frequenc, ...Object.values(ASSETS.npcAnimations)]) {
    assert.equal(requests.filter(request => request === url).length, 1);
  }
  assert.equal(ready.length, 5);
});

test('the house starts with the world but neither a slow house nor its failure blocks startup', async t => {
  const house = deferred(), frequenc = deferred(), requests = [];
  const environment = asset();
  for (const id of ['01', '02']) {
    const zone = new THREE.Mesh(new THREE.BoxGeometry()); zone.name = `ZONE_STAIRS_${id}`;
    const bottom = new THREE.Object3D(); bottom.name = `STAIRS_BOTTOM_${id}`;
    const top = new THREE.Object3D(); top.name = `STAIRS_TOP_${id}`; top.position.set(1, 1, 0);
    environment.scene.add(zone, bottom, top);
  }
  instrumentLoader(t, async url => {
    requests.push(url);
    if (url === ASSETS.house) return house.promise;
    if (url === ASSETS.world) return environment;
    if (url === ASSETS.characters.frequenc) return frequenc.promise;
    return asset();
  });
  const oldPlayerLoad = Player.prototype.load;
  Player.prototype.load = async function() { this.model = new THREE.Group(); };
  t.after(() => { Player.prototype.load = oldPlayerLoad; });
  const world = new World(new THREE.Scene(), {}, new THREE.LoadingManager());
  world.exteriorLodEnabled = false;
  world.prepareExteriorSurfaceCulling = async () => {};
  let complete = false;
  const startup = world.init().then(() => { complete = true; });
  t.after(() => world.physics.world?.free());
  assert.ok(requests.includes(ASSETS.house) && requests.includes(ASSETS.bookAnimated));
  assert.ok(requests.indexOf(ASSETS.house) < requests.indexOf(ASSETS.world));
  await world.physics.init(); await tick();
  assert.ok(world.player, 'exterior/player preparation proceeds while Frequenc downloads');
  assert.equal(complete, false);
  frequenc.resolve(asset()); await startup;
  assert.equal(complete, true, 'an unfinished house must not hold the entrance');
  assert.equal(world.npcs[0].id, 'frequenc');
  house.reject(new Error('house unavailable')); await tick();
  assert.equal(complete, true);
});

test('a cached house waits for physics before creating colliders and shares concurrent entry work', async t => {
  const physicsReady = deferred();
  let colliders = 0, initialized = false;
  const book = await readGeometryGLB('public/assets/models/environment/book.glb');
  const oldPages = AnimatedBook3D.prototype.initializePages;
  AnimatedBook3D.prototype.initializePages = async () => {};
  t.after(() => { AnimatedBook3D.prototype.initializePages = oldPages; });
  instrumentLoader(t, async url => url === ASSETS.bookAnimated ? book : asset());
  const physics = { init: () => physicsReady.promise, invalidateStaticQueries: () => {
    assert.equal(initialized, true); colliders++;
  } };
  const interior = new HouseInterior(new THREE.Scene(), new THREE.LoadingManager(), physics);
  interior.stoneLodEnabled = false;
  const preload = interior.load();
  assert.equal(interior.load(), preload);
  await tick(); assert.equal(colliders, 0);
  initialized = true; physicsReady.resolve(); await preload;
  assert.equal(colliders, 1);
  assert.equal(interior.model.visible, false);
  assert.equal(interior.model.parent, null, 'preloading must not add house materials to the entrance scene');
  await interior.load(); assert.equal(colliders, 1);
});
