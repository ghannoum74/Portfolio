import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

const temporary = await mkdtemp(new URL('../.time-ui-test-', import.meta.url));
await build({ stdin: { contents: `export {TimeOfDay} from './src/ui/TimeOfDay/TimeOfDay'; export {DayNightCycle} from './src/world/environment/DayNightCycle';`,
  resolveDir: process.cwd(), loader: 'ts' }, outfile: `${temporary}/ui.mjs`, bundle: true, platform: 'node', format: 'esm', packages: 'external',
  loader: { '.html': 'text', '.css': 'empty' } });
const {TimeOfDay, DayNightCycle} = await import(pathToFileURL(`${temporary}/ui.mjs`));
await rm(temporary, {recursive: true, force: true});

class Element {
  hidden = false; attributes = {}; events = {}; children = []; dataset = {}; value = ''; textContent = '';
  setAttribute(key, value) { this.attributes[key] = value; }
  appendChild(child) { this.children.push(child); }
  contains(child) { return child === this || this.children.some(node => node.contains(child)); }
  addEventListener(name, action) { this.events[name] = action; }
  removeEventListener(name, action) { if (this.events[name] === action) delete this.events[name]; }
  focus() { document.activeElement = this; }
  blur() { document.activeElement = null; }
  remove() { this.removed = true; }
  set innerHTML(html) {
    this.targets = new Map([...html.matchAll(/data-time-(toggle|panel|current|output|slider|local)(?=[\s>])/g)]
      .map(match => [`[${match[0]}]`, new Element()]));
    this.presets = [...html.matchAll(/data-time-hour="(\d+)"[^>]*>.*?<\/svg>([^<]+)/g)].map(match => {
      const button = new Element(); button.dataset.timeHour = match[1]; button.textContent = match[2]; return button;
    });
    this.children.push(...this.targets.values(), ...this.presets);
    this.targets.get('[data-time-panel]').hidden = true;
  }
  querySelector(selector) { return this.targets.get(selector); }
  querySelectorAll() { return this.presets; }
}

function setup(t) {
  const previous = globalThis.document;
  const document = new Element(); document.createElement = () => new Element();
  globalThis.document = document;
  t.after(() => { globalThis.document = previous; });
  const scene = new THREE.Scene(), sun = new THREE.DirectionalLight(), ambient = new THREE.AmbientLight();
  const clock = new DayNightCycle(scene, new THREE.Group(), sun, ambient);
  const panel = new TimeOfDay(document, {
    getTimeOfDay: () => clock.getTimeOfDay(), isUsingRealTime: () => clock.isUsingRealTime(),
    setTimeOfDay: hour => clock.setTimeOverride(hour),
  });
  const root = document.children[0], find = name => root.querySelector(`[data-time-${name}]`);
  return {document, scene, clock, panel, root, find, sun};
}

test('presets and slider override the real lighting, while local time restores the clock', t => {
  const f = setup(t);
  assert.equal(f.root.hidden, true);
  assert.equal(f.clock.isUsingRealTime(), true);
  f.panel.setVisible(true);
  assert.equal(f.root.hidden, false);
  f.find('toggle').events.click();
  assert.equal(f.find('panel').hidden, false);
  const day = f.root.presets.find(button => button.dataset.timeHour === '12');
  day.events.click();
  const daylight = f.sun.intensity;
  assert.equal(f.clock.getTimeOfDay(), 12);
  assert.equal(f.find('output').textContent, '12:00 PM');
  assert.equal(day.attributes['aria-pressed'], 'true');
  const night = f.root.presets.find(button => button.dataset.timeHour === '23');
  night.events.click();
  assert.ok(f.sun.intensity < daylight, 'the preset must change rendered lighting, not just its label');
  assert.equal(day.attributes['aria-pressed'], 'false');
  assert.equal(f.find('local').attributes['aria-pressed'], 'false');
  f.find('slider').value = '6.5'; f.find('slider').events.input();
  assert.equal(f.clock.getTimeOfDay(), 6.5);
  assert.equal(f.find('slider').attributes['aria-valuetext'], '6:30 AM');
  f.find('local').events.click();
  assert.equal(f.clock.isUsingRealTime(), true);
  assert.match(f.find('current').textContent, /^Local/);
});

test('focused controls contain game shortcuts; Escape, outside clicks and hiding dismiss the popover', t => {
  const f = setup(t); f.panel.setVisible(true); f.find('toggle').events.click();
  let stopped = 0, prevented = 0;
  for (const key of [' ', 'Enter', 'e', 'w']) f.root.events.keydown({key, stopPropagation: () => stopped++, preventDefault: () => prevented++});
  assert.equal(stopped, 4); assert.equal(prevented, 0, 'native button activation and range keys keep working');
  f.root.events.keydown({key: 'Escape', stopPropagation() {}, preventDefault: () => prevented++});
  assert.equal(f.find('panel').hidden, true);
  assert.equal(f.document.activeElement, f.find('toggle'));
  f.find('toggle').events.click();
  f.document.events.pointerdown({target: new Element()});
  assert.equal(f.find('panel').hidden, true);
  f.find('toggle').events.click(); f.panel.setVisible(false);
  assert.equal(f.find('panel').hidden, true); assert.equal(f.root.hidden, true);
  assert.equal(f.document.activeElement, null);
  f.panel.destroy(); assert.equal(f.document.events.pointerdown, undefined);
});
