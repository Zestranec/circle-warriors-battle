export interface ArenaBounds {
  x: number;
  y: number;
  size: number;
}

export class Arena {
  readonly x: number;
  readonly y: number;
  readonly size: number;

  constructor(x: number, y: number, size: number) {
    this.x = x;
    this.y = y;
    this.size = size;
  }

  get left(): number  { return this.x; }
  get right(): number { return this.x + this.size; }
  get top(): number   { return this.y; }
  get bottom(): number{ return this.y + this.size; }
  get cx(): number    { return this.x + this.size / 2; }
  get cy(): number    { return this.y + this.size / 2; }

  /**
   * Bounce a circle off arena walls.
   * Modifies px, py, vx, vy in-place via returned object.
   */
  bounceCircle(
    px: number, py: number, vx: number, vy: number, radius: number
  ): { px: number; py: number; vx: number; vy: number } {
    let newVx = vx;
    let newVy = vy;
    let newPx = px;
    let newPy = py;

    if (newPx - radius < this.left) {
      newPx = this.left + radius;
      newVx = Math.abs(newVx);
    } else if (newPx + radius > this.right) {
      newPx = this.right - radius;
      newVx = -Math.abs(newVx);
    }

    if (newPy - radius < this.top) {
      newPy = this.top + radius;
      newVy = Math.abs(newVy);
    } else if (newPy + radius > this.bottom) {
      newPy = this.bottom - radius;
      newVy = -Math.abs(newVy);
    }

    return { px: newPx, py: newPy, vx: newVx, vy: newVy };
  }

  /** Clamp a point inside the arena with optional margin. */
  clamp(px: number, py: number, margin = 0): { x: number; y: number } {
    return {
      x: Math.max(this.left + margin, Math.min(this.right - margin, px)),
      y: Math.max(this.top + margin, Math.min(this.bottom - margin, py)),
    };
  }
}
