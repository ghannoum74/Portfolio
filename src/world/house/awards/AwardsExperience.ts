import * as THREE from "three";
import { AWARD_ENTRIES, type AwardEntry } from "../../../data/awards";
import "../../../ui/AwardsHall/AwardsHall.css";

type Mode = "idle" | "entering" | "active" | "leaving";
type Exhibit = {
  data: AwardEntry;
  target: THREE.Object3D;
  center: THREE.Vector3;
  size: THREE.Vector3;
  glimmer: THREE.Sprite;
};

const UP = new THREE.Vector3(0, 1, 0);
const GOLD = new THREE.Color("#efcf83");

export class AwardsExperience {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly exhibits: Exhibit[] = [];
  private readonly decorations = new THREE.Group();
  private readonly texture: THREE.CanvasTexture;

  private readonly sheet: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly description: HTMLElement;
  private readonly footnote: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly link: HTMLAnchorElement;
  private readonly hint: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly leftButton: HTMLButtonElement;
  private readonly rightButton: HTMLButtonElement;

  private readonly fromPosition = new THREE.Vector3();
  private readonly toPosition = new THREE.Vector3();
  private readonly fromRotation = new THREE.Quaternion();
  private readonly toRotation = new THREE.Quaternion();
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedRotation = new THREE.Quaternion();
  private readonly approach = new THREE.Vector3(0, 0, 1);

  private modeState: Mode = "idle";
  private selectedIndex: number | null = null;
  private hoveredIndex: number | null = null;
  private pointerIn = false;
  private pointerX = 0;
  private pointerY = 0;
  private elapsed = 0;
  private duration = 1;
  private ambienceElapsed = 0;
  private afterLeave: (() => void) | null = null;
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  constructor(
    private readonly house: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    house.updateWorldMatrix(true, true);
    this.texture = AwardsExperience.makeGlimmerTexture();
    this.decorations.name = "AWARDS_AMBIENT_GLIMMERS";
    this.house.add(this.decorations);

    for (const data of AWARD_ENTRIES) {
      const target = house.getObjectByName(data.objectName);
      if (!target) {
        console.warn(
          `Awards exhibit not present in house.glb: ${data.objectName}`,
        );
        continue;
      }
      const box = new THREE.Box3().setFromObject(target, true);
      const center = box.isEmpty()
        ? target.getWorldPosition(new THREE.Vector3())
        : box.getCenter(new THREE.Vector3());
      const size = box.isEmpty()
        ? new THREE.Vector3(0.5, 0.6, 0.5)
        : box.getSize(new THREE.Vector3());

      const glimmer = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.texture,
          color: GOLD,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      // Small light reflected near the physical display, not an extra treasure object.
      const glimmerWorld = center
        .clone()
        .add(new THREE.Vector3(0, size.y * 0.33, 0));
      glimmer.position.copy(this.house.worldToLocal(glimmerWorld));
      const diameter = THREE.MathUtils.clamp(
        Math.max(size.x, size.y) * 0.33,
        0.15,
        0.45,
      );
      glimmer.scale.set(diameter, diameter, 1);
      this.decorations.add(glimmer);
      this.exhibits.push({ data, target, center, size, glimmer });
    }

    this.sheet = document.createElement("section");
    this.sheet.className = "awards-inspector";
    this.sheet.setAttribute("aria-label", "Milestones and learning journey");
    this.sheet.setAttribute("aria-live", "polite");
    this.eyebrow = document.createElement("div");
    this.eyebrow.className = "awards-inspector_eyebrow";
    this.heading = document.createElement("h2");
    this.description = document.createElement("p");
    this.description.className = "awards-inspector_description";
    this.footnote = document.createElement("p");
    this.footnote.className = "awards-inspector_footnote";
    this.counter = document.createElement("span");
    this.counter.className = "awards-inspector_counter";
    this.link = document.createElement("a");
    this.link.className = "awards-inspector_proof";
    this.link.textContent = "View credential ↗";
    this.link.target = "_blank";
    this.link.rel = "noopener noreferrer";
    this.link.hidden = true;
    this.sheet.append(
      this.eyebrow,
      this.heading,
      this.description,
      this.footnote,
      this.link,
      this.counter,
    );
    document.body.appendChild(this.sheet);

    this.hint = document.createElement("div");
    this.hint.className = "awards-hover-hint";
    this.hint.textContent = "INSPECT";
    this.hint.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.hint);

