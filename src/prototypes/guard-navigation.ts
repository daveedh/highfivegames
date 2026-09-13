export type Point = { x: number; z: number };
export type Obstacle = { minX: number; maxX: number; minZ: number; maxZ: number };

export const wrapAngle = (angle: number): number => ((angle + 180) % 360 + 360) % 360 - 180;

function intersects(from: Point, to: Point, box: Obstacle): boolean {
  let enter = 0;
  let leave = 1;
  for (const [origin, delta, min, max] of [
    [from.x, to.x - from.x, box.minX, box.maxX],
    [from.z, to.z - from.z, box.minZ, box.maxZ]
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
    } else {
      const first = (min - origin) / delta;
      const last = (max - origin) / delta;
      enter = Math.max(enter, Math.min(first, last));
      leave = Math.min(leave, Math.max(first, last));
      if (enter > leave) return false;
    }
  }
  return true;
}

/** Static scenery expanded by the guard's radius, so routes clear corners with the whole body. */
export class GuardNavigation {
  private readonly obstacles: Obstacle[];
  private readonly width: number;
  private readonly depth: number;
  private readonly cell = 0.75;
  private readonly columns: number;
  private readonly rows: number;
  private readonly blocked: boolean[];

  constructor(width: number, depth: number, obstacles: Obstacle[], radius = 0.55) {
    this.width = width;
    this.depth = depth;
    this.columns = Math.ceil(width / this.cell);
    this.rows = Math.ceil(depth / this.cell);
    this.obstacles = obstacles.map(box => ({
      minX: box.minX - radius, maxX: box.maxX + radius,
      minZ: box.minZ - radius, maxZ: box.maxZ + radius
    }));
    this.blocked = Array.from({ length: this.columns * this.rows }, (_, index) => {
      const point = this.point(index);
      return !this.clear(point, point);
    });
  }

  clear(from: Point, to: Point): boolean {
    for (const point of [from, to]) {
      if (Math.abs(point.x) >= this.width / 2 || Math.abs(point.z) >= this.depth / 2) return false;
    }
    return !this.obstacles.some(box => intersects(from, to, box));
  }

  private point(index: number): Point {
    return {
      x: -this.width / 2 + (index % this.columns + 0.5) * this.cell,
      z: -this.depth / 2 + (Math.floor(index / this.columns) + 0.5) * this.cell
    };
  }

  private nearest(point: Point, requireClear: boolean): number {
    const column = Math.floor((point.x + this.width / 2) / this.cell);
    const row = Math.floor((point.z + this.depth / 2) / this.cell);
    let best = -1;
    let distance = Infinity;
    for (let z = row - 2; z <= row + 2; z++) {
      for (let x = column - 2; x <= column + 2; x++) {
        if (x < 0 || z < 0 || x >= this.columns || z >= this.rows) continue;
        const index = z * this.columns + x;
        if (this.blocked[index]) continue;
        const candidate = this.point(index);
        const d = Math.hypot(candidate.x - point.x, candidate.z - point.z);
        if (d >= distance || (requireClear && !this.clear(point, candidate))) continue;
        distance = d;
        best = index;
      }
    }
    return best;
  }

  route(from: Point, to: Point): Point[] | null {
    if (this.clear(from, to)) return [{ x: to.x, z: to.z }];
    const start = this.nearest(from, true);
    const goal = this.nearest(to, false);
    if (start < 0 || goal < 0) return null;
    const open = new Set([start]);
    const cost = new Float64Array(this.blocked.length).fill(Infinity);
    const estimate = new Float64Array(this.blocked.length).fill(Infinity);
    const previous = new Int32Array(this.blocked.length).fill(-1);
    const goalPoint = this.point(goal);
    const heuristic = (point: Point) => Math.hypot(point.x - goalPoint.x, point.z - goalPoint.z);
    cost[start] = 0;
    estimate[start] = heuristic(this.point(start));
    while (open.size) {
      let current = -1;
      let lowest = Infinity;
      for (const index of open) {
        if (estimate[index] < lowest) { current = index; lowest = estimate[index]; }
      }
      if (current === goal) {
        const path: Point[] = [];
        for (let index = goal; index !== -1; index = previous[index]) path.unshift(this.point(index));
        if (this.clear(goalPoint, to)) path.push({ x: to.x, z: to.z });
        const smooth: Point[] = [];
        let anchor = from;
        for (let next = 0; next < path.length;) {
          let end = path.length - 1;
          while (end > next && !this.clear(anchor, path[end])) end--;
          smooth.push(path[end]);
          anchor = path[end];
          next = end + 1;
        }
        return smooth;
      }
      open.delete(current);
      const point = this.point(current);
      const column = current % this.columns;
      const row = Math.floor(current / this.columns);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || column + dx < 0 || column + dx >= this.columns ||
            row + dz < 0 || row + dz >= this.rows) continue;
          const next = (row + dz) * this.columns + column + dx;
          if (this.blocked[next]) continue;
          const nextPoint = this.point(next);
          if (!this.clear(point, nextPoint)) continue;
          const candidate = cost[current] + Math.hypot(dx, dz) * this.cell;
          if (candidate >= cost[next]) continue;
          cost[next] = candidate;
          previous[next] = current;
          estimate[next] = candidate + heuristic(nextPoint);
          open.add(next);
        }
      }
    }
    return null;
  }
}
