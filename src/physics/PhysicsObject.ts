import * as CANNON from "cannon-es";

export abstract class PhysicsObject {
  public readonly body: CANNON.Body;

  protected constructor(body: CANNON.Body) {
    this.body = body;
  }
}
