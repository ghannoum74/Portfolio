import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

const temporary = await mkdtemp(new URL('../.book-controls-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: {
  contents: `export { BookPageControls } from './src/ui/BookPageControls/BookPageControls';
    export { AnimatedBook3D } from './src/world/house/AnimatedBook3D';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' } });
const { BookPageControls, AnimatedBook3D } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

function controlsFixture(camera) {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  const writes = { text: 0, style: 0, disabled: 0, classes: 0 };
  const classes = new Set(), listeners = new Map(); let removed = false, previousCalls = 0, nextCalls = 0;
  const button = name => {
    let disabled = false;
    return { style: new Proxy({}, { set(target, key, value) { writes.style++; target[key] = value; return true; } }),
      get disabled() { return disabled; }, set disabled(value) { writes.disabled++; disabled = value; },
      addEventListener(type, callback) { listeners.set(`${name}:${type}`, callback); },
      removeEventListener(type, callback) { assert.equal(listeners.get(`${name}:${type}`), callback); listeners.delete(`${name}:${type}`); } };
  };
  const previous = button('previous'), next = button('next'); let label = '';
  const counter = { get textContent() { return label; }, set textContent(value) { writes.text++; label = value; } };
  const root = { classList: {
    add(name) { writes.classes++; classes.add(name); }, remove(name) { writes.classes++; classes.delete(name); },
  }, querySelector(selector) { return selector === '[data-book-prev]' ? previous : selector === '[data-book-next]' ? next : counter; },
  remove() { removed = true; } };
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  globalThis.document = { createElement(tag) { assert.equal(tag, 'div'); return root; }, body: { appendChild(node) { assert.equal(node, root); } } };
  const controls = new BookPageControls(camera, () => previousCalls++, () => nextCalls++);
  return { controls, previous, next, counter, writes, classes, listeners,
    calls: () => [previousCalls, nextCalls], removed: () => removed,
    cleanup() { controls.destroy(); if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
      if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; } };
}

// The preceding implementation's precise Box3 + eight-corner projection math.
function referenceLayout(book, camera) {
  const box = new THREE.Box3().setFromObject(book.model, true);
  if (box.isEmpty()) return null;
  camera.updateMatrixWorld();
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    corners.push(new THREE.Vector3(x, y, z).project(camera));
  }
  const vw = window.innerWidth, vh = window.innerHeight;
  const minX = Math.min(...corners.map(p => (p.x + 1) * .5 * vw));
  const maxX = Math.max(...corners.map(p => (p.x + 1) * .5 * vw));
  const centerY = (Math.min(...corners.map(p => (1 - p.y) * .5 * vh)) + Math.max(...corners.map(p => (1 - p.y) * .5 * vh))) / 2;
  return { left: `${THREE.MathUtils.clamp(minX - 76, 62, vw - 62)}px`, right: `${THREE.MathUtils.clamp(maxX + 76, 62, vw - 62)}px`,
    y: `${THREE.MathUtils.clamp(centerY, 86, vh - 86)}px` };
}

function assertLayout(fixture, book, camera) {
  const expected = referenceLayout(book, camera); assert.ok(expected);
  assert.equal(fixture.previous.style.left, expected.left); assert.equal(fixture.next.style.left, expected.right);
  assert.equal(fixture.previous.style.top, expected.y); assert.equal(fixture.next.style.top, expected.y);
}

function countVertexReads(root) {
  let reads = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const getVertexPosition = mesh.getVertexPosition;
    mesh.getVertexPosition = function(...args) { reads++; return getVertexPosition.apply(this, args); };
  });
  return { value: () => reads, reset() { reads = 0; } };
}

async function actualBook() {
  const asset = await readGeometryGLB(new URL('../public/assets/models/environment/book.glb', import.meta.url));
  const book = new AnimatedBook3D(asset);
  // Geometry/animation are real; canvas/image delivery is outside these CPU layout tests.
  const texture = new THREE.Texture();
  book.textures.ready = async () => {};
  book.textures.details = () => texture; book.textures.screenshot = async () => texture;
  await book.initializePages(); return book;
}

function finishMotion(book) {
  for (let i = 0; i < 200 && ['opening', 'turning'].includes(book.currentState); i++) book.update(1 / 30);
  assert.equal(book.currentState, 'open');
}

function cameraFor(root) {
  const bounds = new THREE.Box3().setFromObject(root, true), center = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(45, 1280 / 720, .01, 1000);
  camera.position.copy(center).add(new THREE.Vector3(0, .8, 1.5).multiplyScalar(bounds.getSize(new THREE.Vector3()).length()));
  camera.lookAt(center); return camera;
}

test('real book pose revisions cover opening, both page-turn endpoints and settled holds', async () => {
  const book = await actualBook();
  assert.equal(book.poseRevision, 0); book.update(.05); assert.equal(book.poseRevision, 0);
  book.open(); book.update(.05); assert.equal(book.poseRevision, 1); finishMotion(book);
  const opened = book.poseRevision; for (let i = 0; i < 120; i++) book.update(1 / 60);
  assert.equal(book.poseRevision, opened);
  for (const direction of [1, -1]) {
    const before = book.poseRevision, index = book.currentProjectIndex;
    await book.turnPage(direction);
    assert.equal(book.currentState, 'turning'); assert.equal(book.poseRevision, before + 1);
    finishMotion(book); assert.equal(book.currentProjectIndex, index + direction);
    assert.ok(book.poseRevision > before + 1);
    const settled = book.poseRevision; book.update(.05); assert.equal(book.poseRevision, settled);
  }
});

test('resting real-book controls retain exact coordinates with no repeated vertex scans or DOM writes', async t => {
  const book = await actualBook(); book.open(); finishMotion(book);
  const camera = cameraFor(book.model), fixture = controlsFixture(camera), reads = countVertexReads(book.model);
  try {
    fixture.controls.update(book); const firstReads = reads.value();
    assert.ok(firstReads >= 6030, 'exercise the actual morph-page geometry');
    assertLayout(fixture, book, camera); reads.reset();
    const writes = { ...fixture.writes };
    for (let i = 0; i < 120; i++) { book.update(1 / 60); fixture.controls.update(book); }
    assert.equal(reads.value(), 0); assert.deepEqual(fixture.writes, writes);
    assert.equal(fixture.counter.textContent, '01 / 04'); assert.equal(fixture.previous.disabled, true); assert.equal(fixture.next.disabled, false);
    fixture.listeners.get('previous:click')(); fixture.listeners.get('next:click')(); assert.deepEqual(fixture.calls(), [1, 1]);
    t.diagnostic(JSON.stringify({ firstLayoutVertexReads: firstReads, unchangedUpdates: 120, unchangedVertexReads: reads.value(), unchangedDomWrites: 0 }));
  } finally { fixture.cleanup(); }
  assert.equal(fixture.listeners.size, 0); assert.equal(fixture.removed(), true);
});

test('book controls reproject on camera/projection/viewport changes and rescan on book/parent transforms or pose changes', () => {
  const parent = new THREE.Group(), model = new THREE.Group(); parent.add(model);
  model.add(new THREE.Mesh(new THREE.BoxGeometry(2, .3, 1)));
  const book = { model, currentState: 'open', poseRevision: 0, canTurnBack: false, canTurnPage: true, currentProjectIndex: 0, projectCount: 4 };
  const camera = cameraFor(model), fixture = controlsFixture(camera), reads = countVertexReads(model);
  try {
    fixture.controls.update(book); assertLayout(fixture, book, camera);
    for (const change of [() => { camera.position.x += .8; }, () => { camera.rotation.z += .12; },
      () => { camera.zoom = 1.2; camera.updateProjectionMatrix(); },
      () => { window.innerWidth = 900; window.innerHeight = 500; }]) {
      reads.reset(); change(); fixture.controls.update(book); assert.equal(reads.value(), 0); assertLayout(fixture, book, camera);
    }
    for (const change of [() => { model.rotation.y += .4; }, () => { parent.position.x += .5; },
      () => { parent.scale.set(1.3, .9, 1.1); }, () => { model.children[0].position.z += .2; book.poseRevision++; }]) {
      reads.reset(); change(); fixture.controls.update(book); assert.ok(reads.value() > 0); assertLayout(fixture, book, camera);
    }
    reads.reset(); book.currentProjectIndex = 3; book.canTurnBack = true; book.canTurnPage = false;
    fixture.controls.update(book); assert.equal(reads.value(), 0);
    assert.equal(fixture.counter.textContent, '04 / 04'); assert.equal(fixture.previous.disabled, false); assert.equal(fixture.next.disabled, true);
    const replacement = { ...book, model: model.clone() }; fixture.controls.update(replacement); assertLayout(fixture, replacement, camera);
  } finally { fixture.cleanup(); }
});

test('book controls hide during both page turns, recover after preparation failure and rebuild bounds when shown again', async () => {
  const book = await actualBook(); book.open(); finishMotion(book);
  const camera = cameraFor(book.model), fixture = controlsFixture(camera), reads = countVertexReads(book.model);
  try {
    fixture.controls.update(book);
    for (const direction of [1, -1]) {
      await book.turnPage(direction); reads.reset(); fixture.controls.update(book);
      assert.equal(fixture.classes.has('is-visible'), false); assert.equal(reads.value(), 0);
      finishMotion(book); fixture.controls.update(book); assert.ok(reads.value() > 0); assertLayout(fixture, book, camera);
      assert.equal(fixture.classes.has('is-visible'), true);
    }
    const originalScreenshot = book.textures.screenshot, originalError = console.error;
    // Both screenshots share this rejection, and Promise.all observes each one.
    const failure = Promise.reject(new Error('screenshot unavailable')); failure.catch(() => {});
    book.textures.screenshot = () => failure;
    console.error = () => {};
    try {
      const pending = book.turnPage(1); fixture.controls.update(book); assert.equal(fixture.classes.has('is-visible'), false);
      await pending; assert.equal(book.currentState, 'open'); fixture.controls.update(book); assertLayout(fixture, book, camera);
    } finally { book.textures.screenshot = originalScreenshot; console.error = originalError; }
    fixture.controls.hide(); reads.reset(); fixture.controls.update(book); assert.ok(reads.value() > 0); assertLayout(fixture, book, camera);
    fixture.controls.update(null); const writes = { ...fixture.writes }; reads.reset();
    for (let i = 0; i < 60; i++) fixture.controls.update(null);
    assert.equal(reads.value(), 0); assert.deepEqual(fixture.writes, writes);
  } finally { fixture.cleanup(); }
});
