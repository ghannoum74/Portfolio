import * as THREE from "three";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

export type WorldTextureState = {
  requested: boolean;
  mode: "original" | "ktx2-uastc";
  reason: string;
  images: number;
  format?: "bc7" | "astc4x4";
};

export type WorldTextureManifest = {
  schemaVersion: 1;
  sourceSha256: string;
  textures: { image: number; uri: string; width: number; height: number }[];
};

const BASIS = "KHR_texture_basisu";
const WEBP = "EXT_texture_webp";
const fail = (message: string): never => { throw new Error(message); };
const errorMessage = (error: unknown): string => error instanceof Error ? error.message
  : typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);

// Change only image references in a temporary GLB copy. In particular, never
// rewrite/re-encode Meshopt data, geometry, materials, names, colliders or LODs.
export async function prepareKtx2WorldSource(source: ArrayBuffer, value: unknown): Promise<ArrayBuffer> {
  const manifest = value as WorldTextureManifest;
  if (manifest?.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.sourceSha256) ||
      !Array.isArray(manifest.textures) || !manifest.textures.length || manifest.textures.length > 16) {
    fail("Invalid KTX2 world manifest");
  }
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", source))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== manifest.sourceSha256) fail("KTX2 textures are stale for this world export");

  const view = new DataView(source);
  if (source.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== source.byteLength ||
      view.getUint32(16, true) !== 0x4e4f534a) fail("Invalid source GLB");
  const jsonEnd = 20 + view.getUint32(12, true);
  if (jsonEnd + 8 > source.byteLength || view.getUint32(jsonEnd + 4, true) !== 0x004e4942 ||
      jsonEnd + 8 + view.getUint32(jsonEnd, true) !== source.byteLength) fail("Invalid source GLB chunks");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(source, 20, jsonEnd - 20)));
  const converted = new Set<number>();
  for (const texture of manifest.textures) {
    if (!texture || !Number.isInteger(texture.image) || !json.images?.[texture.image] || converted.has(texture.image) ||
        !/^\/assets\/models\/environment\/ktx2\/world-\d+-[a-f0-9]{16}\.ktx2$/.test(texture.uri) ||
        ![texture.width, texture.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096 && n % 4 === 0)) {
      fail("Invalid KTX2 image replacement");
    }
    converted.add(texture.image);
    const image = json.images[texture.image];
    delete image.bufferView;
    // GLTFLoader concatenates root-relative bases with image URIs. Keep sidecars
    // relative to world.glb's folder so /assets/... is never prepended twice.
    image.uri = texture.uri.slice("/assets/models/environment/".length);
    image.mimeType = "image/ktx2";
  }
  const used = new Set<number>();
  for (const texture of json.textures ?? []) {
    const image = texture.extensions?.[WEBP]?.source ?? texture.source;
    if (!converted.has(image)) continue;
    used.add(image);
    texture.extensions ??= {};
    texture.extensions[BASIS] = { source: image };
    delete texture.extensions[WEBP];
    delete texture.source;
  }
  if (used.size !== converted.size) fail("Unused KTX2 image replacement");
  const stillUsesWebp = json.textures.some((texture: { extensions?: Record<string, unknown> }) => texture.extensions?.[WEBP]);
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    json[key] = [...new Set([...(json[key] ?? []).filter((name: string) => stillUsesWebp || name !== WEBP), BASIS])];
  }

  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = (encoded.byteLength + 3) & ~3;
  const result = new Uint8Array(20 + paddedLength + source.byteLength - jsonEnd);
  result.set(new Uint8Array(source, 0, 20));
  new DataView(result.buffer).setUint32(8, result.byteLength, true);
  new DataView(result.buffer).setUint32(12, paddedLength, true);
  result.fill(0x20, 20, 20 + paddedLength);
  result.set(encoded, 20);
  result.set(new Uint8Array(source, jsonEnd), 20 + paddedLength);
  return result.buffer;
}

type Backend = { loader: GLTFLoader; ktx2: KTX2Loader; textureErrors?: { url: string; message: string }[] };
type Dependencies = {
  createBackend: (renderer: THREE.WebGLRenderer) => Promise<Backend>;
  readManifest: (url: string) => Promise<unknown>;
};

