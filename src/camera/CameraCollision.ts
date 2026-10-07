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
    this.direction.copy(desiredPosition).sub(target);

    const distance = this.direction.length();

    if (distance <= 0.001) {
      this.result.position.copy(desiredPosition);

      this.result.blocked = false;

      return this.result;
    }

    this.direction.divideScalar(distance);

    // this is check if the target between the player and the camera has any abstcled
    const hit = this.physics.world.castShape(
      {
        x: target.x,
        y: target.y,
        z: target.z,
      },

      {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      },

      {
        x: this.direction.x,
        y: this.direction.y,
        z: this.direction.z,
      },
      this.shape,
      0,
      distance,
      true,
      this.physics.rapier.QueryFilterFlags.ONLY_FIXED,
    );

    if (!hit) {
      this.result.position.copy(desiredPosition);

      this.result.blocked = false;

      return this.result;
    }

    const safeDistance = Math.max(0.15, hit.time_of_impact - this.padding);

    this.result.position
      .copy(target)
      .addScaledVector(this.direction, safeDistance);

    this.result.blocked = true;

    return this.result;
  }
}
