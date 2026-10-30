import * as THREE from "three";
import type { HouseTourPath } from "./HouseTourPath";
import "../../ui/HouseGuide/HouseGuide.css";

export type HouseGuideTask = "projects" | "journey" | "awards" | "workshop";
export type HouseGuideStep = {
  id: HouseGuideTask;
  target: THREE.Object3D;
  cameraMarker?: THREE.Object3D;
  title: string;
  description: string;
  elevation?: number;
  minDistance?: number;
  contextTargets?: THREE.Object3D[];
};
type Options = {
  approach: THREE.Vector3;
  onCameraStart: (target: THREE.Object3D) => void;
  onCameraEnd: () => void;
  onTargetChange?: (target: THREE.Object3D) => void;
  route?: HouseTourPath;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  reducedMotion?: boolean;
};
type Stage = "idle" | "intro" | "moving" | "holding" | "returning" | "cover" | "reveal";

export const HOUSE_GUIDE_SEEN_KEY = "portfolio.house-first-visit.v2";
const UP = new THREE.Vector3(0, 1, 0);

export function houseTourSteps(house: THREE.Object3D, book?: THREE.Object3D): HouseGuideStep[] {
  const steps: HouseGuideStep[] = [];
  if (book && house.getObjectByName("INTERACT_BOOK_PROJECTS") && house.getObjectByName("CAMERA_PROJECT_BOOK")) steps.push({
    id: "projects", target: book,
    cameraMarker: house.getObjectByName("CAMERA_TOUR_PROJECTS") ?? house.getObjectByName("CAMERA_PROJECT_BOOK"),
    elevation: 0.35, minDistance: 2.8,
    title: "The Projects Book", description: "Open this book with E to browse the things I've built.",
  });
  const map = house.getObjectByName("SEC_MAP_MapTop"), table = house.getObjectByName("SEC_MAP_Table_Large");
  if (map && table) steps.push({
    id: "journey", target: map, contextTargets: [table], elevation: 0.45,
    cameraMarker: house.getObjectByName("CAMERA_TOUR_JOURNEY") ?? house.getObjectByName("CAMERA_JOURNEY_MAP"),
    title: "The Journey Map", description: "Press E at the map table to discover the path that brought me here.",
  });
  const awards = ["SEC_AWARDS_Frame_M", "SEC_AWARDS_Frame_S", "SEC_AWARDS_TrophyCup"]
    .map(name => house.getObjectByName(name)).filter((object): object is THREE.Object3D => Boolean(object));
  if (awards.length) steps.push({
    id: "awards", target: awards[0], contextTargets: awards, elevation: 0.12,
    cameraMarker: house.getObjectByName("CAMERA_TOUR_AWARDS") ?? house.getObjectByName("CAMERA_AWARDS"),
    title: "Learning Milestones", description: "Inspect my training at 42 Beirut, SE Factory and beyond with E.",
  });
  const stand = house.getObjectByName("SEC_WORKSHOP_WeaponStand");
  if (stand) steps.push({
    id: "workshop", target: stand, elevation: 0.32,
    cameraMarker: house.getObjectByName("CAMERA_TOUR_WORKSHOP") ?? house.getObjectByName("CAMERA_WORKSHOP"),
    title: "The Workshop", description: "Approach the stand and press E to explore my tools and skills.",
  });
  return steps;
}

