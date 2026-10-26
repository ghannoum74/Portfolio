import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { optimizeAssets, decodedAssetFingerprint } from '../scripts/optimize-assets.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MeshoptEncoder } from 'meshoptimizer';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Real scene objects and effect code; the renderer is a controlled test double.
// This suite does not require a GPU or claim to measure frame rate.
globalThis.window = { location: { search: '' }, devicePixelRatio: 1 };
const temporary = await mkdtemp(new URL('../.perf-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: {
  contents: `export { getPerformanceOptions, performanceOptions } from './src/core/PerformanceOptions';
    export { Renderer } from './src/core/Renderer';
    export { FrameProfiler, summarizeTimings } from './src/core/FrameProfiler';
    export { GpuTimer } from './src/core/GpuTimer';
    export { InteractionHighlight } from './src/core/InteractionHighlight';
    export { HouseStoneLod, HOUSE_STONE_NAMES, EXTERIOR_LOD_NAMES, geometryHash, sha256 } from './src/world/house/HouseStoneLod';
    export { HouseInterior } from './src/world/house/HouseInterior';
    export { ClosedSurfaceCulling, isClosedOutwardSurface } from './src/world/house/ClosedSurfaceCulling';
    export { VisibleAnimationLoop } from './src/core/VisibleAnimationLoop';
    export { Keyboard } from './src/input/Keyboard';
    export { World } from './src/world/World';
    export { Player } from './src/world/player/Player';
    export { NpcManager } from './src/world/npc/NpcManager';
    export { NPC_DEFINITIONS } from './src/world/npc/NpcData';
    export { StaticMeshBatches, StaticTransforms } from './src/optimization/StaticScene';
    export { mapConcurrent } from './src/loaders/mapConcurrent';
    export { Water } from './src/world/environment/Water';
    export { InteractionHint } from './src/ui/InteractionHint/InteractionHint';
    export { WorkshopExperience } from './src/world/house/workshop/WorkshopExperience';
    export { WorkshopSound } from './src/world/house/workshop/WorkshopSound';
    export { createWorkshopCue } from './src/world/house/workshop/WorkshopCue';
    export { JourneyMapExperience } from './src/world/house/journey/JourneyMapExperience';
    export { batchHouseBeams } from './src/world/house/batchHouseBeams';
    export { HouseFurnitureInteractions } from './src/world/house/furniture/HouseFurnitureInteractions';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty', '.html': 'text' } });
const { FrameProfiler, summarizeTimings, GpuTimer, StaticMeshBatches, StaticTransforms, mapConcurrent, Water, NPC_DEFINITIONS, Keyboard, ClosedSurfaceCulling, isClosedOutwardSurface, VisibleAnimationLoop, HouseStoneLod, HOUSE_STONE_NAMES, EXTERIOR_LOD_NAMES, geometryHash, sha256, HouseInterior, getPerformanceOptions, performanceOptions, Renderer, InteractionHighlight, HouseFurnitureInteractions, batchHouseBeams, World, Player, NpcManager, InteractionHint, WorkshopExperience, WorkshopSound, createWorkshopCue, JourneyMapExperience } = await import(pathToFileURL(bundle));
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
  assert.equal(normal.staticBatching, true);
  assert.equal(normal.staticTransforms, true);
  assert.equal(getPerformanceOptions('?staticBatching=0', 1).staticBatching, false);
  assert.equal(getPerformanceOptions('?staticTransforms=0', 1).staticTransforms, false);
  assert.equal(normal.stoneLod, true);
  assert.equal(normal.surfaceCulling, true);
  assert.equal(getPerformanceOptions('?surfaceCulling=0', 1).surfaceCulling, false);
  assert.equal(getPerformanceOptions('?surfaceCulling=0', 1).stoneLod, true);
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

test('GPU timing is independent and opt-in within diagnostics, without competing with GPU stats', () => {
  assert.equal(getPerformanceOptions('', 1).gpuTiming, false);
  assert.equal(getPerformanceOptions('?gpuTiming=1', 1).gpuTiming, false);
  assert.equal(getPerformanceOptions('?perfdiag=1&gpuTiming=1', 1).gpuTiming, true);
  assert.equal(getPerformanceOptions('?perfdiag=1&gpuTiming=1&gpuStats=1', 1).gpuTiming, false);
  assert.equal(getPerformanceOptions('?perfdiag=1&gpuTiming=1', 1).stats, false);
});

test('frame profiling separates callback work and intervals, excludes warm-up and resets after a pause', () => {
  let now = 0;
  const profiler = new FrameProfiler(() => now, 20, 10);
  profiler.begin(); assert.equal(profiler.finish('house'), undefined);
  now = 5; profiler.begin(); assert.equal(profiler.finish('house'), undefined);
  const frame = at => {
    now = at; profiler.begin();
    now++; profiler.mark('setup');
    now += 2; profiler.mark('world');
    now++; profiler.mark('render');
    return profiler.finish('house');
  };
  assert.equal(frame(20), undefined);
  const sample = frame(36);
  assert.equal(sample.frames, 2);
  assert.deepEqual(sample.callbackCpuMs, { samples: 2, mean: 4, p50: 4, p95: 4 });
  assert.deepEqual(sample.callbackIntervalMs, { samples: 1, mean: 16, p50: 16, p95: 16 });
  assert.equal(sample.stagesCpuMsMean.world, 2);
  assert.equal(sample.stagesCpuMsMean.render, 1);
  now = 50; profiler.skip();
  assert.equal(frame(55), undefined);
  assert.equal(frame(100), undefined);
  const resumed = frame(121);
  assert.equal(resumed.callbackIntervalMs.p95, 21);
  assert.equal(resumed.frames, 2);
});

test('frame profiling does not mix scenes and bounds storage at very high refresh rates', () => {
  let now = 0;
  const profiler = new FrameProfiler(() => now, 20, 0);
  profiler.begin(); profiler.finish('house');
  now = 5; profiler.begin(); now = 7; profiler.mark('world'); profiler.finish('house');
  now = 10; profiler.begin(); profiler.finish('exterior');
  now = 15; profiler.begin(); now = 16; profiler.mark('world'); profiler.finish('exterior');
  now = 35; profiler.begin(); now = 36; profiler.mark('world');
  const report = profiler.finish('exterior');
  assert.equal(report.scene, 'exterior'); assert.equal(report.frames, 2);
  assert.equal(report.stagesCpuMsMean.world, 1);
  const bounded = new FrameProfiler(() => 0, 3000, 0);
  bounded.begin(); bounded.finish('house');
  let capped;
  for (let index = 0; index < 600; index++) { bounded.begin(); capped = bounded.finish('house'); }
  assert.equal(capped.frames, 600);
  assert.deepEqual(summarizeTimings([]), { samples: 0, mean: null, p50: null, p95: null });
});

function gpuFixture({ supported = true, counterBits = 64 } = {}) {
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2, QUERY_COUNTER_BITS_EXT: 3 };
  const state = { calls: [], queries: [], active: null, external: null, disjoint: false, lost: false, available: false, nanoseconds: 6e6 };
  const gl = {
    QUERY_RESULT_AVAILABLE: 4, QUERY_RESULT: 5, CURRENT_QUERY: 6,
    isContextLost() { state.calls.push('isContextLost'); return state.lost; },
    getExtension() { state.calls.push('getExtension'); return supported ? ext : null; },
    getParameter() { state.calls.push('getParameter'); return state.disjoint; },
    getQuery(target, parameter) { return parameter === ext.QUERY_COUNTER_BITS_EXT ? counterBits : state.external || state.active; },
    createQuery() { const query = { id: state.queries.length }; state.queries.push(query); state.calls.push(['create', query]); return query; },
    beginQuery(target, query) { assert.equal(state.active, null); state.active = query; state.calls.push(['begin', query]); },
    endQuery() { assert.ok(state.active); state.calls.push(['end', state.active]); state.active = null; },
    getQueryParameter(query, parameter) {
      if (parameter === gl.QUERY_RESULT_AVAILABLE) return state.available;
      assert.equal(state.available, true, 'must not read unavailable results');
      state.calls.push(['result', query]); return state.nanoseconds;
    },
    deleteQuery(query) { state.calls.push(['delete', query]); },
  };
  return { state, gl, timer: new GpuTimer(gl, 1, 2) };
}

test('disabled and unsupported GPU timers return no measurements and do not submit queries', () => {
  const disabled = gpuFixture(); disabled.timer.begin(); disabled.timer.end();
  assert.equal(disabled.state.calls.length, 0);
  assert.equal(disabled.timer.takeSample().gpuRenderMsMean, null);
  for (const options of [{ supported: false }, { counterBits: 0 }]) {
    const { timer, state } = gpuFixture(options);
    timer.setEnabled(true); timer.begin(); timer.end();
    assert.equal(timer.takeSample().gpuTimingStatus, 'unsupported');
    assert.equal(state.queries.length, 0);
  }
});

test('GPU timing reads only available later-frame results, preserves 64-bit values and releases ownership', () => {
  const { timer, state } = gpuFixture(); timer.setEnabled(true);
  timer.begin(); timer.end();
  assert.equal(timer.takeSample().gpuTimingSamples, 0);
  state.available = true; state.nanoseconds = 5_000_000_001;
  timer.begin(); timer.end();
  const sample = timer.takeSample();
  assert.equal(sample.gpuTimingSamples, 1); assert.equal(sample.gpuRenderMsMean, 5000);
  assert.equal(sample.gpuTimingPending, 1);
  timer.dispose();
  assert.equal(state.calls.filter(call => call[0] === 'delete').length, 2);
  assert.equal(timer.takeSample().gpuTimingStatus, 'disabled');
});

test('GPU query backlog stays bounded and reset drops stale measurements', () => {
  const { timer, state } = gpuFixture(); timer.setEnabled(true);
  for (let frame = 0; frame < 20; frame++) { timer.begin(); timer.end(); }
  assert.equal(state.queries.length, 2);
  assert.equal(timer.takeSample().gpuTimingPending, 2);
  assert.equal(state.calls.filter(call => call[0] === 'result').length, 0);
  timer.reset();
  assert.equal(timer.takeSample().gpuTimingPending, 0);
  assert.equal(state.calls.filter(call => call[0] === 'delete').length, 2);
});

test('GPU disjoint results are discarded and an external query is never ended or deleted', () => {
  const { timer, state } = gpuFixture(); timer.setEnabled(true);
  timer.begin(); timer.end(); state.disjoint = true;
  timer.begin(); timer.end(); timer.begin(); timer.end();
  const sample = timer.takeSample();
  assert.equal(sample.gpuTimingStatus, 'disjoint'); assert.equal(sample.gpuTimingDisjointEvents, 1);
  assert.equal(sample.gpuTimingSamples, 0); assert.equal(sample.gpuTimingPending, 0);
  state.disjoint = false; state.external = { foreign: true };
  const owned = state.queries.length;
  const disjointPolls = state.calls.filter(call => call === 'getParameter').length;
  timer.begin(); timer.end(); timer.dispose();
  assert.equal(state.queries.length, owned);
  assert.equal(state.calls.filter(call => call === 'getParameter').length, disjointPolls);
  assert.equal(state.calls.some(call => Array.isArray(call) && call[1] === state.external), false);
});

test('GPU context loss clears old queries and reacquires the extension on restoration', () => {
  const { timer, state } = gpuFixture(); timer.setEnabled(true);
  timer.begin(); timer.end();
  state.lost = true; timer.begin(); timer.end();
  assert.equal(timer.takeSample().gpuTimingStatus, 'context-lost');
  assert.equal(timer.takeSample().gpuTimingPending, 0);
  state.lost = false; timer.begin(); timer.end();
  assert.equal(state.calls.filter(call => call === 'getExtension').length, 2);
  assert.equal(state.queries.length, 2);
  timer.dispose();
});

test('GPU timer cleanup never ends a query that another profiler has replaced', () => {
  const { timer, state } = gpuFixture(); timer.setEnabled(true); timer.begin();
  const owned = state.active;
  state.active = null; state.external = { foreign: true };
  timer.end();
  assert.equal(timer.takeSample().gpuTimingStatus, 'busy');
  assert.equal(state.calls.filter(call => call[0] === 'end').length, 0);
  assert.equal(state.calls.filter(call => call[0] === 'delete' && call[1] === owned).length, 1);
  timer.dispose();
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

test('live border comparison restores source materials and resumes on the latest target', () => {
  const renderer = rendererFixture(true, 'border');
  const scene = new THREE.Scene();
  const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x6f4c2a }));
  const second = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x2f6c6a }));
  const firstMaterial = first.material, secondMaterial = second.material;
  scene.add(first, second);
  renderer.setInteractionOutline(first);
  assert.equal(renderer.borderHighlight.active, true);
  renderer.setBorderHighlightEnabled(false);
  assert.equal(renderer.borderHighlight.active, false);
  assert.equal(first.material, firstMaterial);
  renderer.setInteractionOutline(second);
  assert.equal(second.material, secondMaterial);
  renderer.setBorderHighlightEnabled(true);
  assert.equal(renderer.borderHighlight.active, true);
  assert.equal(first.material, firstMaterial);
  assert.notEqual(second.material, secondMaterial);
  assert.deepEqual(second.material.color, secondMaterial.color);
  renderer.setInteractionOutline(null);
  assert.equal(second.material, secondMaterial);
});

test('live shadow comparison changes renderer state while GPU timing remains guarded', () => {
  const renderer = rendererFixture();
  renderer.instance.shadowMap = { enabled: true };
  renderer.setShadowsEnabled(false);
  assert.equal(renderer.instance.shadowMap.enabled, false);
  assert.equal(renderer.options.shadows, false);
  renderer.setShadowsEnabled(true);
  assert.equal(renderer.instance.shadowMap.enabled, true);
  renderer.instance.getContext = () => { throw new Error('must not probe without diagnostics or alongside GPU stats'); };
  renderer.setGpuTimingEnabled(true);
  assert.equal(renderer.options.gpuTiming, false);
  renderer.options.perfDiag = true; renderer.options.gpuStats = true;
  renderer.setGpuTimingEnabled(true);
  assert.equal(renderer.options.gpuTiming, false);
});

test('a rendering failure still ends the owned GPU query', () => {
  const renderer = rendererFixture(false);
  const { timer, state } = gpuFixture(); timer.setEnabled(true);
  renderer.gpuTimer = timer; renderer.perfWarmupUntil = 0;
  renderer.instance.render = () => { throw new Error('draw failed'); };
  assert.throws(() => renderer.render({}, {}), /draw failed/);
  assert.equal(state.active, null);
  assert.equal(timer.takeSample().gpuTimingPending, 1);
  timer.dispose();
});

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

test('live LOD switching restores authored detail without moving meshes or the camera', async () => {
  const { meshes, camera, lod } = await stoneFixture();
  const originals = meshes.map(mesh => mesh.geometry);
  camera.position.z = 5; camera.updateMatrixWorld();
  const pose = camera.matrixWorld.clone();
  lod.update(camera, 100); assert.equal(lod.stats.selectedTriangles, 16);
  lod.setEnabled(false); lod.update(camera, 100);
  assert.equal(lod.stats.selectedTriangles, 64);
  meshes.forEach((mesh, i) => assert.equal(mesh.geometry, originals[i]));
  assert.deepEqual(camera.matrixWorld, pose);
  lod.setEnabled(true); lod.update(camera, 100);
  assert.equal(lod.stats.selectedTriangles, 16);
  const external = new THREE.BoxGeometry(); meshes[0].geometry = external;
  lod.setEnabled(false); assert.equal(meshes[0].geometry, external);
  lod.dispose();
});

test('closed-surface validation welds UV seams and rejects open, non-manifold and inward shells', async () => {
  const cube = new THREE.BoxGeometry();
  assert.equal(await isClosedOutwardSurface(cube), true);
  assert.equal(await isClosedOutwardSurface(cube.toNonIndexed()), true);
  assert.equal(await isClosedOutwardSurface(new THREE.PlaneGeometry()), false);
  const opened = cube.clone(); opened.setIndex(Array.from(opened.index.array).slice(3));
  assert.equal(await isClosedOutwardSurface(opened), false);
  const duplicate = cube.clone(); duplicate.setIndex([...duplicate.index.array, ...duplicate.index.array.slice(0, 3)]);
  assert.equal(await isClosedOutwardSurface(duplicate), false);
  const inward = new THREE.BoxGeometry(.5, .5, .5).scale(-1, 1, 1).translate(2, 0, 0);
  assert.equal(await isClosedOutwardSurface(inward), false);
  assert.equal(await isClosedOutwardSurface(mergeGeometries([cube, inward])), false);
  const malformed = cube.clone(); malformed.attributes.position.setX(0, NaN);
  assert.equal(await isClosedOutwardSurface(malformed), false);
  const groupedRoot = new THREE.Group(), material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  const grouped = new THREE.Mesh(cube, Array(6).fill(material)); groupedRoot.add(grouped);
  const missingGroup = new THREE.Mesh(cube.clone(), Array(6).fill(material)); missingGroup.geometry.groups.pop(); groupedRoot.add(missingGroup);
  const groupedCulling = await ClosedSurfaceCulling.create(groupedRoot, true);
  assert.equal(groupedCulling.stats.meshes, 1); assert.equal(missingGroup.material[0], material);
  groupedCulling.dispose();
});

test('surface culling isolates shared materials, preserves surfaces and supports an in-place comparison', async () => {
  const root = new THREE.Group(); root.visible = false;
  const texture = new THREE.Texture();
  const authored = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, color: 0x806030,
    roughness: .85, specularIntensity: .36, map: texture });
  const solid = new THREE.Mesh(new THREE.BoxGeometry(), authored);
  const second = new THREE.Mesh(solid.geometry, authored);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(), authored);
  root.add(solid, second, sheet); solid.position.set(1, 2, 3);
  const geometry = solid.geometry, positionBytes = geometry.attributes.position.array.slice();
  const indexBytes = geometry.index.array.slice(), transform = solid.position.clone();
  const culling = await ClosedSurfaceCulling.create(root, true);
  assert.deepEqual(culling.stats, { enabled: true, meshes: 2, triangles: 24, materials: 1 });
  assert.equal(authored.side, THREE.DoubleSide); assert.equal(sheet.material, authored);
  assert.equal(solid.material.side, THREE.FrontSide); assert.equal(second.material, solid.material);
  assert.equal(solid.material.map, texture); assert.equal(solid.material.specularIntensity, .36);
  assert.equal(solid.material.roughness, authored.roughness); assert.deepEqual(solid.material.color, authored.color);
  assert.equal(solid.geometry, geometry); assert.deepEqual(solid.position, transform);
  assert.deepEqual(geometry.attributes.position.array, positionBytes); assert.deepEqual(geometry.index.array, indexBytes);
  const prepared = solid.material; prepared.emissive.set(0x123456);
  culling.setEnabled(false); assert.equal(solid.material, prepared); assert.equal(prepared.side, THREE.DoubleSide);
  culling.setEnabled(true); assert.equal(prepared.side, THREE.FrontSide); assert.equal(prepared.emissive.getHex(), 0x123456);
  let originalDisposals = 0, cloneDisposals = 0;
  authored.addEventListener('dispose', () => originalDisposals++); prepared.addEventListener('dispose', () => cloneDisposals++);
  culling.dispose(); assert.equal(solid.material, authored); assert.equal(second.material, authored);
  assert.equal(originalDisposals, 0); assert.equal(cloneDisposals, 1);
});

test('surface culling preserves cutouts, transmission, animation, partial draws and external replacements', async () => {
  const root = new THREE.Group(), cube = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  const eligible = new THREE.Mesh(cube, material); root.add(eligible);
  const excluded = [];
  for (const settings of [{ transparent: true }, { alphaTest: .1 }, { alphaHash: true }, { wireframe: true }, { opacity: .9 },
    { depthTest: false }, { depthWrite: false }, { colorWrite: false }, { stencilWrite: true }, { polygonOffset: true }]) {
    const mesh = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, ...settings }));
    root.add(mesh); excluded.push(mesh);
  }
  const glass = new THREE.Mesh(cube, new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, transmission: .7 }));
  const animated = new THREE.Mesh(cube, material); animated.name = 'animated';
  const hidden = new THREE.Mesh(cube, material); hidden.visible = false;
  const collider = new THREE.Mesh(cube, material); collider.name = 'COL_BOX_TEST';
  const partialGeometry = cube.clone(); partialGeometry.setDrawRange(0, 6);
  const partial = new THREE.Mesh(partialGeometry, material);
  const morphGeometry = cube.clone(); morphGeometry.morphAttributes.position = [cube.attributes.position];
  const morph = new THREE.Mesh(morphGeometry, material);
  root.add(glass, animated, hidden, collider, partial, morph); excluded.push(glass, animated, hidden, collider, partial, morph);
  const originals = excluded.map(mesh => mesh.material);
  const clip = new THREE.AnimationClip('move', 1, [new THREE.NumberKeyframeTrack('animated.position[x]', [0, 1], [0, 1])]);
  const culling = await ClosedSurfaceCulling.create(root, true, [clip]);
  assert.equal(culling.stats.meshes, 1); excluded.forEach((mesh, i) => assert.equal(mesh.material, originals[i]));
  const replacement = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }); eligible.material = replacement;
  culling.setEnabled(false); culling.setEnabled(true); assert.equal(replacement.side, THREE.DoubleSide);
  culling.dispose(); assert.equal(eligible.material, replacement);
  root.name = 'root';
  const rootClip = new THREE.AnimationClip('move', 1, [new THREE.NumberKeyframeTrack('root.position[x]', [0, 1], [0, 1])]);
  const rootCulling = await ClosedSurfaceCulling.create(root, true, [rootClip]);
  assert.equal(rootCulling.stats.meshes, 0); rootCulling.dispose();
});

test('the real house culls only verified surfaces and keeps stone LOD, layout and gameplay identity intact', async () => {
  const housePath = new URL('../public/assets/models/environment/house.glb', import.meta.url);
  const bytes = await readFile(housePath);
  const assetSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  // Explicit reviewed export snapshots: never accept arbitrary new counts just
  // because the runtime returned them. The newer counts come from the owner's
  // Windows run with the b0239d4 house export.
  const snapshots = new Map([
    ['6b65043ea9b4ec6377187e920657860f85b74685', { enabled: true, meshes: 132, triangles: 108050, materials: 50 }],
    ['ba860d7d9becc0abceba9866fed3cff1c4f4ca66', { enabled: true, meshes: 134, triangles: 108122, materials: 51 }],
  ]);
  const expected = snapshots.get(assetSha);
  assert.ok(expected, `Unreviewed house export ${assetSha}: review its culling snapshot before updating this test`);
  const gltf = await readGeometryGLB(housePath);
  const root = gltf.scene; root.getObjectByName('SEC_PROJECTS_ProjectBook')?.traverse(object => object.visible = false);
  batchHouseBeams(root, gltf.animations);
  const before = new Map();
  root.traverse(object => before.set(object, { parent: object.parent, name: object.name,
    geometry: object.geometry, material: object.material, visible: object.visible, matrix: object.matrix.clone() }));
  const culling = await ClosedSurfaceCulling.create(root, true, gltf.animations);
  assert.deepEqual(culling.stats, expected);
  const checkedGeometry = new Set(), clonedMaterials = new Set();
  let changedMeshes = 0, changedTriangles = 0;
  for (const [object, state] of before) {
    assert.equal(object.geometry, state.geometry); assert.equal(object.parent, state.parent);
    assert.equal(object.name, state.name); assert.equal(object.visible, state.visible); assert.deepEqual(object.matrix, state.matrix);
    if (object.material !== state.material) {
      assert.equal(object.isMesh, true);
      if (!checkedGeometry.has(object.geometry)) {
        assert.equal(await isClosedOutwardSurface(object.geometry), true, `Unsafe culled surface: ${object.name}`);
        checkedGeometry.add(object.geometry);
      }
      changedMeshes++;
      changedTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      const original = Array.isArray(state.material) ? state.material : [state.material];
      const prepared = Array.isArray(object.material) ? object.material : [object.material];
      assert.equal(prepared.length, original.length);
      original.forEach((material, index) => {
        if (material.side === THREE.DoubleSide) {
          assert.notEqual(prepared[index], material);
          assert.equal(prepared[index].side, THREE.FrontSide);
          clonedMaterials.add(prepared[index]);
        } else assert.equal(prepared[index], material);
      });
    }
  }
  assert.deepEqual({ enabled: true, meshes: changedMeshes, triangles: changedTriangles, materials: clonedMaterials.size }, expected);
  // The stones contain mixed-orientation components, so the conservative surface
  // audit leaves their authored material alone while their existing LOD still works.
  for (const name of HOUSE_STONE_NAMES) assert.equal(root.getObjectByName(name).material, before.get(root.getObjectByName(name)).material);
  const data = JSON.parse(await readFile(new URL('../public/assets/models/environment/house-stone-lods.json', import.meta.url), 'utf8'));
  const lod = await HouseStoneLod.create(root, data), camera = new THREE.PerspectiveCamera(45, 1, .1, 1000);
  camera.position.set(0, 0, 100); lod.update(camera, 1080); assert.equal(lod.stats.selectedTriangles, 48092);
  culling.setEnabled(false); culling.setEnabled(true); assert.equal(lod.stats.selectedTriangles, 48092);
  lod.dispose(); culling.dispose();
  for (const [object, state] of before) { assert.equal(object.geometry, state.geometry); assert.equal(object.material, state.material); }
});

test('surface culling toggles remain compatible with a selected border and clean deselection', async () => {
  const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  scene.add(mesh); const culling = await ClosedSurfaceCulling.create(scene, true);
  const prepared = mesh.material, border = new InteractionHighlight(); border.setTarget(mesh);
  assert.notEqual(mesh.material, prepared);
  culling.setEnabled(false); border.update(); assert.equal(mesh.material.side, THREE.DoubleSide);
  culling.setEnabled(true); border.update(); assert.equal(mesh.material.side, THREE.FrontSide);
  border.setTarget(null); assert.equal(mesh.material, prepared); assert.equal(mesh.material.side, THREE.FrontSide);
  culling.dispose();
});

test('hidden pages stop the frame loop and resume from a new timing window without duplicate listeners', () => {
  const visibility = new EventTarget(); visibility.hidden = false;
  const events = [], tick = () => events.push('tick');
  const loop = new VisibleAnimationLoop(visibility, callback => events.push(callback ? 'start' : 'stop'), tick, () => events.push('reset'));
  assert.deepEqual(events, ['reset', 'start']);
  visibility.dispatchEvent(new Event('visibilitychange')); assert.equal(events.length, 2);
  visibility.hidden = true; visibility.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(events, ['reset', 'start', 'stop']);
  visibility.hidden = false; visibility.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(events, ['reset', 'start', 'stop', 'reset', 'start']);
  loop.dispose(); const count = events.length;
  visibility.hidden = true; visibility.dispatchEvent(new Event('visibilitychange'));
  assert.equal(events.length, count);
  const hiddenInitially = new EventTarget(); hiddenInitially.hidden = true; const hiddenEvents = [];
  const hiddenLoop = new VisibleAnimationLoop(hiddenInitially, callback => hiddenEvents.push(callback ? 'start' : 'stop'), tick, () => hiddenEvents.push('reset'));
  assert.deepEqual(hiddenEvents, ['stop']);
  hiddenInitially.hidden = false; hiddenInitially.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(hiddenEvents, ['stop', 'reset', 'start']); hiddenLoop.dispose();
});

test('visibility changes clear held movement and queued jumps without enabling disabled gameplay input', () => {
  const previousDocument = globalThis.document, previousListener = window.addEventListener;
  const events = new EventTarget();
  globalThis.document = events; window.addEventListener = () => {};
  try {
    const keyboard = new Keyboard();
    keyboard.forward = true; keyboard.left = true; keyboard.run = true; keyboard.jumpQueued = true;
    events.dispatchEvent(new Event('visibilitychange'));
    assert.equal(keyboard.forward, false); assert.equal(keyboard.left, false); assert.equal(keyboard.run, false);
    assert.equal(keyboard.consumeJump(), false);
    keyboard.setEnabled(false); events.dispatchEvent(new Event('visibilitychange'));
    assert.equal(keyboard.enabled, false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousListener === undefined) delete window.addEventListener; else window.addEventListener = previousListener;
  }
});

test('live resolution respects native DPR, updates the border/composer and survives a resize', () => {
  const previous = { width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio };
  window.innerWidth = 1000; window.innerHeight = 600; window.devicePixelRatio = 1.5;
  const renderer = rendererFixture(true, 'border'), updates = [];
  renderer.instance.setSize = (w, h) => updates.push(['size', w, h]);
  renderer.instance.setPixelRatio = ratio => updates.push(['ratio', ratio]);
  renderer.borderHighlight.setSize = (...values) => updates.push(['border', ...values]);
  renderer.composer.setSize = () => {}; renderer.composer.setPixelRatio = ratio => updates.push(['composer', ratio]);
  renderer.setPixelRatio(.75); renderer.resize();
  assert.equal(renderer.pixelRatioOverride, .75);
  assert.deepEqual(updates.filter(update => update[0] === 'ratio'), [['ratio', .75], ['ratio', .75]]);
  assert.ok(updates.some(update => update[0] === 'border' && update[3] === .75));
  assert.ok(updates.some(update => update[0] === 'composer' && update[1] === .75));
  renderer.setPixelRatio(10); assert.equal(renderer.pixelRatioOverride, 1.5);
  renderer.setPixelRatio(.01); assert.equal(renderer.pixelRatioOverride, .5);
  renderer.setPixelRatio(NaN); assert.equal(renderer.pixelRatioOverride, .5);
  window.innerWidth = previous.width; window.innerHeight = previous.height; window.devicePixelRatio = previous.ratio;
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

function staticBox(material, x = 0.5, parent) {
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  geometry.clearGroups();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, 0.5, 0.5);
  parent?.add(mesh);
  return mesh;
}

test('local static batches preserve transformed vertices, normals, UVs and authored material ownership', () => {
  const root = new THREE.Group(), parent = new THREE.Group();
  root.position.set(10, -30, 0); root.rotation.y = 0.3;
  parent.position.set(0, 1, 1); parent.rotation.z = 0.1; root.add(parent);
  const material = new THREE.MeshStandardMaterial({ color: 0x573922 });
  const sources = [staticBox(material, 0.3, parent), staticBox(material, 0.7, parent)];
  sources.forEach((mesh, i) => {
    mesh.name = `decoration-${i}`; mesh.scale.y = 1.2; mesh.rotation.x = i * 0.1;
    mesh.castShadow = true; mesh.receiveShadow = true;
  });
  root.updateMatrixWorld(true);
  const expected = sources.flatMap(mesh => {
    const { position, normal, uv } = mesh.geometry.attributes;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    return Array.from({ length: position.count }, (_, i) => ({
      position: new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld),
      normal: new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix),
      uv: [uv.getX(i), uv.getY(i)],
    }));
  });
  const originals = sources.map(mesh => mesh.geometry);
  const batches = new StaticMeshBatches(root);
  assert.deepEqual(batches.stats, { sourceMeshes: 2, batches: 1, triangles: 24 });
  const batch = root.getObjectByName('STATIC_BATCH_1'); root.updateMatrixWorld(true);
  const { position, normal, uv } = batch.geometry.attributes;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(batch.matrixWorld);
  for (let i = 0; i < position.count; i++) {
    assert.ok(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(batch.matrixWorld).distanceTo(expected[i].position) < 0.000002);
    assert.ok(new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix).distanceTo(expected[i].normal) < 0.000002);
    assert.deepEqual([uv.getX(i), uv.getY(i)], expected[i].uv);
  }
  assert.equal(batch.material, material); assert.equal(batch.castShadow, true); assert.equal(batch.receiveShadow, true);
  const hits = []; batch.raycast(null, hits); assert.deepEqual(hits, []);
  let ownedDisposals = 0, sourceDisposals = 0;
  batch.geometry.addEventListener('dispose', () => ownedDisposals++);
  material.addEventListener('dispose', () => sourceDisposals++);
  originals.forEach(geometry => geometry.addEventListener('dispose', () => sourceDisposals++));
  assert.deepEqual(new StaticMeshBatches(root).stats, { sourceMeshes: 0, batches: 0, triangles: 0 });
  batches.dispose(); batches.dispose();
  assert.equal(ownedDisposals, 1); assert.equal(sourceDisposals, 0);
  sources.forEach((mesh, i) => {
    assert.equal(root.getObjectByName(mesh.name), mesh); assert.equal(mesh.geometry, originals[i]); assert.equal(mesh.visible, true);
  });
});

test('static batching excludes gameplay, unsafe render states, animation, deformation and hidden children', () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  staticBox(material, 0.3, root); staticBox(material, 0.7, root);
  const excluded = [];
  const add = () => { const mesh = staticBox(material, 0.5, root); excluded.push(mesh); return mesh; };
  add().name = 'INTERACT_DOOR'; add().name = 'COL_BOX_WALL';
  const tagged = new THREE.Group(); tagged.name = 'SEC_FURNITURE'; root.add(tagged);
  const taggedChild = staticBox(material, 0.5, tagged); excluded.push(taggedChild);
  add().scale.x = -1; add().visible = false;
  add().material = new THREE.MeshStandardMaterial({ transparent: true });
  add().material = new THREE.MeshStandardMaterial({ opacity: 0.9 });
  add().material = new THREE.MeshPhysicalMaterial({ transmission: 0.4 });
  add().material = new THREE.MeshStandardMaterial({ alphaTest: 0.5 });
  add().material = new THREE.MeshStandardMaterial({ displacementMap: new THREE.Texture() });
  add().onBeforeRender = () => {};
  add().geometry.setDrawRange(0, 3);
  const morph = add(); morph.geometry.morphAttributes.position = [morph.geometry.attributes.position.clone()];
  const animated = add(); animated.name = 'moving';
  const clips = [new THREE.AnimationClip('motion', 1, [new THREE.NumberKeyframeTrack('moving.position[x]', [0, 1], [0, 1])])];
  const before = excluded.map(mesh => mesh.visible);
  assert.equal(new StaticMeshBatches(root, clips).stats.sourceMeshes, 2);
  assert.deepEqual(excluded.map(mesh => mesh.visible), before);
});

test('static batches retain local bounds and separate shadow/layer configurations', () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  [0.3, 0.7, 7.3, 7.7].forEach(x => staticBox(material, x, root));
  const differentShadow = staticBox(material, 0.5, root); differentShadow.castShadow = true;
  const differentLayer = staticBox(material, 0.5, root); differentLayer.layers.set(2);
  const result = new StaticMeshBatches(root);
  assert.equal(result.stats.sourceMeshes, 4); assert.equal(result.stats.batches, 2);
  for (const mesh of root.children.filter(child => child.name.startsWith('STATIC_BATCH_'))) {
    assert.ok(mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length() < 1);
  }
  assert.equal(differentShadow.visible, true); assert.equal(differentLayer.visible, true);
});

test('frozen local transforms keep root movement and gameplay/animated descendants functional', () => {
  const root = new THREE.Group(), still = staticBox(new THREE.MeshBasicMaterial(), 1, root);
  const gameplay = new THREE.Group(); gameplay.name = 'SEC_MOVABLE'; root.add(gameplay);
  const dynamic = staticBox(still.material, 0.5, gameplay);
  const animated = staticBox(still.material, 0.5, root); animated.name = 'animated';
  const clip = new THREE.AnimationClip('move', 1, [new THREE.NumberKeyframeTrack('animated.position[x]', [0, 1], [0, 1])]);
  const transforms = new StaticTransforms(root, [clip]);
  assert.equal(still.matrixAutoUpdate, false); assert.equal(root.matrixAutoUpdate, true);
  assert.equal(gameplay.matrixAutoUpdate, true); assert.equal(dynamic.matrixAutoUpdate, true); assert.equal(animated.matrixAutoUpdate, true);
  root.position.x = 4; root.updateMatrixWorld(true);
  assert.equal(still.getWorldPosition(new THREE.Vector3()).x, 5);
  const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); mixer.update(0.25);
  gameplay.position.y = 2; root.updateMatrixWorld(true);
  assert.equal(animated.getWorldPosition(new THREE.Vector3()).x, 4.25);
  assert.equal(dynamic.getWorldPosition(new THREE.Vector3()).y, 2.5);
  transforms.dispose(); assert.equal(still.matrixAutoUpdate, true);
});

test('real house/world batching preserves source buffers and named gameplay nodes, with culling still switchable', async () => {
  for (const name of ['house', 'world']) {
    const gltf = await readGeometryGLB(new URL(`../public/assets/models/environment/${name}.glb`, import.meta.url));
    const root = gltf.scene;
    let culling;
    if (name === 'house') {
      root.position.y = -30; batchHouseBeams(root, gltf.animations);
      culling = await ClosedSurfaceCulling.create(root, true, gltf.animations);
    } else { root.scale.setScalar(0.25); new Water(root); }
    const sources = []; root.traverse(node => {
      if (node.isMesh) sources.push({ node, geometry: node.geometry, position: node.position.clone(), material: node.material });
    });
    const batches = new StaticMeshBatches(root, gltf.animations), transforms = new StaticTransforms(root, gltf.animations);
    assert.ok(batches.stats.sourceMeshes > batches.stats.batches); assert.ok(transforms.count > 0);
    for (const source of sources) {
      assert.equal(source.node.geometry, source.geometry); assert.equal(source.node.material, source.material);
      assert.deepEqual(source.node.position, source.position); assert.equal(root.getObjectByProperty('uuid', source.node.uuid), source.node);
    }
    if (culling) {
      const frontMaterials = root.children.filter(node => node.name.startsWith('STATIC_BATCH_') && node.material.side === THREE.FrontSide).map(node => node.material);
      assert.ok(frontMaterials.length > 0);
      culling.setEnabled(false); frontMaterials.forEach(material => assert.equal(material.side, THREE.DoubleSide));
      culling.setEnabled(true); frontMaterials.forEach(material => assert.equal(material.side, THREE.FrontSide));
    }
    transforms.dispose(); batches.dispose(); culling?.dispose();
  }
});

test('border material programs survive focus changes, update on reuse and retain explicit disposal', () => {
  const scene = new THREE.Scene(), material = new THREE.MeshStandardMaterial({ color: 0x202020 });
  const a = staticBox(material, 0, scene), b = staticBox(material, 1, scene);
  const highlight = new InteractionHighlight(); highlight.setTarget(a);
  const mask = a.material, rim = scene.getObjectByName('INTERACTION_BORDER').children[0].material;
  let disposed = 0; rim.addEventListener('dispose', () => disposed++);
  highlight.setTarget(null); assert.equal(a.material, material); assert.equal(disposed, 0);
  material.color.set(0xabcdef); highlight.setTarget(b);
  assert.equal(b.material, mask); assert.equal(scene.getObjectByName('INTERACTION_BORDER').children[0].material, rim);
  assert.deepEqual(b.material.color, material.color);
  highlight.clear(); assert.equal(b.material, material); assert.equal(disposed, 1);
});

test('border cache evicts inactive materials without disposing source geometry or textures', () => {
  const scene = new THREE.Scene(), highlight = new InteractionHighlight(), texture = new THREE.Texture();
  const geometry = new THREE.BoxGeometry(); let sourceDisposals = 0, firstEvictions = 0;
  texture.addEventListener('dispose', () => sourceDisposals++); geometry.addEventListener('dispose', () => sourceDisposals++);
  for (let i = 0; i < 70; i++) {
    const source = new THREE.MeshStandardMaterial({ map: texture }); source.addEventListener('dispose', () => sourceDisposals++);
    const mesh = new THREE.Mesh(geometry, source); scene.add(mesh); highlight.setTarget(mesh);
    if (i === 0) scene.getObjectByName('INTERACTION_BORDER').children[0].material.addEventListener('dispose', () => firstEvictions++);
  }
  assert.equal(firstEvictions, 1); assert.equal(highlight.materialOrder.size, 64);
  highlight.clear(); assert.equal(sourceDisposals, 0); assert.equal(highlight.materialOrder.size, 0);
});

test('covered texture preparation uploads unique visible textures before compiling', async () => {
  const renderer = rendererFixture(true, 'border'), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const shared = new THREE.Texture(), extra = new THREE.Texture(), invisible = new THREE.Texture(), uniform = new THREE.Texture();
  scene.background = shared;
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ map: shared, alphaMap: extra })));
  const hidden = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: invisible })); hidden.visible = false; scene.add(hidden);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial({ uniforms: { images: { value: [uniform] } } })));
  const uploads = []; let compiles = 0;
  renderer.instance.initTexture = texture => uploads.push(texture);
  renderer.instance.compileAsync = async () => { assert.equal(uploads.length, 3); compiles++; };
  await renderer.prepareScene(scene, camera);
  assert.deepEqual(new Set(uploads), new Set([shared, extra, uniform])); assert.equal(compiles, 1);
});

test('covered highlight warm-up restores selection on success/failure and retains prepared rim materials', async () => {
  const renderer = rendererFixture(true, 'border'), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const mesh = staticBox(new THREE.MeshStandardMaterial(), 0, scene), original = mesh.material;
  let compiledRim;
  renderer.instance.compileAsync = async () => { compiledRim = scene.getObjectByName('INTERACTION_BORDER').children[0].material; };
  await renderer.prepareHighlights(scene, camera, [mesh, new THREE.Group()]);
  assert.equal(mesh.material, original); assert.equal(scene.getObjectByName('INTERACTION_BORDER'), undefined);
  renderer.setInteractionOutline(mesh);
  assert.equal(scene.getObjectByName('INTERACTION_BORDER').children[0].material, compiledRim);
  renderer.setInteractionOutline(null);
  renderer.instance.compileAsync = async () => { throw new Error('compile failed'); };
  await assert.rejects(renderer.prepareHighlights(scene, camera, [mesh]), /compile failed/);
  assert.equal(mesh.material, original); assert.equal(renderer.outlinedObject, null);
  renderer.borderHighlight.clear();
});

test('furniture light preparation covers counts and restores brightness, visibility and effect state on failure', async () => {
  const effects = Object.create(HouseFurnitureInteractions.prototype), lights = [0, 1, 2].map(i => {
    const light = new THREE.PointLight(0xffffff, i / 10); light.visible = i !== 1; return light;
  });
  const nodes = lights.map(light => ({ light, active: false, progress: 0.4 }));
  effects.nodes = new Map(nodes.map((node, i) => [i, node]));
  const counts = [], compile = async () => counts.push(lights.filter(light => light.visible).length);
  await effects.prepareLightingVariants(compile, async () => { assert.ok(lights.every(light => light.visible)); });
  assert.deepEqual(counts, [0, 1, 2, 3]); assert.deepEqual(lights.map(light => light.visible), [true, false, true]);
  await assert.rejects(effects.prepareLightingVariants(async () => { throw new Error('failed'); }), /failed/);
  assert.deepEqual(lights.map(light => light.visible), [true, false, true]);
  assert.deepEqual(lights.map(light => light.intensity), [0, 0.1, 0.2]); assert.ok(nodes.every(node => !node.active && node.progress === 0.4));
});

test('bounded loading preserves result order and drains started work before rejecting', async () => {
  let active = 0, peak = 0;
  const results = await mapConcurrent([0, 1, 2, 3, 4], 2, async value => {
    peak = Math.max(peak, ++active); await new Promise(resolve => setImmediate(resolve)); active--; return value * 2;
  });
  assert.deepEqual(results, [0, 2, 4, 6, 8]); assert.equal(peak, 2);
  const started = [];
  await assert.rejects(mapConcurrent([0, 1, 2, 3], 2, async value => {
    started.push(value); active++; await new Promise(resolve => setImmediate(resolve)); active--;
    if (value === 0) throw new Error('failed');
  }), /failed/);
  assert.deepEqual(started, [0, 1]); assert.equal(active, 0);
});

test('NPC loading is deduplicated, bounded, ordered and preserves indoor detachment', async () => {
  const manager = Object.create(NpcManager.prototype), scene = new THREE.Scene();
  const clips = Object.fromEntries(['idle', 'talking_1', 'talking_2', 'talking_3'].map(name => [name, new THREE.AnimationClip(name, 1, [])]));
  let requests = 0, active = 0, peak = 0;
  Object.assign(manager, { scene, npcs: [], visible: false,
    loadAnimations: async () => clips,
    loader: { loadGLB: async () => {
      requests++; peak = Math.max(peak, ++active); await new Promise(resolve => setImmediate(resolve)); active--;
      return { scene: new THREE.Group() };
    } },
  });
  const first = manager.load(); assert.equal(manager.load(), first); await first;
  assert.equal(requests, NPC_DEFINITIONS.length); assert.equal(peak, 2);
  assert.deepEqual(manager.npcs.map(npc => npc.id), NPC_DEFINITIONS.map(definition => definition.id));
  assert.ok(manager.npcs.every(npc => npc.model.parent === null && !npc.model.visible));
  await manager.load(); assert.equal(requests, NPC_DEFINITIONS.length);
  manager.setVisible(true); assert.ok(manager.npcs.every(npc => npc.model.parent === scene));
});

test('recursive asset packing preserves skins, morphs, animation samples, texture bytes and tiny transforms', async () => {
  const directory = await mkdtemp(new URL('../.asset-packing-test-', import.meta.url));
  try {
    const source = `${directory}/sources`, output = `${directory}/output`;
    await mkdir(`${source}/player/animations`, { recursive: true });
    const document = new Document(), buffer = document.createBuffer();
    const accessor = (name, type, array) => document.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
    const material = document.createMaterial('surface').setBaseColorFactor([0.2, 0.3, 0.4, 1]);
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
    material.setBaseColorTexture(document.createTexture('pixel').setMimeType('image/png').setImage(image));
    const primitive = document.createPrimitive().setMaterial(material)
      .setAttribute('POSITION', accessor('position', 'VEC3', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])))
      .setAttribute('JOINTS_0', accessor('joints', 'VEC4', new Uint16Array(12)))
      .setAttribute('WEIGHTS_0', accessor('weights', 'VEC4', new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])))
      .setIndices(accessor('indices', 'SCALAR', new Uint16Array([0, 1, 2])));
    primitive.addTarget(document.createPrimitiveTarget().setAttribute('POSITION', accessor('morph', 'VEC3', new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0.2]))));
    const mesh = document.createMesh('mesh').addPrimitive(primitive).setWeights([0.25]);
    const joint = document.createNode('joint'), node = document.createNode('hero').setMesh(mesh).setTranslation([1e-9, 0, 0]);
    node.setSkin(document.createSkin('skin').addJoint(joint).setSkeleton(joint)
      .setInverseBindMatrices(accessor('inverseBind', 'MAT4', new Float32Array(new THREE.Matrix4().elements))));
    document.createScene().addChild(joint).addChild(node);
    const sampler = document.createAnimationSampler().setInterpolation('LINEAR')
      .setInput(accessor('time', 'SCALAR', new Float32Array([0, 1])))
      .setOutput(accessor('translation', 'VEC3', new Float32Array([0, 0, 0, 0, 1, 0])));
    document.createAnimation('motion').addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(joint).setTargetPath('translation').setSampler(sampler));
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    let bytes = Buffer.from(await io.writeBinary(document));
    // Reproduce Blender's tiny authored offset, which NodeIO omits as near-default.
    const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length));
    json.nodes.find(node => node.name === 'hero').translation = [1e-9, 0, 0];
    let encoded = Buffer.from(JSON.stringify(json));
    encoded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
    const header = Buffer.from(bytes.subarray(0, 20)), tail = bytes.subarray(20 + length);
    header.writeUInt32LE(encoded.length, 12); header.writeUInt32LE(20 + encoded.length + tail.length, 8);
    bytes = Buffer.concat([header, encoded, tail]);
    await writeFile(`${source}/player/hero.glb`, bytes); await writeFile(`${source}/player/animations/walk.glb`, bytes);
    const report = await optimizeAssets(source, output, { recursive: true });
    assert.equal(report.length, 2); assert.ok(report.every(row => row.verified));
    const decoded = await io.read(`${output}/player/hero.glb`);
    assert.deepEqual(decoded.getRoot().listTextures()[0].getImage(), new Uint8Array(image));
    assert.deepEqual(decoded.getRoot().listSkins()[0].getInverseBindMatrices().getArray(), new Float32Array(new THREE.Matrix4().elements));
    assert.deepEqual(decoded.getRoot().listAnimations()[0].listSamplers()[0].getOutput().getArray(), new Float32Array([0, 0, 0, 0, 1, 0]));
    const gltf = await readGeometryGLB(`${output}/player/hero.glb`);
    assert.equal(gltf.scene.getObjectByName('hero').position.x, 1e-9);
    assert.deepEqual(await readFile(`${source}/player/hero.glb`), bytes);
    await assert.rejects(optimizeAssets(source, `${source}/nested`, { recursive: true }), /separate/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('live static switches retain prepared geometry and never freeze effects added after asset loading', () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  const a = staticBox(material, 0.3, root), b = staticBox(material, 0.7, root);
  const authored = new Set([root, a, b]);
  const effects = new THREE.Group(); root.add(effects);
  const late = staticBox(material, 1.1, effects);
  const batches = new StaticMeshBatches(root, [], authored), transforms = new StaticTransforms(root, [], authored);
  const batch = root.getObjectByName('STATIC_BATCH_1'), geometry = batch.geometry;
  assert.equal(batches.stats.sourceMeshes, 2); assert.equal(late.visible, true); assert.equal(late.matrixAutoUpdate, true);
  batches.setEnabled(false); transforms.setEnabled(false);
  assert.equal(a.visible, true); assert.equal(a.matrixAutoUpdate, true); assert.equal(batch.parent, null);
  effects.position.x = 2; root.updateMatrixWorld(true);
  assert.equal(late.getWorldPosition(new THREE.Vector3()).x, 3.1);
  batches.setEnabled(true); transforms.setEnabled(true);
  assert.equal(batch.geometry, geometry); assert.equal(a.visible, false); assert.equal(a.matrixAutoUpdate, false);
  assert.equal(late.visible, true); assert.equal(late.matrixAutoUpdate, true);
  batches.dispose(); transforms.dispose(); assert.equal(a.visible, true); assert.equal(a.matrixAutoUpdate, true);
});

test('overlapping surfaces, integer attributes and mirrored roots retain their original draws', () => {
  const material = new THREE.MeshStandardMaterial(), overlap = new THREE.Group();
  staticBox(material, 0.5, overlap); staticBox(material, 0.5, overlap);
  assert.equal(new StaticMeshBatches(overlap).stats.batches, 0);
  const quantized = new THREE.Group();
  for (const x of [0.3, 0.7]) {
    const mesh = staticBox(material, x, quantized);
    mesh.geometry.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(mesh.geometry.attributes.normal.count * 3), 3, true));
  }
  assert.equal(new StaticMeshBatches(quantized).stats.batches, 0);
  const mirrored = new THREE.Group(); mirrored.scale.x = -1;
  [0.3, 0.7].forEach(x => { staticBox(material, x, mirrored).scale.x = -1; });
  assert.equal(new StaticMeshBatches(mirrored).stats.batches, 0);
});

test('packed character assets match verified decoded fingerprints and load through the runtime decoder', async () => {
  const report = JSON.parse(await readFile(new URL('../public/assets/models/asset-sizes.json', import.meta.url)));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  assert.ok(report.length >= 15);
  for (const entry of report) {
    const path = new URL(`../public/assets/models/${entry.name}`, import.meta.url);
    assert.equal(decodedAssetFingerprint(await io.read(fileURLToPath(path))), entry.decodedSha256, entry.name);
    const gltf = await readGeometryGLB(path);
    if (entry.name.includes('/animations/')) assert.ok(gltf.animations.length > 0, entry.name);
    else {
      const skinned = []; gltf.scene.traverse(node => { if (node.isSkinnedMesh) skinned.push(node); });
      assert.ok(skinned.length > 0 && skinned.every(node => node.skeleton.bones.length > 0), entry.name);
    }
  }
});

test('normal renderer entry keeps stats and legacy postprocessing out of its static dependency graph', async () => {
  const result = await build({ entryPoints: ['src/core/Renderer.ts'], bundle: true, splitting: true,
    format: 'esm', platform: 'browser', write: false, metafile: true, outdir: '.bundle-check' });
  const outputs = result.metafile.outputs, entry = Object.keys(outputs).find(path => outputs[path].entryPoint === 'src/core/Renderer.ts');
  assert.ok(entry);
  const visited = new Set(), inputs = new Set();
  const visit = path => {
    if (visited.has(path)) return;
    visited.add(path); assert.ok(outputs[path], path);
    Object.keys(outputs[path].inputs).forEach(input => inputs.add(input));
    outputs[path].imports.filter(dependency => !dependency.external && dependency.kind !== 'dynamic-import').forEach(dependency => visit(dependency.path));
  };
  visit(entry);
  assert.ok(![...inputs].some(input => input.includes('stats-gl') || input.includes('/postprocessing/')));
  assert.ok(Object.values(outputs).some(output => Object.keys(output.inputs).some(input => input.includes('stats-gl'))));
  assert.ok(Object.values(outputs).some(output => Object.keys(output.inputs).some(input => input.endsWith('/OutlinePass.js'))));
});

test('a failed NPC load can retry without partial characters or duplicate registrations', async () => {
  const manager = Object.create(NpcManager.prototype), scene = new THREE.Scene();
  const clips = Object.fromEntries(['idle', 'talking_1', 'talking_2', 'talking_3'].map(name => [name, new THREE.AnimationClip(name, 1, [])]));
  let calls = 0;
  Object.assign(manager, { scene, npcs: [], visible: true, loadAnimations: async () => clips,
    loader: { loadGLB: async () => {
      const request = ++calls; await new Promise(resolve => setImmediate(resolve));
      if (request === 1) throw new Error('network failed');
      return { scene: new THREE.Group() };
    } },
  });
  await assert.rejects(manager.load(), /network failed/); assert.equal(manager.npcs.length, 0);
  await manager.load(); assert.equal(manager.npcs.length, NPC_DEFINITIONS.length);
  await manager.load(); assert.equal(manager.npcs.length, NPC_DEFINITIONS.length);
});

test('asset packing rejects unknown extensions before replacing an existing output', async () => {
  const directory = await mkdtemp(new URL('../.unsupported-asset-test-', import.meta.url));
  try {
    const source = `${directory}/source`, output = `${directory}/output`;
    await mkdir(source); await mkdir(output);
    let json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, extensionsUsed: ['PRIVATE_unhandled_data'] }));
    json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8);
    header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    await writeFile(`${source}/asset.glb`, Buffer.concat([header, json]));
    await writeFile(`${output}/asset.glb`, 'keep existing asset');
    await assert.rejects(optimizeAssets(source, output, { recursive: true }), /unsupported extension/);
    assert.equal(await readFile(`${output}/asset.glb`, 'utf8'), 'keep existing asset');
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('optional exterior LOD preserves authored close-up meshes and rejects stale world data', async () => {
  const { scene: root } = await readGeometryGLB(new URL('../public/assets/models/environment/world.glb', import.meta.url));
  root.scale.setScalar(.25); root.updateMatrixWorld(true);
  const data = JSON.parse(await readFile(new URL('../public/assets/models/environment/exterior-lods.json', import.meta.url), 'utf8'));
  const meshes = EXTERIOR_LOD_NAMES.map(name => root.getObjectByName(name));
  const originals = meshes.map(m => m.geometry), materials = meshes.map(m => m.material);
  const lod = await HouseStoneLod.create(root, data, EXTERIOR_LOD_NAMES, 3);
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 10000);
  const bounds = new THREE.Box3().setFromObject(meshes[0]);
  const center = bounds.getCenter(new THREE.Vector3());
  camera.position.copy(center); camera.lookAt(center.clone().add(new THREE.Vector3(0, 0, -1)));
  lod.update(camera, 1080);
  meshes.forEach((m, i) => assert.equal(m.geometry, originals[i]));
  camera.position.copy(center).add(new THREE.Vector3(0, 0, 100)); camera.lookAt(center);
  lod.update(camera, 1080);
  assert.deepEqual(lod.stats, { meshes: 2, sourceTriangles: 219904, selectedTriangles: 87960 });
  meshes.forEach((m, i) => {
    assert.equal(m.material, materials[i]);
    for (const name of Object.keys(originals[i].attributes)) assert.equal(m.geometry.attributes[name], originals[i].attributes[name]);
    assert.ok(m.geometry.index.array.every(index => index < originals[i].attributes.position.count));
  });
  camera.position.copy(center); lod.update(camera, 1080);
  meshes.forEach((m, i) => assert.equal(m.geometry, originals[i]));
  camera.position.copy(center).add(new THREE.Vector3(0, 0, 100)); camera.lookAt(center); lod.update(camera, 1080);
  lod.setEnabled(false); meshes.forEach((m, i) => assert.equal(m.geometry, originals[i]));
  lod.setEnabled(true); lod.update(camera, 1080); lod.dispose();
  meshes.forEach((m, i) => assert.equal(m.geometry, originals[i]));
  const stale = structuredClone(data); stale.meshes[1].sourceHash = 'stale';
  await assert.rejects(HouseStoneLod.create(root, stale, EXTERIOR_LOD_NAMES, 3), /source changed/);
  meshes.forEach((m, i) => assert.equal(m.geometry, originals[i]));
  await assert.rejects(HouseStoneLod.create(root, data), /Unexpected house stone LOD target/);
  assert.equal(getPerformanceOptions('', 1).exteriorLod, true);
  assert.equal(getPerformanceOptions('?exteriorLod=1', 1).exteriorLod, true);
  assert.equal(getPerformanceOptions('?exteriorLod=0', 1).exteriorLod, false);
});

test('live exterior LOD toggles deduplicate loading, honor late disable and retry failures', async () => {
  const { scene: root } = await readGeometryGLB(new URL('../public/assets/models/environment/world.glb', import.meta.url));
  root.scale.setScalar(.25); new THREE.Scene().add(root); root.updateMatrixWorld(true);
  const data = JSON.parse(await readFile(new URL('../public/assets/models/environment/exterior-lods.json', import.meta.url), 'utf8'));
  const meshes = EXTERIOR_LOD_NAMES.map(name => root.getObjectByName(name));
  const originals = meshes.map(mesh => mesh.geometry);
  const world = Object.create(World.prototype);
  Object.assign(world, { initialized: true, model: root, exteriorLodEnabled: false, perfDiag: false });
  const load = THREE.FileLoader.prototype.loadAsync, warn = console.warn;
  let requests = 0, resolveLoad, rejectLoad, warnings = 0;
  THREE.FileLoader.prototype.loadAsync = function(url) {
    assert.equal(url, '/assets/models/environment/exterior-lods.json'); requests++;
    return new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; });
  };
  console.warn = () => warnings++;
  try {
    world.setExteriorLodEnabled(false); assert.equal(requests, 0);
    world.setExteriorLodEnabled(true); world.setExteriorLodEnabled(true);
    assert.equal(requests, 1);
    const failed = world.exteriorLodPromise; rejectLoad(new Error('offline')); await failed;
    assert.equal(warnings, 1); assert.equal(world.exteriorLod, undefined);
    meshes.forEach((mesh, i) => assert.equal(mesh.geometry, originals[i]));
    world.setExteriorLodEnabled(true); assert.equal(requests, 2);
    const pending = world.exteriorLodPromise;
    world.setExteriorLodEnabled(false); resolveLoad(data); await pending;
    assert.equal(world.exteriorLodPromise, undefined);
    const center = new THREE.Box3().setFromObject(meshes[0]).getCenter(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(45, 1, .01, 10000);
    camera.position.copy(center).add(new THREE.Vector3(0, 0, 100)); camera.lookAt(center);
    world.updateLod(camera, 1080);
    meshes.forEach((mesh, i) => assert.equal(mesh.geometry, originals[i]));
    world.setExteriorLodEnabled(true); world.updateLod(camera, 1080);
    assert.equal(world.exteriorLod.stats.selectedTriangles, 87960);
    assert.equal(requests, 2, 'reuse verified levels after first successful load');
    world.setExteriorLodEnabled(false); world.updateLod(camera, 1080);
    meshes.forEach((mesh, i) => assert.equal(mesh.geometry, originals[i]));
  } finally {
    THREE.FileLoader.prototype.loadAsync = load; console.warn = warn;
    world.exteriorLod?.dispose();
  }
});

function waterProgram(material) {
  const shader = { uniforms: {}, vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main(){\n#include <color_fragment>\n}' };
  material.onBeforeCompile(shader, null);
  return shader;
}

test('water comparisons reuse variants, share animation time and preserve depth, source slots and ownership', () => {
  const root = new THREE.Group(), nearSource = new THREE.MeshStandardMaterial({ roughness: .17 });
  nearSource.name = 'Water_Surface';
  const farSource = new THREE.MeshStandardMaterial(); farSource.name = 'Water_Horizon';
  const other = new THREE.MeshStandardMaterial(), sourceSlots = [nearSource, other];
  const near = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sourceSlots);
  const far = new THREE.Mesh(near.geometry, farSource); root.add(near, far);
  near.castShadow = true; near.receiveShadow = true;
  const geometry = near.geometry, water = new Water(root), nearOriginal = near.material, farOriginal = far.material;
  assert.deepEqual(water.stats, { mode: 'original', meshes: 2 });
  assert.equal(near.material[1], other); assert.equal(near.material[0].roughness, .17);
  assert.equal(near.material[0].flatShading, true); assert.equal(far.material.roughness, .5);
  const originals = [near.material[0], far.material];
  const time = waterProgram(originals[0]).uniforms.uTime;
  assert.equal(waterProgram(originals[1]).uniforms.uTime, time);
  water.setShaderMode('vertex');
  const nearVertex = near.material, farVertex = far.material;
  const variants = new Set([...originals, near.material[0], far.material]);
  assert.ok(near.material[0].isMeshStandardMaterial); assert.equal(near.material[1], other);
  assert.equal(waterProgram(near.material[0]).uniforms.uTime, time);
  water.update(.125); assert.equal(time.value, .125);
  assert.notEqual(near.material[0].customProgramCacheKey(), originals[0].customProgramCacheKey());
  water.setShaderMode('original'); assert.equal(near.material, nearOriginal); assert.equal(far.material, farOriginal);
  water.setShaderMode('depth'); variants.add(near.material[0]); variants.add(far.material);
  for (const material of [near.material[0], far.material]) {
    assert.equal(material.colorWrite, false); assert.equal(material.depthWrite, true);
    assert.equal(material.depthTest, true); assert.equal(material.side, THREE.FrontSide);
    assert.equal(material.transparent, false);
  }
  assert.equal(near.material[1], other); assert.equal(near.geometry, geometry);
  water.setShaderMode('vertex'); assert.equal(near.material, nearVertex); assert.equal(far.material, farVertex);
  assert.throws(() => water.setShaderMode('invalid'), /Unknown water/);
  let ownedDisposals = 0, sourceDisposals = 0;
  variants.forEach(m => m.addEventListener('dispose', () => ownedDisposals++));
  [nearSource, farSource, other].forEach(m => m.addEventListener('dispose', () => sourceDisposals++));
  water.dispose(); water.dispose();
  assert.equal(ownedDisposals, 6); assert.equal(sourceDisposals, 0);
  assert.equal(near.material, sourceSlots); assert.equal(far.material, farSource);
  assert.equal(near.castShadow, true); assert.equal(near.receiveShadow, true);
});

function waterSinArguments(source) {
  const result = [];
  for (const match of source.matchAll(/\bsin\s*\(/g)) {
    const start = match.index + match[0].length;
    let end = start, depth = 1;
    while (depth && end < source.length) { if (source[end] === '(') depth++; if (source[end] === ')') depth--; end++; }
    assert.equal(depth, 0); result.push(source.slice(start, end - 1));
  }
  return result;
}

test('original water GLSL is retained and vertex phases preserve the original affine wave arguments', () => {
  const golden = {
    Water_Surface: ['b5f747a12627b8f1f31e69e0a4ff3db8e0be54df40102a722ee2030d69c1bd0c',
      '20fca6fd31c37ad9637b17cebc2d2e4c33ef47581ce98446bfaef996a1059809'],
    Water_Horizon: ['b5f747a12627b8f1f31e69e0a4ff3db8e0be54df40102a722ee2030d69c1bd0c',
      '07b1881c9aee532163592ad3bb6492c4b020d829163fcf3c0395348c0524bd15'],
  };
  let seed = 17;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const name of Object.keys(golden)) {
    const source = new THREE.MeshStandardMaterial(); source.name = name;
    const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(), source); root.add(mesh);
    const water = new Water(root), original = waterProgram(mesh.material);
    ['vertexShader', 'fragmentShader'].forEach((stage, i) => assert.equal(
      createHash('sha256').update(original[stage].replace(/\s+/g, '')).digest('hex'), golden[name][i]));
    water.setShaderMode('vertex'); const vertex = waterProgram(mesh.material);
    assert.equal(waterSinArguments(vertex.vertexShader).length, 0, 'nonlinear sine stays per fragment');
    const referenceArguments = waterSinArguments(original.fragmentShader);
    const movedArguments = waterSinArguments(vertex.fragmentShader);
    assert.equal(referenceArguments.length, name === 'Water_Surface' ? 4 : 2);
    assert.equal(movedArguments.length, referenceArguments.length);
    // Evaluate the actual generated scalar expressions, independently of the
    // implementation's template layout. This checks real-arithmetic identity;
    // driver precision and rendered pixels still require live review.
    const phaseTerms = vertex.vertexShader.match(/vWaterPhases\s*=\s*vec[24]\(([\s\S]*?)\);/)[1];
    const phases = new Function('vWaterWorldPosition', `return [${phaseTerms}];`);
    const old = referenceArguments.map(arg => new Function('vWaterWorldPosition', 'uTime', `return Math.sin(${arg});`));
    const moved = movedArguments.map(arg => new Function('vWaterPhases', 'uTime', `return Math.sin(${arg});`));
    for (let i = 0; i < 100; i++) {
      const points = Array.from({ length: 3 }, () => ({ x: random() * 200 - 100, z: random() * 200 - 100 }));
      const a = random(), b = random() * (1 - a), weights = [a, b, 1 - a - b];
      const at = { x: 0, z: 0 }, interpolated = Array(old.length).fill(0);
      points.forEach((p, j) => { at.x += p.x * weights[j]; at.z += p.z * weights[j];
        phases(p).forEach((value, k) => { interpolated[k] += value * weights[j]; }); });
      const varying = Object.fromEntries(['x', 'y', 'z', 'w'].map((key, j) => [key, interpolated[j]]));
      for (const time of [0, 1.234, 60, 628, 3600, 86400]) {
        old.forEach((evaluate, k) => assert.ok(Math.abs(evaluate(at, time) - moved[k](varying, time)) < 1e-8));
      }
    }
    water.dispose();
  }
});

test('real world water modes preserve every mesh buffer and leave unmodified water materials alone', async () => {
  const { scene: root } = await readGeometryGLB(new URL('../public/assets/models/environment/world.glb', import.meta.url));
  const saved = [];
  root.traverse(mesh => { if (mesh.isMesh) saved.push({ mesh, geometry: mesh.geometry, material: mesh.material }); });
  const water = new Water(root);
  assert.deepEqual(water.stats, { mode: 'original', meshes: 1 });
  for (const mode of ['vertex', 'depth', 'original']) {
    water.setShaderMode(mode);
    saved.forEach(({ mesh, geometry, material }) => {
      assert.equal(mesh.geometry, geometry);
      if (material.name !== 'Water_Surface') assert.equal(mesh.material, material);
    });
  }
  water.dispose(); saved.forEach(({ mesh, material }) => assert.equal(mesh.material, material));
});

test('water shader variants are opt-in and depth isolation requires diagnostic mode', () => {
  assert.equal(getPerformanceOptions('', 1).waterShader, 'original');
  assert.equal(getPerformanceOptions('?waterShader=vertex', 1).waterShader, 'vertex');
  assert.equal(getPerformanceOptions('?waterShader=depth', 1).waterShader, 'original');
  assert.equal(getPerformanceOptions('?perfdiag=0&waterShader=depth', 1).waterShader, 'original');
  assert.equal(getPerformanceOptions('?perfdiag=1&waterShader=depth', 1).waterShader, 'depth');
  assert.equal(getPerformanceOptions('?perfdiag=1&waterShader=unknown', 1).waterShader, 'original');
});
