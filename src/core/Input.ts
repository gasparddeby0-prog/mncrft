/**
 * Centralised keyboard / mouse input with Pointer Lock support.
 *
 * The game polls this each frame:
 *  - `isDown(code)`        held keys (movement)
 *  - `consumePress(code)`  one-shot key presses (toggles, hotbar keys)
 *  - `consumeMouse()`      accumulated mouse look delta
 *  - `consumeButton(btn)`  one-shot mouse clicks (break / place)
 *  - `consumeWheel()`      accumulated scroll wheel delta
 *
 * Per-frame edges (presses, clicks, wheel, mouse delta) are reset by the game
 * loop via `endFrame()`.
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelDelta = 0;
  private readonly clicks = new Set<number>();
  private readonly buttonsDown = new Set<number>();

  locked = false;

  private readonly element: HTMLElement;
  private boundsActive = false;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  /** Attach DOM listeners. Call once at startup. */
  attach(): void {
    if (this.boundsActive) return;
    this.boundsActive = true;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    this.element.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  /** Request pointer lock (must be called from a user gesture). */
  requestLock(): void {
    this.element.requestPointerLock();
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True exactly once for each physical key press. */
  consumePress(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** Accumulated mouse movement since the last frame (resets on read). */
  consumeMouse(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** True once per mouse click of the given button (0 = left, 2 = right). */
  consumeButton(button: number): boolean {
    if (this.clicks.has(button)) {
      this.clicks.delete(button);
      return true;
    }
    return false;
  }

  consumeWheel(): number {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  /** True while a mouse button is held (0 = left, 2 = right). */
  isButtonDown(button: number): boolean {
    return this.buttonsDown.has(button);
  }

  /** Clear per-frame edges. Mouse look + presses are consumed on read, this is
   *  a safety net for anything left unread. */
  endFrame(): void {
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.element.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.boundsActive = false;
  }

  // --- DOM handlers (arrow functions keep `this` bound) ---

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.held.has(e.code)) this.pressed.add(e.code);
    this.held.add(e.code);
    // Prevent the page from scrolling on space / arrows while playing.
    if (this.locked && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.locked) {
      this.clicks.add(e.button);
      this.buttonsDown.add(e.button);
      e.preventDefault();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.buttonsDown.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    this.wheelDelta += e.deltaY;
    e.preventDefault();
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.element;
    if (!this.locked) {
      // Avoid keys/buttons getting stuck when control is released.
      this.held.clear();
      this.buttonsDown.clear();
    }
  };
}
