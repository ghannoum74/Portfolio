import * as THREE from "three";
import type { PhysicsWorld } from "../../physics/PhysicsWorld";

/** Plan a short camera route through existing fixed colliders, without moving any scene objects. */
export class HouseTourPath {
  private readonly sphere;
  private readonly rotation = { x: 0, y: 0, z: 0, w: 1 };
  private readonly flags: number;
  private readonly bounds: THREE.Box3;
  private readonly eyeHeight: number;
  private readonly roofs: THREE.Object3D[] = [];
  private readonly roofRay = new THREE.Raycaster();
  private readonly roofTop: number;
  private nodes?: THREE.Vector3[];
  private readonly edgeCache = new Map<string, boolean>();
  private readonly pointCache = new Map<string, boolean>();
  private revision = -1;

  constructor(private readonly physics: PhysicsWorld, house: THREE.Object3D) {
    this.sphere = new physics.rapier.Ball(0.2);
    this.flags = physics.rapier.QueryFilterFlags.ONLY_FIXED;
    const floor = house.getObjectByName("HOUSE_FLOOR") ?? house.getObjectByName("COL_BOX_HOUSE_FLOOR") ?? house;
    this.bounds = new THREE.Box3().setFromObject(floor, true);
    const spawn = house.getObjectByName("SPAWN_HOUSE")?.getWorldPosition(new THREE.Vector3());
    this.eyeHeight = (spawn?.y ?? this.bounds.max.y) + 1.65;
    this.roofTop = new THREE.Box3().setFromObject(house, true).max.y + 1;
    house.traverse(object => {
      if ((object as THREE.Mesh).isMesh && !/^(COL_|ZONE_)/.test(object.name) && /ROOF|CEILING/i.test(object.name)) this.roofs.push(object);
    });
  }

  isClear(position: THREE.Vector3): boolean {
    if (this.revision !== this.physics.staticColliderRevision) {
      this.revision = this.physics.staticColliderRevision;
      this.pointCache.clear(); this.edgeCache.clear(); this.nodes = undefined;
    }
    const key = `${position.x.toFixed(4)}:${position.y.toFixed(4)}:${position.z.toFixed(4)}`;
    const cached = this.pointCache.get(key);
    if (cached !== undefined) return cached;
    const clear = this.checkPoint(position);
    this.pointCache.set(key, clear);
    return clear;
  }

  private checkPoint(position: THREE.Vector3): boolean {
    if (position.x < this.bounds.min.x + 0.23 || position.x > this.bounds.max.x - 0.23 ||
        position.z < this.bounds.min.z + 0.23 || position.z > this.bounds.max.z - 0.23) return false;
    this.roofRay.ray.origin.set(position.x, this.bounds.max.y + 0.05, position.z);
    this.roofRay.ray.direction.set(0, 1, 0);
    let roof = this.roofRay.intersectObjects(this.roofs, false)[0];
    if (!roof) {
      this.roofRay.ray.origin.y = this.roofTop;
      this.roofRay.ray.direction.y = -1;
      roof = this.roofRay.intersectObjects(this.roofs, false)[0];
    }
    if (roof && position.y + 0.25 >= roof.point.y) return false;
    return this.physics.world.intersectionWithShape(position, this.rotation, this.sphere, this.flags) === null;
  }

  segmentClear(from: THREE.Vector3, to: THREE.Vector3): boolean {
    if (!this.isClear(from) || !this.isClear(to)) return false;
    const direction = to.clone().sub(from), length = direction.length();
    if (length < 0.001) return true;
    direction.divideScalar(length);
    // Some roof surfaces have no physics collider. Check them along the route too.
    const samples = Math.ceil(length / 0.45);
    for (let i = 1; i < samples; i++) if (!this.isClear(from.clone().addScaledVector(direction, length * i / samples))) return false;
    const hit = this.physics.world.castShape(from, this.rotation, direction, this.sphere, 0, length + 0.04, true, this.flags);
    return !hit || hit.time_of_impact >= length;
  }

