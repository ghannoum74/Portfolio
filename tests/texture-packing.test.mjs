import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeLosslessPNG, packGLBTextures, packTextureFile, readTextureGLB } from '../scripts/pack-lossless-textures.mjs';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';
import { optimizeAssets } from '../scripts/optimize-assets.mjs';

const align = n => (n + 3) & ~3;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

async function png() {
  // Include partially transparent pixels and nonzero color channels.
  const rgba = Buffer.from(Array.from({ length: 32 * 16 }, (_, i) => [47, 97, 183, i % 2 ? 128 : 255]).flat());
  return sharp(rgba, { raw: { width: 32, height: 16, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
}

function glb(json, binary) {
  const data = Buffer.from(JSON.stringify(json)), encoded = Buffer.concat([data, Buffer.alloc(align(data.length) - data.length, 0x20)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + encoded.length + binary.length, 8);
  header.writeUInt32LE(encoded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, encoded, binHeader, binary]);
}

async function fixture(compressed = false) {
  await MeshoptEncoder.ready;
  const image = await png(), positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const raw = Buffer.from(positions.buffer);
  const geometry = compressed ? Buffer.from(MeshoptEncoder.encodeGltfBuffer(raw, 3, 12, 'ATTRIBUTES')) : raw;
  const start = align(image.length);
  const binary = Buffer.concat([image, Buffer.alloc(start - image.length), geometry, Buffer.alloc(align(geometry.length) - geometry.length)]);
  const view = { buffer: compressed ? 1 : 0, byteOffset: compressed ? 0 : start, byteLength: raw.length, target: 34962 };
  if (compressed) {
    view.byteStride = 12;
    view.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: start, byteLength: geometry.length, byteStride: 12, count: 3, mode: 'ATTRIBUTES' } };
  }
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'KEEP_GAMEPLAY_NAME', mesh: 0, translation: [0.000000001, 2, 3], extras: { gameplay: true } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    accessors: [{ bufferView: 1, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    materials: [{ name: 'KEEP_MATERIAL', doubleSided: true, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: 0.8 } }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }],
    textures: [{ source: 0, sampler: 0 }], images: [{ name: 'KEEP_IMAGE', bufferView: 0, mimeType: 'image/png' }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: image.length }, view],
  };
  if (compressed) {
    json.buffers.push({ byteLength: raw.length, extensions: { EXT_meshopt_compression: { fallback: true } } });
    json.extensionsUsed = ['EXT_meshopt_compression']; json.extensionsRequired = ['EXT_meshopt_compression'];
  }
  return { bytes: glb(json, binary), json, binary, positions, geometry };
}

test('lossless image packing retains every RGBA pixel and full dimensions', async () => {
  const source = await png(), packed = await encodeLosslessPNG(source);
  assert.ok(packed.bytes.length < source.length);
  assert.equal(packed.report.width, 32); assert.equal(packed.report.height, 16);
  const expected = await sharp(source).ensureAlpha().raw().toBuffer();
  assert.equal(packed.report.rgbaSha256, sha256(expected));
  assert.ok(expected.equals(await sharp(packed.bytes).ensureAlpha().raw().toBuffer()));
});