/** Fit a contextual, oblique shot; reading close-ups are never used as tour poses. */
export function houseGuideShot(step: HouseGuideStep, camera: THREE.PerspectiveCamera, approach: THREE.Vector3, isClear?: (position: THREE.Vector3) => boolean) {
  step.target.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(step.target, true);
  if (bounds.isEmpty()) return null;
  const center = bounds.getCenter(new THREE.Vector3());
  for (const target of step.contextTargets ?? []) {
    target.updateWorldMatrix(true, true);
    bounds.union(new THREE.Box3().setFromObject(target, true));
  }
  center.lerp(bounds.getCenter(new THREE.Vector3()), 0.35);
  const horizontal = step.cameraMarker
    ? step.cameraMarker.getWorldPosition(new THREE.Vector3()).sub(center).setY(0)
    : approach.clone().sub(center).setY(0);
  if (horizontal.lengthSq() < 0.001) horizontal.copy(approach).sub(center).setY(0);
  if (horizontal.lengthSq() < 0.001) return null;
  horizontal.normalize();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * Math.max(camera.aspect, 0.1);
  const elevations = [step.elevation ?? 0.35, Math.min(step.elevation ?? 0.35, 0.12), 0.04];
  for (const elevation of elevations) for (const angle of [0, -0.28, 0.28, -0.55, 0.55, -0.85, 0.85, -1.1, 1.1]) {
    const direction = horizontal.clone().applyAxisAngle(UP, angle).setY(Math.min(0.55, elevation)).normalize();
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(center.clone().add(direction), center, UP));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    let distance = step.minDistance ?? 2.1;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new THREE.Vector3(x, y, z).sub(center);
      distance = Math.max(distance, point.dot(direction) + Math.abs(point.dot(right)) * 1.3 / tanX,
        point.dot(direction) + Math.abs(point.dot(screenUp)) * 1.3 / tanY, point.dot(direction) + camera.near + 0.1);
    }
    const position = center.clone().addScaledVector(direction, distance);
    if (![...position.toArray(), ...rotation.toArray()].every(Number.isFinite)) continue;
    if (!isClear || isClear(position)) return { position, rotation, center };
  }
  return null;
}

