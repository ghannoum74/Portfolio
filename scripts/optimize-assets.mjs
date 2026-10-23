import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, stat, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, dirname, basename, join, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { packGLBTextures } from './pack-lossless-textures.mjs';

// Usage: node scripts/optimize-assets.mjs [source-dir] [output-dir] [--recursive] [--lossless-textures]
// Default: house.glb, world.glb, book.glb. Recursive mode mirrors all GLB subpaths.
// No simplification, quantization, flattening, joining or pruning. Texture bytes
// stay unchanged unless --lossless-textures adds pixel-verified WebP packing.
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const hash = (array) => array == null ? null : createHash('sha256')
  .update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const accessor = (a) => a && [a.getType(), a.getNormalized(), a.getCount(), hash(a.getArray())];

function readGLB(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)),
    tail: bytes.subarray(20 + jsonLength) };
}

async function preserveTransforms(originalPath, encodedPath) {
  const original = readGLB(await readFile(originalPath)).json;
  const encoded = readGLB(await readFile(encodedPath));
  for (const key of ['materials', 'textures', 'cameras']) {
    assert.deepEqual(encoded.json[key] ?? [], original[key] ?? [], `${key} changed`);
  }
  const samplerDefaults = (samplers = []) => samplers.map(s => ({ wrapS: 10497, wrapT: 10497, ...s }));
  assert.deepEqual(samplerDefaults(encoded.json.samplers), samplerDefaults(original.samplers));
  assert.equal(encoded.json.nodes.length, original.nodes.length);
  for (let i = 0; i < original.nodes.length; i++) {
    assert.equal(encoded.json.nodes[i].name, original.nodes[i].name);
    // The serializer omits values near the default. Preserve even tiny offsets.
    for (const key of ['translation', 'rotation', 'scale', 'matrix']) {
      delete encoded.json.nodes[i][key];
      if (key in original.nodes[i]) encoded.json.nodes[i][key] = original.nodes[i][key];
    }
  }
  let json = Buffer.from(JSON.stringify(encoded.json));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + encoded.tail.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  await writeFile(encodedPath, Buffer.concat([header, json, encoded.tail]));
}

function indices(primitive) {
  const a = primitive.getIndices();
  if (!a || primitive.getMode() !== 4) return accessor(a);
  // Meshopt may rotate triangle corners cyclically; winding and faces stay intact.
  const src = a.getArray();
  const canonical = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const triangle = [src[i], src[i + 1], src[i + 2]];
    const first = triangle.indexOf(Math.min(...triangle));
    for (let j = 0; j < 3; j++) canonical[i + j] = triangle[(first + j) % 3];
  }
  return hash(canonical);
}

function snapshot(doc) {
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const skins = root.listSkins();
  const attributes = (p) => p.listSemantics().map(s => [s, accessor(p.getAttribute(s))]);
  return {
    extras: root.getExtras(),
    scenes: root.listScenes().map(s => [s.getName(), s.getExtras(), s.listChildren().map(n => nodes.indexOf(n))]),
    nodes: nodes.map(n => [n.getName(), n.getTranslation(), n.getRotation(), n.getScale(),
      n.getWeights(), n.getExtras(), n.listChildren().map(c => nodes.indexOf(c)), meshes.indexOf(n.getMesh()), skins.indexOf(n.getSkin())]),
    skins: skins.map(s => [s.getName(), s.getExtras(), nodes.indexOf(s.getSkeleton()),
      s.listJoints().map(n => nodes.indexOf(n)), accessor(s.getInverseBindMatrices())]),
    meshes: meshes.map(m => [m.getName(), m.getWeights(), m.getExtras(), m.listPrimitives().map(p => [
      p.getMode(), materials.indexOf(p.getMaterial()), indices(p), attributes(p),
      p.listTargets().map(attributes), p.getExtras(),
    ])]),
    animations: root.listAnimations().map(a => [a.getName(), a.getExtras(),
      a.listChannels().map(c => [nodes.indexOf(c.getTargetNode()), c.getTargetPath(),
        c.getSampler().getInterpolation(), accessor(c.getSampler().getInput()), accessor(c.getSampler().getOutput())])]),
    textures: root.listTextures().map(t => [t.getName(), t.getMimeType(), hash(t.getImage())]),
  };
}

