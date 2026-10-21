import * as THREE from "three";
import { performanceOptions } from "../../../core/PerformanceOptions";
import type { Interactable } from "../../../interactions/Interactable";

/**
 * All small, tactile furniture interactions in one system.
 * Uses existing Blender objects; no new GLB or physics colliders needed.
 * Main experiences (book, workshop, awards, journey map) remain independent.
 */

type FurnitureKind =
  | "cauldron" | "potion" | "drawer" | "sink" | "flame"
  | "books" | "rest" | "notice" | "plant";

type FurnitureId =
  | "cauldron" | "potionGreen" | "potionBlue" | "potionGold"
  | "alchemyDrawer" | "sink" | "candle" | "torch" | "bookStack"
  | "bed" | "fireside" | "noticeBoard" | "houseplant";

type FurnitureDefinition = {
  id: FurnitureId;
  objectName: string;
  kind: FurnitureKind;
  label: string;
  message: string;
  color: number;
  range: number;
  initialOn?: boolean;
};

// These are verified object names in house-v2(9).blend.
// Avoid targets owned by the Book, Workshop, Awards Hall or Journey Map.
const FURNITURE: readonly FurnitureDefinition[] = [
  { id: "cauldron", objectName: "SEC_ALCHEMY_Cauldron", kind: "cauldron", label: "Brew at Cauldron", message: "A little alchemy. The cauldron is bubbling!", color: 0x70d9a5, range: 2.25 },
  { id: "potionGreen", objectName: "SEC_ALCHEMY_Potion_1", kind: "potion", label: "Inspect Verdant Elixir", message: "Verdant Elixir — a vial of curious energy.", color: 0x85dd9e, range: 1.65 },
  { id: "potionBlue", objectName: "SEC_ALCHEMY_Potion_2", kind: "potion", label: "Inspect Moonwater", message: "Moonwater — bright as a midnight sky.", color: 0x82c8ef, range: 1.65 },
  { id: "potionGold", objectName: "SEC_ALCHEMY_Potion_4", kind: "potion", label: "Inspect Sunfire", message: "Sunfire — a drop of bottled daylight.", color: 0xe9ba70, range: 1.65 },
  { id: "alchemyDrawer", objectName: "SEC_ALCHEMY_Drawer_4", kind: "drawer", label: "Open Alchemy Drawer", message: "A drawer of forgotten ingredients.", color: 0xdfbd81, range: 1.8 },
  { id: "sink", objectName: "SEC_KITCHEN_Kitchen_Sink", kind: "sink", label: "Turn On Water", message: "A tiny stream of magical spring water.", color: 0x96dceb, range: 1.9 },
  { id: "candle", objectName: "SEC_REST_Candle_2", kind: "flame", label: "Light Candle", message: "A warm candlelight fills the room.", color: 0xffbd71, range: 1.75 },
  { id: "torch", objectName: "SEC_WORKSHOP_Torch_Metal", kind: "flame", label: "Light Torch", message: "The workshop torch awakens.", color: 0xffac65, range: 1.7 },
  { id: "bookStack", objectName: "SEC_LIBRARY_Book_Stack_2", kind: "books", label: "Examine Old Books", message: "Old books, new ideas. Every adventure starts somewhere.", color: 0xd8b88a, range: 1.8 },
  { id: "bed", objectName: "SEC_REST_Bed_King", kind: "rest", label: "Rest a Moment", message: "Every adventurer needs a moment to dream.", color: 0xe5c9a8, range: 2.35 },
  { id: "fireside", objectName: "SEC_HEARTH_Pouf", kind: "rest", label: "Relax by the Hearth", message: "A peaceful pause beside the fire.", color: 0xf4b77e, range: 1.9 },
  { id: "noticeBoard", objectName: "SEC_ENTRANCE_NoticeBoard", kind: "notice", label: "Read Notice Board", message: "Traveler's note: seek the book, workshop, awards and map — and take your time exploring.", color: 0xe6c889, range: 1.9 },
  { id: "houseplant", objectName: "SEC_DECOR_Houseplant_4", kind: "plant", label: "Greet the Houseplant", message: "Even the houseplants enjoy a little company.", color: 0x96c99a, range: 1.65 },
];

