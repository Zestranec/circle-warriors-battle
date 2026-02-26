import { Warrior, WARRIOR_RADIUS } from './Warrior';
import { Arena } from './Arena';

const TWO_R = WARRIOR_RADIUS * 2;

export interface CollisionPair {
  a: Warrior;
  b: Warrior;
}

/** Move all warriors by their velocity (dt in seconds). */
export function integrateMotion(warriors: Warrior[], dt: number): void {
  for (const w of warriors) {
    if (!w.alive) continue;
    w.px += w.vx * dt;
    w.py += w.vy * dt;
    w.updateWeaponPos();
  }
}

/** Bounce warriors off arena walls. */
export function resolveWalls(warriors: Warrior[], arena: Arena): void {
  for (const w of warriors) {
    if (!w.alive) continue;
    const result = arena.bounceCircle(w.px, w.py, w.vx, w.vy, WARRIOR_RADIUS);
    w.px = result.px;
    w.py = result.py;
    w.vx = result.vx;
    w.vy = result.vy;
    w.normalise();
    w.updateWeaponPos();
  }
}

/**
 * Detect and resolve body-body overlaps between warriors.
 * Returns list of colliding pairs for Combat to process.
 */
export function resolveWarriorCollisions(warriors: Warrior[]): CollisionPair[] {
  const pairs: CollisionPair[] = [];
  const alive = warriors.filter(w => w.alive && !w.dying);

  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];

      const dx = b.px - a.px;
      const dy = b.py - a.py;
      const distSq = dx * dx + dy * dy;
      const minDist = TWO_R;

      if (distSq < minDist * minDist) {
        pairs.push({ a, b });

        // Separate the two circles
        const dist = Math.sqrt(distSq) || 0.001;
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        // Push them apart equally
        a.px -= nx * overlap * 0.5;
        a.py -= ny * overlap * 0.5;
        b.px += nx * overlap * 0.5;
        b.py += ny * overlap * 0.5;

        // Elastic-like bounce: exchange velocity components along collision normal
        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const dot = dvx * nx + dvy * ny;

        a.vx -= dot * nx;
        a.vy -= dot * ny;
        b.vx += dot * nx;
        b.vy += dot * ny;

        // Restore constant speed for both
        a.normalise();
        b.normalise();

        a.updateWeaponPos();
        b.updateWeaponPos();
      }
    }
  }
  return pairs;
}

/** Euclidean distance squared helper. */
export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Euclidean distance helper. */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distSq(ax, ay, bx, by));
}
