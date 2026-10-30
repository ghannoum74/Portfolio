import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

globalThis.window = { location: { search: '' }, devicePixelRatio: 1, performance: globalThis.performance };
const temporary = await mkdtemp(new URL('../.common-perf-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: {
  contents: `export { StaticMeshBatches, StaticMeshInstances } from './src/optimization/StaticScene';
    export { PhysicsWorld } from './src/physics/PhysicsWorld';
    export { WorldColliders } from './src/physics/WorldColliders';
    export { CameraCollision } from './src/camera/CameraCollision';
    export { AssetLoader } from './src/loaders/AssetLoader';
    export { ASSETS } from './src/loaders/AssetManifest';
    export { World } from './src/world/World';
    export { Water } from './src/world/environment/Water';
    export { ClosedSurfaceCulling } from './src/world/house/ClosedSurfaceCulling';
    export { HouseInterior } from './src/world/house/HouseInterior';
    export { Player } from './src/world/player/Player';
    export { DayNightCycle } from './src/world/environment/DayNightCycle';
    export { ProjectPageTextures } from './src/world/house/book/ProjectPageTexture';
    export { PROJECTS } from './src/data/projects';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { StaticMeshBatches, StaticMeshInstances, PhysicsWorld, WorldColliders, CameraCollision,
  AssetLoader, ASSETS, World, Water, ClosedSurfaceCulling, HouseInterior, Player, DayNightCycle, ProjectPageTextures, PROJECTS } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

function copies(count = 3) {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  geometry.clearGroups(); // One opaque GLTF primitive, matching the supported input.
  const material = new THREE.MeshStandardMaterial({ color: 0x895a2c });
  const meshes = Array.from({ length: count }, (_, index) => {
    const mesh = new THREE.Mesh(geometry.clone(), material);
    mesh.name = `prop_${index}`;
    mesh.position.set(0.5 + index, 0.5, 0.5);
    root.add(mesh); return mesh;
  });
  return { root, meshes, material };
}

test('the authored bookshelf stays available for its border while neighboring props can still batch', () => {
  const { root, meshes } = copies();
  meshes[2].name = 'My_Bookshelf001';
  meshes[2].userData.name = 'My Bookshelf.001';
  const marker = new THREE.Group(); marker.name = 'INTERACT_LIBRARY_SHELF';
  marker.userData.targetObject = 'My Bookshelf.001'; root.add(marker);
  const result = new StaticMeshBatches(root);
  assert.equal(meshes[2].visible, true);
  assert.equal(result.stats.sourceMeshes, 2);
  assert.equal(result.stats.batches, 1);
  result.dispose();
});

test('sun shadows stop only at zero sunlight and return at dawn without releasing their map', () => {
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  const map = new THREE.WebGLRenderTarget(16, 16); sun.shadow.map = map;
  let disposals = 0; map.addEventListener('dispose', () => disposals++);
  const cycle = new DayNightCycle(new THREE.Scene(), new THREE.Group(), sun, new THREE.AmbientLight(), { timeZone: 'UTC' });
  for (const [hour, lit] of [[0, false], [5.42, false], [5.43, true], [6, true], [12, true], [18, true], [18.57, true], [18.58, false], [23.99, false], [12, true]]) {
    cycle.setTimeOverride(hour);
    assert.equal(sun.intensity > 0, lit, `sunlight at ${hour}`);
    assert.equal(sun.castShadow, lit, `shadow at ${hour}`);
    assert.equal(sun.visible, true); assert.equal(sun.shadow.autoUpdate, true);
    assert.equal(sun.shadow.map, map); assert.equal(disposals, 0);
  }
  cycle.setTimeOverride(0); cycle.setTimeOverride(null);
  assert.equal(cycle.isUsingRealTime(), true);
  assert.equal(sun.castShadow, sun.intensity > 0);
  map.dispose();
});

test('daylight never enables sun shadows that were disabled in the authored configuration', () => {
  const sun = new THREE.DirectionalLight(); sun.castShadow = false;
  const cycle = new DayNightCycle(new THREE.Scene(), new THREE.Group(), sun, new THREE.AmbientLight());
  for (const hour of [12, 0, 5.43, 13, 23]) {
    cycle.setTimeOverride(hour); cycle.update(2);
    assert.equal(sun.castShadow, false);
  }
  cycle.setTimeOverride(12); assert.equal(sun.intensity, 3);
});

test('static instances retain every vertex/UV/material and follow moved roots without copying geometry', () => {
  const { root, meshes, material } = copies();
  root.rotation.y = 0.1; root.position.set(0.5, 0.5, 0.5); root.scale.setScalar(1.3);
  meshes[1].rotation.x = 0.2;
  const saved = meshes.map(mesh => ({ mesh, geometry: mesh.geometry, uv: [...mesh.geometry.attributes.uv.array] }));
  const result = new StaticMeshInstances(root);
  assert.deepEqual(result.stats, { sourceMeshes: 3, batches: 1, triangles: 36 });
  const batch = root.getObjectByName('STATIC_INSTANCE_1');
  assert.equal(batch.geometry, meshes[0].geometry); assert.equal(batch.material, material);
  const matrix = new THREE.Matrix4(), expected = new THREE.Vector3(), actual = new THREE.Vector3();
  for (const move of [0, 4]) {
    root.position.x += move; root.updateMatrixWorld(true);
    meshes.forEach((source, index) => {
      batch.getMatrixAt(index, matrix); matrix.premultiply(batch.matrixWorld);
      const a = source.geometry.attributes.position;
      for (let vertex = 0; vertex < a.count; vertex++) {
        expected.fromBufferAttribute(a, vertex).applyMatrix4(source.matrixWorld);
        actual.fromBufferAttribute(batch.geometry.attributes.position, vertex).applyMatrix4(matrix);
        assert.ok(expected.distanceTo(actual) < 0.000002);
      }
      assert.equal(source.visible, false); assert.equal(root.getObjectByName(source.name), source);
    });
  }
  let sourceDisposals = 0, instanceDisposals = 0;
  saved.forEach(({ geometry }) => geometry.addEventListener('dispose', () => sourceDisposals++));
  material.addEventListener('dispose', () => sourceDisposals++);
  batch.addEventListener('dispose', () => instanceDisposals++);
  result.setEnabled(false); assert.equal(batch.parent, null); assert.ok(meshes.every(mesh => mesh.visible));
  result.setEnabled(true); assert.equal(root.getObjectByName('STATIC_INSTANCE_1'), batch);
  result.dispose(); assert.equal(sourceDisposals, 0); assert.equal(instanceDisposals, 1);
  saved.forEach(({ mesh, geometry, uv }) => { assert.equal(mesh.geometry, geometry); assert.deepEqual([...geometry.attributes.uv.array], uv); });
});

test('equal counts cannot instance different UVs, normals, index winding or material identities', () => {
  for (const change of ['uv', 'normal', 'index', 'material']) {
    const { root, meshes } = copies(2);
    if (change === 'material') meshes[1].material = meshes[1].material.clone();
    else if (change === 'index') {
      const a = meshes[1].geometry.index.array; [a[0], a[1]] = [a[1], a[0]];
    } else meshes[1].geometry.attributes[change].array[0] += 0.001;
    assert.equal(new StaticMeshInstances(root).stats.sourceMeshes, 0, change);
    assert.ok(meshes.every(mesh => mesh.visible));
  }
});

test('instancing excludes animation, gameplay, hidden props, shear, mirroring and special rendering', () => {
  for (const kind of ['gameplay', 'animation', 'hidden', 'shear', 'mirror', 'cutout', 'transparent', 'hook', 'morph', 'shader', 'overlap', 'shadow', 'layer']) {
    const { root, meshes, material } = copies(2); let clips = [];
    if (kind === 'gameplay') root.name = 'SEC_MOVABLE';
    if (kind === 'animation') clips = [new THREE.AnimationClip('move', 1, [new THREE.NumberKeyframeTrack('prop_1.position[x]', [0, 1], [1, 2])])];
    if (kind === 'hidden') meshes[1].visible = false;
    if (kind === 'shear') { meshes[1].matrixAutoUpdate = false; meshes[1].matrix.makeShear(0.2, 0, 0, 0, 0, 0); }
    if (kind === 'mirror') meshes[1].scale.x = -1;
    if (kind === 'cutout') material.alphaTest = 0.5;
    if (kind === 'transparent') material.transparent = true;
    if (kind === 'hook') meshes[1].onBeforeRender = () => {};
    if (kind === 'morph') meshes[1].geometry.morphAttributes.position = [meshes[1].geometry.attributes.position.clone()];
    if (kind === 'shader') meshes.forEach(mesh => { mesh.material = new THREE.ShaderMaterial(); });
    if (kind === 'overlap') meshes[1].position.copy(meshes[0].position);
    if (kind === 'shadow') meshes[1].castShadow = true;
    if (kind === 'layer') meshes[1].layers.set(2);
    assert.equal(new StaticMeshInstances(root, clips).stats.sourceMeshes, 0, kind);
  }
});

test('instance groups bound culling regions and counts, and exclude late runtime effects', () => {
  const { root, meshes, material } = copies(60);
  meshes.forEach((mesh, index) => mesh.position.set(0.5 + index % 10 * 0.6, 0.5, 0.5 + Math.floor(index / 10) * 0.6));
  const authored = new Set([root, ...meshes]);
  const late = new THREE.Mesh(meshes[0].geometry.clone(), material); late.position.set(7, 0.5, 0.5); root.add(late);
  const distant = new THREE.Mesh(meshes[0].geometry.clone(), material); distant.position.set(80, 0.5, 0.5); root.add(distant); authored.add(distant);
  const result = new StaticMeshInstances(root, [], authored);
  assert.deepEqual(result.stats, { sourceMeshes: 60, batches: 3, triangles: 720 });
  for (const batch of root.children.filter(x => x.isInstancedMesh)) {
    assert.ok(batch.count <= 24); assert.ok(batch.boundingBox.getSize(new THREE.Vector3()).length() < 8);
    assert.ok(batch.boundingSphere.radius < 4);
  }
  assert.equal(late.visible, true); assert.equal(distant.visible, true);
});

test('real exterior combines merging and instancing without changing source assets or named targets', async () => {
  const { scene: root, animations } = await readGeometryGLB(new URL('../public/assets/models/environment/world.glb', import.meta.url));
  root.scale.setScalar(0.25); new Water(root);
  const authored = new Set(), sources = [];
  root.traverse(node => { authored.add(node); if (node.isMesh) { node.receiveShadow = true; sources.push({ node, geometry: node.geometry, material: node.material }); } });
  const culling = await ClosedSurfaceCulling.create(root, true, animations, { maxTriangles: 10_000 });
  const prepared = new Map(sources.map(({ node }) => [node, node.material]));
  const merged = new StaticMeshBatches(root, animations, authored);
  const instances = new StaticMeshInstances(root, animations, authored);
  assert.deepEqual(merged.stats, { sourceMeshes: 11, batches: 4, triangles: 132 });
  assert.deepEqual(instances.stats, { sourceMeshes: 36, batches: 16, triangles: 2200 });
  assert.ok(root.getObjectByName('INTERACT_MAILBOX_01'));
  sources.forEach(({ node, geometry }) => { assert.equal(node.geometry, geometry); assert.equal(node.material, prepared.get(node)); });
  const frontBatches = root.children.filter(node => /^(STATIC_BATCH_|STATIC_INSTANCE_)/.test(node.name) &&
    node.material.userData.houseClosedSurfaceCulling).map(node => node.material);
  assert.ok(frontBatches.length > 0);
  culling.setEnabled(false); frontBatches.forEach(material => assert.equal(material.side, THREE.DoubleSide));
  culling.setEnabled(true); frontBatches.forEach(material => assert.equal(material.side, THREE.FrontSide));
  instances.dispose(); merged.dispose(); culling.dispose();
  sources.forEach(({ node, material }) => assert.equal(node.material, material));
  sources.filter(x => !/^(COL_|ZONE_)/.test(x.node.name)).forEach(({ node }) => assert.equal(node.visible, true));
});

test('physics initialization is shared and initializes its dynamically loaded backend before use', async () => {
  const physics = new PhysicsWorld();
  assert.equal(physics.isInitialized, false);
  const a = physics.init(), b = physics.init(); assert.equal(a, b);
  await a; const world = physics.world;
  assert.equal(physics.isInitialized, true); assert.equal(await physics.init(), undefined); assert.equal(physics.world, world);
  physics.beginFrame(1 / 60); physics.step();
  assert.ok(Math.abs(world.timestep - 1 / 60) < 1e-8);
  world.free();
});

test('camera collision reuses fixed-only results and invalidates on movement and imported colliders', async () => {
  const physics = new PhysicsWorld(); await physics.init();
  try {
    const camera = new CameraCollision(physics);
    let queries = 0; const cast = physics.world.castShape.bind(physics.world);
    physics.world.castShape = (...args) => { queries++; return cast(...args); };
    const from = new THREE.Vector3(0, 1, 0), to = new THREE.Vector3(0, 1, 5);
    assert.equal(camera.resolve(from, to).blocked, false);
    for (let frame = 0; frame < 120; frame++) assert.equal(camera.resolve(from, to).blocked, false);
    assert.equal(queries, 1); assert.deepEqual(to.toArray(), [0, 1, 5]);
    to.z = 6; camera.resolve(from, to); assert.equal(queries, 2);
    from.x = 0.1; camera.resolve(from, to); assert.equal(queries, 3);
    const environment = new THREE.Group(), wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.5));
    wall.name = 'COL_BOX_WALL'; wall.position.set(0, 1, 3); environment.add(wall);
    new WorldColliders(physics).createFromEnvironment(environment); physics.step();
    assert.equal(camera.resolve(from, to).blocked, true); assert.equal(queries, 4);
    assert.ok(camera.resolve(from, to).position.z < 3); assert.equal(queries, 4);
    const fixed = []; physics.world.forEachCollider(collider => fixed.push(collider));
    fixed.forEach(collider => physics.world.removeCollider(collider, false));
    physics.invalidateStaticQueries(); physics.step();
    assert.equal(camera.resolve(from, to).blocked, false); assert.equal(queries, 5);
    assert.deepEqual(camera.resolve(from, from).position.toArray(), from.toArray()); assert.equal(queries, 5);
  } finally { physics.world.free(); }
});

test('world loading starts the essential model before physics initialization completes', async () => {
  const world = new World(new THREE.Scene(), {}, new THREE.LoadingManager());
  // Isolate exterior ordering; startup-loading.test exercises the other branches.
  world.preloadHouseInterior = () => {};
  world.npcManager.loadStartup = async () => {};
  const requested = []; let finishPhysics, failAsset;
  world.physics.init = () => new Promise(resolve => { finishPhysics = resolve; });
  const original = AssetLoader.prototype.loadGLB;
  AssetLoader.prototype.loadGLB = url => { requested.push(url); return new Promise((resolve, reject) => { failAsset = reject; }); };
  try {
    const pending = world.init();
    assert.deepEqual(requested, [ASSETS.world]); assert.equal(world.physics.isInitialized, false);
    failAsset(new Error('test download failure')); finishPhysics();
    await assert.rejects(pending, /test download failure/);
    assert.equal(world.model, undefined);
  } finally { AssetLoader.prototype.loadGLB = original; }
});

function cullingWorldFixture() {
  const fixture = copies(2); fixture.material.side = THREE.DoubleSide;
  for (const id of ['01', '02']) {
    const zone = new THREE.Mesh(new THREE.BoxGeometry()); zone.name = `ZONE_STAIRS_${id}`;
    const bottom = new THREE.Object3D(), top = new THREE.Object3D();
    bottom.name = `STAIRS_BOTTOM_${id}`; top.name = `STAIRS_TOP_${id}`; top.position.set(1, 1, 0);
    fixture.root.add(zone, bottom, top);
  }
  return fixture;
}

test('world culling overlaps player loading, honors late changes and shares its switch with batches and a preloaded house', async () => {
  const { root, meshes, material } = cullingWorldFixture();
  const world = new World(new THREE.Scene(), {}, new THREE.LoadingManager());
  world.physics.init = async () => {}; world.exteriorLodEnabled = false;
  world.npcManager.loadStartup = async () => {};
  const original = { asset: AssetLoader.prototype.loadGLB, player: Player.prototype.load,
    culling: ClosedSurfaceCulling.create, house: HouseInterior.prototype.load, log: console.log };
  let releasePlayer, releaseAudit, auditWork, pending;
  const playerGate = new Promise(resolve => { releasePlayer = resolve; });
  const auditGate = new Promise(resolve => { releaseAudit = resolve; });
  const events = [], houseStates = [];
  AssetLoader.prototype.loadGLB = async url => { assert.equal(url, ASSETS.world); return { scene: root, animations: [] }; };
  Player.prototype.load = async function() { events.push('player'); await playerGate; this.model = new THREE.Group(); };
  ClosedSurfaceCulling.create = (...args) => {
    events.push('culling'); assert.equal(args[0], root); assert.deepEqual(args[3], { maxTriangles: 10_000 });
    auditWork = auditGate.then(() => original.culling(...args)); return auditWork;
  };
  HouseInterior.prototype.load = async function() { houseStates.push(this.surfaceCullingEnabled); };
  console.log = () => {};
  try {
    pending = world.init(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['player', 'culling']); assert.equal(world.initialized, false);
    world.setSurfaceCullingEnabled(false); releaseAudit(); await auditWork; await Promise.resolve();
    assert.equal(world.initialized, false, 'player download is still pending');
    meshes.forEach(mesh => { assert.notEqual(mesh.material, material); assert.equal(mesh.material.side, THREE.DoubleSide); });
    releasePlayer(); await pending;
    assert.equal(world.initialized, true);
    assert.deepEqual(world.exteriorSurfaceCulling.stats, { enabled: false, meshes: 2, triangles: 24, materials: 1 });
    assert.deepEqual(world.staticBatches.stats, { sourceMeshes: 2, batches: 1, triangles: 24 });
    const batch = root.getObjectByName('STATIC_BATCH_1'); assert.equal(batch.material.side, THREE.DoubleSide);
    const house = await world.loadHouseInterior(); assert.deepEqual(houseStates, [true, false]);
    world.setSurfaceCullingEnabled(true);
    assert.equal(batch.material.side, THREE.FrontSide); assert.equal(material.side, THREE.DoubleSide);
    assert.equal(house.surfaceCullingEnabled, true);
    assert.equal(await world.loadHouseInterior(), house); assert.deepEqual(houseStates, [true, false, true]);
    world.setSurfaceCullingEnabled(false);
    assert.equal(batch.material.side, THREE.DoubleSide); assert.equal(house.surfaceCullingEnabled, false);
  } finally {
    releaseAudit(); releasePlayer(); await pending?.catch(() => {});
    AssetLoader.prototype.loadGLB = original.asset; Player.prototype.load = original.player;
    ClosedSurfaceCulling.create = original.culling; HouseInterior.prototype.load = original.house; console.log = original.log;
    world.staticTransforms?.dispose(); world.staticInstances?.dispose(); world.staticBatches?.dispose();
    world.exteriorSurfaceCulling?.dispose();
  }
  meshes.forEach(mesh => assert.equal(mesh.material, material));
});

test('failed exterior culling preparation preserves authored materials and does not block world readiness', async () => {
  const { root, meshes, material } = cullingWorldFixture();
  const world = new World(new THREE.Scene(), {}, new THREE.LoadingManager());
  world.preloadHouseInterior = () => {};
  world.npcManager.loadStartup = async () => {};
  world.physics.init = async () => {}; world.exteriorLodEnabled = false;
  world.staticBatchingEnabled = false; world.staticTransformsEnabled = false;
  const original = { asset: AssetLoader.prototype.loadGLB, player: Player.prototype.load,
    culling: ClosedSurfaceCulling.create, warn: console.warn, log: console.log };
  const warnings = [];
  AssetLoader.prototype.loadGLB = async () => ({ scene: root, animations: [] });
  Player.prototype.load = async function() { this.model = new THREE.Group(); };
  ClosedSurfaceCulling.create = async () => { throw new Error('audit unavailable'); };
  console.warn = (...args) => warnings.push(args); console.log = () => {};
  try {
    await world.init(); assert.equal(world.initialized, true); assert.equal(world.exteriorSurfaceCulling, undefined);
    assert.equal(warnings.length, 1); assert.match(warnings[0][0], /Exterior surface culling unavailable/);
    meshes.forEach(mesh => { assert.equal(mesh.material, material); assert.equal(mesh.visible, true); });
  } finally {
    AssetLoader.prototype.loadGLB = original.asset; Player.prototype.load = original.player;
    ClosedSurfaceCulling.create = original.culling; console.warn = original.warn; console.log = original.log;
  }
});

test('player model and animation downloads overlap and bind only after the complete set succeeds', async () => {
  const physics = new PhysicsWorld(); await physics.init();
  try {
    const scene = new THREE.Scene(), player = new Player(scene, {}, new THREE.LoadingManager(), physics, {});
    const requests = new Map();
    player.loader.loadGLB = url => new Promise(resolve => requests.set(url, resolve));
    const pending = player.load();
    assert.equal(requests.size, 8); assert.equal(scene.children.length, 0);
    const model = new THREE.Group(); model.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5)));
    requests.get(ASSETS.player)({ scene: model }); await Promise.resolve();
    assert.equal(scene.children.length, 0);
    for (const url of Object.values(ASSETS.animations)) requests.get(url)({ animations: [new THREE.AnimationClip(url, 1, [])] });
    await pending; assert.equal(player.model, model); assert.ok(scene.children.includes(model));
    assert.equal(player.animations.actions.size, 7); assert.equal(player.animations.currentActionName, 'idle');
  } finally { physics.world.free(); }
});

test('physics WASM backend stays outside the synchronous gameplay dependency graph', async () => {
  const result = await build({ entryPoints: ['src/physics/PhysicsWorld.ts', 'src/world/player/PlayerBody.ts'], bundle: true,
    splitting: true, format: 'esm', platform: 'browser', write: false, metafile: true, outdir: '.physics-bundle-check' });
  const outputs = result.metafile.outputs, inputs = new Set(), visited = new Set();
  const visit = path => {
    if (visited.has(path)) return;
    visited.add(path); Object.keys(outputs[path].inputs).forEach(input => inputs.add(input));
    outputs[path].imports.filter(dependency => !dependency.external && dependency.kind !== 'dynamic-import').forEach(dependency => visit(dependency.path));
  };
  Object.keys(outputs).filter(path => ['src/physics/PhysicsWorld.ts', 'src/world/player/PlayerBody.ts'].includes(outputs[path].entryPoint)).forEach(visit);
  assert.ok(![...inputs].some(input => input.includes('@dimforge/rapier3d-compat')));
  assert.ok(Object.values(outputs).some(output => Object.keys(output.inputs).some(input => input.includes('@dimforge/rapier3d-compat'))));
});

test('book detail roles share full-resolution textures while projects and disposal remain independent', () => {
  const hadDocument = Object.hasOwn(globalThis, 'document');
  const previousDocument = globalThis.document;
  let canvases = 0;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      canvases++;
      const context = new Proxy({
        measureText: text => ({ width: String(text).length * 12 }),
        createLinearGradient: () => ({ addColorStop() {} }),
      }, {
        get(target, key) { return key in target ? target[key] : () => {}; },
      });
      return { width: 0, height: 0, getContext: () => context };
    },
  };
  const pages = new ProjectPageTextures();
  const textures = [];
  let disposals = 0;
  try {
    assert.ok(PROJECTS.length > 1);
    for (const project of PROJECTS) {
      const resting = pages.details(project);
      assert.equal(pages.details(project, false), resting);
      assert.equal(pages.details(project, true), resting);
      assert.equal(resting.image.width, 1024);
      assert.equal(resting.image.height, 1536);
      assert.equal(resting.colorSpace, THREE.SRGBColorSpace);
      assert.equal(resting.flipY, false);
      assert.deepEqual(resting.repeat.toArray(), [-1, 1]);
      assert.deepEqual(resting.offset.toArray(), [1, 0]);
      assert.deepEqual(resting.center.toArray(), [0, 0]);
      assert.equal(resting.rotation, 0);
      assert.equal(resting.anisotropy, 8);
      assert.equal(resting.generateMipmaps, true);
      assert.equal(resting.minFilter, THREE.LinearMipmapLinearFilter);
      resting.addEventListener('dispose', () => disposals++);
      textures.push(resting);
    }
    assert.equal(canvases, PROJECTS.length);
    assert.equal(new Set(textures).size, PROJECTS.length);
    assert.equal(new Set(textures.map(texture => texture.image)).size, PROJECTS.length);
    pages.dispose();
    assert.equal(disposals, PROJECTS.length);
    pages.dispose();
    assert.equal(disposals, PROJECTS.length);
  } finally {
    pages.dispose();
    if (hadDocument) globalThis.document = previousDocument;
    else delete globalThis.document;
  }
});
