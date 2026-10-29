import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

class Element {
  hidden = false; disabled = false; children = []; dataset = {}; style = {}; events = new Map();
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); return node; }
  setAttribute() {}
  addEventListener(name, action) { this.events.set(name, action); }
  contains(node) { return this === node || this.children.some(child => child.contains?.(node)); }
  blur() { document.activeElement = null; }
  remove() {}
}
globalThis.HTMLElement = Element;
globalThis.document = { body: new Element(), createElement: () => new Element(), activeElement: null };
globalThis.window = { location: { search: '' }, matchMedia: () => ({ matches: false }), devicePixelRatio: 1, performance: globalThis.performance, addEventListener() {} };
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(new URL('../.house-guide-test-', import.meta.url));
const bundle = temporary + '/guide.mjs';
await build({ stdin: { contents: "export * from './src/world/house/HouseFirstVisitGuide'; export { Game } from './src/core/Game'; export {HouseTourPath} from './src/world/house/HouseTourPath'; export {PhysicsWorld} from './src/physics/PhysicsWorld'; export {WorldColliders} from './src/physics/WorldColliders'; export {ThirdPersonCamera} from './src/camera/ThirdPersonCamera';", resolveDir: root, loader: 'ts' },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: bundle,
  loader: { '.css': 'empty', '.html': 'text', '.glsl': 'text' },
  plugins: [{ name: 'test-css', setup(b) {
    b.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'test-css' }));
    b.onLoad({ filter: /.*/, namespace: 'test-css' }, () => ({ contents: '', loader: 'js' }));
  } }],
});
const { Game, HouseFirstVisitGuide, HOUSE_GUIDE_SEEN_KEY, houseGuideShot, houseTourSteps, HouseTourPath, PhysicsWorld, WorldColliders, ThirdPersonCamera } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const tick = (guide, frames = 250, available = true) => { for (let i = 0; i < frames; i++) guide.update(1 / 60, available); };
function fixture(ids = ['projects', 'journey'], options = {}) {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 1000);
  camera.position.set(1, 2, 3); camera.lookAt(0, 0, 0);
  const originalPosition = camera.position.clone(), originalRotation = camera.quaternion.clone();
  const steps = ids.map((id, i) => {
    const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    target.position.set(i * 3 - 1, 0.5, -5); target.updateMatrixWorld(true);
    return { id, target, title: id, description: 'Walk over and press E.' };
  });
  const events = [], saved = options.storage ?? storage();
  const guide = new HouseFirstVisitGuide(camera, steps, { approach: new THREE.Vector3(0, 0, 2),
    storage: saved, onCameraStart: target => events.push(['start', target]), onCameraEnd: () => events.push(['end']), onTargetChange: target => events.push(['target', target]), ...options });
  return { guide, camera, events, saved, steps, originalPosition, originalRotation };
}
function restored(f) {
  assert.ok(f.camera.position.distanceTo(f.originalPosition) < 1e-12);
  assert.ok(f.camera.quaternion.angleTo(f.originalRotation) < 1e-7);
  assert.equal(f.guide.isControllingCamera, false);
}

test('first entry automatically tours every section without any interaction, then restores the original view', () => {
  const f = fixture(['projects', 'journey', 'awards', 'workshop']);
  f.saved.setItem('portfolio.house-first-visit.v1', 'seen');
  assert.equal(f.guide.start(), true, 'Visitors who only saw the old book hint receive the revised tour once');
  assert.equal(f.saved.getItem(HOUSE_GUIDE_SEEN_KEY), 'seen');
  const visited = [], before = f.camera.position.clone();
  for (let frame = 0; frame < 3000 && f.guide.isActive; frame++) {
    f.guide.update(1 / 60);
    assert.equal(f.guide.isControllingCamera, f.guide.isActive, 'Do not return control between sections');
    if (f.guide.currentTask && visited.at(-1) !== f.guide.currentTask) visited.push(f.guide.currentTask);
    assert.ok(f.camera.position.toArray().every(Number.isFinite));
  }
  assert.deepEqual(visited, ['projects', 'journey', 'awards', 'workshop']);
  assert.equal(f.events.filter(e => e[0] === 'start').length, 1);
  assert.equal(f.events.filter(e => e[0] === 'end').length, 1);
  assert.equal(f.events.filter(e => e[0] === 'target').length, 4);
  restored(f); assert.equal(f.guide.isActive, false); assert.equal(f.guide.start(), false);
  assert.equal(fixture(undefined, { storage: f.saved }).guide.start(), false, 'Reload and re-entry must not repeat the tour');
});

