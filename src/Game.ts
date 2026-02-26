import * as PIXI from 'pixi.js';
import { Arena } from './Arena';
import {
  Warrior, WarriorColor, WARRIOR_RADIUS, WEAPON_RADIUS,
  WARRIOR_COLORS, WARRIOR_LABELS, WEAPON_OFFSET,
} from './Warrior';
import {
  integrateMotion, resolveWalls, resolveWarriorCollisions,
} from './Physics';
import {
  processCollision, applyDamageEvents, clearCooldowns,
} from './Combat';
import { Economy, BET_AMOUNT, BOOSTER_COST } from './Economy';
import {
  BoosterPickup, BoosterType, spawnBooster, checkPickup, applyBooster,
} from './Boosters';
import { Rng } from './Rng';
import { OutcomeController, OutcomeParams } from './OutcomeController';
import { Ui } from './Ui';

type GameState = 'ready' | 'running' | 'win' | 'lose';

const WARRIOR_COLORS_LIST: WarriorColor[] = ['red', 'blue', 'green', 'yellow'];
// ≈3× original baseline (252 × 1.5 = 378)
const WARRIOR_SPEED = 378; // px/s
const FIXED_DT = 1 / 60;

const ARENA_SIZE = 500;

interface HitFlash {
  warrior: Warrior;
  timer: number;
}

interface FloatingText {
  text: PIXI.Text;
  vy: number;
  life: number;
}

export class Game {
  private app: PIXI.Application;
  private arena: Arena;
  private stage!: PIXI.Container;
  private arenaGfx!: PIXI.Graphics;
  private warriorLayer!: PIXI.Container;
  private boosterLayer!: PIXI.Container;
  private effectLayer!: PIXI.Container;

  private warriors: Warrior[] = [];
  private boosterPickup: BoosterPickup | null = null;
  private economy: Economy;
  private rng!: Rng;
  private outcomeCtrl: OutcomeController;
  private outcomeParams!: OutcomeParams;
  private ui: Ui;

  private state: GameState = 'ready';
  private accumulator = 0;
  private speedupActive = false;

  private hitFlashes: HitFlash[] = [];
  private floatingTexts: FloatingText[] = [];

  /**
   * Rotating container per warrior — holds bodyGfx, positioned at w.px/w.py.
   * container.rotation is set to w.rotationRad each frame (single source of truth).
   */
  private warriorContainerMap = new Map<number, PIXI.Container>();
  /** Body graphics drawn at local (0,0) inside the rotating container. */
  private warriorBodyGfxMap   = new Map<number, PIXI.Graphics>();
  /** HP-bar graphics at world coords (NOT inside rotating container). */
  private warriorHpGfxMap     = new Map<number, PIXI.Graphics>();
  private hpTextMap            = new Map<number, PIXI.Text>();
  /** Weapon emoji Text objects — world coords, position follows w.weaponX/Y. */
  private weaponIconMap        = new Map<number, PIXI.Text>();

  private boosterGfx: PIXI.Graphics | null = null;
  private boosterLabel: PIXI.Text | null = null;

  private selectedWarriorIdx = 0;
  private selectedMode = 4;
  private selectedBoosterType: BoosterType | 'none' = 'none';
  private seedOverride: string = '';

  private boostersBought: Record<BoosterType, number> = { burger: 0, glove: 0, shield: 0 };

  constructor(app: PIXI.Application) {
    this.app = app;
    this.economy = new Economy(1000);
    this.outcomeCtrl = new OutcomeController();
    this.ui = new Ui();

    const offsetX = (app.screen.width  - ARENA_SIZE) / 2;
    const offsetY = (app.screen.height - ARENA_SIZE) / 2;
    this.arena = new Arena(offsetX, offsetY, ARENA_SIZE);

    this.buildStage();
    this.setupUi();
    this.syncUi();
  }

  private buildStage(): void {
    this.stage = this.app.stage;

    this.arenaGfx = new PIXI.Graphics();
    this.stage.addChild(this.arenaGfx);

    this.boosterLayer = new PIXI.Container();
    this.stage.addChild(this.boosterLayer);

    this.warriorLayer = new PIXI.Container();
    this.stage.addChild(this.warriorLayer);

    this.effectLayer = new PIXI.Container();
    this.stage.addChild(this.effectLayer);

    this.drawArena();
  }

