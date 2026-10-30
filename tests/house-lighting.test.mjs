import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

const temporary = await mkdtemp(new URL('../.house-light-test-', import.meta.url));
const bundle = temporary + '/lighting.mjs';
await build({ entryPoints: ['src/world/house/HouseLighting.ts'], bundle: true, packages: 'external',
  platform: 'node', format: 'esm', outfile: bundle });
const { createHouseLighting } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

test('current house light originates in its hanging chandelier, independent of unrelated scene bounds', async () => {
  const { scene: house } = await readGeometryGLB('public/assets/models/environment/house.glb');
  house.position.y = -30;
  house.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(house.getObjectByName('Chandelier'));
  const rig = createHouseLighting(house, true), light = rig.getObjectByName('HOUSE_LIGHT_CHANDELIER');
  assert.ok(light instanceof THREE.SpotLight);
  assert.ok(bounds.containsPoint(light.position));
  assert.ok(light.position.y < -26 && light.position.y > -28, 'Apply the interior offset exactly once');
  assert.ok(light.target.position.y < light.position.y);
  assert.equal(light.castShadow, true);
  assert.equal(rig.children.filter(o => o.castShadow).length, 1);
  assert.ok(!rig.children.some(o => o instanceof THREE.DirectionalLight));
  const remoteMesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100));
  remoteMesh.position.set(1000, 1000, 1000); house.add(remoteMesh);
  assert.ok(createHouseLighting(house, false).getObjectByName(light.name).position.equals(light.position));
});

test('Blender fixture transforms and properties control the runtime and imported preview lights cannot double illumination', () => {
  const house = new THREE.Group(); house.position.set(3, -30, -4);
  const parent = new THREE.Group(); parent.position.set(1, 5, 2); parent.scale.setScalar(1.8); house.add(parent);
  const marker = new THREE.SpotLight(); marker.name = 'LIGHT_HOUSE_CHANDELIER';
  marker.position.set(.2, -1, .4);
  marker.userData = { portfolioLightColor: '#ffd3a0', portfolioLightIntensity: 85, portfolioLightRange: 23, portfolioLightSpill: 6 };
  parent.add(marker);
  const oldSun = new THREE.DirectionalLight(); house.add(oldSun);
  const rig = createHouseLighting(house, false), main = rig.getObjectByName('HOUSE_LIGHT_CHANDELIER');
  assert.ok(main.position.distanceTo(marker.getWorldPosition(new THREE.Vector3())) < 1e-12);
  assert.equal(main.intensity, 85 * .08); assert.equal(main.distance, 23); assert.equal(main.castShadow, false);
  assert.equal(rig.getObjectByName('HOUSE_LIGHT_CHANDELIER_SPILL').intensity, 6);
  assert.equal(marker.visible, false); assert.equal(oldSun.visible, false);
  assert.equal(rig.children.filter(o => o.castShadow).length, 0);
});

test('invalid fixture settings retain finite defaults and a missing fixture does not create an arbitrary room light', () => {
  const house = new THREE.Group(), marker = new THREE.Object3D(); marker.name = 'LIGHT_HOUSE_CHANDELIER';
  marker.userData = { portfolioLightIntensity: NaN, portfolioLightRange: -3, portfolioLightSpill: Infinity, portfolioLightColor: 'invalid' };
  house.add(marker);
  const rig = createHouseLighting(house, false);
  assert.equal(rig.getObjectByName('HOUSE_LIGHT_CHANDELIER').intensity, 8);
  assert.equal(rig.getObjectByName('HOUSE_LIGHT_CHANDELIER').distance, 26);
  assert.equal(rig.getObjectByName('HOUSE_LIGHT_CHANDELIER_SPILL').intensity, 8);
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(createHouseLighting(new THREE.Group(), true).children.length, 2); }
  finally { console.warn = warn; }
});

test('existing 100 cd exports get broad room illumination and a much weaker fully feathered center', () => {
  const house = new THREE.Group(), marker = new THREE.Object3D(); marker.name = 'LIGHT_HOUSE_CHANDELIER';
  marker.position.set(3.37, -27.61, -2.49);
  marker.userData = { portfolioLightIntensity: 100, portfolioLightSpill: 8, portfolioLightRange: 26 };
  house.add(marker);
  const rig = createHouseLighting(house, true);
  const down = rig.getObjectByName('HOUSE_LIGHT_CHANDELIER'), room = rig.getObjectByName('HOUSE_LIGHT_CHANDELIER_SPILL');
  assert.ok(room instanceof THREE.PointLight, 'Illuminate sideways and upwards, not only inside a cone');
  assert.ok(room.position.equals(down.position), 'All direct light still comes from the chandelier');
  assert.equal(room.distance, 26); assert.equal(room.decay, 1);
  assert.equal(down.penumbra, 1); assert.ok(down.angle > 1.4);
  assert.ok(down.intensity <= 10, 'An authored 100 cd marker must not restore the overexposed cone');
  // Match the Three.js distance attenuation used by the production materials.
  const attenuate = (power, distance, range, decay) => power / Math.max(distance ** decay, .01) * Math.max(1 - (distance / range) ** 4, 0) ** 2;
  const near = 3, far = 10;
  const oldNear = attenuate(100, near, 26, 2) + attenuate(8, near, 26 * .55, 2);
  const newNear = attenuate(down.intensity, near, down.distance, down.decay) + attenuate(room.intensity, near, room.distance, room.decay);
  assert.ok(newNear < oldNear * .35, 'Reduce the direct-light peak beneath the lamp');
  assert.ok(attenuate(room.intensity, far, room.distance, room.decay) > attenuate(8, far, 26 * .55, 2) * 10, 'Reach the distant furniture with substantially more warm light');
  assert.ok(rig.getObjectByName('HOUSE_LIGHT_FILL').intensity > .5);
  assert.ok(rig.getObjectByName('HOUSE_LIGHT_BOUNCE').intensity > 0);
  assert.equal(rig.children.filter(o => o.castShadow).length, 1, 'Keep the single-shadow-map budget');
});