type FurnitureNode = {
  def: FurnitureDefinition;
  model: THREE.Object3D;
  initialPosition: THREE.Vector3;
  initialRotation: THREE.Euler;
  anchor: THREE.Group;
  aura: THREE.Sprite;
  auraMaterial: THREE.SpriteMaterial;
  light?: THREE.PointLight;
  flame?: THREE.Mesh;
  stream?: THREE.Mesh;
  bubbles?: THREE.InstancedMesh;
  bubbleGeometry?: THREE.SphereGeometry;
  progress: number;
  active: boolean;
  burst: number;
  phase: number;
  effectSize: number;
};

type FocusState = "idle" | "entering" | "resting" | "leaving";

export type FurnitureOptions = {
  /** Called before taking the player camera. Return false to cancel. */
  onFocusStart: () => boolean;
  /** Called only after the camera has returned to the saved position. */
  onFocusEnd: () => void;
  isMuted?: () => boolean;
};

class FurnitureInteractable implements Interactable {
  readonly position = new THREE.Vector3();
  readonly highlightTarget: THREE.Object3D;
  readonly interactionDistance: number;

  constructor(
    private readonly owner: HouseFurnitureInteractions,
    private readonly node: FurnitureNode,
  ) {
    this.highlightTarget = node.model;
    this.interactionDistance = node.def.range;
    node.model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(node.model, true);
    if (bounds.isEmpty()) {
      node.model.getWorldPosition(this.position);
    } else {
      bounds.getCenter(this.position);
      // World-space player proximity, not the top of tall shelves.
      this.position.y = bounds.min.y + Math.min(0.95, bounds.max.y - bounds.min.y);
    }
  }

  getHint(): string { return this.owner.getHint(this.node.def.id); }
  interact(): void { this.owner.interact(this.node.def.id); }
}

export class HouseFurnitureInteractions {
  private readonly nodes = new Map<FurnitureId, FurnitureNode>();
  private readonly texture: THREE.CanvasTexture;
  private readonly notice: HTMLDivElement;
  private readonly styleElement: HTMLStyleElement;
  private readonly cameraFrom = new THREE.Vector3();
  private readonly cameraTo = new THREE.Vector3();
  private readonly rotationFrom = new THREE.Quaternion();
  private readonly rotationTo = new THREE.Quaternion();
  private readonly savedPosition = new THREE.Vector3();
  private readonly savedRotation = new THREE.Quaternion();
  private readonly bubbleMatrix = new THREE.Matrix4();
  private readonly bubblePosition = new THREE.Vector3();
  private readonly bubbleScale = new THREE.Vector3();
  private readonly bubbleQuaternion = new THREE.Quaternion();
  private readonly workPoint = new THREE.Vector3();
  private focusState: FocusState = "idle";
  private transitionElapsed = 0;
  private transitionLength = 1;
  private messageTime = 0;
  private elapsed = 0;
  private audio?: AudioContext;

