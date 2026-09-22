/* Parcel Ghost — coherent single-file game loop. */
(() => {
  "use strict";

  const W = 390;
  const H = 620;
  const SHIFT_SEC = 90;
  const SOLIDIFY_SEC = 0.12;
  const PLAYER_R = 12;
  const PLAYER_SPEED = 145;
  const INTERACT_R = 28;
  const GUARD_SPEED = 52;
  const CONE_LEN = 108;
  const CONE_HALF = 0.36; // radians half-angle

  const COLORS = {
    jade: "#3dcf9a",
    ion: "#6aa8ff",
    amber: "#f0b45a",
  };

  const $ = (id) => document.getElementById(id);

  // Element IDs used (must match index.html):
  // game, overlay, overlay-kicker, overlay-title, overlay-text, overlay-fine,
  // summary, start-btn, resume-btn, restart-btn, btn-pause,
  // hud-parcels, hud-timer, hud-mode, pill-mode, pill-held, pill-hint,
  // stick, stick-knob, stage, meters, legend, controls
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const overlay = $("overlay");
  const overlayKicker = $("overlay-kicker");
  const overlayTitle = $("overlay-title");
  const overlayText = $("overlay-text");
  const overlayFine = $("overlay-fine");
  const summaryEl = $("summary");
  const startBtn = $("start-btn");
  const resumeBtn = $("resume-btn");
  const restartBtn = $("restart-btn");
  const btnPause = $("btn-pause");
  const hudParcels = $("hud-parcels");
  const hudTimer = $("hud-timer");
  const hudMode = $("hud-mode");
  const pillMode = $("pill-mode");
  const pillHeld = $("pill-held");
  const pillHint = $("pill-hint");
  const stickEl = $("stick");
  const stickKnob = $("stick-knob");

  const sfx = window.PGAudio || {
    unlock() {},
    solidify() {},
    ghost() {},
    pickup() {},
    drop() {},
    deliver() {},
    photo() {},
    win() {},
    fail() {},
    tick() {},
    ui() {},
  };

  const keys = Object.create(null);
  const stick = { x: 0, y: 0, active: false };
  const pointerAim = { x: 0, y: 0, active: false };

  /** @type {"title"|"playing"|"paused"|"won"|"failed"} */
  let screen = "title";
  let lastTs = 0;
  let flash = 0;
  let shake = 0;
  let tickLeft = 0;

  const state = blankState();

  function blankState() {
    return {
      timeLeft: SHIFT_SEC,
      delivered: 0,
      mode: "ghost", // ghost | solid
      stillTimer: 0,
      wasSolid: false,
      held: null, // parcel id or null
      failReason: null,
      photoGuard: null,
      pendingWin: false,
      player: { x: 100, y: 500, vx: 0, vy: 0 },
      walls: makeWalls(),
      parcels: makeParcels(),
      docks: makeDocks(),
      guards: makeGuards(),
      particles: [],
      floaters: [],
    };
  }

  function makeWalls() {
    // Night atrium pillars / counters — leave corridors
    return [
      { x: 0, y: 0, w: W, h: 28 },
      { x: 0, y: H - 18, w: W, h: 18 },
      { x: 0, y: 0, w: 14, h: H },
      { x: W - 14, y: 0, w: 14, h: H },
      { x: 70, y: 120, w: 70, h: 18 },
      { x: 250, y: 120, w: 70, h: 18 },
      { x: 160, y: 220, w: 70, h: 18 },
      { x: 40, y: 320, w: 90, h: 16 },
      { x: 260, y: 320, w: 90, h: 16 },
      { x: 130, y: 430, w: 130, h: 18 },
      { x: 50, y: 520, w: 60, h: 14 },
      { x: 280, y: 520, w: 60, h: 14 },
    ];
  }

  function makeParcels() {
    return [
      { id: "jade", name: "Jade", color: COLORS.jade, x: 55, y: 180, r: 9, docked: false },
      { id: "ion", name: "Ion", color: COLORS.ion, x: 335, y: 260, r: 9, docked: false },
      { id: "amber", name: "Amber", color: COLORS.amber, x: 250, y: 500, r: 9, docked: false },
    ];
  }

  function makeDocks() {
    return [
      { id: "jade", name: "Jade", color: COLORS.jade, x: 320, y: 70, w: 44, h: 28 },
      { id: "ion", name: "Ion", color: COLORS.ion, x: 30, y: 380, w: 44, h: 28 },
      { id: "amber", name: "Amber", color: COLORS.amber, x: 175, y: 70, w: 44, h: 28 },
    ];
  }

  function makeGuards() {
    // Routes stay in clear corridors (no counter collisions).
    return [
      {
        x: 70,
        y: 90,
        r: 11,
        heading: 0,
        path: [
          { x: 70, y: 90 },
          { x: 320, y: 90 },
          { x: 320, y: 180 },
          { x: 70, y: 180 },
        ],
        pathIndex: 0,
        wait: 0,
        stuck: 0,
      },
      {
        x: 160,
        y: 280,
        r: 11,
        heading: 0,
        path: [
          { x: 160, y: 280 },
          { x: 230, y: 280 },
          { x: 230, y: 370 },
          { x: 160, y: 370 },
        ],
        pathIndex: 0,
        wait: 0.35,
        stuck: 0,
      },
      {
        x: 80,
        y: 560,
        r: 11,
        heading: 0, // face east — not toward spawn
        path: [
          { x: 80, y: 560 },
          { x: 300, y: 560 },
          { x: 200, y: 560 },
          { x: 200, y: 480 },
          { x: 80, y: 480 },
        ],
        pathIndex: 0,
        wait: 0.55,
        stuck: 0,
      },
    ];
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function circleRect(cx, cy, r, rect) {
    const nx = clamp(cx, rect.x, rect.x + rect.w);
    const ny = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function resolveCircleWalls(ent, r) {
    for (let i = 0; i < state.walls.length; i += 1) {
      const wall = state.walls[i];
      if (!circleRect(ent.x, ent.y, r, wall)) continue;
      const nearestX = clamp(ent.x, wall.x, wall.x + wall.w);
      const nearestY = clamp(ent.y, wall.y, wall.y + wall.h);
      let dx = ent.x - nearestX;
      let dy = ent.y - nearestY;
      let d = Math.hypot(dx, dy);
      if (d < 0.0001) {
        // Center inside rect — push out via shortest axis
        const left = ent.x - wall.x;
        const right = wall.x + wall.w - ent.x;
        const top = ent.y - wall.y;
        const bottom = wall.y + wall.h - ent.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) ent.x = wall.x - r;
        else if (m === right) ent.x = wall.x + wall.w + r;
        else if (m === top) ent.y = wall.y - r;
        else ent.y = wall.y + wall.h + r;
        continue;
      }
      const push = r - d + 0.01;
      ent.x += (dx / d) * push;
      ent.y += (dy / d) * push;
    }
    ent.x = clamp(ent.x, 14 + r, W - 14 - r);
    ent.y = clamp(ent.y, 28 + r, H - 18 - r);
  }

  function formatClock(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function inputVector() {
    let x = 0;
    let y = 0;
    if (keys.ArrowLeft || keys.a || keys.A) x -= 1;
    if (keys.ArrowRight || keys.d || keys.D) x += 1;
    if (keys.ArrowUp || keys.w || keys.W) y -= 1;
    if (keys.ArrowDown || keys.s || keys.S) y += 1;
    if (stick.active) {
      x += stick.x;
      y += stick.y;
    }
    if (pointerAim.active) {
      x += pointerAim.x;
      y += pointerAim.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    } else if (len > 0.08) {
      // keep
    } else {
      x = 0;
      y = 0;
    }
    return { x, y };
  }

  function parcelById(id) {
    return state.parcels.find((p) => p.id === id) || null;
  }

  function heldParcel() {
    return state.held ? parcelById(state.held) : null;
  }

  function openParcelsCount() {
    // Open = not docked and not held
    let n = 0;
    for (const p of state.parcels) {
      if (p.docked) continue;
      if (state.held === p.id) continue;
      n += 1;
    }
    return n;
  }

  function risingSolidInteract() {
    const p = state.player;
    // 1) On matching dock while holding → deliver
    if (state.held) {
      const dock = state.docks.find((d) => d.id === state.held);
      if (dock) {
        const cx = dock.x + dock.w / 2;
        const cy = dock.y + dock.h / 2;
        if (dist(p.x, p.y, cx, cy) <= INTERACT_R + 8) {
          const parcel = parcelById(state.held);
          parcel.docked = true;
          parcel.x = cx;
          parcel.y = cy;
          state.held = null;
          state.delivered += 1;
          sfx.deliver();
          floater("DELIVERED", p.x, p.y - 20, dock.color);
          burst(cx, cy, dock.color);
          if (state.delivered >= 3) {
            // Defer victory until after this frame's guard move + photo resolve.
            // Already-in-cone fails immediately; same-frame cone entry fails after updateGuards.
            if (isPhotoExposed()) failRun("photo");
            else state.pendingWin = true;
          }
          return;
        }
      }
    }

    // 2) Nearest free parcel in range → pick up
    let best = null;
    let bestD = INTERACT_R;
    for (const parcel of state.parcels) {
      if (parcel.docked) continue;
      if (state.held === parcel.id) continue;
      // Don't steal if somehow "held" — only free on floor
      if (state.held && state.held !== parcel.id) {
        // can swap only if dropping first — handled below
      }
      if (state.held) break;
      const d = dist(p.x, p.y, parcel.x, parcel.y);
      if (d <= bestD) {
        bestD = d;
        best = parcel;
      }
    }
    if (best && !state.held) {
      state.held = best.id;
      sfx.pickup();
      floater("PICK UP", best.x, best.y - 16, best.color);
      return;
    }

    // 3) Else if holding → drop at feet
    if (state.held) {
      const parcel = parcelById(state.held);
      parcel.x = p.x;
      parcel.y = p.y + 18;
      resolveCircleWalls(parcel, parcel.r);
      state.held = null;
      sfx.drop();
      floater("DROP", p.x, p.y - 16, parcel.color);
    }
  }

  function pointInCone(px, py, guard) {
    const dx = px - guard.x;
    const dy = py - guard.y;
    const d = Math.hypot(dx, dy);
    if (d > CONE_LEN || d < 1) return false;
    const ang = Math.atan2(dy, dx);
    let diff = ang - guard.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > CONE_HALF) return false;
    // Occlusion: coarse sample along ray vs walls
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const sx = guard.x + dx * t;
      const sy = guard.y + dy * t;
      for (const wall of state.walls) {
        if (
          sx >= wall.x &&
          sx <= wall.x + wall.w &&
          sy >= wall.y &&
          sy <= wall.y + wall.h
        ) {
          return false;
        }
      }
    }
    return true;
  }

  function updateGuards(dt) {
    for (const g of state.guards) {
      if (g.wait > 0) {
        g.wait -= dt;
        continue;
      }
      const target = g.path[g.pathIndex];
      const dx = target.x - g.x;
      const dy = target.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        g.pathIndex = (g.pathIndex + 1) % g.path.length;
        g.wait = 0.35;
        g.stuck = 0;
        continue;
      }
      const before = d;
      const ox = g.x;
      const oy = g.y;
      const sp = GUARD_SPEED * dt;
      g.x += (dx / d) * Math.min(sp, d);
      g.y += (dy / d) * Math.min(sp, d);
      g.heading = Math.atan2(dy, dx);
      resolveCircleWalls(g, g.r);
      const moved = Math.hypot(g.x - ox, g.y - oy);
      const after = Math.hypot(target.x - g.x, target.y - g.y);
      if (moved < 0.25 || after >= before - 0.15) {
        g.stuck = (g.stuck || 0) + dt;
        if (g.stuck > 0.7) {
          // Skip blocked waypoint rather than freeze on a counter forever.
          g.pathIndex = (g.pathIndex + 1) % g.path.length;
          g.wait = 0.15;
          g.stuck = 0;
        }
      } else {
        g.stuck = 0;
      }
    }
  }

  function isPhotoExposed() {
    if (state.mode !== "solid") return false;
    for (const g of state.guards) {
      if (pointInCone(state.player.x, state.player.y, g)) {
        state.photoGuard = g;
        return true;
      }
    }
    return false;
  }

  function checkPhoto() {
    if (!isPhotoExposed()) return;
    failRun("photo");
  }

  function floater(text, x, y, color) {
    state.floaters.push({
      text,
      x,
      y,
      color: color || "#e8eefc",
      life: 0.9,
      vy: -28,
    });
  }

  function burst(x, y, color) {
    for (let i = 0; i < 14; i += 1) {
      const a = (Math.PI * 2 * i) / 14;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * (40 + Math.random() * 60),
        vy: Math.sin(a) * (40 + Math.random() * 60),
        life: 0.45 + Math.random() * 0.25,
        color,
        r: 2 + Math.random() * 2,
      });
    }
  }

  function syncChrome() {
    hudParcels.textContent = state.delivered + " / 3";
    hudTimer.textContent = formatClock(state.timeLeft);
    const modeLabel = state.mode === "solid" ? "Solid" : "Ghost";
    hudMode.textContent = modeLabel;
    pillMode.textContent = modeLabel;
    pillMode.classList.toggle("ghost", state.mode === "ghost");
    pillMode.classList.toggle("solid", state.mode === "solid");
    const held = heldParcel();
    if (held) {
      pillHeld.hidden = false;
      pillHeld.textContent = "Holding " + held.name;
    } else {
      pillHeld.hidden = true;
    }
    if (pillHint) {
      pillHint.textContent =
        state.mode === "solid"
          ? "Solid — cones see you · interact on stop"
          : "Ghost — unseen · cannot interact";
    }
    const playing = screen === "playing";
    btnPause.disabled = !(playing || screen === "paused");
    btnPause.dataset.state = screen === "paused" ? "play" : "pause";
  }

  function fillSummary(kind) {
    summaryEl.hidden = false;
    summaryEl.className = "summary " + (kind === "won" ? "win" : "fail");
    const open = openParcelsCount();
    const held = heldParcel();
    const rows = [
      ["Parcels docked", state.delivered + " / 3"],
      ["Time left", formatClock(state.timeLeft)],
      ["Open on floor", String(open)],
      ["Held (secure)", held ? held.name : "—"],
    ];
    if (kind === "failed" && state.failReason === "photo") {
      rows.unshift(["Cause", "Photo — solid in vision cone"]);
    } else if (kind === "failed" && state.failReason === "shift") {
      if (open > 0) {
        rows.unshift(["Cause", "Shift ended · parcel left open"]);
      } else if (held) {
        rows.unshift(["Cause", "Shift ended · parcel still held (undelivered)"]);
      } else {
        rows.unshift(["Cause", "Shift ended · parcels undelivered"]);
      }
    } else if (kind === "won") {
      rows.unshift(["Result", "All parcels sealed at docks"]);
    }
    summaryEl.innerHTML = rows
      .map(
        ([k, v]) =>
          '<div class="row"><span>' +
          k +
          "</span><strong>" +
          v +
          "</strong></div>"
      )
      .join("");
  }

  function showScreen(kind) {
    screen = kind;
    overlay.hidden = false;
    summaryEl.hidden = true;
    startBtn.hidden = true;
    resumeBtn.hidden = true;
    restartBtn.hidden = true;

    if (kind === "title") {
      overlayKicker.textContent = "Launch brief";
      overlayTitle.textContent = "Parcel Ghost";
      overlayText.textContent =
        "You are a courier who only EXISTS while holding still. Move and you become a ghost — cameras and guards forget you, but you cannot touch parcels. Stand still ~0.12s to solidify, then pick up, drop, or deliver.";
      overlayFine.textContent =
        "Win: dock all 3 before the 90s shift ends. Fail: photo (solid inside a guard cone) or any parcel left in the open when time runs out. A held parcel counts as secure.";
      startBtn.hidden = false;
      startBtn.textContent = "Begin shift";
    } else if (kind === "paused") {
      overlayKicker.textContent = "Paused";
      overlayTitle.textContent = "Hold pattern";
      overlayText.textContent =
        "Shift clock is frozen. Ghost when moving; solidify when still. When you solidify, you automatically pick up, drop, or deliver if you're in range.";
      overlayFine.textContent = "Esc / P resumes. Mid-run: parcels · timer · Ghost/Solid.";
      resumeBtn.hidden = false;
      restartBtn.hidden = false;
      fillSummary("paused");
      summaryEl.className = "summary";
    } else if (kind === "won") {
      overlayKicker.textContent = "Shift clear";
      overlayTitle.textContent = "All parcels docked";
      overlayText.textContent =
        "You existed only when it mattered. Security never got a clean photo, and nothing was left in the open.";
      overlayFine.textContent = "New shift to run it again.";
      restartBtn.hidden = false;
      fillSummary("won");
    } else if (kind === "failed") {
      overlayKicker.textContent = "Shift failed";
      overlayTitle.textContent =
        state.failReason === "photo" ? "Caught on camera" : "Shift overtime";
      if (state.failReason === "photo") {
        overlayText.textContent =
          "You solidified inside a guard vision cone. Flash. File. You're done.";
      } else {
        const openN = openParcelsCount();
        const heldP = heldParcel();
        if (openN > 0) {
          overlayText.textContent =
            "The atrium lights flipped. A parcel was still on the floor (open) when the shift ended.";
        } else if (heldP) {
          overlayText.textContent =
            "The atrium lights flipped. " +
            heldP.name +
            " was still in hand — secure from the floor, but undelivered when the shift ended.";
        } else {
          overlayText.textContent =
            "The atrium lights flipped before every parcel was docked.";
        }
      }
      overlayFine.textContent = "Try again — ghost through cones, solidify only in cover.";
      restartBtn.hidden = false;
      fillSummary("failed");
    }
    syncChrome();
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function startRun() {
    Object.assign(state, blankState());
    screen = "playing";
    hideOverlay();
    flash = 0;
    shake = 0;
    tickLeft = 0;
    sfx.unlock();
    sfx.ui();
    syncChrome();
  }

  function winRun() {
    if (screen !== "playing") return;
    state.pendingWin = false;
    sfx.win();
    flash = 0.5;
    showScreen("won");
  }

  function failRun(reason) {
    if (screen !== "playing") return;
    state.pendingWin = false;
    state.failReason = reason;
    if (reason === "photo") {
      sfx.photo();
      flash = 0.85;
      shake = 10;
    } else {
      sfx.fail();
      flash = 0.4;
    }
    showScreen("failed");
  }

  function togglePause() {
    if (screen === "playing") {
      sfx.ui();
      showScreen("paused");
    } else if (screen === "paused") {
      sfx.ui();
      screen = "playing";
      hideOverlay();
      syncChrome();
    }
  }

  function updatePlay(dt) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 10 && state.timeLeft > 0) {
      tickLeft -= dt;
      if (tickLeft <= 0) {
        sfx.tick();
        tickLeft = state.timeLeft <= 5 ? 0.5 : 1;
      }
    }
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      if (openParcelsCount() > 0) failRun("shift");
      else if (state.delivered >= 3) winRun();
      else failRun("shift");
      return;
    }

    const input = inputVector();
    const p = state.player;
    const ox = p.x;
    const oy = p.y;

    // Apply wish movement, then judge existence by actual displacement
    // (input into a wall must NOT keep you Ghost forever).
    if (Math.hypot(input.x, input.y) > 0.05) {
      p.vx = input.x * PLAYER_SPEED;
      p.vy = input.y * PLAYER_SPEED;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      resolveCircleWalls(p, PLAYER_R);
    } else {
      p.vx = 0;
      p.vy = 0;
    }

    const moved = Math.hypot(p.x - ox, p.y - oy) > 0.2;
    if (moved) {
      state.stillTimer = 0;
      if (state.mode === "solid") {
        state.mode = "ghost";
        state.wasSolid = false;
        sfx.ghost();
      }
    } else {
      state.stillTimer += dt;
      if (state.mode === "ghost" && state.stillTimer >= SOLIDIFY_SEC) {
        state.mode = "solid";
        sfx.solidify();
        // Rising edge interact
        if (!state.wasSolid) {
          risingSolidInteract();
        }
        state.wasSolid = true;
      }
    }

    // Held parcel follows player
    if (state.held) {
      const parcel = parcelById(state.held);
      if (parcel && !parcel.docked) {
        parcel.x = p.x + 10;
        parcel.y = p.y - 14;
      }
    }

    updateGuards(dt);
    checkPhoto();

    // Commit deferred win only if still playing and still unexposed after guard step.
    if (state.pendingWin && screen === "playing") {
      state.pendingWin = false;
      if (isPhotoExposed()) failRun("photo");
      else winRun();
    }

    // Particles / floaters
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const q = state.particles[i];
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.96;
      q.vy *= 0.96;
      if (q.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }

    if (flash > 0) flash = Math.max(0, flash - dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 18);

    syncChrome();
  }

  function drawFloor() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a1020");
    g.addColorStop(1, "#060914");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Subtle tile lines
    ctx.strokeStyle = "rgba(80, 100, 140, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 30);
      ctx.lineTo(x, H - 20);
      ctx.stroke();
    }
    for (let y = 40; y < H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(W - 16, y);
      ctx.stroke();
    }
  }

  function drawWalls() {
    for (const wall of state.walls) {
      ctx.fillStyle = "#151c2e";
      ctx.strokeStyle = "#2a3550";
      ctx.lineWidth = 1.5;
      roundRect(wall.x, wall.y, wall.w, wall.h, 4);
      ctx.fill();
      ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawDocks() {
    for (const dock of state.docks) {
      const delivered = state.parcels.find((p) => p.id === dock.id && p.docked);
      ctx.save();
      ctx.strokeStyle = dock.color;
      ctx.fillStyle = delivered
        ? hexAlpha(dock.color, 0.35)
        : hexAlpha(dock.color, 0.1);
      ctx.lineWidth = 2;
      ctx.setLineDash(delivered ? [] : [5, 4]);
      roundRect(dock.x, dock.y, dock.w, dock.h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = dock.color;
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(dock.name.toUpperCase(), dock.x + dock.w / 2, dock.y - 5);
      ctx.restore();
    }
  }

  function drawParcels() {
    for (const parcel of state.parcels) {
      if (parcel.docked) {
        // Already drawn at dock center as sealed stamp
        ctx.save();
        ctx.fillStyle = parcel.color;
        ctx.beginPath();
        ctx.arc(parcel.x, parcel.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (state.held === parcel.id) {
        // drawn with player
        continue;
      }
      drawParcelIcon(parcel.x, parcel.y, parcel.color, parcel.r);
    }
  }

  function drawParcelIcon(x, y, color, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r, -r * 0.5);
    ctx.lineTo(0, -r);
    ctx.lineTo(r, -r * 0.5);
    ctx.lineTo(r, r * 0.55);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCone(guard) {
    const a0 = guard.heading - CONE_HALF;
    const a1 = guard.heading + CONE_HALF;
    ctx.beginPath();
    ctx.moveTo(guard.x, guard.y);
    ctx.arc(guard.x, guard.y, CONE_LEN, a0, a1);
    ctx.closePath();
    const grad = ctx.createRadialGradient(
      guard.x,
      guard.y,
      8,
      guard.x,
      guard.y,
      CONE_LEN
    );
    grad.addColorStop(0, "rgba(255, 90, 100, 0.28)");
    grad.addColorStop(1, "rgba(255, 90, 100, 0.02)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 120, 130, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawGuards() {
    for (const g of state.guards) {
      drawCone(g);
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.heading);
      ctx.fillStyle = "#dce3f5";
      ctx.beginPath();
      ctx.arc(0, 0, g.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff6b7a";
      ctx.beginPath();
      ctx.moveTo(g.r - 2, 0);
      ctx.lineTo(-4, -6);
      ctx.lineTo(-4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer() {
    const p = state.player;
    const solid = state.mode === "solid";
    ctx.save();
    ctx.translate(p.x, p.y);

    if (solid) {
      ctx.fillStyle = "#7ee0c8";
      ctx.strokeStyle = "#d8fff4";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // accent ring
      ctx.strokeStyle = "#3dcf9a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_R + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(126, 224, 200, 0.7)";
      ctx.fillStyle = "rgba(126, 224, 200, 0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (state.held) {
      const parcel = parcelById(state.held);
      if (parcel) drawParcelIcon(10, -16, parcel.color, 7);
    }
    ctx.restore();
  }

  function hexAlpha(hex, a) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  function drawFx() {
    for (const q of state.particles) {
      ctx.globalAlpha = clamp(q.life * 2, 0, 1);
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const f of state.floaters) {
      ctx.globalAlpha = clamp(f.life * 1.4, 0, 1);
      ctx.fillStyle = f.color;
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + clamp(flash, 0, 0.75) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function draw() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawFloor();
    drawWalls();
    drawDocks();
    drawGuards();
    drawParcels();
    if (screen === "playing" || screen === "paused" || screen === "won" || screen === "failed") {
      drawPlayer();
    } else {
      // idle preview player ghost near spawn
      const p = state.player;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(126, 224, 200, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    drawFx();
    ctx.restore();

    // Objective ribbon while playing
    if (screen === "playing") {
      ctx.fillStyle = "rgba(6, 10, 20, 0.55)";
      roundRect(16, 34, W - 32, 28, 8);
      ctx.fill();
      ctx.fillStyle = "#c5d0ea";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        "Deliver " + state.delivered + "/3 · " + formatClock(state.timeLeft) + " · " +
          (state.mode === "solid" ? "SOLID" : "GHOST"),
        28,
        53
      );
    }
  }

  function frame(ts) {
    const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    if (screen === "playing") updatePlay(dt);
    else {
      if (flash > 0) flash = Math.max(0, flash - dt);
      if (shake > 0) shake = Math.max(0, shake - dt * 18);
    }
    draw();
    requestAnimationFrame(frame);
  }

  // --- Input ---
  window.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (
      e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === " " ||
      e.key === "Spacebar"
    ) {
      e.preventDefault();
    }
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      e.preventDefault();
      if (screen === "playing" || screen === "paused") togglePause();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });

  function setStickFromEvent(clientX, clientY) {
    const rect = stickEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.36;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    stick.x = dx / max;
    stick.y = dy / max;
    stick.active = Math.hypot(stick.x, stick.y) > 0.08;
    stickKnob.style.transform =
      "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
  }

  function resetStick() {
    stick.x = 0;
    stick.y = 0;
    stick.active = false;
    stickKnob.style.transform = "translate(-50%, -50%)";
  }

  stickEl.addEventListener(
    "pointerdown",
    (e) => {
      stickEl.setPointerCapture(e.pointerId);
      setStickFromEvent(e.clientX, e.clientY);
      sfx.unlock();
    },
    { passive: true }
  );
  stickEl.addEventListener(
    "pointermove",
    (e) => {
      if (!stickEl.hasPointerCapture(e.pointerId)) return;
      setStickFromEvent(e.clientX, e.clientY);
    },
    { passive: true }
  );
  function endStick(e) {
    if (stickEl.hasPointerCapture(e.pointerId)) stickEl.releasePointerCapture(e.pointerId);
    resetStick();
  }
  stickEl.addEventListener("pointerup", endStick);
  stickEl.addEventListener("pointercancel", endStick);

  // Canvas pointer steer toward drag delta from player screen pos
  let canvasPtr = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvasPtr = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    sfx.unlock();
    aimFromCanvas(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (canvasPtr !== e.pointerId) return;
    aimFromCanvas(e);
  });
  function endCanvasPtr(e) {
    if (canvasPtr !== e.pointerId) return;
    canvasPtr = null;
    pointerAim.active = false;
    pointerAim.x = 0;
    pointerAim.y = 0;
  }
  canvas.addEventListener("pointerup", endCanvasPtr);
  canvas.addEventListener("pointercancel", endCanvasPtr);

  function aimFromCanvas(e) {
    if (screen !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    const dx = sx - state.player.x;
    const dy = sy - state.player.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) {
      pointerAim.active = false;
      pointerAim.x = 0;
      pointerAim.y = 0;
      return;
    }
    pointerAim.x = dx / len;
    pointerAim.y = dy / len;
    pointerAim.active = true;
  }

  startBtn.addEventListener("click", () => {
    sfx.unlock();
    startRun();
  });
  resumeBtn.addEventListener("click", () => {
    sfx.unlock();
    togglePause();
  });
  restartBtn.addEventListener("click", () => {
    sfx.unlock();
    startRun();
  });
  btnPause.addEventListener("click", () => {
    sfx.unlock();
    togglePause();
  });

  // Boot
  showScreen("title");
  syncChrome();
  requestAnimationFrame((ts) => {
    lastTs = ts;
    requestAnimationFrame(frame);
  });
})();
