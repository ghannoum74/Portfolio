import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

globalThis.window = { addEventListener() {}, performance: globalThis.performance };
const temporary = await mkdtemp(new URL('../.camera-follow-test-', import.meta.url));
const bundle = temporary + '/suite.mjs';
await build({ stdin: {
  contents: "export { ThirdPersonCamera } from './src/camera/ThirdPersonCamera';" +
    "export { CameraCollision } from './src/camera/CameraCollision';" +
    "export { PhysicsWorld } from './src/physics/PhysicsWorld';" +
    "export { WorldColliders } from './src/physics/WorldColliders';" +
    "export { PlayerBody } from './src/world/player/PlayerBody';",
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: bundle });
let loaded;
try { loaded = await import(pathToFileURL(bundle)); }
finally { await rm(temporary, { recursive: true, force: true }); }
const { ThirdPersonCamera, CameraCollision, PhysicsWorld, WorldColliders, PlayerBody } = loaded;

const dom = () => ({ addEventListener() {}, setPointerCapture() {}, hasPointerCapture: () => false });
const targetOf = player => player.position.clone().add(new THREE.Vector3(0, 1.25, 0));
const armLength = (camera, player) => camera.position.distanceTo(targetOf(player));

async function fixture() {
  const physics = new PhysicsWorld(); await physics.init();
  const player = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000);
  const follow = new ThirdPersonCamera(camera, player, dom(), physics);
  follow.setInteriorMode(true);
  const wall = physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(20, 5, 0.15)
    .setTranslation(0, 2, -2));
  physics.invalidateStaticQueries(); physics.beginFrame(1 / 60); physics.step();
  follow.snap();
  for (let i = 0; i < 180; i++) follow.update(1 / 60);
  return { physics, player, camera, follow, wall };
}

test('an obstructed camera eases its turn instead of snapping sideways behind the player', async () => {
  const { physics, player, camera, follow } = await fixture();
  try {
    const before = camera.position.clone();
    player.rotation.y = 4 / 60;
    follow.update(1 / 60);
    const lateralStep = Math.abs(camera.position.x - before.x);
    assert.ok(lateralStep < 0.025, 'blocked turn jumped sideways by ' + lateralStep + ' m in one frame');
    assert.ok(camera.position.z > -1.6, 'camera must stay in front of the wall');
  } finally { physics.world.free(); }
});

test('a few clear frames at a beam or furniture edge do not pump the camera out and back', async () => {
  const { physics, player, camera, follow, wall } = await fixture();
  try {
    const distance = armLength(camera, player);
    for (let repeat = 0; repeat < 10; repeat++) {
      wall.setEnabled(false); physics.invalidateStaticQueries(); physics.step();
      for (let frame = 0; frame < 3; frame++) {
        follow.update(1 / 60);
        assert.ok(Math.abs(armLength(camera, player) - distance) < 1e-4,
          'brief clearance changed camera distance by ' + (armLength(camera, player) - distance));
      }
      wall.setEnabled(true); physics.invalidateStaticQueries(); physics.step();
      follow.update(1 / 60);
      assert.ok(Math.abs(armLength(camera, player) - distance) < 1e-4);
    }
  } finally { physics.world.free(); }
});

test('a newly obstructed camera contracts immediately and only recovers after sustained clearance', async () => {
  const { physics, player, camera, follow, wall } = await fixture();
  try {
    wall.setEnabled(false); physics.invalidateStaticQueries(); physics.step();
    for (let i = 0; i < 180; i++) follow.update(1 / 60);
    const fullDistance = armLength(camera, player);
    wall.setEnabled(true); physics.invalidateStaticQueries(); physics.step();
    follow.update(1 / 60);
    const blockedDistance = armLength(camera, player);
    assert.ok(blockedDistance < fullDistance - 1.5);
    assert.ok(camera.position.z > -1.6, 'do not interpolate through the newly encountered wall');
    wall.setEnabled(false); physics.invalidateStaticQueries(); physics.step();
    for (let i = 0; i < 3; i++) follow.update(1 / 60);
    assert.ok(Math.abs(armLength(camera, player) - blockedDistance) < 1e-4);
    for (let i = 0; i < 180; i++) follow.update(1 / 60);
    assert.ok(Math.abs(armLength(camera, player) - fullDistance) < 1e-3);
  } finally { physics.world.free(); }
});