async function createBackend(renderer: THREE.WebGLRenderer): Promise<Backend> {
  const [{ KTX2Loader }, { GLTFLoader }, { MeshoptDecoder }, js, wasm] = await Promise.all([
    import("three/examples/jsm/loaders/KTX2Loader.js"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    import("three/examples/jsm/libs/basis/basis_transcoder.js?url"),
    import("three/examples/jsm/libs/basis/basis_transcoder.wasm?url"),
  ]);
  // Optional resources use their own manager. A failed comparison must not mark
  // the required startup assets as failed when originals still load correctly.
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => url === "basis_transcoder.js" ? js.default
    : url === "basis_transcoder.wasm" ? wasm.default : url);
  const ktx2 = new KTX2Loader(manager).setWorkerLimit(2).detectSupport(renderer);
  const textureErrors: { url: string; message: string }[] = [];
  const load = ktx2.load.bind(ktx2);
  ktx2.load = (url, onLoad, onProgress, onError) => load(url, onLoad, onProgress, error => {
    // GLTFLoader otherwise catches the image failure and resolves a null map.
    textureErrors.push({ url, message: errorMessage(error) });
    onError?.(error);
  });
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
  return { loader, ktx2, textureErrors };
}

const dependencies: Dependencies = {
  createBackend,
  readManifest: async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`KTX2 manifest HTTP ${response.status}`);
    return response.json();
  },
};

function disposeCandidate(asset: GLTF): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  for (const scene of asset.scenes) scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export async function loadKtx2World(
  source: ArrayBuffer, original: GLTFLoader, path: string, renderer: THREE.WebGLRenderer, manifestUrl: string,
  deps: Dependencies = dependencies,
): Promise<{ asset: GLTF; state: WorldTextureState }> {
  let backend: Backend | undefined;
  let candidate: GLTF | undefined;
  let reason = "KTX2 comparison unavailable";
  try {
    backend = await deps.createBackend(renderer);
    const support = backend.ktx2.workerConfig;
    // Keep this quality comparison to high-quality UASTC targets. Other devices
    // retain the original images rather than silently choosing a weaker target.
    if (!support.bptcSupported && !support.astcSupported) fail("BC7/ASTC texture compression unavailable");
    const manifest = await deps.readManifest(manifestUrl) as WorldTextureManifest;
    const patched = await prepareKtx2WorldSource(source, manifest);
    candidate = await backend.loader.parseAsync(patched, path);
    const failedTexture = backend.textureErrors?.[0];
    if (failedTexture) fail(`KTX2 texture load failed: ${failedTexture.url}: ${failedTexture.message}`);
    const maps = new Set<THREE.Texture>();
    for (const scene of candidate.scenes) scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map) maps.add(map);
      }
    });
    const formats = new Set([...maps].map(map => map.format));
    const dimensions = manifest.textures.map(texture => `${texture.width}x${texture.height}`);
    for (const map of maps) {
      const compressed = map as THREE.CompressedTexture;
      const width = compressed.image.width, height = compressed.image.height;
      const index = dimensions.indexOf(`${width}x${height}`);
      if (index < 0 || compressed.mipmaps.length !== Math.floor(Math.log2(Math.max(width, height))) + 1) {
        fail("Unexpected transcoded world texture dimensions or mipmaps");
      }
      dimensions.splice(index, 1);
    }
    if (maps.size !== manifest.textures.length) fail(`Only ${maps.size}/${manifest.textures.length} world textures loaded`);
    if ([...maps].some(map => !((map as THREE.CompressedTexture).isCompressedTexture) ||
        map.colorSpace !== THREE.SRGBColorSpace || (map.format !== THREE.RGBA_BPTC_Format && map.format !== THREE.RGBA_ASTC_4x4_Format)) ||
        formats.size !== 1) fail("Unexpected transcoded world texture format");
    const format = formats.has(THREE.RGBA_BPTC_Format) ? "bc7" : "astc4x4";
    return { asset: candidate, state: { requested: true, mode: "ktx2-uastc", reason: "active", images: maps.size, format } };
  } catch (error) {
    reason = errorMessage(error);
    if (candidate) disposeCandidate(candidate);
  } finally {
    backend?.ktx2.dispose();
  }
  const asset = await original.parseAsync(source, path);
  console.warn("[World texture compression] Using original textures:", reason);
  return { asset, state: { requested: true, mode: "original", reason, images: 0 } };
}