test('packing relocates raw and Meshopt ranges while preserving materials, sampling, hierarchy and runtime geometry', async () => {
  const temporary = await mkdtemp(new URL('../.perf-test-textures-', import.meta.url));
  try {
    for (const compressed of [false, true]) {
      const before = await fixture(compressed), result = await packGLBTextures(before.bytes);
      const { json, binary } = readTextureGLB(result.bytes);
      assert.ok(result.bytes.length < before.bytes.length);
      for (const field of ['nodes', 'meshes', 'accessors', 'materials', 'samplers', 'scenes']) assert.deepEqual(json[field], before.json[field]);
      assert.equal(json.textures[0].source, undefined);
      assert.deepEqual(json.textures[0].extensions.EXT_texture_webp, { source: 0 });
      assert.equal(json.textures[0].sampler, 0); assert.equal(json.images[0].mimeType, 'image/webp');
      assert.ok(json.extensionsRequired.includes('EXT_texture_webp'));
      const view = json.bufferViews[1], physical = compressed ? view.extensions.EXT_meshopt_compression : view;
      assert.ok(binary.subarray(physical.byteOffset, physical.byteOffset + physical.byteLength).equals(before.geometry));
      if (compressed) assert.equal(view.byteOffset, 0); // Virtual fallback remains untouched.
      const path = join(temporary, `fixture-${compressed}.glb`);
      await writeFile(path, result.bytes);
      const loaded = await readGeometryGLB(path), mesh = loaded.scene.getObjectByName('KEEP_GAMEPLAY_NAME');
      assert.deepEqual([...mesh.geometry.attributes.position.array], [...before.positions]);
      assert.equal(mesh.position.x, 0.000000001);
      assert.ok((await packGLBTextures(result.bytes)).bytes.equals(result.bytes));
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('unknown extensions and image/geometry overlap fail without silently moving referenced data', async () => {
  const before = await fixture();
  const unknown = structuredClone(before.json); unknown.extensionsUsed = ['UNKNOWN_buffer_extension'];
  await assert.rejects(packGLBTextures(glb(unknown, before.binary)), /Unsupported extension/);
  const overlap = structuredClone(before.json); overlap.bufferViews[1].byteOffset = 0;
  await assert.rejects(packGLBTextures(glb(overlap, before.binary)), /overlaps geometry/);
});

test('the Blender export pipeline combines Meshopt and verified lossless textures without changing source files', async () => {
  const temporary = await mkdtemp(new URL('../.perf-test-textures-', import.meta.url));
  try {
    const source = join(temporary, 'source'), output = join(temporary, 'output');
    await mkdir(source);
    const input = await fixture();
    const path = join(source, 'world.glb'); await writeFile(path, input.bytes);
    const report = await optimizeAssets(source, output, { recursive: true, losslessTextures: true });
    assert.equal(report.length, 1); assert.equal(report[0].verified, true);
    assert.equal(report[0].texturePacking.images.length, 1);
    assert.equal(report[0].texturePacking.images[0].exactPixels, true);
    const result = readTextureGLB(await readFile(join(output, 'world.glb')));
    assert.equal(result.json.images[0].mimeType, 'image/webp');
    assert.ok(result.json.extensionsRequired.includes('EXT_meshopt_compression'));
    assert.ok((await readFile(path)).equals(input.bytes));
    const loaded = await readGeometryGLB(join(output, 'world.glb'));
    assert.deepEqual([...loaded.scene.getObjectByName('KEEP_GAMEPLAY_NAME').geometry.attributes.position.array], [...input.positions]);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('pixel or dimension changes reject output and leave an existing asset and source intact', async () => {
  const temporary = await mkdtemp(new URL('../.perf-test-textures-', import.meta.url));
  const source = `${temporary}/source.png`, output = `${temporary}/output.webp`;
  const input = await png(), sentinel = Buffer.from('existing asset');
  try {
    await writeFile(source, input); await writeFile(output, sentinel);
    const changed = () => sharp({ create: { width: 32, height: 16, channels: 4, background: '#ffffff' } }).webp({ lossless: true }).toBuffer();
    await assert.rejects(packTextureFile(source, output, { encode: changed }), /RGBA pixels changed/);
    assert.ok((await readFile(output)).equals(sentinel)); assert.ok((await readFile(source)).equals(input));
    const resized = () => sharp(input).resize(16, 16).webp({ lossless: true }).toBuffer();
    await assert.rejects(encodeLosslessPNG(input, resized), /width changed/);
    await assert.rejects(packTextureFile(source, source), /separate/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('shipped packed assets match their recorded bytes, dimensions and source RGBA fingerprints', async () => {
  const report = JSON.parse(await readFile(new URL('../docs/lossless-texture-packing-review.json', import.meta.url)));
  for (const asset of report.assets) {
    const bytes = await readFile(new URL(`../${asset.path}`, import.meta.url));
    assert.equal(bytes.length, asset.optimizedBytes); assert.equal(gitSha(bytes), asset.outputGitSha);
    const model = asset.path.endsWith('.glb') ? readTextureGLB(bytes) : null;
    for (const image of asset.images) {
      const view = model?.json.bufferViews[model.json.images[image.index].bufferView];
      const data = model ? model.binary.subarray(view.byteOffset, view.byteOffset + view.byteLength) : bytes;
      const decoded = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(decoded.info.width, image.width); assert.equal(decoded.info.height, image.height);
      assert.equal(sha256(decoded.data), image.rgbaSha256);
    }
  }
});
