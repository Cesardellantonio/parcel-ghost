/* Headless rule tests for the locked design. Run: node --test tests/*.test.js */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

for (const f of ["config", "geometry", "sim", "ui"]) require("../src/" + f + ".js");
const { TUNING: T, sim, ui } = globalThis.PG;

const DT = 1 / 60;
const STILL = { x: 0, y: 0 };

function steps(run, n, input = STILL) {
  const events = [];
  for (let i = 0; i < n && !run.outcome; i += 1) events.push(...sim.stepRun(run, input, DT));
  return events;
}

/** Stand still until the courier solidifies (the rising edge that interacts). */
function solidify(run) {
  return steps(run, Math.ceil(T.SOLIDIFY_SEC / DT) + 1);
}

function teleport(run, x, y) {
  run.player.x = x;
  run.player.y = y;
  run.mode = "ghost";
  run.stillTimer = 0;
}

function dockCenter(run, id) {
  const d = sim.dockFor(run, id);
  return { x: d.x + d.w / 2, y: d.y + d.h / 2 };
}

/** Two parcels already docked, courier ghosting onto the Jade dock carrying Jade. */
function finalDeliverySetup(guards) {
  const run = sim.createRun();
  for (const p of run.parcels) if (p.id !== "jade") p.docked = true;
  run.delivered = 2;
  run.heldId = "jade";
  const c = dockCenter(run, "jade");
  teleport(run, c.x, c.y);
  run.guards = guards;
  return { run, c };
}

function staticGuard(x, y, heading, path) {
  return { x, y, r: T.GUARD_R, heading, path: path || [{ x, y }], pathIndex: 0, wait: 0, stuck: 0 };
}

test("spawn is safe: solidifying at spawn on the first frames is not a photo", () => {
  const run = sim.createRun();
  solidify(run);
  assert.equal(run.mode, "solid");
  assert.equal(run.outcome, null);
});

test("moving keeps you ghost; stopping solidifies after SOLIDIFY_SEC", () => {
  const run = sim.createRun();
  steps(run, 30, { x: 1, y: 0 });
  assert.equal(run.mode, "ghost");
  const events = solidify(run);
  assert.equal(run.mode, "solid");
  assert.ok(events.some((e) => e.type === "solidify"));
  steps(run, 2, { x: -1, y: 0 });
  assert.equal(run.mode, "ghost");
});

test("existence follows real displacement: pushing into a wall still solidifies", () => {
  const run = sim.createRun();
  teleport(run, T.BOUNDS.left + T.PLAYER_R, 250);
  run.guards = [];
  steps(run, 20, { x: -1, y: 0 });
  assert.equal(run.mode, "solid");
});

test("ghosts are never photographed, even inside a cone", () => {
  const run = sim.createRun();
  run.guards = [staticGuard(200, 200, 0)];
  teleport(run, 250, 200);
  steps(run, 60, { x: 0, y: 1 }); // walking through the cone
  assert.equal(run.outcome, null);
});

test("solidifying inside a guard cone fails with a photo", () => {
  const run = sim.createRun();
  run.guards = [staticGuard(200, 190, 0)];
  teleport(run, 260, 190);
  const events = solidify(run);
  assert.deepEqual(run.outcome, { result: "failed", reason: "photo" });
  assert.ok(events.some((e) => e.type === "failed" && e.reason === "photo"));
});

test("walls block the cone", () => {
  const run = sim.createRun();
  // Counter at y 220..238 sits between guard and courier.
  run.guards = [staticGuard(195, 200, Math.PI / 2)];
  teleport(run, 195, 260);
  solidify(run);
  assert.equal(run.outcome, null);
});

test("pick up on the rising edge only, drop on the next stop, deliver on the matching dock", () => {
  const run = sim.createRun();
  run.guards = [];
  const jade = run.parcels.find((p) => p.id === "jade");
  teleport(run, jade.x + 5, jade.y);
  solidify(run);
  assert.equal(run.heldId, "jade");

  steps(run, 60); // staying solid must not re-trigger (no drop)
  assert.equal(run.heldId, "jade");

  steps(run, 3, { x: 0, y: 1 });
  solidify(run);
  assert.equal(run.heldId, null, "stopping away from the dock drops the parcel");

  jade.x = run.player.x;
  jade.y = run.player.y;
  steps(run, 2, { x: 1, y: 0 });
  solidify(run);
  assert.equal(run.heldId, "jade");

  const c = dockCenter(run, "jade");
  teleport(run, c.x, c.y);
  solidify(run);
  assert.equal(jade.docked, true);
  assert.equal(run.delivered, 1);
  assert.equal(run.outcome, null);
});

