import * as THREE from "three";

export class ThirdPersonCamera {
  private readonly exteriorOffset = new THREE.Vector3(0, 5, -7);

  private readonly exteriorLookAtOffset = new THREE.Vector3(0, 2, 0);

  private readonly interiorOffset = new THREE.Vector3(0, 2.6, -3.6);

  private readonly interiorLookAtOffset = new THREE.Vector3(0, 1.25, 0);

  private interiorMode = false;

  private readonly entranceOffset = new THREE.Vector3(16, 8, 8);

  private readonly entranceControlOffset = new THREE.Vector3(9, 10, 2);

  private readonly tempPosition = new THREE.Vector3();

  private readonly tempLookAt = new THREE.Vector3();

  private readonly startPosition = new THREE.Vector3();

  private readonly controlPosition = new THREE.Vector3();

  private readonly gameplayPosition = new THREE.Vector3();

  private readonly entranceLookAt = new THREE.Vector3();

  private readonly gameplayLookAt = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly player: THREE.Object3D,
  ) {}

  updateEntrance(progress: number): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1);

    /*
     * Smooth the camera movement.
     */
    const movementProgress = THREE.MathUtils.smoothstep(p, 0, 1);

    /*
     * Final gameplay camera.
     */
    this.gameplayPosition.copy(this.getIdealPosition());

    /*
     * Entrance begins on the right side
     * of the player/world.
     */
    this.startPosition.copy(this.player.position).add(this.entranceOffset);

    /*
     * Middle control point creates the
     * curved sideways sweep.
     */
    this.controlPosition
      .copy(this.player.position)
      .add(this.entranceControlOffset);

    this.quadraticBezier(
      this.startPosition,
      this.controlPosition,
      this.gameplayPosition,
      movementProgress,
      this.tempPosition,
    );

    this.camera.position.copy(this.tempPosition);

    /*
     * Initial camera looks more toward
     * the world rather than directly
     * locking onto the player.
     */
    this.entranceLookAt.set(
      this.player.position.x,
      this.player.position.y + 1,
      this.player.position.z + 5,
    );

    this.gameplayLookAt.copy(this.getIdealLookAt());

    /*
     * Start focusing on the player only
     * during the last ~40% of the reveal.
     */
    const focusProgress = THREE.MathUtils.smoothstep(p, 0.6, 1);

    this.tempLookAt.lerpVectors(
      this.entranceLookAt,
      this.gameplayLookAt,
      focusProgress,
    );

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
    const offset = this.interiorMode
      ? this.interiorOffset
      : this.exteriorOffset;

    const cameraOffset = offset.clone();

    cameraOffset.applyQuaternion(this.player.quaternion);

    return this.player.position.clone().add(cameraOffset);
  }

  private getIdealLookAt(): THREE.Vector3 {
    const offset = this.interiorMode
      ? this.interiorLookAtOffset
      : this.exteriorLookAtOffset;

    return this.player.position.clone().add(offset);
  }

  private quadraticBezier(
    start: THREE.Vector3,
    control: THREE.Vector3,
    end: THREE.Vector3,
    t: number,
    target: THREE.Vector3,
  ): void {
    const inverse = 1 - t;

    target.set(
      inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,

      inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,

      inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z,
    );
  }

  setInteriorMode(enabled: boolean): void {
    this.interiorMode = enabled;
  }

  snap(): void {
    this.camera.position.copy(this.getIdealPosition());

    this.camera.lookAt(this.getIdealLookAt());
  }
}
