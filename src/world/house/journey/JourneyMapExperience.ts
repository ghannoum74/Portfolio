import * as THREE from "three";
import { JOURNEY_CHAPTERS, type JourneyChapter } from "../../../data/journey";
import "../../../ui/JourneyMap/JourneyMap.css";

type State = "idle" | "entering" | "active" | "leaving";
type Shot = { position: THREE.Vector3; rotation: THREE.Quaternion };
type Stop = {
  data: JourneyChapter;
  group: THREE.Group;
  gem: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Sprite;
  hit: THREE.Mesh;
  shine: number;
};

const UP = new THREE.Vector3(0, 1, 0);
const GOLD = new THREE.Color("#ddbb76");
const COLORS = ["#a7caba", "#e3b978", "#a9b5d2", "#c9b59a"];

/**
 * A physical, symbolic journey drawn over SEC_MAP_MapTop. Uses Blender Empty
 * markers when available, otherwise fits a subtle route to the map's bounds.
 * No separate GLB, heavy particles, postprocessing, or gameplay colliders.
 */
export class JourneyMapExperience {
  private readonly root = new THREE.Group();
  private readonly stops: Stop[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly baseRoute: THREE.Line;
  private readonly activeRoute: THREE.Line;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly overviewPosition = new THREE.Vector3();
  private readonly overviewRotation = new THREE.Quaternion();
  private readonly mapCenter = new THREE.Vector3();
  private readonly mapSpan: number;

  private readonly panel: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly description: HTMLElement;
  private readonly chips: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly nav: HTMLElement;
  private readonly navTitle: HTMLElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;

  private readonly fromPosition = new THREE.Vector3();
  private readonly toPosition = new THREE.Vector3();
  private readonly fromRotation = new THREE.Quaternion();
  private readonly toRotation = new THREE.Quaternion();
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedRotation = new THREE.Quaternion();
  private readonly approach = new THREE.Vector3();

  private state: State = "idle";
  private selected: number | null = null;
  private hovered: number | null = null;
  private pointerInside = false;
  private pointerX = 0;
  private pointerY = 0;
  private seconds = 0;
  private elapsed = 0;
  private duration = 1;
  private routeProgress = 0;
  private afterLeave: (() => void) | null = null;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private readonly house: THREE.Object3D,
    mapTop: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
  ) {
    house.updateWorldMatrix(true, true);
    this.root.name = "JOURNEY_MAP_MAGIC_ROUTE";
    const mapBounds = new THREE.Box3().setFromObject(mapTop, true);
    const table = house.getObjectByName("SEC_MAP_Table_Large");
    const tableBounds = table ? new THREE.Box3().setFromObject(table, true) : mapBounds;
    const sheet = mapBounds.isEmpty() ? tableBounds : mapBounds;
    const center = sheet.getCenter(new THREE.Vector3());
    const size = sheet.getSize(new THREE.Vector3());
    const tabletop = tableBounds.isEmpty() ? center.y : tableBounds.max.y;
    // Place route slightly above the map's upper surface; fallback for thin/oddly-oriented exports.
    center.y = Math.max(sheet.max.y, tabletop) + 0.035;
    this.mapCenter.copy(center);
    this.mapSpan = THREE.MathUtils.clamp(Math.max(size.x, size.z), 1.0, 4.0);
    this.root.position.copy(this.house.worldToLocal(center.clone()));
    this.house.add(this.root);
    this.root.updateWorldMatrix(true, false);

    const spreadX = THREE.MathUtils.clamp(size.x * 0.65, 0.65, 2.6);
    const spreadZ = THREE.MathUtils.clamp(size.z * 0.58, 0.35, 1.8);
    const routeCoords = [
      [-0.42, -0.23],
      [-0.14, 0.22],
      [0.15, -0.20],
      [0.42, 0.18],
    ];
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < JOURNEY_CHAPTERS.length; i++) {
      const marker = house.getObjectByName(`JOURNEY_NODE_0${i + 1}`);
      const candidate = marker
        ? marker.getWorldPosition(new THREE.Vector3())
        : center.clone().add(new THREE.Vector3(routeCoords[i][0] * spreadX, 0, routeCoords[i][1] * spreadZ));
      if (marker) candidate.y += 0.02;
      points.push(this.house.worldToLocal(candidate).sub(this.root.position));
    }
    // Routes stay on the table, with gentle bends between the physical waypoints.
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.4);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(110));
    this.baseRoute = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: 0x766044, transparent: true, opacity: 0.42, depthWrite: false,
    }));
    this.activeRoute = new THREE.Line(geometry.clone(), new THREE.LineBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    this.activeRoute.geometry.setDrawRange(0, 0);
    this.root.add(this.baseRoute, this.activeRoute);

    this.glowTexture = this.createGlowTexture();
    for (let i = 0; i < points.length; i++) this.createStop(JOURNEY_CHAPTERS[i], points[i], i);

    this.panel = document.createElement("section");
    this.panel.className = "journey-inspector";
    this.panel.setAttribute("aria-label", "Journey milestone");
    this.panel.setAttribute("aria-live", "polite");
    this.eyebrow = document.createElement("div");
    this.eyebrow.className = "journey-inspector__eyebrow";
    this.heading = document.createElement("h2");
    this.description = document.createElement("p");
    this.chips = document.createElement("div");
    this.chips.className = "journey-inspector__chips";
    this.panel.append(this.eyebrow, this.heading, this.description, this.chips);
    document.body.appendChild(this.panel);

    this.hint = document.createElement("div");
    this.hint.className = "journey-hover-hint";
    this.hint.textContent = "FOLLOW THE TRAIL ✦";
    this.hint.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.hint);

    this.nav = document.createElement("nav");
    this.nav.className = "journey-controls";
    this.nav.setAttribute("aria-label", "Journey map navigation");
    this.previous = document.createElement("button");
    this.previous.type = "button";
    this.previous.textContent = "‹";
    this.previous.setAttribute("aria-label", "Previous chapter");
    this.previous.addEventListener("click", this.onPrevious);
    this.next = document.createElement("button");
    this.next.type = "button";
    this.next.textContent = "›";
    this.next.setAttribute("aria-label", "Next chapter");
    this.next.addEventListener("click", this.onNext);
    this.navTitle = document.createElement("span");
    this.navTitle.className = "journey-controls__title";
    this.navTitle.textContent = "THE CARTOGRAPHER'S TRAIL";
    const keys = document.createElement("span");
    keys.className = "journey-controls__keys";
    keys.innerHTML = "<kbd>E</kbd> Explore <kbd>Esc</kbd> Return";
    this.nav.append(this.previous, this.navTitle, this.next, keys);
    document.body.appendChild(this.nav);

    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  get isControllingCamera(): boolean { return this.state !== "idle"; }
  get mode(): State { return this.state; }

  enter(): boolean {
    if (this.state !== "idle" || !this.stops.length) return false;
    this.camera.updateMatrixWorld(true);
    this.savedPosition.copy(this.camera.position);
    this.savedRotation.copy(this.camera.quaternion);
    this.selected = null;
    this.hovered = null;
    this.routeProgress = 0;
    this.panel.classList.remove("is-visible");
    this.nav.classList.add("is-visible");
    this.approach.copy(this.savedPosition).sub(this.mapCenter);
    this.approach.y = 0;
    if (this.approach.lengthSq() < 0.001) this.approach.set(0, 0, 1);
    this.approach.normalize();
    const shot = this.makeOverview();
    this.overviewPosition.copy(shot.position);
    this.overviewRotation.copy(shot.rotation);
    this.beginTween(shot, this.reducedMotion ? 0.02 : 0.98);
    this.state = "entering";
    return true;
  }

  leave(done: () => void): void {
    if (this.state === "idle" || this.state === "leaving") return;
    this.state = "leaving";
    this.afterLeave = done;
    this.selected = null;
    this.hovered = null;
    this.panel.classList.remove("is-visible");
    this.nav.classList.remove("is-visible");
    this.hint.classList.remove("is-visible");
    this.setCursor(false);
    this.beginTween({ position: this.savedPosition, rotation: this.savedRotation }, this.reducedMotion ? 0.02 : 0.72);
  }

  clickAt(clientX: number, clientY: number): boolean {
    if (this.state !== "active") return false;
    const index = this.pick(clientX, clientY);
    if (index === null) return false;
    this.inspect(index);
    return true;
  }

  toggleSelection(): void {
    if (this.state !== "active") return;
    if (this.selected === null) this.inspect(this.hovered ?? 0);
    else this.showOverview();
  }

  selectRelative(amount: number): void {
    if (this.state !== "active") return;
    const next = this.selected === null ? (amount > 0 ? 0 : this.stops.length - 1)
      : (this.selected + amount + this.stops.length) % this.stops.length;
    this.inspect(next);
  }

  update(delta: number): void {
    if (!this.house.visible) return;
    const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
    this.seconds += dt;
    this.routeProgress = THREE.MathUtils.damp(this.routeProgress, this.state === "idle" ? 0 : 1, 2.8, dt);
    const count = this.activeRoute.geometry.getAttribute("position").count;
    this.activeRoute.geometry.setDrawRange(0, this.state === "idle" ? 0 : Math.ceil(this.routeProgress * count));
    for (let i = 0; i < this.stops.length; i++) {
      const stop = this.stops[i];
      const selected = this.state !== "idle" && i === this.selected;
      const hovered = this.state === "active" && i === this.hovered;
      stop.shine = THREE.MathUtils.damp(stop.shine, selected ? 1 : hovered ? 0.7 : 0.12, 7, dt);
      const wave = 0.5 + 0.5 * Math.sin(this.seconds * 1.8 + i * 1.7);
      stop.gem.position.y = THREE.MathUtils.damp(stop.gem.position.y, 0.075 + 0.018 * wave + stop.shine * 0.075, 8, dt);
      stop.gem.rotation.y += dt * (0.17 + stop.shine * 0.3);
      stop.gem.material.emissiveIntensity = 0.2 + stop.shine * 0.85 + 0.06 * wave;
      stop.ring.material.opacity = 0.33 + stop.shine * 0.48;
      stop.ring.scale.setScalar(1 + stop.shine * 0.22 + wave * 0.03);
      (stop.halo.material as THREE.SpriteMaterial).opacity = 0.08 + stop.shine * 0.24;
    }
    if (this.state === "idle") return;
    if (this.elapsed < this.duration) {
      this.elapsed = Math.min(this.duration, this.elapsed + dt);
      const t = this.elapsed / this.duration;
      const eased = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(this.fromPosition, this.toPosition, eased);
      this.camera.quaternion.slerpQuaternions(this.fromRotation, this.toRotation, eased);
      this.camera.updateMatrixWorld(true);
      if (t === 1 && this.state === "entering") this.state = "active";
      if (t === 1 && this.state === "leaving") {
        this.state = "idle";
        const callback = this.afterLeave;
        this.afterLeave = null;
        callback?.();
        return;
      }
    }
    if (this.state !== "active") return;
    this.hovered = this.pointerInside ? this.pick(this.pointerX, this.pointerY) : null;
    const over = this.hovered !== null;
    this.setCursor(over);
    this.hint.classList.toggle("is-visible", over);
    if (over) {
      const pos = this.stops[this.hovered!].group.getWorldPosition(new THREE.Vector3()).project(this.camera);
      const rect = this.canvas.getBoundingClientRect();
      this.hint.style.left = `${THREE.MathUtils.clamp(rect.left + (pos.x + 1) * rect.width / 2, 75, window.innerWidth - 75)}px`;
      this.hint.style.top = `${THREE.MathUtils.clamp(rect.top + (1 - pos.y) * rect.height / 2 - 72, 35, window.innerHeight - 60)}px`;
    }
  }

  private createStop(data: JourneyChapter, point: THREE.Vector3, i: number): void {
    const group = new THREE.Group();
    group.name = `JOURNEY_WAYPOINT_${i + 1}`;
    group.position.copy(point);
    this.root.add(group);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.085, 0.12, 28),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    group.add(ring);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.077, 0),
      new THREE.MeshStandardMaterial({
        color: COLORS[i], emissive: COLORS[i], emissiveIntensity: 0.25,
        metalness: 0.2, roughness: 0.38, flatShading: true,
      }),
    );
    gem.position.y = 0.075;
    group.add(gem);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture, color: COLORS[i], transparent: true,
      opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.position.y = 0.11;
    halo.scale.set(0.42, 0.42, 1);
    group.add(halo);
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    // Material is invisible but the object stays visible so the raycaster can hit it.
    hit.position.y = 0.085;
    group.add(hit);
    this.stops.push({ data, group, gem, ring, halo, hit, shine: 0 });
  }

  private makeOverview(): Shot {
    const marker = this.house.getObjectByName("CAMERA_JOURNEY_MAP");
    if (marker) {
      marker.updateWorldMatrix(true, false);
      return {
        position: marker.getWorldPosition(new THREE.Vector3()),
        rotation: marker.getWorldQuaternion(new THREE.Quaternion()),
      };
    }
    const distance = THREE.MathUtils.clamp(this.mapSpan * 1.18, 1.65, 3.15);
    const position = this.mapCenter.clone().addScaledVector(this.approach, distance);
    position.y += THREE.MathUtils.clamp(this.mapSpan * 0.88, 1.12, 2.0);
    return this.lookAt(position, this.mapCenter);
  }

  private inspect(index: number): void {
    const stop = this.stops[index];
    if (!stop) return;
    if (this.selected === index) { this.showOverview(); return; }
    this.selected = index;
    this.eyebrow.textContent = `${String(index + 1).padStart(2, "0")} / ${String(this.stops.length).padStart(2, "0")}   ·   ${stop.data.date}`;
    this.heading.textContent = stop.data.title;
    this.description.textContent = stop.data.description;
    this.chips.replaceChildren();
    for (const text of stop.data.details) {
      const span = document.createElement("span");
      span.textContent = text;
      this.chips.appendChild(span);
    }
    this.navTitle.textContent = stop.data.date;
    this.panel.classList.add("is-visible");
    const world = stop.group.getWorldPosition(new THREE.Vector3());
    const nextPos = this.overviewPosition.clone().lerp(world, 0.10);
    nextPos.y = this.overviewPosition.y - 0.08;
    this.beginTween(this.lookAt(nextPos, world), this.reducedMotion ? 0.02 : 0.62);
  }

  private showOverview(): void {
    this.selected = null;
    this.panel.classList.remove("is-visible");
    this.navTitle.textContent = "THE CARTOGRAPHER'S TRAIL";
    this.beginTween({ position: this.overviewPosition, rotation: this.overviewRotation }, this.reducedMotion ? 0.02 : 0.62);
  }

  private lookAt(position: THREE.Vector3, target: THREE.Vector3): Shot {
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, UP));
    return { position, rotation };
  }

  private beginTween(shot: Shot, seconds: number): void {
    this.fromPosition.copy(this.camera.position);
    this.fromRotation.copy(this.camera.quaternion);
    this.toPosition.copy(shot.position);
    this.toRotation.copy(shot.rotation);
    this.elapsed = 0;
    this.duration = seconds;
  }

  private pick(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.stops.map(s => s.hit), false);
    if (!hits.length) return null;
    const index = this.stops.findIndex(s => s.hit === hits[0].object);
    return index < 0 ? null : index;
  }

  private createGlowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot create Journey Map aura texture");
    const gradient = ctx.createRadialGradient(48, 48, 1, 48, 48, 47);
    gradient.addColorStop(0, "rgba(255,251,226,.85)");
    gradient.addColorStop(0.28, "rgba(248,219,155,.27)");
    gradient.addColorStop(1, "rgba(248,219,155,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);
    return new THREE.CanvasTexture(canvas);
  }

  private setCursor(on: boolean): void { this.canvas.style.cursor = on ? "pointer" : ""; }
  private onPrevious = (): void => this.selectRelative(-1);
  private onNext = (): void => this.selectRelative(1);
  private onPointerMove = (event: PointerEvent): void => {
    this.pointerInside = true;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  };
  private onPointerLeave = (): void => {
    this.pointerInside = false;
    this.hovered = null;
    this.setCursor(false);
    this.hint.classList.remove("is-visible");
  };

  destroy(): void {
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.previous.removeEventListener("click", this.onPrevious);
    this.next.removeEventListener("click", this.onNext);
    this.setCursor(false);
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
        else object.material.dispose();
      } else if (object instanceof THREE.Sprite) (object.material as THREE.SpriteMaterial).dispose();
    });
    this.glowTexture.dispose();
    this.root.removeFromParent();
    this.panel.remove();
    this.hint.remove();
    this.nav.remove();
  }
}
