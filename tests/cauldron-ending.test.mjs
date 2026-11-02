import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const temporary = await mkdtemp(new URL('../.cauldron-ending-test-', import.meta.url));
await build({ entryPoints: ['src/world/house/furniture/DiningPanel.ts'], outfile: `${temporary}/panel.mjs`,
  bundle: true, platform: 'node', format: 'esm', loader: { '.css': 'empty' } });
const { DiningPanel } = await import(pathToFileURL(`${temporary}/panel.mjs`));
await rm(temporary, { recursive: true, force: true });

class Element extends EventTarget {
  children = []; hidden = false; attributes = {}; dataset = {}; textContent = ''; parentNode = null;
  classes = new Set(); style = { setProperty: (name, value) => { this.style[name] = value; } };
  classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
  setAttribute(name, value) { this.attributes[name] = value; }
  appendChild(node) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); }
  insertBefore(node, before) { if (node.parentNode) node.remove(); node.parentNode = this; this.children.splice(this.children.indexOf(before), 0, node); }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  focus() { document.activeElement = this; }
  get isConnected() { return this === document.body || Boolean(this.parentNode?.isConnected); }
  remove() { this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  click() { this.focus(); this.dispatchEvent(new Event('click')); }
}
function fixture(t) {
  const previous = { document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  globalThis.HTMLElement = Element;
  globalThis.document = { body: new Element(), activeElement: null, createElement: () => new Element() };
  const trigger = new Element(); document.body.appendChild(trigger); trigger.focus();
  const events = [];
  const panel = new DiningPanel({ onSelection: () => events.push('selection'), onBrew: potion => events.push(potion),
    onClose: () => { panel.close(); events.push('close'); }, onContact: () => events.push('contact') });
  t.after(() => { panel.destroy(); Object.assign(globalThis, previous); });
  return { panel, events, trigger };
}

test('the optional ending advances one request per action and finishes with real project, CV and contact routes', async t => {
  const { panel, events, trigger } = fixture(t);
  panel.open('alchemy');
  assert.equal(panel.title.textContent, 'Just a landing page.');
  assert.equal(panel.endingActions.hidden, true);
  for (const expected of ['With accounts and payments.', 'And a tiny admin dashboard.', 'Can it work offline, too?', 'Congratulations. You have summoned a platform.']) {
    panel.brewButton.click(); assert.equal(panel.title.textContent, expected);
  }
  assert.equal(events.filter(event => typeof event === 'object').length, 5);
  assert.equal(panel.endingActions.hidden, false);
  const links = panel.endingActions.children.filter(child => child.href);
  assert.equal(links[0].href, 'https://sudoku-mern.netlify.app'); assert.match(links[0].textContent, /Sudoku/);
  assert.ok((await stat(new URL(`../public${links[1].href}`, import.meta.url))).size > 0);
  for (const link of links) { assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer'); }
  panel.contact.click(); assert.deepEqual(events.slice(-2), ['close', 'contact']);
  assert.equal(panel.root.hidden, true); assert.equal(document.activeElement, trigger);
});

test('keyboard, back, replay, early exit and bookshelf reopening preserve the correct state', t => {
  const { panel, events } = fixture(t);
  panel.open('alchemy');
  const key = (code, repeat = false) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code, repeat });
    panel.root.dispatchEvent(event); return event;
  };
  assert.equal(key('KeyE').defaultPrevented, true); assert.equal(panel.index, 1);
  key('KeyE', true); assert.equal(panel.index, 1);
  panel.selectRelative(-1); panel.selectRelative(-1); assert.equal(panel.index, 0);
  for (let i = 0; i < 5; i++) panel.selectRelative(1);
  assert.equal(panel.index, 4); panel.brew(); assert.equal(panel.index, 0);
  assert.equal(panel.endingActions.hidden, true);
  key('Escape'); assert.equal(panel.root.hidden, true); assert.equal(events.includes('contact'), false);
  panel.open('bookshelf'); assert.equal(panel.art.hidden, true); assert.equal(panel.endingActions.hidden, true);
  assert.equal(panel.brewButton.hidden, true);
  panel.selectRelative(-1); assert.equal(panel.title.textContent, "A Traveler's Guide");
  panel.close(); panel.open('alchemy'); assert.equal(panel.index, 0);
});
