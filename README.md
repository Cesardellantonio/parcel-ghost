# Parcel Ghost

Offline single-page browser game. No install, no build, no network. Open `index.html`.

## Pitch

You are a night-atrium courier who **only exists while holding still**.

| State | How | Effect |
| --- | --- | --- |
| **Ghost** | Move (WASD / arrows / stick / drag) | Vanish from cameras and guard memory. Cannot pick up, drop, or deliver. |
| **Solid** | Stand still ~0.12s | Opaque body. Security cones can photo you. Rising edge auto-interacts. |

## Objective

Deliver all **3 sealed parcels** (Jade / Ion / Amber) to their **matching docks** before the **90s** shift ends.

- **Win** — all three docked in time.
- **Fail A — Photo** — you are solid inside a guard vision cone.
- **Fail B — Shift** — timer hits 0 with any parcel still on the floor (open). A **held** parcel counts as secure, not open — but you still need every parcel docked to win.

## Controls

- **WASD** or **arrow keys** to move
- On-screen **touch stick** or **drag on the canvas** toward where you want to go
- **Esc** or **P** to pause / resume
- Solidify on a parcel to pick up; on the matching dock to deliver; elsewhere to drop (rising edge of solid only)

## Files

| File | Role |
| --- | --- |
| `index.html` | Shell, HUD, overlay (IDs wired to `game.js`) |
| `style.css` | Layout / night atrium chrome |
| `game.js` | Loop, guards, parcels, collision |
| `audio.js` | `window.PGAudio` synthesized SFX |

## HUD IDs

`hud-parcels` · `hud-timer` · `hud-mode` · `pill-mode` · `pill-held` · `pill-hint` · `game` · `overlay` · `overlay-kicker` · `overlay-title` · `overlay-text` · `overlay-fine` · `summary` · `start-btn` · `resume-btn` · `restart-btn` · `btn-pause` · `stick` · `stick-knob`

## Audio API

`window.PGAudio`: `unlock`, `solidify`, `ghost`, `pickup`, `drop`, `deliver`, `photo`, `win`, `fail`, `tick`, `ui`

## Verify

```bash
node --check game.js && node --check audio.js
```

No git push / Pages required — open the file locally.
