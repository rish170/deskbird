# Deploying the Deskbird Web App to Vercel

The sender interface is a static web application built with Vite and vanilla JavaScript. It is designed to be hosted on [Vercel](https://vercel.com).

> **Note**: Vercel's serverless architecture cannot host persistent WebSocket connections. Therefore, the web client is served statically from Vercel and establishes real-time Socket.IO connections directly to the Render server.

---

## 1. Step-by-Step Vercel Deployment

1. Push your repository to GitHub:
   ```powershell
   git push origin main
   ```
2. Log in to [vercel.com](https://vercel.com).
3. Click **Add New...** > **Project**.
4. Import your `deskbird` repository.
5. In the **Configure Project** screen, set the following:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `web`
   - **Build Command**: `vite build` (or leave default `npm run build`)
   - **Output Directory**: `dist` (default)
6. Under **Environment Variables**, add:
   - **Key**: `VITE_SERVER_URL`
   - **Value**: Your Render server URL (e.g., `https://deskbird-server.onrender.com`)
7. Click **Deploy**.
8. After deployment completes, copy your Vercel URL (e.g. `https://deskbird.vercel.app`).

---

## 2. Connect Web App to the Render Server

After Vercel assigns your domain:
1. Open the [Render Dashboard](https://dashboard.render.com).
2. Go to your `deskbird-server` service > **Environment**.
3. Update `ALLOWED_ORIGINS` to include your new Vercel domain:
   ```
   https://deskbird.vercel.app,http://localhost:5173
   ```
4. Save changes so the Render server redeploys and allows WebSocket handshakes from your Vercel frontend.

---

## 3. Security & Cache Headers (`vercel.json`)

The `web/vercel.json` file applies the following production security and performance policies:
- **Strict Content Security Policy (CSP)**: restricts connections (`connect-src`) to `self` and the backend server.
- **Anti-Clickjacking**: `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
- **Immutable Asset Caching**: 1-year cache headers (`public, max-age=31536000, immutable`) for hashed fonts and scripts in `/assets/`.

