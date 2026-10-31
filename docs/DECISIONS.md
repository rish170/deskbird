# Architectural & Technical Decisions Log

This document records technical decisions, package version selections, and implementation details for the Deskbird project.

---

## 1. Dependency Versions & Stability (Pinned 2026 Stable)

All dependencies were verified directly against the npm registry and pinned to current stable releases:

| Package | Version | Purpose |
|---|---|---|
| `electron` | `45.2.1` | Transparent, click-through multi-display desktop overlay. |
| `socket.io` | `4.8.4` | Real-time WebSocket server relay with fallbacks. |
| `socket.io-client` | `4.8.4` | Client WebSocket library for web and Electron main process. |
| `express` | `5.3.0` | Lightweight HTTP server and health check endpoints. |
| `helmet` | `8.3.0` | Security headers and HTTP protection. |
| `cors` | `2.8.6` | Cross-Origin Resource Sharing origin allowlist. |
| `vite` | `8.3.5` | Ultra-fast client bundler and dev server. |
| `vitest` | `5.0.5` | Headless unit and server integration test runner. |
| `pngjs` | `7.0.0` | Pure JavaScript headless PNG generation from sprite matrices. |
| `@fontsource/press-start-2p` | `5.3.0` | Self-hosted retro dialog and heading font. |
| `@fontsource/vt323` | `5.3.0` | Self-hosted retro monospace body and input font. |
| `concurrently` | `10.0.6` | Single-command multi-process orchestration (`npm run dev:all`). |
| `cross-env` | `10.1.0` | Cross-platform environment variable scripts on Windows. |
| `eslint` | `10.14.0` | Code quality and syntax verification. |
| `prettier` | `3.9.10` | Code formatting consistency. |

---

## 2. npm Package Name Availability

The package name `deskbird` was queried via `npm view deskbird` and returned `404 Not Found`. The name remains completely available to register and publish.

---

## 3. Window Ergonomics & Flicker Prevention on Windows

1. **Title Bar Clearance (44 DIP)**:
   - On Windows 10 and 11, maximized windows place their Minimize, Maximize, and Close buttons directly in the top-right corner. Positioning the wooden perch at `top: 44px` ensures normal window management controls remain completely unblocked and clickable.
2. **1-Pixel Window Reduction**:
   - Creating transparent frameless windows matching the exact screen dimensions (`width x height`) on Windows causes the Desktop Window Manager (DWM) to classify them as exclusive fullscreen surfaces, leading to black flashes when focus changes. Trimming the window height by 1 pixel (`bounds.height - 1`) prevents this issue while being completely invisible to the user.

---

## 4. CommonJS for Electron Main & Preload

While the web app, server, and shared libraries use modern ES modules (`"type": "module"`), Electron's main process and preload script are implemented in CommonJS (`src/main/*.cjs`, `preload/*.cjs`). This guarantees seamless compatibility with Electron's binary launcher (`bin/deskbird.js`) without requiring complex bundling, dynamic loaders, or module-resolution shims when executing via `npx`.

---

## 6. Blue and Pink Bee-Eater Sprite Palette (User Direction)

Per user request with reference image (Carmine Bee-eater / Roller), the bird palette and sprite grids were upgraded from the initial sparrow/robin colors to a vivid sky blue and vibrant pink palette:
- **Crown & Upper Back**: Vivid sky blue (`#0ea5e9` and `#38bdf8`) with deep azure accents (`#0369a1`).
- **Throat**: Luminous turquoise mint patch (`#2dd4bf`).
- **Mask & Beak**: Slender dark beak and black bandit mask stripe (`#1a1d24`).
- **Eye**: Emerald green iris (`#10b981`) with crisp white shine point (`#ffffff`).
- **Wings, Belly & Tail**: Shaded in vibrant hot pink (`#ec4899`), deep magenta (`#be185d`), and soft rose (`#f472b6`), featuring an extended slender tail streamer.

## 7. Electron `--debug-mode` Flag (DEP0062 Resolution)

In Node.js/Electron, passing `--debug` is intercepted by the V8 runtime as Node's deprecated remote debugger flag (`[DEP0062]: node --debug and node --debug-brk are invalid. Please use node --inspect and node --inspect-brk instead`), causing Electron to exit with error code 9.
To eliminate this runtime collision, Deskbird's detached DevTools flag was renamed to `--debug-mode` (while also accepting `--debug-overlay`), ensuring seamless execution in both development and production.

## 8. ES Module Relative Resolution in Transparent Renderer

Chromium does not resolve bare specifiers (like `'deskbird-shared'`) over the `file://` protocol without a bundler or import map. The renderer's text wrapping and display timing helpers were encapsulated into `bird/src/renderer/protocol-helpers.js` to ensure 100% reliable standalone execution in the transparent overlay window.


## 9. Cute Blue & Pink Bee-Eater Sprite Architecture

Based on user reference specifications and `art/bird.sprites.js`:
- **Flight Poses (32x32 art pixels)**: Side-view flying bird with wing flaps (`flyUp`, `flyMid`, `flyDown`) and corresponding talking mouth frames (`flyUpTalk`, `flyMidTalk`, `flyDownTalk`).
- **Perched Pose (36x43 art pixels)**: Front-facing perched bird with `perchIdle`, `perchBlink`, and `perchTalk`.
- **Multi-layer Perch Assembly**:
  1. `#perch-tail` (`bird-perch-tail.png`): Tail feathers drawn at `z-index: 5` behind the wooden bar.
  2. `#perch-bar` (`perch.png`): 56x8 pixel branch with wooden texture and grass tufts at `z-index: 10`.
  3. `#bird-container` (`bird-perched.png`): Bird body drawn at `z-index: 20` with claws gripping over the top edge of the wooden bar.

## 10. Perch Placement & Screen Clearance (Top: 160px)

The perch bar is positioned at `top: 160px` (enforced via default settings and migration logic). With feet gripping the top surface of the wooden branch at row 32, the bird's head rests at `y = 100px` (scale 2), providing over 100 DIP of clearance below the top of the monitor. This completely prevents head clipping across all Windows display scaling factors (100%, 125%, 150%).

## 11. Local Development Fixed Room Binding

When running `npm run dev:all`, `ConfigManager` detects `this.isLocal` and automatically binds the Electron bird to `LOCAL_TEST_SECRET` and room ID `LCLTEST2`, ensuring instant zero-configuration pairing with the local web sender at `http://localhost:5173/#/LCLTEST2`.

## 12. Removal of Visual Red Debug Hitbox Outlines

Previously, `--debug-mode` rendered dashed red outline boxes around the perch bar and perched bird. Visual hitboxes are now completely hidden by default and decoupled into an explicit `--debug-hitboxes` flag, ensuring clean visuals during development and demo runs.

## 13. Multi-Monitor Extended Desktop Perch Synchronization

In multi-monitor setups (e.g. laptop + HDMI extended display):
1. **Perch State Broadcast**: When the perch is clicked on the primary display, `WindowManager` broadcasts `bird:perch-state-changed` to all display windows.
2. **Primary Display Persistence**: The primary display (where the wooden perch bar resides) keeps the perched bird visible (`display: block`) even when the mouse cursor moves over to the secondary HDMI display.
3. **Secondary Display Suppression**: Secondary displays suppress bird rendering (`display: none`) while the bird is perched, preventing a duplicate flying bird from appearing near the cursor on extended displays.
4. **Follow Mode Restoration**: When taking off, cursor polling resumes multi-display follow mode across monitors.
