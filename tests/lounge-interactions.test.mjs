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
    "export { PlayerController } from './src/world/player/PlayerController';" +
    "export { inspectBed } from './src/world/player/BedGeometry';" +
    "export { InteractionSystem } from './src/interactions/InteractionSystem';" +
    "export { ThirdPersonCamera } from './src/camera/ThirdPersonCamera';" +
    "export { FireplaceFire } from './src/world/house/furniture/FireplaceFire';" +
    "export { findFiresideSeat } from './src/world/house/furniture/FiresideSeat';" +
    "export { HouseFurnitureInteractions } from './src/world/house/furniture/HouseFurnitureInteractions';" +
    "export { inferDiningSeats } from './src/world/house/furniture/DiningSeatFallback';" +
    "export { createSinkWater } from './src/world/house/furniture/SinkWater';" +
    "export { performanceOptions } from './src/core/PerformanceOptions';",
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: bundle,
  loader: { '.css': 'empty', '.html': 'text' } });
let loaded;
try { loaded = await import(pathToFileURL(bundle)); }
finally { await rm(temporary, { recursive: true, force: true }); }
const { SeatedPose, inspectBed, InteractionSystem, createCouchSupport, Player, PlayerController, ThirdPersonCamera, FireplaceFire, findFiresideSeat, HouseFurnitureInteractions, inferDiningSeats, createSinkWater, performanceOptions } = loaded;
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
  model.position.set(2, -30, 4); model.rotation.y = 2.6; model.updateMatrixWorld(true);
  const heading = model.rotation.toArray();
  const before = [];
  model.traverse(object => { if (object.isBone || object === model) before.push([object, object.position.toArray(), object.quaternion.toArray(), object.scale.toArray()]); });
  assert.equal(pose.begin(new THREE.Vector3(0, 0.65, 0), new THREE.Vector3(0, 0.65, 1), new THREE.Group()), false);
  assert.equal(pose.isActive, false);
  for (const [object, p, q, s] of before) {
    close(object.position.toArray(), p); close(object.quaternion.toArray(), q); close(object.scale.toArray(), s);
  }
  assert.deepEqual(model.rotation.toArray(), heading, 'a declined seat must preserve the heading read by movement');
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

test('standing after approaching from either side preserves W/S direction, A/D turns and the follow camera', async () => {
  const addEventListener = globalThis.window.addEventListener;
  globalThis.window.addEventListener = () => {};
  try {
    for (const heading of [Math.PI, -Math.PI, 2.6, -2.6, 3 * Math.PI, -3 * Math.PI, 0.7]) {
      const model = await avatar(), player = Object.create(Player.prototype), feet = new THREE.Vector3(4, -30, 2);
      model.position.copy(feet); model.rotation.set(0, heading, 0);
      const movement = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      const keyboard = { forward: false, backward: false, left: false, right: false, run: false, consumeJump: () => false };
      const body = {
        isGrounded: true, isFalling: false, isJumping: false,
        getFeetPosition: out => out.copy(feet), teleport() {}, syncModel() {},
        update(direction, yaw) { movement.set(0, 0, direction).applyAxisAngle(up, yaw); },
      };
      const animations = { isLocked: () => false, play() {}, playOnce() {}, setPlaybackSpeed() {} };
      const controller = new PlayerController(model, keyboard, animations, body, { isAscending: () => false });
      Object.assign(player, { model, body, controller, seatedPose: new SeatedPose(model), standingFeet: new THREE.Vector3() });
      const camera = new THREE.PerspectiveCamera();
      const follow = new ThirdPersonCamera(camera, model, { addEventListener() {} }, {
        rapier: { Ball: class {}, QueryFilterFlags: { ONLY_FIXED: 1 } },
        world: { castShape: () => null }, staticColliderRevision: 0,
      });
      follow.setInteriorMode(true); follow.snap();
      const cameraPosition = camera.position.toArray(), cameraRotation = camera.quaternion.toArray();
      const originalForward = new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion);
      for (let repetition = 0; repetition < 2; repetition++) {
        assert.ok(player.beginSitting(new THREE.Vector3(0, -29.35, 0), new THREE.Vector3(0, -29.35, 1)));
        // Match the E/Esc exit order: restore the player, then resume follow.
        player.endSitting(); follow.snap();
        close(camera.position.toArray(), cameraPosition); close(camera.quaternion.toArray(), cameraRotation);
        const cameraForward = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
        keyboard.forward = true; controller.update(1 / 60);
        assert.ok(movement.dot(originalForward) > 0.99999, 'W must retain its pre-seat world direction at heading ' + heading);
        assert.ok(movement.dot(cameraForward) > 0.99999, 'W must move forward in the follow camera');
        keyboard.forward = false; keyboard.backward = true; controller.update(1 / 60);
        assert.ok(movement.dot(cameraForward) < -0.99999, 'S must move backward in the follow camera');
        keyboard.backward = false; keyboard.left = true; controller.update(0.1);
        const left = new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion);
        assert.ok(left.dot(originalForward.clone().applyAxisAngle(up, 0.4)) > 0.99999, 'A must turn without flipping the avatar');
        keyboard.left = false; keyboard.right = true; controller.update(0.1);
        assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion).dot(originalForward) > 0.99999, 'D must undo the left turn');
        keyboard.right = false;
      }
    }
  } finally {
    if (addEventListener === undefined) delete globalThis.window.addEventListener;
    else globalThis.window.addEventListener = addEventListener;
  }
});

