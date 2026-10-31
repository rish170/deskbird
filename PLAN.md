# Deskbird Implementation Plan & Status

## ✅ Phase 1: Environment, Tooling & Shared Core (COMPLETED)
1. **Monorepo Structure & Package Manifests**
   - Configured npm workspaces: `shared`, `bird`, `server`, `web`.
   - Dependencies pinned to current stable releases (`electron@45.2.1`, `socket.io@4.8.4`, `socket.io-client@4.8.4`, `express@5.3.0`, `helmet@8.3.0`, `cors@2.8.6`, `vite@8.3.5`, `vitest@5.0.5`, `pngjs@7.0.0`, `@fontsource/press-start-2p@5.3.0`, `@fontsource/vt323@5.3.0`).
   - Root files configured: `.gitignore`, `.editorconfig`, `.nvmrc`, `.env.example`, `LICENSE` (MIT), `CHANGELOG.md`.
2. **Shared Protocol & Utilities (`shared/`)**
   - Implemented `shared/protocol.js` with all constants, limits, event names, and error codes.
   - Deterministic Room ID derivation: SHA-256 of 32-byte secret -> custom 32-char Base32 alphabet -> 8 characters formatted as `ABCD-2345`.
   - Control character stripping sanitization and text validation.
   - Comprehensive unit tests in `shared/protocol.test.js` (18 passing tests).

## ✅ Phase 2: Sprite Art & Headless Export Pipeline (COMPLETED)
1. **Sprite Grids Definition (`art/bird.sprites.js`)**
   - Exact 14-color palette definition without forbidden gradients/neons.
   - 24x24 pixel grid matrices for all frames:
     - `fly_1..4` (flight flapping loop)
     - `perch_idle_1..2` (perched posture & eye blink)
     - `perch_scratch_1..4` (perched foot scratch)
     - `land_1..2` (landing squash)
     - `takeoff_1..2` (takeoff hop)
     - `talk_open`, `talk_closed` (beak talking animation)
     - `tray_16`, `tray_32` (system tray icons)
2. **PNG Export Script (`art/export-sprites.js`)**
   - Headless PNG generator using `pngjs`:
     - Spritesheet strip: `bird/src/renderer/assets/bird-spritesheet.png` (384x24)
     - System tray icons: `bird/src/main/assets/tray-16.png`, `tray-32.png`
     - Web assets: `web/public/bird.png` (96x96), `web/public/favicon.png` (32x32)
     - Wooden perch branch: `bird/src/renderer/assets/perch.png` (168x16)
3. **Sprite Inspector (`art/preview.html` & `scripts/preview-sprites.js`)**
   - Standalone viewer serving palette swatches, 1x/4x frame cards, and animated loops.

## ✅ Phase 3: Server Implementation & Integration Tests (COMPLETED)
1. **Server Architecture (`server/src/`)**
   - Express 5 + Socket.IO v4 with helmet & CORS allowlist.
   - `server/src/rooms.js`: in-memory room management, presence tracking, secret verification, queue buffering (max 20, 24h TTL).
   - `server/src/limits.js`: rate limiter (1 msg / 2s per sender socket, 30 msgs / hr per room).
   - `server/src/index.js`: Socket.IO event handlers (`bird:join`, `bird:ping`, `message:seen`, `sender:join`, `message:send`, `bird:status`, `message:status`), `GET /healthz`, graceful shutdown.
2. **Server Integration Tests (`server/test/server.integration.test.js`)**
   - Real ephemeral port server testing with `socket.io-client`:
     - Correct & incorrect secret verification.
     - Bird ping keepalive response.
     - Real-time online message delivery.
     - Offline queuing and subsequent delivery upon bird connection.
     - Seen delivery receipts propagation back to sender.
     - Sender rate limit enforcement (1 msg / 2s).
     - Payload validation (empty / too long rejected).
     - Offline queue full rejection.
     - `GET /healthz` status 200.
     - All 9 integration tests passing.

