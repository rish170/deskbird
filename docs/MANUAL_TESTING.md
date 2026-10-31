# Manual Testing Guide (Human Verification Checklist)

> **Important**: This guide is designed for you (the human tester) to test Deskbird visually and interactively on your Windows machine. Follow each numbered step in order.

---

## Pre-flight Check

Ensure dependencies are installed and all headless tests have passed:
```powershell
npm test
npm run lint
```
Both commands must finish with 0 errors before running manual tests.

---

## Test 1: Sprite & Art Inspector (`npm run sprites:preview`)

1. **Command to run**:
   ```powershell
   npm run sprites:preview
   ```
2. **Action**:
   - Open your browser and navigate to `http://localhost:4040/art/preview.html`.
3. **What you should see**:
   - **Section 1 (The 3 Reference Poses at 3x scale)**:
     - `PERCHING (facing front)`: Cute blue bird facing front, resting on the wooden perch bar between two grass tufts, with pink tail feathers extending down behind the wooden bar and claws gripping over the top edge.
     - `FLYING (wings up)`: Cute side-view bird with pink wings lifted high in flight.
     - `FLYING (wings down)`: Cute side-view bird with pink wings swept down.
   - **Section 2 (Colour Palette)**: 14 vibrant swatches showing the sky blues, turquoise, and pink/magenta shades with hex values.
   - **Section 3 (Animated Loops)**:
     - Flap Flight (10 fps) & Fast Flight (14 fps) smoothly cycling `flyUp` -> `flyMid` -> `flyDown` -> `flyMid`.
     - Perched Front Idle & Blink: Front-facing bird periodically blinking naturally every ~3.5 seconds.
     - Talking loops for both flying and perched poses.
   - **Section 4 (Perch Branch Bar)**: 56x8 art pixel branch shown at 1x, 2x, and 3x scale with wood grain and grass tufts.
   - **Section 5 (Individual Frames)**: Cards for each frame showing exact dimensions and labels.
4. **Pass Criteria**:
   - All sprites render crisply without anti-aliasing blur.
   - Perched front-facing bird shows composite depth: tail layer behind the wood bar, claws gripping over the top.
5. **Fail Criteria**:
   - Missing frames, broken images, or blurred edges.

---

## Test 2: Standalone Demo Mode (`npm run demo`)

1. **Command to run**:
   ```powershell
   npm run demo
   ```
2. **Action**:
   - Move your mouse around the screen.
   - Watch the bird companion.
3. **What you should see**:
   - The bird appears beside your cursor (+60 DIP to the right) and flaps its wings continuously.
   - The wooden perch bar appears in the top-right corner of your primary monitor (110 DIP down, 24 DIP from the right edge).
   - The bird automatically flies to the perch bar, lands facing front with its head fully visible below the top of the screen, blinks, and talks with speech bubbles.
   - Click the perched bird to make it take off and resume following your cursor.
4. **Pass Criteria**:
   - Zero crashes or DEP0062 errors.
   - Head is never clipped off the top of the monitor when perched.
   - Smooth movement with gentle vertical hover bob.
   - Click-through works beneath the flying bird.

---

## Test 3: Local Full Stack Run (`npm run dev:all`)

1. **Command to run**:
   ```powershell
   npm run dev:all
   ```
2. **Action**:
   - Look at the terminal: you should see a color-coded banner:
     - `Server: http://localhost:3001`
     - `Web: http://localhost:5173/#/LCLTEST2`
     - `Bird: Running in --local --debug-mode (connected to LCLTEST2)`
   - Open your browser to `http://localhost:5173/#/LCLTEST2`.
3. **What you should see**:
   - The desktop bird appears beside your cursor and flaps its wings.
   - Perch bar appears at top-right of your primary screen (110 DIP down, 24 DIP from the right edge).
   - In your browser (`http://localhost:5173/#/LCLTEST2`):
     - Status pill turns green: **"bird is online"** (automatically paired to room `LCLTEST2`).
     - Type a message (e.g., "Hello Deskbird!"), press Send, and watch the 8-bit speech bubble appear next to the bird on your desktop!

---

## Test 4: Follow Movement & Edge Flipping

1. **Action**:
   - Slowly move mouse towards the right edge of your monitor (within ~160 DIP).
