import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { read as readKtx2, KHR_DF_MODEL_UASTC, KHR_DF_PRIMARIES_BT709, KHR_DF_TRANSFER_SRGB } from 'three/examples/jsm/libs/ktx-parse.module.js';
import { readTextureGLB } from './pack-lossless-textures.mjs';

const run = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const round = value => Number(value.toFixed(4));

export function compareTexturePixels(before, after) {
  assert.equal(before.length, after.length);
  const errors = new Uint32Array(256);
  let squared = 0, maximum = 0;
  for (let i = 0; i < before.length; i++) {
    if (i % 4 === 3) {
      assert.equal(after[i], before[i], 'Texture alpha changed');
      continue;
    }
    const error = Math.abs(before[i] - after[i]);
    squared += error * error; maximum = Math.max(maximum, error); errors[error]++;
  }
  const count = before.length / 4 * 3;
  const rmse = Math.sqrt(squared / count);
  let cumulative = 0, p99 = 0;
  for (; p99 < 255; p99++) { cumulative += errors[p99]; if (cumulative >= count * 0.99) break; }
  const psnr = rmse === 0 ? null : 20 * Math.log10(255 / rmse);
  // A numerical precheck only. A close-up live review is still required.
  assert.ok(psnr === null || psnr >= 42, `Texture PSNR ${psnr} dB is below 42 dB`);
  assert.ok(p99 <= 6, `Texture 99th-percentile channel error ${p99} exceeds 6/255`);
  return { exactPixels: maximum === 0, rmse: round(rmse), psnrDb: psnr === null ? null : round(psnr),
    p99AbsoluteChannelError: p99, maxAbsoluteChannelError: maximum };
}

export function inspectWorldColorImages(json) {
  const selected = new Map();
  const sourceOf = index => {
    const texture = json.textures?.[index];
    assert.ok(texture, 'Unknown material texture');
    assert.ok(!texture.extensions?.KHR_texture_basisu, 'Source is already KTX2');
    return texture.extensions?.EXT_texture_webp?.source ?? texture.source;
  };
  const walk = (value, path, material) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const next = `${path}.${key}`;
      if (key.endsWith('Texture') && child && Number.isInteger(child.index)) {
        const image = sourceOf(child.index);
        const usages = selected.get(image) ?? [];
        usages.push({ slot: next, material: material.name ?? '' }); selected.set(image, usages);
      } else walk(child, next, material);
    }
  };
  for (const material of json.materials ?? []) walk(material, '', material);
  for (const [image, usages] of selected) {
    assert.ok(Number.isInteger(image) && json.images?.[image], 'Unknown source image');
    assert.ok(usages.every(usage => usage.slot === '.pbrMetallicRoughness.baseColorTexture'),
      'This pass accepts exclusively base-color images; retain other texture slots');
  }
  assert.ok(selected.size > 0 && selected.size <= 16, 'Expected 1–16 base-color images');
  return selected;
}

export function verifyKtx2(bytes, width, height) {
  const container = readKtx2(bytes);
  assert.equal(container.vkFormat, 0, 'Expected universal Basis texture');
  assert.equal(container.pixelWidth, width); assert.equal(container.pixelHeight, height);
  assert.equal(container.pixelDepth, 0); assert.equal(container.layerCount, 0); assert.equal(container.faceCount, 1);
  const descriptor = container.dataFormatDescriptor[0];
  assert.equal(descriptor.colorModel, KHR_DF_MODEL_UASTC, 'Expected high-quality UASTC');
  assert.equal(descriptor.colorPrimaries, KHR_DF_PRIMARIES_BT709);
  assert.equal(descriptor.transferFunction, KHR_DF_TRANSFER_SRGB);
  assert.equal(container.levels.length, Math.floor(Math.log2(Math.max(width, height))) + 1, 'Missing mipmaps');
  assert.ok(!container.keyValue.KTXorientation || String(container.keyValue.KTXorientation).replace(/\0/g, '') === 'rd', 'Unexpected texture orientation');
  let rgba8Bytes = 0, blockBytes = 0;
  for (let i = 0; i < container.levels.length; i++) {
    const w = Math.max(1, width >> i), h = Math.max(1, height >> i);
    rgba8Bytes += w * h * 4;
    blockBytes += Math.ceil(w / 4) * Math.ceil(h / 4) * 16;
  }
  return { levels: container.levels.length, rgba8MipBytesEstimate: rgba8Bytes, bc7OrAstc4x4MipBytesEstimate: blockBytes };
}

