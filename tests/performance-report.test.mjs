import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

globalThis.window = { location: { search: '?perfdiag=1', origin: 'http://localhost:5173', pathname: '/',
  href: 'http://localhost:5173/?perfdiag=1&secret=not-a-report-field#private' },
  devicePixelRatio: 1.5, innerWidth: 1280, innerHeight: 720 };
const temporary = await mkdtemp(new URL('../.performance-report-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: {
  contents: `export { PerformanceReport, downloadPerformanceReport } from './src/core/PerformanceReport';
    export { Game } from './src/core/Game';
    export { Renderer } from './src/core/Renderer';
    export { World } from './src/world/World';
    export { FrameProfiler } from './src/core/FrameProfiler';
    export { performanceOptions } from './src/core/PerformanceOptions';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty', '.html': 'text' },
plugins: [{ name: 'test-css', setup(builder) {
  builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'empty.css', namespace: 'test-css' }));
  builder.onLoad({ filter: /.*/, namespace: 'test-css' }, () => ({ contents: '', loader: 'js' }));
} }] });
let loaded;
try { loaded = await import(pathToFileURL(bundle)); }
finally { await rm(temporary, { recursive: true, force: true }); }
const { PerformanceReport, downloadPerformanceReport, Game, Renderer, World, FrameProfiler, performanceOptions } = loaded;

function downloadFixture(clickFails = false) {
  const original = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout };
  let blob, appended = false, removed = false, clicks = 0;
  const revoked = [], delayed = [];
  const link = { click() { clicks++; if (clickFails) throw new Error('download click failed'); }, remove() { removed = true; } };
  globalThis.document = { visibilityState: 'visible', createElement(tag) { assert.equal(tag, 'a'); return link; },
    body: { appendChild(value) { assert.equal(value, link); appended = true; } } };
  URL.createObjectURL = value => { blob = value; return 'blob:performance-report-test'; };
  URL.revokeObjectURL = value => revoked.push(value);
  globalThis.setTimeout = (callback, delay) => { delayed.push({ callback, delay }); return 1; };
  return { link, revoked, delayed, blob: () => blob, state: () => ({ appended, removed, clicks }),
    cleanup() { if (original.document === undefined) delete globalThis.document; else globalThis.document = original.document;
      URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; globalThis.setTimeout = original.timeout; } };
}

test('report storage is bounded per stream and snapshots cannot mutate captured samples or metadata', () => {
  for (const invalid of [0, -1, 1.5, 121, Infinity, NaN]) assert.throws(() => new PerformanceReport(invalid), RangeError);
  let now = 100;
  const report = new PerformanceReport(2, () => now);
  const context = { scene: 'house', camera: [1, 2, 3], settings: { shadows: true } };
  const sample = { callbackCpuMs: { mean: 4 } };
  report.record('frame', sample, context);
  sample.callbackCpuMs.mean = 999; context.camera[0] = 999; context.settings.shadows = false;
  now = 200; report.record('renderer', { gpuRenderMsMean: null, gpuTimingStatus: 'disabled' }, { scene: 'house' });
  const first = report.snapshot({ sourceRevision: null });
  assert.equal(first.streams.frame[0].sample.callbackCpuMs.mean, 4);
  assert.deepEqual(first.streams.frame[0].endContext.camera, [1, 2, 3]);
  assert.equal(first.streams.frame[0].endContext.settings.shadows, true);
  first.streams.frame[0].sample.callbackCpuMs.mean = 555; first.metadata.sourceRevision = 'not-authoritative';
  const untouched = report.snapshot({ sourceRevision: null });
  assert.equal(untouched.streams.frame[0].sample.callbackCpuMs.mean, 4); assert.equal(untouched.metadata.sourceRevision, null);
  for (let i = 0; i < 4; i++) { now += 100; report.record('frame', { index: i }, { scene: 'exterior' }); }
  const bounded = report.snapshot({});
  assert.deepEqual(bounded.counts, { frame: 2, renderer: 1, physics: 0 });
  assert.deepEqual(bounded.dropped, { frame: 3, renderer: 0, physics: 0 });
  assert.deepEqual(bounded.streams.frame.map(entry => entry.sample.index), [2, 3]);
  assert.deepEqual(bounded.streams.frame.map(entry => entry.atMs), [400, 500]);
});

test('reports retain separate runs and nullable GPU readings without inventing aligned windows or a source revision', () => {
  const report = new PerformanceReport(3, () => 10);
  const empty = report.snapshot({ sourceRevision: null });
  assert.deepEqual(empty.counts, { frame: 0, renderer: 0, physics: 0 });
  assert.equal(empty.windowConditionsIndependentlyVerified, false);
  report.record('renderer', { gpuTimingStatus: 'unsupported', gpuTimingSamples: 0, gpuRenderMsMean: null }, { scene: 'exterior', settings: { shadows: true } });
  report.newRun();
  report.record('renderer', { gpuTimingStatus: 'ready', gpuTimingSamples: 5, gpuRenderMsMean: 12.4 }, { scene: 'exterior', settings: { shadows: false } });
  report.record('physics', { physicsStepsPerFrame: 1 }, { scene: 'house' });
  const decoded = JSON.parse(JSON.stringify(report.snapshot({ sourceRevision: null })));
  assert.equal(decoded.schemaVersion, 1); assert.equal(decoded.currentRun, 1);
  assert.equal(decoded.endContextIsWindowEndSnapshot, true); assert.equal(decoded.metadata.sourceRevision, null);
  assert.deepEqual(decoded.streams.renderer.map(entry => entry.run), [0, 1]);
  assert.deepEqual(decoded.streams.renderer.map(entry => entry.endContext.settings.shadows), [true, false]);
  assert.deepEqual(decoded.streams.renderer.map(entry => entry.sample.gpuRenderMsMean), [null, 12.4]);
  assert.equal(decoded.streams.physics[0].endContext.scene, 'house');
});

test('explicit JSON download cleans up its anchor and releases the object URL after success or click failure', async () => {
  const report = new PerformanceReport().snapshot({ sourceRevision: null });
  for (const fails of [false, true]) {
    const f = downloadFixture(fails);
    try {
      if (fails) assert.throws(() => downloadPerformanceReport(report), /download click failed/);
      else downloadPerformanceReport(report);
      assert.deepEqual(f.state(), { appended: true, removed: true, clicks: 1 });
      assert.equal(f.link.href, 'blob:performance-report-test'); assert.match(f.link.download, /^portfolio-perf-.*\.json$/);
      assert.equal(f.blob().type, 'application/json'); assert.deepEqual(JSON.parse(await f.blob().text()), report);
      assert.deepEqual(f.revoked, []); assert.equal(f.delayed.length, 1); assert.equal(f.delayed[0].delay, 1000);
      f.delayed[0].callback(); assert.deepEqual(f.revoked, ['blob:performance-report-test']);
    } finally { f.cleanup(); }
  }
});

test('Game report wiring stays inactive without diagnostics and resets producer windows while preserving prior runs', () => {
  const game = Object.create(Game.prototype), options = structuredClone(performanceOptions);
  game.renderer = {}; game.world = {};
  game.performanceReportContext = () => assert.fail('disabled diagnostics must not read context');
  game.setupPerformanceReport(); game.downloadPerformanceReport();
  assert.equal(game.renderer.onPerformanceSample, undefined); assert.equal(game.world.onPerformanceSample, undefined);
  const report = new PerformanceReport(); game.performanceReport = report;
  let context = { scene: 'house', settings: { shadows: true } };
  game.performanceReportContext = () => context;
  game.setupPerformanceReport(); game.renderer.onPerformanceSample({ drawCallsLastFrame: 90 });
  const resets = [];
  game.frameProfiler = { reset() { resets.push('frame'); } };
  game.renderer.resetPerformanceSamples = () => resets.push('renderer');
  game.world.resetPerformanceSamples = () => resets.push('physics');
  game.resetPerformanceSamples(); assert.deepEqual(resets, ['frame', 'renderer', 'physics']);
  context = { scene: 'exterior', settings: { shadows: false } };
  game.world.onPerformanceSample({ physicsStepsPerFrame: 1 });
  const result = report.snapshot({});
  assert.equal(result.streams.renderer[0].run, 0); assert.equal(result.streams.renderer[0].endContext.settings.shadows, true);
  assert.equal(result.streams.physics[0].run, 1); assert.equal(result.streams.physics[0].endContext.scene, 'exterior');
  assert.deepEqual(performanceOptions, options);
});

test('Game exports current camera, resolution, scene and live settings without URL query/hash or rendering changes', async () => {
  const game = Object.create(Game.prototype), f = downloadFixture(), options = structuredClone(performanceOptions);
  const camera = new THREE.PerspectiveCamera(45, 1280 / 720, .1, 100); camera.position.set(4, 5, 6); camera.lookAt(1, 2, 3);
  const model = new THREE.Group(); model.position.set(1, 2, 3);
  Object.assign(game, { performanceReport: new PerformanceReport(), phase: 'playing', insideHouse: true, debugMode: false, projectBookMode: 'idle',
    getActiveCamera: () => camera, awards: { mode: 'active' }, journey: { mode: 'idle' }, workshop: { mode: 'idle' },
    world: { player: { model }, isUsingRealTime: () => false, getTimeOfDay: () => 7.15 },
    renderer: { instance: { domElement: { width: 1920, height: 1080 }, getPixelRatio: () => 1.5,
      render() { assert.fail('download must not submit a render'); }, getContext() { assert.fail('download must not sample GPU'); } } },
  });
  try {
    game.downloadPerformanceReport();
    const text = await f.blob().text(), result = JSON.parse(text), context = result.metadata.contextAtDownload;
    assert.deepEqual(result.metadata.page, { origin: 'http://localhost:5173', pathname: '/' });
    assert.ok(!text.includes('secret=') && !text.includes('#private'));
    assert.equal(result.metadata.sourceRevision, null); assert.equal(result.metadata.documentVisibility, 'visible');
    assert.equal(context.scene, 'house'); assert.equal(context.phase, 'playing'); assert.equal(context.awardsMode, 'active');
    assert.equal(context.realTime, false); assert.equal(context.hour, 7.15); assert.deepEqual(context.playerPosition, [1, 2, 3]);
    assert.deepEqual(context.camera.worldMatrix, camera.matrixWorld.toArray()); assert.deepEqual(context.camera.projectionMatrix, camera.projectionMatrix.toArray());
    assert.deepEqual(context.viewport, { cssWidth: 1280, cssHeight: 720, framebufferWidth: 1920, framebufferHeight: 1080, nativePixelRatio: 1.5, pixelRatio: 1.5 });
    assert.deepEqual(context.settings, options); assert.deepEqual(performanceOptions, options);
    f.delayed[0].callback();
  } finally { f.cleanup(); }
});

test('production renderer, physics and frame summaries enter the report without draining extra GPU samples', () => {
  const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance'), originalInfo = console.info;
  let now = 3000, gpuReads = 0;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } }); console.info = () => {};
  const report = new PerformanceReport(120, () => now), game = Object.create(Game.prototype);
  const renderer = Object.create(Renderer.prototype), world = Object.create(World.prototype);
  const info = { render: { calls: 0, triangles: 0 }, memory: { textures: 8, geometries: 7 }, reset() { this.render.calls = this.render.triangles = 0; } };
  Object.assign(renderer, { options: { ...performanceOptions, perfDiag: true, gpuTiming: true },
    borderHighlight: { update() {} }, hasInteractionOutline: false, perfStarted: 0, perfFrames: 89, perfRenderMs: 0, perfWarmupUntil: 0,
    instance: { info, getPixelRatio: () => 1.5, render() { info.render.calls++; info.render.triangles += 100; } },
    gpuTimer: { begin() {}, end() {}, takeSample() { gpuReads++; return { gpuTimingStatus: 'ready', gpuTimingSamples: 5, gpuRenderMsMean: 12.4 }; } },
  });
  Object.assign(world, { initialized: true, physicsAccumulator: 0, fixedPhysicsStep: 1 / 60, maxPhysicsSteps: 5,
    perfDiag: true, physicsTimingStarted: 0, physicsTimingMs: 0, physicsTimingFrames: 119, physicsStepCount: 120,
    physicsDebugRenderer: { update() {} }, player: { syncFromPhysics() {}, updateAnimation() {} },
  });
  Object.assign(game, { renderer, world, performanceReport: report, performanceReportContext: () => ({ scene: 'house' }) });
  try {
    game.setupPerformanceReport(); renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera()); world.update(0, false);
    let profileNow = 0;
    const profiler = new FrameProfiler(() => profileNow, 20, 0);
    profiler.begin(); profiler.finish('house');
    const frame = at => { profileNow = at; profiler.begin(); profileNow += 4; return profiler.finish('house'); };
    frame(20); const frameSample = frame(36); assert.ok(frameSample); report.record('frame', frameSample, { scene: 'house' });
    const result = report.snapshot({});
    assert.deepEqual(result.counts, { frame: 1, renderer: 1, physics: 1 });
    assert.equal(result.streams.renderer[0].sample.drawCallsLastFrame, 1); assert.equal(result.streams.renderer[0].sample.trianglesLastFrame, 100);
    assert.equal(result.streams.renderer[0].sample.gpuRenderMsMean, 12.4); assert.equal(result.streams.physics[0].sample.physicsStepsPerFrame, 1);
    assert.deepEqual(result.streams.frame[0].sample, frameSample); report.snapshot({}); assert.equal(gpuReads, 1);
    // Existing warm-up and disabled diagnostics still suppress emission.
    now = 6001; renderer.perfWarmupUntil = 8001; renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    renderer.options.perfDiag = false; renderer.gpuTimer = undefined; world.perfDiag = false;
    renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera()); world.update(0, false);
    assert.deepEqual(report.snapshot({}).counts, result.counts); assert.equal(gpuReads, 1);
  } finally { Object.defineProperty(globalThis, 'performance', originalPerformance); console.info = originalInfo; }
});