    this.controls = document.createElement("nav");
    this.controls.className = "awards-controls";
    this.controls.setAttribute("aria-label", "Milestone navigation");
    this.controls.innerHTML = `<span class="awards-controls_caption">THE HALL OF MILESTONES</span><span class="awards-controls_keys"><kbd>E</kbd> Inspect <kbd>Esc</kbd> Return</span>`;
    this.leftButton = document.createElement("button");
    this.leftButton.type = "button";
    this.leftButton.className = "awards-controls_arrow";
    this.leftButton.setAttribute("aria-label", "Previous milestone");
    this.leftButton.textContent = "‹";
    this.rightButton = document.createElement("button");
    this.rightButton.type = "button";
    this.rightButton.className = "awards-controls_arrow";
    this.rightButton.setAttribute("aria-label", "Next milestone");
    this.rightButton.textContent = "›";
    this.leftButton.addEventListener("click", this.onPrevious);
    this.rightButton.addEventListener("click", this.onNext);
    this.controls.prepend(this.leftButton);
    this.controls.append(this.rightButton);
    document.body.appendChild(this.controls);

    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  get isControllingCamera(): boolean {
    return this.modeState !== "idle";
  }
  get mode(): Mode {
    return this.modeState;
  }
  get exhibitCount(): number {
    return this.exhibits.length;
  }

  /** Wide establishing shot; E can be pressed near any frame or trophy. */
  enter(_initialIndex = 0): boolean {
    if (this.modeState !== "idle" || this.exhibits.length === 0) return false;
    this.camera.updateMatrixWorld(true);
    this.savedPosition.copy(this.camera.position);
    this.savedRotation.copy(this.camera.quaternion);
    const center = this.overviewCenter();
    this.approach.copy(this.camera.position).sub(center);
    this.approach.y = 0;
    if (this.approach.lengthSq() < 0.001) this.approach.set(0, 0, 1);
    this.approach.normalize();
    this.selectedIndex = null;
    this.hoveredIndex = null;
    this.sheet.classList.remove("is-visible");
    this.controls.classList.add("is-visible");
    this.beginShot(this.overviewShot(), this.reducedMotion ? 0.01 : 1.05);
    this.modeState = "entering";
    return true;
  }

  /** Starts return immediately, even if a different cinematic shot is moving. */
  leave(onComplete: () => void): void {
    if (this.modeState === "idle" || this.modeState === "leaving") return;
    this.modeState = "leaving";
    this.afterLeave = onComplete;
    this.hoveredIndex = null;
    this.selectedIndex = null;
    this.setCursor(false);
    this.hint.classList.remove("is-visible");
    this.sheet.classList.remove("is-visible");
    this.controls.classList.remove("is-visible");
    this.beginTween(
      this.savedPosition,
      this.savedRotation,
      this.reducedMotion ? 0.01 : 0.72,
    );
  }

  clickAt(x: number, y: number): boolean {
    if (this.modeState !== "active") return false;
    const index = this.pick(x, y);
    if (index === null) return false;
    this.inspect(index);
    return true;
  }

  toggleSelection(): void {
    if (this.modeState !== "active") return;
    if (this.selectedIndex === null) this.inspect(this.hoveredIndex ?? 0);
    else this.showOverview();
  }

  selectRelative(delta: number): void {
    if (this.modeState !== "active" || !this.exhibits.length) return;
    const current = this.selectedIndex ?? (delta > 0 ? -1 : 0);
    this.inspect(
      (current + delta + this.exhibits.length) % this.exhibits.length,
    );
  }