function domFixture() {
  const original = globalThis.document;
  const element = () => {
    const classes = new Set(), children = [], listeners = new Map();
    return { dataset: {}, children,
      classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute() {}, appendChild(child) { children.push(child); }, remove() {},
      replaceChildren() { children.length = 0; },
      addEventListener(name, listener) { listeners.set(name, listener); },
      click() { listeners.get('click')?.(); },
      getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
    };
  };
  globalThis.document = { createElement: element, head: { appendChild() {} }, body: { appendChild() {} } };
  return () => { if (original === undefined) delete globalThis.document; else globalThis.document = original; };
}

test('dining panels select the first item, brew the selected color and restore focus on every exit', () => {
  const restore = domFixture();
  try {
    const house = new THREE.Group(), material = new THREE.MeshBasicMaterial();
    const add = (name, x) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.name = name; mesh.position.x = x; house.add(mesh); return mesh;
    };
    const cauldron = add('SEC_ALCHEMY_Cauldron', 0);
    add('SEC_ALCHEMY_Drawer_4', 3);
    add('Bookcase_2', 6);
    const chair = add('SEC_PROJECTS_Chair_1', 9);
    const marker = (name, position, data = {}) => {
      const object = new THREE.Group(); object.name = name; object.position.copy(position); object.userData = data; house.add(object);
    };
    marker('INTERACT_DINING_CHAIR_01', new THREE.Vector3(9, 0, 0.8), {
      portfolioInteraction: 'diningChair', targetObject: chair.name, seatObject: 'SEAT_DINING_01',
      lookObject: 'LOOK_DINING_01', cameraObject: 'CAM_DINING_01',
    });
    marker('SEAT_DINING_01', new THREE.Vector3(9, 0.5, 0));
    marker('LOOK_DINING_01', new THREE.Vector3(9, 0.5, -1));
    marker('CAM_DINING_01', new THREE.Vector3(10, 1.5, 1));
    let starts = 0, ends = 0, sits = 0, stands = 0, visible;
    const furniture = new HouseFurnitureInteractions(house, new THREE.PerspectiveCamera(), {
      onFocusStart(showPlayer) { starts++; visible = showPlayer; return true; },
      onFocusEnd() { ends++; },
      onSitStart() { sits++; return true; }, onSitEnd() { stands++; }, isMuted: () => true,
    });
    const interactions = []; furniture.register(value => interactions.push(value));
    assert.equal(interactions.filter(item => item.highlightTarget === cauldron).length, 1);
    assert.equal(interactions.find(item => item.highlightTarget === chair).getHint(), 'Sit at Table');
    furniture.interact('cauldron');
    const panel = furniture.diningPanel, brewNode = furniture.nodes.get('cauldron');
    assert.equal(furniture.isControllingCamera, true); assert.equal(visible, true);
    assert.equal(panel.title.textContent, 'Verdant Elixir'); assert.equal(brewNode.active, false);
    furniture.handleFocusKey('ArrowRight');
    assert.equal(panel.title.textContent, 'Moonwater');
    furniture.handleFocusKey('KeyE');
    assert.equal(brewNode.active, true); assert.equal(brewNode.bubbles.material.color.getHex(), 0x82c8ef);
    furniture.handleFocusKey('ArrowRight');
    assert.equal(panel.title.textContent, 'Sunfire'); assert.equal(brewNode.active, false);
    panel.brewButton.click(); assert.equal(brewNode.bubbles.material.color.getHex(), 0xe9ba70);
    furniture.handleFocusKey('Escape');
    assert.equal(panel.root.hidden, true); assert.equal(brewNode.active, false);
    assert.equal(furniture.isControllingCamera, false); assert.equal(ends, 1);
    furniture.interact('cauldron'); assert.equal(panel.title.textContent, 'Verdant Elixir'); panel.closeButton.click();
    furniture.interact('bookshelf'); assert.equal(panel.title.textContent, 'Building Worlds');
    panel.next.click(); assert.equal(panel.title.textContent, 'Thoughtful Interfaces');
    furniture.handleFocusKey('Escape');
    furniture.interact('alchemyDrawer'); assert.equal(panel.eyebrow.textContent, 'A RECIPE FOR MOONWATER');
    assert.match(panel.description.textContent, /blue Moonwater/);
    furniture.handleFocusKey('KeyE');
    interactions.find(item => item.highlightTarget === chair).interact();
    assert.equal(sits, 1); assert.equal(furniture.isControllingCamera, true);
    for (let i = 0; i < 60; i++) furniture.update(1 / 60);
    const expectedCamera = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(
      new THREE.Vector3(10, 1.5, 1), new THREE.Vector3(9, 0.93, 0), new THREE.Vector3(0, 1, 0),
    ));
    assert.ok(furniture.camera.quaternion.angleTo(expectedCamera) < 1e-6);
    furniture.handleFocusKey('Escape');
    for (let i = 0; i < 60; i++) furniture.update(1 / 60);
    assert.equal(stands, 1); assert.equal(furniture.isControllingCamera, false);
    furniture.interact('cauldron'); furniture.handleFocusKey('KeyE'); furniture.destroy();
    assert.equal(starts, ends, 'teardown also restores controls once');
  } finally { restore(); }
});

