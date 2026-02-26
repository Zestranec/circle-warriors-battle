import { Rng } from './Rng';

export interface OutcomeParams {
  /** Positive = bias toward player weapon-hit, negative = bias away. */
  playerWeaponAssist: number;
  /** Extra damage player deals (can be negative). */
  playerDealBonusDamage: number;
  /** Extra damage player takes (can be positive or negative). */
  playerTakeDamageDelta: number;
  /** Speed multiplier for player. */
  playerSpeedMul: number;
  /** True if this round is "targeted" as a win for the player. */
  targetWin: boolean;
}

const WIN_PARAMS: OutcomeParams = {
  playerWeaponAssist: 0.05,
  playerDealBonusDamage: 1,
  playerTakeDamageDelta: -1,
  playerSpeedMul: 1.02,
  targetWin: true,
};

const LOSE_PARAMS: OutcomeParams = {
  playerWeaponAssist: -0.07,
  playerDealBonusDamage: -1,
  playerTakeDamageDelta: 2,
  playerSpeedMul: 0.98,
  targetWin: false,
};

const NEUTRAL_PARAMS: OutcomeParams = {
  playerWeaponAssist: 0,
  playerDealBonusDamage: 0,
  playerTakeDamageDelta: 0,
  playerSpeedMul: 1.0,
  targetWin: false,
};

export class OutcomeController {
  private winProbability: number = 0.8;

  setWinProbability(p: number): void {
    this.winProbability = Math.max(0, Math.min(1, p));
  }

  getWinProbability(): number {
    return this.winProbability;
  }

  /**
   * Sample outcome params for a new round using the provided RNG.
   */
  sampleParams(rng: Rng): OutcomeParams {
    const targetWin = rng.next() < this.winProbability;
    return targetWin ? { ...WIN_PARAMS } : { ...LOSE_PARAMS };
  }

  /** Neutral params (for headless simulation baseline). */
  static neutral(): OutcomeParams {
    return { ...NEUTRAL_PARAMS };
  }
}
