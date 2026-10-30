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
  private dragPointer: number | null = null;
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
  private readonly turnCollision: CameraCollision;
  private readonly turnOffset = new THREE.Vector3();
  private readonly turnPosition = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly turnPrediction = { blocked: false, distance: 0, time: 0 };
  private previousIdealYaw = 0;
  private turnReady = false;
  private turnVelocity = 0;
  private plannedTurnTime = 0;
  private plannedTurnDistance = 0;
  private plannedTurnDirection = 0;
  private readonly plannedTurnTarget = new THREE.Vector3();
  // Follow the requested shot continuously, including while obstructed. Feeding
  // the shortened camera position back into follow switches behavior at edges.
  private readonly followPosition = new THREE.Vector3();
  private followReady = false;
  private recoveringDistance = false;
  private collisionDistance = 0;
  private clearTime = 0;
  private readonly clearanceDelay = 0.1;
  private readonly anticipationSpeed = 10;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly player: THREE.Object3D,
    private readonly domElement: HTMLElement,
    physics: PhysicsWorld,
  ) {
    this.cameraCollision = new CameraCollision(physics);
    this.turnCollision = new CameraCollision(physics);
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
    const idealYaw = Math.atan2(idealPosition.x - lookAt.x, idealPosition.z - lookAt.z);
    const turnRate = this.turnReady && delta > 0
      ? this.normalizeAngle(idealYaw - this.previousIdealYaw) / delta : 0;
    this.turnVelocity = THREE.MathUtils.damp(this.turnVelocity,
      THREE.MathUtils.clamp(turnRate, -10, 10), 12, delta);
    this.previousIdealYaw = idealYaw;
    this.turnReady = true;
    if (!this.followReady) {
      this.followPosition.copy(this.camera.position);
      this.followReady = true;
    }
    this.followPosition.lerp(idealPosition, smoothness);
    // Finish tiny residual follow motion so stationary physics queries can cache.
    if (this.followPosition.distanceToSquared(idealPosition) < 1e-8) {
      this.followPosition.copy(idealPosition);
    }

    // Query the smoothed shot. Its heading no longer jumps to the unsmoothed
    // player heading just because a wall, post or piece of furniture is hit.
    const collision = this.cameraCollision.resolve(lookAt, this.followPosition);
    const requestedDistance = lookAt.distanceTo(this.followPosition);
    const safeDistance = lookAt.distanceTo(collision.position);
    if (!this.recoveringDistance) this.collisionDistance = requestedDistance;
    const prediction = this.predictTurn(lookAt, Math.min(this.collisionDistance, safeDistance));
    this.holdTurnPrediction(lookAt, delta);
    if (collision.blocked || prediction.blocked) {
      if (prediction.blocked && prediction.distance < this.collisionDistance) {
        // Reach the anticipated clearance before the orbit reaches the obstacle.
        // A final clamp against the present sweep still handles sudden blockers.
        const approach = Math.min(1, delta / Math.max(0.001, delta, prediction.time));
        this.collisionDistance = Math.max(this.collisionDistance - this.anticipationSpeed * delta,
          THREE.MathUtils.lerp(this.collisionDistance, prediction.distance, approach));
      } else {
        this.collisionDistance = THREE.MathUtils.lerp(this.collisionDistance, safeDistance, smoothness);
      }
      this.collisionDistance = Math.min(safeDistance, this.collisionDistance);
      this.recoveringDistance = true;
      this.clearTime = 0;
    } else if (this.recoveringDistance) {
      this.clearTime += delta;
      // A closer requested shot must still be respected during the release delay.
      this.collisionDistance = Math.min(this.collisionDistance, safeDistance);
      if (this.clearTime >= this.clearanceDelay) {
        this.collisionDistance = THREE.MathUtils.lerp(this.collisionDistance, safeDistance, smoothness);
      }
      if (safeDistance - this.collisionDistance < 0.001) {
        this.recoveringDistance = false;
      }
    }

    if (this.recoveringDistance && requestedDistance > 0.001) {
      // Shorten immediately for safety; expand smoothly along the checked path.
      this.camera.position.lerpVectors(lookAt, this.followPosition,
        Math.min(1, this.collisionDistance / requestedDistance));
    } else this.camera.position.copy(collision.position);

    this.camera.lookAt(lookAt);
  }

  private predictTurn(target: THREE.Vector3, distance: number) {
    const prediction = this.turnPrediction;
    prediction.blocked = false;
    // Straight movement and rest retain the single cached follow query.
    if (Math.abs(this.turnVelocity) < 0.05 || distance < 0.05) return prediction;
    this.turnOffset.copy(this.followPosition).sub(target).setLength(distance);
    // Three future headings catch short occluders along the approaching arc.
    // Refinement bounds the first impact time without per-frame allocations.
    const horizon = Math.min(0.45, Math.PI / (2 * Math.abs(this.turnVelocity)));
    let clear = 0;
    for (let sample = 1; sample <= 3; sample++) {
      let blocked = horizon * sample / 3;
      const hit = this.sampleTurn(target, blocked);
      if (!hit.blocked) { clear = blocked; continue; }
      let clearance = target.distanceTo(hit.position);
      for (let refine = 0; refine < 3; refine++) {
        const time = (clear + blocked) / 2;
        const check = this.sampleTurn(target, time);
        if (check.blocked) {
          blocked = time;
          clearance = Math.min(clearance, target.distanceTo(check.position));
        } else clear = time;
      }
      prediction.blocked = true;
      prediction.distance = clearance;
      prediction.time = clear;
      return prediction;
    }
    return prediction;
  }

  private sampleTurn(target: THREE.Vector3, time: number) {
    this.turnPosition.copy(this.turnOffset)
      .applyAxisAngle(this.up, this.turnVelocity * time).add(target);
    return this.turnCollision.resolve(target, this.turnPosition);
  }

  private holdTurnPrediction(target: THREE.Vector3, delta: number): void {
    const prediction = this.turnPrediction;
    const direction = Math.sign(this.turnVelocity);
    this.plannedTurnTime = Math.max(0, this.plannedTurnTime - delta);
    if (Math.abs(this.turnVelocity) < 0.05 || direction !== this.plannedTurnDirection ||
        target.distanceToSquared(this.plannedTurnTarget) > 0.04) this.plannedTurnTime = 0;
    if (prediction.blocked) {
      if (this.plannedTurnTime > 0) {
        prediction.distance = Math.min(prediction.distance, this.plannedTurnDistance);
        prediction.time = Math.min(prediction.time, this.plannedTurnTime);
      }
      this.plannedTurnTime = prediction.time;
      this.plannedTurnDistance = prediction.distance;
      this.plannedTurnDirection = direction;
      this.plannedTurnTarget.copy(target);
    } else if (this.plannedTurnTime > 0) {
      // A thin post can fall between future samples on the next frame. Keep its
      // planned clearance until arrival unless the turn reverses or pivot moves.
      prediction.blocked = true;
      prediction.distance = this.plannedTurnDistance;
      prediction.time = this.plannedTurnTime;
    }
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
    if (!this.inputEnabled || event.button !== 0 || this.dragging) {
      return;
    }

    this.dragging = true;
    this.dragPointer = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.domElement.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.inputEnabled || !this.dragging || event.pointerId !== this.dragPointer) {
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
    if (!this.dragging || event.pointerId !== this.dragPointer) {
      return;
    }

    this.dragging = false;
    this.dragPointer = null;

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
    this.dragPointer = null;
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
    this.followReady = false;
    this.turnReady = false;
    this.turnVelocity = 0;
    this.plannedTurnTime = 0;
    this.recoveringDistance = false;
    this.clearTime = 0;

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

    this.followPosition.copy(this.getIdealPosition());
    this.followReady = true;
    const lookAt = this.getIdealLookAt();
    this.previousIdealYaw = Math.atan2(this.followPosition.x - lookAt.x, this.followPosition.z - lookAt.z);
    this.turnReady = true;
    this.turnVelocity = 0;
    this.plannedTurnTime = 0;
    const collision = this.cameraCollision.resolve(lookAt, this.followPosition);
    this.camera.position.copy(collision.position);
    this.collisionDistance = lookAt.distanceTo(collision.position);
    this.recoveringDistance = collision.blocked;
    this.clearTime = 0;
    this.camera.lookAt(lookAt);
  }

  private normalizeAngle(angle: number): number {
    return (
      THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI
    );
  }
}
