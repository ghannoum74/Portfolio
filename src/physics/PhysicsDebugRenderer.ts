import * as THREE from "three";
import { PhysicsWorld } from "./PhysicsWorld";

export class PhysicsDebugRenderer {
  private geometry = new THREE.BufferGeometry();

  private material = new THREE.LineBasicMaterial({
    vertexColors: true,
  });

  private lines = new THREE.LineSegments(this.geometry, this.material);

  constructor(
    private scene: THREE.Scene,
    private physics: PhysicsWorld,
  ) {
    this.lines.frustumCulled = false;

    this.scene.add(this.lines);
  }

  update(): void {
    const debugRender = this.physics.world.debugRender();

    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(debugRender.vertices, 3),
    );

    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(debugRender.colors, 4),
    );
  }

  setVisible(visible: boolean): void {
    this.lines.visible = visible;
  }
}
