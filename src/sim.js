/* Parcel Ghost — simulation. Owns every rule (existence, parcels, guards, win/lose).
 * No DOM, audio or canvas: `stepRun` mutates a run and returns the events that happened,
 * so presentation lives elsewhere and the rules can be tested headless (see tests/). */
(function (PG) {
  "use strict";

  const T = PG.TUNING;
  const { dist, resolveCircleWalls, pointInCone } = PG.geo;

  /**
   * @typedef {{ result: "won" } | { result: "failed", reason: "photo" | "shift" }} Outcome
   * @typedef {{ type: string, [key: string]: any }} SimEvent
   */

  function createRun() {
    const byId = Object.fromEntries(PG.ROUTES.map((r) => [r.id, r]));
    const spawn = PG.LEVEL.spawn();
    return {
      timeLeft: T.SHIFT_SEC,
      delivered: 0,
      /** @type {"ghost" | "solid"} */
      mode: "ghost",
      stillTimer: 0,
      /** @type {string | null} id of the carried parcel */
      heldId: null,
      /** Final dock happened this frame; confirmed only after guards move and photo is re-checked. */
      pendingWin: false,
      /** @type {Outcome | null} */
      outcome: null,
      player: { x: spawn.x, y: spawn.y },
      walls: PG.LEVEL.walls(),
      parcels: PG.LEVEL.parcels().map((p) => ({
        ...p,
        name: byId[p.id].name,
        color: PG.COLORS[p.id],
        r: T.PARCEL_R,
        docked: false,
      })),
      docks: PG.LEVEL.docks().map((d) => ({ ...d, name: byId[d.id].name, color: PG.COLORS[d.id] })),
      guards: PG.LEVEL.guards().map((g) => ({
        x: g.path[0].x,
        y: g.path[0].y,
        r: T.GUARD_R,
        heading: g.heading,
        path: g.path,
        pathIndex: 0,
        wait: g.wait,
        stuck: 0,
      })),
    };
  }

  // --- Queries (also used by the UI) ---

  function heldParcel(run) {
    return run.heldId ? run.parcels.find((p) => p.id === run.heldId) : null;
  }

  /** Parcels lying on the floor: neither docked nor carried. */
  function openParcels(run) {
    return run.parcels.filter((p) => !p.docked && p.id !== run.heldId);
  }

  function dockCenter(dock) {
    return { x: dock.x + dock.w / 2, y: dock.y + dock.h / 2 };
  }

  function dockFor(run, parcelId) {
    return run.docks.find((d) => d.id === parcelId);
  }

  function nearestFreeParcel(run, maxDist) {
    const { x, y } = run.player;
    let best = null;
    let bestD = maxDist;
    for (const parcel of openParcels(run)) {
      const d = dist(x, y, parcel.x, parcel.y);
      if (d <= bestD) {
        bestD = d;
        best = parcel;
      }
    }
    return best;
  }

  function isOnMatchingDock(run) {
    const held = heldParcel(run);
    if (!held) return false;
    const c = dockCenter(dockFor(run, held.id));
    return dist(run.player.x, run.player.y, c.x, c.y) <= T.DOCK_INTERACT_R;
  }

  /** Photographed = solid and inside any guard's unobstructed cone. Ghosts are never seen. */
  function isPhotoExposed(run) {
    if (run.mode !== "solid") return false;
    return run.guards.some((g) => pointInCone(run.player.x, run.player.y, g, run.walls));
  }

  // --- Transitions ---

  function finish(run, outcome, emit) {
    if (run.outcome) return;
    run.outcome = outcome;
    run.pendingWin = false;
    emit(outcome.result === "won" ? { type: "won" } : { type: "failed", reason: outcome.reason });
  }

  /** Fires once on each ghost → solid edge: deliver, else drop, else pick up. */
  function interact(run, emit) {
    const p = run.player;
    const held = heldParcel(run);

    if (held && isOnMatchingDock(run)) {
      const dock = dockFor(run, held.id);
      const c = dockCenter(dock);
      held.docked = true;
      held.x = c.x;
      held.y = c.y;
      run.heldId = null;
      run.delivered += 1;
      emit({ type: "deliver", parcel: held, dock, x: p.x, y: p.y });
      if (run.delivered >= T.PARCEL_COUNT) {
        // Photo beats win: fail now if already seen, otherwise confirm after guards move.
        if (isPhotoExposed(run)) finish(run, { result: "failed", reason: "photo" }, emit);
        else run.pendingWin = true;
      }
      return;
    }

    if (held) {
      held.x = p.x;
      held.y = p.y + 18;
      resolveCircleWalls(held, held.r, run.walls);
      run.heldId = null;
      emit({ type: "drop", parcel: held, x: p.x, y: p.y });
      return;
    }

    const target = nearestFreeParcel(run, T.INTERACT_R);
    if (target) {
      run.heldId = target.id;
      emit({ type: "pickup", parcel: target, x: target.x, y: target.y });
    }
  }

  function normalizeMove(input) {
    let x = input.x;
    let y = input.y;
    const len = Math.hypot(x, y);
    if (len <= T.INPUT_DEADZONE) return { x: 0, y: 0 };
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  function movePlayer(run, input, dt) {
    const move = normalizeMove(input);
    if (move.x === 0 && move.y === 0) return 0;
    const p = run.player;
    const ox = p.x;
    const oy = p.y;
    p.x += move.x * T.PLAYER_SPEED * dt;
    p.y += move.y * T.PLAYER_SPEED * dt;
    resolveCircleWalls(p, T.PLAYER_R, run.walls);
    return Math.hypot(p.x - ox, p.y - oy);
  }

  /** Existence is judged by real displacement, so pushing into a wall still lets you solidify. */
  function updateExistence(run, displacement, dt, emit) {
    if (displacement > T.MOVE_EPSILON) {
      run.stillTimer = 0;
      if (run.mode === "solid") {
        run.mode = "ghost";
        emit({ type: "ghost" });
      }
      return;
    }
    run.stillTimer += dt;
    if (run.mode === "ghost" && run.stillTimer >= T.SOLIDIFY_SEC) {
      run.mode = "solid";
      emit({ type: "solidify" });
      interact(run, emit);
    }
  }

  function carryHeldParcel(run) {
    const held = heldParcel(run);
    if (!held) return;
    held.x = run.player.x + 10;
    held.y = run.player.y - 14;
  }

  function updateGuard(g, dt, walls) {
    if (g.wait > 0) {
      g.wait -= dt;
      return;
    }
    const target = g.path[g.pathIndex];
    const dx = target.x - g.x;
    const dy = target.y - g.y;
    const before = Math.hypot(dx, dy);
    if (before < 4) {
      g.pathIndex = (g.pathIndex + 1) % g.path.length;
      g.wait = T.GUARD_WAYPOINT_WAIT;
      g.stuck = 0;
      return;
    }
    const ox = g.x;
    const oy = g.y;
    const step = Math.min(T.GUARD_SPEED * dt, before);
    g.x += (dx / before) * step;
    g.y += (dy / before) * step;
    g.heading = Math.atan2(dy, dx);
    resolveCircleWalls(g, g.r, walls);

    const moved = Math.hypot(g.x - ox, g.y - oy);
    const after = Math.hypot(target.x - g.x, target.y - g.y);
    if (moved < 0.25 || after >= before - 0.15) {
      g.stuck += dt;
      if (g.stuck > T.GUARD_STUCK_SEC) {
        // Skip a blocked waypoint rather than freeze against a counter forever.
        g.pathIndex = (g.pathIndex + 1) % g.path.length;
        g.wait = 0.15;
        g.stuck = 0;
      }
    } else {
      g.stuck = 0;
    }
  }

  /**
   * Advance one frame. Order matters: clock → move → existence/interact → guards → photo → win.
   * @returns {SimEvent[]}
   */
  function stepRun(run, input, dt) {
    const events = [];
    const emit = (e) => events.push(e);
    if (run.outcome) return events;

    run.timeLeft -= dt;
    if (run.timeLeft <= 0) {
      // Any parcel not docked (open on the floor or still in hand) fails the shift.
      run.timeLeft = 0;
      finish(run, { result: "failed", reason: "shift" }, emit);
      return events;
    }

    const displacement = movePlayer(run, input, dt);
    updateExistence(run, displacement, dt, emit);
    if (run.outcome) return events;
    carryHeldParcel(run);

    for (const g of run.guards) updateGuard(g, dt, run.walls);

    if (isPhotoExposed(run)) {
      finish(run, { result: "failed", reason: "photo" }, emit);
    } else if (run.pendingWin) {
      finish(run, { result: "won" }, emit);
    }
    return events;
  }

  PG.sim = {
    createRun,
    stepRun,
    heldParcel,
    openParcels,
    dockFor,
    nearestFreeParcel,
    isOnMatchingDock,
    isPhotoExposed,
  };
})((globalThis.PG = globalThis.PG || {}));
