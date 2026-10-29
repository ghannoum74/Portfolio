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
globalThis.window = { location: { search: '' }, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 };
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(new URL('../.house-guide-test-', import.meta.url));
const bundle = temporary + '/guide.mjs';
await build({ stdin: { contents: "export * from './src/world/house/HouseFirstVisitGuide'; export { Game } from './src/core/Game';", resolveDir: root, loader: 'ts' },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: bundle,
  loader: { '.css': 'empty', '.html': 'text', '.glsl': 'text' },
  plugins: [{ name: 'test-css', setup(b) {
    b.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'test-css' }));
    b.onLoad({ filter: /.*/, namespace: 'test-css' }, () => ({ contents: '', loader: 'js' }));
  } }],
});
const { Game, HouseFirstVisitGuide, HOUSE_GUIDE_SEEN_KEY, houseGuideShot } = await import(pathToFileURL(bundle));
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
    storage: saved, onCameraStart: target => events.push(['start', target]), onCameraEnd: () => events.push(['end']), ...options });
  return { guide, camera, events, saved, steps, originalPosition, originalRotation };
}
function restored(f) {
  assert.ok(f.camera.position.distanceTo(f.originalPosition) < 1e-12);
  assert.ok(f.camera.quaternion.angleTo(f.originalRotation) < 1e-7);
  assert.equal(f.guide.isControllingCamera, false);
}

test('first entry cues one task, restores the exact view, and waits for the actual interaction to close', () => {
  const f = fixture();
  assert.equal(f.guide.start(), true);
  assert.equal(f.saved.getItem(HOUSE_GUIDE_SEEN_KEY), 'seen');
  assert.equal(f.guide.currentTask, 'projects');
  assert.equal(f.guide.isControllingCamera, true);
  tick(f.guide); restored(f);
  assert.equal(f.events.length, 2);
  tick(f.guide, 600); assert.equal(f.guide.currentTask, 'projects', 'Time alone cannot complete a task');
  f.guide.complete('projects');
  tick(f.guide, 600, false);
  assert.equal(f.events.length, 2, 'Do not steal the camera from an open book or panel');
  tick(f.guide, 30);
  assert.equal(f.guide.currentTask, 'journey');
  assert.equal(f.guide.isControllingCamera, true);
  tick(f.guide); restored(f);
  f.guide.complete('journey'); tick(f.guide, 30);
  assert.equal(f.guide.isActive, false);
  assert.equal(f.events.filter(e => e[0] === 'start').length, 2);
  assert.equal(f.events.filter(e => e[0] === 'end').length, 2);
  assert.equal(f.guide.start(), false);
  const nextVisit = fixture(undefined, { storage: f.saved });
  assert.equal(nextVisit.guide.start(), false, 'A new Game after reload does not repeat first entry');
  assert.equal(nextVisit.events.length, 0);
});

test('Skip and Escape-equivalent cancellation release camera ownership in every transition phase', () => {
  for (const frame of [0, 8, 20, 45, 179, 192, 205, 250]) {
    const f = fixture(); f.guide.start(); tick(f.guide, frame); f.guide.skip(); tick(f.guide, 120);
    restored(f); assert.equal(f.guide.isActive, false, String(frame));
    assert.equal(f.events.filter(e => e[0] === 'end').length, 1, String(frame));
    tick(f.guide); assert.equal(f.events.length, 2, 'No delayed cue after skipping');
  }
  const f = fixture(); f.guide.start(); tick(f.guide, 35); f.guide.cancel(); restored(f);
  f.guide.destroy(); assert.equal(f.events.length, 2, 'Destroy cannot release an unrelated controller');
});

test('out-of-order discoveries are remembered and never replayed as later objectives', () => {
  const f = fixture(['projects', 'journey', 'awards']); f.guide.start(); tick(f.guide);
  f.guide.complete('journey'); f.guide.complete('journey');
  assert.equal(f.guide.currentTask, 'projects');
  f.guide.complete('projects'); tick(f.guide, 30);
  assert.equal(f.guide.currentTask, 'awards');
  tick(f.guide); f.guide.complete('awards'); tick(f.guide, 30);
  assert.equal(f.guide.isActive, false);
  assert.equal(f.events.filter(e => e[0] === 'start').length, 2);
});

