import * as THREE from "three";

export class ProjectBookCamera {
  private readonly startPosition = new THREE.Vector3();
  private readonly startQuaternion = new THREE.Quaternion();

  private readonly endPosition = new THREE.Vector3();
  private readonly endQuaternion = new THREE.Quaternion();

  private readonly returnPosition = new THREE.Vector3();
  private readonly returnQuaternion = new THREE.Quaternion();

  private elapsed = 0;
  private duration = 1;
  private animating = false;
  private hasReturnPose = false;

  private onComplete?: () => void;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  focus(
    book: THREE.Object3D,
    marker: THREE.Object3D,
    onComplete?: () => void,
  ): void {
    book.updateWorldMatrix(true, true);
    marker.updateWorldMatrix(true, false);

    const bounds = new THREE.Box3().setFromObject(book, true);

    if (bounds.isEmpty()) {
      throw new Error("Animated book has no geometry");
    }

    const center = bounds.getCenter(new THREE.Vector3());

    // Save gameplay camera transform.
    this.returnPosition.copy(this.camera.position);
    this.returnQuaternion.copy(this.camera.quaternion);
    this.hasReturnPose = true;

    // Marker chooses viewing direction, not zoom distance.
    const markerPosition = marker.getWorldPosition(new THREE.Vector3());

    const direction = markerPosition.sub(center);

    if (direction.lengthSq() < 0.0001) {
      direction.set(0, 1, 0.45);
    }

    direction.normalize();

    // Respect the camera marker's screen-up orientation.
    const markerQuaternion = marker.getWorldQuaternion(new THREE.Quaternion());

    const up = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(markerQuaternion)
      .normalize();

    // Avoid an invalid lookAt when up and viewing
    // direction happen to be nearly parallel.
    if (Math.abs(up.dot(direction)) > 0.98) {
      up.set(0, 0, -1);
    }

    const temporaryEye = center.clone().add(direction);

    const rotationMatrix = new THREE.Matrix4().lookAt(temporaryEye, center, up);

    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(
      rotationMatrix,
    );

    const verticalHalfFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);

    const tanVertical = Math.tan(verticalHalfFov);
    const tanHorizontal = tanVertical * this.camera.aspect;

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(targetQuaternion);

    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
      targetQuaternion,
    );

    const size = bounds.getSize(new THREE.Vector3());

    const padding = 1.17;
    let distance = 0;

    // Calculate distance using all eight bounding-box
    // corners, rather than a rough fixed camera offset.
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const relative = new THREE.Vector3(x, y, z).sub(center);

          const towardCamera = relative.dot(direction);

          const horizontal = Math.abs(relative.dot(right));

          const vertical = Math.abs(relative.dot(screenUp));

          distance = Math.max(
            distance,
            towardCamera + (horizontal * padding) / tanHorizontal,
            towardCamera + (vertical * padding) / tanVertical,
            towardCamera + this.camera.near + 0.1,
          );
        }
      }
    }

    distance = Math.max(distance, size.length() * 0.55, 0.35);

    const targetPosition = center.clone().addScaledVector(direction, distance);

    this.transitionTo(targetPosition, targetQuaternion, 1.25, onComplete);
  }

  returnToPlayer(onComplete?: () => void): void {
    if (!this.hasReturnPose) {
      onComplete?.();
      return;
    }

    this.transitionTo(this.returnPosition, this.returnQuaternion, 0.85, () => {
      this.hasReturnPose = false;
      onComplete?.();
    });
  }

  private transitionTo(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    duration: number,
    onComplete?: () => void,
  ): void {
    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);

    this.endPosition.copy(position);
    this.endQuaternion.copy(quaternion);

    this.elapsed = 0;
    this.duration = duration;
    this.animating = true;
    this.onComplete = onComplete;
  }

  update(delta: number): void {
    if (!this.animating) return;

    this.elapsed += Math.min(delta, 0.05);

    const t = THREE.MathUtils.clamp(this.elapsed / this.duration, 0, 1);

    // Smoothstep.
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
      this.animating = false;

      const callback = this.onComplete;
      this.onComplete = undefined;

      callback?.();
    }
  }

  cancel(): void {
    this.animating = false;
    this.hasReturnPose = false;
    this.onComplete = undefined;
  }

  get isAnimating(): boolean {
    return this.animating;
  }
}
