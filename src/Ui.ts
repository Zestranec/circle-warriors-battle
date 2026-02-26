import type { WarriorColor } from './Warrior';
import type { BoosterType } from './Boosters';

export type RoundStatus = 'ready' | 'running' | 'win' | 'lose';

export interface UiState {
  selectedWarrior: number;
  selectedMode: number;
  selectedBooster: BoosterType | 'none';
  winProbability: number;
  seed: string;
}

export interface UiCallbacks {
  onWarriorSelect: (idx: number) => void;
  onModeSelect: (mode: number) => void;
  onBoosterSelect: (b: BoosterType | 'none') => void;
  onWinProbChange: (p: number) => void;
  onSeedChange: (seed: string) => void;
  onStart: () => void;
  onSpeedupToggle: () => void;
  onMidRoundBoosterBuy: (b: BoosterType) => void;
}

export class Ui {
  private state: UiState = {
    selectedWarrior: 0,
    selectedMode: 4,
    selectedBooster: 'none',
    winProbability: 0.8,
    seed: '',
  };

  private callbacks!: UiCallbacks;
  private isRunning = false;

  // DOM refs
  private balanceEl!: HTMLElement;
  private profitEl!: HTMLElement;
  private finalProfitEl!: HTMLElement;
  private finalProfitRow!: HTMLElement;
  private statusBadge!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private speedupBtn!: HTMLButtonElement;
  private boosterSectionLabel!: HTMLElement;
  private boostersBoughtSection!: HTMLElement;
  private boostersBoughtEl!: HTMLElement;
  private popupEl!: HTMLElement;
  private popupTitle!: HTMLElement;
  private popupMsg!: HTMLElement;
  private popupBtn!: HTMLButtonElement;
  private popupAutoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  init(callbacks: UiCallbacks): void {
    this.callbacks = callbacks;

    this.balanceEl          = document.getElementById('stat-balance')!;
    this.profitEl           = document.getElementById('stat-profit')!;
    this.finalProfitEl      = document.getElementById('stat-final-profit')!;
    this.finalProfitRow     = document.getElementById('final-profit-row')!;
    this.statusBadge        = document.getElementById('status-badge')!;
    this.startBtn           = document.getElementById('start-btn') as HTMLButtonElement;
    this.speedupBtn         = document.getElementById('speedup-btn') as HTMLButtonElement;
    this.boosterSectionLabel= document.getElementById('booster-section-label')!;
    this.boostersBoughtSection = document.getElementById('boosters-bought-section')!;
    this.boostersBoughtEl   = document.getElementById('boosters-bought-text')!;
    this.popupEl            = document.getElementById('round-popup')!;
    this.popupTitle         = document.getElementById('popup-title')!;
    this.popupMsg           = document.getElementById('popup-msg')!;
    this.popupBtn           = document.getElementById('popup-btn') as HTMLButtonElement;

    this.setupWarriorButtons();
    this.setupModeButtons();
    this.setupBoosterButtons();
    this.setupWinProb();
    this.setupSeed();
    this.setupStartButton();
    this.setupSpeedupButton();
    this.setupPopupButton();
    this.setupKeyboard();

    this.selectWarrior(0);
    this.selectMode(4);
    this.selectBooster('none');
  }

