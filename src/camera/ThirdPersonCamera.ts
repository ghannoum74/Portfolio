import * as THREE from "three";
import { CameraCollision } from "./CameraCollision";
import { PhysicsWorld } from "../physics/PhysicsWorld";

export class ThirdPersonCamera {
  private readonly exteriorOffset = new THREE.Vector3(0, 5, -7);
  private readonly exteriorLookAtOffset = new THREE.Vector3(0, 2, 0);
  private readonly interiorOffset = new THREE.Vector3(0, 2.6, -3.6);
  private readonly interiorLookAtOffset = new THREE.Vector3(0, 1.25, 0);
  private interiorMode = false;

  // Temporary orbit produced by dragging. These always return to zero when the mouse is released.

  private orbitYaw = 0;
  private orbitPitch = 0;
  private dragging = false;
  private inputEnabled = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Camera drag tuning.
  private readonly dragSensitivity = 0.005;
  /*
   * Maximum temporary rotation.
   *
   * Horizontal:
   * about 80 degrees left/right.
   *
   * Vertical:
   * about 20 degrees up/down.
   */

  private readonly maxOrbitPitch = THREE.MathUtils.degToRad(30);

  // How quickly camera returns behind the player after mouse release.
  private readonly returnSpeed = 5;
  private exteriorZoom = 1;
  private targetExteriorZoom = 1;
  private readonly minExteriorZoom = 0.8;
  private readonly maxExteriorZoom = 2;
  private readonly zoomStep = 0.08;

  // Entrance camera.
  private readonly entranceOffset = new THREE.Vector3(16, 8, 8);
  private readonly entranceControlOffset = new THREE.Vector3(9, 10, 2);
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempLookAt = new THREE.Vector3();
  private readonly startPosition = new THREE.Vector3();
  private readonly controlPosition = new THREE.Vector3();
  private readonly gameplayPosition = new THREE.Vector3();
  private readonly entranceLookAt = new THREE.Vector3();
  private readonly gameplayLookAt = new THREE.Vector3();

