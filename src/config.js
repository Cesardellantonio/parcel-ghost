/* Parcel Ghost — tuning constants and the atrium layout. Pure data, no DOM. */
(function (PG) {
  "use strict";

  const W = 390;
  const H = 620;

  const TUNING = Object.freeze({
    W,
    H,
    SHIFT_SEC: 90,
    SOLIDIFY_SEC: 0.12,
    /** Minimum real displacement per frame that counts as "moving" (pushing into a wall does not). */
    MOVE_EPSILON: 0.2,
    INPUT_DEADZONE: 0.08,
    PLAYER_R: 12,
    PLAYER_SPEED: 145,
    INTERACT_R: 28,
    DOCK_INTERACT_R: 36,
    PARCEL_R: 9,
    GUARD_R: 11,
    GUARD_SPEED: 52,
    GUARD_WAYPOINT_WAIT: 0.35,
    GUARD_STUCK_SEC: 0.7,
    CONE_LEN: 108,
    CONE_HALF: 0.36, // radians half-angle
    CONE_OCCLUSION_STEPS: 8,
    PARCEL_COUNT: 3,
    /** Inner bounds of the outer walls; entities are clamped inside. */
    BOUNDS: Object.freeze({ left: 14, right: W - 14, top: 28, bottom: H - 18 }),
  });

  const COLORS = Object.freeze({
    jade: "#3dcf9a",
    ion: "#6aa8ff",
    amber: "#f0b45a",
  });

  const ROUTES = Object.freeze([
    { id: "jade", name: "Jade" },
    { id: "ion", name: "Ion" },
    { id: "amber", name: "Amber" },
  ]);

  // Layout factories return fresh objects so each run can mutate its own copy.
  const LEVEL = Object.freeze({
    // Spawn is outside every guard's opening cone (guard 3 starts facing east, away from it).
    spawn: () => ({ x: 100, y: 500 }),

    // Night atrium pillars / counters, leaving corridors between them.
    walls: () => [
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
    ],

    parcels: () => [
      { id: "jade", x: 55, y: 180 },
      { id: "ion", x: 335, y: 260 },
      { id: "amber", x: 250, y: 500 },
    ],

    docks: () => [
      { id: "jade", x: 320, y: 70, w: 44, h: 28 },
      { id: "ion", x: 30, y: 380, w: 44, h: 28 },
      { id: "amber", x: 175, y: 70, w: 44, h: 28 },
    ],

    // Patrol routes stay in clear corridors (no counter collisions).
    guards: () => [
      {
        heading: 0,
        wait: 0,
        path: [
          { x: 70, y: 90 },
          { x: 320, y: 90 },
          { x: 320, y: 180 },
          { x: 70, y: 180 },
        ],
      },
      {
        heading: 0,
        wait: 0.35,
        path: [
          { x: 160, y: 280 },
          { x: 230, y: 280 },
          { x: 230, y: 370 },
          { x: 160, y: 370 },
        ],
      },
      {
        heading: 0, // face east, away from spawn
        wait: 0.55,
        path: [
          { x: 80, y: 560 },
          { x: 300, y: 560 },
          { x: 200, y: 560 },
          { x: 200, y: 480 },
          { x: 80, y: 480 },
        ],
      },
    ],
  });

  PG.TUNING = TUNING;
  PG.COLORS = COLORS;
  PG.ROUTES = ROUTES;
  PG.LEVEL = LEVEL;
})((globalThis.PG = globalThis.PG || {}));
