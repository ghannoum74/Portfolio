import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

class Element extends EventTarget {
  children = []; hidden = false; disabled = false; style = {}; attributes = {}; open = false; captures = new Set();
  tagName = 'DIV'; isContentEditable = false;
  classes = new Set();
  classList = { add: key => this.classes.add(key), remove: key => this.classes.delete(key),
    contains: key => this.classes.has(key), toggle: (key, value) => value ? this.classes.add(key) : this.classes.delete(key) };
  append(...elements) { this.children.push(...elements); }
  appendChild(element) { this.append(element); return element; }
  setAttribute(key, value) { this.attributes[key] = value; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() { this.removed = true; }
  click() { this.dispatchEvent(new Event('click', { cancelable: true })); }
}
globalThis.HTMLElement = Element;
function environment(coarse = true) {
  const media = Object.assign(new EventTarget(), { matches: coarse });
  globalThis.window = Object.assign(new EventTarget(), { innerWidth: 844, innerHeight: 390,
    location: { search: '' }, devicePixelRatio: 3, matchMedia: () => media, performance: globalThis.performance,
    setTimeout: () => 1, clearTimeout() {} });
  globalThis.document = Object.assign(new EventTarget(), { hidden: false, fullscreenElement: null,
    body: new Element(), documentElement: new Element(), createElement: () => new Element() });
  Object.defineProperty(globalThis, 'screen', { configurable: true, value: { orientation: {} } });
  return { media };
}
environment();
const temporary = await mkdtemp(new URL('../.mobile-test-', import.meta.url));
const bundle = temporary + '/suite.mjs';
await build({ stdin: { contents: "export {Keyboard} from './src/input/Keyboard'; export {MobileControls} from './src/input/MobileControls'; export {Game} from './src/core/Game'; export {ThirdPersonCamera} from './src/camera/ThirdPersonCamera'; export {getPerformanceOptions} from './src/core/PerformanceOptions';", resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
  bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile: bundle,
  loader: { '.css': 'empty', '.html': 'text', '.glsl': 'text' },
  plugins: [{ name: 'css', setup(b) { b.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'css' })); b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: '', loader: 'js' })); } }],
});
const { Keyboard, MobileControls, Game, ThirdPersonCamera, getPerformanceOptions } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });
const pointer = (type, id, x, y, pointerType = 'touch') => Object.assign(new Event(type, { cancelable: true }), { pointerId: id, clientX: x, clientY: y, pointerType, button: 0 });
const key = (type, code) => window.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
const play = { movement: true, action: null, back: false, navigation: false, openProject: false };
function fixture(coarse = true) {
  const { media } = environment(coarse), keyboard = new Keyboard(), commands = [];
  const mobile = new MobileControls(keyboard, code => commands.push(code));
  mobile.setWorldActive(true); mobile.setContext(play);
  return { mobile, keyboard, commands, media };
}

test('floating arrows appear only during a movement touch and release/cancel cannot leave the player running', () => {
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const { mobile, keyboard } = fixture();
    assert.equal(mobile.pad.hidden, true);
    mobile.zone.dispatchEvent(pointer('pointerdown', 1, 150, 290));
    assert.equal(mobile.pad.hidden, false);
    mobile.zone.dispatchEvent(pointer('pointermove', 1, 150, 262));
    assert.equal(keyboard.forward, true); assert.equal(keyboard.run, false);
    mobile.zone.dispatchEvent(pointer('pointermove', 1, 125, 220));
    assert.equal(keyboard.forward, true); assert.equal(keyboard.left, true); assert.equal(keyboard.run, true);
    mobile.zone.dispatchEvent(pointer(ending, 1, 125, 220));
    assert.equal(mobile.pad.hidden, true); assert.equal(keyboard.forward, false); assert.equal(keyboard.left, false); assert.equal(keyboard.run, false);
    mobile.destroy();
  }
});

test('the second finger can jump or interact without stealing or ending the movement pointer', () => {
  const { mobile, keyboard, commands } = fixture();
  mobile.setContext({ ...play, action: 'Brew a Potion' });
  mobile.zone.dispatchEvent(pointer('pointerdown', 7, 130, 300));
  mobile.zone.dispatchEvent(pointer('pointermove', 7, 130, 255));
  mobile.zone.dispatchEvent(pointer('pointerdown', 8, 190, 320));
  mobile.zone.dispatchEvent(pointer('pointerup', 8, 190, 320));
  assert.equal(keyboard.forward, true); assert.equal(mobile.pad.hidden, false);
  mobile.jump.dispatchEvent(pointer('pointerup', 8, 750, 340));
  assert.equal(keyboard.consumeJump(), true); assert.equal(keyboard.consumeJump(), false);
  mobile.action.dispatchEvent(pointer('pointerup', 9, 750, 340));
  mobile.action.dispatchEvent(Object.assign(new Event('click'), { detail: 1 }));
  assert.deepEqual(commands, ['KeyE'], 'A touch plus its compatibility click must activate once');
  mobile.zone.dispatchEvent(pointer('pointerup', 7, 130, 255)); assert.equal(keyboard.forward, false);
  mobile.destroy();
});