  constructor(
    private readonly house: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly options: FurnitureOptions,
  ) {
    house.updateWorldMatrix(true, true);
    this.texture = this.makeAuraTexture();
    this.styleElement = document.createElement("style");
    this.styleElement.dataset.furnitureInteractions = "true";
    this.styleElement.textContent = `
      .furniture-toast { position:fixed; z-index:94; left:50%; bottom:clamp(22px,5vh,52px);
        transform:translate(-50%,12px); max-width:min(530px,calc(100vw - 36px));
        padding:13px 20px; text-align:center; border:2px solid #bea17a; border-radius:10px;
        background:rgba(245,233,200,.97); color:#513c2b;
        font:14px/1.45 var(--font-root,"Coiny",system-ui); box-shadow:3px 4px 0 #4937273b,0 12px 30px #2d211c33;
        opacity:0; visibility:hidden; pointer-events:none;
        transition:opacity .24s ease,transform .35s ease,visibility .24s;
      }
      .furniture-toast.is-visible { opacity:1; visibility:visible; transform:translate(-50%,0); }
      .furniture-toast small { display:block; margin-top:5px; font:11px system-ui,sans-serif; color:#82694b; }
      @media(prefers-reduced-motion:reduce){ .furniture-toast{transition:none} }
    `;
    document.head.appendChild(this.styleElement);
    this.notice = document.createElement("div");
    this.notice.className = "furniture-toast";
    this.notice.setAttribute("role", "status");
    this.notice.setAttribute("aria-live", "polite");
    document.body.appendChild(this.notice);

    for (const def of FURNITURE) {
      const model = house.getObjectByName(def.objectName);
      if (!model) {
        console.info(`[Furniture] Optional object not present: ${def.objectName}`);
        continue;
      }
      this.nodes.set(def.id, this.makeNode(def, model));
    }
    console.info(`[Furniture] Loaded ${this.nodes.size}/${FURNITURE.length} furniture interactions.`);
  }

  /** Register all remaining props with the *existing* E-key InteractionSystem. */
  register(registerInteraction: (interaction: Interactable) => void): number {
    for (const node of this.nodes.values()) {
      registerInteraction(new FurnitureInteractable(this, node));
    }
    return this.nodes.size;
  }

  get isControllingCamera(): boolean { return this.focusState !== "idle"; }
  get activeCount(): number { return this.nodes.size; }

  getHint(id: FurnitureId): string {
    const node = this.nodes.get(id);
    if (!node) return "Interact";
    if (!node.active) return node.def.label;
    switch (node.def.kind) {
      case "cauldron": return "Settle Cauldron";
      case "potion": return "Set Down Elixir";
      case "drawer": return "Close Alchemy Drawer";
      case "sink": return "Turn Off Water";
      case "flame": return "Extinguish Flame";
      default: return node.def.label;
    }
  }

  /** Invoked through the normal proximity E key. */
  interact(id: FurnitureId): void {
    if (this.focusState !== "idle" || !this.house.visible) return;
    const node = this.nodes.get(id);
    if (!node) return;
    if (node.def.kind === "rest") {
      this.startRest(node);
      return;
    }
    if (["cauldron", "potion", "drawer", "sink", "flame"].includes(node.def.kind)) {
      node.active = !node.active;
    }
    node.burst = 1;
    if (node.def.kind === "books" || node.def.kind === "notice" || node.def.kind === "plant") {
      node.progress = 0;
    }
    const verb = node.active ? node.def.message : this.getTurnOffMessage(node.def.kind);
    this.showMessage(verb || node.def.message, 2.7);
    this.playNote(node.def.kind === "drawer" ? 290 : node.def.kind === "flame" ? 470 : 590);
  }

  /** During a rest camera shot, Escape or E returns the player. */
  leaveFocus(): void {
    if (this.focusState === "idle" || this.focusState === "leaving") return;
    this.focusState = "leaving";
    this.beginCameraTween(this.savedPosition, this.savedRotation, 0.78);
    this.showMessage("Returning to your adventure…", 0.8);
  }