test('the existing house seats all four dining chairs without exported markers and restores the player', async () => {
  const restore = domFixture();
  try {
    const house = (await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url))).scene;
    house.position.y = -30; house.updateMatrixWorld(true);
    assert.equal(house.getObjectByName('INTERACT_DINING_CHAIR_01'), undefined);
    const model = await avatar(), pose = new SeatedPose(model);
    model.position.set(2, -30, 4); model.rotation.y = Math.PI * 3; model.updateMatrixWorld(true);
    const position = model.position.toArray(), rotation = model.rotation.toArray();
    let starts = 0, ends = 0, stood = 0;
    const furniture = new HouseFurnitureInteractions(house, new THREE.PerspectiveCamera(), {
      onFocusStart(showPlayer) { assert.equal(showPlayer, true); starts++; return true; },
      onFocusEnd() { ends++; },
      onSitStart(seat, look, support) { return pose.begin(seat, look, support) ? pose.getCameraTarget(new THREE.Vector3()) : false; },
      onSitEnd() { stood++; pose.end(); }, isMuted: () => true,
    });
    const all = []; furniture.register(value => all.push(value));
    const chairs = all.filter(value => value.getHint() === 'Sit at Table');
    assert.equal(chairs.length, 4);
    const colliders = [];
    house.traverse(object => {
      if (object.isMesh && object.name.startsWith('COL_BOX_')) colliders.push(new THREE.Box3().setFromObject(object));
    });
    const system = Object.create(InteractionSystem.prototype);
    Object.assign(system, { interactables: all, active: null, hint: { show() {}, hide() {} } });
    for (const chair of chairs) {
      assert.match(chair.highlightTarget.userData.name ?? chair.highlightTarget.name, /^SEC_PROJECTS_Chair_1/);
      const bounds = new THREE.Box3().setFromObject(chair.highlightTarget), center = bounds.getCenter(new THREE.Vector3());
      let reachable = false;
      for (let angle = 0; angle < 36 && !reachable; angle++) for (const radius of [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4]) {
        const point = new THREE.Vector3(center.x + Math.cos(angle * Math.PI / 18) * radius,
          bounds.min.y + 0.03, center.z + Math.sin(angle * Math.PI / 18) * radius);
        const obstructed = colliders.some(box => {
          const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
          const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
          return dx * dx + dz * dz < 0.35 ** 2 && box.max.y > point.y + 0.02 && box.min.y < point.y + 1.8;
        });
        if (obstructed) continue;
        system.update(point);
        if (system.active === chair) { reachable = true; break; }
      }
      assert.equal(reachable, true, 'the chair should be selectable from a clear sampled approach');
      chair.interact();
      assert.equal(pose.isActive, true, 'the real avatar should fit the actual chair');
      assert.equal(furniture.isControllingCamera, true);
      for (let frame = 0; frame < 60; frame++) furniture.update(1 / 60);
      assert.ok(furniture.camera.position.toArray().every(Number.isFinite));
      furniture.handleFocusKey('Escape');
      for (let frame = 0; frame < 60; frame++) furniture.update(1 / 60);
      assert.equal(pose.isActive, false); assert.equal(furniture.isControllingCamera, false);
      close(model.position.toArray(), position); assert.deepEqual(model.rotation.toArray(), rotation);
    }
    assert.equal(starts, 4); assert.equal(ends, 4); assert.equal(stood, 4);
    furniture.destroy();
  } finally { restore(); }
});

test('dining fallback respects authored and deliberately retired markers, and recovers missing extras', async () => {
  const restore = domFixture();
  try {
    for (const state of ['missing-extras', 'authored', 'retired']) {
      const house = (await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url))).scene;
      const marker = new THREE.Object3D(); marker.name = 'INTERACT_DINING_CHAIR_01';
      if (state === 'retired') marker.userData.portfolioInteraction = 'unusedDiningChair';
      if (state === 'authored') {
        marker.userData = { portfolioInteraction: 'diningChair', targetObject: 'SEC_PROJECTS_Chair_1',
          seatObject: 'CUSTOM_SEAT', lookObject: 'CUSTOM_LOOK', cameraObject: 'CUSTOM_CAMERA' };
        for (const name of ['CUSTOM_SEAT', 'CUSTOM_LOOK', 'CUSTOM_CAMERA']) {
          const object = new THREE.Object3D(); object.name = name; house.add(object);
        }
      }
      house.add(marker);
      const furniture = new HouseFurnitureInteractions(house, new THREE.PerspectiveCamera(), {
        onFocusStart: () => true, onFocusEnd() {}, isMuted: () => true,
      });
      const interactions = []; furniture.register(value => interactions.push(value));
      const seats = interactions.filter(value => value.getHint() === 'Sit at Table');
      assert.equal(seats.length, state === 'missing-extras' ? 4 : state === 'authored' ? 1 : 0, state);
      if (state === 'authored') close(seats[0].position.toArray(), marker.position.toArray());
      furniture.destroy();
    }
  } finally { restore(); }
});

test('fallback dining chairs retain seat contact and framing after house rotation or mirroring', async () => {
  for (const mirrored of [false, true]) {
    const house = (await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url))).scene;
    house.position.set(2, -30, -3); house.rotation.y = 0.57;
    if (mirrored) house.scale.x = -1;
    house.updateMatrixWorld(true);
    house.traverse(object => {
      if (/^SEC_PROJECTS_Chair_1(?:\.\d+)?$/.test(object.userData.name ?? object.name)) object.visible = false;
    });
    const chairs = inferDiningSeats(house);
    assert.equal(chairs.length, 4);
    for (const chair of chairs) {
      const model = await avatar(), pose = new SeatedPose(model);
      const seat = chair.seat.position.getWorldPosition(new THREE.Vector3());
      const look = chair.seat.look.getWorldPosition(new THREE.Vector3());
      assert.equal(pose.begin(seat, look, chair.seat.support), true);
      const camera = new THREE.PerspectiveCamera(45, 0.7, 0.1, 1000);
      camera.position.copy(chair.seat.camera.getWorldPosition(new THREE.Vector3()));
      const target = pose.getCameraTarget(new THREE.Vector3()); target.y -= 0.12;
      camera.lookAt(target); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
      const frame = new THREE.Box2(), point = new THREE.Vector3();
      model.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        mesh.skeleton.update();
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).project(camera);
          frame.expandByPoint(new THREE.Vector2(point.x, point.y));
        }
      });
      assert.ok(frame.min.x > -1 && frame.max.x < 1 && frame.min.y > -1 && frame.max.y < 1,
        `the avatar must fit the seated view: ${JSON.stringify(frame)}`);
      pose.end();
    }
  }
});

