/* Parcel Ghost — canvas rendering and cosmetic effects. Reads run state, never changes rules. */
(function (PG) {
  "use strict";

  const { W, H, PLAYER_R, CONE_LEN, CONE_HALF, PARCEL_COUNT } = PG.TUNING;
  const { clamp } = PG.geo;
  const TAU = Math.PI * 2;

  // --- Effects (particles, floating labels, camera flash, screen shake) ---

  function createFx() {
    return { particles: [], floaters: [], flash: 0, shake: 0 };
  }

  function floater(fx, text, x, y, color) {
    fx.floaters.push({ text, x, y, color: color || "#e8eefc", life: 0.9, vy: -28 });
  }

  function burst(fx, x, y, color) {
    const n = 14;
    for (let i = 0; i < n; i += 1) {
      const a = (TAU * i) / n;
      const speed = 40 + Math.random() * 60;
      fx.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.45 + Math.random() * 0.25,
        color,
        r: 2 + Math.random() * 2,
      });
    }
  }

  function updateFx(fx, dt, animateBodies) {
    if (animateBodies) {
      fx.particles = fx.particles.filter((q) => {
        q.life -= dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= 0.96;
        q.vy *= 0.96;
        return q.life > 0;
      });
      fx.floaters = fx.floaters.filter((f) => {
        f.life -= dt;
        f.y += f.vy * dt;
        return f.life > 0;
      });
    }
    fx.flash = Math.max(0, fx.flash - dt);
    fx.shake = Math.max(0, fx.shake - dt * 18);
  }

  // --- Drawing ---

  function createRenderer(canvas) {
    const ctx = canvas.getContext("2d");

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

    function circle(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
    }

    function drawFloor() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0a1020");
      g.addColorStop(1, "#060914");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(80, 100, 140, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 20; x < W; x += 32) {
        ctx.moveTo(x, 30);
        ctx.lineTo(x, H - 20);
      }
      for (let y = 40; y < H; y += 32) {
        ctx.moveTo(16, y);
        ctx.lineTo(W - 16, y);
      }
      ctx.stroke();
    }

    function drawWalls(run) {
      ctx.fillStyle = "#151c2e";
      ctx.strokeStyle = "#2a3550";
      ctx.lineWidth = 1.5;
      for (const wall of run.walls) {
        roundRect(wall.x, wall.y, wall.w, wall.h, 4);
        ctx.fill();
        ctx.stroke();
      }
    }

    function drawDocks(run) {
      for (const dock of run.docks) {
        const sealed = run.parcels.some((p) => p.id === dock.id && p.docked);
        ctx.save();
        ctx.strokeStyle = dock.color;
        ctx.fillStyle = hexAlpha(dock.color, sealed ? 0.35 : 0.1);
        ctx.lineWidth = 2;
        ctx.setLineDash(sealed ? [] : [5, 4]);
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

    function drawParcels(run) {
      for (const parcel of run.parcels) {
        if (parcel.id === run.heldId) continue; // drawn with the player
        if (parcel.docked) {
          ctx.fillStyle = parcel.color;
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          circle(parcel.x, parcel.y, 7);
          ctx.fill();
          ctx.stroke();
        } else {
          drawParcelIcon(parcel.x, parcel.y, parcel.color, parcel.r);
        }
      }
    }

    function drawCone(g) {
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.arc(g.x, g.y, CONE_LEN, g.heading - CONE_HALF, g.heading + CONE_HALF);
      ctx.closePath();
      const grad = ctx.createRadialGradient(g.x, g.y, 8, g.x, g.y, CONE_LEN);
      grad.addColorStop(0, "rgba(255, 90, 100, 0.28)");
      grad.addColorStop(1, "rgba(255, 90, 100, 0.02)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 120, 130, 0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function drawGuards(run) {
      for (const g of run.guards) {
        drawCone(g);
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.heading);
        ctx.fillStyle = "#dce3f5";
        circle(0, 0, g.r);
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

    function drawPlayer(run) {
      const p = run.player;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (run.mode === "solid") {
        ctx.fillStyle = "#7ee0c8";
        ctx.strokeStyle = "#d8fff4";
        ctx.lineWidth = 2.5;
        circle(0, 0, PLAYER_R);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#3dcf9a";
        ctx.lineWidth = 2;
        circle(0, 0, PLAYER_R + 4);
        ctx.stroke();
      } else {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(126, 224, 200, 0.7)";
        ctx.fillStyle = "rgba(126, 224, 200, 0.12)";
        ctx.lineWidth = 2;
        circle(0, 0, PLAYER_R);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const held = PG.sim.heldParcel(run);
      if (held) drawParcelIcon(10, -16, held.color, 7);
      ctx.restore();
    }

    /** Title-screen placeholder: a faint outline at spawn. */
    function drawSpawnPreview(run) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(126, 224, 200, 0.55)";
      ctx.lineWidth = 2;
      circle(run.player.x, run.player.y, PLAYER_R);
      ctx.stroke();
      ctx.restore();
    }

    function drawFx(fx) {
      for (const q of fx.particles) {
        ctx.globalAlpha = clamp(q.life * 2, 0, 1);
        ctx.fillStyle = q.color;
        circle(q.x, q.y, q.r);
        ctx.fill();
      }
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      for (const f of fx.floaters) {
        ctx.globalAlpha = clamp(f.life * 1.4, 0, 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      if (fx.flash > 0) {
        ctx.fillStyle = "rgba(255,255,255," + clamp(fx.flash, 0, 0.75) + ")";
        ctx.fillRect(0, 0, W, H);
      }
    }

    function drawObjectiveRibbon(run) {
      ctx.fillStyle = "rgba(6, 10, 20, 0.55)";
      roundRect(16, 34, W - 32, 28, 8);
      ctx.fill();
      ctx.fillStyle = "#c5d0ea";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        "Deliver " + run.delivered + "/" + PARCEL_COUNT + " · " +
          PG.ui.formatClock(run.timeLeft) + " · " + run.mode.toUpperCase(),
        28,
        53
      );
    }

    /** @param {string} screen current app screen */
    function draw(run, fx, screen) {
      ctx.save();
      if (fx.shake > 0) {
        ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
      }
      drawFloor();
      drawWalls(run);
      drawDocks(run);
      drawGuards(run);
      drawParcels(run);
      if (screen === "title") drawSpawnPreview(run);
      else drawPlayer(run);
      drawFx(fx);
      ctx.restore();

      if (screen === "playing") drawObjectiveRibbon(run);
    }

    return { draw };
  }

  function hexAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  PG.render = { createRenderer, createFx, updateFx, floater, burst };
})((globalThis.PG = globalThis.PG || {}));
