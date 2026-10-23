import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createHash } from 'node:crypto';
import { mkdir, stat, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

// Usage: node scripts/optimize-assets.mjs [source-dir] [output-dir]
// Sources must be named house.glb, world.glb, book.glb. Keep Blender originals.
// No simplification, quantization, flattening, joining, pruning, or texture changes.
const source = resolve(process.argv[2] ?? 'asset-sources');
const output = resolve(process.argv[3] ?? 'public/assets/models/environment');
assert.notEqual(source, output, 'Keep the uncompressed source directory separate.');
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
  for (const key of ['materials', 'textures', 'cameras', 'skins']) {
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
  const attributes = (p) => p.listSemantics().map(s => [s, accessor(p.getAttribute(s))]);
  return {
    scenes: root.listScenes().map(s => [s.getName(), s.listChildren().map(n => nodes.indexOf(n))]),
    nodes: nodes.map(n => [n.getName(), n.getTranslation(), n.getRotation(), n.getScale(),
      n.getWeights(), n.getExtras(), n.listChildren().map(c => nodes.indexOf(c)), meshes.indexOf(n.getMesh())]),
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

await mkdir(output, { recursive: true });
const report = [];
for (const name of ['house.glb', 'world.glb', 'book.glb']) {
  const inputPath = resolve(source, name);
  const outputPath = resolve(output, name);
  const document = await io.read(inputPath);
  const before = snapshot(document);
  // QUANTIZE here selects the unfiltered codec. No quantize() transform runs:
  // float attributes, morph targets, and animation samples retain full precision.
  document.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const temporary = resolve(dirname(outputPath), `${name}.tmp.glb`);
  try {
    await io.write(temporary, document);
    await preserveTransforms(inputPath, temporary);
    const decoded = await io.read(temporary);
    assert.deepEqual(snapshot(decoded), before, `${name}: decoded model changed`);
    await rename(temporary, outputPath);
  } finally {
    await rm(temporary, { force: true });
  }
  const originalBytes = (await stat(inputPath)).size;
  const optimizedBytes = (await stat(outputPath)).size;
  report.push({ name, originalBytes, optimizedBytes,
    reductionPercent: +(100 * (1 - optimizedBytes / originalBytes)).toFixed(1), verified: true });
}
await writeFile(resolve(output, 'asset-sizes.json'), JSON.stringify(report, null, 2) + '\n');
console.table(report);
