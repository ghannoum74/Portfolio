import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

globalThis.window = { location: { search: '' }, devicePixelRatio: 1 };
const temporary = await mkdtemp(new URL('../.perf-test-lounge-', import.meta.url));
const bundle = temporary + '/suite.mjs';
await build({ stdin: {
  contents: "export { SeatedPose } from './src/world/player/SeatedPose';" +
    "export { createCouchSupport } from './src/world/player/CouchSeat';" +
    "export { Player } from './src/world/player/Player';" +
    "export { HouseFurnitureInteractions } from './src/world/house/furniture/HouseFurnitureInteractions';" +
    "export { performanceOptions } from './src/core/PerformanceOptions';",
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: bundle });
let loaded;
try { loaded = await import(pathToFileURL(bundle)); }
finally { await rm(temporary, { recursive: true, force: true }); }
const { SeatedPose, createCouchSupport, Player, HouseFurnitureInteractions, performanceOptions } = loaded;
const avatar = async () => (await readGeometryGLB(new URL('../public/assets/models/player/player.glb', import.meta.url))).scene;
const close = (actual, expected, epsilon = 1e-5) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= epsilon, String(value) + ' != ' + expected[i]));
};

test('shipped avatar sits at the authored cushion, bends both knees, and restores every bone and root transform', async () => {
  const model = await avatar();
  model.position.set(4, -30, 2);
  model.rotation.y = 0.7;
  model.updateWorldMatrix(true, true);
  const original = [], buffers = [], bones = new Map();
  model.traverse(object => {
    if (object.isBone) {
      bones.set(object.name.replace(/^mixamorig[:_]?/i, '').toLowerCase(), object);
      original.push([object, object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]);
    }
    if (object.isMesh) for (const value of Object.values(object.geometry.attributes)) {
      buffers.push([value.array, Buffer.from(value.array.buffer, value.array.byteOffset, value.array.byteLength).slice()]);
    }
  });
  const position = model.position.toArray(), rotation = model.quaternion.toArray();
  const pose = new SeatedPose(model), seat = new THREE.Vector3(1, -29.55, -2), look = seat.clone().add(new THREE.Vector3(0, 0, 1));
  for (let repetition = 0; repetition < 3; repetition++) {
    assert.equal(pose.begin(seat, look), true);
    assert.equal(pose.isActive, true);
    const pelvis = bones.get('hips').getWorldPosition(new THREE.Vector3());
    close([pelvis.x, pelvis.z], [seat.x, seat.z]);
    assert.ok(pelvis.y > seat.y + 0.08 && pelvis.y < seat.y + 0.25);
    const skinBounds = new THREE.Box3(), vertex = new THREE.Vector3();
    model.traverse(object => {
      if (!object.isSkinnedMesh) return;
      object.skeleton.update();
      for (let i = 0; i < object.geometry.attributes.position.count; i++) {
        object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld);
        assert.ok(vertex.toArray().every(Number.isFinite));
        skinBounds.expandByPoint(vertex);
      }
    });
    const skinSize = skinBounds.getSize(new THREE.Vector3());
    assert.ok(skinSize.y > 0.6 && skinSize.y < 2.0, JSON.stringify({ size: skinSize.toArray(), min: skinBounds.min.toArray(), max: skinBounds.max.toArray() }));
    assert.ok(skinSize.x < 2.0 && skinSize.z < 2.0);
    assert.ok(skinBounds.min.y > seat.y - 0.8 && skinBounds.max.y < seat.y + 1.8,
      JSON.stringify({ min: skinBounds.min.toArray(), max: skinBounds.max.toArray(), seat: seat.toArray() }));
    for (const side of ['left', 'right']) {
      const hip = bones.get(side + 'upleg').getWorldPosition(new THREE.Vector3());
      const knee = bones.get(side + 'leg').getWorldPosition(new THREE.Vector3());
      const foot = bones.get(side + 'foot').getWorldPosition(new THREE.Vector3());
      assert.ok(knee.clone().sub(hip).normalize().dot(new THREE.Vector3(0, 0, 1)) > 0.98);
      assert.ok(foot.clone().sub(knee).normalize().dot(new THREE.Vector3(0, -1, 0)) > 0.999);
    }
    assert.equal(pose.begin(seat, look), false);
    pose.end(); pose.end();
    assert.equal(pose.isActive, false);
    close(model.position.toArray(), position); close(model.quaternion.toArray(), rotation);
    for (const [bone, p, q, s] of original) {
      close(bone.position.toArray(), p); close(bone.quaternion.toArray(), q); close(bone.scale.toArray(), s);
    }
  }
  for (const [array, expected] of buffers) {
    assert.deepEqual(Buffer.from(array.buffer, array.byteOffset, array.byteLength), expected);
  }
});

