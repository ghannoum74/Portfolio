import * as THREE from "three";
import type { Collider, RigidBody } from "@dimforge/rapier3d-compat";
import type { PhysicsWorld } from "../../physics/PhysicsWorld";

export const NPC_COLLIDER_PREFIX = "COL_CAPSULE_NPC_";

/** Capsule dimensions/center in character GLB scene coordinates, before NPC scale. */
export interface NpcCapsuleDefinition {
  radius: number;
  height: number;
  center: readonly [number, number, number];
}

export function isNpcColliderHelper(object: THREE.Object3D): boolean {
  return object.name.startsWith("COL_") || object.userData.portfolioNpcCollider === true;
}

/** One body capsule, independent of bone animation and camera obstacles. */
export class NpcCollider {
  readonly collider: Collider;
  private readonly body: RigidBody;
  private readonly center = new THREE.Vector3();
  private readonly lastCenter = new THREE.Vector3();
  private enabled: boolean;
  private disposed = false;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly marker: THREE.Object3D,
    private readonly localCenter: THREE.Vector3,
    radius: number,
    fullHeight: number,
    enabled: boolean,
  ) {
    this.center.copy(localCenter).applyMatrix4(marker.matrixWorld);
    this.lastCenter.copy(this.center);
    // Kinematic bodies block the player controller without entering the camera's
    // ONLY_FIXED wall queries. NPCs cannot be pushed by walking into them.
    this.body = physics.world.createRigidBody(
      physics.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(this.center.x, this.center.y, this.center.z),
    );
    try {
      this.collider = physics.world.createCollider(
        physics.rapier.ColliderDesc.capsule(fullHeight / 2 - radius, radius),
        this.body,
      );
    } catch (error) {
      physics.world.removeRigidBody(this.body);
      throw error;
    }
    physics.colliderNames.set(this.collider.handle, marker.name);
    this.enabled = enabled;
    this.body.setEnabled(enabled);
  }

  sync(): void {
    if (this.disposed || !this.enabled) return;
    this.marker.updateWorldMatrix(true, false);
    this.center.copy(this.localCenter).applyMatrix4(this.marker.matrixWorld);
    if (!this.center.equals(this.lastCenter)) {
      this.body.setNextKinematicTranslation(this.center);
      this.lastCenter.copy(this.center);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.enabled) return;
    this.enabled = enabled;
    this.body.setEnabled(enabled);
    if (enabled) {
      this.marker.updateWorldMatrix(true, false);
      this.center.copy(this.localCenter).applyMatrix4(this.marker.matrixWorld);
      this.body.setTranslation(this.center, true);
      this.body.setNextKinematicTranslation(this.center);
      this.lastCenter.copy(this.center);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.physics.colliderNames.delete(this.collider.handle);
    this.physics.world.removeRigidBody(this.body);
    this.disposed = true;
  }
}

function configuredCapsule(model: THREE.Group, physics: PhysicsWorld,
  enabled: boolean, definition: NpcCapsuleDefinition): NpcCollider {
  const { radius, height, center } = definition;
  if (![radius, height, ...center].every(Number.isFinite) || radius <= 0 || height < radius * 2) {
    throw new Error(`[${model.name}] Invalid configured NPC capsule`);
  }
  model.updateWorldMatrix(true, false);
  const scale = model.getWorldScale(new THREE.Vector3());
  const worldRadius = radius * Math.max(Math.abs(scale.x), Math.abs(scale.z));
  const worldHeight = height * Math.abs(scale.y);
  if (!(worldRadius > 0) || worldHeight < worldRadius * 2) {
    throw new Error(`[${model.name}] Invalid NPC capsule scale`);
  }
  return new NpcCollider(physics, model, new THREE.Vector3(...center), worldRadius, worldHeight, enabled);
}

/** Explicit runtime dimensions work with existing GLBs; Blender markers override them. */
export function createNpcCollider(
  model: THREE.Group,
  physics: PhysicsWorld,
  enabled: boolean,
  definition?: NpcCapsuleDefinition,
): NpcCollider | null {
  const markers: THREE.Object3D[] = [];
  model.traverse(object => {
    if (isNpcColliderHelper(object)) object.visible = false;
    if (object.name.startsWith(NPC_COLLIDER_PREFIX)) markers.push(object);
  });
  if (markers.length === 0) {
    if (definition) return configuredCapsule(model, physics, enabled, definition);
    console.warn(`[${model.name}] No NPC capsule configuration or Blender marker.`);
    return null;
  }
  try {
    if (markers.length !== 1) throw new Error("Export exactly one COL_CAPSULE_NPC_ mesh per character");
    const marker = markers[0];
    if (!(marker instanceof THREE.Mesh) || marker instanceof THREE.SkinnedMesh) {
      throw new Error("The collider must be a separate, unskinned mesh");
    }
    for (let parent = marker.parent; parent && parent !== model; parent = parent.parent) {
      if (parent instanceof THREE.Bone) throw new Error("Do not parent the collider to a bone");
    }
    marker.updateWorldMatrix(true, false);
    marker.geometry.computeBoundingBox();
    const bounds = marker.geometry.boundingBox;
    const vertices = marker.geometry.getAttribute("position");
    if (!bounds || bounds.isEmpty() || !vertices?.count) throw new Error("The collider mesh has no bounds");
    const localCenter = bounds.getCenter(new THREE.Vector3());
    const center = localCenter.clone().applyMatrix4(marker.matrixWorld);
    const point = new THREE.Vector3();
    let radius = 0, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(marker.matrixWorld);
      if (!point.toArray().every(Number.isFinite)) throw new Error("Non-finite collider coordinates");
      radius = Math.max(radius, Math.hypot(point.x - center.x, point.z - center.z));
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    const fullHeight = maxY - minY;
    if (!(radius > 0) || fullHeight < radius * 2 - 1e-6) {
      throw new Error("The capsule must be upright and at least as tall as its diameter");
    }
    return new NpcCollider(physics, marker, localCenter, radius, Math.max(fullHeight, radius * 2), enabled);
  } catch (error) {
    console.warn(`[${model.name}] Invalid Blender NPC capsule; ${definition ? "using the configured capsule" : "collision disabled until the asset is corrected"}:`, error);
    if (definition) return configuredCapsule(model, physics, enabled, definition);
    return null;
  }
}
