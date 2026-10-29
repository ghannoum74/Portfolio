import * as THREE from "three";
import "../../ui/HouseGuide/HouseGuide.css";

export type HouseGuideTask = "projects" | "journey" | "awards" | "workshop";
export type HouseGuideStep = {
  id: HouseGuideTask;
  target: THREE.Object3D;
  cameraMarker?: THREE.Object3D;
  title: string;
  description: string;
  elevation?: number;
};
type Options = {
  approach: THREE.Vector3;
  onCameraStart: (target: THREE.Object3D) => void;
  onCameraEnd: () => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  reducedMotion?: boolean;
};
type Stage = "idle" | "cover" | "reveal" | "focus" | "return-cover" | "return-reveal" | "explore" | "waiting";

export const HOUSE_GUIDE_SEEN_KEY = "portfolio.house-first-visit.v1";
const UP = new THREE.Vector3(0, 1, 0);

/** Fit an orientation shot to real geometry; never invent missing destinations. */
export function houseGuideShot(step: HouseGuideStep, camera: THREE.PerspectiveCamera, approach: THREE.Vector3) {
  step.target.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(step.target, true);
  if (bounds.isEmpty()) return null;
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3();
  if (step.cameraMarker) {
    step.cameraMarker.updateWorldMatrix(true, false);
    direction.copy(step.cameraMarker.getWorldPosition(new THREE.Vector3())).sub(center);
  } else {
    direction.copy(approach).sub(center).setY(0);
    if (direction.lengthSq() < 0.001) return null;
    direction.normalize().y = step.elevation ?? 0.75;
  }
  if (direction.lengthSq() < 0.001) return null;
  direction.normalize();
  // A portrait viewport needs a wider shot. Lower its viewing angle instead
  // of letting the camera rise through the actual sloped cottage roof.
  let house = step.target;
  while (house.parent && !(house.parent as THREE.Scene).isScene) house = house.parent;
  const ceilings: THREE.Object3D[] = [];
  house.traverse(object => {
    if ((object as THREE.Mesh).isMesh && !/^(COL_|ZONE_)/.test(object.name) && /ROOF|CEILING/i.test(object.name)) ceilings.push(object);
  });
  const roofRay = new THREE.Raycaster(center.clone().addScaledVector(UP, 0.02), UP);
  const roof = roofRay.intersectObjects(ceilings, false)[0];
  const maxHeight = Math.min(center.y + 1.8, roof ? roof.point.y - 0.3 : Infinity);
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * Math.max(camera.aspect, 0.1);
  const rotation = new THREE.Quaternion(), position = new THREE.Vector3();
  for (let attempt = 0; attempt < 8; attempt++) {
    const up = Math.abs(direction.dot(UP)) > 0.98 ? new THREE.Vector3(0, 0, -1) : UP;
    rotation.setFromRotationMatrix(new THREE.Matrix4().lookAt(center.clone().add(direction), center, up));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    let distance = 1.65;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new THREE.Vector3(x, y, z).sub(center);
      distance = Math.max(distance, point.dot(direction) + Math.abs(point.dot(right)) * 1.3 / tanX,
        point.dot(direction) + Math.abs(point.dot(screenUp)) * 1.3 / tanY, point.dot(direction) + camera.near + 0.1);
    }
    position.copy(center).addScaledVector(direction, distance);
    if (position.y <= maxHeight + 0.001) break;
    const rise = Math.max(maxHeight - center.y, 0.1);
    direction.y *= rise / Math.max(position.y - center.y, 0.1) * 0.95;
    direction.normalize();
  }
  if (![...position.toArray(), ...rotation.toArray()].every(Number.isFinite)) return null;
  return { position, rotation, center };
}

/** A skippable objective guide. Camera cutaways and gameplay never run together. */
export class HouseFirstVisitGuide {
  private stage: Stage = "idle";
  private active = false;
  private attempted = false;
  private elapsed = 0;
  private finishing = false;
  private ownsCamera = false;
  private current?: HouseGuideStep;
  private readonly completed = new Set<HouseGuideTask>();
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedRotation = new THREE.Quaternion();
  private readonly shotPosition = new THREE.Vector3();
  private readonly shotRotation = new THREE.Quaternion();
  private readonly revealPosition = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();
  private readonly reducedMotion: boolean;
  private readonly storage: Options["storage"];
  private root?: HTMLDivElement;
  private veil?: HTMLDivElement;
  private title?: HTMLElement;
  private description?: HTMLElement;
  private progress?: HTMLElement;
  private keys?: HTMLElement;
  private exploreButton?: HTMLButtonElement;
  private beacon?: HTMLDivElement;

