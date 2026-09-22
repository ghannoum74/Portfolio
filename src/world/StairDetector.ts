import * as THREE from "three";

export class StairDetector {
  private zone: THREE.Mesh;
  private bounds: THREE.Box3;

  private uphillDirection = new THREE.Vector3();
  private localPosition = new THREE.Vector3();

  constructor(environment: THREE.Object3D) {
    environment.updateMatrixWorld(true);

    const zone = environment.getObjectByName("ZONE_STAIRS_01");
    const bottom = environment.getObjectByName("STAIRS_01_BOTTOM");
    const top = environment.getObjectByName("STAIRS_01_TOP");

    if (!(zone instanceof THREE.Mesh) || !bottom || !top) {
      throw new Error("Missing ZONE_STAIRS_01 or staircase direction markers.");
    }

    this.zone = zone;

    this.zone.geometry.computeBoundingBox();

    if (!this.zone.geometry.boundingBox) {
      throw new Error("Staircase zone has no bounding box.");
    }

    // Keep the bounds in the cube's local coordinates.
    this.bounds = this.zone.geometry.boundingBox.clone();

    const bottomPosition = new THREE.Vector3();
    const topPosition = new THREE.Vector3();

    bottom.getWorldPosition(bottomPosition);
    top.getWorldPosition(topPosition);

    // Direction from the bottom of the stairs to the top.
    this.uphillDirection.subVectors(topPosition, bottomPosition).setY(0);

    if (this.uphillDirection.lengthSq() < 0.0001) {
      throw new Error("Staircase markers must have different X/Z positions.");
    }

    this.uphillDirection.normalize();

    // Hide the detection box.
    this.zone.visible = false;

    console.log("StairDetector initialized", {
      bottom: bottomPosition,
      top: topPosition,
      uphillDirection: this.uphillDirection,
    });
  }

  isAscending(
    playerposition: THREE.Vector3,
    movementDirection: THREE.Vector3,
  ): boolean {
    // convert player world position to the rotated
    // detection cube's local coordinate system
    this.localPosition.copy(playerposition);

    this.zone.worldToLocal(this.localPosition);

    // Player must actually be inside the zone.
    if (!this.bounds.containsPoint(this.localPosition)) {
      return false;
    }

    // Movement must point toward the upper marker.
    return movementDirection.dot(this.uphillDirection) > 0.55;
  }
}
