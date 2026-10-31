# Local Testing Guide (Single-PC Development)

Deskbird is engineered so that the entire end-to-end experience (Desktop Bird + Relay Server + Web App) can be thoroughly tested on a single computer before deploying to the cloud.

---

## 1. Quick Start Local Stack (`npm run dev:all`)

To launch all three components in a single terminal with synchronized color-coded logging:

```powershell
npm run dev:all
```

This concurrently starts:
- **Server** on `http://localhost:3001`
- **Web App** on `http://localhost:5173`
- **Bird App** connected locally to room **`LCLTEST2`** with `--local --debug` flags.

### Testing Interaction:
1. Open `http://localhost:5173/#/LCLTEST2` in your web browser.
2. The web page status pill will switch to **"bird is online"** in green.
3. Type a message in the box and press **Enter**.
4. The message will appear in an 8-bit speech bubble next to the bird on your screen.
5. In the web log, observe the status transition from `sending...` -> `delivered ✓` -> `seen by bird ✓✓`.

Pressing `Ctrl+C` in your terminal cleanly shuts down all three processes.

---

## 2. Running Services Individually

You can also run each component in its own dedicated terminal window:

```powershell
# Terminal 1: Relay Server
npm run dev:server

# Terminal 2: Web Sender App
npm run dev:web

# Terminal 3: Desktop Bird Companion
npm run dev:bird
```

---

## 3. Bird Command-Line Flags & Overrides

When launching the desktop companion, you can pass the following command-line arguments:

| Flag | Description |
|---|---|
| `--local` | Connects directly to `http://localhost:3001` and uses the deterministic local test secret (`LCLTEST2`). |
| `--server <url>` | Overrides the server endpoint (e.g. `--server http://192.168.1.50:3001`). |
| `--fresh` | Ignores saved settings in `userData/` and runs with isolated in-memory settings (simulates a brand-new user). |
| `--debug-mode` | Opens detached Chrome DevTools and renders hit region bounding boxes in dashed red. |
| `--demo` | Runs standalone bird offline without any server, auto-cycling animations and scripted bubbles. |

Environment variable override:
```powershell
$env:DESKBIRD_SERVER="http://localhost:3001"
```

---

## 4. Standalone Animation Demo (`npm run demo`)

To test sprite animations, smooth movement, the perch widget, and typewriter speech bubbles without starting any servers or web browsers:

```powershell
npm run demo
```

The bird will:
- Hover beside your cursor.
- Automatically cycle through sample messages every 9 seconds.
- Automatically fly to the perch, scratch its head, and take off every 16 seconds.

---

## 5. Sprite & Art Inspector (`npm run sprites:preview`)

To inspect every frame at 1x and 4x scale, view palette swatches, and test animated loops:

```powershell
npm run sprites:preview
```
Navigate to `http://localhost:4040` in any browser.

---

## 6. Fresh-Install Sandbox Simulation (`npm run test:install`)

To simulate exactly what a stranger experiences when running `npx deskbird`:

```powershell
npm run test:install
```

This automated script:
1. Builds a clean `.tgz` tarball using `npm pack` in `bird/`.
2. Creates an isolated sandbox folder in `test-install-temp/`.
3. Installs the tarball using npm.
4. Executes the binary in `--fresh` mode, verifying that zero-config first-run initialization functions seamlessly.

---

## 7. Production-Like Local Run (`npm run start:prod-local`)

To test the compiled production bundles, production CORS restrictions, and security headers locally before pushing to Vercel/Render:

```powershell
npm run start:prod-local
```
- Builds web frontend with `vite build`.
- Starts the server with `NODE_ENV=production` on port `3001`.
- Serves the production web app preview on `http://localhost:4173`.