test('camera movement remains continuous between sections rather than teleporting back to the player', () => {
  const f = fixture(['projects', 'journey', 'awards', 'workshop']); f.guide.start();
  let moved = 0;
  for (let frame = 0; frame < 3000 && f.guide.isActive; frame++) {
    const previous = f.camera.position.clone(), rotation = f.camera.quaternion.clone();
    f.guide.update(1 / 60);
    const distance = f.camera.position.distanceTo(previous);
    assert.ok(distance < 0.24, `Position jumped ${distance}`);
    assert.ok(rotation.angleTo(f.camera.quaternion) < 0.2, `Aim jumped ${rotation.angleTo(f.camera.quaternion)}`);
    if (distance > 0.0001) moved++;
  }
  assert.ok(moved > 300, 'The tour must animate through the room'); restored(f);
});

test('Skip and scene cancellation release camera ownership during intro, movement, pauses and return', () => {
  for (const frame of [0, 35, 90, 180, 310, 540, 780, 1100, 1800]) {
    const f = fixture(['projects', 'journey', 'awards', 'workshop']); f.guide.start(); tick(f.guide, frame);
    f.guide.skip(); tick(f.guide, 60); restored(f);
    assert.equal(f.guide.isActive, false, String(frame));
    assert.equal(f.events.filter(e => e[0] === 'end').length, 1);
    const count = f.events.length; tick(f.guide); assert.equal(f.events.length, count);
  }
  const f = fixture(); f.guide.start(); tick(f.guide, 120); f.guide.cancel(); restored(f);
  f.guide.destroy(); assert.equal(f.events.filter(e => e[0] === 'end').length, 1);
});

test('Next advances a paused section while an unavailable gameplay surface pauses the tour clock', () => {
  const f = fixture(['projects', 'journey']); f.guide.start();
  const pose = f.camera.position.clone(); tick(f.guide, 300, false);
  assert.ok(f.camera.position.equals(pose)); assert.equal(f.guide.currentTask, undefined);
  f.guide.advance(); assert.equal(f.guide.currentTask, 'projects');
  f.guide.advance(); assert.equal(f.guide.currentTask, 'projects', 'Next cannot interrupt a camera move');
  while (f.guide.stage !== 'holding') f.guide.update(1 / 60);
  f.guide.advance(); assert.equal(f.guide.currentTask, 'journey');
  f.guide.skip(); tick(f.guide, 60); restored(f);
});

test('blocked storage and reduced motion still show every section automatically using still shots', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const f = fixture(['projects', 'journey', 'awards', 'workshop'], { storage: blocked, reducedMotion: true });
  assert.equal(f.guide.start(), true);
  const visited = [];
  for (let i = 0; i < 2000 && f.guide.isActive; i++) {
    const wasHolding = f.guide.stage === 'holding', position = f.camera.position.clone();
    f.guide.update(1 / 60);
    if (wasHolding && f.guide.stage === 'holding') assert.ok(f.camera.position.equals(position), 'No dolly or sweep for reduced motion');
    if (f.guide.currentTask && visited.at(-1) !== f.guide.currentTask) visited.push(f.guide.currentTask);
  }
  assert.deepEqual(visited, ['projects', 'journey', 'awards', 'workshop']); restored(f);
  assert.equal(f.guide.start(), false);
});

test('an unavailable model cannot consume the first-visit flag or lock controls', () => {
  const saved = storage(), camera = new THREE.PerspectiveCamera();
  const guide = new HouseFirstVisitGuide(camera, [{ id: 'projects', target: new THREE.Group(), title: '', description: '' }],
    { approach: new THREE.Vector3(), storage: saved, onCameraStart: () => assert.fail('No target'), onCameraEnd() {} });
  assert.equal(guide.start(), false); assert.equal(saved.getItem(HOUSE_GUIDE_SEEN_KEY), null);
  assert.equal(guide.isControllingCamera, false);
});

