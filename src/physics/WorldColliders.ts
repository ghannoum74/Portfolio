import * as THREE from "three";
import { PhysicsWorld } from "./PhysicsWorld";

export class WorldColliders {
  constructor(private physics: PhysicsWorld) {}

  createFromEnvironment(environment: THREE.Object3D): void {
    environment.updateMatrixWorld(true);

    environment.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const isGround = child.name === "Land_01" || child.name === "Land_02";

      const isBox = child.name.startsWith("COL_BOX_");

      const isCylinder = child.name.startsWith("COL_CYL_");

      const isHull = child.name.startsWith("COL_HULL_");

      const isMesh = child.name.startsWith("COL_MESH_");

      /*
       * Backward compatibility with your current
       * COL_Tree_01 collider.
       *
       * Eventually I would rename these to one of:
       *
       * COL_BOX_
       * COL_CYL_
       * COL_MESH_
       */
      const isOldCollider =
        child.name.startsWith("COL_") && !isBox && !isCylinder && !isMesh;

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

  /*
   * --------------------------------------------------
   * BOX COLLIDER
   * --------------------------------------------------
   */

  private createBoxCollider(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry;

    geometry.computeBoundingBox();

    if (!geometry.boundingBox) {
      return;
    }

    /*
     * Get the geometry's local size.
     */
    const localSize = new THREE.Vector3();

    geometry.boundingBox.getSize(localSize);

    /*
     * Get local center.
     *
     * Usually this will be 0,0,0,
     * but we should not assume that.
     */
    const localCenter = new THREE.Vector3();

    geometry.boundingBox.getCenter(localCenter);

    /*
     * Decompose the object's WORLD transform.
     */
    const worldPosition = new THREE.Vector3();

    const worldQuaternion = new THREE.Quaternion();

    const worldScale = new THREE.Vector3();

    mesh.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

    /*
     * Convert local geometry size into
     * world-space dimensions.
     */
    const worldSize = localSize.clone();

    worldSize.x *= Math.abs(worldScale.x);

    worldSize.y *= Math.abs(worldScale.y);

    worldSize.z *= Math.abs(worldScale.z);

    /*
     * Geometry center transformed into
     * actual world position.
     */
    const worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);

    /*
     * Rapier cuboid expects HALF extents.
     */
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

    console.log(`📦 Box collider: ${mesh.name}`);
  }

  /*
   * --------------------------------------------------
   * CYLINDER COLLIDER
   * --------------------------------------------------
   */

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

    /*
     * Rapier cylinder is aligned along Y.
     *
     * radius = horizontal size
     * halfHeight = vertical size / 2
     */
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

    console.log(`🟢 Cylinder collider: ${mesh.name}`);
  }

  private createConvexHullCollider(mesh: THREE.Mesh): void {
    /*
     * Clone so we don't modify the visual geometry.
     */
    const geometry = mesh.geometry.clone();

    /*
     * Bake:
     *
     * position
     * rotation
     * scale
     * parent transforms
     *
     * directly into the collider vertices.
     */
    geometry.applyMatrix4(mesh.matrixWorld);

    const position = geometry.getAttribute("position");

    if (!position) {
      geometry.dispose();
      return;
    }

    /*
     * Rapier convexHull expects:
     *
     * [
     *   x, y, z,
     *   x, y, z,
     *   ...
     * ]
     */
    const vertices = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      vertices[i * 3] = position.getX(i);

      vertices[i * 3 + 1] = position.getY(i);

      vertices[i * 3 + 2] = position.getZ(i);
    }

    const colliderDesc = this.physics.rapier.ColliderDesc.convexHull(vertices);

    if (!colliderDesc) {
      geometry.dispose();
      return;
    }

    this.physics.world.createCollider(colliderDesc);

    console.log(`🪨 Convex hull collider: ${mesh.name}`);

    geometry.dispose();
  }

  /*
   * --------------------------------------------------
   * TRIMESH COLLIDER
   * --------------------------------------------------
   */

  private createTrimeshCollider(mesh: THREE.Mesh): void {
    const geometry = mesh.geometry.clone();

    geometry.applyMatrix4(mesh.matrixWorld);

    const position = geometry.getAttribute("position");

    if (!position) {
      geometry.dispose();
      return;
    }

    const vertices = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      vertices[i * 3] = position.getX(i);

      vertices[i * 3 + 1] = position.getY(i);

      vertices[i * 3 + 2] = position.getZ(i);
    }

    let indices: Uint32Array;

    if (geometry.index) {
      indices = new Uint32Array(geometry.index.array);
    } else {
      indices = new Uint32Array(position.count);

      for (let i = 0; i < position.count; i++) {
        indices[i] = i;
      }
    }

    const colliderDesc = this.physics.rapier.ColliderDesc.trimesh(
      vertices,
      indices,
    );

    this.physics.world.createCollider(colliderDesc);

    console.log(`🔺 Trimesh collider: ${mesh.name}`);

    geometry.dispose();
  }
}
