import { Application } from 'pixi.js';
import { Game } from './Game';

const CANVAS_SIZE = 540; // arena (500) + some padding

async function main(): Promise<void> {
  const app = new Application();

  await app.init({
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    background: 0x0a0a0f,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const wrapper = document.getElementById('canvas-wrapper')!;
  wrapper.appendChild(app.canvas);

  // Responsive scaling: preserve aspect ratio, fit window height
  function resize(): void {
    const panelWidth = 220 + 12 + 24; // ui-panel + gap + body padding
    const maxW = window.innerWidth  - panelWidth - 20;
    const maxH = window.innerHeight - 20;
    const scale = Math.min(maxW / CANVAS_SIZE, maxH / CANVAS_SIZE, 1);

    app.canvas.style.width  = `${Math.floor(CANVAS_SIZE * scale)}px`;
    app.canvas.style.height = `${Math.floor(CANVAS_SIZE * scale)}px`;
  }
  resize();
  window.addEventListener('resize', resize);

  const game = new Game(app);

  app.ticker.maxFPS = 60;
  app.ticker.add((ticker) => {
    game.update(ticker.deltaMS);
  });
}

main().catch(console.error);
