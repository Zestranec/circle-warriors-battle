/** Mulberry32 seeded PRNG — fast, decent quality for game use. */
export class Rng {
  private state: number;

  constructor(seed?: number) {
    this.state = seed !== undefined ? seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
  }

  /** Returns float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  /** Returns integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns float in [min, max). */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Returns random angle in radians [0, 2π). */
  angle(): number {
    return this.next() * Math.PI * 2;
  }

  getSeed(): number {
    return this.state;
  }
}
