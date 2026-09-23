/* Parcel Ghost — collision and vision-cone math. Pure functions, no DOM. */
(function (PG) {
  "use strict";

  const { BOUNDS, CONE_LEN, CONE_HALF, CONE_OCCLUSION_STEPS } = PG.TUNING;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function circleHitsRect(cx, cy, r, rect) {
    const dx = cx - clamp(cx, rect.x, rect.x + rect.w);
    const dy = cy - clamp(cy, rect.y, rect.y + rect.h);
    return dx * dx + dy * dy < r * r;
  }

  /** Push a circle entity `{x, y}` out of every wall, then clamp it inside the atrium. */
  function resolveCircleWalls(ent, r, walls) {
    for (const wall of walls) {
      if (!circleHitsRect(ent.x, ent.y, r, wall)) continue;
      const dx = ent.x - clamp(ent.x, wall.x, wall.x + wall.w);
      const dy = ent.y - clamp(ent.y, wall.y, wall.y + wall.h);
      const d = Math.hypot(dx, dy);
      if (d < 0.0001) {
        // Center is inside the rect: exit through the nearest edge.
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
    ent.x = clamp(ent.x, BOUNDS.left + r, BOUNDS.right - r);
    ent.y = clamp(ent.y, BOUNDS.top + r, BOUNDS.bottom - r);
  }

  /** True if (px, py) is inside the guard's cone with a clear line of sight. */
  function pointInCone(px, py, guard, walls) {
    const dx = px - guard.x;
    const dy = py - guard.y;
    const d = Math.hypot(dx, dy);
    if (d > CONE_LEN || d < 1) return false;
    if (Math.abs(wrapAngle(Math.atan2(dy, dx) - guard.heading)) > CONE_HALF) return false;
    // Coarse occlusion: sample along the ray and reject if any sample lands in a wall.
    for (let i = 1; i <= CONE_OCCLUSION_STEPS; i += 1) {
      const t = i / CONE_OCCLUSION_STEPS;
      const sx = guard.x + dx * t;
      const sy = guard.y + dy * t;
      if (walls.some((wall) => pointInRect(sx, sy, wall))) return false;
    }
    return true;
  }

  PG.geo = { clamp, dist, wrapAngle, pointInRect, circleHitsRect, resolveCircleWalls, pointInCone };
})((globalThis.PG = globalThis.PG || {}));
