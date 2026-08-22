export const worldInput = {
  keys: new Set<string>(),
  stickX: 0,
  stickY: 0,
  lookDx: 0,
  lookDy: 0,
  interactQueued: false,
  locked: false,
};

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyE",
  "Space",
]);

function onKeyDown(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  worldInput.keys.add(e.code);
  if (GAME_CODES.has(e.code)) e.preventDefault();
  if (e.code === "KeyE") worldInput.interactQueued = true;
}

function onKeyUp(e: KeyboardEvent) {
  worldInput.keys.delete(e.code);
}

function onBlur() {
  worldInput.keys.clear();
  worldInput.stickX = 0;
  worldInput.stickY = 0;
}

function onVisibility() {
  if (document.hidden) onBlur();
}

function onMouseMove(e: MouseEvent) {
  if (!worldInput.locked) return;
  worldInput.lookDx += e.movementX;
  worldInput.lookDy += e.movementY;
}

function onLockChange() {
  worldInput.locked = document.pointerLockElement != null;
}

export function attachWorldInput() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onLockChange);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("pointerlockchange", onLockChange);
    worldInput.keys.clear();
  };
}

export function radialDeadzone(x: number, y: number, dz = 0.15) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export function sampleMove(): { x: number; y: number } {
  let x = worldInput.stickX;
  let y = worldInput.stickY;
  const k = worldInput.keys;
  if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
  if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
  if (k.has("KeyW") || k.has("ArrowUp")) y += 1;
  if (k.has("KeyS") || k.has("ArrowDown")) y -= 1;

  const pads = typeof navigator !== "undefined" ? (navigator.getGamepads?.() ?? []) : [];
  for (const pad of pads) {
    if (!pad) continue;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const dz = radialDeadzone(ax, -ay, 0.18);
    x += dz.x;
    y += dz.y;
    if (pad.buttons[0]?.pressed) worldInput.interactQueued = true;
  }

  const m = Math.hypot(x, y);
  if (m > 1) {
    x /= m;
    y /= m;
  }
  return { x, y };
}
