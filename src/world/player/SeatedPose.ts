import * as THREE from "three";
import { fitCouchSeat } from "./CouchSeat";

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
    quaternion: THREE.Quaternion;
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
      quaternion: this.model.quaternion.clone(),
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
    this.model.quaternion.copy(saved.quaternion);
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
