/**
 * Headless simulation — run with: npx ts-node --esm src/Simulation.ts
 * (or via the simulate npm script)
 *
 * Simulates 10,000 rounds without any rendering and reports:
 *  - observed win rate
 *  - average finalProfit per round
 *  - RTP = total returned / total wagered
 */

import { Rng } from './Rng.js';
import { Warrior, WARRIOR_RADIUS, WEAPON_RADIUS, WEAPON_OFFSET, WarriorColor } from './Warrior.js';
import { Arena } from './Arena.js';
import { integrateMotion, resolveWalls, resolveWarriorCollisions } from './Physics.js';
import { processCollision, applyDamageEvents, clearCooldowns } from './Combat.js';
import { Economy, BET_AMOUNT, BOOSTER_COST } from './Economy.js';
import { OutcomeController } from './OutcomeController.js';

const WARRIOR_COLORS_LIST: WarriorColor[] = ['red', 'blue', 'green', 'yellow'];
const WARRIOR_SPEED = 120;
const FIXED_DT = 1 / 60;
const MAX_TICKS = 60 * 120; // 2 minutes max per round
const ARENA_SIZE = 500;
const arena = new Arena(0, 0, ARENA_SIZE);

function runOneRound(
  mode: number,
  winProb: number,
  hasBooster: boolean,
  seed: number,
): { win: boolean; finalProfit: number; totalWagered: number } {
  const rng = new Rng(seed);
  const ctrl = new OutcomeController();
  ctrl.setWinProbability(winProb);
  const params = ctrl.sampleParams(rng);

  const economy = new Economy(10000); // large balance so we never block
  economy.startRound(hasBooster);
  clearCooldowns();

  const count = mode;
  const colors = [...WARRIOR_COLORS_LIST];

  const positions: { x: number; y: number }[] = [];
  const margin = WARRIOR_RADIUS + 20;
  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, attempts = 0;
    do {
      x = rng.float(margin, ARENA_SIZE - margin);
      y = rng.float(margin, ARENA_SIZE - margin);
      attempts++;
    } while (
      attempts < 500 &&
      positions.some(p => Math.hypot(p.x - x, p.y - y) < WARRIOR_RADIUS * 2.5)
    );
    positions.push({ x, y });
  }

  const warriors: Warrior[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng.angle();
    const speed = i === 0 ? WARRIOR_SPEED * params.playerSpeedMul : WARRIOR_SPEED;
    const w = new Warrior({
      id: i,
      color: colors[i],
      isPlayer: i === 0,
      px: positions[i].x,
      py: positions[i].y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
    });
    w.updateWeaponPos();
    warriors.push(w);
  }

  // Fake monotonic time for cooldowns
  let simTime = 0;
  let tick = 0;

  while (tick < MAX_TICKS) {
    tick++;
    simTime += FIXED_DT * 1000; // ms

    const alive = warriors.filter(w => w.alive && !w.dying);
    integrateMotion(alive, FIXED_DT);
    resolveWalls(alive, arena);
    const pairs = resolveWarriorCollisions(alive);

    for (const pair of pairs) {
      const raw = processCollision(pair, simTime, params, () => rng.next());
      const applied = applyDamageEvents(raw);
      for (const ev of applied) {
        economy.processDamageEvent(ev);
      }
    }

    // Process dying
    for (const w of warriors) {
      if (w.dying && w.alive) {
        w.alpha -= FIXED_DT * 3;
        if (w.alpha <= 0) {
          w.alpha = 0;
          w.alive = false;
        }
      }
    }

    const player = warriors[0];
    const playerAlive = player.alive && !player.dying;
    const aliveNonDying = warriors.filter(w => w.alive && !w.dying);

    if (!playerAlive || aliveNonDying.length === 1) {
      const win = playerAlive && aliveNonDying.length === 1;
      economy.finaliseRound(win);
      const wagered = BET_AMOUNT + (hasBooster ? BOOSTER_COST : 0);
      return { win, finalProfit: economy.finalProfit, totalWagered: wagered };
    }
  }

  // Timeout: treat as lose
  economy.finaliseRound(false);
  const wagered = BET_AMOUNT + (hasBooster ? BOOSTER_COST : 0);
  return { win: false, finalProfit: economy.finalProfit, totalWagered: wagered };
}

function simulate(rounds = 10_000, winProb = 0.5, mode = 2, hasBooster = false): void {
  console.log(`\n=== Circle Warriors Simulation ===`);
  console.log(`Rounds: ${rounds} | Mode: 1vs${mode - 1} | WinProb: ${(winProb * 100).toFixed(0)}% | Booster: ${hasBooster}`);
  console.log('----------------------------------');

  let wins = 0;
  let totalProfit = 0;
  let totalWagered = 0;
  let totalReturned = 0;

  for (let i = 0; i < rounds; i++) {
    const seed = (i * 2654435761) >>> 0;
    const result = runOneRound(mode, winProb, hasBooster, seed);
    if (result.win) wins++;
    totalProfit += result.finalProfit;
    totalWagered += result.totalWagered;
    totalReturned += result.totalWagered + result.finalProfit;
  }

  const winRate = wins / rounds;
  const avgProfit = totalProfit / rounds;
  const rtp = totalWagered > 0 ? totalReturned / totalWagered : 0;

  console.log(`Win Rate:     ${(winRate * 100).toFixed(2)}%  (target: ${(winProb * 100).toFixed(0)}%)`);
  console.log(`Avg Profit:   ${avgProfit.toFixed(3)} FUN per round`);
  console.log(`Total Wagered: ${totalWagered.toFixed(0)} FUN`);
  console.log(`Total Returned:${totalReturned.toFixed(0)} FUN`);
  console.log(`RTP:          ${(rtp * 100).toFixed(2)}%  (target: ~95%)`);
  console.log('==================================\n');
}

// Run several configurations
simulate(10_000, 0.5, 2, false);
simulate(10_000, 0.5, 4, false);
simulate(10_000, 0.7, 2, true);
simulate(10_000, 0.3, 2, false);