  update(delta: number): void {
    const dt = Math.max(0, Math.min(delta, 0.05));
    this.elapsed += dt;
    if (!this.house.visible) {
      this.notice.classList.remove("is-visible");
      return;
    }
    this.messageTime = Math.max(0, this.messageTime - dt);
    if (this.messageTime === 0 && this.focusState === "idle") {
      this.notice.classList.remove("is-visible");
    }
    for (const node of this.nodes.values()) this.animateNode(node, dt);
    if (this.focusState === "idle" || this.focusState === "resting") return;
    this.transitionElapsed = Math.min(this.transitionLength, this.transitionElapsed + dt);
    const t = this.transitionElapsed / this.transitionLength;
    const ease = t * t * (3 - 2 * t);
    this.camera.position.lerpVectors(this.cameraFrom, this.cameraTo, ease);
    this.camera.quaternion.slerpQuaternions(this.rotationFrom, this.rotationTo, ease);
    if (t >= 1) {
      if (this.focusState === "entering") this.focusState = "resting";
      else {
        this.focusState = "idle";
        this.options.onFocusEnd();
      }
    }
  }

  private makeNode(def: FurnitureDefinition, model: THREE.Object3D): FurnitureNode {
    model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(model, true);
    const size = bounds.isEmpty() ? new THREE.Vector3(0.6, 0.6, 0.6) : bounds.getSize(new THREE.Vector3());
    const center = bounds.isEmpty() ? model.getWorldPosition(new THREE.Vector3()) : bounds.getCenter(new THREE.Vector3());
    const width = Math.max(size.x, size.z);
    const effectSize = THREE.MathUtils.clamp(Math.min(width, size.y) * 0.4, 0.11, 0.33);
    if (def.kind === "cauldron") center.y = bounds.isEmpty() ? center.y + 0.4 : bounds.max.y - 0.06;
    if (def.kind === "sink") center.y = bounds.isEmpty() ? center.y + 0.2 : bounds.max.y - 0.18;
    if (def.kind === "flame") center.y = bounds.isEmpty() ? center.y + 0.2 : bounds.max.y + 0.04;
    if (def.kind === "potion") center.y = bounds.isEmpty() ? center.y : bounds.max.y + 0.055;
    if (def.kind === "notice") center.y += size.y * 0.08;
    const anchor = new THREE.Group();
    anchor.name = `FURNITURE_EFFECT_${def.id}`;
    anchor.position.copy(houseWorldToLocal(this.house, center));
    this.house.add(anchor);
    const auraMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      color: def.color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const aura = new THREE.Sprite(auraMaterial);
    aura.name = `FURNITURE_AURA_${def.id}`;
    aura.scale.setScalar(Math.max(0.32, effectSize * 3.2));
    anchor.add(aura);
    const node: FurnitureNode = {
      def, model, initialPosition: model.position.clone(), initialRotation: model.rotation.clone(),
      anchor, aura, auraMaterial, progress: 0, active: !!def.initialOn,
      burst: 0, phase: Math.random() * Math.PI * 2, effectSize,
    };
    if (["cauldron", "potion", "flame", "sink"].includes(def.kind)) {
      node.light = new THREE.PointLight(def.color, 0, def.kind === "cauldron" ? 1.9 : 1.1, 2);
      node.light.visible = !performanceOptions.activeLightsOnly;
      node.light.castShadow = false;
      if (performanceOptions.decorativeLights) anchor.add(node.light);
    }
    if (def.kind === "cauldron") {
      node.bubbleGeometry = new THREE.SphereGeometry(0.043, 7, 5);
      const mat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.75, depthWrite: false });
      node.bubbles = new THREE.InstancedMesh(node.bubbleGeometry, mat, 11);
      node.bubbles.frustumCulled = false;
      node.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      anchor.add(node.bubbles);
    }
    if (def.kind === "sink") {
      const mat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      node.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.32, 6, 1, true), mat);
      node.stream.position.y = -0.11;
      anchor.add(node.stream);
    }
    if (def.kind === "flame") {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffce79, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      node.flame = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.19, 5), mat);
      node.flame.position.y = 0.08;
      anchor.add(node.flame);
    }
    return node;
  }

  private animateNode(node: FurnitureNode, dt: number): void {
    const k = node.def.kind;
    const active = node.active ? 1 : 0;
    node.progress = THREE.MathUtils.damp(node.progress, active, 6, dt);
    node.burst = Math.max(0, node.burst - dt * 1.4);
    const pulse = 0.7 + 0.3 * Math.sin(this.elapsed * 2 + node.phase);
    const power = node.progress + node.burst * 0.35;
    node.aura.visible = power > 0.001;
    node.auraMaterial.opacity = Math.min(0.34, power * 0.18 * pulse);
    const halo = Math.max(0.3, node.effectSize * 3.2) * (1 + node.burst * 0.2 + node.progress * 0.06);
    node.aura.scale.set(halo, halo, 1);
    if (node.light) {
      node.light.intensity = Math.max(0, power * (k === "cauldron" ? 0.8 : 0.43) * pulse);
      // Zero-power lights otherwise still occupy shader light slots/uniforms.
      node.light.visible = !performanceOptions.activeLightsOnly || node.light.intensity > 0.001;
    }

    if (k === "potion") {
      // Bottles only: a tiny physical lift, restored when set down.
      node.model.position.y = THREE.MathUtils.damp(
        node.model.position.y, node.initialPosition.y + node.progress * 0.045 + node.burst * 0.022,
        8, dt,
      );
    }
    if (k === "drawer") {
      // Conservative local-Z movement. If Blender has a different drawer axis,
      // change the constant below; never move colliders or other furniture.
      const target = node.initialPosition.z + node.progress * 0.095;
      node.model.position.z = THREE.MathUtils.damp(node.model.position.z, target, 8, dt);
    }
    if (k === "books" || k === "plant") {
      node.model.rotation.z = THREE.MathUtils.damp(
        node.model.rotation.z,
        node.initialRotation.z + Math.sin(this.elapsed * (k === "plant" ? 5 : 8)) * 0.028 * node.burst,
        9, dt,
      );
    }
    if (node.flame) {
      const mat = node.flame.material as THREE.MeshBasicMaterial;
      mat.opacity = node.progress * (0.72 + 0.22 * pulse);
      node.flame.visible = node.progress > 0.02;
      node.flame.scale.set(0.8 + pulse * 0.2, 0.82 + pulse * 0.24, 0.8 + pulse * 0.2);
      node.flame.rotation.y += dt * 0.6;
    }
    if (node.stream) {
      const mat = node.stream.material as THREE.MeshBasicMaterial;
      mat.opacity = node.progress * 0.58;
      node.stream.visible = node.progress > 0.02;
      node.stream.scale.y = 0.9 + Math.sin(this.elapsed * 11) * 0.06;
    }
    if (node.bubbles) {
      node.bubbles.visible = node.progress > 0.035;
      // Hidden bubbles need neither matrix math nor a GPU buffer upload.
      if (!node.bubbles.visible) return;
      for (let i = 0; i < node.bubbles.count; i++) {
        const t = this.elapsed * (0.6 + i % 3 * 0.19) + i * 0.82;
        const lift = t % 1.8;
        const radius = node.effectSize * 0.85;
        this.bubblePosition.set(
          Math.sin(t * 2 + i) * radius,
          lift * 0.23,
          Math.cos(t * 2.5 + i) * radius,
        );
        this.bubbleScale.setScalar(Math.max(0.001, node.progress * (0.42 + 0.28 * Math.sin(i + this.elapsed))));
        this.bubbleMatrix.compose(this.bubblePosition, this.bubbleQuaternion.identity(), this.bubbleScale);
        node.bubbles.setMatrixAt(i, this.bubbleMatrix);
      }
      node.bubbles.instanceMatrix.needsUpdate = true;
    }
  }

  private startRest(node: FurnitureNode): void {
    if (!this.options.onFocusStart()) return;
    this.camera.updateWorldMatrix(true, false);
    this.savedPosition.copy(this.camera.position);
    this.savedRotation.copy(this.camera.quaternion);
    node.model.getWorldPosition(this.workPoint);
    const box = new THREE.Box3().setFromObject(node.model, true);
    if (!box.isEmpty()) box.getCenter(this.workPoint);
    this.workPoint.y = box.isEmpty() ? this.workPoint.y + 0.4 : Math.max(box.min.y + 0.5, box.max.y - 0.35);
    const approach = this.camera.position.clone().sub(this.workPoint);
    approach.y = 0;
    if (approach.lengthSq() < 0.001) approach.set(0, 0, 1);
    approach.normalize();
    const desired = this.workPoint.clone().addScaledVector(approach, node.def.id === "bed" ? 2.1 : 1.75);
    desired.y += node.def.id === "bed" ? 0.85 : 0.6;
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(desired, this.workPoint, new THREE.Vector3(0, 1, 0)),
    );
    this.beginCameraTween(desired, quaternion, 0.98);
    this.focusState = "entering";
    this.showMessage(node.def.message, 999, "E / Esc  —  Return to exploring");
    this.playNote(390);
  }

  private beginCameraTween(target: THREE.Vector3, rotation: THREE.Quaternion, seconds: number): void {
    this.cameraFrom.copy(this.camera.position);
    this.rotationFrom.copy(this.camera.quaternion);
    this.cameraTo.copy(target);
    this.rotationTo.copy(rotation);
    this.transitionElapsed = 0;
    this.transitionLength = seconds;
  }

  private showMessage(message: string, duration: number, hint?: string): void {
    this.notice.replaceChildren();
    const line = document.createElement("span");
    line.textContent = message;
    this.notice.appendChild(line);
    if (hint) {
      const caption = document.createElement("small");
      caption.textContent = hint;
      this.notice.appendChild(caption);
    }
    this.notice.classList.add("is-visible");
    this.messageTime = duration;
  }

  private getTurnOffMessage(kind: FurnitureKind): string {
    switch (kind) {
      case "cauldron": return "The cauldron settles into a quiet simmer.";
      case "potion": return "The elixir is set gently back in place.";
      case "drawer": return "The ingredient drawer closes.";
      case "sink": return "The spring water stops flowing.";
      case "flame": return "The little flame goes out.";
      default: return "";
    }
  }

  private makeAuraTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D unavailable for furniture aura");
    const g = context.createRadialGradient(48, 48, 1, 48, 48, 46);
    g.addColorStop(0, "rgba(255,255,255,.88)");
    g.addColorStop(0.25, "rgba(255,255,255,.36)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = g;
    context.fillRect(0, 0, 96, 96);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private playNote(frequency: number): void {
    if (this.options.isMuted?.()) return;
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === "suspended") void this.audio.resume();
      const oscillator = this.audio.createOscillator();
      const volume = this.audio.createGain();
      const now = this.audio.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, now + 0.13);
      volume.gain.setValueAtTime(0.0001, now);
      volume.gain.exponentialRampToValueAtTime(0.022, now + 0.018);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(volume);
      volume.connect(this.audio.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.22);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    } catch { /* Audio unsupported or user gesture blocked — visual effects still work. */ }
  }

  destroy(): void {
    this.notice.remove();
    this.styleElement.remove();
    for (const node of this.nodes.values()) {
      node.model.position.copy(node.initialPosition);
      node.model.rotation.copy(node.initialRotation);
      node.anchor.removeFromParent();
      node.auraMaterial.dispose();
      if (node.flame) {
        node.flame.geometry.dispose();
        (node.flame.material as THREE.Material).dispose();
      }
      if (node.stream) {
        node.stream.geometry.dispose();
        (node.stream.material as THREE.Material).dispose();
      }
      if (node.bubbles) {
        node.bubbleGeometry?.dispose();
        (node.bubbles.material as THREE.Material).dispose();
      }
    }
    this.texture.dispose();
    void this.audio?.close();
  }
}

function houseWorldToLocal(house: THREE.Object3D, world: THREE.Vector3): THREE.Vector3 {
  return house.worldToLocal(world.clone());
}
