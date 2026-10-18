import * as THREE from "three";

export class ProjectBookCamera {
  private active = false;
  private elapsed = 0;
  private readonly duration = 1.25;

  private readonly startPosition = new THREE.Vector3();
  private readonly startQuaternion = new THREE.Quaternion();
  private readonly endPosition = new THREE.Vector3();
  private readonly endQuaternion = new THREE.Quaternion();

  private onComplete?: () => void;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  focus(
    book: THREE.Object3D,
    cameraMarker: THREE.Object3D,
    onComplete: () => void,
  ): void {
    book.updateWorldMatrix(true, true);
    cameraMarker.updateWorldMatrix(true, false);

    const bounds = new THREE.Box3().setFromObject(book, true);
    const center = bounds.getCenter(new THREE.Vector3());

    if (bounds.isEmpty()) {
      throw new Error("Projects book has no geometry");
    }

    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);

    const markerPosition = new THREE.Vector3();
    cameraMarker.getWorldPosition(markerPosition);

    // Use the marker's position to determine approach direction.
    const direction = markerPosition.clone().sub(center);

    if (direction.lengthSq() < 0.0001) {
      direction.set(0, 1, 0.25);
    }

    direction.normalize();

    // Fit the book in the camera's field of view.
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());

    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov =
      2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);

    const halfFov = Math.min(verticalFov, horizontalFov) / 2;

    const distance = (sphere.radius / Math.sin(halfFov)) * 1.22;

    this.endPosition.copy(center).addScaledVector(direction, distance);

    // Look at the center of the book, not at the Empty.
    const up = new THREE.Vector3(0, 1, 0);

    // Preserve the camera marker's idea of "up".
    const markerRotation = new THREE.Quaternion();
    cameraMarker.getWorldQuaternion(markerRotation);

    up.applyQuaternion(markerRotation);

    const lookMatrix = new THREE.Matrix4().lookAt(this.endPosition, center, up);

    this.endQuaternion.setFromRotationMatrix(lookMatrix);

    this.elapsed = 0;
    this.active = true;
    this.onComplete = onComplete;
  }

  update(delta: number): void {
    if (!this.active) return;

    this.elapsed += delta;

    const t = THREE.MathUtils.clamp(this.elapsed / this.duration, 0, 1);

    const eased = t * t * (3 - 2 * t);

    this.camera.position.lerpVectors(
      this.startPosition,
      this.endPosition,
      eased,
    );

    this.camera.quaternion.slerpQuaternions(
      this.startQuaternion,
      this.endQuaternion,
      eased,
    );

    if (t >= 1) {
      this.active = false;

      const callback = this.onComplete;
      this.onComplete = undefined;
      callback?.();
    }
  }

  cancel(): void {
    this.active = false;
    this.onComplete = undefined;
  }

  get isAnimating(): boolean {
    return this.active;
  }
}
