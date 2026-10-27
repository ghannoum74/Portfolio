import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
import sharp from 'sharp';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readTextureGLB } from '../scripts/pack-lossless-textures.mjs';
import { readGeometryGLB } from '../scripts/read-geometry-glb.mjs';
import { compareTexturePixels, inspectWorldColorImages, verifyKtx2, generateWorldKtx2 } from '../scripts/generate-world-ktx2.mjs';

globalThis.window = { location: { search: '' }, devicePixelRatio: 1 };
const temporary = await mkdtemp(new URL('../.ktx2-test-', import.meta.url));
let code;
try {
  const bundle = `${temporary}/suite.mjs`;
  await build({ stdin: { contents: `export { prepareKtx2WorldSource, loadKtx2World } from './src/loaders/Ktx2WorldTextures';
    export { AssetLoader } from './src/loaders/AssetLoader';
    export { getPerformanceOptions } from './src/core/PerformanceOptions';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' },
    outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  code = await import(pathToFileURL(bundle));
} finally { await rm(temporary, { recursive: true, force: true }); }
const { prepareKtx2WorldSource, loadKtx2World, AssetLoader, getPerformanceOptions } = code;
const root = new URL('../', import.meta.url);
const sourceBytes = await readFile(new URL('public/assets/models/environment/world.glb', root));
const source = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength);
const manifest = JSON.parse(await readFile(new URL('public/assets/models/environment/world-ktx2.json', root)));
const review = JSON.parse(await readFile(new URL('docs/ktx2-texture-review.json', root)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('KTX2 comparison is explicit diagnostics-only and preserves the normal quality switches', () => {
  for (const search of ['', '?ktx2=1', '?perfdiag=1', '?perfdiag=1&ktx2=0', '?perfdiag=1&ktx2=true']) {
    assert.equal(getPerformanceOptions(search, 1.5).ktx2Textures, false);
  }
  const before = getPerformanceOptions('?perfdiag=1', 1.5), after = getPerformanceOptions('?perfdiag=1&ktx2=1', 1.5);
  assert.equal(after.ktx2Textures, true); after.ktx2Textures = false;
  assert.deepEqual(after, before);
});

test('real world patch preserves BIN bytes, hierarchy, materials, sampling, colliders and decoded geometry', async () => {
  const before = readTextureGLB(sourceBytes), result = await prepareKtx2WorldSource(source, manifest);
  const after = readTextureGLB(Buffer.from(result));
  assert.ok(after.binary.equals(before.binary));
  for (const key of Object.keys(before.json)) {
    if (!['images', 'textures', 'extensionsUsed', 'extensionsRequired'].includes(key)) assert.deepEqual(after.json[key], before.json[key], key);
  }
  assert.ok(after.json.extensionsRequired.includes('KHR_texture_basisu'));
  assert.ok(!after.json.extensionsRequired.includes('EXT_texture_webp'));
  for (const [i, texture] of after.json.textures.entries()) {
    assert.equal(texture.sampler, before.json.textures[i].sampler);
    assert.deepEqual(texture.extensions.KHR_texture_basisu, { source: i });
    assert.equal(texture.extensions.EXT_texture_webp, undefined);
    assert.equal(after.json.images[i].uri, manifest.textures[i].uri);
    assert.equal(after.json.images[i].bufferView, undefined);
  }
  const temp = await mkdtemp(new URL('../.ktx2-test-', import.meta.url));
  try {
    const path = `${temp}/world.glb`; await writeFile(path, Buffer.from(result));
    const [a, b] = await Promise.all([readGeometryGLB(new URL('public/assets/models/environment/world.glb', root)), readGeometryGLB(path)]);
    const fingerprint = scene => {
      const records = [];
      scene.traverse(node => {
        const data = { name: node.name, position: node.position.toArray(), rotation: node.quaternion.toArray(), scale: node.scale.toArray(), extras: node.userData };
        if (node instanceof THREE.Mesh) {
          data.attributes = Object.fromEntries(Object.entries(node.geometry.attributes).map(([name, attribute]) =>
            [name, { itemSize: attribute.itemSize, normalized: attribute.normalized,
              bytes: hash(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)) }]));
          const index = node.geometry.index;
          data.index = index ? hash(Buffer.from(index.array.buffer, index.array.byteOffset, index.array.byteLength)) : null;
        }
        records.push(data);
      });
      return records;
    };
    assert.deepEqual(fingerprint(b.scene), fingerprint(a.scene));
  } finally { await rm(temp, { recursive: true, force: true }); }
  assert.equal(hash(sourceBytes), manifest.sourceSha256);
});

test('stale source exports and malformed or external replacement references reject before compressed parsing', async () => {
  const stale = source.slice(0); new Uint8Array(stale)[100] ^= 1;
  await assert.rejects(prepareKtx2WorldSource(stale, manifest), /stale/);
  const invalid = [null, {}, { ...manifest, schemaVersion: 2 }, { ...manifest, textures: [] }];
  for (const change of [
    texture => { texture.uri = 'https://example.com/texture.ktx2'; },
    texture => { texture.uri = '/assets/models/environment/ktx2/../../texture.ktx2'; },
    texture => { texture.image = 900; },
    texture => { texture.width = 1023; },
  ]) {
    const copy = structuredClone(manifest); change(copy.textures[0]); invalid.push(copy);
  }
  const duplicate = structuredClone(manifest); duplicate.textures.push(duplicate.textures[0]); invalid.push(duplicate);
  for (const value of invalid) await assert.rejects(prepareKtx2WorldSource(source, value), /Invalid/);
});

test('ordinary asset loading does not enter compression setup and reports required readiness only after success', async () => {
  const saved = { load: GLTFLoader.prototype.loadAsync, file: THREE.FileLoader.prototype.loadAsync };
  const result = { scene: new THREE.Group() }, ready = [];
  let loads = 0;
  try {
    THREE.FileLoader.prototype.loadAsync = () => assert.fail('ordinary GLTF loading must retain its current path');
    GLTFLoader.prototype.loadAsync = async url => { loads++; assert.equal(url, '/world.glb'); return result; };
    const loader = new AssetLoader(new THREE.LoadingManager(), url => ready.push(url));
    assert.equal(await loader.loadGLB('/world.glb'), result);
    assert.equal(loads, 1); assert.deepEqual(ready, ['/world.glb']);
    GLTFLoader.prototype.loadAsync = async () => { throw new Error('required source failed'); };
    await assert.rejects(loader.loadGLB('/world.glb'), /required source failed/);
    assert.deepEqual(ready, ['/world.glb']);
  } finally { GLTFLoader.prototype.loadAsync = saved.load; THREE.FileLoader.prototype.loadAsync = saved.file; }
});

test('optional compression setup failure still completes required startup with the original world', async () => {
  const saved = { parse: GLTFLoader.prototype.parseAsync, file: THREE.FileLoader.prototype.loadAsync, warn: console.warn };
  const fallback = { scene: new THREE.Group() }, ready = [], states = [], failures = [];
  const manager = new THREE.LoadingManager(); manager.onError = url => failures.push(url);
  let reads = 0, parses = 0;
  try {
    console.warn = () => {};
    THREE.FileLoader.prototype.loadAsync = async url => { reads++; assert.equal(url, '/world.glb'); return source; };
    GLTFLoader.prototype.parseAsync = async (bytes, path) => { parses++; assert.equal(bytes, source); assert.equal(path, '/'); return fallback; };
    const loader = new AssetLoader(manager, url => ready.push(url));
    const result = await loader.loadGLB('/world.glb', { manifest: '/manifest.json',
      renderer: { extensions: { has: () => false } }, onState: state => states.push(state) });
    assert.equal(result, fallback); assert.equal(reads, 1); assert.equal(parses, 1);
    assert.deepEqual(ready, ['/world.glb']); assert.deepEqual(failures, []);
    assert.equal(states.length, 1); assert.equal(states[0].mode, 'original'); assert.equal(states[0].requested, true);
  } finally { GLTFLoader.prototype.parseAsync = saved.parse; THREE.FileLoader.prototype.loadAsync = saved.file; console.warn = saved.warn; }
});

function candidate(format = THREE.RGBA_BPTC_Format, missingMip = false) {
  const scene = new THREE.Group(), disposals = { textures: 0, materials: 0, geometries: 0 };
  for (const image of manifest.textures) {
    const mipmaps = [];
    for (let size = image.width; size >= 1; size = Math.floor(size / 2)) mipmaps.push({ data: new Uint8Array(16), width: size, height: size });
    if (missingMip) mipmaps.pop();
    const texture = new THREE.CompressedTexture(mipmaps, image.width, image.height, format);
    texture.colorSpace = THREE.SRGBColorSpace; texture.addEventListener('dispose', () => disposals.textures++);
    const material = new THREE.MeshStandardMaterial({ map: texture }); material.addEventListener('dispose', () => disposals.materials++);
    const geometry = new THREE.BoxGeometry(); geometry.addEventListener('dispose', () => disposals.geometries++);
    scene.add(new THREE.Mesh(geometry, material));
  }
  return { asset: { scene, scenes: [scene] }, disposals };
}

test('successful compression reports actual BC7 or ASTC, releases workers and never parses originals twice', async () => {
  for (const format of [THREE.RGBA_BPTC_Format, THREE.RGBA_ASTC_4x4_Format]) {
    const fixture = candidate(format); let disposed = 0, reads = 0, parses = 0;
    const deps = {
      createBackend: async () => ({ ktx2: { workerConfig: { bptcSupported: true }, dispose() { disposed++; } },
        loader: { async parseAsync(bytes, path) {
          parses++; assert.equal(path, '/assets/models/environment/');
          assert.ok(readTextureGLB(Buffer.from(bytes)).json.extensionsRequired.includes('KHR_texture_basisu'));
          return fixture.asset;
        } } }),
      readManifest: async url => { reads++; assert.equal(url, '/manifest.json'); return manifest; },
    };
    const original = { parseAsync: () => assert.fail('active KTX2 mode must not parse originals') };
    const result = await loadKtx2World(source, original, '/assets/models/environment/', {}, '/manifest.json', deps);
    assert.equal(result.asset, fixture.asset);
    assert.deepEqual(result.state, { requested: true, mode: 'ktx2-uastc', reason: 'active', images: 3,
      format: format === THREE.RGBA_BPTC_Format ? 'bc7' : 'astc4x4' });
    assert.equal(disposed, 1); assert.equal(reads, 1); assert.equal(parses, 1);
    assert.deepEqual(fixture.disposals, { textures: 0, materials: 0, geometries: 0 });
  }
});

test('unsupported formats, unavailable manifests, stale exports and decode failures fall back to originals', async () => {
  const savedWarn = console.warn; console.warn = () => {};
  try {
    for (const failure of ['unsupported', 'manifest', 'stale', 'transcoder', 'format', 'mipmaps', 'setup']) {
      let disposed = 0, reads = 0, parses = 0, originals = 0;
      const bad = candidate(failure === 'format' ? THREE.RGBA_ETC2_EAC_Format : THREE.RGBA_BPTC_Format, failure === 'mipmaps');
      const fallback = { scene: new THREE.Group() };
      const original = { async parseAsync(bytes, path) { originals++; assert.equal(bytes, source); assert.equal(path, '/original/'); return fallback; } };
      const deps = {
        createBackend: async () => {
          if (failure === 'setup') throw new Error('optional module unavailable');
          return { ktx2: { workerConfig: { bptcSupported: failure !== 'unsupported' }, dispose() { disposed++; } },
            loader: { async parseAsync() { parses++; if (failure === 'transcoder') throw new Error('decode failed'); return bad.asset; } } };
        },
        readManifest: async () => {
          reads++; if (failure === 'manifest') throw new Error('optional HTTP 404');
          return failure === 'stale' ? { ...manifest, sourceSha256: '0'.repeat(64) } : manifest;
        },
      };
      const result = await loadKtx2World(source, original, '/original/', {}, '/manifest.json', deps);
      assert.equal(result.asset, fallback); assert.equal(result.state.mode, 'original'); assert.equal(result.state.images, 0);
      assert.equal(result.state.requested, true); assert.notEqual(result.state.reason, 'active');
      assert.equal(originals, 1); assert.equal(disposed, failure === 'setup' ? 0 : 1);
      if (failure === 'unsupported' || failure === 'setup') assert.equal(reads, 0);
      if (failure === 'stale') assert.equal(parses, 0);
      if (failure === 'format' || failure === 'mipmaps') assert.deepEqual(bad.disposals, { textures: 3, materials: 3, geometries: 3 });
    }
  } finally { console.warn = savedWarn; }
});

test('offline gates reject changed alpha, excessive color error and mixed color/data texture use', () => {
  const input = Buffer.from([50, 100, 150, 255]);
  assert.equal(compareTexturePixels(input, input).exactPixels, true);
  assert.throws(() => compareTexturePixels(input, Buffer.from([50, 100, 150, 128])), /alpha changed/);
  assert.throws(() => compareTexturePixels(input, Buffer.from([255, 255, 255, 255])), /PSNR/);
  const json = readTextureGLB(sourceBytes).json;
  assert.equal(inspectWorldColorImages(json).size, 3);
  const mixed = structuredClone(json); mixed.materials[0].normalTexture = { index: 0 };
  assert.throws(() => inspectWorldColorImages(mixed), /exclusively base-color/);
});

test('encoder failure preserves the source and an existing manifest and removes temporary public files', async () => {
  const temp = await mkdtemp(new URL('../.ktx2-test-', import.meta.url));
  const input = `${temp}/source.glb`, output = `${temp}/output`, manifestPath = `${temp}/manifest.json`;
  const sentinel = Buffer.from('existing manifest');
  try {
    await writeFile(input, sourceBytes); await writeFile(manifestPath, sentinel);
    await assert.rejects(generateWorldKtx2({ source: input, output, manifestPath: input }), /paths separate/);
    // A real process that cannot encode textures. No external SDK is needed for
    // this failure-path regression; the shipped artifacts were encoded separately.
    await assert.rejects(generateWorldKtx2({ source: input, output, manifestPath, ktx: process.execPath }));
    assert.ok((await readFile(input)).equals(sourceBytes)); assert.ok((await readFile(manifestPath)).equals(sentinel));
    assert.deepEqual(await readdir(output), []);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('shipped textures match the source and transcode every mip to BC7/ASTC with the runtime Basis WASM', async () => {
  assert.equal(hash(sourceBytes), review.sourceSha256); assert.equal(review.sourceSha256, manifest.sourceSha256);
  const basisPath = fileURLToPath(import.meta.resolve('three/examples/jsm/libs/basis/basis_transcoder.js'));
  const script = await readFile(basisPath, 'utf8');
  const binary = await readFile(new URL('basis_transcoder.wasm', pathToFileURL(basisPath)));
  const factory = vm.runInNewContext(`${script}\n;BASIS;`, { console, process, require: createRequire(basisPath),
    __dirname: dirname(basisPath), module: { exports: {} }, exports: {}, WebAssembly, TextDecoder, TextEncoder,
    setTimeout, clearTimeout, performance, Uint8Array, Uint32Array, ArrayBuffer });
  const basis = await factory({ wasmBinary: binary }); basis.initializeBasis();
  const { json, binary: sourceBin } = readTextureGLB(sourceBytes);
  let compressedBytes = 0, rgbaBytes = 0;
  for (const image of review.images) {
    const bytes = await readFile(new URL(`public/assets/models/environment/ktx2/${image.output}`, root));
    assert.equal(hash(bytes), image.outputSha256); assert.equal(bytes.length, image.outputBytes);
    const layout = verifyKtx2(bytes, image.width, image.height);
    assert.equal(layout.levels, image.levels); rgbaBytes += layout.rgba8MipBytesEstimate;
    const file = new basis.KTX2File(new Uint8Array(bytes));
    try {
      assert.ok(file.isValid()); assert.ok(file.isUASTC()); assert.ok(file.startTranscoding());
      assert.equal(file.getWidth(), image.width); assert.equal(file.getHeight(), image.height); assert.equal(file.getLevels(), image.levels);
      for (const format of [6, 10]) { // The runtime loader's BC7 and ASTC_4x4 transcode targets.
        let size = 0;
        for (let mip = 0; mip < file.getLevels(); mip++) {
          const data = new Uint8Array(file.getImageTranscodedSizeInBytes(mip, 0, 0, format)); size += data.length;
          assert.ok(file.transcodeImage(data, mip, 0, 0, format, 0, -1, -1));
        }
        assert.equal(size, layout.bc7OrAstc4x4MipBytesEstimate);
        if (format === 6) compressedBytes += size;
      }
      const rgba = new Uint8Array(file.getImageTranscodedSizeInBytes(0, 0, 0, 13));
      assert.ok(file.transcodeImage(rgba, 0, 0, 0, 13, 0, -1, -1));
      const sourceView = json.bufferViews[json.images[image.image].bufferView], start = sourceView.byteOffset ?? 0;
      const original = await sharp(sourceBin.subarray(start, start + sourceView.byteLength)).ensureAlpha().raw().toBuffer();
      assert.equal(hash(original), image.sourceRgbaSha256);
      compareTexturePixels(original, rgba);
    } finally { file.close(); file.delete(); }
  }
  assert.equal(compressedBytes, review.bc7OrAstc4x4MipBytesEstimate);
  assert.equal(rgbaBytes, review.rgba8MipBytesEstimate);
  assert.ok(compressedBytes < rgbaBytes);
});