test('completion delivered during a cue still returns the camera before advancing', () => {
  const f = fixture(); f.guide.start(); tick(f.guide, 25); f.guide.complete('projects');
  tick(f.guide, 100, false); restored(f);
  assert.equal(f.guide.currentTask, 'projects');
  tick(f.guide, 30); assert.equal(f.guide.currentTask, 'journey');
  f.guide.cancel();
});

test('blocked storage and reduced motion preserve usable gameplay without repeated entry attempts', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const f = fixture(undefined, { storage: blocked, reducedMotion: true });
  assert.equal(f.guide.start(), true); restored(f); assert.equal(f.events.length, 0);
  f.guide.complete('projects'); tick(f.guide, 30);
  assert.equal(f.guide.currentTask, 'journey'); restored(f);
  f.guide.skip(); assert.equal(f.guide.start(), false);
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

test('only successful exhibit entry completes guide tasks and an active cue blocks competing cameras', () => {
  for (const [task, field, method] of [
    ['journey', 'journey', 'enterJourneyMap'], ['awards', 'awards', 'enterAwardsExperience'],
    ['workshop', 'workshop', 'enterWorkshopExperience'],
  ]) {
    const f = gameEntryFixture(), complete = []; f.game.insideHouse = true;
    f.game.houseGuide.complete = id => complete.push(id);
    f.game[field] = { enter: () => false };
    f.game[method](); assert.deepEqual(complete, []);
    f.game[field].enter = () => true;
    f.game.houseGuide.isControllingCamera = true;
    f.game[method](); assert.deepEqual(complete, []);
    f.game.houseGuide.isControllingCamera = false;
    f.game[method](); assert.deepEqual(complete, [task]);
  }
  const f = gameEntryFixture(), complete = [];
  f.game.houseGuide.complete = id => complete.push(id);
  f.game.projectBookMode = 'opening'; f.game.activeProjectBook = { model: new THREE.Group() };
  f.game.projectBookMarker = new THREE.Object3D();
  let focused;
  f.game.projectBookCamera = { focus: (_book, _marker, done) => { focused = done; } };
  f.game.focusOnProjectBook(); assert.deepEqual(complete, []);
  focused(); assert.equal(f.game.projectBookMode, 'reading'); assert.deepEqual(complete, ['projects']);
});

test('production house targets fit landscape and portrait views without wall or roof occlusion', async () => {
  const house = (await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url))).scene;
  house.position.y = -30;
  const book = (await readGeometryGLB(new URL('../public/assets/models/environment/book.glb', import.meta.url))).scene;
  house.add(book); house.updateMatrixWorld(true);
  const approach = house.getObjectByName('SPAWN_HOUSE').getWorldPosition(new THREE.Vector3());
  const steps = [
    { id: 'projects', target: book, cameraMarker: house.getObjectByName('CAMERA_PROJECT_BOOK') },
    { id: 'journey', target: house.getObjectByName('SEC_MAP_MapTop') },
    { id: 'awards', target: house.getObjectByName('SEC_AWARDS_Frame_M'), elevation: 0.15 },
    { id: 'workshop', target: house.getObjectByName('SEC_WORKSHOP_WeaponStand'), cameraMarker: house.getObjectByName('CAMERA_WORKSHOP') },
  ];
  const shell = [];
  house.traverse(obj => { if (obj.isMesh && !/^(COL_|ZONE_|INTERACT_)/.test(obj.name) && /WALL|ROOF|CEILING|FLOOR/i.test(obj.name)) shell.push(obj); });
  for (const aspect of [1.6, 0.5]) for (const step of steps) {
    assert.ok(step.target, step.id);
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    const shot = houseGuideShot(step, camera, approach); assert.ok(shot, step.id);
    camera.position.copy(shot.position); camera.quaternion.copy(shot.rotation); camera.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(step.target, true);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      assert.ok(Math.abs(point.x) < 0.8 && Math.abs(point.y) < 0.8 && point.z < 1, `${step.id}: ${point.toArray()}`);
    }
    const toTarget = shot.center.clone().sub(shot.position), ray = new THREE.Raycaster(shot.position, toTarget.clone().normalize(), 0.01, toTarget.length() - 0.05);
    const obstruction = ray.intersectObjects(shell, false)[0];
    assert.ok(!obstruction, `${step.id}, aspect ${aspect}: ${obstruction?.object.name} blocks the shot`);
  }
});
