# 3D Interactive Portfolio Guide: React + Three.js + Blender

**Goal:** Build an interactive top-down 3D space where visitors control a character, walk around, and click on NPCs to discover your portfolio information (CV, projects, experience, about me).

**Stack:** React, Three.js, Blender, Vite/React-three-fiber (optional)

**Timeline:** 8-12 weeks (including learning + building)

---

## Table of Contents

1. [Quick Overview & Architecture](#quick-overview--architecture)
2. [Phase 1: Three.js Fundamentals (2-3 weeks)](#phase-1-threejs-fundamentals-2-3-weeks)
3. [Phase 2: Blender Workflow (3-4 weeks)](#phase-2-blender-workflow-3-4-weeks)
4. [Phase 3: Asset Strategy & Resources (Parallel)](#phase-3-asset-strategy--resources-parallel)
5. [Phase 4: React + Three.js Integration (2-3 weeks)](#phase-4-react--threejs-integration-2-3-weeks)
6. [Phase 5: Polish & Deployment (1-2 weeks)](#phase-5-polish--deployment-1-2-weeks)
7. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
8. [Detailed Resources](#detailed-resources)

---

## Quick Overview & Architecture

### The Vision
```
User enters your portfolio site
          ↓
3D scene loads (top-down view, orthographic camera)
          ↓
User sees a controllable character in a space
          ↓
User presses WASD to move around
          ↓
User clicks on NPCs scattered in the space
          ↓
Each NPC displays different info:
  - NPC 1: "About Me" (your bio)
  - NPC 2: "My Projects" (clickable projects)
  - NPC 3: "Experience" (skills, timeline)
  - NPC 4: "Contact" (email, socials)
          ↓
Dialog/Modal appears with portfolio content
          ↓
User closes dialog, continues exploring
```

### Technical Architecture

```
React Component Tree
│
├── <Canvas> (Three.js scene renderer)
│   ├── Scene (3D world)
│   ├── Camera (OrthographicCamera, top-down)
│   ├── Lighting
│   ├── Player Character (animated model)
│   ├── NPCs (static models at fixed positions)
│   ├── Environment (floor, walls, obstacles)
│   └── Raycaster (for click detection)
│
├── <InputManager> (keyboard/mouse input)
│   └── Listens to WASD, handles player movement
│
├── <InteractionState> (Redux/Context/Zustand)
│   ├── Player position & rotation
│   ├── Selected NPC
│   └── Active dialog
│
└── <PortfolioDialog> (HTML overlay UI)
    ├── Shows when NPC clicked
    ├── Displays portfolio content
    └── Closes on button click or Esc
```

---

## Phase 1: Three.js Fundamentals (2-3 weeks)

### What You Need to Learn

1. **Core Concepts**
   - Scene, Camera, Renderer (the holy trinity)
   - Geometry & Materials
   - Lighting (directional, ambient, point lights)
   - Coordinate system (X, Y, Z axes)
   - Delta time for smooth animation

2. **Intermediate Concepts**
   - Model loading (GLTFLoader for .glb files)
   - Skeletal animation (AnimationMixer)
   - Input handling (keyboard listeners)
   - Raycasting (mouse picking)
   - Collision detection basics

3. **For Your Project Specifically**
   - **OrthographicCamera** instead of PerspectiveCamera (top-down games use this)
   - **GLTFLoader** to import Blender/Mixamo models
   - **AnimationMixer** to play walk/idle animations
   - **Raycaster** to detect when user clicks on NPCs
   - **Vector3** for position/movement math

### Learning Path

#### Week 1: Fundamentals
**Goal:** Understand the Three.js scene structure

**Topics:**
- Scenes, cameras, renderers
- Basic geometry (BoxGeometry, PlaneGeometry)
- Materials (MeshStandardMaterial, MeshBasicMaterial)
- Lights (DirectionalLight, AmbientLight)
- Transformation (position, rotation, scale)
- Animation loop (requestAnimationFrame)

**Hands-on:**
1. Create a scene with a cube
2. Add lights so you can see the cube
3. Rotate the cube continuously
4. Add a plane as a floor
5. Switch camera to orthographic and look from above

**Resources:**
- [Three.js Official Getting Started](https://threejs.org/docs/#manual/en/introduction/Creating-a-scene)
- [Three.js Journey - Chapter 1-3](https://threejs-journey.com/) (paid, but worth it)
- YouTube: [Three.js Playlist by Simon Dev](https://www.youtube.com/watch?v=-_dvHGluWA8&list=PLjcjAqAnHd1EIxV0d6OC3hgkLSR0NKEjd)

#### Week 2: Model Loading & Animation
**Goal:** Load and animate external 3D models

**Topics:**
- GLTFLoader API
- How to access animations from loaded models
- AnimationMixer, AnimationAction
- Playing animations based on user input
- Dealing with animation speed/timing

**Hands-on:**
1. Load a simple .glb model from a URL or local file
2. List all animations available in the model
3. Play one animation (e.g., walk) on command
4. Stop/start animations
5. Blend between animations (idle → walk → idle)

**Code Example:**
```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
let mixer;

loader.load('model.glb', (gltf) => {
  const model = gltf.scene;
  scene.add(model);
  
  // Access animations
  mixer = new THREE.AnimationMixer(model);
  const walkAction = mixer.clipAction(gltf.animations[0]); // assume first is walk
  walkAction.play();
});

// In animation loop
mixer.update(deltaTime);
```

**Resources:**
- [Three.js GLTFLoader Documentation](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [Three.js Animation System](https://threejs.org/docs/#manual/en/introduction/Animation-system)
- YouTube: [Wawa Sensei - Three.js Animation](https://www.youtube.com/c/WawaSensei)

#### Week 3: Input & Interaction
**Goal:** Handle player movement and NPC clicking

**Topics:**
- Keyboard input (KeyboardEvent listeners)
- Character movement (updating position based on input)
- Raycasting (detecting clicks on objects)
- Camera following player (optional, but nice for UX)

**Hands-on:**
1. Add keyboard listener for WASD keys
2. Update player position when keys are pressed
3. Rotate player to face movement direction
4. Add raycaster and detect mouse clicks
5. Log when clicking on specific objects (NPCs)

**Code Example:**
```javascript
// Keyboard input
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// In animation loop
const moveSpeed = 5;
if (keys['w']) playerPosition.z -= moveSpeed * deltaTime;
if (keys['s']) playerPosition.z += moveSpeed * deltaTime;
if (keys['a']) playerPosition.x -= moveSpeed * deltaTime;
if (keys['d']) playerPosition.x += moveSpeed * deltaTime;

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(npcGroup.children);
  
  if (intersects.length > 0) {
    console.log('Clicked NPC:', intersects[0].object.name);
  }
});
```

**Resources:**
- [Three.js Raycaster](https://threejs.org/docs/#api/en/core/Raycaster)
- [MDN: Keyboard Events](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent)
- YouTube: [Three.js Tutorial - Player Movement](https://www.youtube.com/watch?v=ijW5i0wjfbs)

### Three.js Checklist Before Moving On

- [ ] Can create a scene with camera, lights, and objects
- [ ] Can load and display a .glb model
- [ ] Can play animations on a model
- [ ] Can move a character with WASD (position updates smoothly)
- [ ] Can detect mouse clicks on objects with raycasting
- [ ] Understand delta time and why smooth movement matters
- [ ] Know the difference between World coordinates and Local coordinates

---

## Phase 2: Blender Workflow (3-4 weeks)

### Prerequisites
- Download [Blender](https://www.blender.org/) (free, latest version 4.0+)
- Allocate ~2 hours to just navigate the UI
- Accept that Blender is 90% learning the shortcuts

### Quick Start: Do This First
**Don't try to model from scratch yet.** Start by:
1. Download a rigged character from Mixamo (free, covered below)
2. Import it into Blender
3. Export it as .glb
4. Load it in Three.js
5. Play its animations

This gives you the full workflow in 30 minutes, then you'll understand what rigging/animation means.

---

### If You Want to Create Custom Characters

#### Stage 1: Basic Character Modeling (1 week)

**Approach 1: Box Modeling (Recommended for beginners)**
- Start with a cube
- Subdivide and shape it into body parts (arms, legs, torso, head)
- No need for high detail—low-poly is fine (500-2000 triangles)
- Focus on silhouette, not detail (people see you from above anyway)

**Approach 2: Sculpting (More intuitive, but harder to rig)**
- Use Blender's sculpting tools to create organic shapes
- Later convert to low-poly with decimation
- More artistic, but slower

**Recommended for YOU:** Box modeling. It's procedural, easier to rig, and faster.

**Tutorial Path:**
1. [Blender Beginner Series - Modeling (CG Cookie)](https://www.youtube.com/watch?v=JhM-H20v66w) (follow along, pause frequently)
2. Model a simple humanoid: head, torso, arms, legs (8 separate objects or 1 joined mesh)
3. Don't worry about hands/feet detail—they're tiny in top-down view

**Key Blender Shortcuts to Learn:**
- `Tab` - Enter/exit Edit mode
- `A` - Select all
- `Alt+A` - Deselect all
- `X` - Delete
- `Shift+A` - Add object
- `S` - Scale
- `G` - Grab (move)
- `R` - Rotate
- `E` - Extrude (key for modeling)
- `L` - Select linked (in edit mode)
- `Ctrl+J` - Join objects

#### Stage 2: Rigging (Skeleton Setup) (1 week)

**What is rigging?**
Rigging is attaching a digital skeleton to your model so it can move. Think: your model is the skin, the skeleton is the bones. When you rotate a bone, the skin follows.

**Tools:**
- Blender's built-in Armature (skeleton)
- Rigify add-on (comes with Blender, makes rigging faster)

**Minimal Rig for Walking:**
```
Armature
├── Root (center)
├── Spine (torso)
├── Chest (upper body)
├── Neck
├── Head
├── Shoulder.L / Shoulder.R
├── Arm.L / Arm.R
├── Forearm.L / Forearm.R
├── Hand.L / Hand.R
├── Hip.L / Hip.R
├── Leg.L / Leg.R
├── Knee.L / Knee.R
└── Foot.L / Foot.R
```

You don't need inverse kinematics (IK) for a top-down game. Forward kinematics is enough.

**Steps:**
1. Add an armature to your scene (Shift+A → Armature → Human)
2. Scale/position bones to match your character
3. Parent mesh to armature (Ctrl+P → "With Automatic Weights")
4. Enter Weight Paint mode and refine which parts follow which bones
5. Test by rotating a bone—the mesh should deform naturally

**Tutorial Path:**
- [Grant Abbitt - Blender Rigging for Beginners](https://www.youtube.com/watch?v=8m5LAzZrJEw) (30 min, extremely clear)
- [Blender Rigify Documentation](https://docs.blender.org/manual/en/latest/addons/rigging/rigify/index.html)

**Key Shortcuts:**
- `Ctrl+P` - Parent mesh to armature
- `Ctrl+Tab` - Toggle pose mode (for animating bones)
- `W` (in weight paint) - Brush size
- `Shift+Tab` - Weight paint mode

#### Stage 3: Animation (1-2 weeks)

**Creating a Walk Cycle:**
This is the core animation you'll use most. A good walk cycle repeats every ~10 frames (at 60fps = ~0.17 seconds).

**Process:**
1. Switch to Pose Mode (`Ctrl+Tab`)
2. Open Dope Sheet (editor bottom) and select Action Editor
3. Create a new Action called "Walk"
4. Position all bones at frame 0 (standing pose)
5. Move to frame 5: rotate legs backward (one forward, one back)
6. Move to frame 10: return to standing pose (complete walk step)
7. Loop frames 0-10
8. Test by playing the animation (Space bar)

**Key Poses for a Walk Cycle:**
```
Frame 0:   Neutral stance (both legs neutral)
Frame 3:   Left leg forward, right leg back, arms opposite
Frame 5:   Maximum stride
Frame 7:   Right leg forward, left leg back
Frame 10:  Back to neutral (loops)
```

**Other Essential Animations:**
- **Idle** (2 frames, no movement, just a slight sway)
- **Interact** (wave, nod, gesture)

**Tutorial Path:**
- [Blender Walk Cycle Tutorial (CG Cookie)](https://www.youtube.com/watch?v=1yp0ZU7LBNo)
- [Basic Walk Cycle Principles (YouTube)](https://www.youtube.com/watch?v=TpPu9rp8yKc)

**Key Shortcuts:**
- Space - Play animation
- `I` (in Pose mode) - Insert keyframe
- `A` (in Dope Sheet) - Select all keyframes
- `G` - Grab/move keyframe in time

#### Stage 4: Export as glTF 2.0 (.glb)

**This is critical.** Wrong export = broken animations in Three.js.

**Steps:**
1. Select your character (mesh + armature)
2. File → Export → glTF 2.0 (.glb)
3. In export options:
   - ✅ **Include Animations**
   - ✅ **Use Tangents**
   - ✅ **Include All Bone Influences**
   - ❌ Bake Animation (leave unchecked)
   - ❌ Shape Keys (unless using blend shapes)
   - Format: `.glb` (binary, faster loading)
4. Export

**Test Immediately:**
Load it in your Three.js scene and verify animations play. Don't move on until this works.

---

### Why Use Mixamo Instead (Recommended Shortcut)

**Mixamo** is an Adobe service that provides:
- 4000+ free rigged characters
- 4000+ free animations
- Auto-rigging tool (upload your own mesh, get skeleton automatically)
- Downloads in .glb format, ready for Three.js

**Time Savings:**
- Creating + rigging + animating one character: ~4 weeks
- Using Mixamo: ~30 minutes

**How to Use Mixamo:**
1. Go to [mixamo.com](https://www.mixamo.com/)
2. Search for character (try "lowpoly" or "stylized")
3. Download in .glb format
4. Search for "Walk" animation, download
5. Load in Blender (File → Import → glTF)
6. Export again for any custom tweaks
7. Load in Three.js

**Pro Tip:** Use Mixamo for your main player character. Create simpler custom NPCs in Blender (they're static anyway).

---

## Phase 3: Asset Strategy & Resources (Parallel)

### Free 3D Model Websites

| Site | Best For | License | Quality | Notes |
|------|----------|---------|---------|-------|
| **Mixamo** | Rigged characters + animations | Free | ⭐⭐⭐⭐⭐ | Start here. 4000+ animations. |
| **Sketchfab** | Everything (characters, environments, props) | Varies (filter by CC) | ⭐⭐⭐⭐ | Huge library. Check license before use. |
| **OpenGameArt** | Game assets (characters, environments) | CC0 / CC-BY | ⭐⭐⭐ | Smaller but all game-ready. |
| **Quaternius** | Low-poly style assets | CC0 | ⭐⭐⭐⭐ | Perfect for game aesthetics. MIT license. |
| **TurboSquid Free** | High-quality models | Various | ⭐⭐⭐⭐⭐ | Some free sections. Check license. |
| **BlendSwap** | Community Blender projects | Various | ⭐⭐⭐ | Get .blend files directly. |
| **Poly Haven** | Everything (soon paid/free model) | CC0 | ⭐⭐⭐⭐⭐ | High quality, all free. |

### Asset Checklist

**Priority 1 (Get these first):**
- [ ] 1 Rigged character model (use Mixamo)
- [ ] 1 Walk animation
- [ ] 1 Idle animation
- [ ] Floor texture/model

**Priority 2 (Enhance your space):**
- [ ] 2-3 NPC models (can be static, even low-detail)
- [ ] Simple environment pieces (trees, benches, signs)
- [ ] Optional: particle effects (decorative)

**Priority 3 (Polish):**
- [ ] Skybox or background
- [ ] Ambient audio
- [ ] Custom textures

### Recommended Workflow for Assets

1. **Find base character on Mixamo** (45 min)
2. **Download 2-3 animations** (walk, idle, interact) (15 min)
3. **Find 3-4 NPC character models** on Sketchfab/Quaternius (1 hour)
4. **Find environment assets** (floor, walls, props) (1-2 hours)
5. **Import all into Blender**, test positioning (30 min)
6. **Export everything as separate .glb files** (30 min)
7. **Load in Three.js scene** (1 hour)

**Total time with this approach: ~5 hours**

---

## Phase 4: React + Three.js Integration (2-3 weeks)

### Project Setup

#### Option A: React + Three.js (Vanilla)
```bash
npm create vite@latest my-3d-portfolio -- --template react
cd my-3d-portfolio
npm install three
npm run dev
```

#### Option B: React Three Fiber (Recommended)
```bash
npm create vite@latest my-3d-portfolio -- --template react
cd my-3d-portfolio
npm install three @react-three/fiber @react-three/drei zustand
npm run dev
```

**Why React Three Fiber?**
- Cleaner JSX syntax for Three.js
- Handles rendering automatically
- Better with React patterns (hooks, state management)
- Easier to manage scene hierarchy

**We'll use vanilla Three.js here for clarity, but RTF is superior.**

---

### Architecture: File Structure

```
src/
├── components/
│   ├── Canvas.jsx           (Three.js scene, models, lighting)
│   ├── PortfolioDialog.jsx  (UI overlay for NPC info)
│   └── LoadingScreen.jsx    (show while models load)
├── hooks/
│   ├── usePlayerMovement.js (WASD input)
│   ├── useRaycaster.js      (NPC clicking)
│   └── useLoadModel.js      (GLTFLoader wrapper)
├── store/
│   └── gameState.js         (Zustand: player pos, selected NPC, dialog)
├── data/
│   ├── npcs.js              (NPC positions, info, model paths)
│   └── portfolio.js         (CV content, projects, etc.)
└── App.jsx
```

---

### Step 1: Basic Canvas Component

```jsx
// src/components/Canvas.jsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function Canvas() {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 100, 500);
    sceneRef.current = scene;

    // Camera (orthographic, top-down)
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const frustumSize = 50; // Adjust for zoom level

    const camera = new THREE.OrthographicCamera(
      frustumSize / -2,
      frustumSize / 2,
      (frustumSize * height) / width / 2,
      (frustumSize * height) / width / -2,
      0.1,
      1000
    );
    camera.position.set(0, 30, 0); // Look down from above
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x90ee90 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      renderer.setSize(newWidth, newHeight);
      // Update camera aspect ratio...
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
}
```

---

### Step 2: Load Player Model & Animations

```jsx
// src/hooks/useLoadModel.js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useEffect, useState } from 'react';

export function useLoadModel(modelPath, scene) {
  const [model, setModel] = useState(null);
  const [mixer, setMixer] = useState(null);
  const [animations, setAnimations] = useState([]);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
      const loadedModel = gltf.scene;
      loadedModel.castShadow = true;
      loadedModel.receiveShadow = true;
      scene.add(loadedModel);

      const animationMixer = new THREE.AnimationMixer(loadedModel);
      const animationList = gltf.animations;

      setModel(loadedModel);
      setMixer(animationMixer);
      setAnimations(animationList);
    });
  }, [modelPath, scene]);

  return { model, mixer, animations };
}
```

---

### Step 3: Player Movement (WASD Input)

```jsx
// src/hooks/usePlayerMovement.js
import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';

export function usePlayerMovement(playerModel, mixer, animations) {
  const keysRef = useRef({});
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const isWalkingRef = useRef(false);
  const currentActionRef = useRef(null);

  const moveSpeed = 15; // units per second
  const rotationSpeed = 0.1; // radians per frame

  useEffect(() => {
    const handleKeyDown = (e) => {
      keysRef.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!playerModel || !mixer || animations.length === 0) return;

    const walkAction = mixer.clipAction(animations[0]); // Assume first animation is walk
    const idleAction = mixer.clipAction(animations[1]); // Assume second is idle

    let lastTime = Date.now();

    const updatePlayer = () => {
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;

      // Determine movement direction
      let moveX = 0;
      let moveZ = 0;

      if (keysRef.current['w']) moveZ -= moveSpeed * deltaTime;
      if (keysRef.current['s']) moveZ += moveSpeed * deltaTime;
      if (keysRef.current['a']) moveX -= moveSpeed * deltaTime;
      if (keysRef.current['d']) moveX += moveSpeed * deltaTime;

      // Update position
      playerModel.position.x += moveX;
      playerModel.position.z += moveZ;

      // Rotate to face movement direction
      if (moveX !== 0 || moveZ !== 0) {
        const angle = Math.atan2(moveX, moveZ);
        playerModel.rotation.y = angle;

        // Play walk animation
        if (!isWalkingRef.current) {
          walkAction.reset();
          walkAction.play();
          idleAction.stop();
          isWalkingRef.current = true;
        }
      } else {
        // Stop walking, play idle
        if (isWalkingRef.current) {
          idleAction.reset();
          idleAction.play();
          walkAction.stop();
          isWalkingRef.current = false;
        }
      }

      mixer.update(deltaTime);
      requestAnimationFrame(updatePlayer);
    };

    updatePlayer();
  }, [playerModel, mixer, animations]);

  return playerModel;
}
```

---

### Step 4: Raycasting (NPC Clicking)

```jsx
// src/hooks/useRaycaster.js
import { useEffect } from 'react';
import * as THREE from 'three';

export function useRaycaster(camera, npcGroup, onNPCClick) {
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(npcGroup.children, true);

      if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        // Find parent NPC (in case we clicked a child mesh)
        let npc = clickedObject;
        while (npc.parent && !npc.userData.npcId) {
          npc = npc.parent;
        }

        if (npc.userData.npcId) {
          onNPCClick(npc.userData.npcId);
        }
      }
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [camera, npcGroup, onNPCClick]);
}
```

---

### Step 5: State Management (Zustand)

```javascript
// src/store/gameState.js
import { create } from 'zustand';

export const useGameState = create((set) => ({
  // Player state
  playerPosition: { x: 0, y: 0, z: 0 },
  updatePlayerPosition: (pos) => set({ playerPosition: pos }),

  // NPC interaction state
  selectedNPCId: null,
  selectNPC: (id) => set({ selectedNPCId: id }),
  deselectNPC: () => set({ selectedNPCId: null }),

  // Dialog state
  isDialogOpen: false,
  openDialog: () => set({ isDialogOpen: true }),
  closeDialog: () => set({ isDialogOpen: false }),
}));
```

---

### Step 6: NPC Data Structure

```javascript
// src/data/npcs.js
export const npcs = [
  {
    id: 1,
    name: 'About Me',
    position: { x: -15, y: 0, z: 15 },
    modelPath: '/models/npc1.glb',
    dialogContent: {
      title: 'About Me',
      text: 'Hi! I\'m Abdel Rahman, a full-stack developer...',
      image: '/images/profile.jpg',
    },
  },
  {
    id: 2,
    name: 'My Projects',
    position: { x: 15, y: 0, z: 15 },
    modelPath: '/models/npc2.glb',
    dialogContent: {
      title: 'Projects',
      projects: [
        { name: 'FrequenC', description: 'Social events platform', link: '...' },
        // ...
      ],
    },
  },
  {
    id: 3,
    name: 'Experience',
    position: { x: -15, y: 0, z: -15 },
    modelPath: '/models/npc3.glb',
    dialogContent: {
      title: 'Experience',
      experience: [
        { role: 'Full-Stack Dev', company: 'X', years: '2021-2024' },
        // ...
      ],
    },
  },
  {
    id: 4,
    name: 'Contact',
    position: { x: 15, y: 0, z: -15 },
    modelPath: '/models/npc4.glb',
    dialogContent: {
      title: 'Get in Touch',
      email: 'hello@abdel.dev',
      socials: { linkedin: '...', github: '...', twitter: '...' },
    },
  },
];
```

---

### Step 7: Portfolio Dialog Component

```jsx
// src/components/PortfolioDialog.jsx
import React, { useEffect } from 'react';
import { useGameState } from '../store/gameState';
import { npcs } from '../data/npcs';
import './PortfolioDialog.css';

export function PortfolioDialog() {
  const { selectedNPCId, isDialogOpen, closeDialog } = useGameState();

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') closeDialog();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [closeDialog]);

  if (!selectedNPCId || !isDialogOpen) return null;

  const npc = npcs.find((n) => n.id === selectedNPCId);
  if (!npc) return null;

  return (
    <div className="dialog-overlay" onClick={closeDialog}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={closeDialog}>✕</button>
        
        <h2>{npc.dialogContent.title}</h2>
        
        {npc.dialogContent.text && (
          <p>{npc.dialogContent.text}</p>
        )}
        
        {npc.dialogContent.projects && (
          <div className="projects-list">
            {npc.dialogContent.projects.map((p) => (
              <div key={p.name} className="project-card">
                <h3>{p.name}</h3>
                <p>{p.description}</p>
              </div>
            ))}
          </div>
        )}

        {npc.dialogContent.experience && (
          <div className="experience-list">
            {npc.dialogContent.experience.map((exp) => (
              <div key={exp.role} className="exp-card">
                <h4>{exp.role}</h4>
                <p>{exp.company} • {exp.years}</p>
              </div>
            ))}
          </div>
        )}

        {npc.dialogContent.socials && (
          <div className="socials">
            {Object.entries(npc.dialogContent.socials).map(([platform, url]) => (
              <a key={platform} href={url} target="_blank" rel="noreferrer">
                {platform}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

```css
/* src/components/PortfolioDialog.css */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog-content {
  background: white;
  border-radius: 10px;
  padding: 30px;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 10px 50px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  border: none;
  background: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
}

.close-btn:hover {
  color: #333;
}

.dialog-content h2 {
  margin-top: 0;
  color: #333;
}

.projects-list, .experience-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin: 15px 0;
}

.project-card, .exp-card {
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
  border-left: 4px solid #007bff;
}

.socials {
  display: flex;
  gap: 15px;
  margin-top: 20px;
}

.socials a {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  text-decoration: none;
  border-radius: 5px;
  transition: background 0.3s;
}

.socials a:hover {
  background: #0056b3;
}
```

---

### Step 8: Main App Component

```jsx
// src/App.jsx
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Canvas } from './components/Canvas';
import { PortfolioDialog } from './components/PortfolioDialog';
import { useGameState } from './store/gameState';
import { npcs } from './data/npcs';

export default function App() {
  const sceneRef = useRef(null);
  const playerRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const npcGroupRef = useRef(new THREE.Group());
  const { selectNPC, openDialog } = useGameState();

  useEffect(() => {
    // Initialize scene (from Canvas component)
    // Load player model
    // Load NPC models
    // Setup raycasting
    // This would be in the actual Canvas component

    // For now, simplified example:
    const loader = new GLTFLoader();

    // Load each NPC
    npcs.forEach((npcData) => {
      loader.load(npcData.modelPath, (gltf) => {
        const npc = gltf.scene;
        npc.position.set(npcData.position.x, npcData.position.y, npcData.position.z);
        npc.userData.npcId = npcData.id;
        npcGroupRef.current.add(npc);
      });
    });

    // Handle NPC click
    const handleNPCClick = (npcId) => {
      selectNPC(npcId);
      openDialog();
    };

    window.addEventListener('npc-clicked', (e) => {
      handleNPCClick(e.detail.npcId);
    });

    return () => {
      window.removeEventListener('npc-clicked', handleNPCClick);
    };
  }, [selectNPC, openDialog]);

  return (
    <div>
      <Canvas />
      <PortfolioDialog />
    </div>
  );
}
```

---

## Phase 5: Polish & Deployment (1-2 weeks)

### Visual Polish

#### 1. Camera Follow Player (Optional but nice)
```javascript
// In animation loop
const targetCameraX = playerModel.position.x;
const targetCameraZ = playerModel.position.z + 20; // Offset behind player

camera.position.x += (targetCameraX - camera.position.x) * 0.05;
camera.position.z += (targetCameraZ - camera.position.z) * 0.05;
camera.lookAt(playerModel.position);
```

#### 2. Add Environment Details
- Place trees, benches, signs around NPCs
- Use simple low-poly models from Quaternius or Sketchfab
- Add subtle particle effects (leaves, dust) for atmosphere

#### 3. Skybox
```javascript
const textureLoader = new THREE.TextureLoader();
const skyTexture = textureLoader.load('/textures/sky.jpg');
scene.background = skyTexture;
```

#### 4. Audio Ambience
```javascript
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const audio = new THREE.Audio(audioListener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('/audio/ambient.mp3', (audioBuffer) => {
  audio.setBuffer(audioBuffer);
  audio.setLoop(true);
  audio.setVolume(0.3);
  audio.play();
});
```

#### 5. Loading Screen
Show a loading bar while models load, especially important for slower connections.

```jsx
// src/components/LoadingScreen.jsx
export function LoadingScreen({ progress }) {
  return (
    <div className="loading-screen">
      <h2>Loading your portfolio...</h2>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
      </div>
      <p>{Math.round(progress)}%</p>
    </div>
  );
}
```

### Performance Optimization

1. **Model Optimization**
   - Keep character models under 50k triangles
   - Use texture atlases (combine multiple textures into one)
   - Use LOD (Level of Detail) for distant objects

2. **Code Optimization**
   - Use object pooling for particles/effects
   - Debounce resize handlers
   - Cache raycaster results

3. **Bundling**
   ```bash
   npm install --save-dev @vite/plugin-react-swc
   # In vite.config.js, use SWC for faster builds
   ```

4. **Asset Compression**
   - Compress .glb files with Draco compression
   - Use webp for textures instead of PNG

---

### Deployment

#### Option 1: Vercel (Easiest for React)
```bash
npm install -g vercel
vercel
```

#### Option 2: GitHub Pages
```bash
npm run build
# Deploy dist/ folder
```

#### Option 3: Netlify
```bash
npm run build
# Drag & drop dist/ folder
```

#### Important: Asset Paths
When deploying, ensure all model/texture paths are relative:
```javascript
// ❌ Wrong
loader.load('/models/character.glb', ...)

// ✅ Correct
loader.load(new URL('/models/character.glb', import.meta.url).href, ...)
```

---

## Common Pitfalls & Solutions

### 1. Animations Don't Play
**Symptom:** Model loads but animations are stuck or don't play.

**Solutions:**
- Verify animation exists in loaded model: `console.log(gltf.animations)`
- Check AnimationMixer is being updated: `mixer.update(deltaTime)`
- Ensure animations were exported in Blender with "Include Animations" checked

### 2. Model Appears Invisible or Tiny
**Symptom:** Model doesn't show up or is impossibly small.

**Solutions:**
- Check model scale in Blender before export (apply scale: Ctrl+A → Scale)
- Adjust camera frustumSize to match model scale
- Verify lights are positioned correctly
- Check if model is at (0, 0, 0) in your scene

### 3. Raycasting Doesn't Detect NPCs
**Symptom:** Clicking NPCs does nothing.

**Solutions:**
- Add unique `userData.npcId` to each NPC
- Verify raycaster intersects array isn't empty: `console.log(intersects)`
- Check NPC is actually visible in scene
- Try with `raycaster.intersectObjects(scene.children, true)` (recursive)

### 4. Walking Off-Screen / Movement Feels Stiff
**Symptom:** Player moves too fast/slow or jerky.

**Solutions:**
- Use deltaTime-based movement (not frame-based)
- Clamp player position to boundary:
  ```javascript
  const maxDistance = 50;
  const length = playerModel.position.length();
  if (length > maxDistance) {
    playerModel.position.normalize().multiplyScalar(maxDistance);
  }
  ```
- Smooth rotation with lerp instead of direct assignment

### 5. Models Don't Cast Shadows
**Symptom:** Lighting looks flat, no shadows.

**Solutions:**
- Enable shadow map: `renderer.shadowMap.enabled = true`
- Set light to cast shadow: `light.castShadow = true`
- Set model to cast shadow: `model.castShadow = true`
- Set floor to receive shadow: `floor.receiveShadow = true`

### 6. Slow Performance / Frame Drops
**Symptom:** FPS drops below 60.

**Solutions:**
- Reduce NPC model complexity
- Use fewer/lower-resolution textures
- Enable frustum culling: `scene.fog = new THREE.Fog(...)`
- Profile with DevTools Performance tab
- Consider using React Three Fiber for better optimization

---

## Detailed Resources

### Learning Resources by Topic

#### Three.js Core Learning
- **Official Three.js Docs**: https://threejs.org/docs/
- **Three.js Journey** (Paid course, excellent): https://threejs-journey.com/
- **Discover Three.js** (Free): https://discoverthreejs.com/
- **YouTube: Simon Dev**: https://www.youtube.com/c/SimonDev (comprehensive tutorials)
- **YouTube: Wawa Sensei**: https://www.youtube.com/c/WawaSensei (game dev focus)

#### Blender Learning
- **Official Blender Docs**: https://docs.blender.org/
- **Blender Beginner Series (CG Cookie)**: https://www.youtube.com/c/CGCookie
- **Grant Abbitt**: https://www.youtube.com/@GrantAbbitt (character modeling)
- **Blender Studio Courses**: https://studio.blender.org/ (official, free)
- **YouTube: Polygon Runway**: https://www.youtube.com/c/PolygonRunway (quick tips)

#### Asset Resources
- **Mixamo**: https://www.mixamo.com/ (free rigged characters & animations)
- **Sketchfab**: https://sketchfab.com/ (free & premium 3D models)
- **OpenGameArt**: https://opengameart.org/ (game assets, all CC)
- **Quaternius**: https://quaternius.com/ (low-poly game models)
- **Poly Haven**: https://polyhaven.com/ (high-quality free assets)

#### React Three Fiber (Advanced)
- **React Three Fiber Docs**: https://docs.pmnd.rs/react-three-fiber/
- **Drei Helpers**: https://github.com/pmndrs/drei (useful React Three components)
- **YouTube: Wawa Sensei RTF series**: https://www.youtube.com/watch?v=i1J9_yrqwg8

#### State Management
- **Zustand Docs**: https://docs.pmnd.rs/zustand/
- **Redux**: https://redux.js.org/ (heavier but more structured)
- **Context API**: https://react.dev/reference/react/useContext (built-in, simplest)

### Cheat Sheets & Quick References

#### Three.js Quick Start
```javascript
// Scene + Renderer
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();

// Camera (orthographic)
const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);

// Light
const light = new THREE.DirectionalLight(0xffffff, 1);
scene.add(light);

// Load model
const loader = new GLTFLoader();
loader.load('model.glb', (gltf) => scene.add(gltf.scene));

// Render
renderer.render(scene, camera);
```

#### Blender Keyboard Shortcuts (Must Know)
```
Tab           - Edit/Object mode toggle
CTRL+Tab      - Pose mode (for animating)
SPACE         - Play animation
I             - Insert keyframe
G             - Grab/Move
S             - Scale
R             - Rotate
X             - Delete
A             - Select all
ALT+A         - Deselect all
E             - Extrude
L             - Select linked
CTRL+J        - Join objects
SHIFT+A       - Add object
Z             - Wireframe toggle
```

#### glTF Export Checklist (Blender)
- [ ] File → Export → glTF 2.0 (.glb)
- [ ] ✅ Include Animations
- [ ] ✅ Use Tangents
- [ ] ✅ Include All Bone Influences
- [ ] ❌ Bake Animation
- [ ] ❌ Shape Keys (unless needed)
- [ ] Choose .glb (binary) for smaller file size

---

## Full Project Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Three.js Learning | 2-3 weeks | Can load models, control character, detect clicks |
| Phase 2: Blender / Asset Gathering | 3-4 weeks | Player character with walk/idle, 4 NPCs, environment |
| Phase 3: Parallel Asset Work | 1-2 weeks | Complete asset pack ready for integration |
| Phase 4: React + Three.js Integration | 2-3 weeks | Fully functional prototype with dialog system |
| Phase 5: Polish + Deploy | 1-2 weeks | Production-ready portfolio site |
| **TOTAL** | **8-12 weeks** | **Live portfolio** |

### Agile Alternative (Faster Iteration)
- Week 1-2: Basic Three.js setup + Mixamo character
- Week 3: Dialog system integration
- Week 4-6: Add NPCs, environments, polish
- Week 7: Deploy and iterate

---

## Advanced Enhancements (After MVP)

Once your portfolio is live, consider adding:

1. **Multiplayer**
   - WebSocket server (Node.js/Socket.io)
   - See other visitors in your space in real-time

2. **Mobile Support**
   - Touch controls (swipe to move)
   - Adjust camera for mobile viewport

3. **Advanced Analytics**
   - Track which NPCs visitors click most
   - Heatmaps of player movement

4. **Dynamic Content**
   - Load portfolio data from API (GitHub, JSON)
   - Real-time updates to projects/experience

5. **Procedural Generation**
   - Randomized environment each visit
   - Different NPC layouts

6. **Custom Editor**
   - Admin panel to edit NPC positions/content without redeploying

---

## Final Checklist Before Launch

- [ ] All models load without errors
- [ ] Player movement is smooth (60 FPS)
- [ ] NPCs clickable and dialog displays
- [ ] Portfolio content is complete and accurate
- [ ] Mobile-responsive (if supporting mobile)
- [ ] No console errors
- [ ] Loading time < 5 seconds
- [ ] Works in Chrome, Firefox, Safari
- [ ] Meta tags for social sharing
- [ ] Analytics tracking (Google Analytics, etc.)
- [ ] Custom domain linked
- [ ] Backup/version control on GitHub

---

## Quick Start Checklist

**This Week:**
- [ ] Install Blender
- [ ] Complete one Three.js tutorial
- [ ] Sign up for Mixamo
- [ ] Download 1 character + 2 animations

**Next Week:**
- [ ] Create basic React + Three.js scene
- [ ] Load Mixamo character
- [ ] Implement WASD movement
- [ ] Add raycasting

**Following Week:**
- [ ] Create 3-4 NPC models (simple, in Blender)
- [ ] Position NPCs in scene
- [ ] Build dialog UI

**Month 2:**
- [ ] Polish visuals (lighting, environment)
- [ ] Optimize performance
- [ ] Deploy to Vercel/Netlify

---

**You've got this. Start with Mixamo, iterate fast, and ship early. The 3D portfolio space is wild and unique—it'll stand out.**

Good luck! 🚀