  update(delta: number): void {
    const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
    this.ambienceElapsed += dt;
    for (let i = 0; i < this.exhibits.length; i++) {
      const exhibit = this.exhibits[i];
      const material = exhibit.glimmer.material as THREE.SpriteMaterial;
      const target =
        this.modeState === "idle"
          ? 0.08
          : i === this.selectedIndex
            ? 0.49
            : i === this.hoveredIndex
              ? 0.34
              : 0.13;
      material.opacity = THREE.MathUtils.damp(
        material.opacity,
        target + 0.025 * Math.sin(this.ambienceElapsed * 1.5 + i),
        6,
        dt,
      );
    }
    if (this.modeState === "idle") return;
    if (this.elapsed < this.duration) {
      this.elapsed = Math.min(this.duration, this.elapsed + dt);
      const t = this.elapsed / this.duration;
      const smooth = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(
        this.fromPosition,
        this.toPosition,
        smooth,
      );
      this.camera.quaternion.slerpQuaternions(
        this.fromRotation,
        this.toRotation,
        smooth,
      );
      this.camera.updateMatrixWorld(true);
      if (t >= 1 && this.modeState === "entering") this.modeState = "active";
      if (t >= 1 && this.modeState === "leaving") {
        this.modeState = "idle";
        const done = this.afterLeave;
        this.afterLeave = null;
        done?.();
        return;
      }
    }
    if (this.modeState !== "active") return;
    this.hoveredIndex = this.pointerIn
      ? this.pick(this.pointerX, this.pointerY)
      : null;
    const hovering = this.hoveredIndex !== null;
    this.setCursor(hovering);
    this.hint.classList.toggle("is-visible", hovering);
    if (hovering) {
      const exhibit = this.exhibits[this.hoveredIndex!];
      const screen = exhibit.center.clone().project(this.camera);
      const rect = this.canvas.getBoundingClientRect();
      this.hint.style.left = `${THREE.MathUtils.clamp(rect.left + ((screen.x + 1) * rect.width) / 2, 60, innerWidth - 60)}px`;
      this.hint.style.top = `${THREE.MathUtils.clamp(rect.top + ((1 - screen.y) * rect.height) / 2 - 72, 30, innerHeight - 60)}px`;
    }
  }

