import * as THREE from "three";

export class Ground {
  mesh: THREE.Mesh;
  private grid: THREE.GridHelper;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshStandardMaterial({
      color: 0x6f9f4f,
    });
    this.mesh = new THREE.Mesh(geometry, material);

    this.mesh.rotation.x = -Math.PI / 2;

    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    this.grid = new THREE.GridHelper(100, 20, 0x2f4f2f, 0x567d46);
    scene.add(this.grid);
  }
}
