// Keyboard state tracker with edge detection.
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();   // cleared each frame after read
    this.released = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = this.norm(e.code);
      this.down.add(k);
      this.pressed.add(k);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = this.norm(e.code);
      this.down.delete(k);
      this.released.add(k);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  norm(code) { return code; }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }

  // Movement vector in world space: A/D -> -x/+x, W/S -> -z/+z
  moveVector() {
    let x = 0, z = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) z -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    return { x, z };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}
