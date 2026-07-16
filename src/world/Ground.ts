import * as THREE from "three";

export class Ground {
  mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshStandardMaterial({
      color: 0x6f9f4f,
    });
    this.mesh = new THREE.Mesh(geometry, material);

    this.mesh.rotation.x = -Math.PI / 2;

    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }
}
