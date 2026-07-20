import * as CANNON from "cannon-es";
import { PhysicsObject } from "./PhysicsObject";

export class PhysicsPlayer extends PhysicsObject {
  readonly height = 1.8;

  constructor() {
    const radius = 0.35;
    const body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Cylinder(radius, radius, 1.8, 12),
      position: new CANNON.Vec3(0, 1.8 / 2, 0),
      fixedRotation: true,
      linearDamping: 0.05,
    });

    body.updateMassProperties();

    super(body);
  }

  setHorizontalVelocity(x: number, z: number) {
    this.body.velocity.x = x;
    this.body.velocity.z = z;
  }

  setYaw(yaw: number) {
    this.body.quaternion.setFromEuler(0, yaw, 0);
  }

  jump(speed: number) {
    this.body.velocity.y = speed;
  }
}
