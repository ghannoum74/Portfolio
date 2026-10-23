import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// CPU tools/tests cannot decode browser images. Preserve geometry/hierarchy and
// omit texture references only in this in-memory inspection copy.
export async function readGeometryGLB(path) {
  const bytes = await readFile(path);
  const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length));
  const removeTextures = value => {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (key.endsWith('Texture')) delete value[key];
      else removeTextures(value[key]);
    }
  };
  json.materials?.forEach(removeTextures);
  delete json.images; delete json.textures; delete json.samplers;
  let encoded = Buffer.from(JSON.stringify(json));
  encoded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
  const header = Buffer.from(bytes.subarray(0, 20)), tail = bytes.subarray(20 + length);
  header.writeUInt32LE(20 + encoded.length + tail.length, 8);
  header.writeUInt32LE(encoded.length, 12);
  const copy = Buffer.concat([header, encoded, tail]);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.parseAsync(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength), '');
}
