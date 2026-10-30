import * as THREE from "three";

const fixtureName = "LIGHT_HOUSE_CHANDELIER";

/** The Blender fixture is the source of both the visible lamp and its light. */
export function createHouseLighting(house: THREE.Object3D, shadows: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = "HOUSE_CHANDELIER_LIGHTS";
  const fill = new THREE.HemisphereLight(0xffefda, 0x7b6c5b, 0.65);
  fill.name = "HOUSE_LIGHT_FILL";
  const bounce = new THREE.AmbientLight(0xfff1df, 0.16);
  bounce.name = "HOUSE_LIGHT_BOUNCE";
  group.add(fill, bounce);

  house.updateWorldMatrix(true, true);
  // Authoring fill/sun lights may be included by a future GLB export. The
  // interior rig owns lighting; imported preview lights cannot double it.
  house.traverse(object => {
    if (object instanceof THREE.Light) object.visible = false;
  });
  const marker = house.getObjectByName(fixtureName);
  const chandelier = house.getObjectByName("Chandelier");
  const position = new THREE.Vector3();
  if (marker) {
    marker.getWorldPosition(position);
  } else if (chandelier) {
    // Existing exports still follow the actual hanging fixture. The roof and
    // unrelated props must never change the lamp's position.
    const bounds = new THREE.Box3().setFromObject(chandelier);
    if (bounds.isEmpty()) return group;
    bounds.getCenter(position);
    position.y = bounds.min.y + 0.18;
  } else {
    console.warn("House chandelier missing; retaining only the interior bounce light.");
    return group;
  }

  const data = marker?.userData ?? {};
  const positive = (key: string, fallback: number) =>
    typeof data[key] === "number" && Number.isFinite(data[key]) && data[key] > 0 ? data[key] : fallback;
  const color = typeof data.portfolioLightColor === "string" && /^#[0-9a-f]{6}$/i.test(data.portfolioLightColor)
    ? new THREE.Color(data.portfolioLightColor) : new THREE.Color(0xffd3a0);
  const range = positive("portfolioLightRange", 26);
  // The chandelier's all-direction light supplies the room. Keep the cone as
  // a very small shadow contribution, so it cannot bleach the central rug.
  // Scale existing authored power too: changing just the default would leave
  // previously exported 100 cd fixtures with the same excessive hotspot.
  const main = new THREE.SpotLight(color, positive("portfolioLightIntensity", 100) * 0.08, range, 1.48, 1, 2);
  main.name = "HOUSE_LIGHT_CHANDELIER";
  main.position.copy(position);
  main.castShadow = shadows;
  main.shadow.mapSize.set(1024, 1024);
  main.shadow.camera.near = 0.1;
  main.shadow.camera.far = range;
  main.shadow.bias = -0.00015;
  main.shadow.normalBias = 0.025;
  const target = new THREE.Object3D();
  target.name = "HOUSE_LIGHT_CHANDELIER_TARGET";
  target.position.copy(position).add(new THREE.Vector3(0, -1, 0));
  main.target = target;

  // Broad warm light reaches the walls and furniture in every direction.
  // A gentler artistic falloff keeps the far corners readable without raising
  // exposure or adding bright patches from extra lamps. Only the downlight
  // uses a shadow map (one map instead of six point faces).
  const spill = new THREE.PointLight(color, positive("portfolioLightSpill", 8), range, 1);
  spill.name = "HOUSE_LIGHT_CHANDELIER_SPILL";
  spill.position.copy(position);
  spill.castShadow = false;
  group.add(main, target, spill);
  return group;
}