function furnitureFixture(overrides = {}, authoringName, withChair = true) {
  const house = new THREE.Group(); house.position.y = -30;
  const couch = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial()); couch.name = 'MyCouch';
  if (authoringName) couch.userData.portfolioAuthoringName = authoringName;
  const fireplace = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()); fireplace.name = 'MyHearth';
  fireplace.position.x = 3;
  const flame = new THREE.Group(); flame.name = 'MyFlame'; flame.scale.set(1.2, 0.8, 1.1);
  flame.position.set(3, 0.4, 0);
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), new THREE.MeshBasicMaterial()));
  house.add(couch, fireplace, flame);
  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.9), new THREE.MeshStandardMaterial());
  chair.name = 'chair02_texturedobj'; chair.userData.name = 'chair02_textured.obj'; chair.position.set(3, 0.15, 1.8);
  if (withChair) house.add(chair);
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
    onSitStart(seat, look) {
      sits++;
      if (Math.abs(seat.x) < 0.01) { close(seat.toArray(), [0, -29.55, 0]); close(look.toArray(), [0, -29.1, 1]); }
      else { close(seat.toArray(), [3, -29.922, 1.8]); assert.ok(look.z < seat.z); }
      return true;
    },
    onSitEnd() { stands++; }, isMuted: () => true, ...overrides,
  });
  const interactions = [];
  furniture.register(interaction => interactions.push(interaction));
  const light = () => { let found; house.traverse(object => { if (object.isPointLight) found = object; }); return found; };
  const tick = seconds => { for (let i = 0; i < seconds * 60; i++) furniture.update(1 / 60); };
  return { house, couch, chair, flame, furniture, camera, tick, light, interactions,
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

test('a continuously colored fire accompanies real chair sitting, with E/Esc exit and no per-frame source or instance rewrites', () => {
  const restore = domFixture();
  try {
    const f = furnitureFixture(), scale = f.flame.scale.toArray();
    assert.equal(f.flame.visible, false); assert.equal(f.light().visible, true); assert.equal(f.light().castShadow, false);
    assert.equal(f.interactions[1].getHint(), 'Sit by the Fire');
    assert.equal(f.interactions[1].highlightTarget, f.chair);
    const flames = f.house.getObjectByName('FIREPLACE_FLAMES'), embers = f.house.getObjectByName('FIREPLACE_EMBERS');
    assert.ok(flames.isInstancedMesh); assert.equal(flames.count, 7); assert.equal(embers.geometry.attributes.position.count, 8);
    assert.equal(flames.material.toneMapped, false); assert.equal(flames.material.depthWrite, false);
    const instanceVersion = flames.instanceMatrix.version, vertices = flames.geometry.attributes.position.array.slice();
    f.interactions[1].interact(); f.tick(1);
    assert.equal(f.furniture.isControllingCamera, true); assert.equal(f.counts().showPlayer, true);
    assert.equal(f.interactions[1].getHint(), 'Sit by the Fire');
    assert.equal(f.light().visible, true); assert.ok(f.light().intensity > 0);
    f.furniture.leaveFocus(); f.tick(1);
    assert.equal(f.furniture.isControllingCamera, false); assert.equal(f.counts().stands, 1);
    assert.equal(f.light().visible, true); assert.ok(f.light().intensity > 0);
    let writes = 0;
    const set = f.flame.scale.set;
    f.flame.scale.set = function (...values) { writes++; return set.apply(this, values); };
    f.tick(2);
    assert.equal(writes, 0);
    assert.ok(flames.material.uniforms.uTime.value > 3);
    assert.equal(flames.instanceMatrix.version, instanceVersion); assert.deepEqual(flames.geometry.attributes.position.array, vertices);
    const pausedTime = flames.material.uniforms.uTime.value;
    f.house.visible = false; f.tick(2);
    assert.equal(flames.material.uniforms.uTime.value, pausedTime, 'hidden houses must suspend fire animation');
    f.house.visible = true;
    f.flame.scale.set = set;
    f.furniture.destroy();
    assert.equal(f.flame.visible, true); close(f.flame.scale.toArray(), scale);
  } finally { restore(); }
});

test('the fire replaces only a recognized nearby stone-colored flame and releases only its own GPU resources', () => {
  const house = new THREE.Group(), anchor = new THREE.Group(), source = new THREE.Group();
  source.add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 5), new THREE.MeshStandardMaterial()));
  const material = new THREE.MeshStandardMaterial({ color: 0x777777 });
  const gray = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.85, 7), material); gray.name = 'geometry_0'; gray.position.y = 0.425;
  const other = gray.clone(); other.position.x = 5;
  house.add(source, gray, other, anchor); house.updateMatrixWorld(true);
  const vertices = gray.geometry.attributes.position.array.slice(), transform = gray.matrixWorld.toArray();
  let disposedSource = 0;
  gray.geometry.addEventListener('dispose', () => disposedSource++); material.addEventListener('dispose', () => disposedSource++);
  const fire = new FireplaceFire(house, source, anchor);
  assert.equal(source.visible, false); assert.equal(gray.visible, false); assert.equal(other.visible, true);
  const flames = fire.root.getObjectByName('FIREPLACE_FLAMES'), embers = fire.root.getObjectByName('FIREPLACE_EMBERS');
  const time = flames.material.uniforms.uTime.value;
  fire.update(1 / 60); assert.ok(flames.material.uniforms.uTime.value > time);
  assert.equal(flames.material.uniforms.uTime, embers.material.uniforms.uTime);
  let disposedOwned = 0;
  for (const resource of [flames, flames.geometry, flames.material, embers.geometry, embers.material]) resource.addEventListener('dispose', () => disposedOwned++);
  fire.dispose(); fire.dispose();
  assert.equal(disposedOwned, 5); assert.equal(disposedSource, 0); assert.equal(fire.root.parent, null);
  assert.equal(gray.visible, true); assert.equal(source.visible, true); assert.equal(other.visible, true);
  assert.equal(gray.material, material); assert.deepEqual(gray.geometry.attributes.position.array, vertices); close(gray.matrixWorld.toArray(), transform);
});

