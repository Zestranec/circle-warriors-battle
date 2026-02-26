# Circle Warriors Battle

A gambling arcade physics game built with PixiJS, TypeScript, and Vite.

## Install & Run

```bash
cd circle-warriors-battle
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

```bash
npm run build
npm run preview
```

## Headless Simulation (RTP analysis)

```bash
npx ts-node --esm src/Simulation.ts
```

Or via:

```bash
npm run simulate
```

This runs 10,000 rounds per configuration and prints win rate, average profit, and observed RTP to the console.

---

## How to Play

1. **Select your warrior** — Red (Sword), Blue (Axe), Green (Knuckles), Yellow (Nunchucks)
2. **Select mode** — 1vs1, 1vs1vs1, or 1vs1vs1vs1
3. **Optional: Buy a booster** (costs 1 FUN as a side bet)
   - 🍔 **Burger** — heal +10 HP on pickup
   - 🥊 **Glove** — next attack deals +10 extra damage
   - 🛡 **Shield** — next incoming hit is negated
4. **Press START** (or Space) — 10 FUN bet is deducted immediately
5. Watch your warrior battle! Profit updates live as hits land.
6. **WIN** if your warrior is last standing → profit × 1.5
7. **LOSE** if your warrior dies → profit unchanged

## Game Mechanics

### Warriors
Each warrior has:
- A **body collider** (main circle)
- A **weapon hitbox** (smaller circle offset in velocity direction)

### Collision Damage
| Collision | Damage |
|---|---|
| Weapon → Body | 25 HP |
| Body ↔ Body   | 10 HP each |
| Weapon ↔ Weapon | 0 HP |

Damage cooldown: ~120ms per pair to prevent jitter.

### Economy
| Event | Profit change |
|---|---|
| Player deals weapon hit | +0.8 FUN |
| Player receives any damage | −1.0 FUN |
| Win | × 1.5 multiplier on final profit |

### RTP Controller
Use the **Win Probability** dropdown to adjust the subtle outcome bias:
- 10–30%: House-favored
- 50%: Balanced
- 70–90%: Player-favored

The controller never forces a win or loss — it only subtly nudges damage values, speed, and collision classification probabilities.

### RNG Seed
Enter a numeric or text seed to reproduce a specific sequence of outcomes. Leave blank for auto-generated seed (shown after round start).

---

## Architecture

```
src/
  main.ts              — PixiJS app init, resize, ticker
  Game.ts              — State machine, round flow, rendering
  Arena.ts             — Arena bounds, wall bounce
  Warrior.ts           — Warrior entity (HP, velocity, hitboxes)
  Physics.ts           — Movement integration, collision detection
  Combat.ts            — Collision classification, damage, cooldown
  Economy.ts           — Balance, profit, payout calculations
  Boosters.ts          — Booster types, spawn, pickup logic
  OutcomeController.ts — Win probability & subtle RTP nudges
  Rng.ts               — Mulberry32 seeded PRNG
  Simulation.ts        — Headless 10k-round RTP simulation
  Ui.ts                — DOM UI wiring and updates
```
