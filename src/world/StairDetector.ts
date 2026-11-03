import * as THREE from "three";

interface StairZone {
  name: string;
  mesh: THREE.Mesh;
  bounds: THREE.Box3;
  uphillDirection: THREE.Vector3;
}

export class StairDetector {
  private zones: StairZone[] = [];

  private localPosition = new THREE.Vector3();
  private horizontalMovement = new THREE.Vector3();

  constructor(environment: THREE.Object3D) {
    environment.updateMatrixWorld(true);

    const staircaseIds = ["01", "02"];

    for (const id of staircaseIds) {
      const zone = environment.getObjectByName(`ZONE_STAIRS_${id}`);

      const bottom = environment.getObjectByName(`STAIRS_BOTTOM_${id}`);

      const top = environment.getObjectByName(`STAIRS_TOP_${id}`);

      if (!(zone instanceof THREE.Mesh) || !bottom || !top) {
        throw new Error(`Missing staircase zone or markers for stairs ${id}`);
      }

      zone.geometry.computeBoundingBox();

      if (!zone.geometry.boundingBox) {
        throw new Error(`Staircase ${id} has no bounding box.`);
      }

      const bottomPosition = new THREE.Vector3();
      const topPosition = new THREE.Vector3();

      bottom.getWorldPosition(bottomPosition);
      top.getWorldPosition(topPosition);

      const uphillDirection = new THREE.Vector3()
        .subVectors(topPosition, bottomPosition)
        .setY(0);

      if (uphillDirection.lengthSq() < 0.0001) {
        throw new Error(
          `Staircase ${id} markers need different X/Z positions.`,
        );
      }

      uphillDirection.normalize();

      this.zones.push({
        name: zone.name,
        mesh: zone,
        bounds: zone.geometry.boundingBox.clone(),
        uphillDirection,
      });

      zone.visible = false;
    }
  }

  isAscending(
    playerPosition: THREE.Vector3,
    movementDirection: THREE.Vector3,
  ): boolean {
    this.horizontalMovement.copy(movementDirection).setY(0);

    if (this.horizontalMovement.lengthSq() < 0.0001) {
      return false;
    }

    this.horizontalMovement.normalize();

    for (const zone of this.zones) {
      this.localPosition.copy(playerPosition);

      zone.mesh.worldToLocal(this.localPosition);

      if (!zone.bounds.containsPoint(this.localPosition)) {
        continue;
      }

      const dot = this.horizontalMovement.dot(zone.uphillDirection);

      if (dot > 0.55) {
        return true;
      }
    }

    return false;
  }
}