test('missing chairs leave the fire burning without a misleading fireplace toggle, and disabling decorative lights retains colored fire', () => {
  const restore = domFixture(), decorativeLights = performanceOptions.decorativeLights;
  try {
    const missing = furnitureFixture({}, undefined, false);
    assert.equal(missing.interactions.length, 1); assert.equal(missing.furniture.activeCount, 1);
    assert.ok(missing.house.getObjectByName('FIREPLACE_FLAMES')); assert.equal(missing.light().visible, true);
    missing.furniture.destroy();
    performanceOptions.decorativeLights = false;
    const unlit = furnitureFixture();
    assert.equal(unlit.light(), undefined); assert.ok(unlit.house.getObjectByName('FIREPLACE_FLAMES'));
    assert.equal(unlit.interactions[1].getHint(), 'Sit by the Fire');
    unlit.furniture.destroy();
  } finally { performanceOptions.decorativeLights = decorativeLights; restore(); }
});

test('explicit fireside chair and pose markers override proximity guessing, including sanitized authoring names', () => {
  const restore = domFixture();
  try {
    const f = furnitureFixture(), marker = f.house.getObjectByName('INTERACT_FIREPLACE');
    f.chair.userData.portfolioAuthoringName = 'Hearth Chair.001'; marker.userData.seatTargetObject = 'Hearth Chair.001';
    const named = (name, position) => { const object = new THREE.Object3D(); object.name = name; object.position.copy(position); f.house.add(object); return object; };
    const position = named('SEAT_FIREPLACE', new THREE.Vector3(3, 0.2, 1.8));
    const look = named('LOOK_FIREPLACE', new THREE.Vector3(3, 0.5, 0));
    const camera = named('CAM_FIREPLACE', new THREE.Vector3(1, 1.5, 2.5));
    const binding = findFiresideSeat(f.house, marker, new THREE.Vector3(3, -29.6, 0));
    assert.equal(binding.model, f.chair); assert.equal(binding.seat.position, position); assert.equal(binding.seat.look, look); assert.equal(binding.seat.camera, camera);
    marker.userData.seatTargetObject = 'Missing explicit chair';
    assert.equal(findFiresideSeat(f.house, marker, new THREE.Vector3(3, -29.6, 0)), undefined);
    f.furniture.destroy();
  } finally { restore(); }
});

test('declined fireside sitting restores control immediately and leaves the colored fire and camera intact', () => {
  const restore = domFixture();
  try {
    const f = furnitureFixture({ onSitStart: () => false });
    const position = f.camera.position.toArray(), rotation = f.camera.quaternion.toArray();
    f.interactions[1].interact();
    assert.equal(f.furniture.isControllingCamera, false); assert.equal(f.counts().ends, 1);
    assert.equal(f.light().visible, true); assert.equal(f.house.getObjectByName('FIREPLACE_FIRE_RUNTIME').visible, true);
    close(f.camera.position.toArray(), position); close(f.camera.quaternion.toArray(), rotation);
    f.furniture.destroy();
  } finally { restore(); }
});