test('unsupported rigs and invalid seat directions decline without changing the player', async () => {
  const unsupported = new THREE.Group(), pose = new SeatedPose(unsupported);
  assert.equal(pose.begin(new THREE.Vector3(), new THREE.Vector3(0, 0, 1)), false);
  assert.equal(pose.isActive, false);
  const model = await avatar(), supported = new SeatedPose(model);
  const before = model.matrixWorld.toArray();
  assert.equal(supported.begin(new THREE.Vector3(), new THREE.Vector3()), false);
  assert.equal(supported.begin(new THREE.Vector3(NaN, 0, 0), new THREE.Vector3(0, 0, 1)), false);
  assert.equal(supported.isActive, false);
  close(model.matrixWorld.toArray(), before);
});

test('sitting produces the same relaxed avatar after idle and walking, then restores the interrupted animation pose', async () => {
  const samples = [];
  for (const animation of ['idle', 'walking']) {
    const model = await avatar(), pose = new SeatedPose(model);
    const clip = (await readGeometryGLB(new URL('../public/assets/models/player/animations/' + animation + '.glb', import.meta.url))).animations[0];
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play(); mixer.update(0.7);
    model.updateMatrixWorld(true);
    const before = [];
    model.traverse(object => { if (object.isBone) before.push([object, object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]); });
    assert.equal(pose.begin(new THREE.Vector3(0, 0.65, 0), new THREE.Vector3(0, 0.65, 1)), true);
    const vertices = [];
    model.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        vertices.push(...mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
      }
    });
    samples.push(vertices);
    pose.end();
    for (const [bone, p, q, s] of before) {
      close(bone.position.toArray(), p); close(bone.quaternion.toArray(), q); close(bone.scale.toArray(), s);
    }
  }
  close(samples[0], samples[1]);
});

function couchFixture(mirrored = false) {
  const couch = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  const add = (size, position) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); couch.add(mesh); return mesh;
  };
  add([2.2, 0.18, 1.4], [0, 0.56, 0]); // Cushion top 0.65, front edge +0.7.
  add([2.3, 0.8, 0.18], [0, 0.93, -0.68]);
  add([0.18, 0.6, 1.4], [-1.1, 0.65, 0]);
  add([0.18, 0.6, 1.4], [1.1, 0.65, 0]);
  add([2.2, 0.35, 1.35], [0, 0.3, 0]);
  const collider = add([15, 12, 15], [0, 0, 0]); collider.name = 'COL_BOX_COUCH';
  if (mirrored) { couch.position.set(4, -30, -2); couch.rotation.y = 0.9; couch.scale.set(1.3, 0.9, -1.1); }
  couch.updateMatrixWorld(true);
  return {
    couch, seat: couch.localToWorld(new THREE.Vector3(0, 0.65, 0)),
    forward: new THREE.Vector3(0, 0, 1).transformDirection(couch.matrixWorld),
    front: couch.localToWorld(new THREE.Vector3(0, 0.65, 0.7)),
    right: new THREE.Vector3(1, 0, 0).transformDirection(couch.matrixWorld),
  };
}

test('the shipped avatar clears a deep cushion with supported thighs and outward knees, including a mirrored couch', async () => {
  for (const mirrored of [false, true]) {
    const { couch, seat, forward, front, right } = couchFixture(mirrored);
    const model = await avatar(), pose = new SeatedPose(model), source = couch.toJSON();
    assert.equal(pose.begin(seat, seat.clone().add(forward), couch), true);
    const bones = new Map();
    model.traverse(o => { if (o.isBone) bones.set(o.name.replace(/^mixamorig[:_]?/i, '').toLowerCase(), o); });
    for (const side of ['left', 'right']) {
      const hip = bones.get(side + 'upleg').getWorldPosition(new THREE.Vector3());
      const knee = bones.get(side + 'leg').getWorldPosition(new THREE.Vector3());
      const foot = bones.get(side + 'foot').getWorldPosition(new THREE.Vector3());
      assert.ok(knee.clone().sub(front).dot(forward) >= 0.06, 'knee and calf must clear the front of the cushion');
      assert.ok(knee.y > seat.y + 0.08, 'the thigh must rest above the cushion');
      assert.ok(foot.y < seat.y - 0.1, 'the lower leg must hang down in front');
      const lateral = hip.clone().sub(model.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3())).dot(right);
      assert.ok(knee.clone().sub(hip).dot(right) * lateral > 0, 'knees must spread outward rather than cross inward');
    }
    assert.deepEqual(couch.toJSON(), source, 'sitting must preserve the source couch and collider');
    pose.end();
  }
});

