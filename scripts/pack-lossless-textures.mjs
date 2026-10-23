import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

// Offline packing only. Never resize, quantize, simplify or re-encode geometry.
const WEBP = 'EXT_texture_webp';
const SAFE_EXTENSIONS = new Set([
  'EXT_meshopt_compression', WEBP, 'KHR_materials_emissive_strength',
  'KHR_materials_unlit', 'KHR_materials_specular', 'KHR_texture_transform', 'KHR_lights_punctual',
  'KHR_mesh_quantization',
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const align = length => (length + 3) & ~3;

export function readTextureGLB(bytes) {
  assert.ok(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67, 'Expected GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'Expected GLB version 2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'Invalid GLB length');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'Expected JSON chunk');
  const length = bytes.readUInt32LE(12), binHeader = 20 + length;
  assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942, 'Expected embedded BIN');
  assert.equal(binHeader + 8 + bytes.readUInt32LE(binHeader), bytes.length, 'Unexpected GLB chunks');
  const json = JSON.parse(bytes.toString('utf8', 20, binHeader));
  const binary = bytes.subarray(binHeader + 8);
  assert.ok(json.buffers?.[0] && !json.buffers[0].uri, 'Expected embedded buffer 0');
  assert.ok(json.buffers[0].byteLength <= binary.length && binary.length - json.buffers[0].byteLength < 4);
  for (const buffer of json.buffers.slice(1)) {
    assert.ok(!buffer.uri && buffer.extensions?.EXT_meshopt_compression?.fallback,
      'Only virtual Meshopt fallback buffers are supported');
  }
  return { json, binary };
}

function writeGLB(json, binary) {
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([encoded, Buffer.alloc(align(encoded.length) - encoded.length, 0x20)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binHeader, binary]);
}

function checkPNG(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Expected PNG');
  assert.equal(bytes[24], 8, 'Only 8-bit PNGs are supported');
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), kind = bytes.toString('ascii', offset + 4, offset + 8);
    assert.ok(offset + length + 12 <= bytes.length, 'Invalid PNG chunk');
    assert.ok(!['iCCP', 'eXIf', 'acTL'].includes(kind), 'Profiled, oriented or animated PNG: retain the original');
    if (kind === 'gAMA') assert.equal(bytes.readUInt32BE(offset + 8), 45455, 'Non-sRGB PNG gamma: retain the original');
    if (kind === 'cHRM') {
      const values = Array.from({ length: 8 }, (_, i) => bytes.readUInt32BE(offset + 8 + i * 4));
      assert.deepEqual(values, [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000], 'Non-sRGB PNG chromaticity');
    }
    offset += length + 12;
  }
}

export async function encodeLosslessPNG(input, encode = bytes => sharp(bytes).webp({ lossless: true, effort: 6 }).toBuffer()) {
  checkPNG(input);
  const before = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bytes = await encode(input);
  assert.equal((await sharp(bytes).metadata()).format, 'webp', 'Encoder must return WebP');
  const after = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(after.info.width, before.info.width, 'Texture width changed');
  assert.equal(after.info.height, before.info.height, 'Texture height changed');
  assert.ok(before.data.equals(after.data), 'Decoded RGBA pixels changed; refusing output');
  return { bytes, report: {
    width: before.info.width, height: before.info.height,
    originalBytes: input.length, optimizedBytes: bytes.length,
    rgbaSha256: sha256(before.data), exactPixels: true,
  } };
}