  private drawArena(): void {
    const g = this.arenaGfx;
    g.clear();
    g.rect(this.arena.x, this.arena.y, this.arena.size, this.arena.size);
    g.fill({ color: 0x0d0d1a });
    g.rect(this.arena.x, this.arena.y, this.arena.size, this.arena.size);
    g.stroke({ color: 0x4444aa, width: 3 });
    const c = 14;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([cx, cy]) => {
      const bx = this.arena.x + cx! * this.arena.size;
      const by = this.arena.y + cy! * this.arena.size;
      const sx = cx === 0 ? 1 : -1;
      const sy = cy === 0 ? 1 : -1;
      g.moveTo(bx, by + sy * c);
      g.lineTo(bx, by);
      g.lineTo(bx + sx * c, by);
      g.stroke({ color: 0x8888ff, width: 2 });
    });
  }

  private setupUi(): void {
    this.ui.init({
      onWarriorSelect:      (idx)  => { this.selectedWarriorIdx = idx; },
      onModeSelect:         (mode) => { this.selectedMode = mode; },
      onBoosterSelect:      (b)    => { this.selectedBoosterType = b; },
      onWinProbChange:      (p)    => { this.outcomeCtrl.setWinProbability(p); },
      onSeedChange:         (s)    => { this.seedOverride = s; },
      onSpeedupToggle:      ()     => { this.toggleSpeedup(); },
      onMidRoundBoosterBuy: (b)    => { this.buyBoosterMidRound(b); },
      onStart: () => {
        if (this.state === 'ready') this.startRound();
        else if (this.state === 'win' || this.state === 'lose') this.resetToReady();
      },
    });
  }

  private syncUi(): void {
    this.ui.updateBalance(this.economy.balance);
    this.ui.updateProfit(0);
    this.ui.setStatus('ready');
    this.ui.hideFinalProfit();
    this.ui.setStartButtonLabel('▶ START ROUND (10 FUN)', false);
    this.ui.setRunningMode(false, this.economy.balance, false);
  }

  startRound(): void {
    const hasBooster = this.selectedBoosterType !== 'none';
    if (!this.economy.canAffordRound(hasBooster)) return;

    const seed = this.seedOverride !== ''
      ? parseInt(this.seedOverride) || (this.seedOverride.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0))
      : undefined;
    this.rng = new Rng(seed);
    this.ui.setSeed(String(this.rng.getSeed()));

    this.outcomeParams = this.outcomeCtrl.sampleParams(this.rng);
    this.economy.startRound(hasBooster);
    clearCooldowns();

    this.boostersBought = { burger: 0, glove: 0, shield: 0 };
    if (hasBooster) this.boostersBought[this.selectedBoosterType as BoosterType]++;

    this.spawnWarriors();
    this.spawnBoosterPickup(this.selectedBoosterType);

    this.speedupActive = false;
    this.state = 'running';
    this.ui.setStatus('running');
    this.ui.setControlsEnabled(false);
    this.ui.setStartButtonLabel('Running...', true);
    this.ui.updateBalance(this.economy.balance);
    this.ui.updateProfit(0);
    this.ui.hideFinalProfit();
    this.ui.setRunningMode(true, this.economy.balance, !!this.boosterPickup?.active);
    this.ui.updateBoostersBought(this.boostersBought);
    this.ui.setSpeedupActive(false);
  }

  private spawnWarriors(): void {
    this.warriorLayer.removeChildren();
    this.warriorContainerMap.clear();
    this.warriorBodyGfxMap.clear();
    this.warriorHpGfxMap.clear();
    this.hpTextMap.clear();
    this.weaponIconMap.clear();
    this.warriors = [];
    this.hitFlashes = [];

    const count = this.selectedMode;
    const colors = WARRIOR_COLORS_LIST.slice();
    const playerColor = WARRIOR_COLORS_LIST[this.selectedWarriorIdx];
    colors.splice(colors.indexOf(playerColor), 1);
    colors.unshift(playerColor);

    const positions: { x: number; y: number }[] = [];
    const margin = WARRIOR_RADIUS + 20;
    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, attempts = 0;
      do {
        x = this.rng.float(this.arena.left + margin, this.arena.right - margin);
        y = this.rng.float(this.arena.top  + margin, this.arena.bottom - margin);
        attempts++;
      } while (
        attempts < 1000 &&
        positions.some(p => Math.hypot(p.x - x, p.y - y) < WARRIOR_RADIUS * 2.5)
      );
      positions.push({ x, y });
    }

    for (let i = 0; i < count; i++) {
      const angle = this.rng.angle();
      const isPlayer = i === 0;
      const speed = isPlayer
        ? WARRIOR_SPEED * this.outcomeParams.playerSpeedMul
        : WARRIOR_SPEED;

      const w = new Warrior({
        id: i, color: colors[i], isPlayer,
        px: positions[i].x, py: positions[i].y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        speed,
      });
      w.updateWeaponPos();
      this.warriors.push(w);
      this.buildWarriorGfx(w);
    }
  }

  private buildWarriorGfx(w: Warrior): void {
    // Rotating container — positioned at warrior center, spun each step
    const container = new PIXI.Container();
    this.warriorLayer.addChild(container);
    this.warriorContainerMap.set(w.id, container);

    // Body graphics drawn at local (0, 0) so rotation is around warrior center
    const bodyGfx = new PIXI.Graphics();
    container.addChild(bodyGfx);
    this.warriorBodyGfxMap.set(w.id, bodyGfx);

    // HP bar graphics — NOT inside container so it never rotates
    const hpGfx = new PIXI.Graphics();
    this.warriorLayer.addChild(hpGfx);
    this.warriorHpGfxMap.set(w.id, hpGfx);

    const hpText = new PIXI.Text({
      text: '100',
      style: {
        fontSize: 11,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
        align: 'center',
      },
    });
    hpText.anchor.set(0.5, 1);
    this.warriorLayer.addChild(hpText);
    this.hpTextMap.set(w.id, hpText);

    // Weapon emoji — world coords, repositioned every frame to follow velocity direction
    // fontSize 49 ≈ 3.5× original 14px (halved from previous 98px)
    const weaponIcon = new PIXI.Text({
      text: WARRIOR_LABELS[w.color],
      style: { fontSize: 49 },
    });
    weaponIcon.anchor.set(0.5, 0.5);
    this.warriorLayer.addChild(weaponIcon);
    this.weaponIconMap.set(w.id, weaponIcon);
  }

  private spawnBoosterPickup(type: BoosterType | 'none'): void {
    if (type === 'none') return;
    this.boosterPickup = spawnBooster(type, this.arena, this.rng);
    this.ensureBoosterGfx(type);
  }

  private ensureBoosterGfx(type: BoosterType): void {
    const icons: Record<BoosterType, string> = { burger: '🍔', glove: '🥊', shield: '🛡️' };
    if (!this.boosterGfx) {
      this.boosterGfx = new PIXI.Graphics();
      this.boosterLayer.addChild(this.boosterGfx);
    }
    if (!this.boosterLabel) {
      this.boosterLabel = new PIXI.Text({ text: icons[type], style: { fontSize: 16 } });
      this.boosterLabel.anchor.set(0.5, 0.5);
      this.boosterLayer.addChild(this.boosterLabel);
    } else {
      this.boosterLabel.text = icons[type];
      this.boosterLabel.visible = true;
    }
  }

  buyBoosterMidRound(type: BoosterType): void {
    if (this.state !== 'running') return;
    if (this.economy.balance < BOOSTER_COST) return;
    if (this.boosterPickup?.active) return;

    this.economy.balance -= BOOSTER_COST;
    this.boosterPickup = spawnBooster(type, this.arena, this.rng);
    this.ensureBoosterGfx(type);
    this.boostersBought[type]++;

    this.ui.updateBalance(this.economy.balance);
    this.ui.updateBoostersBought(this.boostersBought);
    this.ui.setRunningMode(true, this.economy.balance, true);
  }

  private toggleSpeedup(): void {
    this.speedupActive = !this.speedupActive;
    this.ui.setSpeedupActive(this.speedupActive);
  }

  update(deltaMS: number): void {
    if (this.state !== 'running') return;

    const simDelta = this.speedupActive ? deltaMS * 2 : deltaMS;
    this.accumulator += simDelta / 1000;

    const MAX_STEPS = this.speedupActive ? 10 : 5;
    let steps = 0;

    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      this.physicsStep(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }

    this.updateEffects(deltaMS);
    this.renderFrame();
    this.checkRoundEnd();
  }

  private physicsStep(dt: number): void {
    const alive = this.warriors.filter(w => w.alive && !w.dying);

    // Advance rotation BEFORE motion so integrateMotion→updateWeaponPos uses the new angle.
    // w.rotationRad is the single source of truth for both visuals and hitbox position.
    for (const w of alive) {
      w.rotationRad += (w.speed / WARRIOR_RADIUS) * dt;
    }

    integrateMotion(alive, dt);
    resolveWalls(alive, this.arena);
    const pairs = resolveWarriorCollisions(alive);

    const now = performance.now();
    for (const pair of pairs) {
      const rawEvents = processCollision(pair, now, this.outcomeParams, () => this.rng.next());
      const applied   = applyDamageEvents(rawEvents);
      for (const ev of applied) {
        this.economy.processDamageEvent(ev);
        this.hitFlashes.push({ warrior: ev.victim, timer: 200 });
        this.ui.updateProfit(this.economy.roundProfit);
      }
    }

    const player = this.warriors.find(w => w.isPlayer && w.alive);
    if (player && this.boosterPickup?.active) {
      checkPickup(player, this.boosterPickup, (b) => {
        const msg = applyBooster(player, b);
        this.spawnFloatingText(player.px, player.py - WARRIOR_RADIUS - 10, msg, 0xffff44);
        this.ui.updateProfit(this.economy.roundProfit);
        this.ui.setRunningMode(true, this.economy.balance, false);
      });
    }

    for (const w of this.warriors) {
      if (w.dying && w.alive) {
        w.alpha -= dt * 3;
        if (w.alpha <= 0) { w.alpha = 0; w.alive = false; }
      }
      if (w.healPulse) {
        w.healPulseTimer -= dt * 1000;
        if (w.healPulseTimer <= 0) w.healPulse = false;
      }
    }

  }

  private updateEffects(deltaMS: number): void {
    this.hitFlashes = this.hitFlashes.filter(hf => { hf.timer -= deltaMS; return hf.timer > 0; });

    for (const ft of this.floatingTexts) {
      ft.text.y += ft.vy * (deltaMS / 1000);
      ft.life -= deltaMS;
      ft.text.alpha = Math.max(0, ft.life / 700);
    }
    this.floatingTexts = this.floatingTexts.filter(ft => {
      if (ft.life <= 0) { this.effectLayer.removeChild(ft.text); return false; }
      return true;
    });
  }

  private renderFrame(): void {
    const now = performance.now();

    for (const w of this.warriors) {
      const container = this.warriorContainerMap.get(w.id);
      const bodyGfx   = this.warriorBodyGfxMap.get(w.id);
      const hpGfx     = this.warriorHpGfxMap.get(w.id);
      const hpText    = this.hpTextMap.get(w.id);
      const iconText  = this.weaponIconMap.get(w.id);
      if (!container || !bodyGfx || !hpGfx || !hpText || !iconText) continue;

      if (!w.alive && w.alpha <= 0) {
        container.visible = false;
        hpGfx.visible    = false;
        hpText.visible   = false;
        iconText.visible = false;
        continue;
      }

      // --- Rotating body container ---
      container.x        = w.px;
      container.y        = w.py;
      container.alpha    = w.alpha;
      container.rotation = w.rotationRad;
      container.visible  = true;

      hpGfx.alpha    = w.alpha;
      hpText.alpha   = w.alpha;
      iconText.alpha = w.alpha;
      hpGfx.visible  = true;
      hpText.visible = true;

      const color     = WARRIOR_COLORS[w.color];
      const isFlashing = this.hitFlashes.some(hf => hf.warrior === w && hf.timer > 0);

      // Body drawn at local (0,0) — container handles world placement + rotation
      bodyGfx.clear();

      bodyGfx.circle(0, 0, WARRIOR_RADIUS);
      bodyGfx.fill({ color: isFlashing ? 0xffffff : color });
      bodyGfx.circle(0, 0, WARRIOR_RADIUS);
      bodyGfx.stroke({ color: 0xffffff, width: 1.5, alpha: 0.4 });

      // Roll mark: a stripe from center toward the "top" of the circle,
      // plus a small dot near the edge. These spin with the container.
      bodyGfx.moveTo(0, 0);
      bodyGfx.lineTo(0, -(WARRIOR_RADIUS - 5));
      bodyGfx.stroke({ color: 0xffffff, width: 2.5, alpha: 0.5 });
      bodyGfx.circle(0, -(WARRIOR_RADIUS - 7), 3);
      bodyGfx.fill({ color: 0xffffff, alpha: 0.7 });

      // Booster effect rings (circles, so rotation is invisible on them)
      if (w.isPlayer) {
        if (w.healPulse) {
          const pulse = Math.sin(now * 0.015) * 0.5 + 0.5;
          bodyGfx.circle(0, 0, WARRIOR_RADIUS + 5);
          bodyGfx.stroke({ color: 0xff4444, width: 3, alpha: 0.7 + pulse * 0.3 });
        }
        if (w.boosterEffect === 'glove') {
          bodyGfx.circle(0, 0, WARRIOR_RADIUS + 5);
          bodyGfx.stroke({ color: 0xffdd00, width: 3 });
        } else if (w.boosterEffect === 'shield') {
          bodyGfx.circle(0, 0, WARRIOR_RADIUS + 5);
          bodyGfx.stroke({ color: 0x44ff44, width: 3 });
        }
      }

      // --- Weapon emoji: world coords, follows velocity direction, does NOT spin ---
      iconText.x       = w.weaponX;
      iconText.y       = w.weaponY;
      iconText.visible = true;

      // --- HP bar (world coords, never rotates) ---
      hpGfx.clear();
      const hpFrac = Math.max(0, w.hp / 100);
      const barW = WARRIOR_RADIUS * 2;
      const barH = 4;
      const bx = w.px - WARRIOR_RADIUS;
      const by = w.py - WARRIOR_RADIUS - 10;
      hpGfx.rect(bx, by, barW, barH);
      hpGfx.fill({ color: 0x333333 });
      const barColor = hpFrac > 0.5 ? 0x44ff44 : hpFrac > 0.25 ? 0xffaa00 : 0xff3333;
      hpGfx.rect(bx, by, barW * hpFrac, barH);
      hpGfx.fill({ color: barColor });

      // Player indicator dot (world coords, stays upright)
      if (w.isPlayer) {
        hpGfx.circle(w.px, w.py - WARRIOR_RADIUS - 20, 3);
        hpGfx.fill({ color: 0xffffff });
      }

      hpText.text = String(Math.ceil(w.hp));
      hpText.x    = w.px;
      hpText.y    = by - 2;
    }

    // Booster pickup visual
    if (this.boosterPickup?.active && this.boosterGfx && this.boosterLabel) {
      const b = this.boosterPickup;
      this.boosterGfx.clear();
      const pulse = Math.sin(performance.now() * 0.004) * 0.15 + 0.85;
      this.boosterGfx.circle(b.px, b.py, b.radius + 3);
      this.boosterGfx.fill({ color: 0xffffff, alpha: 0.1 * pulse });
      this.boosterGfx.circle(b.px, b.py, b.radius + 3);
      this.boosterGfx.stroke({ color: 0xffd700, width: 2, alpha: pulse });
      this.boosterLabel.x       = b.px;
      this.boosterLabel.y       = b.py;
      this.boosterLabel.visible = true;
    } else if (this.boosterGfx) {
      this.boosterGfx.clear();
      if (this.boosterLabel) this.boosterLabel.visible = false;
    }
  }

  private checkRoundEnd(): void {
    const player = this.warriors.find(w => w.isPlayer);
    if (!player) return;

    const playerAlive   = player.alive && !player.dying;
    const aliveNonDying = this.warriors.filter(w => w.alive && !w.dying);
    const playerDead    = !playerAlive;
    const playerLast    = playerAlive && aliveNonDying.length === 1;

    if (!playerDead && !playerLast) return;

    const win = playerLast;
    this.state = win ? 'win' : 'lose';

    this.economy.finaliseRound(win);

    this.ui.setStatus(this.state);
    this.ui.updateBalance(this.economy.balance);
    this.ui.updateProfit(this.economy.roundProfit);
    this.ui.showFinalProfit(this.economy.finalProfit, win);
    this.ui.setControlsEnabled(true);
    this.ui.setStartButtonLabel('▶ PLAY AGAIN (10 FUN)', false);
    this.ui.setRunningMode(false, this.economy.balance, false);
    this.ui.showRoundEndPopup(win, this.economy.finalProfit, BET_AMOUNT);
  }

  private resetToReady(): void {
    this.state = 'ready';
    this.warriors = [];
    this.warriorLayer.removeChildren();
    this.warriorContainerMap.clear();
    this.warriorBodyGfxMap.clear();
    this.warriorHpGfxMap.clear();
    this.hpTextMap.clear();
    this.weaponIconMap.clear();
    this.boosterLayer.removeChildren();
    this.boosterGfx = null;
    this.boosterLabel = null;
    this.boosterPickup = null;
    this.hitFlashes = [];
    for (const ft of this.floatingTexts) this.effectLayer.removeChild(ft.text);
    this.floatingTexts = [];
    this.accumulator = 0;
    this.speedupActive = false;
    this.boostersBought = { burger: 0, glove: 0, shield: 0 };

    this.ui.hidePopup();
    this.syncUi();
  }

  private spawnFloatingText(x: number, y: number, msg: string, color: number): void {
    const text = new PIXI.Text({
      text: msg,
      style: {
        fontSize: 13,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    text.anchor.set(0.5, 0.5);
    text.x = x;
    text.y = y;
    this.effectLayer.addChild(text);
    this.floatingTexts.push({ text, vy: -40, life: 800 });
  }
}