test('a couch back and arms correct a generated sideways look marker toward the open cushion edge', async () => {
  const { couch, seat, right, forward, front } = couchFixture();
  const model = await avatar(), pose = new SeatedPose(model);
  assert.equal(pose.begin(seat, seat.clone().add(right), couch), true);
  const knee = model.getObjectByName('mixamorigLeftLeg').getWorldPosition(new THREE.Vector3());
  assert.ok(knee.clone().sub(front).dot(forward) >= 0.06);
  assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion).dot(forward) > 0.98);
  pose.end();
});

test('a frame-only marker uses separate batch-hidden cushions without moving or drawing source parts', async () => {
  const { couch, right, forward, front } = couchFixture();
  const room = new THREE.Group();
  // Match the Blender arrangement: every couch part is a scene-level sibling.
  for (const child of [...couch.children]) room.attach(child);
  const frame = room.children[4];
  const seed = new THREE.Vector3(0, 0.475, 0);
  for (const part of room.children.slice(0, 4)) part.visible = false; // Static batches draw these instead.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 20)); floor.position.y = -0.05; room.add(floor);
  const table = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1)); table.position.set(0, 0.3, 1.5); room.add(table);
  const batch = new THREE.Mesh(room.children[0].geometry, room.children[0].material);
  batch.name = 'STATIC_BATCH_1'; batch.position.copy(room.children[0].position); room.add(batch);
  const zone = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1, 1.6));
  zone.name = 'ZONE_DECOR'; zone.position.y = 0.5; zone.visible = false; room.add(zone);
  room.updateMatrixWorld(true);
  const before = room.toJSON(), support = createCouchSupport(room, frame);
  assert.equal(support.parent, null);
  assert.equal(support.children.length, 5, 'only the five touching couch parts belong to the support');
  assert.ok(!support.children.some(part => part.geometry === floor.geometry || part.geometry === table.geometry));
  const model = await avatar(), pose = new SeatedPose(model);
  assert.equal(pose.begin(seed, seed.clone().add(right), support), true);
  const hips = model.getObjectByName('mixamorigHips').getWorldPosition(new THREE.Vector3());
  const knee = model.getObjectByName('mixamorigLeftLeg').getWorldPosition(new THREE.Vector3());
  assert.ok(hips.y > 0.73, 'the pelvis must sit over the cushion, not the lower frame');
  assert.ok(knee.clone().sub(front).dot(forward) > 0.06);
  assert.deepEqual(room.toJSON(), before);
  pose.end();
});

test('an unsupported seat cancels cleanly and restores the interrupted animated player', async () => {
  const model = await avatar(), pose = new SeatedPose(model);
  const clip = (await readGeometryGLB(new URL('../public/assets/models/player/animations/idle.glb', import.meta.url))).animations[0];
  const mixer = new THREE.AnimationMixer(model); mixer.clipAction(clip).play(); mixer.update(0.7);
  model.position.set(2, -30, 4); model.rotation.y = 0.9; model.updateMatrixWorld(true);
  const before = [];
  model.traverse(object => { if (object.isBone || object === model) before.push([object, object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]); });
  assert.equal(pose.begin(new THREE.Vector3(0, 0.65, 0), new THREE.Vector3(0, 0.65, 1), new THREE.Group()), false);
  assert.equal(pose.isActive, false);
  for (const [object, p, q, s] of before) {
    close(object.position.toArray(), p); close(object.quaternion.toArray(), q); close(object.scale.toArray(), s);
  }
});

