import * as THREE from "three";

export class ThirdPersonCamera {
  private offset = new THREE.Vector3(0, 7, -7);
  private lookAtOffset = new THREE.Vector3(0, 2, 0);

  constructor(
    private camera: THREE.PerspectiveCamera,
    private player: THREE.Object3D,
  ) {}

  update(delta: number) {
    const cameraOffset = this.offset.clone();

    // this is responsible to rotate the camera around the player based on the player's rotation
    cameraOffset.applyQuaternion(this.player.quaternion);

    const idealPosition = this.player.position.clone().add(cameraOffset);
    const smoothness = 1 - Math.exp(-5 * delta);

    this.camera.position.lerp(idealPosition, smoothness);

    const lookAt = this.player.position.clone().add(this.lookAtOffset);

    this.camera.lookAt(lookAt);
  }
}