  constructor(private readonly camera: THREE.PerspectiveCamera, private steps: HouseGuideStep[], private readonly options: Options) {
    this.reducedMotion = options.reducedMotion ?? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    try { this.storage = options.storage === undefined ? window.localStorage : options.storage; }
    catch { this.storage = null; }
  }

  get isActive(): boolean { return this.active; }
  get isControllingCamera(): boolean { return this.ownsCamera; }
  get currentTask(): HouseGuideTask | undefined { return this.active ? this.current?.id : undefined; }

  start(): boolean {
    if (this.attempted) return false;
    this.attempted = true;
    try { if (this.storage?.getItem(HOUSE_GUIDE_SEEN_KEY) === "seen") return false; } catch { /* Storage can be blocked. */ }
    this.steps = this.steps.filter(step => houseGuideShot(step, this.camera, this.options.approach));
    if (!this.steps.length) return false;
    // Mark the first entry, so leaving or refreshing mid-guide cannot restart it.
    try { this.storage?.setItem(HOUSE_GUIDE_SEEN_KEY, "seen"); } catch { /* Still run only once in this Game instance. */ }
    this.createUi();
    this.active = true;
    this.next();
    return true;
  }

  complete(task: HouseGuideTask): void {
    if (!this.active || this.completed.has(task)) return;
    this.completed.add(task);
    if (this.current?.id === task) {
      if (this.ownsCamera) this.explore();
      else {
        this.stage = "waiting";
        this.elapsed = 0;
        this.root!.hidden = true;
      }
    }
  }

  /** Leave the camera cue early, then walk to the objective normally. */
  explore(): void {
    if (!this.ownsCamera || this.stage.startsWith("return-")) return;
    this.stage = "return-cover";
    this.elapsed = 0;
    this.exploreButton!.disabled = true;
  }

  skip(): void {
    if (!this.active) return;
    this.finishing = true;
    if (this.ownsCamera) this.explore();
    else this.finish();
  }

  /** Scene changes restore the camera synchronously before their own transition. */
  cancel(): void {
    if (this.ownsCamera) {
      this.restoreCamera();
      this.ownsCamera = false;
      this.options.onCameraEnd();
    }
    this.finish();
  }

  update(delta: number, available = true): void {
    if (!this.active) return;
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
    if (!this.ownsCamera) {
      this.root!.hidden = !available || this.stage === "waiting";
      if (!available) return;
      if (this.stage === "waiting") {
        this.elapsed += dt;
        if (this.elapsed >= 0.4) this.next();
      } else this.updateBeacon();
      return;
    }
    this.elapsed += dt;
    const t = Math.min(this.elapsed / 0.24, 1), eased = t * t * (3 - 2 * t);
    switch (this.stage) {
      case "cover":
        this.veil!.style.opacity = String(eased);
        if (t === 1) {
          this.camera.position.copy(this.revealPosition);
          this.camera.quaternion.copy(this.shotRotation);
          this.stage = "reveal"; this.elapsed = 0;
        }
        break;
      case "reveal":
        this.veil!.style.opacity = String(1 - eased);
        this.camera.position.lerpVectors(this.revealPosition, this.shotPosition, eased);
        if (t === 1) { this.stage = "focus"; this.elapsed = 0; }
        break;
      case "focus":
        if (this.elapsed >= 2.4) this.explore();
        break;
      case "return-cover":
        this.veil!.style.opacity = String(eased);
        if (t === 1) { this.restoreCamera(); this.stage = "return-reveal"; this.elapsed = 0; }
        break;
      case "return-reveal":
        this.veil!.style.opacity = String(1 - eased);
        if (t === 1) {
          this.ownsCamera = false;
          this.stage = "explore";
          this.root!.dataset.camera = "false";
          this.exploreButton!.hidden = true;
          this.keys!.textContent = "WASD to move · E to interact nearby";
          this.blurControls();
          this.options.onCameraEnd();
          if (this.finishing) this.finish();
          else if (this.current && this.completed.has(this.current.id)) {
            this.stage = "waiting"; this.elapsed = 0; this.root!.hidden = true;
          }
        }
        break;
    }
  }

