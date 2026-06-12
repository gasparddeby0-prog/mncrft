/**
 * VoxelCraft entry point.
 *
 * Grabs the canvas, constructs the Game and starts it. All heavy lifting lives
 * in the subsystems under src/ — this file just bootstraps and surfaces fatal
 * errors to the user.
 */

import './ui/styles.css';
import { Game } from './core/Game';

function fail(message: string): void {
  const overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.innerHTML = `<div class="panel"><h1>VoxelCraft</h1><p class="subtitle">${message}</p></div>`;
    overlay.classList.remove('hidden');
  }
  // eslint-disable-next-line no-console
  console.error(message);
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;

if (!canvas) {
  fail('Canvas element #game-canvas not found.');
} else if (!('getContext' in canvas) || !(window.WebGLRenderingContext || (window as unknown as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext)) {
  fail('Your browser does not support WebGL, which VoxelCraft requires.');
} else {
  const game = new Game(canvas);
  game.start().catch((err) => fail(`Failed to start: ${err instanceof Error ? err.message : String(err)}`));
}
