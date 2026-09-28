import * as THREE from "three";

export class ThirdPersonCamera {
  private readonly offset = new THREE.Vector3(0, 7, -7);
  private readonly lookAtOffset = new THREE.Vector3(0, 2, 0);

  /*
   * Exact camera state shown when the entrance begins.
   */
  private readonly entrancePosition: THREE.Vector3;
  private readonly entranceLookAt: THREE.Vector3;

  private readonly tempPosition = new THREE.Vector3();
  private readonly tempLookAt = new THREE.Vector3();
  private readonly cameraDirection = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly player: THREE.Object3D,
  ) {
    /*
     * Game already positioned the camera before this
     * controller is created.
     *
     * Capture that exact view and use it as the beginning
     * of the entrance animation.
     */
    this.entrancePosition = this.camera.position.clone();

    this.camera.getWorldDirection(this.cameraDirection);

    this.entranceLookAt = this.camera.position
      .clone()
      .add(this.cameraDirection.multiplyScalar(10));
  }

  /**
   * Used only while the entrance scroll is active.
   *
   * progress:
   * 0 = original cinematic entrance camera
   * 1 = exact gameplay camera position
   */
  updateEntrance(progress: number): void {
    const t = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp(progress, 0, 1),
      0,
      1,
    );

    const gameplayPosition = this.getIdealPosition();
    const gameplayLookAt = this.getIdealLookAt();

    this.tempPosition.lerpVectors(this.entrancePosition, gameplayPosition, t);

    this.tempLookAt.lerpVectors(this.entranceLookAt, gameplayLookAt, t);

    this.camera.position.copy(this.tempPosition);
    this.camera.lookAt(this.tempLookAt);
  }

  /**
   * Normal gameplay camera.
   */
  update(delta: number): void {
    const idealPosition = this.getIdealPosition();
    const smoothness = 1 - Math.exp(-5 * delta);

    this.camera.position.lerp(idealPosition, smoothness);

    this.camera.lookAt(this.getIdealLookAt());
  }

  private getIdealPosition(): THREE.Vector3 {
    const cameraOffset = this.offset.clone();

    cameraOffset.applyQuaternion(this.player.quaternion);

    return this.player.position.clone().add(cameraOffset);
  }

  private getIdealLookAt(): THREE.Vector3 {
    return this.player.position.clone().add(this.lookAtOffset);
  }
}
