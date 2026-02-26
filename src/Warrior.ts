export type WarriorColor = 'red' | 'blue' | 'green' | 'yellow';
export type BoosterEffect = 'none' | 'glove' | 'shield';

export interface WarriorConfig {
  id: number;
  color: WarriorColor;
  isPlayer: boolean;
  px: number;
  py: number;
  vx: number;
  vy: number;
  speed: number;
}

export const WARRIOR_RADIUS = 22;
export const WEAPON_RADIUS  = 8;
export const WEAPON_OFFSET  = 0.8 * WARRIOR_RADIUS; // ~17.6 px from center

export const WARRIOR_COLORS: Record<WarriorColor, number> = {
  red:    0xe84040,
  blue:   0x4080e8,
  green:  0x40d060,
  yellow: 0xe8d040,
};

export const WARRIOR_LABELS: Record<WarriorColor, string> = {
  red:    '🗡️',
  blue:   '🪓',
  green:  '🥊',
  yellow: '🔪',
};

export class Warrior {
  id: number;
  color: WarriorColor;
  isPlayer: boolean;

  px: number;
  py: number;
  vx: number;
  vy: number;
  speed: number;

  hp: number = 100;
  alive: boolean = true;

  /**
   * Single source of truth for both visual rolling and weapon hitbox offset direction.
   * Advanced each physics step: rotationRad += (speed / R) * dt
   */
  rotationRad: number = 0;

  /** Weapon hitbox world position — derived from rotationRad, updated every step. */
  weaponX: number = 0;
  weaponY: number = 0;

  boosterEffect: BoosterEffect = 'none';
  healPulse: boolean = false;
  healPulseTimer: number = 0;

  alpha: number = 1;
  dying: boolean = false;

  constructor(cfg: WarriorConfig) {
    this.id       = cfg.id;
    this.color    = cfg.color;
    this.isPlayer = cfg.isPlayer;
    this.px       = cfg.px;
    this.py       = cfg.py;
    this.vx       = cfg.vx;
    this.vy       = cfg.vy;
    this.speed    = cfg.speed;
    // Seed each warrior with a different starting angle so they don't all
    // have weapons pointing the same direction at spawn.
    this.rotationRad = cfg.id * (Math.PI * 2 / 4);
  }

  /**
   * Recompute weapon hitbox world position from rotationRad.
   * Must be called whenever px/py or rotationRad changes.
   */
  updateWeaponPos(): void {
    this.weaponX = this.px + Math.cos(this.rotationRad) * WEAPON_OFFSET;
    this.weaponY = this.py + Math.sin(this.rotationRad) * WEAPON_OFFSET;
  }

  normalise(): void {
    const mag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (mag < 1e-6) return;
    this.vx = (this.vx / mag) * this.speed;
    this.vy = (this.vy / mag) * this.speed;
  }

  takeDamage(amount: number): void {
    if (!this.alive || this.dying) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = true;
    }
  }

  healHP(amount: number): void {
    this.hp = Math.min(100, this.hp + amount);
  }
}
