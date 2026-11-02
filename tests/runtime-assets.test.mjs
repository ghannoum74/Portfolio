import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { checkRuntimeAssets, requiredRuntimeAssets } from '../scripts/check-runtime-assets.mjs';

test('every required runtime URL has a complete GLB in the exact deployed public path', async () => {
  const urls = await requiredRuntimeAssets();
  for (const name of ['MTC', 'prodigy', 'se-factory', 'player']) assert.ok(urls.includes(`/assets/models/player/${name}.glb`));
  assert.equal(await checkRuntimeAssets(fileURLToPath(new URL('../public', import.meta.url)), urls), urls.length);
});

test('the build guard identifies missing and truncated models instead of shipping a broken loading group', async () => {
  const folder = await mkdtemp(new URL('../.asset-presence-test-', import.meta.url));
  try {
    await mkdir(`${folder}/assets`);
    await writeFile(`${folder}/assets/broken.glb`, Buffer.from('glTF'));
    await assert.rejects(checkRuntimeAssets(folder, ['/assets/missing.glb', '/assets/broken.glb']), error =>
      /missing.glb: missing file/.test(error.message) && /broken.glb: invalid or incomplete GLB/.test(error.message));
  } finally { await rm(folder, { recursive: true, force: true }); }
});