export async function packGLBTextures(input, { encode } = {}) {
  const { json, binary } = readTextureGLB(input);
  if (!json.images?.some(image => image.mimeType === 'image/png' && image.bufferView != null)) {
    return { bytes: input, images: [] };
  }
  for (const extension of json.extensionsUsed ?? []) {
    assert.ok(SAFE_EXTENSIONS.has(extension), `Unsupported extension ${extension}; retain original buffer layout`);
  }
  const original = structuredClone(json), replacements = [], images = [];
  for (let index = 0; index < (json.images?.length ?? 0); index++) {
    const image = json.images[index];
    if (image.mimeType !== 'image/png' || image.bufferView == null) continue;
    const view = json.bufferViews[image.bufferView], start = view.byteOffset ?? 0;
    assert.ok(view.buffer === 0 && !view.extensions && start % 4 === 0, 'Expected isolated embedded image');
    assert.ok(start + view.byteLength <= json.buffers[0].byteLength, 'Image exceeds buffer');
    assert.ok(!replacements.some(r => r.view === image.bufferView), 'Shared PNG image bufferView is unsupported');
    const packed = await encodeLosslessPNG(binary.subarray(start, start + view.byteLength), encode);
    if (packed.bytes.length >= view.byteLength) continue;
    const padded = Buffer.concat([packed.bytes, Buffer.alloc(align(packed.bytes.length) - packed.bytes.length)]);
    replacements.push({ index, view: image.bufferView, start, end: start + align(view.byteLength), bytes: packed.bytes, padded });
    images.push({ index, name: image.name ?? '', ...packed.report });
  }
  if (!replacements.length) return { bytes: input, images };
  replacements.sort((a, b) => a.start - b.start);
  for (let i = 0; i < replacements.length; i++) {
    assert.ok(replacements[i].end <= binary.length, 'Image padding exceeds BIN');
    if (i) assert.ok(replacements[i - 1].end <= replacements[i].start, 'Overlapping image bufferViews');
  }
  // Both raw views and Meshopt compressed ranges address the physical buffer.
  // Virtual fallback offsets must remain unchanged.
  const protectedRanges = [];
  json.bufferViews.forEach((view, index) => {
    if (view.buffer === 0 && !replacements.some(r => r.view === index)) {
      protectedRanges.push({ value: view, start: view.byteOffset ?? 0, length: view.byteLength });
    }
    const compressed = view.extensions?.EXT_meshopt_compression;
    if (compressed?.buffer === 0) protectedRanges.push({ value: compressed, start: compressed.byteOffset ?? 0, length: compressed.byteLength });
  });
  for (const range of protectedRanges) {
    assert.ok(range.start >= 0 && range.start + range.length <= binary.length, 'Referenced data exceeds BIN');
    for (const r of replacements) {
      assert.ok(range.start + range.length <= r.start || range.start >= r.end, 'Image overlaps geometry or another bufferView');
    }
  }
  const relocate = start => start + replacements.filter(r => r.end <= start)
    .reduce((sum, r) => sum + r.padded.length - (r.end - r.start), 0);
  const parts = []; let cursor = 0;
  for (const r of replacements) { parts.push(binary.subarray(cursor, r.start), r.padded); cursor = r.end; }
  parts.push(binary.subarray(cursor));
  const packedBinary = Buffer.concat(parts);
  for (const range of protectedRanges) {
    const next = relocate(range.start);
    if (next !== range.start) range.value.byteOffset = next;
    assert.ok(binary.subarray(range.start, range.start + range.length)
      .equals(packedBinary.subarray(next, next + range.length)), 'Non-image bytes changed');
  }
  const converted = new Set(replacements.map(r => r.index));
  for (const r of replacements) {
    const view = json.bufferViews[r.view]; view.byteOffset = relocate(r.start); view.byteLength = r.bytes.length;
    json.images[r.index].mimeType = 'image/webp';
  }
  for (const texture of json.textures ?? []) {
    if (!converted.has(texture.source)) continue;
    assert.ok(!texture.extensions?.[WEBP], 'PNG already has a WebP alternative');
    texture.extensions ??= {}; texture.extensions[WEBP] = { source: texture.source }; delete texture.source;
  }
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), WEBP])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), WEBP])];
  json.buffers[0].byteLength = packedBinary.length;
  for (const field of ['nodes', 'meshes', 'accessors', 'materials', 'samplers', 'skins', 'animations', 'scenes', 'cameras']) {
    assert.deepEqual(json[field], original[field], `${field} changed`);
  }
  return { bytes: writeGLB(json, packedBinary), images };
}

export async function packTextureFile(inputPath, outputPath, options) {
  const source = resolve(inputPath), destination = resolve(outputPath);
  assert.notEqual(source, destination, 'Keep source and output files separate');
  const input = await readFile(source);
  let packed;
  if (extname(source).toLowerCase() === '.glb') {
    assert.equal(extname(destination).toLowerCase(), '.glb');
    packed = await packGLBTextures(input, options);
  } else {
    assert.equal(extname(destination).toLowerCase(), '.webp');
    const image = await encodeLosslessPNG(input, options?.encode);
    assert.ok(image.bytes.length < input.length, 'WebP is not smaller; retain original PNG');
    packed = { bytes: image.bytes, images: [{ name: basename(source), ...image.report }] };
  }
  const report = {
    source: basename(source), output: basename(destination),
    originalBytes: input.length, optimizedBytes: packed.bytes.length,
    savedBytes: input.length - packed.bytes.length,
    sourceGitSha: gitSha(input), outputGitSha: gitSha(packed.bytes),
    images: packed.images,
  };
  await mkdir(dirname(destination), { recursive: true });
  const temporary = await mkdtemp(resolve(dirname(destination), '.texture-pack-'));
  try {
    const path = resolve(temporary, basename(destination));
    await writeFile(path, packed.bytes); await rename(path, destination);
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, reportPath] = process.argv.slice(2);
  assert.ok(input && output, 'Usage: node scripts/pack-lossless-textures.mjs input.glb output.glb [report.json]');
  const report = await packTextureFile(input, output);
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