  private inspect(index: number): void {
    const exhibit = this.exhibits[index];
    if (!exhibit) return;
    if (this.selectedIndex === index) {
      this.showOverview();
      return;
    }
    this.selectedIndex = index;
    this.eyebrow.textContent = exhibit.data.eyebrow;
    this.heading.textContent = exhibit.data.title;
    this.description.textContent = exhibit.data.description;
    this.footnote.textContent = exhibit.data.footnote;
    this.counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(this.exhibits.length).padStart(2, "0")}`;
    this.sheet.classList.add("is-visible");
    this.beginShot(this.detailShot(index), this.reducedMotion ? 0.01 : 0.78);
  }

  private showOverview(): void {
    this.selectedIndex = null;
    this.sheet.classList.remove("is-visible");
    this.beginShot(this.overviewShot(), this.reducedMotion ? 0.01 : 0.78);
  }

  private overviewCenter(): THREE.Vector3 {
    const center = new THREE.Vector3();
    for (const exhibit of this.exhibits) center.add(exhibit.center);
    return center.multiplyScalar(1 / this.exhibits.length);
  }

  private overviewShot(): {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
  } {
    const marker = this.house.getObjectByName("CAMERA_AWARDS");
    if (marker) return this.markerShot(marker);
    const center = this.overviewCenter();
    const bounds = new THREE.Box3();
    for (const exhibit of this.exhibits) {
      const half = exhibit.size.clone().multiplyScalar(0.5);
      bounds.expandByPoint(exhibit.center.clone().sub(half));
      bounds.expandByPoint(exhibit.center.clone().add(half));
    }
    const size = bounds.getSize(new THREE.Vector3());
    const distance = THREE.MathUtils.clamp(
      Math.max(size.x, size.z, size.y) * 1.8,
      2.5,
      5,
    );
    const position = center.clone().addScaledVector(this.approach, distance);
    position.y += 0.4;
    return this.lookAt(position, center);
  }

  private detailShot(index: number): {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
  } {
    const marker = this.house.getObjectByName(`CAMERA_AWARD_0${index + 1}`);
    if (marker) return this.markerShot(marker);
    const exhibit = this.exhibits[index];
    const distance = THREE.MathUtils.clamp(
      Math.max(exhibit.size.x, exhibit.size.y) * 2.5,
      1.45,
      2.5,
    );
    const position = exhibit.center
      .clone()
      .addScaledVector(this.approach, distance);
    position.y += 0.22;
    // Slight over-the-shoulder offset leaves breathing room for the small plaque.
    position.add(
      new THREE.Vector3(this.approach.z, 0, -this.approach.x).multiplyScalar(
        0.22,
      ),
    );
    return this.lookAt(position, exhibit.center);
  }

  private lookAt(
    position: THREE.Vector3,
    target: THREE.Vector3,
  ): { position: THREE.Vector3; rotation: THREE.Quaternion } {
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(position, target, UP),
    );
    return { position, rotation };
  }

  private markerShot(marker: THREE.Object3D): {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
  } {
    marker.updateWorldMatrix(true, false);
    return {
      position: marker.getWorldPosition(new THREE.Vector3()),
      rotation: marker.getWorldQuaternion(new THREE.Quaternion()),
    };
  }

  private beginShot(
    shot: { position: THREE.Vector3; rotation: THREE.Quaternion },
    duration: number,
  ): void {
    this.beginTween(shot.position, shot.rotation, duration);
  }

  private beginTween(
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    duration: number,
  ): void {
    this.fromPosition.copy(this.camera.position);
    this.fromRotation.copy(this.camera.quaternion);
    this.toPosition.copy(position);
    this.toRotation.copy(rotation);
    this.elapsed = 0;
    this.duration = duration;
  }

  private pick(x: number, y: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    let closest = Number.POSITIVE_INFINITY;
    let result: number | null = null;
    for (let i = 0; i < this.exhibits.length; i++) {
      const hit = this.raycaster.intersectObject(
        this.exhibits[i].target,
        true,
      )[0];
      if (hit && hit.distance < closest) {
        closest = hit.distance;
        result = i;
      }
    }
    return result;
  }

  private setCursor(value: boolean): void {
    this.canvas.style.cursor = value ? "pointer" : "";
  }
  private onPrevious = (): void => this.selectRelative(-1);
  private onNext = (): void => this.selectRelative(1);
  private onPointerMove = (event: PointerEvent): void => {
    this.pointerIn = true;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  };
  private onPointerLeave = (): void => {
    this.pointerIn = false;
    this.hoveredIndex = null;
    this.hint.classList.remove("is-visible");
    this.setCursor(false);
  };

  private static makeGlimmerTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Canvas 2D context is unavailable for award glimmers");
    const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 47);
    gradient.addColorStop(0, "rgba(255,250,220,0.95)");
    gradient.addColorStop(0.2, "rgba(255,231,168,0.45)");
    gradient.addColorStop(0.55, "rgba(255,220,145,0.11)");
    gradient.addColorStop(1, "rgba(255,220,145,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);
    return new THREE.CanvasTexture(canvas);
  }

  destroy(): void {
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.leftButton.removeEventListener("click", this.onPrevious);
    this.rightButton.removeEventListener("click", this.onNext);
    this.setCursor(false);
    for (const exhibit of this.exhibits)
      (exhibit.glimmer.material as THREE.SpriteMaterial).dispose();
    this.texture.dispose();
    this.decorations.removeFromParent();
    this.sheet.remove();
    this.hint.remove();
    this.controls.remove();
  }
}