function gameEntryFixture() {
  const events = [], spawn = new THREE.Object3D();
  let reveal;
  const game = Object.assign(Object.create(Game.prototype), {
    transitioning: false, insideHouse: false, phase: 'playing', projectBookMode: 'idle',
    houseReturnPosition: new THREE.Vector3(), houseReturnRotationY: 0,
    scene: new THREE.Scene(), playerCamera: new THREE.PerspectiveCamera(),
    paperPanel: { isOpen: false }, dialogueBox: { isOpen: false },
    keyboard: { setEnabled: enabled => events.push(['keyboard', enabled]) },
    houseGuide: { start: () => events.push(['guide']), cancel() {}, isControllingCamera: false },
    registerHouseInteractions: () => events.push(['registered']),
    sceneTransition: { fadeIn: async () => {}, fadeOut: () => { events.push(['reveal']); return new Promise(resolve => { reveal = resolve; }); } },
    thirdPersonCamera: { setInteriorMode() {}, snap() {}, setInputEnabled() {} },
    renderer: { instance: { compileAsync: async () => {} }, prepareScene: async () => {}, prepareHighlights: async () => {}, setInteractionOutline() {} },
    interactionSystem: { highlightTargets: [] }, worldAudio: { setActive() {} },
    helpButton: { setVisible() {} }, debugMode: false,
  });
  const house = { getSpawn: () => spawn, show() {}, hide() {} };
  game.world = { player: { model: new THREE.Object3D(), getFeetPosition: out => out.set(0, 0, 0), teleport() {} },
    loadHouseInterior: async () => house, setExteriorVisible() {}, setExteriorLightingEnabled() {} };
  return { game, events, reveal: () => reveal() };
}

test('Game starts the guide only after the real entrance reveal resolves', async () => {
  const f = gameEntryFixture(), entering = f.game.enterHouse();
  await new Promise(setImmediate);
  assert.equal(f.events.filter(e => e[0] === 'guide').length, 0);
  assert.equal(f.game.transitioning, true);
  assert.ok(f.events.some(e => e[0] === 'registered'));
  f.reveal(); await entering;
  assert.equal(f.events.at(-1)[0], 'guide');
  assert.equal(f.game.insideHouse, true); assert.equal(f.game.transitioning, false);
});

test('a failed entrance restores gameplay without consuming the guide', async () => {
  const f = gameEntryFixture();
  f.game.world.loadHouseInterior = async () => { throw Error('load failed'); };
  f.game.sceneTransition.fadeOut = async () => {};
  const error = console.error; console.error = () => {};
  try { await f.game.enterHouse(); } finally { console.error = error; }
  assert.equal(f.game.insideHouse, false); assert.equal(f.game.transitioning, false);
  assert.equal(f.events.filter(e => e[0] === 'guide').length, 0);
  assert.deepEqual(f.events.at(-1), ['keyboard', true]);
});

test('an active tour blocks every competing exhibit camera', () => {
  for (const [field, method] of [['journey', 'enterJourneyMap'], ['awards', 'enterAwardsExperience'], ['workshop', 'enterWorkshopExperience']]) {
    const f = gameEntryFixture(); f.game.insideHouse = true;
    let entered = 0; f.game[field] = { enter: () => { entered++; return true; } };
    f.game.houseGuide.isControllingCamera = true; f.game[method](); assert.equal(entered, 0);
    f.game.houseGuide.isControllingCamera = false; f.game[method](); assert.equal(entered, 1);
  }
});