export async function generateWorldKtx2({
  source = 'public/assets/models/environment/world.glb',
  output = 'public/assets/models/environment/ktx2',
  manifestPath = 'public/assets/models/environment/world-ktx2.json',
  ktx = 'ktx',
} = {}) {
  const inputPath = resolve(source), outputPath = resolve(output);
  assert.notEqual(inputPath, resolve(manifestPath), 'Keep source and manifest paths separate');
  assert.notEqual(inputPath, outputPath, 'Keep source and output paths separate');
  assert.equal(extname(manifestPath).toLowerCase(), '.json', 'Manifest must be a JSON file');
  const input = await readFile(inputPath), { json, binary } = readTextureGLB(input);
  const selected = inspectWorldColorImages(json);
  const version = (await run(ktx, ['--version'])).stdout.trim();
  await mkdir(outputPath, { recursive: true });
  const temporary = await mkdtemp(resolve(outputPath, '.world-ktx2-'));
  const manifest = { schemaVersion: 1, sourceSha256: hash(input), textures: [] };
  const review = { source: basename(inputPath), sourceSha256: manifest.sourceSha256,
    sourceBytes: input.length, encoder: version, encoding: 'UASTC quality 4, no RDO, Zstandard 18',
    scope: 'Opaque sRGB exterior base-color images only',
    imageDimensionsChanged: false, geometryChanged: false, materialsChanged: false,
    gpuMemoryFiguresAreEstimates: true, nativeWebGLReviewed: false, fpsGainMeasured: false, images: [] };
  try {
    for (const [index, usages] of selected) {
      const image = json.images[index], view = json.bufferViews?.[image.bufferView];
      assert.ok(view?.buffer === 0 && !image.uri && ['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType),
        'Expected embedded PNG/JPEG/WebP source');
      const start = view.byteOffset ?? 0;
      assert.ok(start >= 0 && start + view.byteLength <= binary.length, 'Source image exceeds BIN');
      const sourceImage = binary.subarray(start, start + view.byteLength);
      const decoded = await sharp(sourceImage).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width, height } = decoded.info;
      assert.ok([width, height].every(n => n > 0 && n <= 4096 && n % 4 === 0), 'Retain dimensions; this pass cannot resize');
      assert.ok(decoded.data.every((value, i) => i % 4 !== 3 || value === 255), 'Retain images with authored transparency');
      const pngPath = resolve(temporary, `source-${index}.png`), ktxPath = resolve(temporary, `image-${index}.ktx2`);
      const decodedPath = resolve(temporary, `decoded-${index}.png`);
      await sharp(decoded.data, { raw: { width, height, channels: 4 } }).png().toFile(pngPath);
      await run(ktx, ['create', '--format', 'R8G8B8A8_SRGB', '--assign-tf', 'srgb', '--assign-primaries', 'bt709',
        '--assign-texcoord-origin', 'top-left', '--generate-mipmap', '--mipmap-filter', 'box', '--mipmap-wrap', 'wrap',
        '--encode', 'uastc', '--uastc-quality', '4', '--zstd', '18', '--threads', '2', pngPath, ktxPath]);
      const encoded = await readFile(ktxPath), layout = verifyKtx2(encoded, width, height);
      await run(ktx, ['extract', '--transcode', 'rgba8', ktxPath, decodedPath]);
      const after = await sharp(decodedPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(after.info.width, width); assert.equal(after.info.height, height);
      const quality = compareTexturePixels(decoded.data, after.data);
      const outputSha256 = hash(encoded), filename = `world-${index}-${outputSha256.slice(0, 16)}.ktx2`;
      manifest.textures.push({ image: index, uri: `/assets/models/environment/ktx2/${filename}`, width, height });
      review.images.push({ image: index, name: image.name ?? '', usages, width, height,
        sourceBytes: sourceImage.length, sourceRgbaSha256: hash(decoded.data),
        output: filename, outputBytes: encoded.length, outputSha256, ...layout, quality });
      await rename(ktxPath, resolve(temporary, filename));
    }
    assert.ok((await readFile(inputPath)).equals(input), 'Source changed during conversion');
    for (const image of review.images) await rename(resolve(temporary, image.output), resolve(outputPath, image.output));
    await mkdir(dirname(resolve(manifestPath)), { recursive: true });
    const manifestTemp = resolve(temporary, 'manifest.json');
    await writeFile(manifestTemp, JSON.stringify(manifest, null, 2) + '\n');
    await rename(manifestTemp, resolve(manifestPath));
    review.totalEncodedBytes = review.images.reduce((sum, image) => sum + image.outputBytes, 0);
    review.rgba8MipBytesEstimate = review.images.reduce((sum, image) => sum + image.rgba8MipBytesEstimate, 0);
    review.bc7OrAstc4x4MipBytesEstimate = review.images.reduce((sum, image) => sum + image.bc7OrAstc4x4MipBytesEstimate, 0);
    return review;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { source: { type: 'string' }, output: { type: 'string' },
    manifest: { type: 'string' }, ktx: { type: 'string' }, report: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log('npm run assets:ktx2 -- [--ktx /path/to/ktx] [--report docs/ktx2-texture-review.json]');
  else {
    if (values.report) {
      assert.equal(extname(values.report).toLowerCase(), '.json', 'Report must be a JSON file');
      assert.notEqual(resolve(values.report), resolve(values.source ?? 'public/assets/models/environment/world.glb'), 'Keep source and report paths separate');
      assert.notEqual(resolve(values.report), resolve(values.manifest ?? 'public/assets/models/environment/world-ktx2.json'), 'Keep manifest and report paths separate');
    }
    const report = await generateWorldKtx2({ source: values.source, output: values.output,
      manifestPath: values.manifest, ktx: values.ktx });
    if (values.report) {
      await mkdir(dirname(resolve(values.report)), { recursive: true });
      await writeFile(values.report, JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify(report, null, 2));
  }
}
