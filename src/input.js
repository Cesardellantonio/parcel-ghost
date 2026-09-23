/* Parcel Ghost — keyboard, touch stick and canvas-drag steering, merged into one move vector. */
(function (PG) {
  "use strict";

  const { W, H, INPUT_DEADZONE } = PG.TUNING;

  const MOVE_KEYS = {
    left: ["ArrowLeft", "a", "A"],
    right: ["ArrowRight", "d", "D"],
    up: ["ArrowUp", "w", "W"],
    down: ["ArrowDown", "s", "S"],
  };
  const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar"]);
  const PAUSE_KEYS = new Set(["Escape", "p", "P"]);

  /**
   * @param {{ canvas: HTMLCanvasElement, stick: HTMLElement, knob: HTMLElement,
   *           getPlayer: () => {x:number,y:number}, canSteer: () => boolean,
   *           onPause: () => void, onGesture: () => void }} opts
   */
  function createInput(opts) {
    const { canvas, stick, knob, getPlayer, canSteer, onPause, onGesture } = opts;
    const keys = Object.create(null);
    const stickVec = { x: 0, y: 0 };
    const dragVec = { x: 0, y: 0 };
    let dragPointer = null;

    const anyDown = (list) => list.some((k) => keys[k]);

    window.addEventListener("keydown", (e) => {
      keys[e.key] = true;
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
      if (PAUSE_KEYS.has(e.key)) {
        e.preventDefault();
        onPause();
      }
    });
    window.addEventListener("keyup", (e) => {
      keys[e.key] = false;
    });
    // Keyups are lost while the tab is unfocused; don't leave the courier walking.
    window.addEventListener("blur", () => {
      for (const k in keys) keys[k] = false;
    });

    // Touch stick
    function setStick(clientX, clientY) {
      const rect = stick.getBoundingClientRect();
      let dx = clientX - (rect.left + rect.width / 2);
      let dy = clientY - (rect.top + rect.height / 2);
      const max = rect.width * 0.36;
      const len = Math.hypot(dx, dy) || 1;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      stickVec.x = dx / max;
      stickVec.y = dy / max;
      knob.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
    }
    function resetStick(e) {
      if (e && stick.hasPointerCapture(e.pointerId)) stick.releasePointerCapture(e.pointerId);
      stickVec.x = 0;
      stickVec.y = 0;
      knob.style.transform = "translate(-50%, -50%)";
    }
    stick.addEventListener("pointerdown", (e) => {
      stick.setPointerCapture(e.pointerId);
      setStick(e.clientX, e.clientY);
      onGesture();
    });
    stick.addEventListener("pointermove", (e) => {
      if (stick.hasPointerCapture(e.pointerId)) setStick(e.clientX, e.clientY);
    });
    stick.addEventListener("pointerup", resetStick);
    stick.addEventListener("pointercancel", resetStick);

    // Canvas drag: steer toward the pointer's position on the board.
    function clearDrag() {
      dragVec.x = 0;
      dragVec.y = 0;
    }
    function aimFromCanvas(e) {
      if (!canSteer()) return clearDrag();
      const rect = canvas.getBoundingClientRect();
      const player = getPlayer();
      const dx = ((e.clientX - rect.left) / rect.width) * W - player.x;
      const dy = ((e.clientY - rect.top) / rect.height) * H - player.y;
      const len = Math.hypot(dx, dy);
      if (len < 8) return clearDrag();
      dragVec.x = dx / len;
      dragVec.y = dy / len;
    }
    canvas.addEventListener("pointerdown", (e) => {
      dragPointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      onGesture();
      aimFromCanvas(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (dragPointer === e.pointerId) aimFromCanvas(e);
    });
    function endDrag(e) {
      if (dragPointer !== e.pointerId) return;
      dragPointer = null;
      clearDrag();
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    /** Raw summed move intent; the sim normalizes and applies the deadzone. */
    function moveVector() {
      let x = 0;
      let y = 0;
      if (anyDown(MOVE_KEYS.left)) x -= 1;
      if (anyDown(MOVE_KEYS.right)) x += 1;
      if (anyDown(MOVE_KEYS.up)) y -= 1;
      if (anyDown(MOVE_KEYS.down)) y += 1;
      if (Math.hypot(stickVec.x, stickVec.y) > INPUT_DEADZONE) {
        x += stickVec.x;
        y += stickVec.y;
      }
      x += dragVec.x;
      y += dragVec.y;
      return { x, y };
    }

    return { moveVector };
  }

  PG.input = { createInput };
})((globalThis.PG = globalThis.PG || {}));
