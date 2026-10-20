import * as THREE from "three";
import { FIRST_WORKSHOP_SKILL } from "../../../data/skills";
import "../../../ui/WorkshopExperience/WorkshopExperience.css";

type Mode = "idle" | "entering" | "active" | "leaving";

/**
 * First workshop prototype, deliberately separate from the Projects Book.
 * A single low-cost procedural rune is placed above SEC_WORKSHOP_WeaponStand.
 * No new Blender geometry, animation clips, portals, or physics colliders.
 */
export class WorkshopExperience {
  private readonly root = new THREE.Group();
  private readonly floating = new THREE.Group();
  private readonly core: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  private readonly hitTarget: THREE.Mesh;
  private readonly orbitA: THREE.Mesh;
  private readonly orbitB: THREE.Mesh;
  private readonly glow: THREE.PointLight;
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly label: HTMLDivElement;
  private readonly panel: HTMLElement;
  private readonly controls: HTMLDivElement;

  private readonly startPosition = new THREE.Vector3();
  private readonly startQuaternion = new THREE.Quaternion();
  private readonly endPosition = new THREE.Vector3();
  private readonly endQuaternion = new THREE.Quaternion();
  private readonly returnPosition = new THREE.Vector3();
  private readonly returnQuaternion = new THREE.Quaternion();

  private elapsed = 0;
  private duration = 1;
  private floatElapsed = 0;
  private hovered = false;
  private selected = false;
  private pointerInside = false;
  private pointerX = 0;
  private pointerY = 0;
  private onExitComplete: (() => void) | null = null;
  private state: Mode = "idle";

