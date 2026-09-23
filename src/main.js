/* Parcel Ghost — app entry: screen state machine, frame loop, event → sound/fx wiring. */
(function (PG) {
  "use strict";

  const sfx = window.PGAudio || new Proxy({}, { get: () => () => {} });
  const ui = PG.ui.createUi(document);
  const canvas = document.getElementById("game");
  const renderer = PG.render.createRenderer(canvas);
  const { floater, burst } = PG.render;

  /**
   * Screens and the only moves allowed between them. Starting a shift always builds a fresh run,
   * so nothing (pendingWin, held parcel, guard positions) leaks across runs.
   * @typedef {"title" | "playing" | "paused" | "won" | "failed"} Screen
   */
  const TRANSITIONS = {
    title: ["playing"],
    playing: ["paused", "won", "failed"],
    paused: ["playing"],
    won: ["playing"],
    failed: ["playing"],
  };

  const app = {
    /** @type {Screen} */
    screen: "title",
    run: PG.sim.createRun(),
    fx: PG.render.createFx(),
    tickCooldown: 0,
    lastTs: 0,
  };

  function go(next) {
    if (!TRANSITIONS[app.screen].includes(next)) return false;
    app.screen = next;
    ui.showScreen(next, app.run);
    return true;
  }

  function startShift() {
    sfx.unlock();
    app.run = PG.sim.createRun();
    app.fx = PG.render.createFx();
    app.tickCooldown = 0;
    if (go("playing")) sfx.ui();
  }

  function togglePause() {
    sfx.unlock();
    if (app.screen === "playing") go("paused");
    else if (app.screen === "paused") go("playing");
    else return;
    sfx.ui();
  }

  function handleEvent(e) {
    const fx = app.fx;
    switch (e.type) {
      case "solidify":
        sfx.solidify();
        break;
      case "ghost":
        sfx.ghost();
        break;
      case "pickup":
        sfx.pickup();
        floater(fx, "PICK UP", e.x, e.y - 16, e.parcel.color);
        break;
      case "drop":
        sfx.drop();
        floater(fx, "DROP", e.x, e.y - 16, e.parcel.color);
        break;
      case "deliver":
        sfx.deliver();
        floater(fx, "DELIVERED", e.x, e.y - 20, e.dock.color);
        burst(fx, e.parcel.x, e.parcel.y, e.dock.color);
        break;
      case "won":
        sfx.win();
        fx.flash = 0.5;
        go("won");
        break;
      case "failed":
        if (e.reason === "photo") {
          sfx.photo();
          fx.flash = 0.85;
          fx.shake = 10;
        } else {
          sfx.fail();
          fx.flash = 0.4;
        }
        go("failed");
        break;
    }
  }

  function countdownTick(dt) {
    const t = app.run.timeLeft;
    if (app.run.outcome || t > 10 || t <= 0) return;
    app.tickCooldown -= dt;
    if (app.tickCooldown <= 0) {
      sfx.tick();
      app.tickCooldown = t <= 5 ? 0.5 : 1;
    }
  }

  function frame(ts) {
    const dt = Math.min(0.033, (ts - app.lastTs) / 1000 || 0.016);
    app.lastTs = ts;
    const playing = app.screen === "playing";
    if (playing) {
      PG.sim.stepRun(app.run, input.moveVector(), dt).forEach(handleEvent);
      countdownTick(dt);
    }
    PG.render.updateFx(app.fx, dt, playing);
    if (app.screen === "playing") ui.syncHud(app.run, app.screen);
    renderer.draw(app.run, app.fx, app.screen);
    requestAnimationFrame(frame);
  }

  const input = PG.input.createInput({
    canvas,
    stick: document.getElementById("stick"),
    knob: document.getElementById("stick-knob"),
    getPlayer: () => app.run.player,
    canSteer: () => app.screen === "playing",
    onPause: togglePause,
    onGesture: () => sfx.unlock(),
  });

  ui.el.startBtn.addEventListener("click", startShift);
  ui.el.restartBtn.addEventListener("click", startShift);
  ui.el.resumeBtn.addEventListener("click", togglePause);
  ui.el.pauseBtn.addEventListener("click", togglePause);

  ui.showScreen("title", app.run);
  requestAnimationFrame((ts) => {
    app.lastTs = ts;
    requestAnimationFrame(frame);
  });
})((globalThis.PG = globalThis.PG || {}));
