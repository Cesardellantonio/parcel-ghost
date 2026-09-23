/* Parcel Ghost — HUD, overlay screens and all player-facing copy. */
(function (PG) {
  "use strict";

  const { SHIFT_SEC, SOLIDIFY_SEC, INTERACT_R, PARCEL_COUNT } = PG.TUNING;

  function formatClock(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  const COPY = {
    title: {
      kicker: "Launch brief",
      title: "Parcel Ghost",
      text:
        "You are a courier who only exists while standing still. Move and you turn ghost: guards can't see you, " +
        "but you can't touch parcels either. Stop for a beat (~" + SOLIDIFY_SEC + "s) to turn solid, and you " +
        "automatically pick up, drop, or deliver.",
      fine:
        "Win: dock all " + PARCEL_COUNT + " before the " + SHIFT_SEC + "s shift ends. Lose: a guard photographs " +
        "you solid inside its cone, or any parcel is undelivered when the shift ends (carrying one doesn't count).",
      primary: "Begin shift",
    },
    paused: {
      kicker: "Paused",
      title: "Hold pattern",
      text: "The shift clock is frozen. Move to go ghost; stop to turn solid and handle a parcel in range.",
      fine: "Esc or P resumes.",
    },
    won: {
      kicker: "Shift clear",
      title: "All parcels docked",
      text: "You existed only when it mattered. Security never got a clean photo.",
      fine: "Start a new shift to run it again.",
    },
    failed: {
      kicker: "Shift failed",
      fine: "Try again: ghost through cones, and only stop in cover.",
      photo: {
        title: "Caught on camera",
        text: "You turned solid inside a guard's vision cone. Flash. Filed. You're done.",
        cause: "Photographed while solid in a guard cone",
      },
      shiftOpen: {
        title: "Shift ended",
        text: "The atrium lights flipped with a parcel still on the floor.",
        cause: "Shift ended · parcel left on the floor",
      },
      shiftHeld: (name) => ({
        title: "Shift ended",
        text: "The atrium lights flipped with " + name + " still in hand. Carrying it isn't delivering it.",
        cause: "Shift ended · " + name + " still held (undelivered)",
      }),
      shiftOther: {
        title: "Shift ended",
        text: "The atrium lights flipped before every parcel was docked.",
        cause: "Shift ended · parcels undelivered",
      },
    },
  };

  /** Pick the fail copy variant for how the run ended. */
  function failCopy(run) {
    const f = COPY.failed;
    if (run.outcome && run.outcome.reason === "photo") return f.photo;
    if (PG.sim.openParcels(run).length > 0) return f.shiftOpen;
    const held = PG.sim.heldParcel(run);
    if (held) return f.shiftHeld(held.name);
    return f.shiftOther;
  }

  /** One-line contextual hint shown under the HUD. */
  function hintText(run) {
    if (run.mode === "solid") return "Solid: guard cones can photograph you";
    const held = PG.sim.heldParcel(run);
    if (held) {
      return PG.sim.isOnMatchingDock(run)
        ? "Stop here to deliver " + held.name
        : "Carry " + held.name + " to its dock, then stop";
    }
    const near = PG.sim.nearestFreeParcel(run, INTERACT_R);
    if (near) return "Stop here to pick up " + near.name;
    return "Ghost: unseen, but can't touch parcels";
  }

  function createUi(doc) {
    const $ = (id) => {
      const el = doc.getElementById(id);
      if (!el) throw new Error("Parcel Ghost: missing #" + id + " in index.html");
      return el;
    };
    const el = {
      overlay: $("overlay"),
      kicker: $("overlay-kicker"),
      title: $("overlay-title"),
      text: $("overlay-text"),
      fine: $("overlay-fine"),
      legend: $("legend"),
      summary: $("summary"),
      startBtn: $("start-btn"),
      resumeBtn: $("resume-btn"),
      restartBtn: $("restart-btn"),
      pauseBtn: $("btn-pause"),
      hudParcels: $("hud-parcels"),
      hudTimer: $("hud-timer"),
      hudMode: $("hud-mode"),
      pillMode: $("pill-mode"),
      pillHeld: $("pill-held"),
      pillHint: $("pill-hint"),
    };

    function syncHud(run, screen) {
      const modeLabel = run.mode === "solid" ? "Solid" : "Ghost";
      el.hudParcels.textContent = run.delivered + " / " + PARCEL_COUNT;
      el.hudTimer.textContent = formatClock(run.timeLeft);
      el.hudMode.textContent = modeLabel;
      el.pillMode.textContent = modeLabel;
      el.pillMode.classList.toggle("ghost", run.mode === "ghost");
      el.pillMode.classList.toggle("solid", run.mode === "solid");

      const held = PG.sim.heldParcel(run);
      el.pillHeld.hidden = !held;
      if (held) el.pillHeld.textContent = "Holding " + held.name;
      el.pillHint.textContent = screen === "title" ? "Stand still to exist" : hintText(run);

      const inRun = screen === "playing" || screen === "paused";
      el.pauseBtn.disabled = !inRun;
      el.pauseBtn.dataset.state = screen === "paused" ? "play" : "pause";
      el.pauseBtn.setAttribute("aria-label", screen === "paused" ? "Resume" : "Pause");
    }

    function renderSummary(run, variant, cause) {
      const held = PG.sim.heldParcel(run);
      const rows = [
        ["Parcels docked", run.delivered + " / " + PARCEL_COUNT],
        ["Time left", formatClock(run.timeLeft)],
        ["On the floor", String(PG.sim.openParcels(run).length)],
        ["In hand", held ? held.name : "—"],
      ];
      if (cause) rows.unshift(cause);
      el.summary.className = "summary" + (variant ? " " + variant : "");
      el.summary.replaceChildren(
        ...rows.map(([label, value]) => {
          const row = doc.createElement("div");
          row.className = "row";
          const k = doc.createElement("span");
          k.textContent = label;
          const v = doc.createElement("strong");
          v.textContent = value;
          row.append(k, v);
          return row;
        })
      );
      el.summary.hidden = false;
    }

    function setCard({ kicker, title, text, fine }) {
      el.kicker.textContent = kicker;
      el.title.textContent = title;
      el.text.textContent = text;
      el.fine.textContent = fine;
    }

    /** Show the overlay card for `screen`, or hide it while playing. */
    function showScreen(screen, run) {
      el.overlay.hidden = screen === "playing";
      el.summary.hidden = true;
      el.legend.hidden = screen !== "title";
      el.startBtn.hidden = screen !== "title";
      el.resumeBtn.hidden = screen !== "paused";
      el.restartBtn.hidden = !(screen === "paused" || screen === "won" || screen === "failed");

      if (screen === "title") {
        setCard(COPY.title);
        el.startBtn.textContent = COPY.title.primary;
      } else if (screen === "paused") {
        setCard(COPY.paused);
        renderSummary(run, "", null);
      } else if (screen === "won") {
        setCard(COPY.won);
        renderSummary(run, "win", ["Result", "All parcels sealed at docks"]);
      } else if (screen === "failed") {
        const variant = failCopy(run);
        setCard({ kicker: COPY.failed.kicker, title: variant.title, text: variant.text, fine: COPY.failed.fine });
        renderSummary(run, "fail", ["Cause", variant.cause]);
      }
      syncHud(run, screen);

      const focusTarget = [el.startBtn, el.resumeBtn, el.restartBtn].find((b) => !b.hidden);
      if (screen !== "playing" && focusTarget) focusTarget.focus({ preventScroll: true });
    }

    return { el, syncHud, showScreen };
  }

  PG.ui = { createUi, formatClock, hintText, failCopy, COPY };
})((globalThis.PG = globalThis.PG || {}));
