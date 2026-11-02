import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

const temporary = await mkdtemp(new URL('../.quantized-collider-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: { contents: `export {WorldColliders} from './src/physics/WorldColliders'; export {PhysicsWorld} from './src/physics/PhysicsWorld';`,
  resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true,
  platform: 'node', format: 'esm', packages: 'external' });
const { WorldColliders, PhysicsWorld } = await import(pathToFileURL(bundle));

async function rayAtFloor(model) {
  const physics = new PhysicsWorld(); await physics.init();
  try {
    new WorldColliders(physics).createFromEnvironment(model); physics.step();
    return physics.world.castRay(new physics.rapier.Ray({ x: 12, y: 3, z: -8 }, { x: 0, y: -1, z: 0 }), 6, true)?.timeOfImpact;
  } finally { physics.world.free(); }
}

test('a translated/scaled floor keeps real Rapier collision after the CLI meshopt transform', async () => {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
  });
  const document = new Document(), buffer = document.createBuffer();
  const positions = document.createAccessor().setType('VEC3').setBuffer(buffer)
    .setArray(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]));
  const indices = document.createAccessor().setType('SCALAR').setBuffer(buffer)
    .setArray(new Uint16Array([0, 2, 1, 0, 3, 2]));
  const mesh = document.createMesh('Plane').addPrimitive(document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices));
  document.createScene().addChild(document.createNode('Land_01').setMesh(mesh).setTranslation([12, 0, -8]).setScale([4, 1, 3]));
  const source = `${temporary}/floor.glb`, optimized = `${temporary}/floor-meshopt.glb`;
  await io.write(source, document);
  await document.transform(meshopt({ encoder: MeshoptEncoder }));
  await io.write(optimized, document);
  const original = (await readGeometryGLB(source)).scene, compressed = (await readGeometryGLB(optimized)).scene;
  assert.equal(compressed.getObjectByName('Land_01').geometry.attributes.position.normalized, true);
  const before = await rayAtFloor(original), after = await rayAtFloor(compressed);
  assert.ok(Number.isFinite(before)); assert.ok(Number.isFinite(after), 'the compressed floor must still block a downward ray');
  assert.ok(Math.abs(before - after) < 1e-4);
});

test('normalized hull and nonindexed mesh colliders honor parent transforms without changing render attributes', async () => {
  for (const kind of ['COL_HULL_', 'COL_MESH_']) {
    const root = new THREE.Group(); root.position.set(12, 0, -8); root.rotation.y = .7;
    const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const array = new Int16Array(Array.from(geometry.attributes.position.array, value => Math.round(value * 32767)));
    geometry.setAttribute('position', new THREE.Int16BufferAttribute(array, 3, true));
    const snapshot = array.slice();
    const proxy = new THREE.Mesh(geometry); proxy.name = `${kind}FLOOR`; proxy.scale.set(4, .5, 3); root.add(proxy);
    const hit = await rayAtFloor(root);
    assert.ok(Number.isFinite(hit), kind);
    assert.ok(Math.abs(hit - 2.5) < 1e-4, kind);
    assert.deepEqual(geometry.attributes.position.array, snapshot);
    assert.equal(geometry.attributes.position.normalized, true);
  }
});

test('the CLI can wrap a named collider in a group without losing collision or exposing its mesh', async () => {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
  });
  const document = new Document(), buffer = document.createBuffer();
  const box = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
  const positions = document.createAccessor().setType('VEC3').setBuffer(buffer)
    .setArray(new Float32Array(box.attributes.position.array));
  const mesh = document.createMesh('PlantProxy').addPrimitive(document.createPrimitive().setAttribute('POSITION', positions));
  const collider = document.createNode('COL_BOX_PLANT').setMesh(mesh).setTranslation([12, 0, -8]).setScale([4, .5, 3]);
  // A child forces quantization to preserve the named transform on a wrapper.
  collider.addChild(document.createNode('PLANT_MARKER').setTranslation([0, 1, 0]));
  document.createScene().addChild(collider);
  const source = `${temporary}/plant.glb`, optimized = `${temporary}/plant-meshopt.glb`;
  await io.write(source, document);
  await document.transform(meshopt({ encoder: MeshoptEncoder }));
  await io.write(optimized, document);
  const original = (await readGeometryGLB(source)).scene, compressed = (await readGeometryGLB(optimized)).scene;
  const owner = compressed.getObjectByName('COL_BOX_PLANT');
  assert.equal(owner instanceof THREE.Mesh, false, 'exercise the actual Meshopt wrapper');
  assert.ok(owner.children.some(child => child instanceof THREE.Mesh));
  const before = await rayAtFloor(original), after = await rayAtFloor(compressed);
  assert.ok(Math.abs(before - 2.5) < .001);
  assert.ok(Math.abs(before - after) < .001, 'the group must retain its authored physics shape');
  assert.equal(owner.visible, false, 'the entire helper must be hidden');
  owner.traverse(child => { if (child instanceof THREE.Mesh) assert.equal(child.visible, false); });
});

test('explicit collider groups use the nearest helper type and never turn zones or ordinary visual children into colliders', async () => {
  const root = new THREE.Group(), owner = new THREE.Group(); owner.name = 'COL_BOX_OUTER'; root.add(owner);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); owner.add(cube);
  const inner = new THREE.Group(); inner.name = 'COL_CYL_INNER'; owner.add(inner);
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2)); inner.add(cylinder);
  const zone = new THREE.Group(); zone.name = 'ZONE_DECOR'; root.add(zone);
  const ignored = new THREE.Mesh(new THREE.BoxGeometry()); ignored.name = 'COL_BOX_IGNORED'; zone.add(ignored);
  root.add(new THREE.Mesh(new THREE.BoxGeometry()));
  const physics = new PhysicsWorld(); await physics.init();
  try {
    new WorldColliders(physics).createFromEnvironment(root);
    const shapes = []; physics.world.colliders.forEach(collider => shapes.push(collider.shape.type));
    assert.equal(shapes.length, 2);
    assert.ok(shapes.includes(physics.rapier.ShapeType.Cuboid));
    assert.ok(shapes.includes(physics.rapier.ShapeType.Cylinder));
    assert.equal(owner.visible, false); assert.equal(inner.visible, false); assert.equal(zone.visible, false);
  } finally { physics.world.free(); }
});

test.after(async () => { await rm(temporary, { recursive: true, force: true }); });