test('opening a focused view, losing visibility or rotating clears touch movement and queued jumps', () => {
  for (const stop of ['panel', 'blur', 'visibility', 'portrait']) {
    const { mobile, keyboard } = fixture();
    mobile.zone.dispatchEvent(pointer('pointerdown', 1, 140, 300));
    mobile.zone.dispatchEvent(pointer('pointermove', 1, 140, 240)); mobile.jump.click();
    if (stop === 'panel') { keyboard.setEnabled(false); mobile.setContext({ ...play, movement: false, back: true }); }
    if (stop === 'blur') window.dispatchEvent(new Event('blur'));
    if (stop === 'visibility') { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); }
    if (stop === 'portrait') { window.innerWidth = 390; window.innerHeight = 844; window.dispatchEvent(new Event('resize')); }
    assert.equal(keyboard.forward, false); assert.equal(keyboard.run, false); assert.equal(keyboard.consumeJump(), false);
    assert.equal(mobile.pad.hidden, true);
    mobile.destroy();
  }
});

test('portrait blocks play until landscape returns, and rotating cannot enable input behind a panel', () => {
  const { mobile, keyboard, commands } = fixture(); keyboard.setEnabled(false);
  window.innerWidth = 390; window.innerHeight = 844; window.dispatchEvent(new Event('resize'));
  assert.equal(mobile.isBlocking, true); assert.equal(mobile.rotate.open, true); assert.equal(mobile.root.hidden, true);
  mobile.action.click(); assert.deepEqual(commands, []);
  window.innerWidth = 844; window.innerHeight = 390; window.dispatchEvent(new Event('resize'));
  assert.equal(mobile.isBlocking, false); assert.equal(mobile.rotate.open, false); assert.equal(keyboard.isEnabled, false);
  keyboard.setEnabled(true); assert.equal(keyboard.forward, false);
  mobile.destroy();
});

test('fullscreen requests landscape when available and rejected/unsupported APIs retain a working manual-rotation guard', async () => {
  for (const mode of ['supported', 'rejected', 'absent']) {
    const { mobile } = fixture(), events = [];
    window.innerWidth = 390; window.innerHeight = 844; window.dispatchEvent(new Event('resize'));
    if (mode !== 'absent') {
      document.documentElement.requestFullscreen = async () => { events.push('fullscreen'); if (mode === 'rejected') throw Error('denied'); document.fullscreenElement = document.documentElement; };
      screen.orientation.lock = async value => { events.push(value); if (mode === 'rejected') throw Error('unsupported'); };
    }
    await mobile.requestLandscape();
    assert.deepEqual(events, mode === 'absent' ? [] : ['fullscreen', 'landscape']);
    assert.equal(mobile.isBlocking, true, 'A resolved promise is not evidence that the viewport rotated');
    assert.equal(mobile.rotate.open, true);
    mobile.destroy();
  }
});

test('keyboard and touch coexist; releasing either source cannot cancel the other, and disabled modes reject both', () => {
  const { mobile, keyboard } = fixture();
  key('keydown', 'KeyW'); keyboard.setTouchMovement(-1, 0); keyboard.clearTouchMovement(); assert.equal(keyboard.forward, true);
  keyboard.setTouchMovement(0, -1, true); key('keyup', 'KeyW'); assert.equal(keyboard.forward, true);
  keyboard.setEnabled(false); keyboard.setTouchMovement(0, -1, true); keyboard.queueJump(); key('keydown', 'KeyW');
  assert.equal(keyboard.forward, false); assert.equal(keyboard.consumeJump(), false);
  keyboard.setEnabled(true); assert.equal(keyboard.forward, false); assert.equal(keyboard.run, false);
  mobile.destroy();
});

test('mouse-only desktop has no touch overlay or orientation restriction; mobile DPR cap preserves explicit overrides', () => {
  const { mobile } = fixture(false);
  window.innerWidth = 400; window.innerHeight = 800; window.dispatchEvent(new Event('resize'));
  assert.equal(mobile.isBlocking, false); assert.equal(mobile.root.hidden, true); assert.equal(mobile.rotate.open, false);
  assert.equal(getPerformanceOptions('', 3, true).pixelRatio, 1.5);
  assert.equal(getPerformanceOptions('?dpr=2', 3, true).pixelRatio, 2);
  assert.equal(getPerformanceOptions('', 3).pixelRatio, 2);
  mobile.destroy();
});

