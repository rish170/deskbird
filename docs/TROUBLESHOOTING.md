# Troubleshooting & FAQ Guide

Solutions to common issues encountered when building, running, or testing Deskbird.

---

## 1. Bird Overlay & Window Issues

### 1.1 The bird is not visible on screen
- **Check if Paused**: Right-click the Deskbird system tray icon and check if "Resume Deskbird" is visible. If so, click it.
- **Check Multiple Monitors**: Move your mouse cursor across your monitors. The bird only appears on the display currently containing your cursor.
- **Run in Debug Mode**: Launch with `--debug-mode` flag:
  ```powershell
  npx deskbird --debug-mode
  ```
  This opens the detached Chrome DevTools window so you can inspect console errors and check element styling.

### 1.2 The overlay is blocking mouse clicks
- **Cause**: By default, transparent frameless windows must be configured with `win.setIgnoreMouseEvents(true, { forward: true })`.
- **Hysteresis & Hit Testing**: Deskbird toggles mouse events dynamically only when hovering over clickable regions (the wooden perch, the perched bird, or an active speech bubble). If clicks are blocked elsewhere, verify that no invisible DOM element has `pointer-events: auto`.

### 1.3 Screen flicker on Windows
- **Cause**: On Windows 10/11, transparent windows that match the exact pixel height and width of the display can be classified by the DWM (Desktop Window Manager) as exclusive fullscreen applications, causing black flashes or snapping.
- **Fix**: Deskbird reduces overlay height by 1 pixel on Windows (`bounds.height - 1`). If you still observe flicker, ensure GPU acceleration is enabled and your graphics drivers are current.

### 1.4 Transparent window turns solid white/black when DevTools opens
- **Cause**: In Chromium/Electron, opening DevTools docked inside a transparent window disables alpha compositing.
- **Fix**: Deskbird always opens DevTools detached in a separate window (`openDevTools({ mode: 'detach' })`). Never dock DevTools inside the overlay window.

---

## 2. Networking & Real-Time Connection Issues

### 2.1 Web app says "waking the server..." for 30–60 seconds
- **Cause**: The Render free tier spins down web services after 15 minutes of inactivity. The initial cold start takes up to 60 seconds.
- **Fix**: This is expected behavior on Render's free plan. Once the server wakes, the status pill will turn green ("bird is online"). Active bird companions send a 4-minute heartbeat to keep the service awake.

### 2.2 Messages are not arriving at the bird
1. **Check Room Code**: Ensure the code in the web URL hash matches your bird's room code (`ABCD-2345`). Click "Show My Code" in the bird's tray menu to confirm.
2. **Check CORS on Render**: If self-hosting, ensure your Vercel URL is listed in `ALLOWED_ORIGINS` on Render.
3. **Tray Tooltip**: Hover over the tray icon. If it says "reconnecting...", the bird cannot reach the server URL configured in `bird/src/main/config.cjs`.

### 2.3 Electron binary download blocked by corporate proxy / firewall
- **Cause**: Corporate firewalls often block downloads from `github.com/electron/electron/releases`.
- **Fix**: Use an official mirror:
  ```powershell
  $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
  npx deskbird
  ```

---

## 3. Operating System & Packaging

### 3.1 Windows SmartScreen warning ("Unknown Publisher")
- **Cause**: Unsigned `.exe` installers downloaded from the web trigger Windows SmartScreen protection until reputation is established.
- **Workaround**: Click **More info** > **Run anyway**.
- **Alternative**: Running via `npx deskbird` avoids SmartScreen entirely because Node/npm executes the verified JavaScript directly.

### 3.2 Linux transparency flags
On some Linux window managers (Wayland / X11 without a compositor like Picom), transparent windows require compositor support and specific flags:
```bash
npx deskbird --enable-transparent-visuals --disable-gpu
```
Ensure your window compositor (Mutter, KWin, Compton, Picom) is running.

