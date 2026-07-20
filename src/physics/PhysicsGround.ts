import * as CANNON from "cannon-es";
import { PhysicsObject } from "./PhysicsObject";

export class PhysicsGround extends PhysicsObject {
  constructor() {
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
    });

    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    super(body);
  }
}
