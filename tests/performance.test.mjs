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
  contents: `export { getPerformanceOptions, performanceOptions } from './src/core/PerformanceOptions';
    export { Renderer } from './src/core/Renderer';
    export { World } from './src/world/World';
    export { Player } from './src/world/player/Player';
    export { NpcManager } from './src/world/npc/NpcManager';
    export { InteractionHint } from './src/ui/InteractionHint/InteractionHint';
    export { WorkshopExperience } from './src/world/house/workshop/WorkshopExperience';
    export { WorkshopSound } from './src/world/house/workshop/WorkshopSound';
    export { createWorkshopCue } from './src/world/house/workshop/WorkshopCue';
    export { JourneyMapExperience } from './src/world/house/journey/JourneyMapExperience';
    export { batchHouseBeams } from './src/world/house/batchHouseBeams';
    export { HouseFurnitureInteractions } from './src/world/house/furniture/HouseFurnitureInteractions';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty', '.html': 'text' } });
const { getPerformanceOptions, performanceOptions, Renderer, HouseFurnitureInteractions, batchHouseBeams, World, Player, NpcManager, InteractionHint, WorkshopExperience, WorkshopSound, createWorkshopCue, JourneyMapExperience } = await import(pathToFileURL(bundle));
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
  assert.equal(normal.activeLightsOnly, true);
  assert.equal(normal.workshopLights, 'all');
  assert.equal(getPerformanceOptions('?workshopLights=all', 1).workshopLights, 'all');
  assert.equal(getPerformanceOptions('?workshopLights=focused', 1).workshopLights, 'focused');
  assert.equal(getPerformanceOptions('?perfdiag=1', 1).outlines, true);
  assert.equal(getPerformanceOptions('?perfdiag=1&outlines=1&workshopLights=all', 1).outlines, true);
  assert.equal(getPerformanceOptions('?workshopLights=all', 1).decorativeLights, true);
  assert.equal(getPerformanceOptions('?activeLightsOnly=0', 1).activeLightsOnly, false);
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
    bubbles, light: new THREE.PointLight(0xffffff, 0), effectSize: 0.3 };
  const version = bubbles.instanceMatrix.version;
  effects.animateNode(node, 1 / 60);
  assert.equal(bubbles.visible, false);
  assert.equal(node.light.visible, false);
  assert.equal(bubbles.instanceMatrix.version, version);
  node.active = true;
  effects.animateNode(node, 1 / 60);
  assert.equal(bubbles.visible, true);
  assert.equal(node.light.visible, true);
  assert.ok(node.light.intensity > 0);
  assert.equal(bubbles.instanceMatrix.version, version + 1);
  node.active = false;
  for (let i = 0; i < 120; i++) effects.animateNode(node, 1 / 60);
  assert.equal(bubbles.visible, false);
  assert.equal(node.light.visible, false);
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

test('fixed physics steps run at 60 Hz while animation advances once for the accumulated time', () => {
  const world = Object.create(World.prototype);
  const physicsDeltas = [], animationDeltas = [];
  let physicalSteps = 0, syncs = 0;
  Object.assign(world, {
    initialized: true, physicsAccumulator: 0, fixedPhysicsStep: 1 / 60, maxPhysicsSteps: 5,
    perfDiag: false, physicsDebugRenderer: { update() {} },
    physics: { beginFrame() {}, step() { physicalSteps++; } },
    player: { updatePhysics(dt) { physicsDeltas.push(dt); },
      updateAnimation(dt) { animationDeltas.push(dt); }, syncFromPhysics() { syncs++; } },
  });
  world.update(0.05, false);
  assert.equal(physicalSteps, 3);
  assert.equal(syncs, 1);
  assert.deepEqual(physicsDeltas, [1 / 60, 1 / 60, 1 / 60]);
  assert.deepEqual(animationDeltas, [0.05]);
  world.update(0, false);
  assert.equal(animationDeltas.length, 1);
  world.update(0.1, false);
  assert.equal(physicalSteps, 8);
  assert.equal(animationDeltas.length, 2);
  assert.equal(animationDeltas[1], 5 / 60);
});

test('player physics does not resample animation and one visual update preserves the final pose', () => {
  const model = new THREE.Group();
  const arm = new THREE.Object3D(); arm.name = 'arm'; model.add(arm);
  const clip = new THREE.AnimationClip('reach', 1, [new THREE.NumberKeyframeTrack('arm.position[x]', [0, 1], [0, 1])]);
  const mixer = new THREE.AnimationMixer(model); mixer.clipAction(clip).play();
  const player = Object.create(Player.prototype);
  let controllerCalls = 0;
  Object.assign(player, { mixer, controller: { update() { controllerCalls++; } } });
  for (let i = 0; i < 3; i++) player.updatePhysics(1 / 60);
  assert.equal(controllerCalls, 3);
  assert.equal(mixer.time, 0);
  player.updateAnimation(0.05);
  assert.ok(Math.abs(arm.position.x - 0.05) < 0.000001);
});

test('unchanged interaction hints avoid DOM writes and still update on state changes', () => {
  const hint = Object.create(InteractionHint.prototype);
  let textWrites = 0, adds = 0, removes = 0, text = '';
  Object.assign(hint, { visible: false, currentLabel: null,
    label: { set textContent(value) { text = value; textWrites++; } },
    root: { classList: { add() { adds++; }, remove() { removes++; } } },
  });
  for (let i = 0; i < 60; i++) hint.show('Open');
  assert.equal(textWrites, 1); assert.equal(adds, 1);
  hint.show('Close'); assert.equal(text, 'Close'); assert.equal(textWrites, 2);
  hint.hide(); hint.hide(); assert.equal(removes, 1);
  hint.show('Close'); assert.equal(adds, 2); assert.equal(textWrites, 2);
});

test('only flat workshop and map rings request a single double-sided transparency pass', () => {
  const workshop = Object.create(WorkshopExperience.prototype);
  workshop.glowTexture = new THREE.Texture();
  const glow = workshop.makeTreasureGlow(0, new THREE.Group(), new THREE.Group());
  assert.equal(glow.glowRune.material.forceSinglePass, true);
  assert.equal(glow.glowRune.material.side, THREE.DoubleSide);
  const journey = Object.create(JourneyMapExperience.prototype);
  Object.assign(journey, { root: new THREE.Group(), stops: [], glowTexture: new THREE.Texture() });
  journey.createStop({}, new THREE.Vector3(), 0);
  assert.equal(journey.stops[0].ring.material.forceSinglePass, true);
  assert.equal(journey.stops[0].ring.material.side, THREE.DoubleSide);
});

test('workshop lights all four crafts by default and limits lights only when explicitly requested', () => {
  const workshop = Object.create(WorkshopExperience.prototype);
  const scene = new THREE.Scene(), house = new THREE.Group();
  house.position.set(10, -30, 3); house.scale.setScalar(2); scene.add(house);
  scene.add(new THREE.PointLight()); // Main warm house light.
  const camera = new THREE.PerspectiveCamera();
  Object.assign(workshop, { house, camera, artifacts: [], glowTexture: new THREE.Texture(),
    state: 'idle', selectedIndex: -1, hoveredIndex: -1, activeGlowIndex: 0,
    lightCameraPosition: new THREE.Vector3(), lightPosition: new THREE.Vector3() });
  for (let index = 0; index < 4; index++) {
    const anchor = new THREE.Group(), floating = new THREE.Group();
    floating.position.x = index * 4; anchor.add(floating); house.add(anchor);
    workshop.artifacts.push({ anchor, floating, ...workshop.makeTreasureGlow(index, anchor, floating) });
  }
  const count = () => { let n = 0; scene.traverseVisible(x => { if (x.isPointLight) n++; }); return n; };
  const visible = () => workshop.artifacts.flatMap((a, i) => a.glowLight.visible ? [i] : []);
  const first = workshop.artifacts[0].glowLight.getWorldPosition(new THREE.Vector3());
  assert.equal(count(), 5);
  camera.position.copy(first);
  workshop.updateTreasureLights(); assert.deepEqual(visible(), [0, 1, 2, 3]);
  workshop.state = 'active'; workshop.selectedIndex = 2; workshop.hoveredIndex = 3;
  workshop.updateTreasureLights(); assert.deepEqual(visible(), [0, 1, 2, 3]);
  const previous = performanceOptions.workshopLights;
  try {
    performanceOptions.workshopLights = 'focused';
    workshop.state = 'idle'; workshop.selectedIndex = -1; workshop.hoveredIndex = -1;
    workshop.updateTreasureLights(); assert.deepEqual(visible(), [0]);
    workshop.updateTreasureLights(); assert.equal(count(), 2);
    camera.position.x = first.x + 4.02; // Hysteresis across the midpoint.
    workshop.updateTreasureLights(); assert.deepEqual(visible(), [0]);
    camera.position.x = first.x + 6;
    workshop.updateTreasureLights(); assert.deepEqual(visible(), [1]);
    workshop.state = 'active';
    for (let index = 0; index < 4; index++) {
      workshop.selectedIndex = index; workshop.hoveredIndex = (index + 1) % 4;
      workshop.updateTreasureLights();
      assert.deepEqual(visible(), [index]); assert.equal(count(), 2);
    }
    workshop.selectedIndex = -1; workshop.hoveredIndex = 2;
    workshop.updateTreasureLights(); assert.deepEqual(visible(), [2]);
    for (const artifact of workshop.artifacts) {
      assert.equal(artifact.glowHalo.visible, true);
      assert.equal(artifact.glowRune.visible, true);
      assert.equal(artifact.glowLight.castShadow, false);
    }
    performanceOptions.workshopLights = 'all';
    workshop.updateTreasureLights(); assert.equal(count(), 5);
  } finally { performanceOptions.workshopLights = previous; }
});

test('procedural workshop WAV cues retain timing, mono PCM, low amplitude, and pitched feedback', () => {
  const expectedDuration = { enter: 0.34, select: 0.335, close: 0.15, exit: 0.2 };
  for (const [cue, duration] of Object.entries(expectedDuration)) {
    for (let index = 0; index < 4; index++) {
      const buffer = createWorkshopCue(cue, index), bytes = new Uint8Array(buffer), view = new DataView(buffer);
      const ascii = (a, b) => String.fromCharCode(...bytes.slice(a, b));
      assert.equal(ascii(0, 4), 'RIFF'); assert.equal(ascii(8, 12), 'WAVE');
      assert.equal(ascii(36, 40), 'data');
      assert.equal(view.getUint32(4, true), buffer.byteLength - 8);
      assert.equal(view.getUint16(20, true), 1); // PCM, mono, 16-bit.
      assert.equal(view.getUint16(22, true), 1); assert.equal(view.getUint16(34, true), 16);
      const rate = view.getUint32(24, true), frames = view.getUint32(40, true) / 2;
      assert.equal(rate, 22050); assert.equal(buffer.byteLength, 44 + frames * 2);
      assert.ok(Math.abs(frames / rate - duration) < 1 / rate);
      let peak = 0;
      for (let frame = 0; frame < frames; frame++) {
        const value = view.getInt16(44 + frame * 2, true);
        if (frame < Math.floor(0.012 * rate)) assert.equal(value, 0);
        peak = Math.max(peak, Math.abs(value));
      }
      assert.ok(peak > 1000 && peak < 32767);
      if (cue === 'close') {
        let crossings = 0;
        for (let f = Math.ceil(0.022 * rate); f < Math.floor(0.112 * rate); f++) {
          if (view.getInt16(44 + (f - 1) * 2, true) <= 0 && view.getInt16(44 + f * 2, true) > 0) crossings++;
        }
        assert.ok(Math.abs(crossings - [392, 330, 294, 440][index] * 0.75 * 0.09) < 2);
      }
    }
  }
  assert.deepEqual(createWorkshopCue('select', -2), createWorkshopCue('select', 0));
  assert.deepEqual(createWorkshopCue('select', 8), createWorkshopCue('select', 3));
});

test('workshop sound reuses bounded media voices, respects mute, and releases audio URLs', async () => {
  const previousAudio = globalThis.Audio;
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  const voices = [], blobs = [], revoked = [];
  let enabled = false, rejectPlayback = false;
  class AudioDouble {
    constructor(src) { this.src = src; this.currentTime = 0.5; this.plays = 0; voices.push(this); }
    pause() { this.paused = true; }
    play() { this.plays++; this.paused = false; return rejectPlayback ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { this.reloaded = true; }
  }
  try {
    globalThis.Audio = AudioDouble;
    URL.createObjectURL = blob => { blobs.push(blob); return `blob:cue-${blobs.length}`; };
    URL.revokeObjectURL = url => { revoked.push(url); };
    const sound = new WorkshopSound(() => enabled);
    sound.play('enter'); assert.equal(voices.length, 0);
    enabled = true;
    sound.play('enter'); sound.play('enter'); sound.play('enter');
    assert.equal(voices.length, 2); assert.equal(blobs.length, 1);
    assert.equal(voices.reduce((n, v) => n + v.plays, 0), 3);
    assert.equal(blobs[0].type, 'audio/wav');
    assert.equal(voices[0].currentTime, 0); assert.equal(voices[0].volume, 0.02);
    sound.play('select', 2); assert.equal(voices.length, 4); assert.equal(blobs.length, 2);
    rejectPlayback = true; sound.play('exit'); await Promise.resolve();
    assert.equal(voices.length, 6);
    enabled = false; const plays = voices.reduce((n, v) => n + v.plays, 0);
    sound.play('close'); assert.equal(voices.reduce((n, v) => n + v.plays, 0), plays);
    sound.destroy(); sound.destroy();
    assert.equal(revoked.length, 3);
    assert.ok(voices.every(v => v.paused && v.src === '' && v.reloaded));
    enabled = true; sound.play('close'); assert.equal(voices.length, 6);
  } finally {
    globalThis.Audio = previousAudio;
    URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke;
  }
});

test('detached exterior/NPCs skip scene matrix updates and retain their transforms on return', () => {
  const scene = new THREE.Scene();
  const model = new THREE.Group(); model.position.set(1, 2, 3);
  const npc = new THREE.Group(); npc.position.set(4, 5, 6);
  scene.add(model, npc);
  const witness = new THREE.Object3D(); model.add(witness);
  let updates = 0;
  witness.updateMatrixWorld = function(force) { updates++; THREE.Object3D.prototype.updateMatrixWorld.call(this, force); };
  const manager = Object.create(NpcManager.prototype);
  Object.assign(manager, { scene, npcs: [{ model: npc }], visible: true });
  const world = Object.create(World.prototype);
  Object.assign(world, { scene, model, npcManager: manager });
  scene.updateMatrixWorld(true); const before = updates;
  world.setExteriorVisible(false);
  scene.updateMatrixWorld(true);
  assert.equal(updates, before);
  assert.equal(model.parent, null); assert.equal(npc.parent, null);
  world.setExteriorVisible(true);
  scene.updateMatrixWorld(true);
  assert.ok(updates > before);
  assert.equal(model.parent, scene); assert.equal(npc.parent, scene);
  assert.deepEqual(model.getWorldPosition(new THREE.Vector3()).toArray(), [1, 2, 3]);
  assert.deepEqual(npc.getWorldPosition(new THREE.Vector3()).toArray(), [4, 5, 6]);
});

test('an NPC loaded while indoors stays detached until the exterior is restored', () => {
  const manager = Object.create(NpcManager.prototype);
  const scene = new THREE.Scene();
  Object.assign(manager, { scene, npcs: [], visible: false });
  const model = new THREE.Group();
  const clips = Object.fromEntries(['idle', 'talking_1', 'talking_2', 'talking_3']
    .map(name => [name, new THREE.AnimationClip(name, 1, [])]));
  manager.createNpc({ id: 'late', name: 'Late', company: '', position: new THREE.Vector3(1, 0, 2), dialogues: [] }, model, clips);
  assert.equal(model.parent, null); assert.equal(model.visible, false);
  const animator = manager.npcs[0].animator;
  manager.setVisible(true);
  assert.equal(model.parent, scene); assert.equal(model.visible, true);
  assert.equal(manager.npcs[0].animator, animator);
});

test('seven idle furniture lights leave the shader light list and return while effects are active', () => {
  const scene = new THREE.Scene();
  const house = new THREE.Group(); scene.add(house);
  // One interior fill point light and the four workshop lights stay enabled.
  for (let i = 0; i < 5; i++) scene.add(new THREE.PointLight());
  const effects = Object.create(HouseFurnitureInteractions.prototype);
  Object.assign(effects, { house, texture: new THREE.Texture(), elapsed: 0,
    bubblePosition: new THREE.Vector3(), bubbleScale: new THREE.Vector3(),
    bubbleMatrix: new THREE.Matrix4(), bubbleQuaternion: new THREE.Quaternion() });
  const nodes = ['cauldron', 'potion', 'potion', 'potion', 'sink', 'flame', 'flame'].map((kind, i) => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    house.add(model);
    return effects.makeNode({ id: `test-${i}`, kind, color: 0xffaa77 }, model);
  });
  const countLights = () => { let count = 0; scene.traverseVisible(o => { if (o.isPointLight) count++; }); return count; };
  assert.equal(countLights(), 5);
  for (const node of nodes) { node.active = true; effects.animateNode(node, 1 / 60); }
  assert.equal(countLights(), 12);
  for (const node of nodes) node.active = false;
  for (let i = 0; i < 120; i++) for (const node of nodes) effects.animateNode(node, 1 / 60);
  assert.equal(countLights(), 5);
});
