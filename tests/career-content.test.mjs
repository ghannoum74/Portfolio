import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

const temporary = await mkdtemp(new URL('../.career-content-test-', import.meta.url));
const bundle = `${temporary}/data.mjs`;
await build({ stdin: { contents: `export { PROJECTS } from './src/data/projects';`,
  resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'esm' });
const { PROJECTS } = await import(pathToFileURL(bundle));
await rm(temporary, { recursive: true, force: true });

test('every project book page has a distinct real demo, source link and decodable preview', async () => {
  assert.equal(PROJECTS.length, 3);
  for (const key of ['id', 'projectUrl', 'screenshot']) {
    assert.equal(new Set(PROJECTS.map(project => project[key])).size, PROJECTS.length);
  }
  for (const project of PROJECTS) {
    assert.equal(new URL(project.projectUrl).protocol, 'https:');
    assert.equal(new URL(project.githubUrl).host, 'github.com');
    const image = await sharp(await readFile(`public${project.screenshot}`)).metadata();
    assert.ok(image.width >= 600 && image.height >= 300);
    assert.ok(project.highlights.length <= 3 && project.technologies.length <= 7);
  }
});