test('production tour shows all four areas from oblique angles with clear, continuous camera routes', async () => {
  const house = (await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url))).scene;
  house.position.y = -30;
  const book = (await readGeometryGLB(new URL('../public/assets/models/environment/book.glb', import.meta.url))).scene;
  house.add(book); house.updateMatrixWorld(true);
  const physics = new PhysicsWorld(); await physics.init();
  try {
    const log = console.log;
    try { console.log = () => {}; new WorldColliders(physics).createFromEnvironment(house); } finally { console.log = log; }
    physics.beginFrame(1 / 60); physics.step();
    const approach = house.getObjectByName('SPAWN_HOUSE').getWorldPosition(new THREE.Vector3());
    for (const aspect of [1.6, 0.5]) {
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000), player = new THREE.Group();
      player.position.copy(approach).add(new THREE.Vector3(0, -0.14, -2)); player.rotation.y = Math.PI;
      const follow = new ThirdPersonCamera(camera, player, { addEventListener() {}, setPointerCapture() {}, hasPointerCapture: () => false }, physics);
      follow.setInteriorMode(true); follow.snap();
      const route = new HouseTourPath(physics, house), steps = houseTourSteps(house, book);
      assert.equal(steps.length, 4);
      for (const step of steps) {
        const shot = houseGuideShot(step, camera, approach, point => route.isClear(point)); assert.ok(shot, step.id);
        assert.ok(route.isClear(shot.position), `${step.id}: blocked lens`);
        const offset = shot.position.clone().sub(shot.center);
        assert.ok(Math.abs(offset.y) / Math.hypot(offset.x, offset.z) <= 0.56, 'No top-down reading shots');
        const view = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        view.position.copy(shot.position); view.quaternion.copy(shot.rotation); view.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(step.target, true);
        for (const target of step.contextTargets ?? []) bounds.union(new THREE.Box3().setFromObject(target, true));
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(x,y,z).project(view);
          assert.ok(Math.abs(point.x) < 0.8 && Math.abs(point.y) < 0.8 && point.z < 1, `${step.id}: clipped section`);
        }
      }
      const originalPosition = camera.position.clone(), originalRotation = camera.quaternion.clone(), visited = [];
      const guide = new HouseFirstVisitGuide(camera, steps, { approach, route, storage: storage(), onCameraStart() {}, onCameraEnd() {} });
      guide.start();
      for (let frame = 0; frame < 5000 && guide.isActive; frame++) {
        const previous = camera.position.clone(), rotation = camera.quaternion.clone(); guide.update(1 / 60);
        assert.ok(route.isClear(camera.position), `${guide.currentTask}: camera intersects a wall, roof or furniture`);
        assert.ok(camera.position.distanceTo(previous) < 0.4, `${guide.currentTask}: unexpected camera cut`);
        assert.ok(rotation.angleTo(camera.quaternion) < 0.12, `${guide.currentTask}: camera aim snaps during travel`);
        if (guide.currentTask && visited.at(-1) !== guide.currentTask) visited.push(guide.currentTask);
      }
      assert.deepEqual(visited, ['projects', 'journey', 'awards', 'workshop']);
      restored({ camera, guide, originalPosition, originalRotation });
      assert.equal(guide.isActive, false);
    }
  } finally { physics.world.free(); }
});

test('camera routes bend around an obstruction and smoothing never cuts through it', async () => {
  const physics = new PhysicsWorld(); await physics.init();
  try {
    physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(6, 0.1, 6).setTranslation(0, -0.1, 0));
    physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(0.45, 1.7, 2.8).setTranslation(0, 1.7, 0));
    physics.invalidateStaticQueries(); physics.beginFrame(1 / 60); physics.step();
    const house = new THREE.Group(), floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 12));
    floor.name = 'HOUSE_FLOOR'; floor.position.y = -0.1; house.add(floor);
    const spawn = new THREE.Object3D(); spawn.name = 'SPAWN_HOUSE'; house.add(spawn); house.updateMatrixWorld(true);
    const route = new HouseTourPath(physics, house), from = new THREE.Vector3(-3, 1.65, 0), to = new THREE.Vector3(3, 1.65, 0);
    assert.equal(route.segmentClear(from, to), false);
    const points = route.plan(from, to); assert.ok(points && points.length >= 3, 'Route around the wall');
    const curve = route.curve(points);
    for (let i = 0; i <= 250; i++) assert.ok(route.isClear(curve.getPointAt(i / 250)), 'Spline must retain wall clearance');
    assert.equal(route.plan(from, new THREE.Vector3(0, 1.65, 0)), null, 'Do not route into furniture');
    assert.equal(route.plan(from, new THREE.Vector3(8, 1.65, 0)), null, 'Keep the camera inside the house footprint');
  } finally { physics.world.free(); }
});