  private next(): void {
    this.current = this.steps.find(step => !this.completed.has(step.id));
    if (!this.current) { this.finish(); return; }
    const shot = houseGuideShot(this.current, this.camera, this.options.approach);
    if (!shot) { this.completed.add(this.current.id); this.next(); return; }
    this.title!.textContent = this.current.title;
    this.description!.textContent = this.current.description;
    this.progress!.textContent = `FIRST VISIT · ${this.completed.size + 1} / ${this.steps.length}`;
    this.root!.hidden = false;
    this.beacon!.hidden = true;
    this.center.copy(shot.center);
    if (this.reducedMotion) {
      this.stage = "explore";
      this.root!.dataset.camera = "false";
      this.exploreButton!.hidden = true;
      return;
    }
    this.savedPosition.copy(this.camera.position);
    this.savedRotation.copy(this.camera.quaternion);
    this.shotPosition.copy(shot.position);
    this.shotRotation.copy(shot.rotation);
    this.revealPosition.copy(shot.position).addScaledVector(shot.position.clone().sub(shot.center).normalize(), 0.12);
    this.stage = "cover"; this.elapsed = 0; this.ownsCamera = true;
    this.veil!.style.opacity = "0";
    this.root!.dataset.camera = "true";
    this.keys!.textContent = "E to explore · Esc to skip guide";
    this.exploreButton!.hidden = false;
    this.exploreButton!.disabled = false;
    this.options.onCameraStart(this.current.target);
  }

  private restoreCamera(): void {
    this.camera.position.copy(this.savedPosition);
    this.camera.quaternion.copy(this.savedRotation);
    this.camera.updateMatrixWorld(true);
  }

  private updateBeacon(): void {
    this.camera.updateMatrixWorld(true);
    this.projected.copy(this.center).project(this.camera);
    const p = this.projected;
    this.beacon!.hidden = p.z < -1 || p.z > 1 || Math.abs(p.x) > 0.92 || Math.abs(p.y) > 0.88;
    if (!this.beacon!.hidden) {
      this.beacon!.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      this.beacon!.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    }
  }

  private finish(): void {
    this.active = false; this.stage = "idle";
    if (this.root) { this.root.hidden = true; this.blurControls(); }
  }

  private blurControls(): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.root?.contains(focused)) focused.blur();
  }

  private createUi(): void {
    const root = document.createElement("div");
    root.className = "house-guide";
    root.hidden = true;
    const veil = document.createElement("div"); veil.className = "house-guide__veil";
    veil.setAttribute("aria-hidden", "true");
    const panel = document.createElement("section"); panel.className = "house-guide__card";
    panel.setAttribute("aria-label", "First visit guide");
    const progress = document.createElement("div"); progress.className = "house-guide__progress";
    const copy = document.createElement("div"); copy.setAttribute("role", "status"); copy.setAttribute("aria-live", "polite");
    const title = document.createElement("h2"), description = document.createElement("p");
    copy.append(title, description);
    const keys = document.createElement("p"); keys.className = "house-guide__keys";
    keys.textContent = "WASD to move · E to interact nearby";
    const actions = document.createElement("div"); actions.className = "house-guide__actions";
    const explore = document.createElement("button"); explore.type = "button";
    explore.textContent = "Let me explore";
    explore.addEventListener("click", () => this.explore());
    const skip = document.createElement("button"); skip.type = "button";
    skip.className = "house-guide__skip"; skip.textContent = "Skip guide";
    skip.addEventListener("click", () => this.skip());
    actions.append(explore, skip); panel.append(progress, copy, keys, actions);
    const beacon = document.createElement("div"); beacon.className = "house-guide__beacon";
    beacon.textContent = "◆"; beacon.setAttribute("aria-hidden", "true"); beacon.hidden = true;
    root.append(veil, beacon, panel); document.body.appendChild(root);
    this.root = root; this.veil = veil; this.title = title;
    this.description = description; this.progress = progress; this.keys = keys; this.exploreButton = explore; this.beacon = beacon;
  }

  destroy(): void { this.cancel(); this.root?.remove(); }
}
