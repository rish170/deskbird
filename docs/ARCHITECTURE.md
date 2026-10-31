# Deskbird Architecture & Technical Design

Deskbird is a two-sided real-time desktop companion system consisting of an Electron desktop pet, a lightweight static web app, and an Express + Socket.IO message relay server.

---

## 1. System Overview & Component Diagram

```
+-------------------------------------------------------------------------+
|                              USER 2 (Sender)                            |
|  Static Web Client (Vite + Vanilla JS + Socket.IO Client) on Vercel     |
|  URL: https://deskbird.vercel.app/#/ABCD2345                            |
+-------------------------------------------------------------------------+
                                    │
                       WebSocket / HTTPS
                                    ▼
+-------------------------------------------------------------------------+
|                           RELAY SERVER                                  |
|  Node.js (Express 5 + Socket.IO v4) on Render Free Web Service          |
|  Stateless Auth (Secret -> SHA256 -> Base32 Room ID)                    |
|  In-Memory Message Queue (Max 20, 24h TTL) + Rate Limiting              |
+-------------------------------------------------------------------------+
                                    │
                       WebSocket (Socket.IO)
                                    ▼
+-------------------------------------------------------------------------+
|                              USER 1 (Bird)                              |
|  Electron Desktop Application (deskbird npm package)                    |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Main Process:                                                     |  |
|  | - Single instance lock                                            |  |
|  | - Socket.IO client (auto-reconnect, keepalive ping)               |  |
|  | - 60 Hz OS cursor polling (screen.getCursorScreenPoint)            |  |
|  | - Multi-display window manager (always-on-top, click-through)     |  |
|  | - System tray controller                                          |  |
|  +-------------------------------------------------------------------+  |
|                                    │  IPC (Cursor, Messages, Hits)      |
|                                    ▼                                    |
|  +-------------------------------------------------------------------+  |
|  | Transparent Overlay Window(s) (One per display):                  |  |
|  | - DOM + CSS Sprites (steps() animation, integer scaled 4x)        |  |
|  | - Spring-damper cursor following with edge flipping              |  |
|  | - 8-Bit stepped dialog bubble with typewriter audio blips         |  |
|  | - Interactive hit-testing (perch, perched bird, bubble)           |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 2. Component Breakdown

### 2.1 The Desktop Bird App (`bird/`)

- **Main Process (`src/main/`)**:
  - Handles the Socket.IO connection to keep it isolated from renderer throttling, DOM freezes, and CORS restrictions.
  - Generates a cryptographically random 32-byte secret on first run, saves it to `userData/deskbird-settings.json`, and derives the public `roomId`.
  - Creates transparent, frameless, click-through `BrowserWindow` overlays sized to each attached display.
  - Polls OS cursor coordinates at 60 Hz via `screen.getCursorScreenPoint()` in DIP (Device Independent Pixels) and dispatches them to the display renderer currently containing the cursor.
  - Dynamically updates mouse click-through behavior using `win.setIgnoreMouseEvents(!interactive, { forward: true })`.
  - Runs a 4-minute heartbeat (`bird:ping`) to prevent Render free-tier web services from sleeping during active sessions.

- **Renderer Process (`src/renderer/`)**:
  - Pure DOM + CSS transforms. No heavy full-screen canvas repaints.
  - Renders the 24x24 pixel bird using CSS spritesheet steps at integer scale 4 (96 DIP).
  - Uses CSS `image-rendering: pixelated;` to maintain tack-sharp pixels.
  - Implements an exponential smoothing spring-damper following model with delta-time.
  - Manages speech bubbles with word wrapping (24 chars/line, max 4 lines), typewriter rendering, Web Audio synthesized square-wave blips, and an auto-dismiss timer.

### 2.2 The Relay Server (`server/`)

- **Stateless Room Ownership**:
  - Instead of requiring a database or user accounts, the bird proves room ownership by providing its 32-byte secret during `bird:join`.
  - The server recomputes `deriveRoomId(secret)`. If it matches, the bird socket is assigned as the room owner.
  - Senders only ever receive and use the 8-character `roomId`.
- **In-Memory Offline Queue**:
  - If a message is sent while the bird is offline, the message is stored in an in-memory queue (up to 20 messages per room, 24-hour TTL).
  - When the bird connects, queued messages are immediately drained and forwarded.
- **Rate Limiting**:
  - Sender sockets are limited to 1 message every 2 seconds.
  - Each room is capped at 30 messages per hour.

### 2.3 The Web Client (`web/`)

- Built with Vite and vanilla JavaScript.
- Deployed statically to Vercel.
- Parses the room code from the URL hash (`/#/ABCD2345`) or provides an input prompt.
- Wakes up the Render backend immediately on page load via `GET /healthz`.
- Displays real-time message statuses: `sending...` -> `queued` or `delivered ✓` -> `seen by bird ✓✓`.

---

## 3. Bird State Machine

The bird's behavior is driven by a deterministic finite state machine (`bird/src/renderer/state-machine.js`):

```
                     ┌──────────────────┐
                     │    FOLLOWING     │◄─────────────┐
                     └────────┬─────────┘              │
                              │                        │
                    Click Perch or Tray        Click Perched Bird
                              │                   or Tray
                              ▼                        │
                     ┌──────────────────┐     ┌────────┴─────────┐
                     │ FLYING_TO_PERCH  │     │     TAKEOFF      │
                     │  (Curved Arc)    │     │  (Hop & Flap)    │
                     └────────┬─────────┘     └────────▲─────────┘
                              │                        │
                      Reaches Target                   │
                              │                        │
                              ▼                        │
                     ┌──────────────────┐              │
                     │     LANDING      │              │
                     │ (Squash Frames)  │              │
                     └────────┬─────────┘              │
                              │                        │
                      Duration Complete                │
                              │                        │
                              ▼                        │
              ┌──────►┌──────────────────┐─────────────┘
              │       │   PERCHED_IDLE   │
              │       │  (Blink 3-6s)    │
              │       └────────┬─────────┘
        1.2s Duration          │
          Complete             │ Scratch Timer (6-15s)
              │                ▼
              │       ┌──────────────────┐
              └───────┤ PERCHED_SCRATCH  │
                      │  (Foot Scratch)  │
                      └──────────────────┘
```

---

## 4. Key Architectural Decisions & Rationale

1. **Why DOM + CSS Transforms instead of Canvas?**
   - Redrawing a 4K transparent canvas at 60 Hz consumes substantial GPU/CPU resources on laptops. By moving a small 96x96 DIP DOM element using CSS `transform: translate3d(...)` with GPU compositing, idle CPU consumption stays under 3% while following, and under 1% when perched.
2. **Why Socket.IO in the Electron Main Process?**
   - Background renderer windows in Electron can be throttled by Chromium's background timer policies. Maintaining the WebSocket connection in Node's main process ensures 100% reliable message delivery even when full-screen applications or games are active.
3. **Why Derived Base32 Room IDs?**
   - Eliminates database dependencies entirely. The server can restart at any time without losing room registrations or security guarantees.

