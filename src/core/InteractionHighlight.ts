import * as THREE from "three";

type TintedMaterial = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
};
type Replacement = {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  highlighted: THREE.Material | THREE.Material[];
};

/** Highlight only the target's materials, using its existing scene draw. */
export class InteractionHighlight {
  private target: THREE.Object3D | null = null;
  private readonly replacements: Replacement[] = [];
  private readonly materials = new Map<TintedMaterial, TintedMaterial>();
  private readonly color = new THREE.Color(0xf3e7c2);

  get active(): boolean {
    return this.replacements.length > 0;
  }

  setTarget(target: THREE.Object3D | null): void {
    if (target === this.target) return;
    this.clear();
    this.target = target;
    target?.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material;
      const source = Array.isArray(original) ? original : [original];
      const highlighted = source.map(material => this.highlightMaterial(material));
      if (highlighted.every((material, index) => material === source[index])) return;
      const replacement = Array.isArray(original) ? highlighted : highlighted[0];
      this.replacements.push({ mesh: object, original, highlighted: replacement });
      object.material = replacement;
    });
    this.update();
  }

  private highlightMaterial(source: TintedMaterial): THREE.Material {
    // Leave invisible hit targets and custom shaders alone.
    if (!source.visible || !source.colorWrite ||
        (!(source.color instanceof THREE.Color) && !(source.emissive instanceof THREE.Color))) return source;
    let clone = this.materials.get(source);
    if (!clone) {
      clone = source.clone() as TintedMaterial;
      // Material.clone does not copy these shader hooks.
      clone.onBeforeCompile = source.onBeforeCompile;
      clone.customProgramCacheKey = source.customProgramCacheKey;
      this.materials.set(source, clone);
    }
    return clone;
  }

  update(): void {
    for (const [source, clone] of this.materials) {
      const emissive = source.emissive instanceof THREE.Color && clone.emissive instanceof THREE.Color;
      if (source.color && clone.color) {
        clone.color.copy(source.color).lerp(this.color, emissive ? 0.18 : 0.4);
      }
      if (emissive) {
        clone.emissive!.copy(this.color).multiplyScalar(0.35).add(source.emissive!);
        clone.emissiveIntensity = Math.max(source.emissiveIntensity ?? 1, 0.8);
      }
      // Keep authored color/opacity animation while the target is highlighted.
      clone.opacity = source.opacity;
      clone.visible = source.visible;
    }
  }

  clear(): void {
    for (const { mesh, original, highlighted } of this.replacements) {
      // A subsystem may replace a material while this target is active.
      if (mesh.material === highlighted) mesh.material = original;
    }
    for (const clone of this.materials.values()) clone.dispose();
    this.replacements.length = 0;
    this.materials.clear();
    this.target = null;
  }
}
