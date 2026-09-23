# Parcel Ghost

Offline single-page browser game. No install, no build, no network. Open `index.html` (works from `file://` and GitHub Pages).

## Pitch

You are a night-atrium courier who **only exists while standing still**.

| State | How | Effect |
| --- | --- | --- |
| **Ghost** | Move (WASD / arrows / stick / drag) | Invisible to guards. Cannot pick up, drop, or deliver. |
| **Solid** | Stand still ~0.12s | Visible body. Guard cones can photograph you. Turning solid auto-interacts once. |

## Objective

Deliver all **3 parcels** (Jade / Ion / Amber) to their **matching docks** before the **90s** shift ends.

- **Win** — all three docked in time.
- **Fail: photo** — you are solid inside a guard's (unobstructed) vision cone. This also applies on the final delivery: the win only counts if no guard sees you after that frame's guard move.
- **Fail: shift** — the timer hits 0 with any parcel undelivered, whether it's on the floor or in your hands.

## Controls

- **WASD** / **arrow keys**, the on-screen **touch stick**, or **drag on the board** toward where you want to go
- **Esc** or **P** to pause / resume
- Stop on a parcel to pick it up, on its matching dock to deliver, anywhere else to drop what you carry

## Code layout

Plain classic `<script>` files (not ES modules, so `file://` works) sharing one `window.PG` namespace. Load order in `index.html` matters.

| File | Role |
| --- | --- |
| `index.html` | Shell, HUD, overlay card (element IDs are looked up in `src/ui.js`) |
| `style.css` | Layout, night-atrium chrome, mobile / short-viewport fitting |
| `src/audio.js` | `window.PGAudio` synthesized Web Audio SFX |
| `src/config.js` | `PG.TUNING` constants, parcel routes, and the level layout (walls, docks, parcels, guard patrols, spawn) |
| `src/geometry.js` | `PG.geo`: circle/wall collision, vision-cone + occlusion test |
| `src/sim.js` | `PG.sim`: **all game rules**. `createRun()` builds a fresh run; `stepRun(run, input, dt)` advances one frame and returns events (`solidify`, `ghost`, `pickup`, `drop`, `deliver`, `won`, `failed`). No DOM. |
| `src/ui.js` | `PG.ui`: HUD sync, overlay screens, contextual hint, and all player-facing copy (`COPY`) |
| `src/render.js` | `PG.render`: canvas drawing plus cosmetic particles / floaters / flash / shake |
| `src/input.js` | `PG.input`: keyboard, touch stick, canvas drag merged into one move vector |
| `src/main.js` | Screen state machine (`title → playing ⇄ paused`, `playing → won / failed`, any end → new shift), frame loop, event → sound/fx wiring |

### Frame order (`stepRun`)

1. Tick the shift clock → fail `shift` at 0.
2. Move the courier; existence is judged by **actual displacement** (pushing into a wall still solidifies).
3. On the ghost → solid edge: deliver if on the matching dock, else drop if carrying, else pick up the nearest parcel in range. The final delivery sets `pendingWin` (or fails at once if already seen).
4. Move guards along their patrols (blocked waypoints are skipped).
5. Photo check → fail `photo`; otherwise confirm `pendingWin` → `won`.

Any outcome clears `pendingWin` and freezes the run. Every new shift builds a fresh run, so no state carries over.

## Verify

```bash
npm run check   # node --check every script
npm test        # headless rule tests (node:test, no dependencies)
```

`package.json` only holds these dev scripts; there is nothing to install and nothing to build for deploy.
