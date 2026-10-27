import { build } from 'esbuild';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { readGeometryGLB } from './read-geometry-glb.mjs';

// Only an optional index sidecar is written. Never rewrite the source GLB.
const project = fileURLToPath(new URL('..', import.meta.url));
const exterior = process.argv.includes('--exterior');
const args = process.argv.slice(2).filter(arg => arg !== '--exterior');
const input = resolve(args[0] ?? `${project}/public/assets/models/environment/${exterior ? "world" : "house"}.glb`);
const output = resolve(args[1] ?? `${project}/public/assets/models/environment/${exterior ? "exterior" : "house-stone"}-lods.json`);
assert.notEqual(input, output);
const temporary = await mkdtemp(`${project}/.perf-test-lod-`);
let helpers;
try {
  await build({ entryPoints: [`${project}/src/world/house/HouseStoneLod.ts`],
    outfile: `${temporary}/helpers.mjs`, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  helpers = await import(pathToFileURL(`${temporary}/helpers.mjs`));
} finally { await rm(temporary, { recursive: true, force: true }); }
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready, MeshoptDecoder.ready]);
const gltf = await readGeometryGLB(input);
const result = { version: 1, meshes: [] }, report = [];
for (const name of exterior ? helpers.EXTERIOR_LOD_NAMES : helpers.HOUSE_STONE_NAMES) {
  const mesh = gltf.scene.getObjectByName(name), geometry = mesh?.geometry;
  assert.ok(geometry?.index && !geometry.groups.length && !Object.keys(geometry.morphAttributes).length, name);
  const streams = helpers.geometryStreams(geometry);
  const positions = streams.find(s => s.name === 'position').values;
  const attributes = streams.filter(s => s.name !== 'position');
  const stride = attributes.reduce((sum, s) => sum + s.size, 0);
  const packed = new Float32Array(positions.length / 3 * stride), weights = [];
  let offset = 0;
  for (const attribute of attributes) {
    weights.push(...Array(attribute.size).fill(attribute.name.startsWith('uv') ? 0.1 : 1));
    for (let v = 0; v < positions.length / 3; v++) {
      packed.set(attribute.values.subarray(v * attribute.size, (v + 1) * attribute.size), v * stride + offset);
    }
    offset += attribute.size;
  }
  // Weld only identical decoded attributes, preserving normals, UV seams
  // and BOTH color streams. Indices still address the original vertex buffers.
  const unique = new Map(), remap = new Uint32Array(positions.length / 3);
  for (let v = 0; v < remap.length; v++) {
    const key = [...positions.subarray(v * 3, v * 3 + 3), ...packed.subarray(v * stride, (v + 1) * stride)].join(',');
    if (!unique.has(key)) unique.set(key, v);
    remap[v] = unique.get(key);
  }
  const original = Uint32Array.from(geometry.index.array);
  const welded = Uint32Array.from(original, index => remap[index]);
  const entry = { name, sourceHash: await helpers.geometryHash(geometry), sourceTriangles: original.length / 3, levels: [] };
  for (const [ratio, maxError] of [[0.6, 0.00025], [0.4, 0.0005]]) {
    const [indices, relativeError] = MeshoptSimplifier.simplifyWithAttributes(welded, positions, 3,
      packed, stride, weights, null, Math.floor(original.length * ratio / 3) * 3, maxError, ['LockBorder']);
    assert.ok(indices.length < (entry.levels.at(-1)?.triangles * 3 || original.length) * 0.9, 'Insufficient additional reduction');
    const encoded = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(indices.buffer), indices.length, 4);
    const decoded = new Uint32Array(indices.length);
    MeshoptDecoder.decodeIndexBuffer(new Uint8Array(decoded.buffer), decoded.length, 4, encoded);
    // The codec may rotate triangle corners, but must preserve face winding.
    for (let i = 0; i < indices.length; i += 3) {
      const rotation = [0, 1, 2].find(r => [0, 1, 2].every(j => decoded[i + j] === indices[i + (j + r) % 3]));
      assert.notEqual(rotation, undefined, 'Codec changed a triangle');
    }
    assert.ok(decoded.every(index => index < positions.length / 3));
    const error = relativeError * MeshoptSimplifier.getScale(positions, 3);
    entry.levels.push({ triangles: indices.length / 3, error,
      indices: Buffer.from(encoded).toString('base64'), hash: await helpers.sha256(new Uint8Array(decoded.buffer)) });
    report.push({ name, originalTriangles: entry.sourceTriangles, triangles: indices.length / 3,
      relativeError, localError: error, compressedIndexBytes: encoded.length });
  }
  result.meshes.push(entry);
}
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, JSON.stringify(result) + '\n');
console.table(report);
console.log(`Optional index sidecar: ${Buffer.byteLength(JSON.stringify(result) + '\n')} bytes`);