test('shader preparation includes fire materials at every light count and restores state after success or failure', async () => {
  const restore = domFixture();
  try {
    const f = furnitureFixture(), scale = f.flame.scale.toArray(), counts = [];
    await f.furniture.prepareLightingVariants(async () => {
      assert.equal(f.flame.visible, false);
      assert.equal(f.house.getObjectByName('FIREPLACE_FIRE_RUNTIME').visible, true);
      counts.push(f.light().visible ? 1 : 0);
    });
    assert.deepEqual(counts, [0, 1]);
    assert.equal(f.flame.visible, false); assert.equal(f.light().visible, true);
    await assert.rejects(f.furniture.prepareLightingVariants(async () => { throw new Error('compile failure'); }), /compile failure/);
    assert.equal(f.flame.visible, false); assert.equal(f.light().visible, true); close(f.flame.scale.toArray(), scale);
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

test('sink water starts inside the real faucet outlet, reaches the basin and stays attached throughout animation', async () => {
  const { scene } = await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url));
  const source = scene.getObjectByName('SEC_KITCHEN_Kitchen_Sink');
  const restore = domFixture();
  try {
    for (const transformed of [false, true]) {
      const house = new THREE.Group(), sink = source.clone(true);
      house.add(sink);
      if (transformed) {
        house.position.set(10, -30, 3); house.rotation.y = 0.7; house.scale.set(1.2, 0.8, 1.1);
        sink.rotation.y = 0.4; sink.scale.set(-1.3, 1.1, 0.9);
        sink.traverse(object => { if (object.isMesh) object.visible = false; }); // Batch-hidden originals still supply the outlet.
      }
      house.updateMatrixWorld(true);
      const outlet = sink.localToWorld(new THREE.Vector3(0.00000061, 1.77662146, -0.21069960));
      const basin = sink.localToWorld(new THREE.Vector3(0.00000061, 1.23431695, -0.21069960));
      const originals = [];
      sink.traverse(object => {
        if (!object.isMesh) return;
        originals.push({ object, matrix: object.matrixWorld.toArray(), visible: object.visible,
          geometry: object.geometry, material: object.material,
          positions: object.geometry.attributes.position.array.slice() });
      });
      const furniture = new HouseFurnitureInteractions(house, new THREE.PerspectiveCamera(),
        { onFocusStart: () => true, onFocusEnd() {}, isMuted: () => true });
      const interactions = []; furniture.register(value => interactions.push(value));
      assert.equal(interactions.length, 1); assert.equal(interactions[0].getHint(), 'Turn On Water');
      const stream = house.getObjectByName('SINK_WATER_STREAM'); assert.ok(stream);
      assert.equal(stream.visible, false);
      const height = stream.geometry.parameters.height, vertices = stream.geometry.attributes.position.array.slice();
      const version = stream.geometry.attributes.position.version;
      const cast = THREE.Raycaster.prototype.intersectObject;
      let casts = 0, disposed = 0;
      THREE.Raycaster.prototype.intersectObject = function (...args) { casts++; return cast.apply(this, args); };
      stream.geometry.addEventListener('dispose', () => disposed++);
      stream.material.addEventListener('dispose', () => disposed++);
      try {
        for (let repeat = 0; repeat < 2; repeat++) {
          interactions[0].interact();
          for (let frame = 0; frame < 180; frame++) {
            furniture.update(1 / 60); house.updateMatrixWorld(true);
            close(stream.localToWorld(new THREE.Vector3()).toArray(), outlet.toArray());
            close(stream.localToWorld(new THREE.Vector3(0, -height, 0)).toArray(), basin.toArray());
          }
          assert.equal(stream.visible, true); assert.equal(interactions[0].getHint(), 'Turn Off Water');
          interactions[0].interact();
          for (let frame = 0; frame < 120; frame++) furniture.update(1 / 60);
          assert.equal(stream.visible, false);
        }
        assert.equal(casts, 0, 'outlet/basin picking happens only during setup');
        assert.equal(stream.geometry.attributes.position.version, version);
        assert.deepEqual(stream.geometry.attributes.position.array, vertices);
        furniture.destroy(); assert.equal(disposed, 2);
      } finally { THREE.Raycaster.prototype.intersectObject = cast; }
      for (const original of originals) {
        assert.equal(original.object.geometry, original.geometry); assert.equal(original.object.material, original.material);
        assert.equal(original.object.visible, original.visible); close(original.object.matrixWorld.toArray(), original.matrix);
        assert.deepEqual(original.geometry.attributes.position.array, original.positions);
      }
    }
  } finally { restore(); }
});

test('a sink without faucet geometry does not generate a floating stream from its center', () => {
  const sink = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const anchor = new THREE.Group(), house = new THREE.Group(); house.add(sink, anchor);
  assert.equal(createSinkWater(sink, anchor, 0x96dceb), undefined);
  assert.equal(anchor.children.length, 0);
});

test('the bed shows a persistent matching rest prompt with E/Esc to get up, including reopening and return', () => {
  const restore = domFixture();
  try {
    const house = new THREE.Group(), bed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 2.4), new THREE.MeshStandardMaterial());
    bed.name = 'SEC_REST_Bed_King'; house.add(bed);
    const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 2, 4); camera.lookAt(0, 0.5, 0);
    const position = camera.position.toArray(), rotation = camera.quaternion.toArray();
    let starts = 0, ends = 0, laid = 0, stood = 0;
    const furniture = new HouseFurnitureInteractions(house, camera,
      { onFocusStart: visible => { assert.equal(visible, true); starts++; return true; }, onFocusEnd() { ends++; },
        onLieStart: () => { laid++; return { target: new THREE.Vector3(0, 0.8, 0), headDirection: new THREE.Vector3(0, 0, -1) }; },
        onLieEnd: () => { stood++; }, isMuted: () => true });
    const interactions = []; furniture.register(value => interactions.push(value));
    assert.equal(interactions.length, 1); assert.equal(interactions[0].getHint(), 'Rest on Bed');
    for (let repeat = 0; repeat < 2; repeat++) {
      interactions[0].interact();
      assert.equal(furniture.notice.classList.contains('is-visible'), true);
      assert.equal(furniture.notice.children[0].textContent, 'A quiet moment on the bed.');
      assert.equal(furniture.notice.children[1].textContent, 'E / Esc  —  Get up');
      for (let frame = 0; frame < 1200; frame++) furniture.update(1 / 60);
      assert.equal(furniture.isControllingCamera, true);
      assert.equal(furniture.notice.classList.contains('is-visible'), true);
      furniture.leaveFocus(); furniture.leaveFocus();
      for (let frame = 0; frame < 120; frame++) furniture.update(1 / 60);
      assert.equal(furniture.isControllingCamera, false); assert.equal(furniture.notice.classList.contains('is-visible'), false);
      close(camera.position.toArray(), position); close(camera.quaternion.toArray(), rotation);
    }
    assert.equal(starts, 2); assert.equal(ends, 2); assert.equal(laid, 2); assert.equal(stood, 2); furniture.destroy();
  } finally { restore(); }
});