test('player pauses movement and animation while seated and returns physics to the clear approach point', async () => {
  const model = await avatar(), player = Object.create(Player.prototype);
  const teleports = [];
  let physics = 0, animation = 0;
  Object.assign(player, {
    model, seatedPose: new SeatedPose(model), standingFeet: new THREE.Vector3(),
    body: { isGrounded: true, getFeetPosition: out => out.set(4, -30, 2),
      teleport: position => teleports.push(position.toArray()), syncModel() {} },
    controller: { update() { physics++; } }, mixer: { update() { animation++; } },
  });
  const target = player.beginSitting(new THREE.Vector3(1, -29.55, -2), new THREE.Vector3(1, -29.55, -1));
  assert.ok(target instanceof THREE.Vector3);
  close(target.toArray(), [1, -29, -2]);
  player.updatePhysics(1 / 60); player.updateAnimation(1 / 60); player.syncFromPhysics();
  assert.equal(physics, 0); assert.equal(animation, 0);
  assert.deepEqual(teleports, [[4, -30, 2]]);
  player.endSitting(); player.endSitting();
  assert.deepEqual(teleports, [[4, -30, 2], [4, -30, 2]]);
  player.updatePhysics(1 / 60); player.updateAnimation(1 / 60);
  assert.equal(physics, 1); assert.equal(animation, 1);
  player.body.isGrounded = false;
  assert.equal(player.beginSitting(new THREE.Vector3(), new THREE.Vector3(0, 0, 1)), false);
});

function domFixture() {
  const original = globalThis.document;
  const element = () => ({
    dataset: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, remove() {},
    replaceChildren() {}, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
  });
  globalThis.document = { createElement: element, head: { appendChild() {} }, body: { appendChild() {} } };
  return () => { if (original === undefined) delete globalThis.document; else globalThis.document = original; };
}

function furnitureFixture(overrides = {}, authoringName) {
  const house = new THREE.Group(); house.position.y = -30;
  const couch = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial()); couch.name = 'MyCouch';
  if (authoringName) couch.userData.portfolioAuthoringName = authoringName;
  const fireplace = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()); fireplace.name = 'MyHearth';
  const flame = new THREE.Group(); flame.name = 'MyFlame'; flame.scale.set(1.2, 0.8, 1.1);
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), new THREE.MeshBasicMaterial()));
  house.add(couch, fireplace, flame);
  const marker = (name, position, data = {}) => {
    const object = new THREE.Group(); object.name = name; object.position.copy(position); object.userData = data; house.add(object); return object;
  };
  marker('INTERACT_COUCH', new THREE.Vector3(0, 0.6, 1), {
    portfolioInteraction: 'couch', targetObject: authoringName ?? couch.name, seatObject: 'SEAT_COUCH', lookObject: 'LOOK_COUCH', cameraObject: 'CAM_COUCH',
  });
  marker('SEAT_COUCH', new THREE.Vector3(0, 0.45, 0));
  marker('LOOK_COUCH', new THREE.Vector3(0, 0.9, 1));
  marker('CAM_COUCH', new THREE.Vector3(1.6, 1.6, 2));
  marker('INTERACT_FIREPLACE', new THREE.Vector3(3, 0.6, 0), {
    portfolioInteraction: 'fireplace', targetObject: fireplace.name, flameObject: flame.name, flameAnchor: 'ANCHOR_FIREPLACE_FLAME', initialOn: false,
  });
  marker('ANCHOR_FIREPLACE_FLAME', new THREE.Vector3(3, 0.4, 0));
  const camera = new THREE.PerspectiveCamera(); camera.position.set(3, -26, 4);
  let starts = 0, ends = 0, sits = 0, stands = 0, showPlayer;
  const furniture = new HouseFurnitureInteractions(house, camera, {
    onFocusStart(visible) { starts++; showPlayer = visible; return true; }, onFocusEnd() { ends++; },
    onSitStart(seat, look) { sits++; close(seat.toArray(), [0, -29.55, 0]); close(look.toArray(), [0, -29.1, 1]); return true; },
    onSitEnd() { stands++; }, isMuted: () => true, ...overrides,
  });
  const interactions = [];
  furniture.register(interaction => interactions.push(interaction));
  const light = () => { let found; house.traverse(object => { if (object.isPointLight) found = object; }); return found; };
  const tick = seconds => { for (let i = 0; i < seconds * 60; i++) furniture.update(1 / 60); };
  return { house, couch, flame, furniture, camera, tick, light, interactions,
    counts: () => ({ starts, ends, sits, stands, showPlayer }) };
}

