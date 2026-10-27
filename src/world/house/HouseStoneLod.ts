import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export const EXTERIOR_LOD_NAMES = ["Cube_Material002_0", "Cube_Material002_0001"] as const;
// GLTFLoader sanitizes the Blender name Damage_Stone.001 to Damage_Stone001.
export const HOUSE_STONE_NAMES = ["Damage_Stone", "Damage_Stone001"] as const;
export interface StoneLodData {
  version: 1;
  meshes: {
    name: string;
    sourceHash: string;
    sourceTriangles: number;
    levels: { triangles: number; error: number; indices: string; hash: string }[];
  }[];
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Canonical decoded values also work with interleaved/normalized glTF data. */
function geometryStream(geometry: THREE.BufferGeometry, name: string) {
  const attribute = geometry.getAttribute(name);
  const values = new Float32Array(attribute.count * attribute.itemSize);
  for (let i = 0; i < attribute.count; i++) {
    for (let j = 0; j < attribute.itemSize; j++) {
      values[i * attribute.itemSize + j] = attribute.getComponent(i, j);
    }
  }
  return { name, size: attribute.itemSize, values };
}

export function geometryStreams(geometry: THREE.BufferGeometry) {
  return Object.keys(geometry.attributes).sort().map(name => geometryStream(geometry, name));
}

export async function geometryHash(geometry: THREE.BufferGeometry): Promise<string> {
  const streams: ReturnType<typeof geometryStreams> = [];
  for (const name of Object.keys(geometry.attributes).sort()) {
    streams.push(geometryStream(geometry, name));
    // Optional preparation must give gameplay a chance to render between streams.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  const header = new TextEncoder().encode(JSON.stringify(streams.map(s => [s.name, s.size, s.values.length])));
  const indices = Uint32Array.from(geometry.index!.array);
  const chunks = [header, ...streams.map(s => new Uint8Array(s.values.buffer)), new Uint8Array(indices.buffer)];
  const packed = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { packed.set(chunk, offset); offset += chunk.byteLength; }
  return sha256(packed);
}

type Entry = {
  mesh: THREE.Mesh;
  levels: { geometry: THREE.BufferGeometry; error: number }[];
  center: THREE.Vector3;
  radius: number;
  selected: number;
};

/** Swap only indices; keep original meshes, attributes, materials and colliders. */
export class HouseStoneLod {
  private readonly entries: Entry[] = [];
  private readonly center = new THREE.Vector3();
  private enabled = true;

  private closeupDistance = 0;

  static async create(root: THREE.Object3D, data: StoneLodData,
    allowedNames: readonly string[] = HOUSE_STONE_NAMES, closeupDistance = 0): Promise<HouseStoneLod> {
    const lod = new HouseStoneLod();
    if (!Number.isFinite(closeupDistance) || closeupDistance < 0) throw new Error("Invalid close-up distance");
    lod.closeupDistance = closeupDistance;
    try {
      if (data?.version !== 1 || !Array.isArray(data.meshes) || data.meshes.length !== allowedNames.length) {
        throw new Error("Unsupported house stone LOD data");
      }
      await MeshoptDecoder.ready;
      const names = new Set<string>();
      for (const source of data.meshes) {
        if (!allowedNames.includes(source.name) || names.has(source.name)) {
          throw new Error("Unexpected house stone LOD target");
        }
        names.add(source.name);
        const mesh = root.getObjectByName(source.name);
        if (!(mesh instanceof THREE.Mesh) || mesh instanceof THREE.SkinnedMesh ||
            mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.BatchedMesh ||
            !mesh.geometry.index || Object.keys(mesh.geometry.morphAttributes).length || mesh.geometry.groups.length ||
            mesh.geometry.drawRange.start !== 0 || mesh.geometry.drawRange.count < mesh.geometry.index.count) {
          throw new Error(`Unsupported stone geometry: ${source.name}`);
        }
        const original: THREE.BufferGeometry = mesh.geometry;
        if (original.index!.count !== source.sourceTriangles * 3 || await geometryHash(original) !== source.sourceHash) {
          throw new Error(`House stone source changed: ${source.name}`);
        }
        if (!Array.isArray(source.levels) || source.levels.length !== 2) throw new Error("Missing stone LOD levels");
        original.computeBoundingSphere();
        const entry: Entry = { mesh, levels: [{ geometry: original, error: 0 }],
          center: original.boundingSphere!.center.clone(), radius: original.boundingSphere!.radius, selected: 0 };
        lod.entries.push(entry);
        for (const level of source.levels) {
          const previous = entry.levels[entry.levels.length - 1];
          if (!Number.isInteger(level.triangles) || level.triangles <= 0 ||
              level.triangles * 3 >= previous.geometry.index!.count ||
              !Number.isFinite(level.error) || level.error <= previous.error) {
            throw new Error("Invalid stone LOD count/error");
          }
          const encoded = Uint8Array.from(atob(level.indices), char => char.charCodeAt(0));
          const indices = new Uint32Array(level.triangles * 3);
          MeshoptDecoder.decodeIndexBuffer(new Uint8Array(indices.buffer), indices.length, 4, encoded);
          if (await sha256(new Uint8Array(indices.buffer)) !== level.hash ||
              indices.some(index => index >= original.getAttribute("position").count)) {
            throw new Error("Corrupt house stone LOD indices");
          }
          const geometry = new THREE.BufferGeometry();
          for (const [name, attribute] of Object.entries(original.attributes)) geometry.setAttribute(name, attribute);
          geometry.setIndex(new THREE.BufferAttribute(indices, 1));
          geometry.boundingBox = original.boundingBox?.clone() ?? null;
          geometry.boundingSphere = original.boundingSphere!.clone();
          entry.levels.push({ geometry, error: level.error });
        }
      }
      return lod;
    } catch (error) {
      lod.dispose();
      throw error;
    }
  }

  update(camera: THREE.Camera, viewportHeight: number): void {
    if (!this.enabled || !(viewportHeight > 0)) return;
    camera.updateWorldMatrix(true, false);
    const focalPixels = Math.abs(camera.projectionMatrix.elements[5]) * viewportHeight / 2;
    const perspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
    for (const entry of this.entries) {
      if (!entry.mesh.visible || !entry.levels.some(level => level.geometry === entry.mesh.geometry)) continue;
      entry.mesh.updateWorldMatrix(true, false);
      const scale = entry.mesh.matrixWorld.getMaxScaleOnAxis();
      this.center.copy(entry.center).applyMatrix4(entry.mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      // Use the nearest point of the bounding sphere, rather than its origin.
      const depth = perspective ? Math.max(0.001, -this.center.z - entry.radius * scale) : 1;
      const pixelsPerLocalUnit = scale * focalPixels / depth;
      let selected = entry.selected;
      // Stay below one estimated CSS pixel; leave headroom before downgrading
      // so small camera movements do not repeatedly flip detail levels.
      while (selected > 0 && entry.levels[selected].error * pixelsPerLocalUnit > 1) selected--;
      while (selected + 1 < entry.levels.length && entry.levels[selected + 1].error * pixelsPerLocalUnit < 0.75) selected++;
      // Optional exterior policy keeps authored geometry near the complete bounds.
      if (this.closeupDistance > 0 && this.center.length() - entry.radius * scale < this.closeupDistance) selected = 0;
      entry.selected = selected;
      entry.mesh.geometry = entry.levels[selected].geometry;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) return;
    for (const entry of this.entries) {
      if (entry.levels.some(level => level.geometry === entry.mesh.geometry)) {
        entry.mesh.geometry = entry.levels[0].geometry;
        entry.selected = 0;
      }
    }
  }

  get stats() {
    return {
      meshes: this.entries.length,
      sourceTriangles: this.entries.reduce((sum, e) => sum + e.levels[0].geometry.index!.count / 3, 0),
      selectedTriangles: this.entries.reduce((sum, e) => sum +
        (e.mesh.geometry.index?.count ?? e.mesh.geometry.getAttribute("position")?.count ?? 0) / 3, 0),
    };
  }

  dispose(): void {
    for (const entry of this.entries) {
      if (entry.levels.some(level => level.geometry === entry.mesh.geometry)) entry.mesh.geometry = entry.levels[0].geometry;
      for (const level of entry.levels.slice(1)) {
        // Three's geometry disposal deletes attribute buffers too. These are
        // shared with the original, so release only our index/geometry state.
        for (const name of Object.keys(level.geometry.attributes)) level.geometry.deleteAttribute(name);
        level.geometry.dispose();
      }
    }
    this.entries.length = 0;
  }
}
