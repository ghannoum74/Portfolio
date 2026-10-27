import * as THREE from "three";

const flameVertex = /* glsl */`
  uniform float uTime;
  attribute vec3 flameData;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vFlame;
  void main() {
    vUv = uv; vFlame = flameData;
    float h = clamp(position.y, 0.0, 1.0);
    float t = uTime * flameData.y + flameData.x;
    vec3 transformed = position;
    transformed.y *= 0.92 + 0.08 * sin(t * 4.1) + 0.06 * sin(t * 7.3 + h * 5.0);
    vec3 objectNormal = normal;
    #include <defaultnormal_vertex>
    vNormal = normalize(transformedNormal);
    vec4 flamePosition = instanceMatrix * vec4(transformed, 1.0);
    // Apply curls after the narrow instance radius, so tips can shed sideways
    // while the fuel contact stays fixed at h=0.
    flamePosition.x += (sin(h * 8.0 - t * 4.6) * 0.25 + sin(h * 15.0 - t * 7.1) * 0.10) * h * h;
    flamePosition.z += (cos(h * 9.0 - t * 3.9) * 0.22 + sin(h * 17.0 - t * 6.3) * 0.08) * h * h;
    vec4 mvPosition = modelViewMatrix * flamePosition;
    vView = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const flameFragment = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vFlame;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
  }
  void main() {
    float h = vUv.y;
    vec2 flow = vec2(vUv.x * 5.0 + vFlame.x, h * 4.5 - uTime * vFlame.y * 1.8);
    float turbulence = noise(flow) * 0.55 + noise(flow * 2.1 + 3.7) * 0.30 + noise(flow * 4.2 - 1.5) * 0.15;
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float heat = clamp(1.02 - h * 0.65 + vFlame.z * 0.18 - turbulence * 0.40, 0.0, 1.0);
    vec3 color = mix(vec3(0.48, 0.012, 0.001), vec3(1.0, 0.13, 0.003), smoothstep(0.12, 0.48, heat));
    color = mix(color, vec3(1.0, 0.56, 0.035), smoothstep(0.50, 0.78, heat));
    color = mix(color, vec3(1.0, 0.91, 0.55), smoothstep(0.84, 1.0, heat) * 0.8);
    color *= 0.70 + 0.30 * facing;
    float body = smoothstep(0.0, 0.055, h) * (1.0 - smoothstep(0.67 + turbulence * 0.2, 1.0, h));
    float breakup = smoothstep(0.18, 0.70, turbulence - h * 0.32 + (1.0 - h) * 0.20);
    float alpha = body * breakup * (0.15 + 0.65 * pow(facing, 0.6));
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

const emberVertex = /* glsl */`
  uniform float uTime;
  attribute vec2 emberData;
  varying float vFade;
  void main() {
    float age = fract(uTime * emberData.y + emberData.x);
    float phase = emberData.x * 37.0;
    vec3 center = vec3(sin(phase + age * 3.0) * (0.12 + age * 0.3), age * 1.55,
      cos(phase + age * 2.0) * (0.12 + age * 0.22));
    vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
    vFade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
    gl_PointSize = clamp(5.0 / max(0.3, -mvPosition.z), 1.0, 4.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const emberFragment = /* glsl */`
  varying float vFade;
  void main() {
    float radius = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = (1.0 - smoothstep(0.25, 1.0, radius)) * vFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(vec3(1.0, 0.18, 0.005), vec3(1.0, 0.8, 0.25), 1.0 - radius), alpha);
    #include <colorspace_fragment>
  }
`;

/** Colored 3D flame tongues and rising embers, animated by GPU uniforms. */
export class FireplaceFire {
  readonly root = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly sources: { object: THREE.Object3D; visible: boolean }[];
  private readonly geometry: THREE.LatheGeometry;
  private readonly emberGeometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly emberMaterial: THREE.ShaderMaterial;
  private readonly flames: THREE.InstancedMesh;
  private readonly lightPosition = new THREE.Vector3();
  private disposed = false;

  constructor(house: THREE.Object3D, visual: THREE.Object3D, anchor: THREE.Object3D) {
    house.updateWorldMatrix(true, true);
    const sourceBounds = new THREE.Box3().setFromObject(visual, true);
    const origin = anchor.getWorldPosition(new THREE.Vector3());
    let preferred = visual;
    const extras: THREE.Object3D[] = [];
    house.traverse(object => {
      // The existing imported flame was assigned a stone material. Hide that
      // recognized fire only when it lies inside this hearth, never other props.
      if (!(object instanceof THREE.Mesh) || object === visual || visual.getObjectById(object.id) ||
          !/^(geometry_0|FIRE_FLAME|Flame)$/i.test(object.userData.portfolioAuthoringName ?? object.userData.name ?? object.name)) return;
      const bounds = new THREE.Box3().setFromObject(object, true), size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      if (Math.hypot(center.x - origin.x, center.z - origin.z) > 0.7 || Math.abs(center.y - origin.y) > 1.5 ||
          size.y < 0.15 || size.y > 1.6 || Math.max(size.x, size.z) > 1.2) return;
      extras.push(object); preferred = object;
    });
    this.sources = [...new Set([visual, ...extras])].map(object => ({ object, visible: object.visible }));
    const bounds = preferred === visual ? sourceBounds : new THREE.Box3().setFromObject(preferred, true);
    const size = bounds.isEmpty() ? new THREE.Vector3(0.55, 0.8, 0.55) : bounds.getSize(new THREE.Vector3());
    const base = bounds.isEmpty() ? origin.clone() : bounds.getCenter(new THREE.Vector3());
    if (!bounds.isEmpty()) base.y = bounds.min.y;
    const width = THREE.MathUtils.clamp(Math.max(size.x, size.z), 0.35, 1.2);
    const height = THREE.MathUtils.clamp(size.y, 0.55, 1.5);
    this.lightPosition.copy(base).y += height * 0.4;
    this.root.name = "FIREPLACE_FIRE_RUNTIME";
    this.root.userData.portfolioHelper = true;
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(house.matrixWorld).invert().multiply(new THREE.Matrix4().compose(
      base, new THREE.Quaternion(), new THREE.Vector3(width, height, width)));

    this.geometry = new THREE.LatheGeometry(Array.from({ length: 13 }, (_, index) => {
      const y = index / 12;
      return new THREE.Vector2(0.16 * (1 - y) + 0.8 * Math.sin(Math.PI * y ** 0.65) + 0.012, y);
    }), 10);
    this.geometry.setAttribute("flameData", new THREE.InstancedBufferAttribute(new Float32Array([
      0.2, 0.9, 0.1, 1.3, 1.13, 0.2, 2.1, 1.02, 0.5, 3.2, 1.27, 0.8,
      4.3, 0.96, 0.7, 5.4, 1.17, 0.5, 6.1, 1.05, 1.0,
    ]), 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time }, vertexShader: flameVertex, fragmentShader: flameFragment,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
    });
    const flames = new THREE.InstancedMesh(this.geometry, this.material, 7);
    this.flames = flames;
    flames.name = "FIREPLACE_FLAMES";
    const positions = [[-0.27, 0, 0], [0.23, 0, -0.04], [0, 0, 0.05], [-0.1, 0, 0.18], [0.18, 0, -0.2], [-0.18, 0, -0.16], [0, 0, 0]];
    const heights = [0.73, 0.85, 1, 0.62, 0.55, 0.67, 0.48], radii = [0.2, 0.19, 0.24, 0.16, 0.16, 0.17, 0.22];
    for (let i = 0; i < positions.length; i++) flames.setMatrixAt(i, new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(positions[i]), new THREE.Quaternion(), new THREE.Vector3(radii[i], heights[i], radii[i])));
    flames.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 1.2);
    this.root.add(flames);

    this.emberGeometry = new THREE.BufferGeometry();
    this.emberGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(8 * 3), 3));
    this.emberGeometry.setAttribute("emberData", new THREE.Float32BufferAttribute(Array.from({ length: 8 }, (_, i) => [i * 0.137, 0.25 + i % 3 * 0.07]).flat(), 2));
    this.emberGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.2);
    this.emberMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time }, vertexShader: emberVertex, fragmentShader: emberFragment,
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const embers = new THREE.Points(this.emberGeometry, this.emberMaterial);
    embers.name = "FIREPLACE_EMBERS"; this.root.add(embers);
    this.sources.forEach(source => { source.object.visible = false; });
    house.add(this.root);
  }

  getLightPosition(target: THREE.Vector3): THREE.Vector3 { return target.copy(this.lightPosition); }
  get flicker(): number { return 0.92 + Math.sin(this.time.value * 13) * 0.045 + Math.sin(this.time.value * 21) * 0.025; }
  update(delta: number): void { this.time.value += Math.max(0, Math.min(delta, 0.05)); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.flames.dispose();
    this.geometry.dispose(); this.emberGeometry.dispose(); this.material.dispose(); this.emberMaterial.dispose();
    this.sources.forEach(source => { source.object.visible = source.visible; });
  }
}