## ✅ Phase 4: Web Application (COMPLETED)
1. **Vite + Vanilla JS (`web/`)**
   - 8-bit retro theme, hard ink borders, stepped corners, flat offset shadows.
   - Self-hosted Press Start 2P & VT323 fonts via `@fontsource`.
   - URL hash room routing (`/#/ABCD2345`), local storage caching.
   - Automatic backend wakeup on page load (`fetch('/healthz')`).
   - Optimistic message log with real-time delivery state indicators (`sending...`, `queued`, `delivered ✓`, `seen by bird ✓✓`).
   - Accessible semantic HTML, `aria-live="polite"` status announcements, AA contrast.
   - Security headers in `web/vercel.json` (CSP, anti-clickjacking, asset caching).
   - Production bundle compiled cleanly with Vite (`dist/`).

## ✅ Phase 5: Bird Desktop App (COMPLETED)
1. **Main Process (`bird/src/main/`)**
   - Single instance lock handling (`app.requestSingleInstanceLock`).
   - 60 Hz OS cursor polling via `screen.getCursorScreenPoint()` dispatched to active display in DIP.
   - Transparent, frameless, click-through multi-display window management.
   - Dynamic mouse event passthrough (`win.setIgnoreMouseEvents(!interactive, { forward: true })`).
   - Main-process Socket.IO client with exponential backoff & 4-minute Render keepalive ping.
   - System tray menu with dynamic icon, tooltip status, clipboard copy, and toggles.
   - Detached CLI launcher: `bird/bin/deskbird.js` (`npx deskbird`).
2. **Renderer Process (`bird/src/renderer/`)**
   - DOM + CSS transforms with GPU acceleration (idle CPU < 3% follow, < 1% perched).
   - Integer scaled 4x CSS spritesheet animation (`steps()`).
   - Frame-rate independent spring-damper cursor following with edge flipping and figure-8 drift.
   - Deterministic finite state machine: `FOLLOWING`, `FLYING_TO_PERCH`, `LANDING`, `PERCHED_IDLE`, `PERCHED_SCRATCH`, `TAKEOFF`.
   - 8-bit dialogue bubble with typewriter effect, Web Audio synthesized square-wave blips, line wrapping, and queue management.
   - Unit tests in `bird/test/renderer.test.js` (11 passing tests).

## ✅ Phase 6: Scripts & Local Test Environment (COMPLETED)
1. **Testing & Execution Scripts (`scripts/`)**
   - `scripts/dev-all.js`: single-command orchestrator for server, web, and bird companion in local mode.
   - `scripts/preview-sprites.js`: HTTP viewer for art assets.
   - `scripts/start-prod-local.js`: production simulation runner.
   - `scripts/test-install.js`: fresh-user tarball packaging and install sandbox.

## ✅ Phase 7: Documentation & CI/CD (COMPLETED)
1. **Complete Documentation Suite**
   - `README.md`: welcoming guide, quickstart, controls, diagrams, limits.
   - `docs/ARCHITECTURE.md`: system design, data flow, state machine diagram.
   - `docs/PROTOCOL.md`: protocol specification, events, error codes, limits.
   - `docs/LOCAL_TESTING.md`: single-PC local testing guide.
   - `docs/MANUAL_TESTING.md`: step-by-step human testing checklist.
   - `docs/DEPLOY_RENDER.md`: Render deployment instructions.
   - `docs/DEPLOY_VERCEL.md`: Vercel deployment instructions.
   - `docs/PUBLISH_NPM.md`: npm publish guide, verification, and provenance.
   - `docs/RELEASE_CHECKLIST.md`: ordered checklist from code to stranger install.
   - `docs/TROUBLESHOOTING.md`: comprehensive issue resolution guide.
   - `docs/DESIGN.md`: art direction, 14-color palette, typography, banned aesthetics.
   - `docs/SECURITY.md`: threat model, privacy statement, rate limiting.
   - `docs/DECISIONS.md`: architectural decisions and version selections.
   - `CONTRIBUTING.md`: contributing standards.
2. **CI/CD Workflows**
   - `.github/workflows/ci.yml`: automated tests, linter, and web build on push/PR.
   - `.github/workflows/release.yml`: automated npm publish with provenance and NSIS installer generation on `v*` tags.
3. **Deployment Configurations**
   - `render.yaml`: Render Blueprint for the relay server.
   - `vercel.json` & `web/vercel.json`: Vercel headers and configuration.
   - `bird/electron-builder.yml`: NSIS Windows installer configuration.