function gameFixture() {
  const events = [], game = Object.assign(Object.create(Game.prototype), {
    phase: 'playing', transitioning: false, preparingScene: false, debugMode: false, projectBookMode: 'idle',
    paperPanel: { isOpen: false }, dialogueBox: { isOpen: false, next: () => events.push('dialogue-next'), close: () => events.push('dialogue-close') },
    interactionSystem: { activeHint: 'Brew a Potion', interact: () => events.push('interact') },
    projectWebsitePreview: { openCurrent: () => events.push('project-open') }, activeProjectBook: { turnPage: direction => events.push(['page', direction]) },
    leaveProjectBookReading: () => events.push('book-close'), leaveWorkshopExperience: () => events.push('workshop-close'),
    leaveJourneyMap: () => events.push('journey-close'), leaveAwardsExperience: () => events.push('awards-close'),
  });
  return { game, events, send: code => game.handleCommand({ code, repeat: false, preventDefault() {} }) };
}

test('mobile actions route through the actual Game handler for world, book, NPC and every exhibit', () => {
  const f = gameFixture();
  assert.equal(f.game.mobileContext(true).action, 'Brew a Potion'); f.send('KeyE'); assert.equal(f.events.pop(), 'interact');
  f.game.projectBookMode = 'reading'; assert.equal(f.game.mobileContext(false).openProject, true);
  f.send('ArrowRight'); f.send('KeyO'); f.send('Escape');
  assert.deepEqual(f.events.splice(0), [['page', 1], 'project-open', 'book-close']); f.game.projectBookMode = 'idle';
  for (const id of ['workshop', 'journey', 'awards']) {
    f.game[id] = { isControllingCamera: true, selectRelative: d => f.events.push(d), toggleSelection: () => f.events.push('details') };
    assert.equal(f.game.mobileContext(false).navigation, true);
    f.send('ArrowLeft'); f.send('KeyE'); f.send('Escape');
    assert.deepEqual(f.events.splice(0), [-1, 'details', id + '-close']); f.game[id] = null;
  }
  f.game.dialogueBox.isOpen = true; assert.equal(f.game.mobileContext(false).action, 'Continue');
  f.send('KeyE'); f.send('Escape'); assert.deepEqual(f.events.splice(0), ['dialogue-next', 'dialogue-close']);
});

test('touch controls disappear for transitions, tour and modal panels, with an explicit return for resting', () => {
  const { game } = gameFixture();
  for (const property of ['transitioning', 'preparingScene']) {
    game[property] = true; assert.equal(game.mobileContext(true).movement, false); assert.equal(game.mobileContext(true).action, null); game[property] = false;
  }
  game.paperPanel.isOpen = true; assert.equal(game.mobileContext(true).movement, false); game.paperPanel.isOpen = false;
  game.houseGuide = { isControllingCamera: true }; assert.equal(game.mobileContext(true).movement, false); game.houseGuide = null;
  game.furniture = { isControllingCamera: true, isPanelOpen: false }; assert.equal(game.mobileContext(false).back, true);
  game.furniture.isPanelOpen = true; assert.equal(game.mobileContext(false).back, false, 'The cauldron panel has its own Close button');
  game.furniture = null; game.projectBookMode = 'opening';
  assert.equal(game.mobileContext(false).back, true, 'Opening the book still provides a way back');
});

test('the right camera drag stays attached to its own finger while another finger moves or lifts', () => {
  environment();
  const canvas = new Element(), camera = new THREE.PerspectiveCamera(), player = new THREE.Group();
  const follow = new ThirdPersonCamera(camera, player, canvas, {
    rapier: { Ball: class {}, QueryFilterFlags: { ONLY_FIXED: 1 } },
    world: { castShape: () => null }, staticColliderRevision: 0,
  });
  follow.setInputEnabled(true);
  canvas.dispatchEvent(pointer('pointerdown', 2, 600, 150));
  canvas.dispatchEvent(pointer('pointermove', 1, 120, 200));
  assert.equal(follow.orbitYaw, 0);
  canvas.dispatchEvent(pointer('pointermove', 2, 630, 150));
  assert.ok(follow.orbitYaw < 0);
  canvas.dispatchEvent(pointer('pointerup', 1, 120, 200));
  assert.equal(follow.dragging, true);
  canvas.dispatchEvent(pointer('pointercancel', 2, 630, 150));
  assert.equal(follow.dragging, false);
});
