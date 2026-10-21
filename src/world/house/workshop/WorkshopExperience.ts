import * as THREE from "three";
import { performanceOptions } from "../../../core/PerformanceOptions";
import { WORKSHOP_SKILLS, type WorkshopSkill } from "../../../data/skills";
import "../../../ui/WorkshopExperience/WorkshopExperience.css";
import { WorkshopSound } from "./WorkshopSound";

type Mode = "idle" | "entering" | "active" | "leaving";
type Artifact = {
  skill: WorkshopSkill;
  anchor: THREE.Group;
  floating: THREE.Group;
  hitTarget: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  baseScale: number;
  floatOffset: number;
  hoverLevel: number;
  pulse: number;
  /** Smoothed selection strength for frame-rate-independent treasure light. */
  glowSelection: number;
  glowHalo: THREE.Sprite;
  glowLight: THREE.PointLight;
  glowRune: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  primary?: THREE.Object3D;
  secondary?: THREE.Object3D;
};

const COLOR = {
  paper: 0xe9d7af,
  teal: 0x7ac0ad,
  bronze: 0xb99561,
  darkBronze: 0x634a32,
  clay: 0xc18c69,
  slate: 0x829c98,
} as const;

const TREASURE_COLORS = [0x83d9bd, 0xe7b66b, 0xbba5db, 0x9dcfc4] as const;

const markerName = (index: number) =>
  `SKILL_WORKSHOP_${String(index + 1).padStart(2, "0")}`;

export class WorkshopExperience {
  private readonly artifacts: Artifact[] = [];
  private readonly label = document.createElement("div");
  private readonly panel = document.createElement("section");
  private readonly controls = document.createElement("div");
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly stageCenter = new THREE.Vector3();
  private readonly approach = new THREE.Vector3();

  private readonly startPosition = new THREE.Vector3();
  private readonly startQuaternion = new THREE.Quaternion();
  private readonly endPosition = new THREE.Vector3();
  private readonly endQuaternion = new THREE.Quaternion();
  private readonly returnPosition = new THREE.Vector3();
  private readonly returnQuaternion = new THREE.Quaternion();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredQuaternion = new THREE.Quaternion();

  private state: Mode = "idle";
  private elapsed = 0;
  private duration = 1;
  private clock = 0;
  private pointerInside = false;
  private pointerX = 0;
  private pointerY = 0;
  private hoveredIndex = -1;
  private selectedIndex = -1;
  private activeGlowIndex = 0;
  private readonly lightCameraPosition = new THREE.Vector3();
  private readonly lightPosition = new THREE.Vector3();
  private previousCursor = "";
  private exitCallback: (() => void) | null = null;
  private cameraDistance = 3.0;
  private readonly sound: WorkshopSound;
  /** Shared 128px radial texture; four sprites, only one GPU texture. */
  private readonly glowTexture = WorkshopExperience.makeGlowTexture();

