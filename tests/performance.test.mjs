import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
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
    export { HouseFurnitureInteractions } from './src/world/house/furniture/HouseFurnitureInteractions';`,
  resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { getPerformanceOptions, Renderer, HouseFurnitureInteractions } = await import(pathToFileURL(bundle));
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
