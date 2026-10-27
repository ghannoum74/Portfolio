import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

const temporary = await mkdtemp(new URL('../.experience-hover-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: {
  contents: `export { AwardsExperience } from './src/world/house/awards/AwardsExperience';
    export { JourneyMapExperience } from './src/world/house/journey/JourneyMapExperience';
    export { AWARD_ENTRIES } from './src/data/awards';
    export { JOURNEY_CHAPTERS } from './src/data/journey';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' } });
const { AwardsExperience, JourneyMapExperience, AWARD_ENTRIES, JOURNEY_CHAPTERS } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

function fixture(kind, reducedMotion = false) {
  const oldGlobals = new Map(['document', 'window', 'innerWidth', 'innerHeight'].map(key => [key, globalThis[key]]));
  const counts = { domWrites: 0, rectReads: 0 }, order = [];
  const write = () => { counts.domWrites++; order.push('write'); };
  class Element {
    children = []; parent = null; listeners = new Map(); classes = new Set(); attrs = new Map();
    styleValues = {};
    // Exercise CSSOM-like serialization instead of assuming assigned pixel strings read back verbatim.
    style = new Proxy(this.styleValues, { get(target, key) {
      const value = target[key] ?? '';
      return (key === 'left' || key === 'top') && value ? `${Number.parseFloat(value).toFixed(3)}px` : value;
    }, set(target, key, value) { write(); target[key] = value; return true; } });
    classList = {
      contains: name => this.classes.has(name),
      add: name => { write(); this.classes.add(name); },
      remove: name => { write(); this.classes.delete(name); },
      toggle: (name, force) => { write(); const value = force ?? !this.classes.has(name); value ? this.classes.add(name) : this.classes.delete(name); return value; },
    };
    text = '';
    set textContent(value) { write(); this.text = value; }
    get textContent() { return this.text; }
    set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classes].join(' '); }
    setAttribute(key, value) { this.attrs.set(key, value); }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    prepend(child) { child.parent = this; this.children.unshift(child); }
    replaceChildren() { this.children.forEach(child => { child.parent = null; }); this.children.length = 0; }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
    removeEventListener(type, callback) { assert.ok(this.listeners.get(type)?.delete(callback)); }
    dispatch(type, event = {}) { this.listeners.get(type)?.forEach(callback => callback(event)); }
    getContext() { return { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }; }
  }
  const body = new Element(), canvas = new Element();
  let rect = { left: 20, top: 15, width: 1200, height: 680 };
  canvas.getBoundingClientRect = () => { counts.rectReads++; order.push('read'); return { ...rect }; };
  globalThis.document = { body, createElement: () => new Element() };
  globalThis.window = { innerWidth: 1280, innerHeight: 720, matchMedia: () => ({ matches: reducedMotion }) };
  globalThis.innerWidth = 1280; globalThis.innerHeight = 720;

  const house = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(45, 1280 / 720, .01, 100);
  camera.position.set(.3, 2.8, 6); camera.lookAt(0, .2, 0); camera.updateMatrixWorld(true);
  const savedPosition = camera.position.clone(), savedRotation = camera.quaternion.clone();
  let experience, entries, targets, centerFor;
  if (kind === 'awards') {
    entries = AWARD_ENTRIES;
    targets = entries.map((entry, index) => {
      const target = new THREE.Group(); target.name = entry.objectName; target.position.set((index - 1) * 1.6, .5, 0);
      target.add(new THREE.Mesh(new THREE.BoxGeometry(.7, .9, .15), new THREE.MeshStandardMaterial())); house.add(target); return target;
    });
    experience = new AwardsExperience(house, camera, canvas);
    centerFor = index => new THREE.Box3().setFromObject(targets[index], true).getCenter(new THREE.Vector3());
  } else {
    entries = JOURNEY_CHAPTERS;
    const table = new THREE.Mesh(new THREE.BoxGeometry(3.6, .2, 2.4), new THREE.MeshStandardMaterial());
    table.name = 'SEC_MAP_Table_Large'; house.add(table);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, .02, 2.2), new THREE.MeshStandardMaterial());
    top.name = 'SEC_MAP_MapTop'; top.position.y = .11; house.add(top);
    experience = new JourneyMapExperience(house, top, camera, canvas);
    targets = entries.map((_, index) => house.getObjectByName(`JOURNEY_WAYPOINT_${index + 1}`).children.find(child => child.isMesh && child.material.visible === false));
    centerFor = index => targets[index].parent.getWorldPosition(new THREE.Vector3());
  }
  const prefix = kind === 'awards' ? 'awards' : 'journey';
  const hint = body.children.find(element => element.classes.has(`${prefix}-hover-hint`));
  const panel = body.children.find(element => element.classes.has(kind === 'awards' ? 'awards-inspector' : 'journey-inspector'));
  const nav = body.children.find(element => element.classes.has(`${prefix}-controls`));
  const previous = nav.children.find(element => element.attrs.get('aria-label') === (kind === 'awards' ? 'Previous milestone' : 'Previous chapter'));
  const next = nav.children.find(element => element.attrs.get('aria-label') === (kind === 'awards' ? 'Next milestone' : 'Next chapter'));
  const heading = panel.children[1];
  const step = (frames = 1) => { for (let frame = 0; frame < frames; frame++) { house.updateMatrixWorld(true); experience.update(1 / 60); } };
  const settle = () => step(120);
  const point = index => {
    house.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const world = kind === 'awards' ? centerFor(index) : targets[index].getWorldPosition(new THREE.Vector3());
    const ndc = world.project(camera);
    return { clientX: rect.left + (ndc.x + 1) * rect.width / 2, clientY: rect.top + (1 - ndc.y) * rect.height / 2 };
  };
  const aim = index => { const xy = point(index); canvas.dispatch('pointermove', xy); step(); return xy; };
  return { experience, house, camera, canvas, body, panel, nav, hint, heading, previous, next, entries, targets, centerFor, counts, order,
    savedPosition, savedRotation, step, settle, point, aim,
    resetCounts() { counts.domWrites = counts.rectReads = 0; order.length = 0; },
    resize(nextRect) { rect = nextRect; globalThis.innerWidth = window.innerWidth = 900; globalThis.innerHeight = window.innerHeight = 560;
      camera.aspect = 900 / 560; camera.updateProjectionMatrix(); },
    rect: () => rect,
    cleanup() { experience.destroy(); for (const [key, value] of oldGlobals) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}

function expectedHint(f, kind, index) {
  const screen = f.centerFor(index).project(f.camera), rect = f.rect();
  return {
    left: `${THREE.MathUtils.clamp(rect.left + (screen.x + 1) * rect.width / 2, kind === 'awards' ? 60 : 75, window.innerWidth - (kind === 'awards' ? 60 : 75))}px`,
    top: `${THREE.MathUtils.clamp(rect.top + (1 - screen.y) * rect.height / 2 - 72, kind === 'awards' ? 30 : 35, window.innerHeight - 60)}px`,
  };
}

for (const kind of ['awards', 'journey']) {
  test(`${kind}: stationary hover retains exact placement with one layout read, reusable picking arrays and no repeated DOM writes`, t => {
    const f = fixture(kind), original = THREE.Raycaster.prototype[kind === 'awards' ? 'intersectObject' : 'intersectObjects'];
    const arrays = new Set(), targetLists = new Set(); let picks = 0;
    const method = kind === 'awards' ? 'intersectObject' : 'intersectObjects';
    THREE.Raycaster.prototype[method] = function(target, recursive, results) {
      picks++; arrays.add(results); if (kind === 'journey') targetLists.add(target);
      return original.call(this, target, recursive, results);
    };
    try {
      assert.equal(f.experience.enter(), true); f.settle(); f.resetCounts(); f.aim(1);
      assert.equal(f.hint.classes.has('is-visible'), true); assert.equal(f.canvas.style.cursor, 'pointer');
      assert.equal(f.order[0], 'read'); assert.ok(!f.order.slice(f.order.indexOf('write')).includes('read'), 'read canvas layout before hover DOM writes');
      const expected = expectedHint(f, kind, 1); assert.equal(f.hint.styleValues.left, expected.left); assert.equal(f.hint.styleValues.top, expected.top);
      const animated = kind === 'journey' ? f.house.getObjectByName('JOURNEY_WAYPOINT_1').children[1] : null;
      const angle = animated?.rotation.y;
      const glimmer = kind === 'awards' ? f.house.getObjectByName('AWARDS_AMBIENT_GLIMMERS').children[0] : null;
      const opacity = glimmer?.material.opacity;
      f.resetCounts(); picks = 0; arrays.clear(); targetLists.clear(); f.step(120);
      assert.equal(f.counts.rectReads, 120); assert.equal(f.counts.domWrites, 0);
      assert.equal(picks, 120 * (kind === 'awards' ? AWARD_ENTRIES.length : 1));
      assert.equal(arrays.size, 1); assert.notEqual([...arrays][0], undefined);
      assert.equal([...arrays][0].length, 0, 'release last hit records after picking');
      if (kind === 'journey') { assert.equal(targetLists.size, 1); assert.notEqual(animated.rotation.y, angle, 'keep waypoint animation running'); }
      if (kind === 'awards') assert.notEqual(glimmer.material.opacity, opacity, 'keep award glimmer animation running');
      t.diagnostic(JSON.stringify({ kind, unchangedFrames: 120, domWrites: f.counts.domWrites, canvasRectReads: f.counts.rectReads, raycastCalls: picks, resultArrays: arrays.size }));
      f.resize({ left: 70, top: 40, width: 760, height: 470 }); f.aim(1);
      const resized = expectedHint(f, kind, 1); assert.equal(f.hint.styleValues.left, resized.left); assert.equal(f.hint.styleValues.top, resized.top);
      // A moving target must stop hovering even while the pointer remains still.
      const moving = kind === 'awards' ? f.targets[1] : f.targets[1].parent;
      moving.position.x += 100; f.step(); assert.equal(f.hint.classes.has('is-visible'), false); assert.equal(f.canvas.style.cursor, '');
      moving.position.x -= 100; f.step(); assert.equal(f.hint.classes.has('is-visible'), true);
      f.camera.lookAt(100, 100, -100); f.step(); assert.equal(f.hint.classes.has('is-visible'), false);
      f.canvas.dispatch('pointerleave'); f.resetCounts(); picks = 0; f.step(120);
      assert.equal(f.counts.rectReads, 0); assert.equal(f.counts.domWrites, 0); assert.equal(picks, 0);
    } finally { THREE.Raycaster.prototype[method] = original; f.cleanup(); }
  });

  test(`${kind}: controls and real ray hits navigate every entry, wrap both ways, restore the camera and clean up`, () => {
    for (const reducedMotion of [false, true]) {
      const f = fixture(kind, reducedMotion);
      const owned = [];
      f.house.traverse(object => { if (object.name === 'AWARDS_AMBIENT_GLIMMERS' || object.name === 'JOURNEY_MAP_MAGIC_ROUTE') owned.push(object); });
      try {
        assert.equal(f.experience.clickAt(0, 0), false); assert.equal(f.experience.isControllingCamera, false);
        assert.equal(f.experience.enter(), true); assert.equal(f.experience.enter(), false); f.settle(); assert.equal(f.experience.mode, 'active');
        f.canvas.dispatch('pointerleave');
        for (let index = 0; index < f.entries.length; index++) {
          f.next.dispatch('click'); f.settle(); assert.equal(f.heading.textContent, f.entries[index].title); assert.equal(f.panel.classes.has('is-visible'), true);
        }
        f.next.dispatch('click'); f.settle(); assert.equal(f.heading.textContent, f.entries[0].title);
        for (let index = f.entries.length - 1; index >= 0; index--) {
          f.previous.dispatch('click'); f.settle(); assert.equal(f.heading.textContent, f.entries[index].title);
        }
        f.experience.toggleSelection(); f.settle(); assert.equal(f.panel.classes.has('is-visible'), false);
        const xy = f.aim(1); assert.equal(f.experience.clickAt(xy.clientX, xy.clientY), true); f.settle(); assert.equal(f.heading.textContent, f.entries[1].title);
        // Clicking the same physical target returns to the overview.
        const again = f.point(1); assert.equal(f.experience.clickAt(again.clientX, again.clientY), true); f.settle(); assert.equal(f.panel.classes.has('is-visible'), false);
        f.resize({ left: 0, top: 0, width: 0, height: 0 }); assert.equal(f.experience.clickAt(10, 10), false); f.step(); assert.equal(f.hint.classes.has('is-visible'), false);
        let done = 0; f.experience.leave(() => done++); f.experience.leave(() => assert.fail('duplicate return callback')); f.settle();
        assert.equal(done, 1); assert.equal(f.experience.mode, 'idle'); assert.equal(f.experience.isControllingCamera, false);
        assert.ok(f.camera.position.distanceTo(f.savedPosition) < 1e-12); assert.ok(1 - Math.abs(f.camera.quaternion.dot(f.savedRotation)) < 1e-12);
        assert.equal(f.nav.classes.has('is-visible'), false); assert.equal(f.panel.classes.has('is-visible'), false); assert.equal(f.canvas.style.cursor, '');
        assert.equal(f.experience.enter(), true); f.step(); f.experience.leave(() => done++); f.settle(); assert.equal(done, 2);
        f.house.visible = false; const transform = f.camera.matrixWorld.clone(); f.resetCounts(); f.step(120);
        assert.deepEqual(f.counts, { domWrites: 0, rectReads: 0 }); assert.ok(f.camera.matrixWorld.equals(transform));
      } finally { f.cleanup(); }
      assert.equal(f.body.children.length, 0); assert.equal([...f.canvas.listeners.values()].reduce((sum, values) => sum + values.size, 0), 0);
      assert.ok(owned.every(root => root.parent === null));
    }
  });
}
