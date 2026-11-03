import * as THREE from "three";
import { PhysicsWorld } from "./PhysicsWorld";

export class WorldColliders {
  constructor(private physics: PhysicsWorld) {}

  createFromEnvironment(environment: THREE.Object3D): void {
    this.physics.invalidateStaticQueries();
    environment.updateMatrixWorld(true);

    environment.traverse((child) => {
      let current: THREE.Object3D | null = child;
      let owner: THREE.Object3D | null = null;

      while (current) {
        if (current.name.startsWith("ZONE_")) {
          if (current === child) {
            current.visible = false;
          }
          return;
        }

        if (
          !owner &&
          (current.name.startsWith("COL_") ||
            (current === child &&
              (current.name === "Land_01" || current.name === "Land_02")))
        )
          owner = current;

        current = current.parent;
      }

      if (owner?.name.startsWith("COL_")) owner.visible = false;

      if (!(child instanceof THREE.Mesh) || !owner) {
        return;
      }

      const name = owner.name;
      const isGround = name === "Land_01" || name === "Land_02";

      const isBox = name.startsWith("COL_BOX_");

      const isCylinder = name.startsWith("COL_CYL_");

      const isHull = name.startsWith("COL_HULL_");

      const isMesh = name.startsWith("COL_MESH_");

      const isOldCollider =
        name.startsWith("COL_") && !isBox && !isCylinder && !isMesh;

      if (isGround) {
        this.createTrimeshCollider(child);
        return;
      }

      if (isBox) {
        this.createBoxCollider(child);
        child.visible = false;
        return;
      }

      if (isCylinder) {
        this.createCylinderCollider(child);
        child.visible = false;
        return;
      }

      if (isHull) {
        this.createConvexHullCollider(child);
        child.visible = false;
        return;
      }

      if (isMesh || isOldCollider) {
        this.createTrimeshCollider(child);
        child.visible = false;
      }
    });
  }

  private createBoxCollider(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry;

    geometry.computeBoundingBox();

    if (!geometry.boundingBox) {
      return;
    }

    const localSize = new THREE.Vector3();

    geometry.boundingBox.getSize(localSize);

    const localCenter = new THREE.Vector3();

    geometry.boundingBox.getCenter(localCenter);

    const worldPosition = new THREE.Vector3();

    const worldQuaternion = new THREE.Quaternion();

    const worldScale = new THREE.Vector3();

    mesh.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

    const worldSize = localSize.clone();

    worldSize.x *= Math.abs(worldScale.x);

    worldSize.y *= Math.abs(worldScale.y);

    worldSize.z *= Math.abs(worldScale.z);

    const worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);

    const colliderDesc = this.physics.rapier.ColliderDesc.cuboid(
      worldSize.x / 2,
      worldSize.y / 2,
      worldSize.z / 2,
    );

    colliderDesc.setTranslation(worldCenter.x, worldCenter.y, worldCenter.z);

    colliderDesc.setRotation({
      x: worldQuaternion.x,
      y: worldQuaternion.y,
      z: worldQuaternion.z,
      w: worldQuaternion.w,
    });

    this.physics.world.createCollider(colliderDesc);
  }

  private createCylinderCollider(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry;

    geometry.computeBoundingBox();

    if (!geometry.boundingBox) {
      return;
    }

    const localSize = new THREE.Vector3();

    geometry.boundingBox.getSize(localSize);

    const localCenter = new THREE.Vector3();

    geometry.boundingBox.getCenter(localCenter);

    const worldPosition = new THREE.Vector3();

    const worldQuaternion = new THREE.Quaternion();

    const worldScale = new THREE.Vector3();

    mesh.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

    const sizeX = localSize.x * Math.abs(worldScale.x);

    const sizeY = localSize.y * Math.abs(worldScale.y);

    const sizeZ = localSize.z * Math.abs(worldScale.z);

    const radius = Math.max(sizeX, sizeZ) / 2;

    const halfHeight = sizeY / 2;

    const worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);

    const colliderDesc = this.physics.rapier.ColliderDesc.cylinder(
      halfHeight,
      radius,
    );

    colliderDesc.setTranslation(worldCenter.x, worldCenter.y, worldCenter.z);

    colliderDesc.setRotation({
      x: worldQuaternion.x,
      y: worldQuaternion.y,
      z: worldQuaternion.z,
      w: worldQuaternion.w,
    });

    this.physics.world.createCollider(colliderDesc);
  }

  private createConvexHullCollider(mesh: THREE.Mesh): void {
    const vertices = this.worldVertices(mesh);
    if (!vertices) return;

    const colliderDesc = this.physics.rapier.ColliderDesc.convexHull(vertices);

    if (!colliderDesc) {
      return;
    }

    this.physics.world.createCollider(colliderDesc);
  }

  private worldVertices(mesh: THREE.Mesh): Float32Array | null {
    const position = mesh.geometry.getAttribute("position");
    if (!position) return null;
    const vertices = new Float32Array(position.count * 3);
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      vertices[i * 3] = point.x;
      vertices[i * 3 + 1] = point.y;
      vertices[i * 3 + 2] = point.z;
    }
    return vertices;
  }

  private createTrimeshCollider(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry;
    const vertices = this.worldVertices(mesh);
    if (!vertices) return;

    let indices: Uint32Array;

    if (geometry.index) {
      indices = new Uint32Array(geometry.index.array);
    } else {
      indices = new Uint32Array(vertices.length / 3);

      for (let i = 0; i < indices.length; i++) {
        indices[i] = i;
      }
    }

    const colliderDesc = this.physics.rapier.ColliderDesc.trimesh(
      vertices,
      indices,
    );

    this.physics.world.createCollider(colliderDesc);
  }
}