/** A continuous first-entry tour; every available section is shown automatically. */
export class HouseFirstVisitGuide {
  private stage: Stage = "idle";
  private active = false;
  private attempted = false;
  private elapsed = 0;
  private duration = 1;
  private index = -1;
  private ownsCamera = false;
  private finishing = false;
  private current?: HouseGuideStep;
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedRotation = new THREE.Quaternion();
  private readonly fromRotation = new THREE.Quaternion();
  private readonly movePosition = new THREE.Vector3();
  private readonly moveRotation = new THREE.Quaternion();
  private readonly holdStart = new THREE.Vector3();
  private readonly holdEnd = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private curve?: THREE.Curve<THREE.Vector3>;
  private pending: "holding" | "finish" = "holding";
  private veilStartOpacity = 0;
  private readonly reducedMotion: boolean;
  private readonly storage: Options["storage"];
  private root?: HTMLDivElement;
  private veil?: HTMLDivElement;
  private title?: HTMLElement;
  private description?: HTMLElement;
  private progress?: HTMLElement;
  private keys?: HTMLElement;
  private nextButton?: HTMLButtonElement;
  private meter?: HTMLDivElement;

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
    this.steps = this.steps.filter(step => this.shot(step));
    if (!this.steps.length) return false;
    this.createUi();
    try { this.storage?.setItem(HOUSE_GUIDE_SEEN_KEY, "seen"); } catch { /* Once in this Game instance when storage is blocked. */ }
    this.savedPosition.copy(this.camera.position);
    this.savedRotation.copy(this.camera.quaternion);
    this.active = true; this.ownsCamera = true;
    this.root!.hidden = false;
    this.title!.textContent = "Welcome to my cottage";
    this.description!.textContent = "Let me show you the places you can explore.";
    this.progress!.textContent = "A LOOK AROUND";
    this.keys!.textContent = "Enter to continue · Esc to skip tour";
    this.options.onCameraStart(this.steps[0].target);
    this.stage = "intro"; this.elapsed = 0; this.duration = 1.2;
    return true;
  }

  /** Advance during a pause; movement is never replaced by an abrupt jump. */
  advance(): void {
    if (!this.active || this.finishing || !["intro", "holding"].includes(this.stage)) return;
    this.showNext();
  }

  skip(): void {
    if (!this.active || (this.finishing && ["cover", "reveal"].includes(this.stage))) return;
    this.finishing = true;
    this.progress!.textContent = "YOUR ADVENTURE";
    this.title!.textContent = "Make yourself at home";
    this.description!.textContent = "Walk around and press E near anything you want to explore.";
    this.nextButton!.disabled = true;
    this.movePosition.copy(this.savedPosition); this.moveRotation.copy(this.savedRotation);
    this.veilStartOpacity = Number(this.veil!.style.opacity) || 0;
    this.pending = "finish"; this.stage = "cover"; this.elapsed = 0; this.duration = 0.2;
  }

  /** Scene changes restore the exact previous view synchronously. */
  cancel(): void {
    if (!this.active) return;
    this.restoreCamera();
    this.finish();
  }

  update(delta: number, available = true): void {
    if (!this.active) return;
    this.root!.hidden = !available;
    if (!available) return;
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
    this.elapsed += dt;
    const t = Math.min(this.elapsed / this.duration, 1), ease = t * t * (3 - 2 * t);
    this.meter!.style.transform = `scaleX(${t})`;
    switch (this.stage) {
      case "intro":
        if (t === 1) this.showNext();
        break;
      case "moving":
      case "returning":
        this.camera.position.copy(this.curve!.getPointAt(ease));
        this.camera.quaternion.slerpQuaternions(this.fromRotation, this.moveRotation, ease);
        if (t === 1) {
          this.camera.position.copy(this.movePosition);
          this.camera.quaternion.copy(this.moveRotation);
          if (this.stage === "returning") { this.restoreCamera(); this.finish(); }
          else this.beginHold();
        }
        break;
      case "holding":
        if (!this.reducedMotion) {
          this.camera.position.lerpVectors(this.holdStart, this.holdEnd, ease);
          this.camera.lookAt(this.center);
        }
        if (t === 1) this.showNext();
        break;
      case "cover":
        this.veil!.style.opacity = String(this.veilStartOpacity + (1 - this.veilStartOpacity) * ease);
        if (t === 1) {
          this.camera.position.copy(this.movePosition); this.camera.quaternion.copy(this.moveRotation);
          this.stage = "reveal"; this.elapsed = 0; this.duration = 0.2;
        }
        break;
      case "reveal":
        this.veil!.style.opacity = String(1 - ease);
        if (t === 1) {
          if (this.pending === "finish") { this.restoreCamera(); this.finish(); }
          else this.beginHold();
        }
        break;
    }
  }

  private shot(step: HouseGuideStep) {
    return houseGuideShot(step, this.camera, this.options.approach,
      this.options.route ? point => this.options.route!.isClear(point) : undefined);
  }

  private showNext(): void {
    this.index++;
    this.current = this.steps[this.index];
    if (!this.current) { this.returnToPlayer(); return; }
    const shot = this.shot(this.current);
    if (!shot) { this.showNext(); return; }
    this.center.copy(shot.center);
    this.title!.textContent = this.current.title;
    this.description!.textContent = this.current.description;
    this.progress!.textContent = `HOUSE TOUR · ${this.index + 1} / ${this.steps.length}`;
    this.nextButton!.textContent = this.index === this.steps.length - 1 ? "Start exploring" : "Next section →";
    this.options.onTargetChange?.(this.current.target);
    this.holdStart.copy(shot.position); this.holdEnd.copy(shot.position);
    if (!this.reducedMotion) {
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(shot.rotation).multiplyScalar(0.16);
      const start = shot.position.clone().sub(side), end = shot.position.clone().add(side);
      if (!this.options.route || this.options.route.segmentClear(start, end)) {
        this.holdStart.copy(start); this.holdEnd.copy(end);
      }
    }
    this.movePosition.copy(this.holdStart);
    this.moveRotation.setFromRotationMatrix(new THREE.Matrix4().lookAt(this.holdStart, this.center, UP));
    this.pending = "holding";
    this.beginMove(false);
  }

  private beginMove(returning: boolean): void {
    this.nextButton!.disabled = true;
    this.elapsed = 0;
    this.fromRotation.copy(this.camera.quaternion);
    const route = this.options.route?.plan(this.camera.position, this.movePosition);
    if (this.reducedMotion || (this.options.route && !route)) {
      this.veilStartOpacity = Number(this.veil!.style.opacity) || 0;
      this.stage = "cover"; this.duration = 0.2;
      return;
    }
    const points = route ?? [this.camera.position.clone(), this.movePosition.clone()];
    this.curve = this.options.route?.curve(points) ?? new THREE.LineCurve3(points[0], points[points.length - 1]);
    this.stage = returning ? "returning" : "moving";
    this.duration = THREE.MathUtils.clamp(this.curve.getLength() / 4.5, 1.5, 4.5);
  }

  private beginHold(): void {
    this.stage = "holding"; this.elapsed = 0; this.duration = 3.4;
    this.nextButton!.disabled = false;
    this.keys!.textContent = "Enter for next section · Esc to skip tour";
  }

  private returnToPlayer(): void {
    this.finishing = true;
    this.progress!.textContent = "YOUR ADVENTURE";
    this.title!.textContent = "Make yourself at home";
    this.description!.textContent = "WASD to move · Press E near an object to interact.";
    this.movePosition.copy(this.savedPosition); this.moveRotation.copy(this.savedRotation);
    this.pending = "finish";
    this.beginMove(true);
  }

  private restoreCamera(): void {
    this.camera.position.copy(this.savedPosition); this.camera.quaternion.copy(this.savedRotation);
    this.camera.updateMatrixWorld(true);
  }

  private finish(): void {
    this.active = false; this.stage = "idle";
    this.root!.hidden = true;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.root!.contains(focused)) focused.blur();
    if (this.ownsCamera) { this.ownsCamera = false; this.options.onCameraEnd(); }
  }

  private createUi(): void {
    const root = document.createElement("div"); root.className = "house-guide"; root.hidden = true;
    const veil = document.createElement("div"); veil.className = "house-guide__veil"; veil.setAttribute("aria-hidden", "true");
    const topBar = document.createElement("div"), bottomBar = document.createElement("div");
    topBar.className = "house-guide__bar house-guide__bar_top";
    bottomBar.className = "house-guide__bar house-guide__bar_bottom";
    topBar.setAttribute("aria-hidden", "true"); bottomBar.setAttribute("aria-hidden", "true");
    const panel = document.createElement("section"); panel.className = "house-guide__card";
    panel.setAttribute("aria-label", "Cinematic house tour");
    const progress = document.createElement("div"); progress.className = "house-guide__progress";
    const copy = document.createElement("div"); copy.setAttribute("role", "status"); copy.setAttribute("aria-live", "polite");
    const title = document.createElement("h2"), description = document.createElement("p"); copy.append(title, description);
    const actions = document.createElement("div"); actions.className = "house-guide__actions";
    const next = document.createElement("button"); next.type = "button"; next.textContent = "Begin tour →";
    next.addEventListener("click", () => this.advance());
    const skip = document.createElement("button"); skip.type = "button"; skip.className = "house-guide__skip"; skip.textContent = "Skip tour";
    skip.addEventListener("click", () => this.skip());
    const keys = document.createElement("p"); keys.className = "house-guide__keys";
    const track = document.createElement("div"), meter = document.createElement("div");
    track.className = "house-guide__track"; meter.className = "house-guide__meter";
    track.setAttribute("aria-hidden", "true"); track.append(meter);
    actions.append(next, skip); panel.append(progress, copy, actions, keys, track);
    root.append(topBar, bottomBar, veil, panel); document.body.appendChild(root);
    this.root = root; this.veil = veil; this.title = title; this.description = description;
    this.progress = progress; this.keys = keys; this.nextButton = next; this.meter = meter;
  }

  destroy(): void { this.cancel(); this.root?.remove(); }
}
