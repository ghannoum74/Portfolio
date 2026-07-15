import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

camera.position.set(0, 20, -30);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.update();

const ambientLight = new THREE.AmbientLight(0xffffff);
scene.add(ambientLight);

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    visible: false,
  }),
);

plane.rotation.x = -Math.PI / 2;
plane.name = "ground";
scene.add(plane);

const highlight = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  }),
);

highlight.rotation.x = -Math.PI / 2;
highlight.position.set(0.5, 0.01, 0.5);
scene.add(highlight);

const gridHelper = new THREE.GridHelper(20, 20);
scene.add(gridHelper);

// ================================
// Keys control
// ================================

const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
};

let walkingAction: THREE.AnimationAction | null = null;

// ================================
// FBX CHARACTER
// ================================

const loader = new FBXLoader();

let character: THREE.Group | null = null;
let mixer: THREE.AnimationMixer | null = null;

const clock = new THREE.Clock();

loader.load(
  "/assets/models/Walking.fbx",

  (fbx) => {
    character = fbx;

    // this is to make the model smaller so by default it comes * 100 times
    character.scale.setScalar(0.01);
    character.position.set(0, 0, 0);

    // let some charactere's meshes cast and receive the shadow
    character.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(character);

    console.log("Character:", character);
    console.log("Animations:", character.animations);

    // Create animation controller
    mixer = new THREE.AnimationMixer(character);

    // Play first animation
    if (character.animations.length > 0) {
      walkingAction = mixer.clipAction(character.animations[0]);
    }
  },

  (xhr) => {
    if (xhr.total) {
      console.log(`${((xhr.loaded / xhr.total) * 100).toFixed(2)}% loaded`);
    }
  },

  (error) => {
    console.error("Error loading FBX:", error);
  },
);

// ================================
// RAYCASTER
// ================================

const mousePosition = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

let intersects: THREE.Intersection[] = [];

const objects: THREE.Object3D[] = [];

window.addEventListener("mousemove", (e) => {
  mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;

  mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mousePosition, camera);

  intersects = raycaster.intersectObjects(scene.children, true);

  intersects.forEach((inter) => {
    if (inter.object.name === "ground") {
      const highlightPos = new THREE.Vector3()
        .copy(inter.point)
        .floor()
        .addScalar(0.5);

      highlight.position.set(highlightPos.x, 0.01, highlightPos.z);
    }
  });
});

window.addEventListener("mousedown", () => {
  const objectExist = objects.find((obj) => {
    return (
      obj.position.x === highlight.position.x &&
      obj.position.z === highlight.position.z
    );
  });

  if (objectExist) return;

  intersects.forEach((inter) => {
    if (inter.object.name === "ground") {
      console.log("Clicked:", highlight.position);
    }
  });
});

// ================================
// KEY LISTENNER
// ================================

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key in keys) {
    keys[key as keyof typeof keys] = true;
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();

  if (key in keys) {
    keys[key as keyof typeof keys] = false;
  }
});

// ================================
// ANIMATION LOOP
// ================================

function animate() {
  const delta = clock.getDelta();

  // Update the FBX animation
  mixer?.update(delta);

  if (character) {
    const moveSpeed = 3;
    const rotationSpeed = 2;

    let isMoving = false;

    // Rotate left
    if (keys.a) {
      character.rotation.y += rotationSpeed * delta;
    }

    // Rotate right
    if (keys.d) {
      character.rotation.y -= rotationSpeed * delta;
    }

    // Direction the character is facing
    const direction = new THREE.Vector3();
    character.getWorldDirection(direction);

    // Move forward
    if (keys.w) {
      character.position.addScaledVector(direction, moveSpeed * delta);

      isMoving = true;
    }

    // Move backward
    if (keys.s) {
      character.position.addScaledVector(direction, -moveSpeed * delta);

      isMoving = true;
    }

    // Control walking animation
    if (isMoving) {
      if (!walkingAction?.isRunning()) {
        walkingAction?.play();
      }
    } else {
      walkingAction?.stop();
    }
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// ================================
// RESIZE
// ================================

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});
