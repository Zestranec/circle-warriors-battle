import { Warrior, WARRIOR_RADIUS, WEAPON_RADIUS } from './Warrior';
import { CollisionPair, distSq } from './Physics';
import type { OutcomeParams } from './OutcomeController';

export type CollisionType = 'weapon_body' | 'body_body' | 'weapon_weapon' | 'none';

export interface DamageEvent {
  attacker: Warrior;
  victim: Warrior;
  type: CollisionType;
  damage: number;
}

const COOLDOWN_MS = 120;

const pairCooldowns = new Map<string, number>();

function pairKey(a: Warrior, b: Warrior): string {
  return `${Math.min(a.id, b.id)}_${Math.max(a.id, b.id)}`;
}

export function clearCooldowns(): void {
  pairCooldowns.clear();
}

/** Classification result: collision type + which warrior is the weapon-attacker. */
interface ClassifyResult {
  type: CollisionType;
  /** True = A's weapon hit B's body. False = B's weapon hit A's body. Only relevant for weapon_body. */
  attackerIsA: boolean;
}

/**
 * Classify the weapon interaction for a colliding pair.
 *
 * Key fix: bestOverlap starts at 0, not -Infinity.
 * This means body_body is the default when no weapon circle actually
 * overlaps the opposite body or weapon. Avoids misclassifying as
 * weapon_body based purely on "nearest weapon" when no real contact exists.
 */
function classifyCollision(
  a: Warrior,
  b: Warrior,
  params: OutcomeParams,
  rng: () => number
): ClassifyResult {
  const wR = WEAPON_RADIUS;
  const bR = WARRIOR_RADIUS;

  const overlapWaBodyB = (wR + bR) - Math.sqrt(distSq(a.weaponX, a.weaponY, b.px, b.py));
  const overlapWbBodyA = (wR + bR) - Math.sqrt(distSq(b.weaponX, b.weaponY, a.px, a.py));
  const overlapWaWb    = (wR + wR) - Math.sqrt(distSq(a.weaponX, a.weaponY, b.weaponX, b.weaponY));

  // Default: body_body. Only override when an overlap is POSITIVE (actual contact).
  let best: CollisionType = 'body_body';
  let bestOverlap = 0;          // ← was -Infinity; fixed to prevent spurious weapon hits
  let attackerIsA = true;

  if (overlapWaBodyB > bestOverlap) {
    bestOverlap = overlapWaBodyB;
    best = 'weapon_body';
    attackerIsA = true;           // A's weapon → B's body
  }
  if (overlapWbBodyA > bestOverlap) {
    bestOverlap = overlapWbBodyA;
    best = 'weapon_body';
    attackerIsA = false;          // B's weapon → A's body
  }
  if (overlapWaWb > bestOverlap) {
    best = 'weapon_weapon';
    attackerIsA = true;           // doesn't matter for weapon_weapon
  }

  // Subtle bias nudge for player-involved collisions
  const involvePlayer = a.isPlayer || b.isPlayer;
  if (involvePlayer && best !== 'weapon_weapon') {
    const assist = params.playerWeaponAssist;
    if (rng() < Math.abs(assist)) {
      if (assist > 0) {
        // Nudge toward player being the weapon-attacker
        if (a.isPlayer && overlapWaBodyB > 0) return { type: 'weapon_body', attackerIsA: true };
        if (b.isPlayer && overlapWbBodyA > 0) return { type: 'weapon_body', attackerIsA: false };
      } else {
        // Nudge away from weapon hits (more body_body for player)
        return { type: 'body_body', attackerIsA: true };
      }
    }
  }

  return { type: best, attackerIsA };
}

export function processCollision(
  pair: CollisionPair,
  now: number,
  params: OutcomeParams,
  rng: () => number
): DamageEvent[] {
  const { a, b } = pair;
  const key = pairKey(a, b);

  const last = pairCooldowns.get(key) ?? 0;
  if (now - last < COOLDOWN_MS) return [];
  pairCooldowns.set(key, now);

  const { type, attackerIsA } = classifyCollision(a, b, params, rng);
  if (type === 'none' || type === 'weapon_weapon') return [];

  const events: DamageEvent[] = [];

  if (type === 'weapon_body') {
    // Correctly assign attacker/victim based on which weapon actually hit which body
    const attacker = attackerIsA ? a : b;
    const victim   = attackerIsA ? b : a;

    let dmg = Math.max(1, Math.min(40, 25 + params.playerDealBonusDamage * (attacker.isPlayer ? 1 : 0)));
    if (victim.isPlayer) {
      dmg = Math.max(1, dmg + params.playerTakeDamageDelta);
    }
    events.push({ attacker, victim, type, damage: dmg });

  } else if (type === 'body_body') {
    const dmg = Math.round(Math.max(1, Math.min(25, 10 + params.playerTakeDamageDelta * 0.5)));
    events.push({ attacker: a, victim: b, type, damage: dmg });
    events.push({ attacker: b, victim: a, type, damage: dmg });
  }

  return events;
}

/**
 * Apply damage events to warriors, honouring booster effects.
 * Shield negates the next hit to player then expires.
 * Glove adds +10 to the next player weapon hit then expires.
 */
export function applyDamageEvents(events: DamageEvent[]): DamageEvent[] {
  const applied: DamageEvent[] = [];

  for (const ev of events) {
    let dmg = ev.damage;

    // Shield: negate next incoming damage to player
    if (ev.victim.isPlayer && ev.victim.boosterEffect === 'shield') {
      ev.victim.boosterEffect = 'none';
      continue;
    }

    // Glove: +10 on next player weapon hit
    if (ev.attacker.isPlayer && ev.attacker.boosterEffect === 'glove' && ev.type === 'weapon_body') {
      dmg += 10;
      ev.attacker.boosterEffect = 'none';
    }

    ev.victim.takeDamage(dmg);
    applied.push({ ...ev, damage: dmg });
  }

  return applied;
}