test('the real avatar lies face-up on the real bed and returns to its original multi-turn heading', async () => {
  const { scene: source } = await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url));
  const sourceBed = source.getObjectByName('SEC_REST_Bed_King'); assert.ok(sourceBed);
  const restore = domFixture();
  try {
    for (const heading of [Math.PI, -2.6, 3 * Math.PI]) {
      const house = new THREE.Group(), bed = sourceBed.clone(true); house.add(bed);
      const model = await avatar(), scene = new THREE.Scene(); scene.add(house, model);
      model.position.set(-3.5, -0.49, 1.55); model.rotation.y = heading;
      scene.updateMatrixWorld(true);
      const original = model.position.toArray(), rotation = model.rotation.clone();
      const bones = new Map(); model.traverse(object => { if (object.isBone) bones.set(object.name.replace(/^mixamorig[:_]?/i, '').toLowerCase(), object); });
      const savedBones = [...bones.values()].map(bone => [bone, bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()]);
      const feet = model.position.clone(), teleports = [];
      let physics = 0, animation = 0, begins = 0, ends = 0;
      const player = Object.create(Player.prototype);
      Object.assign(player, { model, seatedPose: new SeatedPose(model), standingFeet: new THREE.Vector3(),
        body: { isGrounded: true, getFeetPosition: target => target.copy(feet), teleport: p => teleports.push(p.toArray()), syncModel() {} },
        controller: { update() { physics++; } }, mixer: { update() { animation++; } } });
      const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 1000); camera.position.set(-3.5, 2.6, 4); camera.lookAt(-3.5, 0, 0);
      const cameraBefore = camera.position.toArray(), quaternionBefore = camera.quaternion.toArray();
      const furniture = new HouseFurnitureInteractions(house, camera, {
        onFocusStart(show) { assert.equal(show, true); model.visible = show; begins++; return true; },
        onFocusEnd() { model.visible = true; ends++; },
        onLieStart: target => player.beginLying(target), onLieEnd: () => player.endSitting(), isMuted: () => true,
      });
      const interactions = []; furniture.register(value => interactions.push(value));
      assert.equal(interactions.length, 1);
      for (let repeat = 0; repeat < 2; repeat++) {
        interactions[0].interact(); assert.equal(furniture.isControllingCamera, true); assert.equal(model.visible, true);
        player.updatePhysics(1 / 60); player.updateAnimation(1 / 60); player.syncFromPhysics();
        assert.equal(physics, 0); assert.equal(animation, 0);
        for (let frame = 0; frame < 90; frame++) furniture.update(1 / 60);
        const hips = bones.get('hips').getWorldPosition(new THREE.Vector3());
        const head = bones.get('headtop_end').getWorldPosition(new THREE.Vector3());
        const foot = bones.get('leftfoot').getWorldPosition(new THREE.Vector3());
        assert.ok(head.x < hips.x - 0.8 && foot.x > hips.x + 0.5, JSON.stringify({ head, hips, foot }));
        assert.ok(head.x >= -5.55 && head.x <= -4.75, 'head must reach the pillow end');
        assert.ok(hips.y > 0.20 && hips.y < 0.8, 'hips must be on the mattress');
        assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())).y > 0.99, 'avatar faces up');
        assert.ok(Math.abs(head.y - hips.y) < 0.25 && Math.abs(foot.y - hips.y) < 0.25, 'body lies along the mattress');
        camera.updateMatrixWorld(true);
        for (const point of [head, hips, foot]) {
          const screen = point.clone().project(camera);
          assert.ok(Math.abs(screen.x) < 0.9 && Math.abs(screen.y) < 0.9 && screen.z > -1 && screen.z < 1,
            'the rest camera should frame the avatar: ' + screen.toArray());
        }
        furniture.leaveFocus(); for (let frame = 0; frame < 90; frame++) furniture.update(1 / 60);
        assert.equal(furniture.isControllingCamera, false); close(model.position.toArray(), original);
        assert.equal(model.rotation.y, rotation.y); assert.equal(model.rotation.x, rotation.x); assert.equal(model.rotation.z, rotation.z);
        close(camera.position.toArray(), cameraBefore); close(camera.quaternion.toArray(), quaternionBefore);
        for (const [bone, p, q, s] of savedBones) { close(bone.position.toArray(), p.toArray()); close(bone.quaternion.toArray(), q.toArray()); close(bone.scale.toArray(), s.toArray()); }
      }
      assert.equal(begins, 2); assert.equal(ends, 2); assert.equal(teleports.length, 4);
      player.updatePhysics(1 / 60); player.updateAnimation(1 / 60); assert.equal(physics, 1); assert.equal(animation, 1);
      furniture.destroy();
    }
  } finally { restore(); }
});

