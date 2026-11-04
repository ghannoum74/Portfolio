import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const temporary = await mkdtemp(new URL('../.scene-transition-test-', import.meta.url));
const bundle = `${temporary}/transition.mjs`;
await build({ entryPoints: ['src/ui/SceneTransition/SceneTransition.ts'], bundle: true,
  platform: 'node', format: 'esm', outfile: bundle, loader: { '.css': 'empty', '.html': 'text' } });
const { SceneTransition } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

class Element {
  children = []; attributes = new Map(); dataset = {}; hidden = false; textContent = ''; removed = false;
  classes = new Set(); targets = new Map();
  classList = {
    add: value => this.classes.add(value), remove: value => this.classes.delete(value),
    contains: value => this.classes.has(value),
    toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value),
  };
  set className(value) { this.classes = new Set(value.split(/\s+/)); }
  set innerHTML(value) { this.html = value; }
  querySelector(selector) {
    const attribute = selector.slice(1, -1);
    if (!new RegExp(`${attribute}(?:\\s|[=>])`).test(this.html ?? '')) return null;
    if (!this.targets.has(selector)) {
      const target = new Element(); target.hidden = selector === '[data-house-loading]';
      this.targets.set(selector, target);
    }
    return this.targets.get(selector);
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  appendChild(child) { this.children.push(child); }
  remove() { this.removed = true; }
}

function fixture(t, reducedMotion = false) {
  const previous = { window: globalThis.window, document: globalThis.document };
  const intervals = new Map(), timeouts = new Map(); let nextId = 0;
  globalThis.window = {
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: (callback, delay) => { const id = ++nextId; timeouts.set(id, { callback, delay }); return id; },
    setInterval: (callback, delay) => { const id = ++nextId; intervals.set(id, { callback, delay }); return id; },
    clearInterval: id => intervals.delete(id),
  };
  globalThis.document = { createElement: () => new Element() };
  const parent = new Element(), transition = new SceneTransition(parent), root = parent.children[0];
  t.after(() => { transition.destroy(); globalThis.window = previous.window; globalThis.document = previous.document; });
  return { transition, root, intervals, timeouts,
    loading: root.querySelector('[data-house-loading]'),
    message: root.querySelector('[data-house-loading-message]'),
    phase: root.querySelector('[data-house-loading-phase]'),
    tickMessages: () => { for (const { callback } of [...intervals.values()]) callback(); },
    finishFades: () => { const pending = [...timeouts.values()]; timeouts.clear(); pending.forEach(timer => timer.callback()); },
  };
}

test('house loading is announced, rotates jokes, and stays visible until the normal fade finishes', async t => {
  const f = fixture(t), covering = f.transition.fadeIn('house');
  assert.equal(f.root.attributes.get('aria-hidden'), 'false');
  assert.equal(f.loading.hidden, false);
  assert.equal(f.root.classList.contains('is-visible'), true);
  assert.match(f.phase.textContent, /cottage to life/);
  assert.equal([...f.timeouts.values()][0].delay, 450, 'reuse the existing cover timing, without a fake loading delay');
  const firstMessage = f.message.textContent; f.tickMessages();
  assert.notEqual(f.message.textContent, firstMessage);
  f.finishFades(); await covering;
  f.transition.setHouseStage('lighting'); assert.match(f.phase.textContent, /chandelier/);
  f.transition.setHouseStage('finishing'); assert.match(f.phase.textContent, /book/);
  f.transition.setHouseStage('ready'); assert.equal(f.intervals.size, 0);
  assert.match(f.phase.textContent, /Come on in/);
  const uncovering = f.transition.fadeOut();
  assert.equal(f.loading.hidden, false, 'keep the illustration present during fade-out');
  f.finishFades(); await uncovering;
  assert.equal(f.loading.hidden, true);
  assert.equal(f.root.attributes.get('aria-hidden'), 'true');
  assert.equal(f.intervals.size, 0);
});

test('plain exit fades never show the cleanup screen or start its timer', async t => {
  const f = fixture(t), pending = f.transition.fadeIn();
  assert.equal(f.loading.hidden, true);
  assert.equal(f.root.classList.contains('is-house-entry'), false);
  assert.equal(f.intervals.size, 0);
  f.transition.setHouseStage('error'); assert.equal(f.phase.textContent, '');
  f.finishFades(); await pending;
});

test('errors, retry and disposal stop timers; an old fade cannot hide a newer entry', async t => {
  const f = fixture(t), covering = f.transition.fadeIn('house'); f.finishFades(); await covering;
  f.transition.setHouseStage('error');
  assert.match(f.phase.textContent, /try the door again/); assert.equal(f.intervals.size, 0);
  const oldFade = f.transition.fadeOut();
  const retry = f.transition.fadeIn('house');
  f.finishFades(); await Promise.all([oldFade, retry]);
  assert.equal(f.loading.hidden, false);
  assert.equal(f.root.classList.contains('is-visible'), true);
  assert.equal(f.intervals.size, 1);
  assert.match(f.message.textContent, /Hiding the laundry/);
  f.transition.destroy(); assert.equal(f.intervals.size, 0); assert.equal(f.root.removed, true);
});

test('reduced motion avoids animated-message timers and transition waits', async t => {
  const f = fixture(t, true);
  await f.transition.fadeIn('house');
  assert.equal(f.intervals.size, 0); assert.equal(f.timeouts.size, 0);
  assert.equal(f.loading.hidden, false);
  await f.transition.fadeOut(); assert.equal(f.loading.hidden, true);
});