  constructor(
    private readonly house: THREE.Object3D,
    stand: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.root.name = "WORKSHOP_SKILL_RUNE";
    this.floating.name = "WORKSHOP_RUNE_FLOATING";

    // Model-space anchor derived from the real stand, including house offset.
    house.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(stand, true);
    const centerWorld = bounds.isEmpty()
      ? stand.getWorldPosition(new THREE.Vector3())
      : bounds.getCenter(new THREE.Vector3());
    const height = bounds.isEmpty() ? 1 : Math.max(0.1, bounds.max.y - bounds.min.y);
    centerWorld.y = bounds.isEmpty() ? centerWorld.y + 0.55 : bounds.max.y + 0.12;
    this.root.position.copy(house.worldToLocal(centerWorld));
    // Keep a small visual prop regardless of whether the rack is tiny or tall.
    this.root.scale.setScalar(THREE.MathUtils.clamp(height * 0.18, 0.34, 0.65));

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x76b5a5,
      emissive: 0x286d62,
      emissiveIntensity: 0.48,
      roughness: 0.28,
      metalness: 0.12,
      flatShading: true,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), coreMaterial);
    this.core.name = "WORKSHOP_RUNE_CORE";
    this.core.castShadow = true;
    this.floating.add(this.core);

    const filigree = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.core.geometry),
      new THREE.LineBasicMaterial({ color: 0xe4d7a2, transparent: true, opacity: 0.72 }),
    );
    filigree.scale.setScalar(1.015);
    this.core.add(filigree);

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0xc4a875,
      emissive: 0x6a4e30,
      emissiveIntensity: 0.2,
      metalness: 0.55,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });
    this.orbitA = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.014, 5, 44), ringMaterial);
    this.orbitB = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.011, 5, 44), ringMaterial);
    this.orbitA.rotation.set(Math.PI * 0.56, 0, 0);
    this.orbitB.rotation.set(Math.PI * 0.23, Math.PI * 0.45, 0);
    this.floating.add(this.orbitA, this.orbitB);

    // Larger invisible target makes hover possible without pixel hunting.
    this.hitTarget = new THREE.Mesh(
      new THREE.SphereGeometry(0.76, 16, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.hitTarget.name = "WORKSHOP_RUNE_HIT_TARGET";
    this.floating.add(this.hitTarget);

    this.glow = new THREE.PointLight(0x78b8a2, 0.32, 1.2, 2);
    this.floating.add(this.glow);
    this.root.add(this.floating);
    this.house.add(this.root);

    this.label = document.createElement("div");
    this.label.className = "workshop-rune-label";
    this.label.textContent = "CLICK TO INSPECT  ↗";
    this.label.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.label);

    this.panel = document.createElement("section");
    this.panel.className = "workshop-inspector";
    this.panel.setAttribute("aria-label", "Workshop skills");
    const heading = document.createElement("h2");
    heading.textContent = FIRST_WORKSHOP_SKILL.name;
    const eyebrow = document.createElement("div");
    eyebrow.className = "workshop-inspector__eyebrow";
    eyebrow.textContent = FIRST_WORKSHOP_SKILL.eyebrow;
    const description = document.createElement("p");
    description.className = "workshop-inspector__description";
    description.textContent = FIRST_WORKSHOP_SKILL.description;
    const tech = document.createElement("div");
    tech.className = "workshop-inspector__tools";
    for (const item of FIRST_WORKSHOP_SKILL.technologies) {
      const chip = document.createElement("span");
      chip.textContent = item;
      tech.appendChild(chip);
    }
    this.panel.append(eyebrow, heading, description, tech);
    document.body.appendChild(this.panel);

    this.controls = document.createElement("div");
    this.controls.className = "workshop-controls";
    this.controls.innerHTML = `<kbd>E</kbd> <span data-workshop-action>Inspect</span> <span class="workshop-controls__divider"></span> <kbd>Esc</kbd> Return`;
    document.body.appendChild(this.controls);

    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  get mode(): Mode {
    return this.state;
  }

  get isControllingCamera(): boolean {
    return this.state !== "idle";
  }

  /** Enter smoothly from the player's existing view, without a camera jump. */
  enter(): boolean {
    if (this.state !== "idle") return false;
    this.camera.updateWorldMatrix(true, false);
    this.returnPosition.copy(this.camera.position);
    this.returnQuaternion.copy(this.camera.quaternion);
    this.root.updateWorldMatrix(true, true);

    const focus = this.core.getWorldPosition(new THREE.Vector3());
    const approach = this.camera.position.clone().sub(focus);
    approach.y = 0;
    if (approach.lengthSq() < 0.001) approach.set(0, 0, 1);
    approach.normalize();
    // Approach from the same side as the visitor; don't cross the display.
    const desired = focus.clone().addScaledVector(approach, 1.85);
    desired.y += 0.55;
    const target = focus.clone().add(new THREE.Vector3(0, 0.05, 0));
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(desired, target, new THREE.Vector3(0, 1, 0)),
    );

    this.setTween(desired, rotation, 1.05);
    this.state = "entering";
    this.selected = false;
    this.panel.classList.remove("is-visible");
    const action = this.controls.querySelector<HTMLElement>("[data-workshop-action]");
    if (action) action.textContent = "Inspect";
    this.controls.classList.add("is-visible");
    return true;
  }

  /** Return to the camera pose recorded immediately before entering. */
  leave(onComplete: () => void): void {
    if (this.state === "idle" || this.state === "leaving") return;
    this.state = "leaving";
    this.selected = false;
    this.hovered = false;
    this.setCursor(false);
    this.panel.classList.remove("is-visible");
    this.label.classList.remove("is-visible");
    this.controls.classList.remove("is-visible");
    this.onExitComplete = onComplete;
    this.setTween(this.returnPosition, this.returnQuaternion, 0.75);
  }

  /** Called from Game's existing canvas click handler. */
  clickAt(clientX: number, clientY: number): boolean {
    if (this.state !== "active" || !this.testPointer(clientX, clientY)) return false;
    this.toggleSelection();
    return true;
  }

  /** E/Enter during workshop mode: discover the object without using the mouse. */
  toggleSelection(): void {
    if (this.state !== "active") return;
    this.selected = !this.selected;
    this.panel.classList.toggle("is-visible", this.selected);
    const action = this.controls.querySelector<HTMLElement>("[data-workshop-action]");
    if (action) action.textContent = this.selected ? "Close details" : "Inspect";
  }

  update(delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    this.floatElapsed += dt;
    this.floating.position.y = THREE.MathUtils.damp(
      this.floating.position.y,
      Math.sin(this.floatElapsed * 1.45) * 0.028 + (this.hovered ? 0.07 : 0) + (this.selected ? 0.09 : 0),
      8,
      dt,
    );
    this.floating.scale.setScalar(THREE.MathUtils.damp(
      this.floating.scale.x, this.selected ? 1.1 : this.hovered ? 1.06 : 1, 6, dt,
    ));
    this.core.rotation.y += dt * (this.selected ? 0.4 : 0.14);
    this.core.rotation.z = THREE.MathUtils.damp(this.core.rotation.z, this.hovered ? 0.15 : 0, 6, dt);
    this.orbitA.rotation.z += dt * 0.22;
    this.orbitB.rotation.y -= dt * 0.17;
    this.core.material.emissiveIntensity = THREE.MathUtils.damp(
      this.core.material.emissiveIntensity,
      this.hovered || this.selected ? 1.0 : 0.48,
      7,
      dt,
    );
    this.glow.intensity = THREE.MathUtils.damp(
      this.glow.intensity,
      this.selected ? 0.9 : this.hovered ? 0.65 : 0.3,
      6,
      dt,
    );

    if (this.state === "idle") return;
    if (this.state === "entering" || this.state === "leaving") {
      this.elapsed = Math.min(this.duration, this.elapsed + dt);
      const t = this.elapsed / this.duration;
      const eased = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(this.startPosition, this.endPosition, eased);
      this.camera.quaternion.slerpQuaternions(this.startQuaternion, this.endQuaternion, eased);
      if (t >= 1) {
        if (this.state === "entering") {
          this.state = "active";
        } else {
          this.state = "idle";
          this.onExitComplete?.();
          this.onExitComplete = null;
        }
      }
    }

    if (this.state !== "active") {
      this.hovered = false;
      this.label.classList.remove("is-visible");
      return;
    }
    const over = this.pointerInside && this.testPointer(this.pointerX, this.pointerY);
    this.hovered = over;
    this.setCursor(over);
    this.label.classList.toggle("is-visible", over && !this.selected);
    if (over && !this.selected) {
      // Project the rune anchor to the viewport; never track the cursor.
      const screen = this.core.getWorldPosition(new THREE.Vector3()).project(this.camera);
      const rect = this.canvas.getBoundingClientRect();
      this.label.style.left = `${THREE.MathUtils.clamp(rect.left + (screen.x + 1) * rect.width / 2, 65, window.innerWidth - 65)}px`;
      this.label.style.top = `${THREE.MathUtils.clamp(rect.top + (1 - screen.y) * rect.height / 2 - 88, 30, window.innerHeight - 80)}px`;
    }
  }

  private setTween(targetPosition: THREE.Vector3, targetQuaternion: THREE.Quaternion, duration: number): void {
    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);
    this.endPosition.copy(targetPosition);
    this.endQuaternion.copy(targetQuaternion);
    this.elapsed = 0;
    this.duration = duration;
  }

  private testPointer(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.hitTarget, false).length > 0;
  }

  private setCursor(enabled: boolean): void {
    this.canvas.style.cursor = enabled ? "pointer" : "";
  }

  private onPointerMove = (event: PointerEvent): void => {
    this.pointerInside = true;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  };
  private onPointerLeave = (): void => {
    this.pointerInside = false;
    this.hovered = false;
    this.setCursor(false);
    this.label.classList.remove("is-visible");
  };

  destroy(): void {
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.setCursor(false);
    this.root.removeFromParent();
    this.core.geometry.dispose();
    this.hitTarget.geometry.dispose();
    this.orbitA.geometry.dispose();
    this.orbitB.geometry.dispose();
    this.label.remove();
    this.panel.remove();
    this.controls.remove();
  }
}
