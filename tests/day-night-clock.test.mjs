import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

const temporary = await mkdtemp(new URL('../.day-night-clock-test-', import.meta.url));
const bundle = `${temporary}/suite.mjs`;
await build({ stdin: {
  contents: `export { DayNightCycle } from './src/world/environment/DayNightCycle';`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { DayNightCycle } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

function clockFixture(initial, options = { timeZone: 'UTC' }) {
  const originalNow = Date.now, originalFormat = Intl.DateTimeFormat.prototype.formatToParts;
  let timestamp = initial, clockReads = 0;
  const formatted = [];
  Date.now = () => { clockReads++; return timestamp; };
  Intl.DateTimeFormat.prototype.formatToParts = function(value) {
    formatted.push(value); return originalFormat.call(this, value);
  };
  const cleanup = () => { Date.now = originalNow; Intl.DateTimeFormat.prototype.formatToParts = originalFormat; };
  try {
    const scene = new THREE.Scene(), pivot = new THREE.Group();
    const sun = new THREE.DirectionalLight(); sun.castShadow = true;
    const ambient = new THREE.AmbientLight();
    const cycle = new DayNightCycle(scene, pivot, sun, ambient, options);
    // Independent formatting/parsing oracle; does not use formatToParts or the production cache.
    const oracle = new Intl.DateTimeFormat('en-GB', { timeZone: options.timeZone,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    return { cycle, scene, pivot, sun, ambient, formatted, cleanup,
      setTime(value) { timestamp = value; }, clockReads: () => clockReads,
      expected(value = timestamp) { const [hour, minute, second] = oracle.format(value).split(':').map(Number); return hour + minute / 60 + second / 3600; },
    };
  } catch (error) { cleanup(); throw error; }
}

test('240 exterior frame reads share four second-precision formats with the lighting updates', t => {
  const base = Date.UTC(2026, 9, 27, 9, 5, 13), f = clockFixture(base);
  let requests = 1; // Includes the constructor's initial lighting sample.
  const getCurrentHour = f.cycle.getCurrentHour.bind(f.cycle);
  f.cycle.getCurrentHour = () => { requests++; return getCurrentHour(); };
  try {
    for (let frame = 0; frame < 240; frame++) {
      f.setTime(base + Math.floor(frame * 1000 / 60));
      f.cycle.update(1 / 60);
      assert.equal(f.cycle.getTimeOfDay(), f.expected());
    }
    assert.equal(requests, 245);
    assert.equal(f.formatted.length, 4);
    assert.deepEqual(f.formatted.map(value => Math.floor(value / 1000)), [0, 1, 2, 3].map(offset => base / 1000 + offset));
    t.diagnostic(JSON.stringify({ frames: 240, wallClockSeconds: 4, currentHourRequests: requests,
      previousUnconditionalFormatsDerived: requests, executedFormats: f.formatted.length }));
  } finally { f.cleanup(); }
});

test('real-time output matches Intl at second, minute, midnight and DST boundaries, including backward clock jumps', () => {
  const samples = [
    Date.UTC(2026, 9, 24, 20, 59, 59, 50), Date.UTC(2026, 9, 24, 20, 59, 59, 999),
    Date.UTC(2026, 9, 24, 21, 0, 0), Date.UTC(2026, 9, 24, 21, 0, 0, 999),
    Date.UTC(2026, 9, 26, 23, 59, 59, 999), Date.UTC(2026, 9, 27, 0, 0, 0),
    Date.UTC(2026, 10, 1, 5, 59, 59, 999), Date.UTC(2026, 10, 1, 6, 0, 0),
    Date.UTC(2026, 9, 27, 0, 0, 0), Date.UTC(2026, 9, 26, 23, 59, 59, 100),
  ];
  for (const timeZone of [undefined, 'UTC', 'Asia/Beirut', 'America/New_York']) {
    const f = clockFixture(samples[0], { timeZone });
    try {
      let previous = Math.floor(samples[0] / 1000), expectedFormats = 1;
      for (const timestamp of samples) {
        f.setTime(timestamp);
        const key = Math.floor(timestamp / 1000);
        if (key !== previous) expectedFormats++;
        previous = key;
        assert.equal(f.cycle.getTimeOfDay(), f.expected(), `${timeZone ?? 'system'} at ${timestamp}`);
        assert.equal(f.cycle.getTimeOfDay(), f.expected(), 'repeat query retains second precision');
        assert.equal(f.formatted.length, expectedFormats);
      }
    } finally { f.cleanup(); }
  }
});

test('fixed previews bypass clock reads and formatting, and clearing them applies real time immediately', () => {
  const base = Date.UTC(2026, 9, 27, 9, 0, 0), f = clockFixture(base);
  try {
    f.cycle.setTimeOverride(-2); assert.equal(f.cycle.getTimeOfDay(), 0); assert.equal(f.sun.castShadow, false);
    f.cycle.setTimeOverride(30); assert.equal(f.cycle.getTimeOfDay(), 23.99);
    f.cycle.setTimeOverride(6.5);
    const reads = f.clockReads(), formats = f.formatted.length;
    for (let i = 0; i < 120; i++) { f.setTime(base + i * 1000); f.cycle.update(1 / 30); assert.equal(f.cycle.getTimeOfDay(), 6.5); }
    assert.equal(f.clockReads(), reads); assert.equal(f.formatted.length, formats); assert.equal(f.cycle.isUsingRealTime(), false);
    f.setTime(base); f.cycle.setTimeOverride(null);
    assert.equal(f.cycle.isUsingRealTime(), true); assert.equal(f.cycle.getTimeOfDay(), f.expected());
    assert.equal(f.formatted.length, formats, 'same-second return can reuse the exact earlier value');
    f.cycle.setTimeOverride(0); f.setTime(base + 3_600_000); f.cycle.setTimeOverride(null);
    assert.equal(f.cycle.getTimeOfDay(), 10); assert.equal(f.formatted.length, formats + 1); assert.equal(f.sun.castShadow, true);
  } finally { f.cleanup(); }
});

test('time reads refresh after paused updates while lighting keeps its configured update interval', () => {
  const midnight = Date.UTC(2026, 9, 27, 0, 0, 0), f = clockFixture(midnight, { timeZone: 'UTC', updateInterval: 60 });
  const lighting = () => ({ position: f.pivot.position.toArray(), sun: f.sun.intensity, shadows: f.sun.castShadow,
    ambient: f.ambient.intensity, sky: f.scene.background.toArray(), fog: f.scene.fog.color.toArray() });
  try {
    f.cycle.update(0); const night = lighting(); assert.equal(night.sun, 0); assert.equal(night.shadows, false);
    f.setTime(midnight + 12 * 3_600_000); assert.equal(f.cycle.getTimeOfDay(), 12);
    assert.deepEqual(lighting(), night, 'reading time does not advance lighting');
    f.cycle.update(59.999); assert.deepEqual(lighting(), night);
    f.cycle.update(.0011); assert.equal(f.sun.intensity, 3); assert.equal(f.sun.castShadow, true); assert.equal(f.ambient.intensity, 1.5);
    const noon = lighting();
    f.setTime(midnight); assert.equal(f.cycle.getTimeOfDay(), 0); assert.deepEqual(lighting(), noon, 'backward clock refresh does not bypass the light cadence');
    f.cycle.update(60); assert.deepEqual(lighting(), night);
  } finally { f.cleanup(); }
});
