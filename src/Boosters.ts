import type { Warrior } from './Warrior';
import type { Arena } from './Arena';
import type { Rng } from './Rng';
import { distSq } from './Physics';
import { WARRIOR_RADIUS } from './Warrior';

export type BoosterType = 'burger' | 'glove' | 'shield';

export interface BoosterPickup {
  type: BoosterType;
  px: number;
  py: number;
  radius: number;
  active: boolean;
}

const PICKUP_RADIUS = 14;
const COLLECT_DIST = WARRIOR_RADIUS + PICKUP_RADIUS;

export function spawnBooster(type: BoosterType, arena: Arena, rng: Rng): BoosterPickup {
  const margin = PICKUP_RADIUS + 20;
  return {
    type,
    px: rng.float(arena.left + margin, arena.right - margin),
    py: rng.float(arena.top + margin, arena.bottom - margin),
    radius: PICKUP_RADIUS,
    active: true,
  };
}

/**
 * Check if player warrior overlaps the booster pickup.
 * If so, consume it and apply the effect.
 * Returns true if collected.
 */
export function checkPickup(
  player: Warrior,
  booster: BoosterPickup,
  onCollect: (b: BoosterPickup) => void
): boolean {
  if (!booster.active) return false;

  const d2 = distSq(player.px, player.py, booster.px, booster.py);
  if (d2 < COLLECT_DIST * COLLECT_DIST) {
    booster.active = false;
    onCollect(booster);
    return true;
  }
  return false;
}

/** Apply collected booster to player warrior. */
export function applyBooster(player: Warrior, booster: BoosterPickup): string {
  switch (booster.type) {
    case 'burger':
      player.healHP(10);
      player.healPulse = true;
      player.healPulseTimer = 600; // ms
      return '+10 HP';

    case 'glove':
      player.boosterEffect = 'glove';
      return 'GLOVE READY';

    case 'shield':
      player.boosterEffect = 'shield';
      return 'SHIELD READY';
  }
}