  private grid(): THREE.Vector3[] {
    if (this.nodes) return this.nodes;
    const nodes: THREE.Vector3[] = [];
    for (let x = this.bounds.min.x + 0.5; x < this.bounds.max.x - 0.5; x += 1.1) {
      for (let z = this.bounds.min.z + 0.5; z < this.bounds.max.z - 0.5; z += 1.1) {
        const point = new THREE.Vector3(x, this.eyeHeight, z);
        if (this.isClear(point)) nodes.push(point);
      }
    }
    this.nodes = nodes;
    return nodes;
  }

  plan(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    if (this.segmentClear(from, to)) return [from.clone(), to.clone()];
    if (!this.isClear(from) || !this.isClear(to)) return null;
    const grid = this.grid(), nodes = [...grid, from, to], start = grid.length, goal = start + 1;
    const open = new Set([start]), previous = new Map<number, number>();
    const score = new Map<number, number>([[start, 0]]), estimate = new Map<number, number>([[start, from.distanceTo(to)]]);
    const links = (point: THREE.Vector3) => grid.map((p, index) => ({ index, distance: p.distanceToSquared(point) }))
      .sort((a, b) => a.distance - b.distance).slice(0, 20).filter(n => this.segmentClear(point, grid[n.index])).map(n => n.index);
    const startLinks = links(from), goalLinks = new Set(links(to));
    if (!startLinks.length || !goalLinks.size) return null;
    while (open.size) {
      let current = -1, best = Infinity;
      for (const index of open) if ((estimate.get(index) ?? Infinity) < best) { current = index; best = estimate.get(index)!; }
      if (current === goal) {
        const path = [nodes[goal].clone()];
        while (previous.has(current)) { current = previous.get(current)!; path.unshift(nodes[current].clone()); }
        // Remove grid corners when a direct, swept-sphere route is available.
        for (let i = 0; i < path.length - 2; i++) {
          let end = path.length - 1;
          while (end > i + 1 && !this.segmentClear(path[i], path[end])) end--;
          path.splice(i + 1, end - i - 1);
        }
        return path;
      }
      open.delete(current);
      const neighbors = current === start ? startLinks : grid.map((p, index) => index)
        .filter(index => index !== current && nodes[current].distanceToSquared(nodes[index]) < 2.5);
      if (goalLinks.has(current)) neighbors.push(goal);
      for (const neighbor of neighbors) {
        const key = `${Math.min(current, neighbor)}:${Math.max(current, neighbor)}`;
        let clear = current === start || neighbor === goal;
        if (!clear) {
          clear = this.edgeCache.get(key) ?? this.segmentClear(nodes[current], nodes[neighbor]);
          this.edgeCache.set(key, clear);
        }
        if (!clear) continue;
        const cost = score.get(current)! + nodes[current].distanceTo(nodes[neighbor]);
        if (cost >= (score.get(neighbor) ?? Infinity)) continue;
        previous.set(neighbor, current); score.set(neighbor, cost);
        estimate.set(neighbor, cost + nodes[neighbor].distanceTo(to)); open.add(neighbor);
      }
    }
    return null;
  }

  curve(points: THREE.Vector3[]): THREE.Curve<THREE.Vector3> {
    if (points.length === 2) return new THREE.LineCurve3(points[0], points[1]);
    const smooth = new THREE.CatmullRomCurve3(points, false, "centripetal");
    smooth.arcLengthDivisions = 160;
    let previous = smooth.getPointAt(0);
    const samples = Math.max(80, Math.ceil(smooth.getLength() / 0.12));
    for (let i = 1; i <= samples; i++) {
      const point = smooth.getPointAt(i / samples);
      if (!this.segmentClear(previous, point)) {
        const linear = new THREE.CurvePath<THREE.Vector3>();
        for (let j = 1; j < points.length; j++) linear.add(new THREE.LineCurve3(points[j - 1], points[j]));
        return linear;
      }
      previous = point;
    }
    return smooth;
  }
}
