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

test.after(async () => { await rm(temporary, { recursive: true, force: true }); });