  private static makeGlowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Workshop aura requires Canvas 2D");

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,0.86)");
    gradient.addColorStop(0.13, "rgba(255,255,255,0.62)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.21)");
    gradient.addColorStop(0.73, "rgba(255,255,255,0.045)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /** An aura, local bounced light, and a quiet rune on the physical pedestal. */
  private makeTreasureGlow(
    index: number,
    anchor: THREE.Group,
    floating: THREE.Group,
  ): Pick<Artifact, "glowHalo" | "glowLight" | "glowRune"> {
    const tint = TREASURE_COLORS[index] ?? TREASURE_COLORS[0];

    const glowHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: tint,
        transparent: true,
        opacity: 0.19,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glowHalo.name = `WORKSHOP_TREASURE_AURA_${index + 1}`;
    glowHalo.position.set(0, 0.02, -0.13);
    glowHalo.scale.set(1.32, 1.32, 1);
    floating.add(glowHalo);

    const glowLight = new THREE.PointLight(tint, 0.28, 1.65, 2);
    glowLight.name = `WORKSHOP_TREASURE_LIGHT_${index + 1}`;
    glowLight.castShadow = false;
    glowLight.visible = performanceOptions.workshopLights === "all" ||
      (performanceOptions.workshopLights === "focused" && index === 0);
    glowLight.position.set(0, 0.04, 0.02);
    if (performanceOptions.decorativeLights) floating.add(glowLight);

    const glowRune = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.335, 40),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glowRune.name = `WORKSHOP_TREASURE_RUNE_${index + 1}`;
    glowRune.rotation.x = -Math.PI / 2;
    glowRune.position.y = 0.135;
    anchor.add(glowRune);

    return { glowHalo, glowLight, glowRune };
  }

  constructor(
    private readonly house: THREE.Object3D,
    stand: THREE.Object3D,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    canPlaySound: () => boolean = () => true,
  ) {
    this.sound = new WorkshopSound(canPlaySound);
    house.updateWorldMatrix(true, true);

    // The older prototype already fits this stand. Use the same reference
    // for the four new objects until the optional Blender markers are added.
    const standBounds = new THREE.Box3().setFromObject(stand, true);
    const standCenter = standBounds.isEmpty()
      ? stand.getWorldPosition(new THREE.Vector3())
      : standBounds.getCenter(new THREE.Vector3());
    const size = standBounds.getSize(new THREE.Vector3());
    const alongX = size.x >= size.z;
    const longSide = Math.max(size.x, size.z, 1);
    const spacing = THREE.MathUtils.clamp(longSide * 0.205, 0.6, 0.9);
    const height = Math.max(0.3, size.y);
    const scale = THREE.MathUtils.clamp(height * 0.15, 0.29, 0.48);
    const top = standBounds.isEmpty()
      ? standCenter.y + 0.55
      : standBounds.max.y + 0.06;

    WORKSHOP_SKILLS.forEach((skill, index) => {
      const world = new THREE.Vector3(
        standCenter.x + (alongX ? (index - 1.5) * spacing : 0),
        top,
        standCenter.z + (alongX ? 0 : (index - 1.5) * spacing),
      );
      const marker = house.getObjectByName(markerName(index));
      if (marker) marker.getWorldPosition(world);

      const anchor = new THREE.Group();
      anchor.name = `WORKSHOP_ARTIFACT_${index + 1}_${skill.id}`;
      anchor.position.copy(house.worldToLocal(world.clone()));
      house.add(anchor);

      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.43, 0.49, 0.12, 10),
        new THREE.MeshStandardMaterial({
          color: COLOR.darkBronze,
          roughness: 0.75,
          metalness: 0.23,
          flatShading: true,
        }),
      );
      pedestal.position.y = 0.04;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      anchor.add(pedestal);

      const inset = new THREE.Mesh(
        new THREE.CylinderGeometry(0.33, 0.33, 0.015, 12),
        new THREE.MeshStandardMaterial({
          color: COLOR.bronze,
          roughness: 0.55,
          metalness: 0.45,
        }),
      );
      inset.position.y = 0.11;
      anchor.add(inset);

      const floating = new THREE.Group();
      floating.name = `WORKSHOP_FLOATING_${skill.id}`;
      floating.position.y = 0.49;
      anchor.add(floating);
      const materials = this.makeArtifact(index, floating);
      const parts = this.animationParts(index, floating);
      const treasure = this.makeTreasureGlow(index, anchor, floating);

      const hitTarget = new THREE.Mesh(
        new THREE.SphereGeometry(0.71, 12, 10),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      );
      hitTarget.name = `WORKSHOP_HIT_${skill.id}`;
      floating.add(hitTarget);

      anchor.scale.setScalar(scale);
      this.artifacts.push({
        skill,
        anchor,
        floating,
        hitTarget,
        materials,
        baseScale: scale,
        floatOffset: index * 1.6,
        hoverLevel: 0,
        pulse: 0,
        glowSelection: 0,
        ...treasure,
        primary: parts[0],
        secondary: parts[1],
      });
      this.stageCenter.add(world);
    });
    this.stageCenter.multiplyScalar(1 / WORKSHOP_SKILLS.length);
    // Raise framing toward the artifacts instead of the rack's base.
    this.stageCenter.y += scale * 0.48;

    this.label.className = "workshop-label";
    this.label.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.label);

    this.panel.className = "workshop-inspector";
    this.panel.setAttribute("aria-label", "Selected workshop skill");
    document.body.appendChild(this.panel);

    this.controls.className = "workshop-controls";
    this.controls.innerHTML = `
      <kbd>←</kbd><kbd>→</kbd> <span>Switch craft</span>
      <span class="workshop-controls_divider"></span>
      <kbd>E</kbd><span>Inspect</span>
      <span class="workshop-controls_divider"></span>
      <kbd>Esc</kbd><span>Return</span>
      <span class="workshop-controls_divider"></span>
      <span class="workshop-controls_step">01 / 04</span>
    `;
    document.body.appendChild(this.controls);

    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  /** Distinct low-poly artifacts. No extra GLBs or expensive particles. */
  private makeArtifact(
    index: number,
    parent: THREE.Group,
  ): THREE.MeshStandardMaterial[] {
    const materials: THREE.MeshStandardMaterial[] = [];
    const material = (color: number, emissive = 0x1d332e, metalness = 0.18) => {
      const m = new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0.2,
        metalness,
        roughness: 0.48,
        flatShading: true,
        side: THREE.DoubleSide,
      });
      materials.push(m);
      return m;
    };
    const brass = material(COLOR.bronze, 0x493220, 0.48);

    const add = (
      geometry: THREE.BufferGeometry,
      mat: THREE.MeshStandardMaterial,
    ) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    if (index === 0) {
      const crystal = add(
        new THREE.IcosahedronGeometry(0.38, 0),
        material(COLOR.teal, 0x21695a, 0.12),
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(crystal.geometry),
        new THREE.LineBasicMaterial({
          color: 0xf0deb4,
          transparent: true,
          opacity: 0.8,
        }),
      );
      edges.scale.setScalar(1.012);
      crystal.name = "WORKSHOP_CRYSTAL";
      crystal.add(edges);
      const ring1 = add(new THREE.TorusGeometry(0.49, 0.019, 5, 40), brass);
      ring1.name = "WORKSHOP_RING_A";
      ring1.rotation.x = 0.6;
      const ring2 = add(new THREE.TorusGeometry(0.46, 0.013, 5, 40), brass);
      ring2.name = "WORKSHOP_RING_B";
      ring2.rotation.set(1.3, 0.5, 0.15);
    } else if (index === 1) {
      // Clockwork gear with actual teeth and a punched-out center.
      const shape = new THREE.Shape();
      const count = 12;
      for (let i = 0; i <= count * 4; i++) {
        const a = (i / (count * 4)) * Math.PI * 2;
        const radius = i % 4 === 1 || i % 4 === 2 ? 0.49 : 0.39;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.15, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const gear = add(
        new THREE.ExtrudeGeometry(shape, {
          depth: 0.12,
          bevelEnabled: true,
          bevelSize: 0.018,
          bevelThickness: 0.015,
          bevelSegments: 1,
        }),
        brass,
      );
      gear.name = "WORKSHOP_GEAR_MAIN";
      gear.rotation.set(0.15, -0.15, 0.08);
      const axle = add(
        new THREE.SphereGeometry(0.13, 10, 8),
        material(COLOR.slate, 0x254b44, 0.35),
      );
      axle.position.z = 0.16;
      const miniGear = add(new THREE.TorusGeometry(0.24, 0.075, 5, 10), brass);
      miniGear.name = "WORKSHOP_GEAR_SECONDARY";
      miniGear.position.set(0.31, -0.34, -0.04);
    } else if (index === 2) {
      const scroll = add(
        new THREE.BoxGeometry(0.72, 0.54, 0.045),
        material(COLOR.paper, 0x3f372b, 0.02),
      );
      scroll.name = "WORKSHOP_BLUEPRINT";
      scroll.rotation.set(0.14, 0.08, -0.1);
      const bar = new THREE.CylinderGeometry(0.07, 0.07, 0.86, 9);
      const top = add(bar, brass);
      top.rotation.z = Math.PI / 2;
      top.position.y = 0.29;
      const bottom = add(bar.clone(), brass);
      bottom.rotation.z = Math.PI / 2;
      bottom.position.y = -0.29;
      const ink = material(COLOR.teal, 0x244c41, 0.04);
      for (let i = 0; i < 3; i++) {
        const line = add(
          new THREE.BoxGeometry(0.47 - i * 0.08, 0.025, 0.005),
          ink,
        );
        line.position.set(-0.06, 0.12 - i * 0.13, 0.034);
      }
      const stamp = add(
        new THREE.IcosahedronGeometry(0.075, 0),
        material(COLOR.clay, 0x50362b, 0.1),
      );
      stamp.name = "WORKSHOP_BLUEPRINT_STAMP";
      stamp.position.set(0.25, -0.16, 0.057);
    } else {
      const caseMaterial = material(COLOR.slate, 0x2f5851, 0.2);
      add(
        new THREE.CylinderGeometry(0.4, 0.4, 0.1, 24),
        caseMaterial,
      ).rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.42, 0.049, 6, 28), brass).position.z = 0.07;
      const pointer = add(
        new THREE.ConeGeometry(0.13, 0.61, 3),
        material(COLOR.clay, 0x6d402e, 0.22),
      );
      pointer.name = "WORKSHOP_COMPASS_NEEDLE";
      pointer.rotation.set(Math.PI / 2, 0, 0.55);
      pointer.position.z = 0.11;
      const pivot = add(new THREE.SphereGeometry(0.1, 8, 6), brass);
      pivot.name = "WORKSHOP_COMPASS_PIVOT";
      pivot.position.z = 0.16;
      for (let i = 0; i < 4; i++) {
        const tick = add(new THREE.BoxGeometry(0.032, 0.1, 0.019), brass);
        tick.position.set(
          Math.sin((i * Math.PI) / 2) * 0.3,
          Math.cos((i * Math.PI) / 2) * 0.3,
          0.09,
        );
        tick.rotation.z = (-i * Math.PI) / 2;
      }
    }
    return materials;
  }

  /** Only specific details move, rather than spinning every artifact identically. */
  private animationParts(
    index: number,
    floating: THREE.Group,
  ): [THREE.Object3D | undefined, THREE.Object3D | undefined] {
    const names = [
      ["WORKSHOP_RING_A", "WORKSHOP_RING_B"],
      ["WORKSHOP_GEAR_MAIN", "WORKSHOP_GEAR_SECONDARY"],
      ["WORKSHOP_BLUEPRINT", "WORKSHOP_BLUEPRINT_STAMP"],
      ["WORKSHOP_COMPASS_NEEDLE", "WORKSHOP_COMPASS_PIVOT"],
    ];
    const [first, second] = names[index];
    return [floating.getObjectByName(first), floating.getObjectByName(second)];
  }

  get mode(): Mode {
    return this.state;
  }
  get isControllingCamera(): boolean {
    return this.state !== "idle";
  }

  enter(): boolean {
    if (this.state !== "idle") return false;
    this.camera.updateWorldMatrix(true, false);
    this.returnPosition.copy(this.camera.position);
    this.returnQuaternion.copy(this.camera.quaternion);

    // Default: approach from the visitor's side to prevent crossing walls.
    this.approach.copy(this.returnPosition).sub(this.stageCenter);
    this.approach.y = 0;
    if (this.approach.lengthSq() < 0.001) this.approach.set(0, 0, 1);
    this.approach.normalize();

    let span = 0;
    for (const a of this.artifacts) {
      const p = a.anchor.getWorldPosition(new THREE.Vector3());
      span = Math.max(span, p.distanceTo(this.stageCenter));
    }
    this.cameraDistance = THREE.MathUtils.clamp(
      Math.max(2.5, span * 2.3),
      2.5,
      4.2,
    );

    // A positioned Blender CAMERA_WORKSHOP marker takes priority, if present.
    const cameraMarker = this.house.getObjectByName("CAMERA_WORKSHOP");
    if (cameraMarker) {
      const markerWorld = cameraMarker.getWorldPosition(new THREE.Vector3());
      const markerApproach = markerWorld.clone().sub(this.stageCenter);
      markerApproach.y = 0;
      // Keep the established safe approach if the marker points behind the
      // stand from the visitor's side (avoids flying through the wall).
      if (
        markerApproach.lengthSq() > 0.01 &&
        markerApproach.normalize().dot(this.approach) > 0.1
      ) {
        this.approach.copy(markerApproach);
        this.cameraDistance = THREE.MathUtils.clamp(
          markerWorld.distanceTo(this.stageCenter),
          2.2,
          4.8,
        );
      }
    }

    this.selectedIndex = -1;
    this.hoveredIndex = -1;
    this.panel.classList.remove("is-visible");
    this.controls.classList.add("is-visible");
    this.updateControlHint();
    this.updateDesiredCamera();
    this.beginTransition(this.desiredPosition, this.desiredQuaternion, 0.95);
    this.state = "entering";
    this.updateTreasureLights();
    this.sound.play("enter");
    return true;
  }

  leave(onComplete: () => void): void {
    if (this.state === "idle" || this.state === "leaving") return;
    this.state = "leaving";
    this.updateTreasureLights();
    this.selectedIndex = -1;
    this.hoveredIndex = -1;
    this.setCursor(false);
    this.panel.classList.remove("is-visible");
    this.label.classList.remove("is-visible");
    this.controls.classList.remove("is-visible");
    this.exitCallback = onComplete;
    this.beginTransition(this.returnPosition, this.returnQuaternion, 0.72);
    this.sound.play("exit");
  }

  clickAt(clientX: number, clientY: number): boolean {
    if (this.state !== "active") return false;
    const index = this.hitTest(clientX, clientY);
    if (index < 0) return false;
    this.select(index);
    return true;
  }

  /** Existing Game.ts invokes this for E or Enter. */
  toggleSelection(): void {
    if (this.state !== "active") return;
    if (
      this.selectedIndex >= 0 &&
      (this.hoveredIndex < 0 || this.hoveredIndex === this.selectedIndex)
    ) {
      const previous = this.selectedIndex;
      this.selectedIndex = -1;
      this.updateTreasureLights();
      this.panel.classList.remove("is-visible");
      this.sound.play("close", previous);
      this.updateControlHint();
      return;
    }
    this.select(this.hoveredIndex >= 0 ? this.hoveredIndex : 0);
  }

  /** Add to Game.ts ArrowLeft/ArrowRight while workshop is active. */
  selectRelative(direction: -1 | 1): void {
    if (this.state !== "active") return;
    const index =
      this.selectedIndex < 0
        ? direction === 1
          ? 0
          : this.artifacts.length - 1
        : (this.selectedIndex + direction + this.artifacts.length) %
          this.artifacts.length;
    this.select(index);
  }

  private select(index: number): void {
    if (index < 0 || index >= this.artifacts.length) return;
    if (this.selectedIndex === index) {
      this.selectedIndex = -1;
      this.panel.classList.remove("is-visible");
      this.sound.play("close", index);
    } else {
      this.selectedIndex = index;
      this.artifacts[index].pulse = 1;
      this.sound.play("select", index);
      this.renderPanel(this.artifacts[index].skill, index);
      this.panel.classList.add("is-visible");
      this.panel.animate(
        [
          { opacity: 0.7, transform: "translateY(7px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
    this.updateTreasureLights();
    this.updateControlHint();
  }

  private renderPanel(skill: WorkshopSkill, index: number): void {
    // Data is text-only; never insert project data into innerHTML.
    this.panel.replaceChildren();
    this.panel.dataset.craft = skill.id;
    const top = document.createElement("div");
    top.className = "workshop-inspector_topline";
    const eyebrow = document.createElement("span");
    eyebrow.textContent = skill.eyebrow;
    const count = document.createElement("span");
    count.className = "workshop-inspector_count";
    count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(this.artifacts.length).padStart(2, "0")}`;
    top.append(eyebrow, count);

    const artifactName = document.createElement("p");
    artifactName.className = "workshop-inspector_artifact";
    artifactName.textContent = skill.artifact;
    const name = document.createElement("h2");
    name.textContent = skill.name;
    const desc = document.createElement("p");
    desc.className = "workshop-inspector_description";
    desc.textContent = skill.description;
    const stack = document.createElement("div");
    stack.className = "workshop-inspector_tools";
    for (const tech of skill.technologies) {
      const chip = document.createElement("span");
      chip.textContent = tech;
      stack.appendChild(chip);
    }
    const note = document.createElement("p");
    note.className = "workshop-inspector_note";
    note.textContent = skill.note;
    this.panel.append(top, artifactName, name, desc, stack, note);
  }

  private updateControlHint(): void {
    const step = this.controls.querySelector<HTMLElement>(
      ".workshop-controls_step",
    );
    if (step) {
      step.textContent =
        this.selectedIndex >= 0
          ? `${String(this.selectedIndex + 1).padStart(2, "0")} / ${String(this.artifacts.length).padStart(2, "0")}`
          : "CHOOSE A CRAFT";
    }
  }

  update(delta: number): void {
    if (!this.house.visible) return;
    const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
    this.clock += dt;

    // Subtle shared hover and selection feedback, with a distinct mechanism
    // for each object. All blending is frame-rate independent.
    this.artifacts.forEach((a, index) => {
      const hovered = this.state === "active" && this.hoveredIndex === index;
      const selected = this.state === "active" && this.selectedIndex === index;
      const targetLevel = hovered ? 1 : selected ? 0.65 : 0;
      a.hoverLevel = THREE.MathUtils.damp(a.hoverLevel, targetLevel, 9, dt);
      a.pulse *= Math.exp(-7.5 * dt);
      const rise = selected ? 0.18 : hovered ? 0.12 : 0;
      const oneShot = Math.sin((1 - a.pulse) * Math.PI) * a.pulse * 0.15;
      a.floating.position.y = THREE.MathUtils.damp(
        a.floating.position.y,
        0.49 +
          Math.sin(this.clock * 1.25 + a.floatOffset) * 0.025 +
          rise +
          oneShot,
        8,
        dt,
      );
      const size = 1 + a.hoverLevel * 0.06 + a.pulse * 0.12;
      a.floating.scale.setScalar(
        THREE.MathUtils.damp(a.floating.scale.x, size, 10, dt),
      );

      switch (index) {
        case 0: // Crystal: independent orbiting rings and calm continuous spin.
          a.floating.rotation.y += dt * (selected ? 0.29 : 0.13);
          if (a.primary) a.primary.rotation.z += dt * (selected ? 0.7 : 0.36);
          if (a.secondary)
            a.secondary.rotation.y -= dt * (selected ? 0.61 : 0.27);
          a.floating.rotation.z = THREE.MathUtils.damp(
            a.floating.rotation.z,
            hovered ? -0.075 : 0,
            5,
            dt,
          );
          break;
        case 1: // Clockwork: meshing gears turning in opposite directions.
          if (a.primary) a.primary.rotation.z += dt * (selected ? 0.7 : 0.19);
          if (a.secondary)
            a.secondary.rotation.z -= dt * (selected ? 1.1 : 0.3);
          a.floating.rotation.y = THREE.MathUtils.damp(
            a.floating.rotation.y,
            hovered ? -0.13 : 0,
            4,
            dt,
          );
          a.floating.rotation.z = THREE.MathUtils.damp(
            a.floating.rotation.z,
            selected ? 0.035 : 0,
            4,
            dt,
          );
          break;
        case 2: // Blueprint: page-like rocking instead of continuous spinning.
          a.floating.rotation.z = THREE.MathUtils.damp(
            a.floating.rotation.z,
            Math.sin(this.clock * 0.85) * 0.028 + (hovered ? -0.055 : 0),
            4,
            dt,
          );
          a.floating.rotation.y = THREE.MathUtils.damp(
            a.floating.rotation.y,
            selected ? 0.1 : 0,
            3,
            dt,
          );
          if (a.secondary)
            a.secondary.rotation.z += dt * (selected ? 0.6 : 0.15);
          break;
        case 3: // Compass: the needle searches, then settles on selection.
          if (a.primary) {
            a.primary.rotation.z = THREE.MathUtils.damp(
              a.primary.rotation.z,
              selected ? 0.0 : 0.55 + Math.sin(this.clock * 1.0) * 0.23,
              selected ? 4.0 : 2.5,
              dt,
            );
          }
          a.floating.rotation.y = THREE.MathUtils.damp(
            a.floating.rotation.y,
            hovered ? 0.12 : 0,
            4,
            dt,
          );
          a.floating.rotation.z = THREE.MathUtils.damp(
            a.floating.rotation.z,
            0,
            5,
            dt,
          );
          break;
      }

      // Treasure light complements existing materials, without recoloring
      // bronze or flattening the different handcrafted artifact finishes.
      a.glowSelection = THREE.MathUtils.damp(
        a.glowSelection,
        selected ? 1 : 0,
        7,
        dt,
      );
      const breath = 0.5 + 0.5 * Math.sin(this.clock * 1.55 + a.floatOffset);
      const emissive =
        0.18 +
        a.hoverLevel * 0.18 +
        a.glowSelection * 0.25 +
        breath * 0.055 +
        a.pulse * 0.22;
      a.materials.forEach((mat) => {
        mat.emissiveIntensity = THREE.MathUtils.damp(
          mat.emissiveIntensity,
          emissive,
          8,
          dt,
        );
      });

      const haloMaterial = a.glowHalo.material;
      haloMaterial.opacity = THREE.MathUtils.damp(
        haloMaterial.opacity,
        0.17 + a.hoverLevel * 0.13 + a.glowSelection * 0.21 + breath * 0.045,
        7,
        dt,
      );
      const haloSize =
        1.28 + a.hoverLevel * 0.1 + a.glowSelection * 0.21 + breath * 0.045;
      a.glowHalo.scale.set(haloSize, haloSize, 1);

      a.glowLight.intensity = THREE.MathUtils.damp(
        a.glowLight.intensity,
        0.25 + a.hoverLevel * 0.21 + a.glowSelection * 0.44 + breath * 0.09,
        7,
        dt,
      );
      a.glowRune.material.opacity = THREE.MathUtils.damp(
        a.glowRune.material.opacity,
        0.045 + a.hoverLevel * 0.11 + a.glowSelection * 0.23 + breath * 0.028,
        7,
        dt,
      );
    });

    this.updateTreasureLights();

    if (this.state === "idle") return;
    if (this.state === "entering" || this.state === "leaving") {
      this.elapsed = Math.min(this.duration, this.elapsed + dt);
      const t = this.elapsed / this.duration;
      const smooth = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(
        this.startPosition,
        this.endPosition,
        smooth,
      );
      this.camera.quaternion.slerpQuaternions(
        this.startQuaternion,
        this.endQuaternion,
        smooth,
      );
      if (t >= 1) {
        if (this.state === "entering") {
          this.state = "active";
        } else {
          this.state = "idle";
          const done = this.exitCallback;
          this.exitCallback = null;
          done?.();
        }
      }
    }

    if (this.state !== "active") {
      this.hoveredIndex = -1;
      this.label.classList.remove("is-visible");
      return;
    }

    const hovered = this.pointerInside
      ? this.hitTest(this.pointerX, this.pointerY)
      : -1;
    this.hoveredIndex = hovered;
    this.setCursor(hovered >= 0);
    const showLabel = hovered >= 0 && hovered !== this.selectedIndex;
    this.label.classList.toggle("is-visible", showLabel);
    if (showLabel) {
      this.label.textContent =
        this.artifacts[hovered].skill.artifact + "  ·  Click to inspect";
      const world = this.artifacts[hovered].floating.getWorldPosition(
        new THREE.Vector3(),
      );
      world.y += 0.22;
      const ndc = world.project(this.camera);
      const rect = this.canvas.getBoundingClientRect();
      this.label.style.left = `${THREE.MathUtils.clamp(rect.left + (ndc.x + 1) * rect.width * 0.5, 90, innerWidth - 90)}px`;
      this.label.style.top = `${THREE.MathUtils.clamp(rect.top + (1 - ndc.y) * rect.height * 0.5 - 35, 45, innerHeight - 65)}px`;
    }

    // Track the selected item a little without losing the whole collection.
    this.updateDesiredCamera();
    const alpha = 1 - Math.exp(-2.7 * dt);
    this.camera.position.lerp(this.desiredPosition, alpha);
    this.camera.quaternion.slerp(this.desiredQuaternion, alpha);
  }

  /** Warm the zero/one-workshop-light variants under the house-entry cover. */
  async prepareLightingVariants(compile: () => Promise<unknown>): Promise<void> {
    if (!performanceOptions.decorativeLights || performanceOptions.workshopLights !== "inspect" ||
        !this.artifacts.length) return;
    const light = this.artifacts[0].glowLight;
    const visible = light.visible;
    try {
      light.visible = true;
      await compile();
    } finally {
      light.visible = visible;
    }
  }

  /** Walking/overview has no workshop light; inspection lights only that craft. */
  private updateTreasureLights(): void {
    if (!performanceOptions.decorativeLights) return;
    if (performanceOptions.workshopLights === "inspect") {
      const inspected = this.state === "active" ? this.selectedIndex : -1;
      this.artifacts.forEach((artifact, index) => {
        artifact.glowLight.visible = index === inspected;
      });
      return;
    }
    if (performanceOptions.workshopLights === "all") {
      for (const artifact of this.artifacts) artifact.glowLight.visible = true;
      return;
    }
    const focused = this.state === "active"
      ? this.selectedIndex >= 0 ? this.selectedIndex : this.hoveredIndex
      : -1;
    if (focused >= 0 && focused < this.artifacts.length) {
      this.activeGlowIndex = focused;
    } else if (this.artifacts.length) {
      this.camera.getWorldPosition(this.lightCameraPosition);
      this.activeGlowIndex = Math.min(this.activeGlowIndex, this.artifacts.length - 1);
      let distance = this.artifacts[this.activeGlowIndex].glowLight
        .getWorldPosition(this.lightPosition).distanceToSquared(this.lightCameraPosition);
      for (let index = 0; index < this.artifacts.length; index++) {
        const candidate = this.artifacts[index].glowLight
          .getWorldPosition(this.lightPosition).distanceToSquared(this.lightCameraPosition);
        // Hysteresis prevents spill flicker near the midpoint of two artifacts.
        if (candidate < distance * 0.8) {
          this.activeGlowIndex = index;
          distance = candidate;
        }
      }
    }
    this.artifacts.forEach((artifact, index) => {
      artifact.glowLight.visible = index === this.activeGlowIndex;
    });
  }

  private updateDesiredCamera(): void {
    const focus = this.stageCenter.clone();
    if (this.selectedIndex >= 0) {
      const selectedPosition = this.artifacts[
        this.selectedIndex
      ].floating.getWorldPosition(new THREE.Vector3());
      focus.lerp(selectedPosition, 0.18);
    }
    this.desiredPosition
      .copy(focus)
      .addScaledVector(this.approach, this.cameraDistance);
    this.desiredPosition.y += 0.8;
    this.desiredQuaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        this.desiredPosition,
        focus,
        new THREE.Vector3(0, 1, 0),
      ),
    );
  }

  private beginTransition(
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    duration: number,
  ): void {
    this.startPosition.copy(this.camera.position);
    this.startQuaternion.copy(this.camera.quaternion);
    this.endPosition.copy(pos);
    this.endQuaternion.copy(quat);
    this.duration = duration;
    this.elapsed = 0;
  }

  private hitTest(x: number, y: number): number {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return -1;
    this.pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(
      this.artifacts.map((a) => a.hitTarget),
      false,
    );
    if (intersections.length === 0) return -1;
    return this.artifacts.findIndex(
      (a) => a.hitTarget === intersections[0].object,
    );
  }

  private setCursor(active: boolean): void {
    if (active) {
      if (this.canvas.style.cursor !== "pointer")
        this.previousCursor = this.canvas.style.cursor;
      this.canvas.style.cursor = "pointer";
    } else {
      this.canvas.style.cursor = this.previousCursor;
    }
  }

  private onPointerMove = (event: PointerEvent): void => {
    this.pointerInside = true;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
  };
  private onPointerLeave = (): void => {
    this.pointerInside = false;
    this.hoveredIndex = -1;
    this.setCursor(false);
    this.label.classList.remove("is-visible");
  };

  destroy(): void {
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.setCursor(false);
    this.label.remove();
    this.panel.remove();
    this.controls.remove();
    this.sound.destroy();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const artifact of this.artifacts) {
      artifact.anchor.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          geometries.add(obj.geometry);
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => materials.add(m));
        }
        if (obj instanceof THREE.LineSegments) {
          geometries.add(obj.geometry);
          const lineMats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          lineMats.forEach((m) => materials.add(m));
        }
        if (obj instanceof THREE.Sprite) {
          materials.add(obj.material);
        }
      });
      artifact.anchor.removeFromParent();
    }
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.glowTexture.dispose();
  }
}