test("wrong dock does not deliver", () => {
  const run = sim.createRun();
  run.guards = [];
  run.heldId = "jade";
  const c = dockCenter(run, "amber");
  teleport(run, c.x, c.y + 20);
  solidify(run);
  assert.equal(run.delivered, 0);
  assert.equal(run.heldId, null);
});

test("final delivery with no guard watching wins and clears pendingWin", () => {
  const { run } = finalDeliverySetup([]);
  const events = solidify(run);
  assert.deepEqual(run.outcome, { result: "won" });
  assert.equal(run.pendingWin, false);
  assert.ok(events.some((e) => e.type === "won"));
});

test("photo beats win: final delivery while already in a cone fails", () => {
  const { run, c } = finalDeliverySetup([]);
  run.guards = [staticGuard(c.x - 60, c.y, 0)];
  const events = solidify(run);
  assert.deepEqual(run.outcome, { result: "failed", reason: "photo" });
  assert.equal(run.pendingWin, false);
  assert.ok(!events.some((e) => e.type === "won"));
});

test("photo beats win: a guard stepping into range on the delivery frame fails", () => {
  const { run, c } = finalDeliverySetup([]);
  const g = staticGuard(c.x - T.CONE_LEN - 0.5, c.y, 0, [{ x: c.x, y: c.y }]);
  run.guards = [g];
  run.stillTimer = T.SOLIDIFY_SEC - DT / 2; // solidify (and deliver) on the very next step
  const events = sim.stepRun(run, STILL, DT);
  assert.ok(events.some((e) => e.type === "deliver"));
  assert.deepEqual(run.outcome, { result: "failed", reason: "photo" });
  assert.equal(run.pendingWin, false);
});

test("shift end with a parcel still held fails, with held-specific copy", () => {
  const run = sim.createRun();
  run.guards = [];
  for (const p of run.parcels) if (p.id !== "ion") p.docked = true;
  run.delivered = 2;
  run.heldId = "ion";
  run.timeLeft = DT / 2;
  sim.stepRun(run, STILL, DT);
  assert.deepEqual(run.outcome, { result: "failed", reason: "shift" });
  assert.equal(run.timeLeft, 0);
  const copy = ui.failCopy(run);
  assert.match(copy.cause, /Ion still held \(undelivered\)/);
});

test("shift end with a parcel on the floor fails", () => {
  const run = sim.createRun();
  run.timeLeft = DT / 2;
  sim.stepRun(run, STILL, DT);
  assert.deepEqual(run.outcome, { result: "failed", reason: "shift" });
  assert.equal(ui.failCopy(run), ui.COPY.failed.shiftOpen);
});

test("a finished run is frozen: no further events or state changes", () => {
  const { run } = finalDeliverySetup([]);
  solidify(run);
  const snapshot = JSON.stringify(run);
  assert.deepEqual(sim.stepRun(run, { x: 1, y: 0 }, DT), []);
  assert.equal(JSON.stringify(run), snapshot);
});

test("patrols keep cycling through every waypoint", () => {
  const run = sim.createRun();
  run.player.x = -1000; // out of every cone so the run never ends early
  const seen = run.guards.map(() => new Set());
  for (let i = 0; i < 60 * 60; i += 1) {
    run.timeLeft = T.SHIFT_SEC;
    sim.stepRun(run, STILL, DT);
    run.guards.forEach((g, gi) => seen[gi].add(g.pathIndex));
  }
  run.guards.forEach((g, gi) => assert.equal(seen[gi].size, g.path.length, "guard " + gi));
});

test("runs are independent: createRun never shares state", () => {
  const a = sim.createRun();
  a.parcels[0].docked = true;
  a.guards[0].path[0].x = -1;
  const b = sim.createRun();
  assert.equal(b.parcels[0].docked, false);
  assert.notEqual(b.guards[0].path[0].x, -1);
  assert.equal(b.pendingWin, false);
});
