import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';

const temporary = await mkdtemp(new URL('../.highlight-activation-test-', import.meta.url));
await build({ entryPoints: ['src/core/InteractionHighlight.ts'], outfile: `${temporary}/highlight.mjs`,
  bundle: true, packages: 'external', platform: 'node', format: 'esm' });
const { InteractionHighlight } = await import(pathToFileURL(`${temporary}/highlight.mjs`));
await rm(temporary, { recursive: true, force: true });

// WebGLRenderer.projectObject sorts meshes this way even when frustumCulled is
// false. No WebGL context is needed to exercise the expensive bounds request.
function sortingCenter(mesh) {
  if (mesh.boundingSphere === null) mesh.computeBoundingSphere();
  return mesh.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
}

test('sorting animated borders never scans their posed vertices, including repeat activations', async t => {
  for (const name of ['frequenc', 'MTC', '42', 'bePro', 'interphase', 'prodigy', 'se-factory']) {
    const { scene: model } = await readGeometryGLB(`public/assets/models/player/${name}.glb`);
    const scene = new THREE.Scene(); scene.add(model); scene.updateMatrixWorld(true);
    const originals = [];
    model.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) originals.push({ mesh: object,
        material: object.material, sphere: object.boundingSphere, geometrySphere: object.geometry.boundingSphere.clone() });
    });
    assert.ok(originals.length > 0, name);
    const highlight = new InteractionHighlight();
    try {
      for (let activation = 0; activation < 4; activation++) {
        highlight.setTarget(model);
        const proxies = scene.getObjectByName('INTERACTION_BORDER').children;
        assert.equal(proxies.length, originals.length * 8, name);
        for (const proxy of proxies) {
          assert.equal(proxy.frustumCulled, false);
          // This failed before the fix: sorting invoked getVertexPosition for
          // every vertex of every newly-created silhouette copy.
          proxy.getVertexPosition = () => { throw new Error(`${name}: sorting must not CPU-skin outline vertices`); };
          assert.ok(sortingCenter(proxy).toArray().every(Number.isFinite));
          const hits = []; proxy.raycast(null, hits); assert.deepEqual(hits, []);
        }
        highlight.setTarget(null);
        for (const original of originals) {
          assert.equal(original.mesh.material, original.material);
          assert.equal(original.mesh.boundingSphere, original.sphere);
          assert.deepEqual(original.mesh.geometry.boundingSphere, original.geometrySphere);
        }
      }
      t.diagnostic(`${name}: ${originals.length * 8} silhouettes × 4 activations, zero proxy vertex scans`);
    } finally { highlight.clear(); }
  }
});

test('sorting anchors are owned by the proxy and leave animated skin/morph deformation intact', () => {
  for (const bounds of ['source', 'geometry', 'none']) {
    const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry();
    const count = geometry.attributes.position.count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geometry.morphAttributes.position = [geometry.attributes.position.clone()];
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    const bone = new THREE.Bone(); mesh.add(bone); mesh.bind(new THREE.Skeleton([bone])); scene.add(mesh);
    if (bounds === 'source') mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(1, 2, 3), 4);
    if (bounds === 'geometry') geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(-1, 3, 2), 5);
    const sourceSphere = mesh.boundingSphere?.clone(), geometrySphere = geometry.boundingSphere?.clone();
    const highlight = new InteractionHighlight(); highlight.setTarget(mesh);
    const proxies = scene.getObjectByName('INTERACTION_BORDER').children;
    assert.equal(proxies.length, 8);
    for (let frame = 0; frame < 3; frame++) {
      bone.position.y = frame * .3; mesh.position.x = frame; mesh.morphTargetInfluences[0] = frame * .1;
      scene.updateMatrixWorld(true); highlight.update();
      for (const proxy of proxies) {
        proxy.onBeforeRender();
        assert.deepEqual(proxy.getVertexPosition(0, new THREE.Vector3()), mesh.getVertexPosition(0, new THREE.Vector3()));
        assert.deepEqual(proxy.matrixWorld, mesh.matrixWorld);
        assert.equal(proxy.skeleton, mesh.skeleton);
        assert.notEqual(proxy.boundingSphere, mesh.boundingSphere);
        assert.notEqual(proxy.boundingSphere, geometry.boundingSphere);
        assert.ok(sortingCenter(proxy).toArray().every(Number.isFinite));
      }
    }
    // Bounds exist solely for sorting: no proxy operation may edit source bounds.
    proxies[0].boundingSphere.center.set(50, 60, 70);
    assert.deepEqual(mesh.boundingSphere, sourceSphere ?? null);
    assert.deepEqual(geometry.boundingSphere, geometrySphere ?? null);
    highlight.clear(); assert.equal(mesh.skeleton.bones[0], bone);
  }
});
