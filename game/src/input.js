// Keyboard + mouse input. Keys are polled by the fixed-step loop; one-shot
// actions (enter car, shoot, pause, confirm) are queued and taken once.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_SHOOT = 8;
export const ACTION_MISSION = 16;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space' && false) actions |= ACTION_CONFIRM;
    if (event.code === 'Space') actions |= ACTION_CONFIRM; // Space also confirms on menus
    if (event.code === 'Escape' || event.code === 'KeyP') actions |= ACTION_PAUSE;
    if (event.code === 'KeyE') actions |= ACTION_ENTER;
    if (event.code === 'KeyM') actions |= ACTION_MISSION;
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseDown(event) {
    if (event.button === 0) {
      actions |= ACTION_SHOOT;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  }
  function onMouseMove(event) {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function onMouseUp() {
    dragging = false;
  }
  function onBlur() {
    keys.clear();
    dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    // -1..1 strafe/forward pair in camera space, from WASD / arrows.
    move() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      return { x, y };
    },
    get handbrake() {
      return keys.has('Space');
    },
    get run() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    takeMouseDelta() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    // Test / autopilot hook: pretend a key is held.
    press(code) {
      keys.add(code);
    },
    release(code) {
      keys.delete(code);
    },
  };
}