test('tight wall clearance never forces a minimum camera distance through the surface', async () => {
  const physics = new PhysicsWorld(); await physics.init();
  try {
    physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(5, 5, 0.15)
      .setTranslation(0, 2, -0.53));
    physics.beginFrame(1 / 60); physics.step();
    const result = new CameraCollision(physics).resolve(
      new THREE.Vector3(0, 1.25, 0), new THREE.Vector3(0, 2.6, -3.6));
    assert.equal(result.blocked, true);
    assert.ok(result.position.distanceTo(new THREE.Vector3(0, 1.25, 0)) < 0.1);
    const hit = physics.world.intersectionWithShape(result.position,
      { x: 0, y: 0, z: 0, w: 1 }, new physics.rapier.Ball(0.249),
      physics.rapier.QueryFilterFlags.ONLY_FIXED);
    assert.equal(hit, null);
  } finally { physics.world.free(); }
});

test('snap resets obstruction history across house transitions and cinematic returns', async () => {
  const { physics, player, camera, follow } = await fixture();
  try {
    const projection = camera.projectionMatrix.clone(), fov = camera.fov;
    follow.snap();
    assert.ok(camera.position.z > -1.6, 'snap must respect the nearby wall');
    player.position.x = 100;
    follow.setInteriorMode(false); follow.snap();
    assert.ok(camera.position.distanceTo(new THREE.Vector3(100, 5, -7)) < 1e-8);
    player.position.x = 0;
    follow.setInteriorMode(true); follow.snap();
    assert.ok(camera.position.z > -1.6);
    follow.update(1 / 60);
    assert.ok(camera.position.z > -1.6);
    assert.equal(camera.fov, fov); assert.deepEqual(camera.projectionMatrix, projection);
  } finally { physics.world.free(); }
});

test('resting and moving follow cameras retain one-sweep query cost and idle query caching', async () => {
  const { physics, player, follow } = await fixture();
  try {
    let queries = 0;
    const cast = physics.world.castShape.bind(physics.world);
    physics.world.castShape = (...args) => { queries++; return cast(...args); };
    follow.snap();
    const initial = queries;
    for (let frame = 0; frame < 120; frame++) follow.update(1 / 60);
    assert.equal(queries, initial, 'stationary camera should reuse the fixed-collider query');
    for (let frame = 0; frame < 60; frame++) {
      player.position.x += 2 / 60;
      const before = queries; follow.update(1 / 60);
      assert.ok(queries - before <= 1, 'follow must not add a second physics sweep per frame');
    }
  } finally { physics.world.free(); }
});

test('blocked turn smoothing is consistent at 30, 60 and 120 FPS', async () => {
  const positions = [];
  for (const fps of [30, 60, 120]) {
    const { physics, player, camera, follow } = await fixture();
    try {
      player.rotation.y = 0.4;
      for (let frame = 0; frame < fps * 2; frame++) follow.update(1 / fps);
      positions.push(camera.position.clone());
    } finally { physics.world.free(); }
  }
  for (const position of positions) assert.ok(position.distanceTo(positions[0]) < 0.002);
});

test('walk and run camera paths around the shipped house remain clear of fixed colliders', async () => {
  const { scene: house } = await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url));
  const physics = new PhysicsWorld(); await physics.init();
  try {
    const log = console.log;
    try { console.log = () => {}; new WorldColliders(physics).createFromEnvironment(house); }
    finally { console.log = log; }
    physics.beginFrame(1 / 60); physics.step();
    const floor = house.getObjectByName('COL_BOX_HOUSE_FLOOR'); assert.ok(floor);
    const floorY = new THREE.Box3().setFromObject(floor).max.y;
    const player = new THREE.Group(), body = new PlayerBody(physics, new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000);
    const follow = new ThirdPersonCamera(camera, player, dom(), physics);
    follow.setInteriorMode(true);
    const ball = new physics.rapier.Ball(0.249), rotation = { x: 0, y: 0, z: 0, w: 1 };
    for (const speed of [2, 8]) {
      body.teleport(new THREE.Vector3(2, floorY + 0.1, -2));
      for (let i = 0; i < 60; i++) { body.update(0, 0, speed, false, 1 / 60); physics.step(); }
      body.syncModel(player, 0); follow.snap();
      for (let frame = 0; frame < 480; frame++) {
        const heading = Math.sin(frame / 110) * Math.PI;
        body.update(frame < 240 ? 1 : -1, heading, speed, false, 1 / 60);
        physics.step(); body.syncModel(player, 0); player.rotation.y = heading;
        follow.update(1 / 60);
        assert.ok(camera.position.toArray().every(Number.isFinite));
        const hit = physics.world.intersectionWithShape(camera.position, rotation, ball,
          physics.rapier.QueryFilterFlags.ONLY_FIXED);
        assert.equal(hit, null, 'camera intersects ' + hit?.handle + ' at speed ' + speed + ', frame ' + frame);
      }
    }
  } finally { physics.world.free(); }
});
