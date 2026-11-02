import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export async function requiredRuntimeAssets() {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../src/loaders/AssetManifest.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { ASSETS, STARTUP_ASSETS } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
  // Optional LOD sidecars intentionally do not gate startup or deployment.
  return [...new Set([...STARTUP_ASSETS, ASSETS.house, ASSETS.bookAnimated, ...Object.values(ASSETS.characters)])];
}

export async function checkRuntimeAssets(publicRoot, urls) {
  urls ??= await requiredRuntimeAssets();
  const failures = [];
  await Promise.all(urls.map(async url => {
    let file;
    try {
      file = await open(resolve(publicRoot, `.${url}`), 'r');
      const size = (await file.stat()).size, header = Buffer.alloc(20);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      if (bytesRead !== 20 || header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(4) !== 2 ||
          header.readUInt32LE(8) !== size || header.readUInt32LE(16) !== 0x4e4f534a ||
          header.readUInt32LE(12) <= 0 || header.readUInt32LE(12) > size - 20) {
        throw new Error('invalid or incomplete GLB');
      }
    } catch (error) { failures.push(`${url}: ${error.code === 'ENOENT' ? 'missing file (check filename case)' : error.message}`); }
    finally { await file?.close(); }
  }));
  if (failures.length) throw new Error(`Required runtime assets failed verification:\n${failures.sort().join('\n')}`);
  return urls.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const count = await checkRuntimeAssets(fileURLToPath(new URL('../public', import.meta.url)));
    console.log(`Verified ${count} required GLB assets.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