test('authored couch uses the normal interaction path, shows the seated player and returns camera and input once', () => {
  const restore = domFixture();
  try {
    const f = furnitureFixture(), position = f.camera.position.toArray(), rotation = f.camera.quaternion.toArray();
    assert.equal(f.interactions.length, 2);
    close(f.interactions[0].position.toArray(), [0, -29.4, 1]);
    assert.equal(f.interactions[0].highlightTarget, f.couch);
    for (let repetition = 0; repetition < 2; repetition++) {
      f.interactions[0].interact(); f.tick(1.1);
      assert.equal(f.furniture.isControllingCamera, true);
      f.furniture.leaveFocus(); f.furniture.leaveFocus(); f.tick(1);
      assert.equal(f.furniture.isControllingCamera, false);
      close(f.camera.position.toArray(), position); close(f.camera.quaternion.toArray(), rotation);
    }
    assert.deepEqual(f.counts(), { starts: 2, ends: 2, sits: 2, stands: 2, showPlayer: true });
    f.furniture.destroy();
  } finally { restore(); }
});

test('the couch camera aims at the fitted avatar while preserving the authored camera location and return', () => {
  const restore = domFixture();
  try {
    const target = new THREE.Vector3(0, -28.6, 0.5);
    const f = furnitureFixture({ onSitStart: () => target });
    const original = f.camera.position.toArray();
    f.interactions[0].interact(); f.tick(1.1);
    close(f.camera.position.toArray(), [1.6, -28.4, 2]);
    const view = new THREE.Vector3(0, 0, -1).applyQuaternion(f.camera.quaternion);
    assert.ok(view.dot(target.clone().sub(f.camera.position).normalize()) > 0.99999);
    f.furniture.leaveFocus(); f.tick(1);
    close(f.camera.position.toArray(), original);
    f.furniture.destroy();
  } finally { restore(); }
});

test('fireplace toggles only authored flames, releases its light slot when off and does no settled flame transforms', () => {
  const restore = domFixture();
  try {
    const f = furnitureFixture(), scale = f.flame.scale.toArray();
    assert.equal(f.flame.visible, false); assert.equal(f.light().visible, false); assert.equal(f.light().castShadow, false);
    assert.equal(f.interactions[1].getHint(), 'Light Fireplace');
    f.interactions[1].interact(); f.tick(1);
    assert.equal(f.interactions[1].getHint(), 'Extinguish Fireplace');
    assert.equal(f.flame.visible, true); assert.equal(f.light().visible, true); assert.ok(f.light().intensity > 0);
    f.interactions[1].interact(); f.tick(3);
    assert.equal(f.flame.visible, false); assert.equal(f.light().visible, false); assert.equal(f.light().intensity, 0);
    let writes = 0;
    const set = f.flame.scale.set;
    f.flame.scale.set = function (...values) { writes++; return set.apply(this, values); };
    f.tick(2);
    assert.equal(writes, 0);
    f.flame.scale.set = set;
    f.furniture.destroy();
    assert.equal(f.flame.visible, true); close(f.flame.scale.toArray(), scale);
  } finally { restore(); }
});

test('shader preparation includes fire materials at every light count and restores state after success or failure', async () => {
  const restore = domFixture();
  try {
    const f = furnitureFixture(), scale = f.flame.scale.toArray(), counts = [];
    await f.furniture.prepareLightingVariants(async () => {
      assert.equal(f.flame.visible, true);
      counts.push(f.light().visible ? 1 : 0);
    });
    assert.deepEqual(counts, [0, 1]);
    assert.equal(f.flame.visible, false); assert.equal(f.light().visible, false);
    await assert.rejects(f.furniture.prepareLightingVariants(async () => { throw new Error('compile failure'); }), /compile failure/);
    assert.equal(f.flame.visible, false); assert.equal(f.light().visible, false); close(f.flame.scale.toArray(), scale);
    f.furniture.destroy();
  } finally { restore(); }
});

test('failed sitting restores controls, and teardown during a seated transition releases the player', () => {
  const restore = domFixture();
  try {
    const failed = furnitureFixture({ onSitStart: () => false });
    failed.interactions[0].interact();
    assert.equal(failed.furniture.isControllingCamera, false);
    assert.equal(failed.counts().ends, 1);
    failed.furniture.destroy();
    const active = furnitureFixture();
    active.interactions[0].interact(); active.tick(0.1); active.furniture.destroy();
    assert.equal(active.counts().stands, 1); assert.equal(active.counts().ends, 1);
  } finally { restore(); }
});

test('Blender names with spaces and numeric suffixes remain valid after loader name sanitization', () => {
  const restore = domFixture();
  try {
    const f = furnitureFixture({}, 'My Couch.001');
    assert.equal(f.interactions.length, 2);
    assert.equal(f.interactions[0].highlightTarget, f.couch);
    f.furniture.destroy();
  } finally { restore(); }
});