test('bed proximity follows every edge and corner, including a rotated bed, without blocking closer props', async () => {
  const { scene } = await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url));
  const source = scene.getObjectByName('SEC_REST_Bed_King'), restore = domFixture();
  try {
    for (const angle of [0, 0.65]) {
      const house = new THREE.Group(), bed = source.clone(true); house.add(bed); house.rotation.y = angle; house.position.set(4, -30, 2);
      house.updateMatrixWorld(true);
      const frame = inspectBed(bed); assert.ok(frame);
      const furniture = new HouseFurnitureInteractions(house, new THREE.PerspectiveCamera(), { onFocusStart: () => true, onFocusEnd() {}, isMuted: () => true });
      const interactions = []; furniture.register(value => interactions.push(value)); const interactable = interactions[0];
      const { min, max } = frame.bounds;
      for (let i = 0; i < 24; i++) {
        const theta = 2 * Math.PI * i / 24, x = Math.cos(theta), z = Math.sin(theta);
        const scale = 1 / Math.max(Math.abs(x), Math.abs(z));
        const point = new THREE.Vector3((min.x + max.x) / 2 + x * scale * ((max.x - min.x) / 2 + 0.45),
          min.y + 0.05, (min.z + max.z) / 2 + z * scale * ((max.z - min.z) / 2 + 0.45)).applyMatrix4(frame.world);
        assert.ok(interactable.distanceTo(point) <= interactable.interactionDistance, 'bed unreachable at angle ' + theta);
      }
      const far = new THREE.Vector3(max.x + 3, min.y + 0.05, max.z + 3).applyMatrix4(frame.world);
      assert.ok(interactable.distanceTo(far) > interactable.interactionDistance);
      const system = Object.create(InteractionSystem.prototype), near = new THREE.Vector3(max.x + 0.35, min.y + 0.05, (min.z + max.z) / 2).applyMatrix4(frame.world);
      let invoked = 0;
      const nearer = { position: near.clone(), interactionDistance: 1, highlightTarget: new THREE.Group(), getHint: () => 'Nearby object', interact: () => invoked++ };
      Object.assign(system, { interactables: [interactable, nearer], active: null, hint: { show() {}, hide() {} } });
      system.update(near); system.interact(); assert.equal(invoked, 1, 'a genuinely nearer object remains selectable');
      furniture.destroy();
    }
  } finally { restore(); }
});

test('lying fits the real bed after rotation or mirroring and restores an interrupted walking pose', async () => {
  const { scene: source } = await readGeometryGLB(new URL('../public/assets/models/environment/house.glb', import.meta.url));
  const clip = (await readGeometryGLB(new URL('../public/assets/models/player/animations/walking.glb', import.meta.url))).animations[0];
  for (const mirror of [false, true]) {
    const house = new THREE.Group(), bed = source.getObjectByName('SEC_REST_Bed_King').clone(true), model = await avatar();
    house.rotation.y = 0.7; house.position.set(3, -30, 4); if (mirror) house.scale.x = -1;
    if (mirror) bed.traverse(object => { if (object.isMesh) object.visible = false; }); // Batch-hidden originals remain usable.
    house.add(bed); const scene = new THREE.Scene(); scene.add(house, model); scene.updateMatrixWorld(true);
    const pose = new SeatedPose(model), mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play(); mixer.update(0.7); model.rotation.y = 3 * Math.PI;
    const saved = []; model.traverse(object => { if (object.isBone) saved.push([object, object.position.clone(), object.quaternion.clone(), object.scale.clone()]); });
    const frame = inspectBed(bed), local = frame.bounds.getCenter(new THREE.Vector3());
    local.x = frame.bounds.max.x + 0.5; local.y = frame.bounds.min.y + 0.05;
    const approach = local.applyMatrix4(frame.world); model.position.copy(approach); scene.updateMatrixWorld(true);
    const result = pose.beginLying(bed, approach); assert.ok(result);
    let hips, head;
    model.traverse(object => { if (object.isBone && /mixamorigHips$/i.test(object.name)) hips = object.getWorldPosition(new THREE.Vector3());
      if (object.isBone && /mixamorigHeadTop_End$/i.test(object.name)) head = object.getWorldPosition(new THREE.Vector3()); });
    assert.ok(head.clone().sub(hips).normalize().dot(result.headDirection) > 0.98);
    assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())).y > 0.99);
    pose.end(); assert.equal(model.rotation.y, 3 * Math.PI); close(model.position.toArray(), approach.toArray());
    for (const [bone, p, q, s] of saved) { close(bone.position.toArray(), p.toArray()); close(bone.quaternion.toArray(), q.toArray()); close(bone.scale.toArray(), s.toArray()); }
  }
});

test('a declined bed pose restores controls, and teardown releases an active lying pose once', () => {
  const restore = domFixture();
  try {
    const house = new THREE.Group(), bed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 2.4), new THREE.MeshStandardMaterial());
    bed.name = 'SEC_REST_Bed_King'; house.add(bed);
    let ends = 0, stands = 0, showPlayer;
    const furniture = new HouseFurnitureInteractions(house, new THREE.PerspectiveCamera(), {
      onFocusStart(show) { showPlayer = show; return true; }, onFocusEnd() { ends++; }, onLieStart: () => false,
      onLieEnd() { stands++; }, isMuted: () => true,
    });
    furniture.interact('bed'); assert.equal(showPlayer, true); assert.equal(ends, 1); assert.equal(stands, 0);
    assert.equal(furniture.isControllingCamera, false);
    furniture.options.onLieStart = () => ({ target: new THREE.Vector3(0, 0.5, 0), headDirection: new THREE.Vector3(0, 0, -1) });
    furniture.interact('bed'); assert.equal(furniture.isControllingCamera, true);
    furniture.destroy(); assert.equal(ends, 2); assert.equal(stands, 1);
  } finally { restore(); }
});
