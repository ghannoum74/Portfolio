import * as THREE from "three";
import { PhysicsWorld } from "../physics/PhysicsWorld";

interface CameraCollisionResult {
  position: THREE.Vector3;
  blocked: boolean;
}

export class CameraCollision {
  private readonly radius = 0.25;

  //Keep the camera slightly away from the surface it hits.
  private readonly padding = 0.08;
  private readonly shape;
  private readonly direction = new THREE.Vector3();
  private readonly lastTarget = new THREE.Vector3();
  private readonly lastDesiredPosition = new THREE.Vector3();
  private readonly queryRotation = { x: 0, y: 0, z: 0, w: 1 };
  private lastRevision = -1;
  private cached = false;
  private readonly result: CameraCollisionResult = {
    position: new THREE.Vector3(),
    blocked: false,
  };

  constructor(private readonly physics: PhysicsWorld) {
    this.shape = new this.physics.rapier.Ball(this.radius);
  }

  resolve(
    target: THREE.Vector3,
    desiredPosition: THREE.Vector3,
  ): CameraCollisionResult {
    const revision = this.physics.staticColliderRevision;
    // This query includes ONLY_FIXED. Kinematic player/NPC motion cannot change it.
    if (this.cached && revision === this.lastRevision &&
        target.equals(this.lastTarget) && desiredPosition.equals(this.lastDesiredPosition)) return this.result;
    this.cached = false;
    this.direction.copy(desiredPosition).sub(target);

    const distance = this.direction.length();

    if (distance <= 0.001) {
      this.result.position.copy(desiredPosition);

      this.result.blocked = false;

      this.cache(target, desiredPosition, revision);
      return this.result;
    }

    this.direction.divideScalar(distance);

    // this is check if the target between the player and the camera has any abstcled
    const hit = this.physics.world.castShape(
      target,
      this.queryRotation,
      this.direction,
      this.shape,
      0,
      distance,
      true,
      this.physics.rapier.QueryFilterFlags.ONLY_FIXED,
    );

    if (!hit) {
      this.result.position.copy(desiredPosition);

      this.result.blocked = false;

      this.cache(target, desiredPosition, revision);
      return this.result;
    }

    // A minimum boom length can put the camera through a nearby wall. Permit a
    // fully shortened arm rather than advancing beyond the measured clearance.
    const safeDistance = Math.max(0, hit.time_of_impact - this.padding);

    this.result.position
      .copy(target)
      .addScaledVector(this.direction, safeDistance);

    this.result.blocked = true;

    this.cache(target, desiredPosition, revision);
    return this.result;
  }

  private cache(target: THREE.Vector3, desiredPosition: THREE.Vector3, revision: number): void {
    this.lastTarget.copy(target);
    this.lastDesiredPosition.copy(desiredPosition);
    this.lastRevision = revision;
    this.cached = true;
  }
}
