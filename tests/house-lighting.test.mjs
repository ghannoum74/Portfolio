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
  assert.equal(main.intensity, 85); assert.equal(main.distance, 23); assert.equal(main.castShadow, false);
  assert.equal(rig.getObjectByName('HOUSE_LIGHT_CHANDELIER_SPILL').intensity, 6);
  assert.equal(marker.visible, false); assert.equal(oldSun.visible, false);
  assert.equal(rig.children.filter(o => o.castShadow).length, 0);
});

test('invalid fixture settings retain finite defaults and a missing fixture does not create an arbitrary room light', () => {
  const house = new THREE.Group(), marker = new THREE.Object3D(); marker.name = 'LIGHT_HOUSE_CHANDELIER';
  marker.userData = { portfolioLightIntensity: NaN, portfolioLightRange: -3, portfolioLightSpill: Infinity, portfolioLightColor: 'invalid' };
  house.add(marker);
  const rig = createHouseLighting(house, false);
  assert.equal(rig.getObjectByName('HOUSE_LIGHT_CHANDELIER').intensity, 100);
  assert.equal(rig.getObjectByName('HOUSE_LIGHT_CHANDELIER').distance, 26);
  assert.equal(rig.getObjectByName('HOUSE_LIGHT_CHANDELIER_SPILL').intensity, 8);
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(createHouseLighting(new THREE.Group(), true).children.length, 1); }
  finally { console.warn = warn; }
});
