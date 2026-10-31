# Release Checklist (From Code Done to Stranger Install)

Follow this exact step-by-step checklist to take Deskbird from a completed local codebase to a live public release.

---

## Phase 1: Local Verification & Quality Gates

- [ ] **1. Run Headless Tests**
  ```powershell
  npm test
  ```
  Ensure all unit tests and server integration tests pass with 0 failures.

- [ ] **2. Run Code Quality Linter**
  ```powershell
  npm run lint
  ```
  Ensure 0 warnings and 0 errors.

- [ ] **3. Verify Web Production Build**
  ```powershell
  npm run build
  ```
  Ensure Vite builds `dist/` cleanly without errors.

- [ ] **4. Run Human Manual Verification**
  - Follow the steps in `docs/MANUAL_TESTING.md`.
  - Verify `npm run dev:all`, `npm run demo`, follow smoothing, perch landing/takeoff, and typewriter speech bubble.

---

## Phase 2: Deploy Cloud Services

- [ ] **5. Push to GitHub**
  ```powershell
  git add .
  git commit -m "feat: complete deskbird v1.0.0 implementation"
  git push -u origin main
  ```

- [ ] **6. Deploy Server to Render**
  - Follow `docs/DEPLOY_RENDER.md`.
  - Apply the Blueprint or create a web service for `server/`.
  - Copy your live Render URL: `https://<your-service>.onrender.com`.

- [ ] **7. Deploy Web App to Vercel**
  - Follow `docs/DEPLOY_VERCEL.md`.
  - Import the repository, select root directory `web`.
  - Add environment variable: `VITE_SERVER_URL = https://<your-service>.onrender.com`.
  - Deploy and copy your live Vercel URL: `https://<your-app>.vercel.app`.

- [ ] **8. Update Allowed Origins on Render**
  - In Render Dashboard > Environment Variables, update `ALLOWED_ORIGINS` to include your live Vercel domain.

---

## Phase 3: Wire Production URLs into Desktop App

- [ ] **9. Update Default URLs in Bird Config**
  - Open `bird/src/main/config.cjs`.
  - Replace the placeholder in `DEFAULT_SERVER_URL` with your Render server URL:
    ```js
    const DEFAULT_SERVER_URL = 'https://<your-service>.onrender.com';
    ```
  - Replace `DEFAULT_WEB_URL` with your Vercel web URL:
    ```js
    const DEFAULT_WEB_URL = 'https://<your-app>.vercel.app';
    ```
  - Commit and push the updated config:
    ```powershell
    git add bird/src/main/config.cjs
    git commit -m "chore: configure production deployment endpoints"
    git push origin main
    ```

---

## Phase 4: Publish to npm & GitHub Release

- [ ] **10. Add NPM_TOKEN to GitHub Secrets**
  - In GitHub repo Settings > Secrets and variables > Actions.
  - Add `NPM_TOKEN` (publish access token from npmjs.com).

- [ ] **11. Test Fresh Install Simulation Locally**
  ```powershell
  npm run test:install
  ```
  Verify the packed `.tgz` installs and runs cleanly in a clean sandbox.

- [ ] **12. Tag Release and Trigger Workflow**
  ```powershell
  git tag v1.0.0
  git push origin v1.0.0
  ```
  Watch the GitHub Actions Release workflow build the installer and publish to npm!

---

## Phase 5: Verification (The Stranger Experience)

- [ ] **13. Test npx Install on a Clean Machine**
  Open any terminal and run:
  ```powershell
  npx deskbird
  ```
  - The bird appears on your desktop!
  - The announcement bubble displays: `Hi! Tell your friend this code: ABCD-2345`.
  - Right click the tray icon > "Copy Message Link".
  - Send the link to a friend (or open on your phone).
  - Type a note and watch it appear beside the bird!

