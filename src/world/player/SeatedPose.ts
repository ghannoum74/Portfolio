import * as THREE from "three";
import { fitCouchSeat } from "./CouchSeat";
import { bedHead, inspectBed } from "./BedGeometry";

type SavedBone = {
  bone: THREE.Bone;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

/** A reversible seated pose for the shipped Mixamo avatar; no animation download. */
export class SeatedPose {
  private readonly neutral: SavedBone[] = [];
  private readonly focus = new THREE.Vector3();
  private saved?: {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    bones: SavedBone[];
    skins: { mesh: THREE.SkinnedMesh; box: THREE.Box3 | null; sphere: THREE.Sphere | null }[];
  };

  constructor(private readonly model: THREE.Group) {
    // Capture the loaded avatar before its mixer starts. Animation files can
    // contain a different rig's bone translations as well as running/idle lean.
    model.traverse(object => {
      if (object instanceof THREE.Bone) this.neutral.push({
        bone: object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
      });
    });
  }

  get isActive(): boolean { return this.saved !== undefined; }

  getCameraTarget(target: THREE.Vector3): THREE.Vector3 { return target.copy(this.focus); }

  begin(seat: THREE.Vector3, look: THREE.Vector3, couch?: THREE.Object3D): boolean {
    if (this.saved || ![...seat.toArray(), ...look.toArray()].every(Number.isFinite)) return false;
    const forward = look.clone().sub(seat).setY(0);
    if (forward.lengthSq() < 0.0001) return false;
    forward.normalize();
    const bones = new Map<string, THREE.Bone>();
    const skeletons = new Set<THREE.Skeleton>();
    const skins: THREE.SkinnedMesh[] = [];
    this.model.traverse(object => {
      if (object instanceof THREE.Bone) {
        bones.set(object.name.replace(/^mixamorig[:_]?/i, "").toLowerCase(), object);
      }
      if (object instanceof THREE.SkinnedMesh) {
        skeletons.add(object.skeleton);
        skins.push(object);
      }
    });
    const names = ["hips", "leftupleg", "leftleg", "leftfoot", "rightupleg", "rightleg", "rightfoot"];
    if (names.some(name => !bones.has(name)) || skeletons.size === 0) return false;
    this.saved = {
      position: this.model.position.clone(),
      rotation: this.model.rotation.clone(),
      bones: [...bones.values()].map(bone => ({
        bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone(),
      })),
      skins: skins.map(mesh => ({ mesh, box: mesh.boundingBox?.clone() ?? null, sphere: mesh.boundingSphere?.clone() ?? null })),
    };
    try {
      // Restore local bind transforms, retaining the non-bone Armature scale.
      // Skeleton.pose() would double-apply that scale on this exported avatar.
      for (const entry of this.neutral) {
        entry.bone.position.copy(entry.position);
        entry.bone.quaternion.copy(entry.quaternion);
        entry.bone.scale.copy(entry.scale);
      }
      this.model.parent?.updateWorldMatrix(true, false);
      this.model.updateMatrixWorld(true);
      const thighLength = Math.min(...["left", "right"].map(side =>
        bones.get(side + "upleg")!.getWorldPosition(new THREE.Vector3())
          .distanceTo(bones.get(side + "leg")!.getWorldPosition(new THREE.Vector3()))));
      const placement = couch ? fitCouchSeat(couch, seat, forward, thighLength) : { seat: seat.clone(), forward };
      if (!placement) throw new Error("No supported seat with clear calves");
      forward.copy(placement.forward);
      const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(forward.x, forward.z));
      const parent = this.model.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
      this.model.quaternion.copy(parent.invert().multiply(facing));
      this.model.updateMatrixWorld(true);
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const down = new THREE.Vector3(0, -1, 0);
      for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
        this.aim(bones.get(side + "upleg")!, bones.get(side + "leg")!,
          forward.clone().addScaledVector(right, sign * 0.09).normalize());
        this.aim(bones.get(side + "leg")!, bones.get(side + "foot")!, down);
        const toe = bones.get(side + "toebase");
        if (toe) this.aim(bones.get(side + "foot")!, toe, forward);
        const arm = bones.get(side + "arm"), forearm = bones.get(side + "forearm"), hand = bones.get(side + "hand");
        if (arm && forearm) this.aim(arm, forearm,
          down.clone().addScaledVector(forward, 0.2).addScaledVector(right, sign * 0.08).normalize());
        if (forearm && hand) this.aim(forearm, hand, forward.clone().addScaledVector(down, 0.3).normalize());
      }
      this.model.updateMatrixWorld(true);
      const hips = bones.get("hips")!.getWorldPosition(new THREE.Vector3());
      const gap = this.cushionGap(skins, hips, forward, thighLength);
      const desired = placement.seat.clone().add(new THREE.Vector3(0, gap, 0));
      const root = this.model.getWorldPosition(new THREE.Vector3()).add(desired.sub(hips));
      this.model.position.copy(this.model.parent ? this.model.parent.worldToLocal(root) : root);
      this.model.updateMatrixWorld(true);
      this.focus.copy(placement.seat).y += 0.55;
      for (const mesh of skins) {
        mesh.skeleton.update();
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
      }
      return true;
    } catch {
      this.end();
      return false;
    }
  }

  /** Lie face-up along the bed, with the head near a pillow and arms by the body. */
  beginLying(bed: THREE.Object3D, approach: THREE.Vector3): { target: THREE.Vector3; headDirection: THREE.Vector3 } | false {
    if (this.saved || !approach.toArray().every(Number.isFinite)) return false;
    const frame = inspectBed(bed), layout = frame && bedHead(frame, approach);
    if (!layout) return false;
    const bones = new Map<string, THREE.Bone>(), skins: THREE.SkinnedMesh[] = [];
    this.model.traverse(object => {
      if (object instanceof THREE.Bone) bones.set(object.name.replace(/^mixamorig[:_]?/i, "").toLowerCase(), object);
      if (object instanceof THREE.SkinnedMesh) skins.push(object);
    });
    if (!skins.length || !bones.has("hips") || !bones.has("head") ||
        !["leftarm", "leftforearm", "lefthand", "rightarm", "rightforearm", "righthand"].every(name => bones.has(name))) return false;
    this.saved = {
      position: this.model.position.clone(), rotation: this.model.rotation.clone(),
      bones: [...bones.values()].map(bone => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() })),
      skins: skins.map(mesh => ({ mesh, box: mesh.boundingBox?.clone() ?? null, sphere: mesh.boundingSphere?.clone() ?? null })),
    };
    try {
      for (const entry of this.neutral) {
        entry.bone.position.copy(entry.position); entry.bone.quaternion.copy(entry.quaternion); entry.bone.scale.copy(entry.scale);
      }
      this.model.parent?.updateWorldMatrix(true, false);
      const up = new THREE.Vector3(0, 1, 0), head = layout.direction;
      const right = head.clone().cross(up).normalize();
      const facing = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, head, up));
      const parent = this.model.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
      this.model.quaternion.copy(parent.invert().multiply(facing));
      this.model.updateMatrixWorld(true);
      for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
        this.aim(bones.get(side + "arm")!, bones.get(side + "forearm")!,
          head.clone().negate().addScaledVector(right, sign * 0.32).addScaledVector(up, 0.08).normalize());
        this.aim(bones.get(side + "forearm")!, bones.get(side + "hand")!,
          head.clone().negate().addScaledVector(right, sign * 0.12).addScaledVector(up, 0.06).normalize());
      }
      this.model.updateMatrixWorld(true);
      let hips = bones.get("hips")!.getWorldPosition(new THREE.Vector3());
      const top = (bones.get("headtop_end") ?? bones.get("head")!).getWorldPosition(new THREE.Vector3());
      const headDistance = top.sub(hips).dot(head);
      if (headDistance < 0.15) throw new Error("Unsupported bed pose");
      const desired = layout.head.clone().addScaledVector(head, -headDistance);
      const bedBox = new THREE.Box3().setFromObject(bed, true);
      const ray = new THREE.Raycaster(new THREE.Vector3(desired.x, bedBox.max.y + 1, desired.z),
        new THREE.Vector3(0, -1, 0), 0, bedBox.max.y - bedBox.min.y + 2);
      const hit = ray.intersectObject(bed, true).find(value => !/^(COL_|INTERACT_|ANCHOR_)/.test(value.object.name));
      if (!hit) throw new Error("No mattress under the avatar");
      desired.y = hit.point.y + 0.2;
      const root = this.model.getWorldPosition(new THREE.Vector3()).add(desired.sub(hips));
      this.model.position.copy(this.model.parent ? this.model.parent.worldToLocal(root) : root);
      this.model.updateMatrixWorld(true);
      hips = bones.get("hips")!.getWorldPosition(new THREE.Vector3());
      let bottom = Infinity;
      const vertex = new THREE.Vector3();
      for (const mesh of skins) {
        const joints = new Set(mesh.skeleton.bones.flatMap((bone, index) =>
          /^(hips|spine|spine1|spine2|leftupleg|rightupleg)$/.test(bone.name.replace(/^mixamorig[:_]?/i, "").toLowerCase()) ? [index] : []));
        const indices = mesh.geometry.getAttribute("skinIndex"), weights = mesh.geometry.getAttribute("skinWeight");
        if (!indices || !weights) continue;
        mesh.skeleton.update();
        for (let i = 0; i < weights.count; i++) {
          let influence = 0;
          for (let component = 0; component < 4; component++) {
            if (joints.has(indices.getComponent(i, component))) influence += weights.getComponent(i, component);
          }
          if (influence < 0.55) continue;
          mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
          const along = vertex.clone().sub(hips).dot(head);
          if (along > -0.35 && along < 0.65) bottom = Math.min(bottom, vertex.y);
        }
      }
      if (!Number.isFinite(bottom)) throw new Error("No supported avatar surface");
      const offset = hit.point.y + 0.008 - bottom;
      if (Math.abs(offset) > 0.6) throw new Error("Avatar cannot fit on the mattress");
      const lifted = this.model.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, offset, 0));
      this.model.position.copy(this.model.parent ? this.model.parent.worldToLocal(lifted) : lifted);
      this.model.updateMatrixWorld(true);
      hips = bones.get("hips")!.getWorldPosition(new THREE.Vector3());
      this.focus.copy(hips).addScaledVector(head, 0.22).addScaledVector(up, 0.05);
      for (const mesh of skins) { mesh.skeleton.update(); mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
      return { target: this.focus.clone(), headDirection: head.clone() };
    } catch {
      this.end();
      return false;
    }
  }

  private cushionGap(skins: THREE.SkinnedMesh[], hips: THREE.Vector3, forward: THREE.Vector3, thighLength: number): number {
    let bottom = Infinity;
    const vertex = new THREE.Vector3();
    for (const mesh of skins) {
      const joints = new Set(mesh.skeleton.bones.flatMap((bone, index) =>
        /^(hips|leftupleg|rightupleg)$/.test(bone.name.replace(/^mixamorig[:_]?/i, "").toLowerCase()) ? [index] : []));
      const indices = mesh.geometry.getAttribute("skinIndex"), weights = mesh.geometry.getAttribute("skinWeight");
      if (!indices || !weights) continue;
      mesh.skeleton.update();
      for (let i = 0; i < weights.count; i++) {
        let influence = 0;
        for (let component = 0; component < 4; component++) {
          if (joints.has(indices.getComponent(i, component))) influence += weights.getComponent(i, component);
        }
        if (influence < 0.55) continue;
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
        const front = vertex.clone().sub(hips).dot(forward);
        if (front > -thighLength * 0.6 && front < thighLength * 0.55) bottom = Math.min(bottom, vertex.y);
      }
    }
    return Number.isFinite(bottom) ? THREE.MathUtils.clamp(hips.y - bottom + 0.008, thighLength * 0.2, thighLength * 0.7) : 0.1;
  }

  private aim(bone: THREE.Bone, child: THREE.Bone, direction: THREE.Vector3): void {
    this.model.updateMatrixWorld(true);
    const from = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3()));
    if (from.lengthSq() < 1e-10) throw new Error("Degenerate seated-pose bone");
    const delta = new THREE.Quaternion().setFromUnitVectors(from.normalize(), direction);
    const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
    const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    bone.quaternion.copy(parent.invert().multiply(world));
  }

  end(): void {
    const saved = this.saved;
    if (!saved) return;
    for (const entry of saved.bones) {
      entry.bone.position.copy(entry.position);
      entry.bone.quaternion.copy(entry.quaternion);
      entry.bone.scale.copy(entry.scale);
    }
    this.model.position.copy(saved.position);
    // PlayerController reads rotation.y as an unwrapped yaw. Restoring only the
    // quaternion can turn a 180-degree yaw into X/Z half-turns with Y near zero,
    // preserving the visible orientation while reversing W/S and A/D behavior.
    this.model.rotation.copy(saved.rotation);
    this.model.updateMatrixWorld(true);
    for (const entry of saved.skins) {
      if (entry.box) (entry.mesh.boundingBox ??= new THREE.Box3()).copy(entry.box);
      else entry.mesh.computeBoundingBox();
      if (entry.sphere) (entry.mesh.boundingSphere ??= new THREE.Sphere()).copy(entry.sphere);
      else entry.mesh.computeBoundingSphere();
      entry.mesh.skeleton.update();
    }
    this.saved = undefined;
  }
}
