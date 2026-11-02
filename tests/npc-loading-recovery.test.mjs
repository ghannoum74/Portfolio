import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

globalThis.window = { location: { search: '' }, devicePixelRatio: 1 };
const temporary = await mkdtemp(new URL('../.npc-recovery-test-', import.meta.url));
await build({ stdin: { contents: `export {NpcManager} from './src/world/npc/NpcManager'; export {PhysicsWorld} from './src/physics/PhysicsWorld'; export {Game} from './src/core/Game'; export {NPC_DEFINITIONS} from './src/world/npc/NpcData';`, resolveDir: process.cwd(), loader: 'ts' },
  outfile: `${temporary}/suite.mjs`, bundle: true, packages: 'external', platform: 'node', format: 'esm', loader: { '.html': 'text', '.css': 'empty', '.glsl': 'text' },
  plugins: [{ name: 'test-css', setup(b) {
    b.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'test-css' }));
    b.onLoad({ filter: /.*/, namespace: 'test-css' }, () => ({ contents: '', loader: 'js' }));
  } }] });
const { NpcManager, PhysicsWorld, Game, NPC_DEFINITIONS } = await import(pathToFileURL(`${temporary}/suite.mjs`));
await rm(temporary, { recursive: true, force: true });

async function fixture(t) {
  const physics = new PhysicsWorld(); await physics.init();
  t.after(() => physics.world.free());
  const scene = new THREE.Scene(), manager = new NpcManager(scene, new THREE.LoadingManager(), physics);
  const calls = new Map(); let fail;
  const load = async url => {
    calls.set(url, (calls.get(url) ?? 0) + 1);
    if (url === fail) throw new Error('model unavailable');
    return readGeometryGLB(new URL(`../public${url}`, import.meta.url));
  };
  manager.startupLoader.loadGLB = manager.loader.loadGLB = load;
  return { manager, physics, scene, calls, fail: url => { fail = url; } };
}

test('all seven shipped guides decode, animate and acquire colliders with Frequenc ready first', async t => {
  const f = await fixture(t);
  await f.manager.loadStartup();
  assert.deepEqual(f.manager.npcs.map(npc => npc.id), ['frequenc']);
  const first = f.manager.load(); assert.equal(f.manager.load(), first); await first;
  assert.deepEqual(f.manager.npcs.map(npc => npc.id), NPC_DEFINITIONS.map(npc => npc.id));
  assert.equal(f.physics.world.colliders.len(), 7);
  for (const npc of f.manager.npcs) {
    assert.equal(npc.model.parent, f.scene); assert.equal(npc.model.visible, true);
    assert.ok(npc.collision); npc.animator.update(1 / 60);
  }
  for (const count of f.calls.values()) assert.equal(count, 1);
});

test('one missing optional GLB cannot hide the others; retry loads only that guide without duplicates', async t => {
  const f = await fixture(t), missing = NPC_DEFINITIONS.find(npc => npc.id === 'mtc');
  f.fail(missing.asset);
  await assert.rejects(f.manager.load(), error => error instanceof AggregateError && error.errors.length === 1);
  assert.equal(f.manager.npcs.length, 6);
  assert.ok(f.manager.npcs.every(npc => npc.id !== missing.id && npc.model.parent === f.scene));
  const instances = new Map(f.manager.npcs.map(npc => [npc.id, npc]));
  f.manager.setVisible(false); f.fail(undefined); await f.manager.load();
  assert.equal(f.manager.npcs.length, 7); assert.equal(f.physics.world.colliders.len(), 7);
  assert.equal(f.calls.get(missing.asset), 2);
  for (const definition of NPC_DEFINITIONS.filter(npc => npc.id !== missing.id)) assert.equal(f.calls.get(definition.asset), 1);
  for (const npc of f.manager.npcs) {
    if (instances.has(npc.id)) assert.equal(npc, instances.get(npc.id));
    assert.equal(npc.model.parent, null); assert.equal(npc.model.visible, false);
  }
  await f.manager.load(); assert.equal(f.calls.get(missing.asset), 2);
});

test('Game registers available guides even when optional loading reports a failure', async t => {
  t.mock.method(console, 'error', () => {});
  const game = Object.create(Game.prototype); let registrations = 0;
  game.world = { loadNpcs: async () => { throw new Error('one missing model'); } };
  game.registerNpcInteractions = () => { registrations++; };
  await game.loadNpcsInBackground(); assert.equal(registrations, 1);
});
