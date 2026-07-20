import * as CANNON from "cannon-es";
import { PhysicsObject } from "./PhysicsObject";

export class PhysicsWorld {
  private readonly world: CANNON.World;
  private readonly fixedTimeStep = 1 / 60;
  private readonly maxSubSteps = 3;

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
    });
  }

  add(object: PhysicsObject) {
    this.world.addBody(object.body);
  }

  remove(object: PhysicsObject) {
    this.world.removeBody(object.body);
  }

  step(delta: number) {
    this.world.step(this.fixedTimeStep, delta, this.maxSubSteps);
  }
}