2. **What you should see**:
   - As cursor approaches the right edge, the bird smoothly flips from the right side of the cursor to the left side (-72 DIP) and mirrors its sprite (`scaleX(-1)`).
   - Move cursor back to the center: the bird smoothly transitions back to the right side.
   - Stop cursor: the bird stays in place hovering with a gentle figure-8 drift and continuously flaps its wings.
3. **Pass Criteria**:
   - No teleportation or jittering at the boundary.
   - Clear gap between pointer and bird (never underneath cursor).

---

## Test 5: Click-Through Verification

1. **Action**:
   - Open any window (Notepad, browser, or desktop icons).
   - Move your mouse so the flying bird hovers right above a clickable button or text in that app.
   - Click the button or select text in the app underneath.
2. **What you should see**:
   - The click registers immediately in the underlying app.
   - The bird does NOT steal window focus.
3. **Pass Criteria**:
   - You can interact with all apps underneath the flying bird without any blocked clicks.

---

## Test 6: Perching and Perched Behavior

1. **Action**:
   - Move mouse cursor over the wooden perch bar at the top-right corner.
   - Observe the cursor turns into a pointer hand and a pixel tooltip appears: `"click to perch"`.
   - Click the perch bar.
2. **What you should see**:
   - State changes to `FLYING_TO_PERCH`: the bird flies in a smooth upward curved arc to the perch.
   - Plays landing squash animation (`land_1`, `land_2`) and settles on the branch (`PERCHED_IDLE`).
   - While perched:
     - Wings stop flapping.
     - Sits upright on the branch.
     - Blinks every 3 to 6 seconds.
     - Scratches head with its foot every 6 to 15 seconds (`PERCHED_SCRATCH`).
3. **Action**:
   - Hover cursor over the perched bird. Notice tooltip: `"click to fly"`.
   - Click the perched bird.
4. **What you should see**:
   - Bird performs a short upward hop (`takeoff_1`, `takeoff_2`) and immediately resumes `FOLLOWING` the mouse cursor.

---

## Test 7: Sending Messages & Typewriter Bubble

1. **Action**:
   - In the web app (`http://localhost:5173/#/LCLTEST2`):
     - Enter your name: `Alex`
     - Type message: `Hello Deskbird! How is the weather up there?`
     - Press Enter (or click "SEND MESSAGE").
2. **What you should see**:
   - Web app: message appears in the sent log with status `"delivered ✓"`.
   - Desktop bird: an 8-bit stepped speech bubble appears beside the bird showing:
     - Header: `FROM ALEX`
     - Typewriter text appearing character by character (~40 chars/sec).
     - Bird's beak opens and closes in sync with the typing.
     - **When perched**: the bubble appears cleanly to the **left** of the bird (never below the branch or off-screen), with its retro pixel pointer pointing to the right toward the bird.
     - **Multi-display check**: the message appears **only** on the display showing the bird (never duplicated on secondary screens).
   - Web app updates status badge to **`"seen by bird ✓✓"`** as soon as the bubble appears.
   - After ~4 seconds, the speech bubble automatically fades/dismisses.
3. **Action**:
   - Send another message, and click directly on the speech bubble before it fades.
4. **What you should see**:
   - Clicking the bubble dismisses it immediately.

---

## Test 8: Message Queueing & "+N" Badge

1. **Action**:
   - In the web app, send 3 messages in rapid succession (wait 2 seconds between each due to rate limits):
     - Message 1: `First note`
     - Message 2: `Second note`
     - Message 3: `Third note`
2. **What you should see**:
   - While Message 1 is displaying, a small retro badge appears at the bottom-right of the bubble showing a blinking triangle and `+2`.
   - When Message 1 finishes (or you click to dismiss), Message 2 appears and badge updates to `+1`.
   - When Message 2 finishes, Message 3 appears.
   - All messages arrive in the exact order sent.

---

## Test 9: Offline Delivery & Server Reconnection

