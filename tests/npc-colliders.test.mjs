import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

const temporary = await mkdtemp(new URL('../.npc-collider-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: { contents: `
  export { createNpcCollider } from './src/world/npc/NpcCollider';
  export { NpcManager } from './src/world/npc/NpcManager';
  export { PhysicsWorld } from './src/physics/PhysicsWorld';
  export { PlayerBody } from './src/world/player/PlayerBody';
  export { CameraCollision } from './src/camera/CameraCollision';
`, resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle,
  bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { createNpcCollider, NpcManager, PhysicsWorld, PlayerBody, CameraCollision } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

function authoredNpc() {
  const model = new THREE.Group();
  const marker = new THREE.Mesh(new THREE.CapsuleGeometry(.3, 1.2, 4, 12));
  marker.name = 'COL_CAPSULE_NPC_fixture'; marker.position.y = .9;
  const visible = new THREE.Mesh(new THREE.BoxGeometry(.5, 1.8, .4));
  visible.position.y = .9;
  model.add(marker, visible);
  return { model, marker, visible };
}
async function physicsFixture(t) {
  const physics = new PhysicsWorld(); await physics.init();
  t.after(() => physics.world.free());
  return physics;
}

test('authored capsules honor runtime placement, yaw and scale while staying out of the render/shadow list', async t => {
  const physics = await physicsFixture(t), scene = new THREE.Scene();
  const manager = new NpcManager(scene, new THREE.LoadingManager(), physics);
  const { model, marker, visible } = authoredNpc();
  const clips = Object.fromEntries(['idle', 'talking_1', 'talking_2', 'talking_3']
    .map(name => [name, new THREE.AnimationClip(name, 1, [])]));
  manager.createNpc({ id: 'fixture', name: 'Fixture', company: '', dialogues: [],
    position: new THREE.Vector3(2, 3, 4), rotationY: .73, scale: 1.3 }, model, clips);
  const npc = manager.npcs[0], collider = npc.collision.collider;
  assert.equal(collider.parent().isKinematic(), true);
  assert.ok(Math.abs(collider.shape.radius - .39) < 1e-6);
  assert.ok(Math.abs(collider.shape.halfHeight - .78) < 1e-6);
  assert.ok(new THREE.Vector3().copy(collider.translation()).distanceTo(new THREE.Vector3(2, 4.17, 4)) < 1e-6);
  assert.equal(marker.visible, false); assert.deepEqual(npc.shadowMeshes, [visible]);
  assert.equal(physics.colliderNames.get(collider.handle), marker.name);
  manager.setVisible(false); assert.equal(collider.parent().isEnabled(), false);
  assert.equal(model.parent, null);
  manager.setVisible(true); assert.equal(collider.parent().isEnabled(), true);
  assert.equal(model.parent, scene);
  npc.collision.dispose(); npc.collision.dispose();
  assert.equal(physics.world.bodies.len(), 0); assert.equal(physics.colliderNames.size, 0);
});

test('the real player controller stops at an NPC and can pass only after that collider is disabled', async t => {
  const physics = await physicsFixture(t);
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(20, .1, 20).setTranslation(0, -.1, 0));
  const { model } = authoredNpc(); model.position.z = 2;
  const npc = createNpcCollider(model, physics, true);
  const player = new PlayerBody(physics, new THREE.Vector3(0, .95, 0));
  player.teleport(new THREE.Vector3(0, .05, 0));
  const walk = frames => { for (let i = 0; i < frames; i++) {
    physics.beginFrame(1 / 60); player.update(1, 0, 2, false, 1 / 60); physics.step();
  } };
  walk(150);
  const blocked = player.getFeetPosition(new THREE.Vector3());
  assert.ok(blocked.z > .5 && blocked.z < 1.5, `player must stop before the NPC: z=${blocked.z}`);
  assert.ok(blocked.y < .1, 'autostep must not lift the player onto the NPC');
  assert.ok(Math.abs(npc.collider.translation().z - 2) < 1e-6, 'the player must not push the NPC');
  npc.setEnabled(false); walk(120);
  assert.ok(player.getFeetPosition(new THREE.Vector3()).z > 3.5);
});

test('NPC movement follows its authored marker without turning it into a camera obstacle', async t => {
  const physics = await physicsFixture(t);
  const { model, marker } = authoredNpc(); model.position.z = 2;
  const npc = createNpcCollider(model, physics, true);
  physics.step();
  const camera = new CameraCollision(physics);
  const target = new THREE.Vector3(0, .9, 0), desired = new THREE.Vector3(0, .9, 4);
  assert.equal(camera.resolve(target, desired).blocked, false);
  model.position.set(3, 1, 2); model.rotation.y = Math.PI / 2;
  marker.position.x = .2; npc.sync(); physics.step();
  const expected = marker.getWorldPosition(new THREE.Vector3());
  assert.ok(new THREE.Vector3().copy(npc.collider.translation()).distanceTo(expected) < 1e-6);
  assert.ok(Math.abs(npc.collider.shape.radius - .3) < 1e-6);
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(1, 1, .2).setTranslation(0, 1, 3));
  physics.invalidateStaticQueries(); physics.step();
  assert.equal(camera.resolve(target, desired).blocked, true, 'fixed wall collisions remain intact');
});

test('bone animation does not resize or move the collider, and malformed/missing helpers have no guessed fallback', async t => {
  const physics = await physicsFixture(t), warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  const { model } = authoredNpc();
  const bone = new THREE.Bone(); model.add(bone);
  const npc = createNpcCollider(model, physics, true);
  const original = { ...npc.collider.translation() };
  bone.position.set(50, 50, 50); bone.rotation.x = 1.3; npc.sync(); physics.step();
  assert.deepEqual({ ...npc.collider.translation() }, original);
  npc.dispose();
  assert.equal(createNpcCollider(new THREE.Group(), physics, true), null);
  const duplicated = authoredNpc(); duplicated.model.add(duplicated.marker.clone());
  assert.equal(createNpcCollider(duplicated.model, physics, true), null);
  const boneParent = authoredNpc(); const parent = new THREE.Bone();
  boneParent.model.add(parent); parent.add(boneParent.marker);
  assert.equal(createNpcCollider(boneParent.model, physics, true), null);
  assert.equal(physics.world.bodies.len(), 0);
  assert.equal(warnings.length, 3);
});
