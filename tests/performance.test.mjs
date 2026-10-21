import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Real scene objects and effect code; the renderer is a controlled test double.
// This suite does not require a GPU or claim to measure frame rate.
globalThis.window = { location: { search: '' }, devicePixelRatio: 1 };
const temporary = await mkdtemp(new URL('../.perf-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: {
  contents: `export { getPerformanceOptions } from './src/core/PerformanceOptions';
    export { Renderer } from './src/core/Renderer';
    export { batchHouseBeams } from './src/world/house/batchHouseBeams';
    export { HouseFurnitureInteractions } from './src/world/house/furniture/HouseFurnitureInteractions';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { getPerformanceOptions, Renderer, HouseFurnitureInteractions, batchHouseBeams } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

test('normal quality stays enabled with stats opt-in, switches remain independent', () => {
  const normal = getPerformanceOptions('', 1.1);
  assert.equal(normal.pixelRatio, 1.1);
  assert.equal(normal.outlines, true);
  assert.equal(normal.shadows, true);
  assert.equal(normal.stats, false);
  assert.equal(normal.gpuStats, false);
  const outlinedOff = getPerformanceOptions('?perfdiag=1&outlines=0', 1.1);
  assert.equal(outlinedOff.outlines, false);
  assert.equal(outlinedOff.shadows, true);
  assert.equal(outlinedOff.pixelRatio, 1.1);
  assert.equal(getPerformanceOptions('?stats=1', 1).gpuStats, false);
  assert.equal(getPerformanceOptions('?gpuStats=1', 1).stats, true);
  assert.equal(getPerformanceOptions('?decorativeLights=0', 1).decorativeLights, false);
  assert.equal(normal.beamBatching, true);
  assert.equal(getPerformanceOptions('?beamBatching=0', 1).beamBatching, false);
});

test('DPR rejects invalid values and lowfx overrides expensive effects', () => {
  assert.equal(getPerformanceOptions('?dpr=garbage', 1.5).pixelRatio, 1.5);
  assert.equal(getPerformanceOptions('?dpr=-1', 1.5).pixelRatio, 1.5);
  assert.equal(getPerformanceOptions('?dpr=0.01', 1.5).pixelRatio, 0.5);
  assert.equal(getPerformanceOptions('?dpr=8', 3).pixelRatio, 2);
  const low = getPerformanceOptions('?lowfx=1&gpuStats=1', 2);
  assert.equal(low.pixelRatio, 1);
  assert.equal(low.outlines, false);
  assert.equal(low.shadows, false);
  assert.equal(low.gpuStats, false);
  assert.equal(getPerformanceOptions('?lowfx=0', 2).outlines, true);
});

function rendererFixture(outlines = true) {
  const renderer = Object.create(Renderer.prototype);
  const info = { render: { calls: 99, triangles: 999 }, memory: {},
    reset() { this.render.calls = 0; this.render.triangles = 0; } };
  const draw = () => { info.render.calls++; info.render.triangles += 100; };
  Object.assign(renderer, {
    options: { outlines, perfDiag: false }, outlinedObject: null,
    instance: { info, render: draw }, outlinePass: { selectedObjects: [] },
    renderPass: {}, composer: { render() { draw(); draw(); draw(); } },
    hasInteractionOutline: false,
  });
  return renderer;
}

test('outline path counts all passes, clears counters each frame, and returns to direct rendering', () => {
  const renderer = rendererFixture();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry()));
  renderer.setInteractionOutline(group);
  renderer.render({}, {});
  assert.equal(renderer.instance.info.render.calls, 3);
  renderer.render({}, {});
  assert.equal(renderer.instance.info.render.calls, 3);
  renderer.setInteractionOutline(null);
  renderer.render({}, {});
  assert.equal(renderer.instance.info.render.calls, 1);
  assert.deepEqual(renderer.outlinePass.selectedObjects, []);
});

test('disabled outlines use direct rendering even if a target is supplied', () => {
  const renderer = rendererFixture(false);
  renderer.setInteractionOutline(new THREE.Mesh(new THREE.BoxGeometry()));
  renderer.render({}, {});
  assert.equal(renderer.instance.info.render.calls, 1);
});

test('hidden bubbles do not upload matrices; activation and deactivation remain functional', () => {
  const effects = Object.create(HouseFurnitureInteractions.prototype);
  Object.assign(effects, { elapsed: 1, bubblePosition: new THREE.Vector3(),
    bubbleScale: new THREE.Vector3(), bubbleMatrix: new THREE.Matrix4(),
    bubbleQuaternion: new THREE.Quaternion() });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial(), 11);
  const node = { def: { kind: 'cauldron' }, progress: 0, burst: 0, phase: 0,
    active: false, aura: new THREE.Sprite(), auraMaterial: new THREE.SpriteMaterial(),
    bubbles, effectSize: 0.3 };
  const version = bubbles.instanceMatrix.version;
  effects.animateNode(node, 1 / 60);
  assert.equal(bubbles.visible, false);
  assert.equal(bubbles.instanceMatrix.version, version);
  node.active = true;
  effects.animateNode(node, 1 / 60);
  assert.equal(bubbles.visible, true);
  assert.equal(bubbles.instanceMatrix.version, version + 1);
  node.active = false;
  for (let i = 0; i < 120; i++) effects.animateNode(node, 1 / 60);
  assert.equal(bubbles.visible, false);
  const settledVersion = bubbles.instanceMatrix.version;
  effects.animateNode(node, 1 / 60);
  assert.equal(bubbles.instanceMatrix.version, settledVersion);
});

test('all compressed asset buffers decode with the game Three.js decoder', async () => {
  await MeshoptDecoder.ready;
  for (const name of ['house', 'world', 'book']) {
    const b = await readFile(new URL(`../public/assets/models/environment/${name}.glb`, import.meta.url));
    const length = b.readUInt32LE(12);
    const json = JSON.parse(b.subarray(20, 20 + length));
    const binary = b.subarray(28 + length);
    let decoded = 0;
    for (const view of json.bufferViews) {
      const extension = view.extensions?.EXT_meshopt_compression;
      if (!extension) continue;
      const e = extension;
      const target = new Uint8Array(e.count * e.byteStride);
      MeshoptDecoder.decodeGltfBuffer(target, e.count, e.byteStride,
        binary.subarray(e.byteOffset ?? 0, (e.byteOffset ?? 0) + e.byteLength), e.mode, e.filter);
      decoded++;
    }
    assert.ok(decoded > 0, `${name} has compressed geometry`);
  }
});

test('the game loader resolves animated book page names and morph tracks', async () => {
  const bytes = await readFile(new URL('../public/assets/models/environment/book.glb', import.meta.url));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  assert.ok(gltf.scene.getObjectByName('BOOK_DETAILS_PAGE'));
  assert.ok(gltf.scene.getObjectByName('BOOK_SCREENSHOT_PAGE'));
  assert.ok(gltf.scene.getObjectByName('BOOK_TURNING_PAGE'));
  assert.equal(gltf.animations.length, 2);
  assert.ok(gltf.animations.some(a => a.tracks.some(t => t.name.includes('morphTargetInfluences'))));
  const mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) mixer.clipAction(clip).play();
  mixer.update(0.5);
  const weights = [];
  gltf.scene.getObjectByName('BOOK_TURNING_PAGE').traverse(mesh => {
    if (mesh.morphTargetInfluences) weights.push(...mesh.morphTargetInfluences);
  });
  assert.ok(weights.length > 0);
  assert.ok(weights.every(Number.isFinite));
});

test('beam batches preserve world positions, normals, UVs, material and shadow settings', () => {
  const root = new THREE.Group();
  root.position.set(0, -30, 0);
  root.rotation.y = 0.4;
  const parent = new THREE.Group();
  parent.position.set(2, 1, -3);
  parent.rotation.z = 0.2;
  root.add(parent);
  const material = new THREE.MeshStandardMaterial();
  const sources = [0, 1].map(i => {
    const geometry = new THREE.BoxGeometry(0.2, 1, 0.2);
    geometry.clearGroups();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `BEAM_CORNER_${i}`;
    mesh.position.set(i, 2, 3);
    mesh.rotation.x = 0.1 * i;
    mesh.scale.set(1, 2 + i, 1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  });
  root.updateWorldMatrix(true, true);
  const expectedPositions = [], expectedNormals = [], expectedUVs = [];
  for (const mesh of sources) {
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const uv = mesh.geometry.getAttribute('uv');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      expectedPositions.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
      expectedNormals.push(new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix));
      expectedUVs.push([uv.getX(i), uv.getY(i)]);
    }
  }
  const originals = sources.map(m => m.geometry.getAttribute('position').array.slice());
  assert.deepEqual(batchHouseBeams(root), { sourceMeshes: 2, batches: 1, triangles: 24 });
  const batch = root.getObjectByName('HOUSE_BEAM_BATCH_1');
  root.updateWorldMatrix(true, true);
  const position = batch.geometry.getAttribute('position');
  const normal = batch.geometry.getAttribute('normal');
  const uv = batch.geometry.getAttribute('uv');
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(batch.matrixWorld);
  for (let i = 0; i < position.count; i++) {
    const actualPosition = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(batch.matrixWorld);
    const actualNormal = new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix);
    assert.ok(actualPosition.distanceTo(expectedPositions[i]) < 0.000002);
    assert.ok(actualNormal.distanceTo(expectedNormals[i]) < 0.000002);
    assert.deepEqual([uv.getX(i), uv.getY(i)], expectedUVs[i]);
  }
  assert.equal(batch.material, material);
  assert.equal(batch.castShadow, true);
  assert.equal(batch.receiveShadow, true);
  sources.forEach((mesh, i) => {
    assert.equal(root.getObjectByName(mesh.name), mesh);
    assert.equal(mesh.visible, false);
    assert.deepEqual(mesh.geometry.getAttribute('position').array, originals[i]);
  });
  assert.deepEqual(batchHouseBeams(root), { sourceMeshes: 0, batches: 0, triangles: 0 });
});

test('batching excludes gameplay, hidden, mirrored, transparent, morphing and animated beams', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const excluded = [];
  const add = (index, parent = root) => {
    const geometry = new THREE.BoxGeometry();
    geometry.clearGroups();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `BEAM_CORNER_${index}`;
    parent.add(mesh);
    excluded.push(mesh);
    return mesh;
  };
  const gameplay = new THREE.Group();
  gameplay.name = 'SEC_TEST'; root.add(gameplay);
  add(1, gameplay); add(2, gameplay);
  add(3).visible = false;
  add(4).scale.x = -1;
  add(5).material = new THREE.MeshStandardMaterial({ transparent: true });
  const morph = add(6);
  morph.geometry.morphAttributes.position = [morph.geometry.getAttribute('position').clone()];
  const animated = new THREE.Group(); animated.name = 'MovingParent'; root.add(animated);
  add(7, animated); add(8, animated);
  const clips = [new THREE.AnimationClip('moving', 1, [
    new THREE.VectorKeyframeTrack('MovingParent.position', [0, 1], [0, 0, 0, 0, 1, 0]),
  ])];
  const flags = excluded.map(m => m.visible);
  assert.deepEqual(batchHouseBeams(root, clips), { sourceMeshes: 0, batches: 0, triangles: 0 });
  assert.deepEqual(excluded.map(m => m.visible), flags);
});

test('the current house batches exactly 61 static beams into 2 render meshes', async () => {
  const bytes = await readFile(new URL('../public/assets/models/environment/house.glb', import.meta.url));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length));
  // Texture bytes are verified separately. Omit texture references for this CPU
  // scene-structure test, which does not have browser image decoding or WebGL.
  const removeTextureReferences = value => {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (key.endsWith('Texture')) delete value[key];
      else removeTextureReferences(value[key]);
    }
  };
  json.materials.forEach(removeTextureReferences);
  delete json.images; delete json.textures; delete json.samplers;
  let encoded = Buffer.from(JSON.stringify(json));
  encoded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
  const header = Buffer.from(bytes.subarray(0, 20));
  const tail = bytes.subarray(20 + length);
  header.writeUInt32LE(20 + encoded.length + tail.length, 8);
  header.writeUInt32LE(encoded.length, 12);
  const testBytes = Buffer.concat([header, encoded, tail]);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(testBytes.buffer.slice(testBytes.byteOffset, testBytes.byteOffset + testBytes.byteLength), '');
  assert.deepEqual(batchHouseBeams(gltf.scene, gltf.animations), { sourceMeshes: 61, batches: 2, triangles: 5104 });
  const colliders = [];
  gltf.scene.traverse(object => { if (object.name.startsWith('COL_')) colliders.push(object); });
  assert.ok(colliders.length > 0);
  // This mirrored window bar retains its original rendering/winding.
  assert.ok(gltf.scene.getObjectByName('WINDOW_BAR_VERTICAL002').visible);
  assert.ok(gltf.scene.getObjectByName('INTERACT_EXIT_DOOR_01').visible);
  assert.ok(gltf.scene.getObjectByName('SEC_WORKSHOP_WeaponStand').visible);
  assert.ok(gltf.scene.getObjectByName('SEC_ALCHEMY_Cauldron').visible);
});