1. **Part A: Offline bird receives messages on connect**:
   - Quit the bird app via the system tray menu (`Quit Deskbird`).
   - Check the web app: status pill changes to `"bird offline - messages will wait"`.
   - Type and send a message in the web app: `Are you there birdie?`.
   - Sent log shows status `"queued"`.
   - Start the bird app: `npm run dev:bird`.
   - Within 2 seconds, the bird connects, and the queued message appears in a speech bubble.
   - Web log updates from `"queued"` to `"delivered ✓"` then `"seen by bird ✓✓"`.

2. **Part B: Server restart resilience**:
   - While the bird is running, press `Ctrl+C` in the terminal to kill the server.
   - Bird tooltip shows `"reconnecting..."`. The bird continues smoothly following your cursor without crashing or freezing.
   - Restart the server: `npm run dev:server`.
   - Bird automatically reconnects within 2-5 seconds, tooltip returns to `"connected"`.

---

## Test 10: Restart Memory & Single Instance Lock

1. **Restart Memory**:
   - Perch the bird on the wooden branch.
   - Quit the bird app via the tray.
   - Restart the bird: `npm run dev:bird`.
   - Bird launches directly in the perched state on the branch and retains the same room code.
2. **Single Instance**:
   - While the bird is running, open a second terminal and run: `npm run dev:bird`.
   - The second instance prints that an instance is already running and exits immediately.
   - The existing bird returns to follow mode. No second bird appears.

---

## Test 11: Multi-Monitor & DPI Scaling (Extended Displays)

1. **Follow Mode Across Displays**:
   - Move mouse cursor from Monitor 1 (laptop) across to Monitor 2 (HDMI).
   - The bird smoothly crosses display boundaries and follows your cursor on Monitor 2.
   - Monitor 1 hides the following bird while cursor is on Monitor 2.
2. **Perched State Across Displays**:
   - Click the wooden perch bar on the laptop screen so the bird sits on it.
   - Now move your mouse cursor across to Monitor 2 (HDMI).
   - **Check Screen 1 (Laptop)**: The bird **remains visible** sitting on its perch with its head completely inside the screen (no cut off).
   - **Check Screen 2 (HDMI)**: Screen 2 **does NOT show any bird** while it is perched on the laptop!
   - Move cursor back to Screen 1 and click the perched bird: it takes off and follows your cursor normally across both displays.
3. **Speech Bubble Multi-Monitor Isolation**:
   - Send a message from the web app while the bird is perched: verify the message appears **only on Screen 1 (Laptop)** to the left of the bird. Screen 2 (HDMI) displays no bubble.
   - Send a message while bird is following your cursor on Screen 2: verify the bubble displays only beside the bird on Screen 2.
4. **Clean Visuals (No Red Outlines)**:
   - Neither the perch bar nor the bird should display any red dashed outline boxes.
5. **Windows DPI Scaling**:
   - In Windows Settings > System > Display, test 125% or 150% scaling.
   - The bird, perch, and speech bubbles maintain crisp integer-scaled pixel art.

---

## Test 12: Production-Like Local Run (`npm run start:prod-local`)

1. **Command to run**:
   ```powershell
   npm run start:prod-local
   ```
2. **What happens**:
   - Vite builds the production assets into `web/dist/`.
   - Runs server with `NODE_ENV=production` on port 3001.
   - Serves the production web app preview on `http://localhost:4173`.
3. **Action**:
   - Open `http://localhost:4173/#/LCLTEST2`.
   - Connect the bird: `npm run dev:bird`.
   - Test sending a note.
4. **Pass Criteria**:
   - CORS works, production bundle loads correctly, messages deliver in real-time.

---

## Test 13: Fresh User Simulation (`npm run test:install`)

1. **Command to run**:
   ```powershell
   npm run test:install
   ```
2. **What happens**:
   - Runs `npm pack` in `bird/` to create `deskbird-1.0.0.tgz`.
   - Sets up an isolated sandbox in `test-install-temp/`.
   - Installs the `.tgz` tarball using npm.
   - Launches `deskbird --fresh --debug`.
3. **What you should see**:
   - The bird appears on your desktop!
   - On this fresh run, the bird displays its announcement bubble:
     `Hi! Tell your friend this code: ABCD-2345` (showing its new unique room code).
   - The tray menu shows "Copy message link".
4. **Pass Criteria**:
   - Proves a stranger running `npx deskbird` gets a working bird with zero config and zero manual setup!