export const decodedAssetFingerprint = document => createHash('sha256').update(JSON.stringify(snapshot(document))).digest('hex');

async function glbPaths(directory, prefix = '') {
  const names = [];
  const entries = await readdir(resolve(directory, prefix), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) names.push(...await glbPaths(directory, path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) names.push(path.split(sep).join('/'));
  }
  return names;
}

export async function optimizeAssets(sourceDirectory, outputDirectory, { recursive = false, losslessTextures = false } = {}) {
  const source = resolve(sourceDirectory), output = resolve(outputDirectory);
  const inside = (child, parent) => {
    const path = relative(parent, child);
    return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
  };
  assert.ok(!inside(source, output) && !inside(output, source), 'Keep source and output directories separate and non-nested.');
  const names = recursive ? await glbPaths(source) : ['house.glb', 'world.glb', 'book.glb'];
  assert.ok(names.length, 'No source GLBs found.');
  await mkdir(output, { recursive: true });
  const report = [];
  const supported = new Set(ALL_EXTENSIONS.map(extension => extension.EXTENSION_NAME));
  for (const name of names) {
    const inputPath = resolve(source, name);
    const outputPath = resolve(output, name);
    const originalBytes = await readFile(inputPath);
    for (const extension of readGLB(originalBytes).json.extensionsUsed ?? []) {
      assert.ok(supported.has(extension), `${name}: unsupported extension ${extension}; refusing to discard data`);
    }
    const document = await io.read(inputPath);
    const before = snapshot(document);
    // QUANTIZE here selects the unfiltered codec. No quantize() transform runs:
    // float attributes, morph targets, and animation samples retain full precision.
    document.createExtension(EXTMeshoptCompression).setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    await mkdir(dirname(outputPath), { recursive: true });
    const temporaryDirectory = await mkdtemp(resolve(dirname(outputPath), '.meshopt-'));
    const temporary = resolve(temporaryDirectory, basename(name));
    let finalSnapshot = before, texturePacking;
    try {
      await io.write(temporary, document);
      await preserveTransforms(inputPath, temporary);
      const decoded = await io.read(temporary);
      assert.deepEqual(snapshot(decoded), before, `${name}: decoded model changed`);
      if (losslessTextures) {
        const meshoptBytes = await readFile(temporary);
        const packed = await packGLBTextures(meshoptBytes);
        await writeFile(temporary, packed.bytes);
        finalSnapshot = snapshot(await io.read(temporary));
        assert.deepEqual({ ...finalSnapshot, textures: before.textures }, before, `${name}: non-texture data changed`);
        texturePacking = { meshoptBytes: meshoptBytes.length,
          savedBytes: meshoptBytes.length - packed.bytes.length, images: packed.images };
      }
      await rename(temporary, outputPath);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    const optimizedBytes = (await stat(outputPath)).size;
    report.push({ name, originalBytes: originalBytes.length, optimizedBytes,
      reductionPercent: +(100 * (1 - optimizedBytes / originalBytes.length)).toFixed(1), verified: true,
      sourceGitSha: createHash('sha1').update(`blob ${originalBytes.length}\0`).update(originalBytes).digest('hex'),
      decodedSha256: createHash('sha256').update(JSON.stringify(finalSnapshot)).digest('hex'),
      ...(texturePacking ? { texturePacking } : {}),
    });
  }
  await writeFile(resolve(output, 'asset-sizes.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2).filter(argument => !['--recursive', '--lossless-textures'].includes(argument));
  const report = await optimizeAssets(args[0] ?? 'asset-sources', args[1] ?? 'public/assets/models/environment',
    { recursive: process.argv.includes('--recursive'), losslessTextures: process.argv.includes('--lossless-textures') });
  console.table(report.map(({ name, originalBytes, optimizedBytes, reductionPercent, verified }) =>
    ({ name, originalBytes, optimizedBytes, reductionPercent, verified })));
}