  // Reused objects so we're not allocating Spherical/Vector objects every frame.
  private readonly baseSpherical = new THREE.Spherical();
  private readonly cameraSpherical = new THREE.Spherical();
  private readonly cameraOffset = new THREE.Vector3();
  private readonly cameraCollision: CameraCollision;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly player: THREE.Object3D,
    private readonly domElement: HTMLElement,
    physics: PhysicsWorld,
  ) {
    this.cameraCollision = new CameraCollision(physics);
    this.domElement.addEventListener("pointerdown", this.onPointerDown);

    this.domElement.addEventListener("pointermove", this.onPointerMove);

    this.domElement.addEventListener("pointerup", this.onPointerUp);

    this.domElement.addEventListener("pointercancel", this.onPointerUp);

    this.domElement.addEventListener("wheel", this.onWheel, {
      passive: false,
    });

    window.addEventListener("blur", this.onWindowBlur);
  }

  updateEntrance(progress: number): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1);

    const movementProgress = THREE.MathUtils.smoothstep(p, 0, 1);

    this.gameplayPosition.copy(this.getIdealPosition());

    this.startPosition.copy(this.player.position).add(this.entranceOffset);

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

    this.entranceLookAt.set(
      this.player.position.x,
      this.player.position.y + 1,
      this.player.position.z + 5,
    );

    this.gameplayLookAt.copy(this.getIdealLookAt());

    const focusProgress = THREE.MathUtils.smoothstep(p, 0.6, 1);

    this.tempLookAt.lerpVectors(
      this.entranceLookAt,
      this.gameplayLookAt,
      focusProgress,
    );

    this.camera.lookAt(this.tempLookAt);
  }

  update(delta: number): void {
    /*
     * Once dragging stops, return the
     * temporary camera rotation to zero.
     */
    if (!this.dragging) {
      const returnSmoothness = 1 - Math.exp(-this.returnSpeed * delta);

      this.orbitYaw = THREE.MathUtils.lerp(this.orbitYaw, 0, returnSmoothness);

      this.orbitPitch = THREE.MathUtils.lerp(
        this.orbitPitch,
        0,
        returnSmoothness,
      );

      /*
       * Avoid tiny floating point values
       * continuing forever.
       */
      if (Math.abs(this.orbitYaw) < 0.0001) {
        this.orbitYaw = 0;
      }

      if (Math.abs(this.orbitPitch) < 0.0001) {
        this.orbitPitch = 0;
      }
    }

    /*
     * Smooth exterior zoom rather than
     * jumping instantly on wheel input.
     */
    const zoomSmoothness = 1 - Math.exp(-7 * delta);

    this.exteriorZoom = THREE.MathUtils.lerp(
      this.exteriorZoom,
      this.targetExteriorZoom,
      zoomSmoothness,
    );

    // Higher response while dragging, softer normal follow otherwise.

    const followSpeed = this.dragging ? 14 : 5;
    const smoothness = 1 - Math.exp(-followSpeed * delta);
    const lookAt = this.getIdealLookAt();
    const idealPosition = this.getIdealPosition();
    const collision = this.cameraCollision.resolve(lookAt, idealPosition);

    /*
     * If a wall suddenly appears between
     * player and camera, pull the camera in
     * immediately.
     *
     * Don't slowly lerp through the wall.
     */
    if (collision.blocked) {
      this.camera.position.copy(collision.position);
    } else {
      // When space becomes available again, smoothly move back to normal distance.
      this.camera.position.lerp(collision.position, smoothness);
    }

    this.camera.lookAt(lookAt);
  }

  private getIdealPosition(): THREE.Vector3 {
    const offset = this.interiorMode
      ? this.interiorOffset
      : this.exteriorOffset;

    /*
     * Convert our default camera offset
     * into spherical coordinates.
     *
     * This makes temporary orbiting much
     * cleaner than manually rotating X/Y.
     */
    this.baseSpherical.setFromVector3(offset);
    this.cameraSpherical.copy(this.baseSpherical);

    /*
     * Zoom only exists outside.
     */
    if (!this.interiorMode) {
      this.cameraSpherical.radius *= this.exteriorZoom;
    }

    // Temporary mouse orbit.

    this.cameraSpherical.theta += this.orbitYaw;
    this.cameraSpherical.phi += this.orbitPitch;

    /*
     * Prevent the camera from reaching
     * the vertical poles.
     */
    this.cameraSpherical.makeSafe();

    this.cameraOffset.setFromSpherical(this.cameraSpherical);

    /*
     * Camera remains relative to whatever
     * direction the player is facing.
     */
    this.cameraOffset.applyQuaternion(this.player.quaternion);

    return this.tempPosition.copy(this.player.position).add(this.cameraOffset);
  }

  private getIdealLookAt(): THREE.Vector3 {
    const offset = this.interiorMode
      ? this.interiorLookAtOffset
      : this.exteriorLookAtOffset;

    return this.tempLookAt.copy(this.player.position).add(offset);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.inputEnabled || event.button !== 0) {
      return;
    }

    this.dragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.domElement.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.inputEnabled || !this.dragging) {
      return;
    }

    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    // Horizontal camera rotation.
    this.orbitYaw -= deltaX * this.dragSensitivity;

    // Vertical camera rotation.
    this.orbitPitch -= deltaY * this.dragSensitivity;

    this.orbitPitch = THREE.MathUtils.clamp(
      this.orbitPitch,
      -this.maxOrbitPitch,
      this.maxOrbitPitch,
    );
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }

    this.dragging = false;

    /*
     * Make the return use the shortest
     * direction back to the default camera.
     */
    this.orbitYaw = this.normalizeAngle(this.orbitYaw);

    if (this.domElement.hasPointerCapture(event.pointerId)) {
      this.domElement.releasePointerCapture(event.pointerId);
    }
  };

  private onWheel = (event: WheelEvent): void => {
    /*
     * Wheel zoom is intentionally
     * unavailable inside the house.
     */
    if (!this.inputEnabled || this.interiorMode) {
      return;
    }

    event.preventDefault();

    const direction = Math.sign(event.deltaY);

    this.targetExteriorZoom += direction * this.zoomStep;

    this.targetExteriorZoom = THREE.MathUtils.clamp(
      this.targetExteriorZoom,
      this.minExteriorZoom,
      this.maxExteriorZoom,
    );
  };

  private onWindowBlur = (): void => {
    this.dragging = false;
  };

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

    /*
     * Never carry a temporary camera
     * rotation through a scene transition.
     */
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.dragging = false;
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;

    if (!enabled) {
      this.dragging = false;
    }
  }

  snap(): void {
    this.orbitYaw = 0;
    this.orbitPitch = 0;

    this.camera.position.copy(this.getIdealPosition());

    this.camera.lookAt(this.getIdealLookAt());
  }

  private normalizeAngle(angle: number): number {
    return (
      THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI
    );
  }
}
