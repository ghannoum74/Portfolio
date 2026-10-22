import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MeshoptEncoder } from 'meshoptimizer';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Real scene objects and effect code; the renderer is a controlled test double.
// This suite does not require a GPU or claim to measure frame rate.
globalThis.window = { location: { search: '' }, devicePixelRatio: 1 };
const temporary = await mkdtemp(new URL('../.perf-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: {
  contents: `export { getPerformanceOptions, performanceOptions } from './src/core/PerformanceOptions';
    export { Renderer } from './src/core/Renderer';
    export { InteractionHighlight } from './src/core/InteractionHighlight';
    export { HouseStoneLod, HOUSE_STONE_NAMES, geometryHash, sha256 } from './src/world/house/HouseStoneLod';
    export { HouseInterior } from './src/world/house/HouseInterior';
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
const { HouseStoneLod, HOUSE_STONE_NAMES, geometryHash, sha256, HouseInterior, getPerformanceOptions, performanceOptions, Renderer, InteractionHighlight, HouseFurnitureInteractions, batchHouseBeams, World, Player, NpcManager, InteractionHint, WorkshopExperience, WorkshopSound, createWorkshopCue, JourneyMapExperience } = await import(pathToFileURL(bundle));
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
  assert.equal(normal.stoneLod, true);
  assert.equal(getPerformanceOptions('?stoneLod=0', 1).stoneLod, false);
  assert.equal(getPerformanceOptions('?stoneLod=0', 1).beamBatching, true);
  assert.equal(normal.activeLightsOnly, true);
  assert.equal(normal.workshopLights, 'inspect');
  assert.equal(normal.highlightMode, 'border');
  assert.equal(getPerformanceOptions('?highlight=outline', 1).highlightMode, 'outline');
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

function rendererFixture(outlines = true, highlightMode = 'outline') {
  const renderer = Object.create(Renderer.prototype);
  const info = { render: { calls: 99, triangles: 999 }, memory: {},
    reset() { this.render.calls = 0; this.render.triangles = 0; } };
  const draw = () => { info.render.calls++; info.render.triangles += 100; };
  Object.assign(renderer, {
    options: { outlines, highlightMode, perfDiag: false }, outlinedObject: null,
    borderHighlight: new InteractionHighlight(),
    instance: { info, render: draw }, outlinePass: { selectedObjects: [] },
    renderPass: {}, composer: { render() { draw(); draw(); draw(); } },
    hasInteractionOutline: false,
  });
  return renderer;
}

test('opt-in outline path counts all passes, clears counters each frame, and returns to direct rendering', () => {
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

test('default border uses one scene submission without a composer or surface tint', () => {
  const renderer = rendererFixture(true, 'border');
  renderer.composer = undefined; renderer.outlinePass = undefined; renderer.renderPass = undefined;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const material = new THREE.MeshStandardMaterial({ color: 0x625031, emissive: 0x101010 });
  // The reported regression is a flat door: normals cannot expand its silhouette.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material); scene.add(mesh);
  renderer.setupInteractionOutline(scene, camera);
  assert.equal(renderer.composer, undefined);
  renderer.setInteractionOutline(mesh);
  assert.equal(renderer.borderHighlight.active, true);
  assert.deepEqual(mesh.material.color, material.color);
  assert.deepEqual(mesh.material.emissive, material.emissive);
  const root = scene.getObjectByName('INTERACTION_BORDER');
  assert.equal(root.children.length, 1);
  const rim = root.children[0];
  assert.ok(rim instanceof THREE.InstancedMesh);
  assert.equal(rim.count, 8); assert.equal(rim.geometry, mesh.geometry);
  assert.equal(mesh.material.stencilZPass, THREE.ReplaceStencilOp);
  assert.equal(rim.material.stencilFunc, THREE.NotEqualStencilFunc);
  assert.equal(rim.material.stencilRef, mesh.material.stencilRef);
  assert.equal(rim.material.stencilWriteMask, 0);
  assert.equal(rim.material.depthTest, true); assert.equal(rim.material.depthWrite, false);
  assert.equal(rim.material.blending, THREE.NoBlending);
  assert.equal(rim.castShadow, false); assert.equal(rim.frustumCulled, false);
  assert.equal(root.renderOrder, Number.MAX_SAFE_INTEGER);
  const hits = []; rim.raycast(null, hits); assert.deepEqual(hits, []);
  renderer.render(scene, camera); assert.equal(renderer.instance.info.render.calls, 1);
  renderer.render(scene, camera); assert.equal(renderer.instance.info.render.calls, 1);
  renderer.setInteractionOutline(null);
  assert.equal(scene.children.length, 1); assert.equal(mesh.material, material);
});

test('border masks isolate shared materials, follow authored colors, and release only owned resources', () => {
  const highlight = new InteractionHighlight(), scene = new THREE.Scene(), group = new THREE.Group();
  scene.add(group);
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ color: 0x625031, emissive: 0x101010, map: texture });
  const a = new THREE.Mesh(new THREE.BoxGeometry(), material), b = new THREE.Mesh(a.geometry, material);
  const outside = new THREE.Mesh(a.geometry, material); group.add(a, b); scene.add(outside);
  const originalColor = material.color.clone(), originalEmission = material.emissive.clone();
  highlight.setTarget(group);
  const clone = a.material;
  assert.notEqual(clone, material); assert.equal(b.material, clone);
  assert.equal(outside.material, material); assert.equal(material.stencilWrite, false);
  assert.equal(clone.map, texture);
  assert.deepEqual(clone.color, originalColor); assert.deepEqual(clone.emissive, originalEmission);
  material.color.set(0x203040); material.emissive.set(0x010203);
  material.opacity = 0.6; material.emissiveIntensity = 1.7;
  highlight.update();
  assert.deepEqual(clone.color, material.color); assert.deepEqual(clone.emissive, material.emissive);
  assert.equal(clone.opacity, 0.6); assert.equal(clone.emissiveIntensity, 1.7);
  let disposed = 0, textureDisposals = 0, geometryDisposals = 0, rimDisposals = 0;
  clone.addEventListener('dispose', () => { disposed++; });
  texture.addEventListener('dispose', () => { textureDisposals++; });
  a.geometry.addEventListener('dispose', () => { geometryDisposals++; });
  const root = scene.getObjectByName('INTERACTION_BORDER');
  for (const proxy of root.children) proxy.material.addEventListener('dispose', () => { rimDisposals++; });
  highlight.setTarget(group); assert.equal(a.material, clone);
  highlight.clear(); highlight.clear();
  assert.equal(a.material, material); assert.equal(b.material, material);
  assert.equal(disposed, 1); assert.equal(rimDisposals, 2);
  assert.equal(textureDisposals, 0); assert.equal(geometryDisposals, 0);
  assert.equal(root.parent, null); assert.equal(root.children.length, 0); assert.equal(highlight.active, false);
});

test('border restores arrays, skips invisible/custom helpers, and respects external replacement', () => {
  const highlight = new InteractionHighlight(), scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
  const basic = new THREE.MeshBasicMaterial({ color: 0x334455 });
  const shader = new THREE.ShaderMaterial();
  const originals = [basic, shader];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), originals); group.add(mesh);
  const hidden = new THREE.Mesh(mesh.geometry, basic); hidden.visible = false; group.add(hidden);
  const hit = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ colorWrite: false })); group.add(hit);
  const custom = new THREE.Mesh(mesh.geometry, basic.clone()); custom.material.onBeforeCompile = () => {}; group.add(custom);
  highlight.setTarget(group);
  assert.notEqual(mesh.material, originals); assert.notEqual(mesh.material[0], basic);
  assert.equal(mesh.material[1], shader); assert.equal(hidden.material, basic);
  assert.equal(hit.material.stencilWrite, false); assert.equal(custom.material.stencilWrite, false);
  const proxy = scene.getObjectByName('INTERACTION_BORDER').children[0];
  assert.equal(proxy.material[0].visible, true); assert.equal(proxy.material[1].visible, false);
  group.visible = false; highlight.update(); assert.equal(proxy.visible, false);
  group.visible = true; highlight.update(); assert.equal(proxy.visible, true);
  highlight.clear(); assert.equal(mesh.material, originals);
  highlight.setTarget(group);
  const replacement = new THREE.MeshStandardMaterial(); mesh.material = replacement;
  highlight.update(); assert.equal(scene.getObjectByName('INTERACTION_BORDER').children[0].visible, false);
  highlight.clear(); assert.equal(mesh.material, replacement);
});

test('border follows world transforms, flat double-sided alpha cutouts, and CSS-pixel sizing', () => {
  const highlight = new InteractionHighlight(), scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent);
  parent.position.set(2, 3, 4); parent.rotation.y = 0.7; parent.scale.set(1, 2, 3);
  const texture = new THREE.Texture(), alphaMap = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture, alphaMap, alphaTest: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material); parent.add(mesh);
  highlight.setSize(800, 600, 2); highlight.setTarget(mesh);
  const proxy = scene.getObjectByName('INTERACTION_BORDER').children[0];
  scene.updateMatrixWorld(true); proxy.onBeforeRender();
  assert.deepEqual(proxy.matrixWorld, mesh.matrixWorld);
  mesh.position.x = 3; scene.updateMatrixWorld(true); proxy.onBeforeRender();
  assert.deepEqual(proxy.matrixWorld, mesh.matrixWorld);
  const rim = proxy.material;
  assert.equal(rim.map, texture); assert.equal(rim.alphaMap, alphaMap); assert.equal(rim.alphaTest, 0.5);
  assert.equal(rim.side, THREE.DoubleSide); assert.equal(rim.forceSinglePass, true);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  rim.onBeforeCompile(shader);
  assert.deepEqual(shader.uniforms.borderViewport.value.toArray(), [1600, 1200]);
  assert.equal(shader.uniforms.borderWidth.value, 4);
  assert.ok(shader.vertexShader.includes('gl_InstanceID % 8'));
  assert.ok(shader.vertexShader.indexOf('gl_Position.xy +=') > shader.vertexShader.indexOf('#include <project_vertex>'));
  assert.ok(shader.fragmentShader.indexOf('diffuseColor.rgb = diffuse') > shader.fragmentShader.indexOf('#include <alphatest_fragment>'));
  highlight.setSize(1200, 900, 1);
  assert.deepEqual(shader.uniforms.borderViewport.value.toArray(), [1200, 900]);
  assert.equal(shader.uniforms.borderWidth.value, 2);
  parent.remove(mesh); highlight.update(); assert.equal(proxy.visible, false);
  highlight.clear();
});

test('rigid morph borders upload current weights only when they change and dispose their morph texture', () => {
  const highlight = new InteractionHighlight(), scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry();
  geometry.morphAttributes.position = [geometry.attributes.position.clone()];
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); scene.add(mesh);
  mesh.morphTargetInfluences[0] = 0.25;
  highlight.setTarget(mesh);
  const proxy = scene.getObjectByName('INTERACTION_BORDER').children[0];
  const texture = proxy.morphTexture;
  for (let i = 0; i < 8; i++) assert.equal(texture.image.data[i * 2 + 1], 0.25);
  const version = texture.version; highlight.update(); assert.equal(texture.version, version);
  mesh.morphTargetInfluences[0] = 0.75; highlight.update();
  for (let i = 0; i < 8; i++) assert.equal(texture.image.data[i * 2 + 1], 0.75);
  let disposed = 0; texture.addEventListener('dispose', () => { disposed++; });
  highlight.clear(); assert.equal(disposed, 1); assert.equal(proxy.morphTexture, null);
});

test('border keeps native skinning and morph poses without cloning or disposing skeletons', () => {
  const highlight = new InteractionHighlight(), scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry();
  geometry.morphAttributes.position = [geometry.attributes.position.clone()];
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const bone = new THREE.Bone(); mesh.add(bone); mesh.bind(new THREE.Skeleton([bone])); scene.add(mesh);
  highlight.setTarget(mesh);
  const proxies = scene.getObjectByName('INTERACTION_BORDER').children;
  assert.equal(proxies.length, 8);
  mesh.position.set(3, 4, 5); scene.updateMatrixWorld(true);
  mesh.morphTargetInfluences[0] = 0.4;
  for (const proxy of proxies) {
    assert.ok(proxy instanceof THREE.SkinnedMesh); proxy.onBeforeRender();
    assert.equal(proxy.skeleton, mesh.skeleton); assert.equal(proxy.geometry, mesh.geometry);
    assert.equal(proxy.morphTargetInfluences, mesh.morphTargetInfluences);
    assert.deepEqual(proxy.matrixWorld, mesh.matrixWorld);
    assert.deepEqual(proxy.bindMatrixInverse, mesh.bindMatrixInverse);
  }
  assert.equal(new Set(proxies.map(p => p.material)).size, 8);
  highlight.clear(); assert.equal(mesh.skeleton.bones[0], bone);
});

test('instanced borders preserve instance transforms and handle count changes without world copies', () => {
  const highlight = new InteractionHighlight(), scene = new THREE.Scene();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 3);
  mesh.count = 1; scene.add(mesh);
  const matrix = new THREE.Matrix4().makeTranslation(2, 3, 4); mesh.setMatrixAt(0, matrix);
  highlight.setTarget(mesh);
  const proxy = scene.getObjectByName('INTERACTION_BORDER').children[0], actual = new THREE.Matrix4();
  assert.equal(proxy.count, 8);
  for (let i = 0; i < 8; i++) { proxy.getMatrixAt(i, actual); assert.deepEqual(actual, matrix); }
  matrix.makeTranslation(-2, -3, -4); mesh.setMatrixAt(1, matrix); mesh.count = 2;
  highlight.update(); assert.equal(proxy.count, 16);
  for (let i = 8; i < 16; i++) { proxy.getMatrixAt(i, actual); assert.deepEqual(actual, matrix); }
  const version = proxy.instanceMatrix.version; highlight.update(); assert.equal(proxy.instanceMatrix.version, version);
  matrix.makeTranslation(1, 1, 1); mesh.setMatrixAt(1, matrix); mesh.instanceMatrix.needsUpdate = true;
  highlight.update(); proxy.getMatrixAt(8, actual); assert.deepEqual(actual, matrix);
  highlight.clear();
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
  const gltf = await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url));
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

async function encodedLod(indices, error) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const encoded = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(indices.buffer), indices.length, 4);
  const decoded = new Uint32Array(indices.length);
  MeshoptDecoder.decodeIndexBuffer(new Uint8Array(decoded.buffer), decoded.length, 4, encoded);
  return { triangles: indices.length / 3, error, indices: Buffer.from(encoded).toString('base64'),
    hash: await sha256(new Uint8Array(decoded.buffer)) };
}

async function stoneFixture() {
  const root = new THREE.Group(), meshes = [], data = { version: 1, meshes: [] };
  for (const name of HOUSE_STONE_NAMES) {
    const geometry = new THREE.PlaneGeometry(2, 2, 4, 4);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = name;
    meshes.push(mesh); root.add(mesh);
    const indices = Uint32Array.from(geometry.index.array);
    data.meshes.push({ name, sourceHash: await geometryHash(geometry), sourceTriangles: indices.length / 3,
      levels: [await encodedLod(indices.slice(0, indices.length / 2), .01),
        await encodedLod(indices.slice(0, indices.length / 4), .04)] });
  }
  const camera = new THREE.PerspectiveCamera(90, 1, .01, 1000);
  const lod = await HouseStoneLod.create(root, data);
  return { root, meshes, data, camera, lod };
}

test('stone LOD changes only indices and restores close-up detail, materials, transforms and shared attributes', async () => {
  const { root, meshes, camera, lod } = await stoneFixture();
  const originals = meshes.map(m => m.geometry), materials = meshes.map(m => m.material);
  const indexBytes = originals.map(g => g.index.array.slice());
  camera.position.z = 5; lod.update(camera, 100);
  assert.deepEqual(lod.stats, { meshes: 2, sourceTriangles: 64, selectedTriangles: 16 });
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i]; assert.notEqual(mesh.geometry, originals[i]);
    assert.equal(mesh.parent, root); assert.equal(mesh.name, HOUSE_STONE_NAMES[i]);
    assert.equal(mesh.material, materials[i]); assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
    for (const name of Object.keys(originals[i].attributes)) assert.equal(mesh.geometry.attributes[name], originals[i].attributes[name]);
    assert.deepEqual(originals[i].index.array, indexBytes[i]);
  }
  camera.position.z = 1.8; lod.update(camera, 100);
  meshes.forEach((mesh, i) => assert.equal(mesh.geometry, originals[i]));
  lod.dispose();
});

test('stone LOD uses viewport, projection, world scale and hysteresis to avoid detail flicker', async () => {
  const { root, meshes, camera, lod } = await stoneFixture();
  camera.position.z = 4; lod.update(camera, 100); assert.equal(meshes[0].geometry.index.count / 3, 16);
  camera.position.z = 5; lod.update(camera, 100); assert.equal(meshes[0].geometry.index.count / 3, 8);
  camera.position.z = 4; lod.update(camera, 100); assert.equal(meshes[0].geometry.index.count / 3, 8);
  camera.position.z = 3; lod.update(camera, 100); assert.equal(meshes[0].geometry.index.count / 3, 16);
  camera.position.z = 5; lod.update(camera, 100); assert.equal(meshes[0].geometry.index.count / 3, 8);
  lod.update(camera, 200); assert.equal(meshes[0].geometry.index.count / 3, 16);
  camera.zoom = 3; camera.updateProjectionMatrix(); lod.update(camera, 100);
  assert.equal(meshes[0].geometry.index.count / 3, 16);
  camera.zoom = 1; camera.updateProjectionMatrix(); root.scale.set(2, 3, 1); lod.update(camera, 100);
  assert.equal(meshes[0].geometry.index.count / 3, 32);
  root.scale.setScalar(1); root.position.z = -30; camera.position.z = -25;
  lod.update(camera, 100); assert.equal(meshes[0].geometry.index.count / 3, 8);
  lod.dispose();
});

test('orthographic stone LOD follows zoom and preserves source buffers during disposal', async () => {
  const { meshes, lod } = await stoneFixture();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .01, 1000); camera.position.z = 20;
  const original = meshes[0].geometry; let sourceDisposals = 0, ownedDisposals = 0;
  original.addEventListener('dispose', () => { sourceDisposals++; });
  for (const entry of lod.entries) for (const level of entry.levels.slice(1)) {
    level.geometry.addEventListener('dispose', () => {
      ownedDisposals++; assert.equal(Object.keys(level.geometry.attributes).length, 0);
    });
  }
  lod.update(camera, 100); assert.equal(meshes[0].geometry.index.count / 3, 8);
  camera.position.z = 100; lod.update(camera, 100); assert.equal(meshes[0].geometry.index.count / 3, 8);
  camera.zoom = 3; camera.updateProjectionMatrix(); lod.update(camera, 100);
  assert.equal(meshes[0].geometry.index.count / 3, 16);
  lod.dispose(); lod.dispose();
  assert.equal(meshes[0].geometry, original); assert.equal(sourceDisposals, 0); assert.equal(ownedDisposals, 4);
  assert.equal(original.attributes.position.count, 25);
});

test('stale, malformed and corrupt LOD data leaves original house geometry usable', async () => {
  const { root, meshes, data, lod } = await stoneFixture(); lod.dispose();
  const originals = meshes.map(m => m.geometry);
  const invalid = [];
  let d = structuredClone(data); d.version = 2; invalid.push(d);
  d = structuredClone(data); d.meshes[1].name = 'INTERACT_EXIT_DOOR_01'; invalid.push(d);
  d = structuredClone(data); d.meshes[1].sourceHash = 'stale'; invalid.push(d);
  d = structuredClone(data); d.meshes[1].levels[0].hash = 'corrupt'; invalid.push(d);
  d = structuredClone(data); d.meshes[1].levels[0].error = NaN; invalid.push(d);
  d = structuredClone(data); d.meshes[1].levels[1].triangles = 1000000000; invalid.push(d);
  d = structuredClone(data);
  const indices = Uint32Array.from(meshes[1].geometry.index.array).slice(0, 48); indices[0] = 999;
  d.meshes[1].levels[0] = await encodedLod(indices, .01); invalid.push(d);
  for (const bad of invalid) {
    await assert.rejects(HouseStoneLod.create(root, bad));
    meshes.forEach((mesh, i) => assert.equal(mesh.geometry, originals[i]));
  }
  const movedUV = meshes[1].geometry.attributes.uv; movedUV.setX(0, movedUV.getX(0) + .25);
  await assert.rejects(HouseStoneLod.create(root, data), /source changed/);
  meshes.forEach((mesh, i) => assert.equal(mesh.geometry, originals[i]));
});

test('house LOD pauses outside, accepts optional-data failure, and respects external geometry replacement', async () => {
  const { root, meshes, camera, lod } = await stoneFixture();
  const interior = Object.create(HouseInterior.prototype); interior.model = root; interior.stoneLod = lod;
  const world = Object.create(World.prototype); world.houseInterior = interior;
  const original = meshes[0].geometry; root.visible = false; camera.position.z = 5;
  world.updateLod(camera, 100); assert.equal(meshes[0].geometry, original);
  root.visible = true; world.updateLod(camera, 100); assert.notEqual(meshes[0].geometry, original);
  const replacement = new THREE.BoxGeometry(); meshes[0].geometry = replacement;
  camera.position.z = 1.8; world.updateLod(camera, 100); assert.equal(meshes[0].geometry, replacement);
  lod.dispose(); assert.equal(meshes[0].geometry, replacement);
  interior.stoneLod = undefined; assert.doesNotThrow(() => world.updateLod(camera, 100));
});

test('the real house uses verified stone LOD indices and keeps all other gameplay meshes intact', async () => {
  const gltf = await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url));
  const data = JSON.parse(await readFile(new URL('../public/assets/models/environment/house-stone-lods.json', import.meta.url), 'utf8'));
  const before = new Map(); gltf.scene.traverse(o => before.set(o, { parent: o.parent, name: o.name,
    geometry: o.geometry, material: o.material, matrix: o.matrix.clone(), visible: o.visible }));
  const lod = await HouseStoneLod.create(gltf.scene, data), camera = new THREE.PerspectiveCamera(45, 1, .1, 1000);
  camera.position.set(0, 0, 100); lod.update(camera, 1080);
  assert.deepEqual(lod.stats, { meshes: 2, sourceTriangles: 99664, selectedTriangles: 48092 });
  for (const [object, state] of before) {
    assert.equal(object.parent, state.parent); assert.equal(object.name, state.name);
    assert.equal(object.material, state.material); assert.equal(object.visible, state.visible);
    assert.deepEqual(object.matrix, state.matrix);
    if (!HOUSE_STONE_NAMES.includes(object.name)) assert.equal(object.geometry, state.geometry);
  }
  for (const entry of lod.entries) {
    const original = before.get(entry.mesh).geometry;
    for (const level of entry.levels.slice(1)) {
      assert.ok(level.geometry.index.array.every(index => index < original.attributes.position.count));
      for (const name of Object.keys(original.attributes)) assert.equal(level.geometry.attributes[name], original.attributes[name]);
    }
  }
  const entry = lod.entries[0], center = entry.center.clone().applyMatrix4(entry.mesh.matrixWorld);
  camera.position.copy(center).add(new THREE.Vector3(0, 0, entry.radius * entry.mesh.matrixWorld.getMaxScaleOnAxis() + .01));
  camera.lookAt(center); lod.update(camera, 1080);
  assert.equal(entry.mesh.geometry, before.get(entry.mesh).geometry);
  lod.dispose(); for (const [object, state] of before) assert.equal(object.geometry, state.geometry);
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

function workshopLightFixture() {
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
  return { workshop, count, visible, first, camera };
}

test('workshop lights stay off while walking and light only the craft being inspected', () => {
  const { workshop, count, visible, first, camera } = workshopLightFixture();
  assert.equal(count(), 1);
  camera.position.copy(first);
  workshop.updateTreasureLights(); assert.deepEqual(visible(), []);
  workshop.state = 'entering'; workshop.hoveredIndex = 1;
  workshop.updateTreasureLights(); assert.deepEqual(visible(), []);
  workshop.state = 'active';
  workshop.updateTreasureLights(); assert.deepEqual(visible(), []); // Overview/hover has no light.
  const classList = { add() {}, remove() {} };
  Object.assign(workshop, { panel: { classList, animate() {} }, label: { classList }, controls: { classList },
    sound: { play() {} }, updateControlHint() {}, renderPanel() {}, setCursor() {}, beginTransition() {} });
  workshop.toggleSelection(); assert.deepEqual(visible(), [1]); assert.equal(count(), 2);
  workshop.toggleSelection(); assert.deepEqual(visible(), []); assert.equal(count(), 1);
  workshop.toggleSelection(); assert.deepEqual(visible(), [1]);
  workshop.leave(() => {}); assert.deepEqual(visible(), []); assert.equal(count(), 1);
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

test('workshop light shader warm-up restores visibility and inspection state even if compilation fails', async () => {
  const { workshop, count } = workshopLightFixture();
  assert.equal(count(), 1);
  let calls = 0;
  await workshop.prepareLightingVariants(async () => { calls++; assert.equal(count(), 2); });
  assert.equal(calls, 1); assert.equal(count(), 1);
  assert.equal(workshop.state, 'idle'); assert.equal(workshop.selectedIndex, -1);
  await assert.rejects(workshop.prepareLightingVariants(async () => {
    assert.equal(count(), 2); throw new Error('compile failed');
  }), /compile failed/);
  assert.equal(count(), 1);
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