  private setupWarriorButtons(): void {
    document.getElementById('warrior-btns')!
      .querySelectorAll<HTMLButtonElement>('[data-warrior]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.warrior!);
          this.selectWarrior(idx);
          this.callbacks.onWarriorSelect(idx);
        });
      });
  }

  private setupModeButtons(): void {
    document.getElementById('mode-btns')!
      .querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = parseInt(btn.dataset.mode!);
          this.selectMode(mode);
          this.callbacks.onModeSelect(mode);
        });
      });
  }

  private setupBoosterButtons(): void {
    document.getElementById('booster-btns')!
      .querySelectorAll<HTMLButtonElement>('[data-booster]').forEach(btn => {
        btn.addEventListener('click', () => {
          const b = btn.dataset.booster as BoosterType | 'none';
          if (this.isRunning) {
            // Mid-round purchase (not 'none')
            if (b !== 'none') this.callbacks.onMidRoundBoosterBuy(b);
          } else {
            this.selectBooster(b);
            this.callbacks.onBoosterSelect(b);
          }
        });
      });
  }

  private setupWinProb(): void {
    const sel = document.getElementById('win-prob-select') as HTMLSelectElement;
    sel.addEventListener('change', () => {
      const p = parseFloat(sel.value);
      this.state.winProbability = p;
      this.callbacks.onWinProbChange(p);
    });
  }

  private setupSeed(): void {
    const inp = document.getElementById('seed-input') as HTMLInputElement;
    inp.addEventListener('input', () => {
      this.state.seed = inp.value.trim();
      this.callbacks.onSeedChange(this.state.seed);
    });
  }

  private setupStartButton(): void {
    this.startBtn.addEventListener('click', () => this.callbacks.onStart());
  }

  private setupSpeedupButton(): void {
    this.speedupBtn.addEventListener('click', () => this.callbacks.onSpeedupToggle());
  }

  private setupPopupButton(): void {
    this.popupBtn.addEventListener('click', () => {
      this.hidePopup();
      this.callbacks.onStart();
    });
  }

  private setupKeyboard(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (this.isPopupVisible()) {
          this.hidePopup();
          this.callbacks.onStart();
        } else {
          this.callbacks.onStart();
        }
      }
    });
  }

  private isPopupVisible(): boolean {
    return this.popupEl.style.display !== 'none';
  }

  selectWarrior(idx: number): void {
    this.state.selectedWarrior = idx;
    const colorNames = ['red', 'blue', 'green', 'yellow'];
    document.getElementById('warrior-btns')!
      .querySelectorAll<HTMLButtonElement>('[data-warrior]').forEach(btn => {
        const i = parseInt(btn.dataset.warrior!);
        btn.classList.toggle('selected', i === idx);
        colorNames.forEach(c => btn.classList.remove(c));
        btn.classList.add(colorNames[i]);
      });
  }

  selectMode(mode: number): void {
    this.state.selectedMode = mode;
    document.getElementById('mode-btns')!
      .querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(btn => {
        btn.classList.toggle('selected', parseInt(btn.dataset.mode!) === mode);
      });
  }

  selectBooster(b: BoosterType | 'none'): void {
    this.state.selectedBooster = b;
    document.getElementById('booster-btns')!
      .querySelectorAll<HTMLButtonElement>('[data-booster]').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.booster === b);
      });
  }

  setStatus(status: RoundStatus): void {
    const labels: Record<RoundStatus, string> = {
      ready: 'READY', running: 'RUNNING', win: '★ WIN ★', lose: '✗ LOSE',
    };
    this.statusBadge.textContent = labels[status];
    this.statusBadge.className = '';
    this.statusBadge.id = 'status-badge';
    if (status !== 'ready') this.statusBadge.classList.add(status);
  }

  setStartButtonLabel(label: string, disabled = false): void {
    this.startBtn.textContent = label;
    this.startBtn.disabled = disabled;
  }

  /** Disable/enable pre-round setup controls (warrior, mode, seed, win-prob). */
  setControlsEnabled(enabled: boolean): void {
    ['warrior-btns', 'mode-btns'].forEach(id => {
      document.getElementById(id)!
        .querySelectorAll<HTMLButtonElement>('button')
        .forEach(btn => (btn.disabled = !enabled));
    });
    (document.getElementById('win-prob-select') as HTMLSelectElement).disabled = !enabled;
    (document.getElementById('seed-input') as HTMLInputElement).disabled = !enabled;
  }

  /**
   * Switch booster button behavior and speedup button state for running/ready modes.
   * balance and pickupActive are used to compute which buy buttons to enable.
   */
  setRunningMode(running: boolean, balance: number, pickupActive: boolean): void {
    this.isRunning = running;

    // Booster section label changes meaning during round
    this.boosterSectionLabel.textContent = running
      ? 'Buy Booster (+1 FUN)'
      : 'Booster (+1 FUN)';

    // Speedup button: enabled only while running
    this.speedupBtn.disabled = !running;
    this.speedupBtn.style.display = running ? '' : 'none';

    // Boosters-bought section: show only during round
    this.boostersBoughtSection.style.display = running ? '' : 'none';

    if (running) {
      // In run mode: booster buttons are buy buttons
      // 'None' is hidden (no meaning mid-round)
      document.getElementById('booster-btns')!
        .querySelectorAll<HTMLButtonElement>('[data-booster]').forEach(btn => {
          const b = btn.dataset.booster as BoosterType | 'none';
          if (b === 'none') {
            btn.style.display = 'none';
          } else {
            btn.style.display = '';
            btn.disabled = balance < 1 || pickupActive;
            btn.classList.remove('selected');
          }
        });
    } else {
      // Pre-round: restore normal select behavior
      document.getElementById('booster-btns')!
        .querySelectorAll<HTMLButtonElement>('[data-booster]').forEach(btn => {
          btn.style.display = '';
          btn.disabled = false;
        });
      this.selectBooster(this.state.selectedBooster);
    }
  }

  /** Update mid-round booster buy buttons enabled state. */
  updateRunningControls(balance: number, pickupActive: boolean): void {
    if (!this.isRunning) return;
    document.getElementById('booster-btns')!
      .querySelectorAll<HTMLButtonElement>('[data-booster]').forEach(btn => {
        const b = btn.dataset.booster as BoosterType | 'none';
        if (b !== 'none') btn.disabled = balance < 1 || pickupActive;
      });
  }

  setSpeedupActive(active: boolean): void {
    this.speedupBtn.textContent = active ? '⚡ Speedup (2× ON)' : '⚡ Speedup (2× OFF)';
    this.speedupBtn.classList.toggle('selected', active);
  }

  updateBalance(balance: number): void {
    this.balanceEl.textContent = `${balance.toFixed(2)} FUN`;
  }

  updateProfit(profit: number): void {
    this.profitEl.textContent = `${profit >= 0 ? '+' : ''}${profit.toFixed(2)} FUN`;
    this.profitEl.className = 'stat-value ' + (profit >= 0 ? 'positive' : 'negative');
  }

  showFinalProfit(profit: number, win: boolean): void {
    this.finalProfitRow.style.display = '';
    const sign = profit >= 0 ? '+' : '';
    const multiplierLabel = (win && profit > 0) ? ' ×1.5' : '';
    this.finalProfitEl.textContent = `${sign}${profit.toFixed(2)} FUN${multiplierLabel}`;
    this.finalProfitEl.className = 'stat-value ' + (profit >= 0 ? 'win' : 'lose');
  }

  hideFinalProfit(): void {
    this.finalProfitRow.style.display = 'none';
  }

  setSeed(seed: string): void {
    (document.getElementById('seed-input') as HTMLInputElement).value = seed;
    this.state.seed = seed;
  }

  updateBoostersBought(counts: Record<BoosterType, number>): void {
    const parts: string[] = [];
    if (counts.burger > 0) parts.push(`🍔 Burger ×${counts.burger}`);
    if (counts.glove  > 0) parts.push(`🥊 Glove ×${counts.glove}`);
    if (counts.shield > 0) parts.push(`🛡️ Shield ×${counts.shield}`);
    this.boostersBoughtEl.textContent = parts.length > 0 ? parts.join('  ') : '—';
  }

  showRoundEndPopup(win: boolean, finalProfit: number, betAmount: number): void {
    if (win) {
      const winAmount = Math.max(0, finalProfit);
      const y = betAmount > 0 ? winAmount / betAmount : 0;
      this.popupTitle.textContent = '★ YOU WIN! ★';
      this.popupTitle.className = 'popup-title win';
      this.popupMsg.innerHTML =
        `Congrats! You have won <strong>${winAmount.toFixed(2)} FUNS</strong>` +
        ` and this is <strong>${y.toFixed(2)}x</strong> from your Bet`;
      this.popupBtn.textContent = '▶ Play Again';
    } else {
      this.popupTitle.textContent = 'Oh No, You Lose';
      this.popupTitle.className = 'popup-title lose';
      const sign = finalProfit >= 0 ? '+' : '';
      this.popupMsg.innerHTML =
        `Round profit: <strong>${sign}${finalProfit.toFixed(2)} FUN</strong>`;
      this.popupBtn.textContent = '▶ Play Again';
    }


    this.popupEl.style.display = 'flex';

    if (this.popupAutoCloseTimer) clearTimeout(this.popupAutoCloseTimer);
    this.popupAutoCloseTimer = setTimeout(() => {
      this.hidePopup();
      // auto-close does NOT auto-start
    }, 2000);
  }

  hidePopup(): void {
    if (this.popupAutoCloseTimer) {
      clearTimeout(this.popupAutoCloseTimer);
      this.popupAutoCloseTimer = null;
    }
    this.popupEl.style.display = 'none';
  }

  getState(): Readonly<UiState> {
    return this.state;
  }
}
