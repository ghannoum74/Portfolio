import * as THREE from "three";

type SavedBone = {
  bone: THREE.Bone;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

/** A reversible seated pose for the shipped Mixamo avatar; no animation download. */
export class SeatedPose {
  private saved?: {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    bones: SavedBone[];
    skins: { mesh: THREE.SkinnedMesh; box: THREE.Box3 | null; sphere: THREE.Sphere | null }[];
  };

  constructor(private readonly model: THREE.Group) {}

  get isActive(): boolean { return this.saved !== undefined; }

  begin(seat: THREE.Vector3, look: THREE.Vector3): boolean {
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
      // Pose from the current animation. Skeleton.pose() assumes a bone-root
      // hierarchy and can double-apply the exported avatar's Armature scale.
      this.model.rotation.y = Math.atan2(forward.x, forward.z);
      this.model.parent?.updateWorldMatrix(true, false);
      this.model.updateMatrixWorld(true);
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const down = new THREE.Vector3(0, -1, 0);
      for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
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
      const hips = bones.get("hips")!.getWorldPosition(new THREE.Vector3());
      const desired = seat.clone().add(new THREE.Vector3(0, 0.1, 0));
      const root = this.model.getWorldPosition(new THREE.Vector3()).add(desired.sub(hips));
      this.model.position.copy(this.model.parent ? this.model.parent.worldToLocal(root) : root);
      this.model.updateMatrixWorld(true);
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
