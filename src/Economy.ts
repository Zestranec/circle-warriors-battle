import type { DamageEvent } from './Combat';

export const BET_AMOUNT     = 10;
export const BOOSTER_COST   = 1;
export const WEAPON_REWARD  = 1.0;   // was 0.8
export const DAMAGE_PENALTY = 0.8;   // was 1.0
export const WIN_MULTIPLIER = 1.5;
export const WIN_BONUS_NET  = BET_AMOUNT * 0.5; // +5 FUN guaranteed on any win

export class Economy {
  balance: number;
  roundProfit: number = 0;
  finalProfit: number = 0;

  constructor(initialBalance = 1000) {
    this.balance = initialBalance;
  }

  canAffordRound(hasBooster: boolean): boolean {
    const cost = BET_AMOUNT + (hasBooster ? BOOSTER_COST : 0);
    return this.balance >= cost;
  }

  startRound(hasBooster: boolean): void {
    const cost = BET_AMOUNT + (hasBooster ? BOOSTER_COST : 0);
    this.balance -= cost;
    this.roundProfit = 0;
    this.finalProfit = 0;
  }

  processDamageEvent(ev: DamageEvent): void {
    if (ev.attacker.isPlayer && ev.type === 'weapon_body') {
      this.roundProfit += WEAPON_REWARD;
    }
    if (ev.victim.isPlayer) {
      this.roundProfit -= DAMAGE_PENALTY;
    }
  }

  finaliseRound(win: boolean): void {
    // Apply multiplier only to positive in-round profit
    const profitPart = (win && this.roundProfit > 0)
      ? this.roundProfit * WIN_MULTIPLIER
      : this.roundProfit;

    // Guaranteed win bonus ensures finalProfit is positive on a win
    this.finalProfit = win ? profitPart + WIN_BONUS_NET : profitPart;

    this.balance += this.finalProfit;
    if (this.balance < 0) this.balance = 0;
  }
}
